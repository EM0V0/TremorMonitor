import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import authService from './authService';
import cookieService from './cookieService';
import { throttle } from 'lodash';

// Environment configuration
const isDev = process.env.NODE_ENV === 'development';
const isDebugMode = isDev && (import.meta.env.VITE_DEBUG_MODE === 'true' || true); // Force debug mode for troubleshooting

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

// Create API instance with enhanced logging
const apiInstance: AxiosInstance = axios.create(apiConfig);

// Performance tracking for debugging
const requestTimings: Record<string, number> = {};

// Log complete request details for troubleshooting
const logFullRequest = (config: any) => {
  console.group('🔍 API Request Details');
  console.log('URL:', config.baseURL + config.url);
  console.log('Method:', config.method?.toUpperCase());
  console.log('Headers:', config.headers);
  
  if (config.params) {
    console.log('Query Params:', config.params);
  }
  
  if (config.data) {
    console.log('Request Data:', config.data);
  }
  console.groupEnd();
};

// Log complete response details for troubleshooting
const logFullResponse = (response: any) => {
  console.group('✅ API Response Details');
  console.log('Status:', response.status, response.statusText);
  console.log('Data:', response.data);
  console.log('Headers:', response.headers);
  console.groupEnd();
};

// Log complete error details for troubleshooting
const logFullError = (error: AxiosError) => {
  console.group('❌ API Error Details');
  console.log('Error Message:', error.message);
  
  if (error.response) {
    console.log('Status:', error.response.status, error.response.statusText);
    console.log('Response Data:', error.response.data);
    console.log('Response Headers:', error.response.headers);
  } else if (error.request) {
    console.log('Request made but no response received');
    console.log('Request Details:', error.request);
  } else {
    console.log('Error setting up request');
  }
  
  console.log('Error Config:', error.config);
  console.groupEnd();
};

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
  userID?: number;
  UserID?: number; // Backend may use different casing
  tremorPower?: number;
  TremorPower?: number; // Backend may use different casing
  tremorIndex?: number;
  TremorIndex?: number; // Backend may use different casing
  currentTime?: string;
  CreatedAt?: string; // Backend field name
}

// Activity level thresholds for tremor data
const ACTIVITY_THRESHOLDS = {
  LOW: 40,
  MEDIUM: 70
};

// Sensor data service for handling sensor-related API calls and data processing
export const sensorService = {
  // Cache for sensor data to reduce API calls
  _cache: {
    lastFetchTime: 0,
    cachedData: null as SensorData[] | null,
    minimumInterval: 10000, // 10 seconds minimum between API calls
  },
  
  // Get sensor data for a specific user
  getUserSensorData: (userId: number) => 
    api.get<SensorData[]>(`/sensordata/${userId}`),
    
  // Get simulated sensor data for testing
  getSimulatedData: () => 
    api.get<SensorData[]>('/sensordata/simulated'),
  
  // Get real sensor data from the backend, with proper error handling
  getRealSensorData: async (userId: number = 1, count: number = 100): Promise<SensorData[]> => {
    const now = Date.now();
    const timeSinceLastFetch = now - sensorService._cache.lastFetchTime;

    // If cached data exists and we're within the minimum interval, use cache
    if (sensorService._cache.cachedData && timeSinceLastFetch < sensorService._cache.minimumInterval) {
      console.log(`Using cached data (${timeSinceLastFetch}ms since last fetch, minimum interval: ${sensorService._cache.minimumInterval}ms)`);
      return sensorService._cache.cachedData;
    }
    
    try {
      // Try to get real sensor data from the API
      console.log(`Requesting real data from API for user ${userId}, count=${count}`);
      const data = await api.get<SensorData[]>(`/sensordata/${userId}?count=${count}`);
      
      // Check if we got actual data
      if (!data || !Array.isArray(data) || data.length === 0) {
        throw new Error("No real data available from backend");
      }
      
      // Update cache
      sensorService._cache.lastFetchTime = now;
      sensorService._cache.cachedData = data;
      
      console.log(`Successfully received ${data.length} real data points from backend`);
      return data;
    } catch (error) {
      console.error('Failed to fetch real sensor data:', error);
      // Don't fall back to simulated data, let the caller handle the error
      throw error;
    }
  },
  
  // Format sensor data for chart display based on time range
  formatChartData: (data: SensorData[], timeRange: 'realtime' | 'hourly' | 'daily' | 'weekly') => {
    if (!data || data.length === 0) {
      return { timestamps: [], values: [], originalDates: [] };
    }
    
    // Convert and normalize backend data format to frontend format
    const normalizedData = data.map(d => ({
      userID: d.userID || d.UserID || 1,
      tremorPower: d.TremorPower || d.tremorPower || 0, // Prioritize TremorPower from backend
      tremorIndex: d.TremorIndex || d.tremorIndex || 0, // Prioritize TremorIndex from backend
      currentTime: d.currentTime || d.CreatedAt || new Date().toISOString()
    }));
    
    // Sort data by time (newest first)
    const sortedData = [...normalizedData].sort((a, b) => 
      new Date(b.currentTime).getTime() - new Date(a.currentTime).getTime()
    );
    
    // Filter data based on time range
    const filteredData = sensorService.filterDataByTimeRange(sortedData, timeRange);
    
    // Create safe data - ensure all values are numbers
    const safeTimestamps = filteredData.map(d => sensorService.formatTimestamp(d.currentTime, timeRange));
    const safeValues = filteredData.map(d => typeof d.TremorPower === 'number' ? d.TremorPower : 
                                         (typeof d.tremorPower === 'number' ? d.tremorPower : 0));
    const safeDates = filteredData.map(d => {
      try {
        // Make sure we have a valid date string to parse
        const dateStr = d.currentTime || '';
        if (!dateStr) return new Date();
        
        const parsedDate = new Date(dateStr);
        return isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
      } catch (e) {
        return new Date(); // Default to current date if invalid
      }
    });
    
    // Map to chart format with clearer timestamps for readability
    return {
      timestamps: safeTimestamps,
      values: safeValues,
      originalDates: safeDates
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
      default:
        timeLimit = new Date(now.getTime() - 60 * 1000); // Default to last minute
    }
    
    return data.filter(d => {
      const timeStr = d.currentTime || d.CreatedAt || '';
      if (!timeStr) return false;
      
      try {
        const itemDate = new Date(timeStr);
        return !isNaN(itemDate.getTime()) && itemDate >= timeLimit;
      } catch (e) {
        return false;
      }
    });
  },
  
  // Format timestamp based on time range
  formatTimestamp: (timestamp: string | undefined, timeRange: 'realtime' | 'hourly' | 'daily' | 'weekly') => {
    if (!timestamp) return '';
    
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return '';
    
    switch (timeRange) {
      case 'realtime':
        return date.toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit', second: '2-digit'});
      case 'hourly':
        return date.toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit'});
      case 'daily':
        return date.toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
      case 'weekly':
        return date.toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric'});
      default:
        return date.toLocaleString();
    }
  },
  
  // Calculate change percentage compared to average
  calculateChange: (currentValue: number, data: SensorData[]) => {
    if (!data || data.length <= 1) return 0;
    
    // Calculate average excluding current value using normalized values
    const otherValues = data.slice(1).map(d => d.TremorPower || d.tremorPower || 0);
    if (otherValues.length === 0) return 0;
    
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
    
    // Create an array of unique timestamps
    const timestamps = [];
    for (let i = 0; i < count; i++) {
      timestamps.push(new Date(now.getTime() - i * timeInterval));
    }
    
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
      tremorPower = Math.max(10, Math.min(100, tremorPower));
      
      mockData.push({
        userID: 1,
        TremorPower: tremorPower, 
        tremorIndex: tremorPower * 10 + Math.random() * 50,
        currentTime: timestamps[i].toISOString()
      });
    }
    
    return mockData;
  }
};

export default api; 