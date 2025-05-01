import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import authService from './authService';
import cookieService from './cookieService';
import { throttle } from 'lodash';

// Environment configuration
const isDev = process.env.NODE_ENV === 'development';
const isDebugMode = isDev && import.meta.env.VITE_DEBUG_MODE === 'true';

// Base API configuration
const apiConfig: AxiosRequestConfig = {
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5037/api',
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

// Request interceptor for adding auth token and tracking
apiInstance.interceptors.request.use(
  (config) => {
    // Add request ID for tracking
    const requestId = `${config.method}-${config.url}-${Date.now()}`;
    config.headers = config.headers || {};
    config.headers['x-request-id'] = requestId; // Use lowercase header name
    
    // Store start time for performance tracking
    if (isDebugMode && config.url) {
      requestTimings[requestId] = performance.now();
      console.debug(`🚀 Request started: ${config.method?.toUpperCase()} ${config.url}`);
      if (config.data) {
        console.debug('Request payload:', 
          typeof config.data === 'object' 
            ? { ...config.data, password: config.data.password ? '******' : undefined } 
            : config.data
        );
      }
    }
    
    // Get token from cookie instead of localStorage
    const token = cookieService.getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    // Use throttled function to update user activity timestamp, limiting frequency
    if (authService.isAuthenticated()) {
      updateActivityThrottled();
    }
    
    return config;
  },
  (error) => {
    console.error('Request preparation error:', error);
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
  async (error: AxiosError) => {
    // Extract request details for logging
    const config = error.config;
    const requestId = config?.headers?.['X-Request-ID'] as string;
    const method = config?.method?.toUpperCase() || 'UNKNOWN';
    const url = config?.url || 'UNKNOWN';
    
    // Performance tracking for failed responses
    if (isDebugMode && requestId && requestTimings[requestId]) {
      const duration = performance.now() - requestTimings[requestId];
      console.debug(`❌ Error response: ${method} ${url} (${Math.round(duration)}ms)`);
      delete requestTimings[requestId];
    }
    
    // Log error details
    if (error.response) {
      console.error(`API Error ${method} ${url} - Status: ${error.response.status}`, error.response.data);
    } else if (error.request) {
      console.error(`API Error ${method} ${url} - No response received`, { error });
    } else {
      console.error(`API Error ${method} ${url} - Request setup failed`, { error });
    }

    // Handle authentication errors
    if (error.response?.status === 401) {
      // Check if this is not already a login or refresh token request to avoid loops
      const isAuthRequest = url.includes('/login') || url.includes('/refresh-token');
      if (!isAuthRequest) {
        console.warn('Authentication failed. Logging out...');
        
        // Use cookieService to force logout
        cookieService.clearAuth();
        sessionStorage.removeItem('lastActivity');
        
        // Could try to refresh token, but for security we log out directly
        // Redirect to login page if not already there
        if (window.location.pathname !== '/login') {
          window.location.href = '/login?error=session_expired';
        }
      }
    }

    // Handle specific error statuses with more useful error messages
    if (error.response) {
      switch (error.response.status) {
        case 403:
          console.error('Permission denied. You do not have access to this resource.');
          break;
        case 404:
          console.error('Resource not found. The requested endpoint does not exist.');
          break;
        case 422:
          console.error('Validation error. Please check your input data.');
          break;
        case 429:
          console.error('Too many requests. Please try again later.');
          break;
        case 500:
        case 502:
        case 503:
        case 504:
          console.error('Server error. Our team has been notified.');
          break;
      }
    } else if (error.message === 'Network Error') {
      console.error('Network error. Please check your connection or API server status.');
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