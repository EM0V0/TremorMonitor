from abc import ABC, abstractmethod


class Sensor(ABC):
    """Abstract base class for all sensors."""

    @abstractmethod
    def initialize(self):
        """Initialize sensor hardware."""
        pass

    @abstractmethod
    def read(self):
        """Read sensor data."""
        pass

    @abstractmethod
    def close(self):
        """Clean up resources."""
        pass
