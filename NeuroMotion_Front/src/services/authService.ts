import api from './api';
import { LoginCredentials, User, UserRole, RegisterCredentials } from '@/types/auth.types';
import axios, { AxiosError } from 'axios';
import cookieService from './cookieService';

interface AuthResponse {
  token: string;
  user: User;
}

// Mock user data for testing
const MOCK_USERS: Record<UserRole, User> = {
  doctor: {
    id: '1',
    email: 'doctor@example.com',
    firstName: 'Sarah',
    lastName: 'Johnson',
    name: 'Sarah Johnson',
    role: 'doctor'
  },
  admin: {
    id: '2',
    email: 'admin@example.com',
    firstName: 'Admin',
    lastName: 'User',
    name: 'Admin User',
    role: 'admin'
  },
  family: {
    id: '3',
    email: 'family@example.com',
    firstName: 'Family',
    lastName: 'Member',
    name: 'Family Member',
    role: 'family'
  }
};

// Maximum number of retry attempts for API calls
const MAX_RETRY_ATTEMPTS = 2;
// Delay between retry attempts (ms)
const RETRY_DELAY = 1000;

// Helper function to delay execution
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Parse JWT token function
const parseJwtToken = (token: string): { exp?: number } | null => {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return null;
    
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));

    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error('Error parsing JWT token:', error);
    return null;
  }
};

export const authService = {
  // Login user
  login: async (credentials: LoginCredentials): Promise<AuthResponse> => {
    // For development/testing purposes, use mock authentication
    if (process.env.NODE_ENV === 'development' && import.meta.env.VITE_USE_MOCK_AUTH === 'true') {
      console.log('Using mock authentication');
      
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // Simple validation
      if (!credentials.email || !credentials.password) {
        throw new Error('Email and password are required');
      }
      
      // Mock login logic - in real app this would be handled by the API
      const userRole = credentials.role || 'doctor';
      const mockUser = MOCK_USERS[userRole];
      
      // Simulate login with test credentials or using selected role
      if (credentials.email === 'test@example.com' && credentials.password === 'password123') {
        const response: AuthResponse = {
          token: 'mock-jwt-token-' + Math.random().toString(36).substring(2),
          user: {
            ...mockUser,
            email: credentials.email,
            name: credentials.email.split('@')[0],
            profileImage: '/assets/profile-placeholder.jpg',
          }
        };
        
        // Use cookieService instead of localStorage
        cookieService.setToken(response.token);
        cookieService.setUser(response.user);
        
        return response;
      } else {
        throw new Error('Invalid credentials');
      }
    }
    
    // Real API call for production with retry logic
    let retryCount = 0;
    let lastError: any = null;

    while (retryCount <= MAX_RETRY_ATTEMPTS) {
      try {
        // Prepare login payload - include role if specified
        const loginPayload = {
          Email: credentials.email,
          Password: credentials.password,
          Role: credentials.role // Include role in the request
        };

        console.log(`Attempt ${retryCount + 1}: Calling login API`);
        
        // Call backend API for login - Hide sensitive data from logs
        const secureLogPayload = { Email: loginPayload.Email, Role: loginPayload.Role };
        console.log('Login request (sensitive data hidden):', secureLogPayload);
        
        // Call backend API for login
        const response = await api.post<any>('/user/login', loginPayload);
        
        // Sanitize logs by not logging the full response that may contain sensitive data
        console.log('Login successful, token received');
        
        // Extract user data and token from response
        if (response && response.user) {
          const userData: User = {
            id: response.user.id.toString(),
            email: response.user.email,
            firstName: response.user.name.split(' ')[0] || '',
            lastName: response.user.name.split(' ').slice(1).join(' ') || '',
            name: response.user.name,
            role: response.user.role.toLowerCase() as UserRole
          };
          
          const authResponse: AuthResponse = {
            token: response.token,
            user: userData
          };
          
          // Store authentication data in cookies instead of localStorage
          cookieService.setToken(authResponse.token);
          cookieService.setUser(authResponse.user);
          
          // Clear sensitive data from memory
          credentials.password = '';
          
          return authResponse;
        } else {
          throw new Error('Invalid response format from server');
        }
      } catch (error) {
        lastError = error;
        const axiosError = error as AxiosError;
        
        // Don't retry for certain error types
        if (
          axiosError.response?.status === 401 || // Unauthorized - bad credentials
          axiosError.response?.status === 400 || // Bad request - validation error
          axiosError.response?.status === 403    // Forbidden - access denied
        ) {
          console.error('Login error (will not retry):', axiosError.message);
          break; // Don't retry for these errors
        }
        
        // Only retry for network errors or server errors
        if (retryCount < MAX_RETRY_ATTEMPTS) {
          console.warn(`Login attempt ${retryCount + 1} failed. Retrying in ${RETRY_DELAY}ms...`);
          await delay(RETRY_DELAY);
          retryCount++;
        } else {
          console.error(`Login failed after ${MAX_RETRY_ATTEMPTS + 1} attempts.`);
          break;
        }
      }
    }
    
    // Clear sensitive data from memory
    credentials.password = '';
    
    // If we get here, all attempts failed
    console.error('All login attempts failed:', lastError instanceof AxiosError ? lastError.message : lastError);
    throw lastError;
  },

  // Logout user
  logout: (): void => {
    // Use cookieService to clear authentication data
    cookieService.clearAuth();
    
    // Additional cleanup if needed
    sessionStorage.removeItem('lastActivity');
  },

  // Register new user
  register: async (credentials: RegisterCredentials): Promise<void> => {
    // For development/testing purposes, use mock registration
    if (process.env.NODE_ENV === 'development' && import.meta.env.VITE_USE_MOCK_AUTH === 'true') {
      console.log('Using mock registration');
      
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // Simple validation
      if (!credentials.email || !credentials.password) {
        throw new Error('Email and password are required');
      }

      if (credentials.password !== credentials.confirmPassword) {
        throw new Error('Passwords do not match');
      }
      
      // Simulate registration success
      console.log('Mock registration successful');
      return;
    }
    
    // Real API call for production with retry logic
    let retryCount = 0;
    let lastError: any = null;

    while (retryCount <= MAX_RETRY_ATTEMPTS) {
      try {
        // Prepare registration payload
        const registerPayload = {
          Name: credentials.name,
          Email: credentials.email,
          Password: credentials.password,
          ConfirmPassword: credentials.confirmPassword,
          Role: credentials.role
        };

        console.log(`Attempt ${retryCount + 1}: Calling register API`);
        
        // Hide sensitive data from logs
        const secureLogPayload = { 
          Name: registerPayload.Name, 
          Email: registerPayload.Email, 
          Role: registerPayload.Role 
        };
        console.log('Register request (sensitive data hidden):', secureLogPayload);
        
        // Call backend API for registration
        await api.post<any>('/user/register', registerPayload);
        
        console.log('Registration successful');
        
        // Clear sensitive data from memory
        credentials.password = '';
        credentials.confirmPassword = '';
        
        return;
      } catch (error) {
        lastError = error;
        const axiosError = error as AxiosError;
        
        // Don't retry for certain error types
        if (
          axiosError.response?.status === 400 || // Bad request - validation error
          axiosError.response?.status === 409    // Conflict - email already exists
        ) {
          console.error('Registration error (will not retry):', axiosError.message);
          break; // Don't retry for these errors
        }
        
        // Only retry for network errors or server errors
        if (retryCount < MAX_RETRY_ATTEMPTS) {
          console.warn(`Registration attempt ${retryCount + 1} failed. Retrying in ${RETRY_DELAY}ms...`);
          await delay(RETRY_DELAY);
          retryCount++;
        } else {
          console.error(`Registration failed after ${MAX_RETRY_ATTEMPTS + 1} attempts.`);
          break;
        }
      }
    }
    
    // Clear sensitive data from memory
    credentials.password = '';
    credentials.confirmPassword = '';
    
    // If we get here, all attempts failed
    console.error('All registration attempts failed:', lastError instanceof AxiosError ? lastError.message : lastError);
    throw lastError;
  },

  // Forgot password request
  forgotPassword: async (email: string): Promise<void> => {
    // For testing
    if (process.env.NODE_ENV === 'development' && import.meta.env.VITE_USE_MOCK_AUTH === 'true') {
      console.log('Mock forgot password for:', email);
      await new Promise(resolve => setTimeout(resolve, 800));
      return;
    }
    
    try {
      await api.post('/auth/forgot-password', { email });
    } catch (error) {
      console.error('Forgot password error:', error);
      throw error;
    }
  },

  // Reset password with token
  resetPassword: async (token: string, newPassword: string): Promise<void> => {
    // For testing
    if (process.env.NODE_ENV === 'development' && import.meta.env.VITE_USE_MOCK_AUTH === 'true') {
      console.log('Mock reset password');
      await new Promise(resolve => setTimeout(resolve, 800));
      return;
    }
    
    try {
      await api.post('/auth/reset-password', { token, newPassword });
    } catch (error) {
      console.error('Reset password error:', error);
      throw error;
    }
  },

  // Get current user from cookies
  getCurrentUser: (): User | null => {
    return cookieService.getUser();
  },

  // Check if user is authenticated
  isAuthenticated: (): boolean => {
    return cookieService.isAuthenticated();
  },
  
  // Check if token is near expiration (based on given threshold)
  isTokenNearExpiration: (thresholdMs: number): boolean => {
    const token = cookieService.getToken();
    if (!token) return false;
    
    try {
      const payload = parseJwtToken(token);
      if (!payload || !payload.exp) return false;
      
      // Token expiration time (milliseconds)
      const expirationTime = payload.exp * 1000;
      const currentTime = Date.now();
      
      // If token will expire within threshold time, needs refresh
      return (expirationTime - currentTime) < thresholdMs;
    } catch (error) {
      console.error('Error checking token expiration:', error);
      return false;
    }
  },
  
  // Check if token is expired
  isTokenExpired: (): boolean => {
    const token = cookieService.getToken();
    if (!token) return true;
    
    try {
      const payload = parseJwtToken(token);
      if (!payload || !payload.exp) return true;
      
      // Token expiration time (milliseconds)
      const expirationTime = payload.exp * 1000;
      const currentTime = Date.now();
      
      // Check if token is expired
      return currentTime > expirationTime;
    } catch (error) {
      console.error('Error checking token expiration:', error);
      return true;
    }
  },
  
  // Update last activity timestamp
  updateActivityTimestamp: (): void => {
    sessionStorage.setItem('lastActivity', Date.now().toString());
  }
};

export default authService; 