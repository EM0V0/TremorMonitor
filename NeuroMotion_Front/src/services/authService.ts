import { api } from './api';
import cookieService from './cookieService';
import cryptoKeyService from './cryptoKeyService';
import { encryptJson } from '../utils/gcmCrypto';

// Login response interface
interface AuthResponse {
  token: string;
  user: any;  // Changed to required property to match auth.types.ts
}

/**
 * Helper function to parse JWT token
 */
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

// Authentication service
export const authService = {
  /**
   * Checks if user is authenticated
   */
  isAuthenticated: (): boolean => {
    return !!cookieService.getToken();
  },

  /**
   * Login method with encryption
   */
  login: async (loginData: { email: string, password: string, role?: string, rememberMe?: boolean }): Promise<AuthResponse> => {
    try {
      const { email, password, role, rememberMe } = loginData;
      
      // Try unencrypted login first (temporary for debugging)
      try {
        console.log("Using unencrypted login...");
        const directResponse = await api.post<AuthResponse>('/user/login', { 
          Email: email, 
          Password: password, 
          Role: role,
          RememberMe: rememberMe 
        });
        
        // Process login response
        if (directResponse && directResponse.token) {
          console.log("Direct login successful!");
          // Save token and user info
          cookieService.setToken(directResponse.token);
          sessionStorage.setItem('lastActivity', String(Date.now()));
          
          // Also save user info if provided
          if (directResponse.user) {
            sessionStorage.setItem('user', JSON.stringify(directResponse.user));
          }
          
          return directResponse;
        }
      } catch (directError) {
        console.log("Unencrypted login failed, trying encrypted login...", directError);
      }
    
      // Get encryption key
      const cryptoKey = await cryptoKeyService.getKey();
      console.log("Got encryption key, length:", cryptoKey.length);
      
      // Encrypt login data - make sure data matches C# model property casing
      console.log("Encrypting login data...");
      const encryptedData = await encryptJson({
        Email: email,
        Password: password,
        Role: role,
        RememberMe: rememberMe || false
      }, cryptoKey);
      
      console.log("Encrypted data:", {
        iv_length: encryptedData.iv.length,
        ciphertext_length: encryptedData.ciphertext.length,
        tag_length: encryptedData.tag.length
      });
        
      // Send encrypted login request
      console.log("Sending encrypted login request...");
      const response = await api.post<AuthResponse>('/user/login', encryptedData);
      
      // Process login response
      if (response && response.token) {
        // Save token and user info
        cookieService.setToken(response.token);
        sessionStorage.setItem('lastActivity', String(Date.now()));
        
        // Also save user info if provided
        if (response.user) {
          sessionStorage.setItem('user', JSON.stringify(response.user));
        }
        
        return response;
      } else {
        throw new Error('Login response missing token');
      }
    } catch (error) {
      console.error('Encrypted login error:', error);
      throw error;
    }
  },

  /**
   * Simulated login for direct access without backend authentication
   */
  simulateLogin: async (role: string = 'doctor'): Promise<AuthResponse> => {
    // Generate a simulated token (HMAC SHA-256 encoded with random timestamp)
    const timestamp = Date.now();
    const expiration = timestamp + 24 * 60 * 60 * 1000; // 24 hours expiration
    
    // Create a mock token (JWT format)
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = btoa(JSON.stringify({
      sub: 'simulated-user-1',
      name: 'Simulated User',
      role: role,
      exp: Math.floor(expiration / 1000),
      iat: Math.floor(timestamp / 1000)
    }));
    const signature = btoa('simulated-signature');
    const token = `${header}.${payload}.${signature}`;
    
    // Create a mock user object
    const user = {
      id: '1',
      email: 'simulated@example.com',
      firstName: 'Simulated',
      lastName: 'User',
      name: 'Simulated User',
      role: role
    };
    
    // Create the response
    const response: AuthResponse = {
      token,
      user
    };
    
    // Store token and user in storage
    cookieService.setToken(token);
    sessionStorage.setItem('lastActivity', String(timestamp));
    sessionStorage.setItem('user', JSON.stringify(user));
    
    console.log('Simulated login successful!', { user });
    
    return response;
  },

  /**
   * Registration method with encryption
   */
  register: async (registerData: { name: string, email: string, password: string, role: string }): Promise<any> => {
    try {
      // Get encryption key
      const cryptoKey = await cryptoKeyService.getKey();
      
      // Encrypt registration data - make sure property names match C# model
      const encryptedData = await encryptJson({
        Name: registerData.name,
        Email: registerData.email,
        Password: registerData.password,
        Role: registerData.role
      }, cryptoKey);
      
      // Send encrypted registration request
      const response = await api.post('/user/register', encryptedData);
      
      return response;
    } catch (error) {
      console.error('Registration error:', error);
      throw error;
    }
  },

  /**
   * Logout the user
   */
  logout: (): void => {
    cookieService.clearAuth();
    cryptoKeyService.clearKey();
    sessionStorage.removeItem('user');
    sessionStorage.removeItem('lastActivity');
  },

  /**
   * Update activity timestamp
   */
  updateActivityTimestamp: (): void => {
    sessionStorage.setItem('lastActivity', String(Date.now()));
  },

  /**
   * Get current user information
   */
  getUser: (): any => {
    try {
      const userString = sessionStorage.getItem('user');
      return userString ? JSON.parse(userString) : null;
    } catch {
      return null;
    }
  },

  /**
   * Get current user information (alias for getUser)
   */
  getCurrentUser: (): any => {
    return authService.getUser();
  },

  /**
   * Forgot password request
   */
  forgotPassword: async (email: string): Promise<void> => {
    try {
      // Get encryption key
      const cryptoKey = await cryptoKeyService.getKey();
      
      // Encrypt email data
      const encryptedData = await encryptJson({ Email: email }, cryptoKey);
      
      // Send forgot password request
      await api.post('/user/forgot-password', encryptedData);
    } catch (error) {
      console.error('Forgot password error:', error);
      throw error;
    }
  },

  /**
   * Reset password with token
   */
  resetPassword: async (token: string, newPassword: string): Promise<void> => {
    try {
      // Get encryption key
      const cryptoKey = await cryptoKeyService.getKey();
      
      // Encrypt reset password data
      const encryptedData = await encryptJson({
        Token: token,
        Password: newPassword
      }, cryptoKey);
      
      // Send reset password request
      await api.post('/user/reset-password', encryptedData);
    } catch (error) {
      console.error('Reset password error:', error);
      throw error;
    }
  },
  
  /**
   * Check if token is near expiration (based on given threshold)
   */
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
  
  /**
   * Check if token is already expired
   */
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
  }
};

export default authService; 