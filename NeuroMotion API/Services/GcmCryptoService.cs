using System;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;

namespace NeuroMotion_API.Services
{
    /// <summary>
    /// Service for AES-256-GCM encryption and decryption operations
    /// </summary>
    public class GcmCryptoService
    {
        private readonly byte[] _aesKey;
        private const int TagSize = 16; // GCM tag size in bytes
        
        public GcmCryptoService(IConfiguration configuration)
        {
            // Get AES key from environment variable or configuration
            string base64Key = Environment.GetEnvironmentVariable("NEUROMOTION_AES_KEY") 
                            ?? configuration["Crypto:AesKey"] 
                            ?? throw new InvalidOperationException("AES key not found in environment variables or configuration");
            
            try
            {
                _aesKey = Convert.FromBase64String(base64Key);
                
                // Verify key length is 32 bytes (256 bits)
                if (_aesKey.Length != 32)
                {
                    throw new ArgumentException($"AES key must be 32 bytes (256 bits), got {_aesKey.Length} bytes");
                }
            }
            catch (FormatException)
            {
                throw new FormatException("AES key is not a valid Base64 string");
            }
        }
        
        /// <summary>
        /// Structure for encrypted payload containing initialization vector, ciphertext and authentication tag
        /// </summary>
        public class EncryptedPayload
        {
            [JsonPropertyName("iv")]
            public string Iv { get; set; } = string.Empty;
            
            [JsonPropertyName("ciphertext")]
            public string Ciphertext { get; set; } = string.Empty;
            
            [JsonPropertyName("tag")]
            public string Tag { get; set; } = string.Empty;
        }
        
        /// <summary>
        /// Decrypts an encrypted payload and returns the original JSON
        /// </summary>
        /// <param name="payload">The encrypted payload containing IV, ciphertext and tag</param>
        /// <returns>Decrypted JSON string</returns>
        public string DecryptJson(EncryptedPayload payload)
        {
            try
            {
                // Convert Base64 strings to byte arrays
                byte[] iv = Convert.FromBase64String(payload.Iv);
                byte[] ciphertext = Convert.FromBase64String(payload.Ciphertext);
                byte[] tag = Convert.FromBase64String(payload.Tag);
                
                // Validate inputs
                if (iv.Length != 12)
                {
                    throw new ArgumentException("IV must be 12 bytes");
                }
                
                if (tag.Length != TagSize)
                {
                    throw new ArgumentException($"Tag must be {TagSize} bytes");
                }
                
                // Create buffer for plaintext output
                byte[] plaintext = new byte[ciphertext.Length];
                
                // Create AesGcm instance and decrypt
                using var aesGcm = new AesGcm(_aesKey, TagSize);
                aesGcm.Decrypt(iv, ciphertext, tag, plaintext, null);
                
                // Convert plaintext to string
                return Encoding.UTF8.GetString(plaintext);
            }
            catch (Exception ex) when (
                ex is CryptographicException ||
                ex is ArgumentException ||
                ex is FormatException
            )
            {
                // Wrap all crypto-related exceptions into one type for better error handling
                throw new CryptographicException("Decryption failed. Data may be tampered with or corrupted.", ex);
            }
        }
        
        /// <summary>
        /// Encrypts a JSON string and returns the encrypted payload
        /// </summary>
        /// <param name="json">The JSON string to encrypt</param>
        /// <returns>Encrypted payload containing IV, ciphertext and tag</returns>
        public EncryptedPayload EncryptJson(string json)
        {
            // Generate random IV
            byte[] iv = new byte[12];
            RandomNumberGenerator.Fill(iv);
            
            // Get bytes from JSON string
            byte[] plaintext = Encoding.UTF8.GetBytes(json);
            
            // Create buffer for ciphertext and tag
            byte[] ciphertext = new byte[plaintext.Length];
            byte[] tag = new byte[TagSize];
            
            // Encrypt data
            using var aesGcm = new AesGcm(_aesKey, TagSize);
            aesGcm.Encrypt(iv, plaintext, ciphertext, tag, null);
            
            // Return encrypted payload
            return new EncryptedPayload
            {
                Iv = Convert.ToBase64String(iv),
                Ciphertext = Convert.ToBase64String(ciphertext),
                Tag = Convert.ToBase64String(tag)
            };
        }
        
        /// <summary>
        /// Gets the Base64-encoded encryption key - for development use only
        /// </summary>
        /// <returns>Base64-encoded AES key</returns>
        public string GetBase64Key()
        {
            return Convert.ToBase64String(_aesKey);
        }
        
        /// <summary>
        /// Attempts to decrypt an encrypted payload and deserialize to the specified type
        /// </summary>
        /// <typeparam name="T">Type to deserialize to</typeparam>
        /// <param name="payload">Encrypted payload</param>
        /// <param name="result">Output deserialized object</param>
        /// <returns>True if successful, false otherwise</returns>
        public bool TryDecryptAndDeserialize<T>(EncryptedPayload payload, out T? result, ILogger? logger = null) where T : class
        {
            result = null;
            
            try
            {
                logger?.LogInformation($"Attempting to decrypt with IV length: {payload.Iv.Length}, Ciphertext length: {payload.Ciphertext.Length}, Tag length: {payload.Tag.Length}");
                
                // Validate input parameters basic sanity check
                if (string.IsNullOrEmpty(payload.Iv) || string.IsNullOrEmpty(payload.Ciphertext) || string.IsNullOrEmpty(payload.Tag))
                {
                    logger?.LogWarning("One or more payload components are empty");
                    return false;
                }
                
                try
                {
                    // Check for valid Base64
                    var ivBytes = Convert.FromBase64String(payload.Iv);
                    var ciphertextBytes = Convert.FromBase64String(payload.Ciphertext);
                    var tagBytes = Convert.FromBase64String(payload.Tag);
                    
                    logger?.LogInformation($"Base64 decoded - IV: {ivBytes.Length} bytes, Ciphertext: {ciphertextBytes.Length} bytes, Tag: {tagBytes.Length} bytes");
                    
                    // Validate expected sizes
                    if (ivBytes.Length != 12)
                    {
                        logger?.LogWarning($"Invalid IV length: {ivBytes.Length}, expected 12 bytes");
                        return false;
                    }
                    
                    if (tagBytes.Length != TagSize)
                    {
                        logger?.LogWarning($"Invalid tag length: {tagBytes.Length}, expected {TagSize} bytes");
                        return false;
                    }
                }
                catch (Exception ex)
                {
                    logger?.LogError($"Base64 decoding failed: {ex.Message}");
                    return false;
                }
                
                // Decrypt JSON
                string decryptedJson = DecryptJson(payload);
                logger?.LogInformation($"Successfully decrypted JSON: {decryptedJson.Length} characters");
                
                // Deserialize JSON to type T
                try
                {
                    result = JsonSerializer.Deserialize<T>(decryptedJson);
                    logger?.LogInformation($"Successfully deserialized to {typeof(T).Name}");
                    return result != null;
                }
                catch (JsonException ex)
                {
                    logger?.LogError($"JSON deserialization failed: {ex.Message}");
                    logger?.LogInformation($"JSON content: {decryptedJson}");
                    return false;
                }
            }
            catch (Exception ex)
            {
                logger?.LogError($"Decryption failed: {ex.Message}");
                if (ex.InnerException != null)
                {
                    logger?.LogError($"Inner exception: {ex.InnerException.Message}");
                }
                return false;
            }
        }
    }
} 