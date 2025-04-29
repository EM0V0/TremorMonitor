import time
import os
import numpy as np
from sensors.adxl345 import ADXL345
from processing.features import TremorProcessor
from transport.data_service import ConsoleDataService
from transport.mqtt_data_service import MQTTDataService
from config import Config


class MultiSensorDataCollector:
    """Main application to collect, process, and send data from multiple sensors."""

    def __init__(self, config_path=None):
        # Load configuration
        self.config = Config(config_path)

        # Initialize multiple sensors
        self.sensors = {}
        self.buffers = {}

        for sensor_config in self.config.get('sensors'):
            name = sensor_config.get('name')
            self.sensors[name] = ADXL345(
                bus_number=sensor_config.get('bus'),
                address=sensor_config.get('address', 0x53),
                range_g=sensor_config.get('range', 2)
            )

            # Create buffer for each sensor
            self.buffers[name] = {
                'x': np.array([]),
                'y': np.array([]),
                'z': np.array([])
            }

        # Initialize data processor
        proc_config = self.config.get('processing')
        self.processor = TremorProcessor(
            fs=proc_config.get('sampling_rate', 100),
            tremor_band=proc_config.get('tremor_band', (3, 6)),
            filter_cutoff=proc_config.get('filter_cutoff', 12)
        )

        # Initialize data service (console output by default)
        """self.data_service = ConsoleDataService()"""
        self.data_service = MQTTDataService()

        # Set window size
        self.window_size = proc_config.get('window_size', 256)

    def initialize(self):
        """Initialize all components."""
        for name, sensor in self.sensors.items():
            try:
                sensor.initialize()
                print(f"Initialized sensor: {name}")
            except Exception as e:
                print(f"Failed to initialize sensor {name}: {e}")

        self.data_service.initialize()

    def update_buffers(self, readings):
        """Add new sensor readings to the buffers."""
        for name, data in readings.items():
            self.buffers[name]['x'] = np.append(self.buffers[name]['x'], data['x'])[-self.window_size:]
            self.buffers[name]['y'] = np.append(self.buffers[name]['y'], data['y'])[-self.window_size:]
            self.buffers[name]['z'] = np.append(self.buffers[name]['z'], data['z'])[-self.window_size:]

    def process_and_send(self):
        """Process buffered data and send the output."""
        # Verify all buffers have enough data
        for name, buffer in self.buffers.items():
            if len(buffer['x']) < self.window_size:
                return  # Wait for more data

        # Process each sensor's data
        features = {}
        raw_latest = {}

        for name, buffer in self.buffers.items():
            # Process each axis
            features_x = self.processor.process(buffer['x'])
            features_y = self.processor.process(buffer['y'])
            features_z = self.processor.process(buffer['z'])

            # Compute combined magnitude
            magnitude = np.sqrt(
                np.square(buffer['x']) +
                np.square(buffer['y']) +
                np.square(buffer['z'])
            )
            features_mag = self.processor.process(magnitude)

            features[name] = {
                'x': features_x,
                'y': features_y,
                'z': features_z,
                'magnitude': features_mag
            }

            # Store the most recent raw readings
            raw_latest[name] = {
                'x': float(buffer['x'][-1]),
                'y': float(buffer['y'][-1]),
                'z': float(buffer['z'][-1])
            }

        # Create the final data packet
        data_packet = {
            'timestamp': time.time(),
            'features': features,
            'raw_latest': raw_latest
        }

        # Send the processed data
        self.data_service.send(data_packet)

    def run(self, duration=None):
        """Run the data collection loop."""
        self.initialize()

        try:
            start_time = time.time()
            sampling_interval = 1.0 / self.config.get('processing', 'sampling_rate')
            sample_count = 0

            while duration is None or (time.time() - start_time) < duration:
                # Read from all sensors
                readings = {}
                for name, sensor in self.sensors.items():
                    try:
                        data = sensor.read()
                        if data:
                            readings[name] = data
                    except Exception as e:
                        print(f"Error reading from {name}: {e}")

                # Update buffers with available readings
                if readings:
                    self.update_buffers(readings)
                    self.process_and_send()

                    # Print status periodically (every 100 samples)
                    sample_count += 1
                    if sample_count % 100 == 0:
                        print(
                            f"Collected {sample_count} samples - {len(self.buffers['torso']['x'])}/{self.window_size} buffer fill")

                # Maintain sampling rate
                time.sleep(sampling_interval)

        except KeyboardInterrupt:
            print("Data collection stopped by user.")
        finally:
            for sensor in self.sensors.values():
                sensor.close()
            self.data_service.close()


if __name__ == "__main__":
    collector = MultiSensorDataCollector()
    collector.run()
