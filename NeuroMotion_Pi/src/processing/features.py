import numpy as np
from scipy.fft import rfft, rfftfreq


class TremorProcessor:
    """Extract features relevant to Parkinson's tremor detection."""

    def __init__(self, fs=100, tremor_band=(3, 6), filter_cutoff=12):
        """
        Initialize tremor processor.

        Args:
            fs: Sampling frequency (Hz).
            tremor_band: Frequency range for Parkinson's tremor (Hz).
            filter_cutoff: Low-pass filter cutoff frequency (Hz).
        """
        from .filters import ButterworthLowPass
        self.fs = fs
        self.tremor_band = tremor_band
        self.filter = ButterworthLowPass(filter_cutoff, fs)

    def process(self, data_array):
        """
        Process sensor data to extract tremor features.

        Args:
            data_array: Array of raw accelerometer values.

        Returns:
            Dictionary of extracted features:
              - rms: RMS value of the filtered data.
              - dominant_freq: Frequency with highest amplitude.
              - tremor_power: Power in the 3–6 Hz band.
              - tremor_index: Ratio of tremor band power to total power.
              - is_parkinsonian: Boolean decision based on thresholds.
        """
        # Apply low-pass filter
        filtered_data = self.filter.apply(data_array)

        # Calculate RMS value
        rms = np.sqrt(np.mean(np.square(filtered_data)))

        # Compute FFT
        fft_values = rfft(filtered_data)
        freqs = rfftfreq(len(filtered_data), 1 / self.fs)
        fft_magnitude = np.abs(fft_values)

        # Tremor band (3-6 Hz)
        tremor_mask = (freqs >= self.tremor_band[0]) & (freqs <= self.tremor_band[1])
        tremor_power = np.sum(fft_magnitude[tremor_mask] ** 2) if np.any(tremor_mask) else 0

        # Dominant frequency
        dom_idx = np.argmax(fft_magnitude)
        dominant_freq = freqs[dom_idx] if dom_idx < len(freqs) else 0

        # Tremor index: ratio of tremor band power to total power
        total_power = np.sum(fft_magnitude ** 2)
        tremor_index = tremor_power / total_power if total_power > 0 else 0

        return {
            'rms': float(rms),
            'dominant_freq': float(dominant_freq),
            'tremor_power': float(tremor_power),
            'tremor_index': float(tremor_index),
            'is_parkinsonian': bool(self.tremor_band[0] <= dominant_freq <= self.tremor_band[1] and tremor_index > 0.3)
        }
