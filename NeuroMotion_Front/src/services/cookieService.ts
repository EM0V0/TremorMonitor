import Cookies from 'js-cookie';
import { User } from '@/types/auth.types';

// Cookie configuration - Enhanced security settings
const cookieConfig = {
  secure: true,                 // Only send via HTTPS
  sameSite: 'strict' as const,  // Restrict third-party cookies
  expires: 1,                   // Reduced expiration to 1 day (was 7 days)
  path: '/'                     // Available across the entire site
};

// Cookie names for auth data - More complex names to prevent guessing
const TOKEN_COOKIE_NAME = 'nm_auth_tkn';
const USER_COOKIE_NAME = 'nm_auth_usr';

/**
 * Cookie service that provides secure cookie management functions
 */
const cookieService = {
  /**
   * Set authentication token
   * @param token JWT token
   */
  setToken(token: string): void {
    Cookies.set(TOKEN_COOKIE_NAME, token, cookieConfig);
  },

  /**
   * Get authentication token
   * @returns Token or null
   */
  getToken(): string | null {
    return Cookies.get(TOKEN_COOKIE_NAME) || null;
  },

  /**
   * Set user data
   * @param user User object
   */
  setUser(user: User): void {
    // Convert user object to JSON string and encode in base64
    // Add simple XOR obfuscation algorithm, not just simple base64 encoding
    const userStr = JSON.stringify(user);
    const encodedUser = btoa(userStr.split('').map((c, i) => 
      String.fromCharCode(c.charCodeAt(0) ^ (i % 7 + 1))
    ).join(''));
    
    Cookies.set(USER_COOKIE_NAME, encodedUser, cookieConfig);
  },

  /**
   * Get user data
   * @returns User object or null
   */
  getUser(): User | null {
    const encodedUser = Cookies.get(USER_COOKIE_NAME);
    
    if (!encodedUser) return null;
    
    try {
      // Decode obfuscated user data
      const encoded = atob(encodedUser);
      const decodedStr = encoded.split('').map((c, i) => 
        String.fromCharCode(c.charCodeAt(0) ^ (i % 7 + 1))
      ).join('');
      
      return JSON.parse(decodedStr);
    } catch (error) {
      console.error('Error parsing user cookie:', error);
      // If parsing fails, clear cookies
      this.clearAuth();
      return null;
    }
  },
  
  /**
   * Check if user is authenticated
   * @returns Boolean
   */
  isAuthenticated(): boolean {
    return !!this.getToken() && !!this.getUser();
  },
  
  /**
   * Clear all authentication related cookies
   */
  clearAuth(): void {
    Cookies.remove(TOKEN_COOKIE_NAME, { path: '/' });
    Cookies.remove(USER_COOKIE_NAME, { path: '/' });
  }
};

export default cookieService; 