import yaml
import os


class Config:
    """Configuration manager."""

    def __init__(self, config_file=None):
        self.config_file = config_file
        self.config = self._load_config()

    def _load_config(self):
        """Load configuration from file or return defaults."""
        if self.config_file and os.path.exists(self.config_file):
            with open(self.config_file, 'r') as f:
                return yaml.safe_load(f)
        return self._get_default_config()

    def _get_default_config(self):
        """Default configuration for Parkinson's tremor detection."""
        return {
            'sensor': {
                'type': 'adxl345',
                'bus': 1,
                'address': 0x53,
                'range': 2  # ±2g for maximum sensitivity
            },
            'processing': {
                'sampling_rate': 100,  # Hz
                'window_size': 256,  # samples (2.56 sec @ 100Hz)
                'filter_cutoff': 12,  # Hz
                'tremor_band': [3, 6]  # Hz (Parkinson's typical range)
            },
            'data_service': {
                'type': 'console'  # Default: output to console
            }
        }

    def get(self, *keys):
        """Retrieve a nested configuration value."""
        result = self.config
        for key in keys:
            result = result.get(key)
            if result is None:
                return None
        return result
