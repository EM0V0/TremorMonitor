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

export default api; 