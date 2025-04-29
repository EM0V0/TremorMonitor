import React, { createContext, useContext, useState, useEffect, ReactNode, useRef, useCallback } from 'react';
import { AuthContextType, LoginCredentials, User, AuthResponse, RegisterCredentials } from '@/types/auth.types';
import authService from '@/services/authService';
import api from '@/services/api';
import cookieService from '@/services/cookieService';

// Create a mock default Promise value that conforms to AuthResponse type
const mockLoginPromise = Promise.resolve({
  token: '',
  user: {
    id: '',
    email: '',
    firstName: '',
    lastName: '',
    name: '',
    role: 'doctor'
  }
}) as Promise<AuthResponse>;

// Auth context default values
const defaultAuthContext: AuthContextType = {
  isAuthenticated: false,
  user: null,
  token: null,
  loading: true,
  error: null,
  login: () => mockLoginPromise,
  register: async () => {},
  logout: () => {},
  forgotPassword: async () => {},
  resetPassword: async () => {},
};

// Create context with proper type
const AuthContext = createContext<AuthContextType>(defaultAuthContext);

// Reduced session check interval (1 minute) for improved security
const SESSION_CHECK_INTERVAL = 60 * 1000;

// Token refresh threshold (7 hours) to refresh token before expiration
const TOKEN_REFRESH_THRESHOLD = 7 * 60 * 60 * 1000;

// Provider component that wraps the app and makes auth available to any child component
export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [authState, setAuthState] = useState<Omit<AuthContextType, 'login' | 'logout' | 'forgotPassword' | 'resetPassword' | 'register'>>({
    isAuthenticated: false,
    user: null,
    token: null,
    loading: true,
    error: null,
  });
  
  // Use useRef to avoid infinite loops
  const refreshingToken = useRef(false);

  // Token refresh function
  const refreshToken = useCallback(async () => {
    if (refreshingToken.current) return;
    
    try {
      refreshingToken.current = true;
      console.log('Attempting to refresh token...');
      
      // Call token refresh API with correct endpoint
      const response = await api.post('/user/refresh-token');
      
      if (response && response.token) {
        // Update stored token using cookie service
        cookieService.setToken(response.token);
        
        // Update auth state
        setAuthState(prev => ({
          ...prev,
          token: response.token,
        }));
        
        // Update activity timestamp
        authService.updateActivityTimestamp();
        console.log('Token refreshed successfully');
      }
    } catch (error) {
      console.error('Failed to refresh token:', error);
      // If refresh fails, log out the user
      authService.logout();
      setAuthState({
        isAuthenticated: false,
        user: null,
        token: null,
        loading: false,
        error: 'Session expired, please login again',
      });
    } finally {
      refreshingToken.current = false;
    }
  }, []);

  // Validate token and refresh if needed
  const validateAndRefreshToken = useCallback(async () => {
    // Check if token is near expiration
    const tokenNeedsRefresh = authService.isTokenNearExpiration(TOKEN_REFRESH_THRESHOLD);
    
    // If token is expired, log out user
    if (authService.isTokenExpired()) {
      console.warn('Session token expired. Logging out.');
      authService.logout();
      setAuthState({
        isAuthenticated: false,
        user: null,
        token: null,
        loading: false,
        error: 'Your session has expired, please login again',
      });
      return false;
    } 
    // If token is near expiration, try to refresh
    else if (tokenNeedsRefresh) {
      await refreshToken();
    }
    
    return true;
  }, [refreshToken]);

  // Initialize auth state on mount
  useEffect(() => {
    const initAuth = async () => {
      try {
        const token = cookieService.getToken();
        const user = authService.getCurrentUser();
        
        if (token && user) {
          // Check if token is valid
          const isValid = await validateAndRefreshToken();
          
          if (isValid) {
            // Update last activity timestamp
            authService.updateActivityTimestamp();
            
            setAuthState({
              isAuthenticated: true,
              user,
              token,
              loading: false,
              error: null,
            });
          }
        } else {
          // Clear any partial auth data
          authService.logout();
          setAuthState({
            isAuthenticated: false,
            user: null,
            token: null,
            loading: false,
            error: null,
          });
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
        authService.logout();
        setAuthState({
          isAuthenticated: false,
          user: null,
          token: null,
          loading: false,
          error: 'Authentication failed, please login again',
        });
      }
    };

    initAuth();
    
    // Set up session activity checker
    const activityInterval = setInterval(async () => {
      if (authService.isAuthenticated()) {
        // If user is authenticated, update activity timestamp
        authService.updateActivityTimestamp();
        
        // Validate and refresh token
        await validateAndRefreshToken();
      }
    }, SESSION_CHECK_INTERVAL);
    
    // Clear interval on component unmount
    return () => clearInterval(activityInterval);
  }, [validateAndRefreshToken]);

  // Add throttled user activity tracking
  useEffect(() => {
    // Only set up listeners if user is authenticated
    if (!authState.isAuthenticated) return;
    
    // Use throttling technique to limit update frequency
    let lastUpdateTime = Date.now();
    const THROTTLE_DELAY = 30000; // 30 seconds
    
    // Throttled function to update activity timestamp
    const updateActivityThrottled = () => {
      const now = Date.now();
      if (now - lastUpdateTime > THROTTLE_DELAY) {
        lastUpdateTime = now;
        if (authService.isAuthenticated()) {
          authService.updateActivityTimestamp();
        }
      }
    };
    
    // Add event listeners for user activity
    window.addEventListener('click', updateActivityThrottled);
    window.addEventListener('keypress', updateActivityThrottled);
    window.addEventListener('scroll', updateActivityThrottled);
    window.addEventListener('mousemove', updateActivityThrottled);
    
    // Clean up event listeners
    return () => {
      window.removeEventListener('click', updateActivityThrottled);
      window.removeEventListener('keypress', updateActivityThrottled);
      window.removeEventListener('scroll', updateActivityThrottled);
      window.removeEventListener('mousemove', updateActivityThrottled);
    };
  }, [authState.isAuthenticated]);

  // Login handler
  const login = async (credentials: LoginCredentials): Promise<AuthResponse> => {
    try {
      setAuthState(prev => ({ ...prev, loading: true, error: null }));
      
      // Call auth service login method
      const response = await authService.login(credentials);
      
      // Update auth state with response data
      setAuthState({
        isAuthenticated: true,
        user: response.user,
        token: response.token,
        loading: false,
        error: null,
      });
      
      // Initialize activity tracking
      authService.updateActivityTimestamp();
      
      // Return response for additional handling if needed
      return response;
    } catch (error: any) {
      // Extract error message for more detailed error handling
      let errorMessage = 'Login failed. Please try again.';
      
      if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      // Provide more useful error messages for specific error types
      if (error.response?.status === 401) {
        errorMessage = 'Username or password is incorrect';
      } else if (error.response?.status === 403) {
        errorMessage = 'Your account does not have permission to access';
      } else if (error.response?.status === 429) {
        errorMessage = 'Too many login attempts, please try again later';
      } else if (error.response?.status >= 500) {
        errorMessage = 'Server error, please try again later';
      } else if (error.message?.includes('Network Error')) {
        errorMessage = 'Network connection error, please check your internet connection';
      }
      
      // Update auth state with error
      setAuthState(prev => ({
        ...prev,
        isAuthenticated: false,
        loading: false,
        error: errorMessage,
      }));
      
      // Re-throw error for component-level handling
      throw error;
    }
  };

  // Logout handler
  const logout = () => {
    // Call auth service logout method
    authService.logout();
    
    // Reset auth state
    setAuthState({
      isAuthenticated: false,
      user: null,
      token: null,
      loading: false,
      error: null,
    });
  };

  // Register handler
  const register = async (credentials: RegisterCredentials): Promise<void> => {
    try {
      setAuthState(prev => ({ ...prev, loading: true, error: null }));
      
      // Call auth service register method
      await authService.register(credentials);
      
      // Update auth state - no need to set user/token as they should login after registering
      setAuthState(prev => ({ ...prev, loading: false }));
    } catch (error: any) {
      // Extract error message for more detailed error handling
      let errorMessage = 'Registration failed. Please try again.';
      
      if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      // Provide more useful error messages for specific error types
      if (error.response?.status === 400) {
        errorMessage = 'Invalid registration data. Please check your inputs.';
      } else if (error.response?.status === 409) {
        errorMessage = 'An account with this email already exists.';
      } else if (error.response?.status === 429) {
        errorMessage = 'Too many registration attempts. Please try again later.';
      } else if (error.message?.includes('Network Error')) {
        errorMessage = 'Network connection error, please check your internet connection';
      }
      
      // Update auth state with error
      setAuthState(prev => ({
        ...prev,
        loading: false,
        error: errorMessage,
      }));
      
      // Re-throw error for component-level handling
      throw error;
    }
  };

  // Forgot password handler
  const forgotPassword = async (email: string) => {
    try {
      setAuthState(prev => ({ ...prev, loading: true, error: null }));
      await authService.forgotPassword(email);
      setAuthState(prev => ({ ...prev, loading: false }));
    } catch (error: any) {
      // Improved error handling
      let errorMessage = 'Password reset request failed. Please try again.';
      
      if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      // Provide more useful messages for specific errors
      if (error.response?.status === 404) {
        errorMessage = 'Email address not found';
      } else if (error.response?.status >= 500) {
        errorMessage = 'Server error, please try again later';
      }
      
      setAuthState(prev => ({ ...prev, loading: false, error: errorMessage }));
      throw error;
    }
  };

  // Reset password handler
  const resetPassword = async (token: string, newPassword: string) => {
    try {
      setAuthState(prev => ({ ...prev, loading: true, error: null }));
      await authService.resetPassword(token, newPassword);
      setAuthState(prev => ({ ...prev, loading: false }));
    } catch (error: any) {
      // Improved error handling
      let errorMessage = 'Password reset failed. Please try again.';
      
      if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      // Provide more useful messages for specific errors
      if (error.response?.status === 400) {
        errorMessage = 'Password reset link is invalid or expired';
      } else if (error.response?.status >= 500) {
        errorMessage = 'Server error, please try again later';
      }
      
      setAuthState(prev => ({ ...prev, loading: false, error: errorMessage }));
      throw error;
    }
  };

  // Create value object to be provided to consumers
  const contextValue: AuthContextType = {
    ...authState,
    login,
    register,
    logout,
    forgotPassword,
    resetPassword,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

// Custom hook to use the auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  
  return context;
};

export default AuthContext; 