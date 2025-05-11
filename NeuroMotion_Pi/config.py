import yaml
import os


class Config:
    """Configuration manager for multi-sensor setup."""

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
        return {
            'sensors': [
                {'name': 'torso',      'type': 'adxl345', 'bus': 1, 'address': 0x53, 'range': 2},
                {'name': 'left_hand',  'type': 'adxl345', 'bus': 3, 'address': 0x53, 'range': 2},
                {'name': 'right_hand', 'type': 'adxl345', 'bus': 4, 'address': 0x53, 'range': 2},
            ],
            'processing': {
                'sampling_rate': 100,
                'window_size': 256,
                'filter_cutoff': 12,
                'tremor_band': [3, 6],
            },
            'data_service': {
                'type': 'mqtt',
                'mqtt': {
                    'qos': 0,
                    'delta_threshold': 0.05,
                    'decimation_factor': 10,
                    'summary_window_sec': 3,
                    'key_metrics_only': True,
                }
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
