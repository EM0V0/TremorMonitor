import json
from abc import ABC, abstractmethod
import numpy as np


def custom_converter(o):
    """Convert NumPy types to native Python types for JSON serialization."""
    if isinstance(o, np.bool_):
        return bool(o)
    if isinstance(o, np.integer):
        return int(o)
    if isinstance(o, np.floating):
        return float(o)
    raise TypeError(f"Object of type {o.__class__.__name__} is not JSON serializable")


class DataService(ABC):
    """Abstract interface for data handling services."""

    @abstractmethod
    def initialize(self):
        """Initialize the service."""
        pass

    @abstractmethod
    def send(self, data):
        """Send data to a destination."""
        pass

    @abstractmethod
    def close(self):
        """Clean up resources."""
        pass


class ConsoleDataService(DataService):
    """Simple data service that outputs JSON to the console."""

    def initialize(self):
        pass

    def send(self, data):
        """Print the data in JSON format using a custom converter."""
        print(json.dumps(data, indent=2, default=custom_converter))

    def close(self):
        pass


# An example for future MQTT integration is commented out below:
"""
class MQTTDataService(DataService):
    def __init__(self, broker, port, topic):
        self.broker = broker
        self.port = port
        self.topic = topic
        self.client = None

    def initialize(self):
        import paho.mqtt.client as mqtt
        self.client = mqtt.Client()
        self.client.connect(self.broker, self.port)
        self.client.loop_start()

    def send(self, data):
        if self.client:
            self.client.publish(self.topic, json.dumps(data, default=custom_converter))

    def close(self):
        if self.client:
            self.client.loop_stop()
            self.client.disconnect()
"""
