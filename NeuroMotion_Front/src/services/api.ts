import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import authService from './authService';
import cookieService from './cookieService';
import { throttle } from 'lodash';

// Environment configuration
const isDev = process.env.NODE_ENV === 'development';
const isDebugMode = isDev && import.meta.env.VITE_DEBUG_MODE === 'true';

// Base API configuration
const apiConfig: AxiosRequestConfig = {
  baseURL: import.meta.env.VITE_API_BASE_URL || 'https://localhost:5038/api',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  },
  timeout: 15000, // 15 seconds
  withCredentials: true // Enable sending cookies
};

// Create API instance
const apiInstance: AxiosInstance = axios.create(apiConfig);

// Performance tracking for debugging
const requestTimings: Record<string, number> = {};

// Add request interceptor for authentication and debugging
apiInstance.interceptors.request.use(
  (config) => {
    // Get auth token
    const token = cookieService.getToken();
    
    // Add auth token to request if available
    if (token) {
      config.headers = config.headers || {};
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    
    // Generate request ID and log timing for performance tracking
    if (isDebugMode) {
      const requestId = Math.random().toString(36).substring(2, 15);
      config.headers = config.headers || {};
      config.headers['X-Request-ID'] = requestId;
      requestTimings[requestId] = performance.now();
      
      // Log request details
      console.debug(`🔄 Request ${config.method?.toUpperCase()}: ${config.url}`);
      
      // Extra debug info
      if (config.data) {
        if (typeof config.data === 'object' && (config.data.Iv || config.data.iv)) {
          console.debug('Encrypted payload:', {
            hasIv: true,
            hasCiphertext: true,
            payloadSize: JSON.stringify(config.data).length
          });
        } else {
          console.debug('Payload type:', typeof config.data);
        }
      }
    }
    
    return config;
  },
  (error) => {
    console.error('Request error:', error);
    return Promise.reject(error);
  }
);

// Create throttled function to limit activity update frequency
const updateActivityThrottled = throttle(() => {
  authService.updateActivityTimestamp?.();
}, 30000); // 30 seconds throttling

// Response interceptor for error handling and performance tracking
apiInstance.interceptors.response.use(
  (response) => {
    // Performance tracking for successful responses
    if (isDebugMode) {
      const requestId = response.config.headers?.['X-Request-ID'] as string;
      if (requestId && requestTimings[requestId]) {
        const duration = performance.now() - requestTimings[requestId];
        console.debug(`✅ Response received: ${response.config.method?.toUpperCase()} ${response.config.url} (${Math.round(duration)}ms)`);
        delete requestTimings[requestId];
      }
    }
    
    return response;
  },
  (error: AxiosError) => {
    // Log performance metrics for failed requests
    if (isDebugMode && error.config?.headers) {
      const requestId = error.config.headers['X-Request-ID'] as string;
      if (requestId && requestTimings[requestId]) {
        const duration = performance.now() - requestTimings[requestId];
        console.debug(`❌ Request failed: ${error.config.method?.toUpperCase()} ${error.config.url} (${Math.round(duration)}ms)`);
        delete requestTimings[requestId];
      }
    }
    
    // Check if error is a network error (server unreachable)
    if (!error.response) {
      console.error('Network Error:', error.message);
      return Promise.reject(error);
    }
    
    // Log API error details
    console.error(`API Error ${error.config?.method?.toUpperCase()} ${error.config?.url} - Status: ${error.response?.status}`, error.response?.data);
    
    // Update activity time on successful response
    if (error.response?.status !== 401) {
      updateActivityThrottled();
    }
    
    // Session expired/invalid token handling
    if (error.response?.status === 401 || error.response?.status === 403) {
      // Check if the error was not from a login/register request
      const isAuthRequest = error.config?.url?.includes('/login') || error.config?.url?.includes('/register');
      
      if (!isAuthRequest) {
        // If token is invalid, logout user
        authService.logout();
        
        // Redirect to login page
        window.location.href = '/login?session=expired';
      }
    }
    
    return Promise.reject(error);
  }
);

// API service with typed methods
export const api = {
  // GET request
  get: <T = any>(url: string, config?: AxiosRequestConfig): Promise<T> => 
    apiInstance.get(url, config).then((response: AxiosResponse<T>) => response.data),
  
  // POST request
  post: <T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> => 
    apiInstance.post(url, data, config).then((response: AxiosResponse<T>) => response.data),
  
  // PUT request
  put: <T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> => 
    apiInstance.put(url, data, config).then((response: AxiosResponse<T>) => response.data),
  
  // PATCH request
  patch: <T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> => 
    apiInstance.patch(url, data, config).then((response: AxiosResponse<T>) => response.data),
  
  // DELETE request
  delete: <T = any>(url: string, config?: AxiosRequestConfig): Promise<T> => 
    apiInstance.delete(url, config).then((response: AxiosResponse<T>) => response.data),
};

// Define sensor data interface
interface SensorData {
  userID: number;
  tremorPower: number;
  tremorIndex: number;
  currentTime: string;
}

// Activity level thresholds for tremor data
const ACTIVITY_THRESHOLDS = {
  LOW: 40,
  MEDIUM: 70
};

// Sensor data service for handling sensor-related API calls and data processing
export const sensorService = {
  // Get sensor data for a specific user
  getUserSensorData: (userId: number) => 
    api.get<SensorData[]>(`/sensordata/${userId}`),
    
  // Get simulated sensor data for testing
  getSimulatedData: () => 
    api.get<SensorData[]>('/sensordata/simulated'),
  
  // Format sensor data for chart display based on time range
  formatChartData: (data: SensorData[], timeRange: 'realtime' | 'hourly' | 'daily' | 'weekly') => {
    if (!data || data.length === 0) {
      return { timestamps: [], values: [], originalDates: [] };
    }
    
    // Sort data by time (newest first)
    const sortedData = [...data].sort((a, b) => 
      new Date(b.currentTime).getTime() - new Date(a.currentTime).getTime()
    );
    
    // Filter data based on time range
    const filteredData = sensorService.filterDataByTimeRange(sortedData, timeRange);
    
    // Map to chart format
    return {
      timestamps: filteredData.map(d => sensorService.formatTimestamp(d.currentTime, timeRange)),
      values: filteredData.map(d => d.tremorPower),
      originalDates: filteredData.map(d => new Date(d.currentTime))
    };
  },
  
  // Filter data by time range
  filterDataByTimeRange: (data: SensorData[], timeRange: 'realtime' | 'hourly' | 'daily' | 'weekly') => {
    const now = new Date();
    let timeLimit: Date;
    
    switch (timeRange) {
      case 'realtime':
        timeLimit = new Date(now.getTime() - 60 * 1000); // Last 60 seconds
        break;
      case 'hourly':
        timeLimit = new Date(now.getTime() - 6 * 60 * 60 * 1000); // Last 6 hours
        break;
      case 'daily':
        timeLimit = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000); // Last 6 days
        break;
      case 'weekly':
        timeLimit = new Date(now.getTime() - 6 * 7 * 24 * 60 * 60 * 1000); // Last 6 weeks
        break;
    }
    
    return data.filter(d => new Date(d.currentTime) >= timeLimit);
  },
  
  // Format timestamp based on time range
  formatTimestamp: (timestamp: string, timeRange: 'realtime' | 'hourly' | 'daily' | 'weekly') => {
    const date = new Date(timestamp);
    
    switch (timeRange) {
      case 'realtime':
        return date.toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit', second: '2-digit'});
      case 'hourly':
        return date.toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit'});
      case 'daily':
        return date.toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
      case 'weekly':
        return date.toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric'});
    }
  },
  
  // Calculate change percentage compared to average
  calculateChange: (currentValue: number, data: SensorData[]) => {
    if (!data || data.length <= 1) return 0;
    
    // Calculate average excluding current value
    const otherValues = data.slice(1).map(d => d.tremorPower);
    const average = otherValues.reduce((sum, val) => sum + val, 0) / otherValues.length;
    
    // Calculate percentage difference
    const change = ((currentValue - average) / average) * 100;
    return Math.round(change * 10) / 10; // Round to 1 decimal place
  },
  
  // Determine activity level based on tremor power
  getActivityLevel: (tremorPower: number) => {
    if (tremorPower < ACTIVITY_THRESHOLDS.LOW) {
      return 'Low';
    } else if (tremorPower < ACTIVITY_THRESHOLDS.MEDIUM) {
      return 'Medium';
    } else {
      return 'High';
    }
  },
  
  // Generate mock data for testing when API is not available
  generateMockData: (count: number = 50, timeRange: 'realtime' | 'hourly' | 'daily' | 'weekly') => {
    const now = new Date();
    const mockData: SensorData[] = [];
    
    // Define time intervals based on range
    let timeInterval: number;
    switch (timeRange) {
      case 'realtime':
        timeInterval = 1000; // 1 second
        break;
      case 'hourly':
        timeInterval = 60 * 1000; // 1 minute
        break;
      case 'daily':
        timeInterval = 60 * 60 * 1000; // 1 hour
        break;
      case 'weekly':
        timeInterval = 24 * 60 * 60 * 1000; // 1 day
        break;
    }
    
    // Create a natural pattern with more dramatic fluctuations
    let baseValue = 60 + Math.random() * 15; // Center around 60-75
    let trend = Math.random() > 0.5 ? 2.5 : -2.5; // Stronger trend
    
    // Parameters for more pronounced oscillations
    const oscillationAmplitude = 25; // Increase amplitude for more dramatic peaks
    const oscillationFrequency = 0.5; // Adjust frequency for more natural patterns
    
    for (let i = 0; i < count; i++) {
      // Create more pronounced oscillations with multiple sine waves for complexity
      const primaryOscillation = Math.sin(i * oscillationFrequency) * oscillationAmplitude;
      const secondaryOscillation = Math.sin(i * oscillationFrequency * 2.7) * oscillationAmplitude * 0.4;
      const randomNoise = (Math.random() * 15 - 7.5); // More random noise
      
      // Combine oscillations and noise
      const variation = primaryOscillation + secondaryOscillation + randomNoise;
      
      // Add trend with more frequent trend reversals for exciting patterns
      if (Math.random() < 0.15) { // Increase reversal frequency
        trend *= -1.2; // More dramatic reversal
      }
      
      // Apply trend with larger step size
      baseValue += trend * (1 + Math.random());
      
      // Enforce range boundaries but allow higher spikes
      baseValue = Math.max(20, Math.min(85, baseValue));
      
      // Calculate final tremor power with more dramatic spikes
      let tremorPower = baseValue + variation;
      
      // Occasionally add dramatic spikes (about 10% of the time)
      if (Math.random() < 0.1) {
        tremorPower += Math.random() > 0.5 ? 15 : -15;
      }
      
      // Ensure value stays within 0-100 range
      tremorPower = Math.max(0, Math.min(100, tremorPower));
      
      mockData.push({
        userID: 1,
        tremorPower: tremorPower, 
        tremorIndex: tremorPower * 10 + Math.random() * 50,
        currentTime: new Date(now.getTime() - i * timeInterval).toISOString()
      });
    }
    
    return mockData;
  }
};

export default api; 