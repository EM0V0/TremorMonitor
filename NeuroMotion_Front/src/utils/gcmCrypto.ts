/**
 * AES-256-GCM encryption and decryption functionality
 * Implemented using Web Crypto API
 */

// Structure for encrypted data
export interface EncryptedPayload {
  iv: string;        // Base64-encoded initialization vector
  ciphertext: string; // Base64-encoded ciphertext
  tag: string;       // Base64-encoded authentication tag
}

/**
 * Converts a Uint8Array to a Base64 string
 */
function uint8ArrayToBase64(array: Uint8Array): string {
  // Convert Uint8Array to a binary string
  let binaryString = '';
  for (let i = 0; i < array.length; i++) {
    binaryString += String.fromCharCode(array[i]);
  }
  
  // Convert binary string to Base64
  return btoa(binaryString);
}

/**
 * Converts a Base64 string to a Uint8Array
 */
function base64ToUint8Array(base64: string): Uint8Array {
  // Convert Base64 to binary string
  const binaryString = atob(base64);
  
  // Create a buffer of the correct length
  const array = new Uint8Array(binaryString.length);
  
  // Fill the buffer with byte values
  for (let i = 0; i < binaryString.length; i++) {
    array[i] = binaryString.charCodeAt(i);
  }
  
  return array;
}

/**
 * Encodes a string as UTF-8 and returns it as a Uint8Array
 */
function encodeUtf8(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/**
 * Decodes a UTF-8 Uint8Array to a string
 */
function decodeUtf8(array: Uint8Array): string {
  return new TextDecoder('utf-8').decode(array);
}

/**
 * Imports a Base64-formatted key
 */
async function importKey(base64Key: string): Promise<CryptoKey> {
  const keyData = base64ToUint8Array(base64Key);
  
  // Import as AES-GCM key
  return await window.crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'AES-GCM', length: 256 },
    false, // Not extractable
    ['encrypt', 'decrypt'] // Allowed operations
  );
}

/**
 * Encrypts a JSON object
 * @param data JSON object to encrypt
 * @param base64Key Base64-encoded AES key
 * @returns Encrypted payload
 */
export async function encryptJson(data: any, base64Key: string): Promise<EncryptedPayload> {
  try {
    console.log("Starting encryption with key length:", base64Key.length);
    
    // 1. Import the key
    const key = await importKey(base64Key);
    
    // 2. Generate random IV (12 bytes)
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    console.log("Generated IV:", Array.from(iv));
    
    // 3. Convert data to JSON string, then to UTF-8 byte array
    const jsonString = JSON.stringify(data);
    console.log("JSON to encrypt:", jsonString);
    const plaintext = encodeUtf8(jsonString);
    
    // 4. Encrypt the data
    const ciphertextWithTag = await window.crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv,
        tagLength: 128 // GCM authentication tag length, 128 bits (16 bytes)
      },
      key,
      plaintext
    );
    
    // Web Crypto API appends the tag at the end of the ciphertext
    const encrypted = new Uint8Array(ciphertextWithTag);
    const actualCiphertextLength = encrypted.length - 16; // Last 16 bytes are the tag
    
    // Separate ciphertext and tag - tag is the last 16 bytes
    const actualCiphertext = encrypted.slice(0, actualCiphertextLength);
    const tag = encrypted.slice(actualCiphertextLength);
    
    console.log("Ciphertext length:", actualCiphertext.length);
    console.log("Tag length:", tag.length);
    
    // 5. Convert to Base64 and use lowercase property names to match C# model
    const result = {
      iv: uint8ArrayToBase64(iv),
      ciphertext: uint8ArrayToBase64(actualCiphertext),
      tag: uint8ArrayToBase64(tag)
    };
    
    console.log("Final encrypted payload with property names:", Object.keys(result));
    return result;
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypts encrypted data
 * @param payload Encrypted payload
 * @param base64Key Base64-encoded AES key
 * @returns Decrypted object
 */
export async function decryptJson(payload: EncryptedPayload, base64Key: string): Promise<any> {
  try {
    // 1. Import the key
    const key = await importKey(base64Key);
    
    // 2. Convert Base64 to binary data
    const iv = base64ToUint8Array(payload.iv);
    const ciphertext = base64ToUint8Array(payload.ciphertext);
    const tag = base64ToUint8Array(payload.tag);
    
    // 3. Combine ciphertext and authentication tag
    // WebCrypto API expects complete ciphertext (including tag)
    const encryptedData = new Uint8Array(ciphertext.length + tag.length);
    encryptedData.set(ciphertext);
    encryptedData.set(tag, ciphertext.length);
    
    // 4. Decrypt the data
    const decrypted = await window.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv,
        tagLength: 128 // GCM authentication tag length, 128 bits (16 bytes)
      },
      key,
      encryptedData
    );
    
    // 5. Convert to string and parse JSON
    const jsonString = decodeUtf8(new Uint8Array(decrypted));
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt data: Authentication failed');
  }
} 