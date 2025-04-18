import numpy as np
from scipy.signal import butter, filtfilt


class Filter:
    """Signal filtering interface."""

    def apply(self, data):
        """Apply filter to data."""
        raise NotImplementedError()


class ButterworthLowPass(Filter):
    """Butterworth low-pass filter implementation."""

    def __init__(self, cutoff, fs, order=4):
        self.cutoff = cutoff
        self.fs = fs
        self.order = order

    def apply(self, data):
        nyq = 0.5 * self.fs
        normal_cutoff = self.cutoff / nyq
        b, a = butter(self.order, normal_cutoff, btype='low', analog=False)
        return filtfilt(b, a, data)
