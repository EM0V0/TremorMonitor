import { api } from './api';

// Interface definition
interface CryptoKeyResponse {
  key: string;
}

// Session storage key name for the encryption key
const KEY_STORAGE_NAME = 'neuromotion_crypto_key';

/**
 * Key service for fetching and caching AES encryption keys
 */
export const cryptoKeyService = {
  /**
   * Gets the AES encryption key
   * First checks session storage, then fetches from server if not found
   */
  getKey: async (): Promise<string> => {
    // 1. Try to get from session storage
    const cachedKey = sessionStorage.getItem(KEY_STORAGE_NAME);
    if (cachedKey) {
      console.log("Using cached encryption key from session storage");
      return cachedKey;
    }

    try {
      // 2. Fetch key from server
      console.log("Fetching encryption key from server...");
      const response = await api.get<CryptoKeyResponse>('/crypto/key');
      const { key } = response;

      // 3. Validate key format
      if (!key || typeof key !== 'string') {
        console.error("Invalid key format received:", key);
        throw new Error('Invalid key format received from server');
      }

      console.log(`Received encryption key, length: ${key.length}`);
      
      // 4. Cache key in session storage
      sessionStorage.setItem(KEY_STORAGE_NAME, key);
      
      return key;
    } catch (error) {
      console.error('Failed to fetch encryption key:', error);
      throw new Error('Failed to get encryption key. Please try again later.');
    }
  },

  /**
   * Clears the cached encryption key
   */
  clearKey: (): void => {
    sessionStorage.removeItem(KEY_STORAGE_NAME);
  }
};

export default cryptoKeyService; 