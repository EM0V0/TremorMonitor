import json
import paho.mqtt.client as mqtt
from .data_service import DataService


class MQTTDataService(DataService):
    def __init__(self, broker="localhost", port=1883, topic_prefix="parkinsons/tremor"):
        self.broker = broker
        self.port = port
        self.topic_prefix = topic_prefix
        self.client = None

    def initialize(self):
        """Initialize MQTT client and connect to broker"""
        self.client = mqtt.Client()
        try:
            self.client.connect(self.broker, self.port)
            self.client.loop_start()
            print(f"Connected to MQTT broker at {self.broker}:{self.port}")
        except Exception as e:
            print(f"Failed to connect to MQTT broker: {e}")

    def send(self, data):
        """Send data to MQTT broker"""
        if not self.client:
            print("MQTT client not initialized")
            return

        # Extract sensor name
        if "sensor_name" in data:
            topic = f"{self.topic_prefix}/{data['sensor_name']}"
        else:
            topic = f"{self.topic_prefix}/default"

        # Convert to JSON and publish
        try:
            payload = json.dumps(data)
            result = self.client.publish(topic, payload)
            if result.rc != 0:
                print(f"Failed to publish message: {result.rc}")
        except Exception as e:
            print(f"Error publishing to MQTT: {e}")

    def close(self):
        """Disconnect and clean up"""
        if self.client:
            self.client.loop_stop()
            self.client.disconnect()
