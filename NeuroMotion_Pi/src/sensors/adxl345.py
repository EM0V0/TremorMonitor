import time
import numpy as np
from smbus2 import SMBus
from .base import Sensor


class ADXL345(Sensor):
    """ADXL345 accelerometer implementation."""

    def __init__(self, bus_number, address=0x53, range_g=2):
        self.bus_number = bus_number
        self.address = address
        self.range_g = range_g
        self.bus = None
        self.scale_factor = 0.0039  # Will be updated based on range

    def initialize(self):
        self.bus = SMBus(self.bus_number)

        # Power control - measurement mode
        self.bus.write_byte_data(self.address, 0x2D, 0x08)

        # Configure data format (range)
        range_bits = {
            2: 0x00,
            4: 0x01,
            8: 0x02,
            16: 0x03
        }.get(self.range_g, 0x00)

        self.bus.write_byte_data(self.address, 0x31, range_bits)

        # Set data rate to 100Hz
        self.bus.write_byte_data(self.address, 0x2C, 0x0A)

        # Set scale factor based on range
        self.scale_factor = {
            2: 0.0039,
            4: 0.0078,
            8: 0.0156,
            16: 0.0312
        }.get(self.range_g, 0.0039)

    def read(self):
        """Read accelerometer data."""
        try:
            data = self.bus.read_i2c_block_data(self.address, 0x32, 6)
            x = self._convert_raw(data[0], data[1])
            y = self._convert_raw(data[2], data[3])
            z = self._convert_raw(data[4], data[5])
            return {
                'x': x,
                'y': y,
                'z': z,
                'timestamp': time.time()
            }
        except Exception as e:
            print(f"Error reading ADXL345: {e}")
            return None

    def _convert_raw(self, low_byte, high_byte):
        """Convert two raw bytes to acceleration value in g."""
        value = (high_byte << 8) | low_byte
        if value > 32767:
            value -= 65536
        return value * self.scale_factor

    def close(self):
        """Clean up resources."""
        if self.bus:
            self.bus.close()
            self.bus = None
