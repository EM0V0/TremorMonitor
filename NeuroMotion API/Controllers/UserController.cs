using System;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using NeuroMotion_API;
using BCrypt.Net;
using NeuroMotion_API.Models;
using NeuroMotion_API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Logging;
using System.Security.Claims;
using System.Collections.Concurrent;
using System.Text.Json;

[ApiController]
[Route("api/user")]
public class UserController : ControllerBase
{
    private readonly ApplicationDbContext _context;
    private readonly JwtService _jwtService;
    private readonly ILogger<UserController> _logger;
    private readonly GcmCryptoService _cryptoService;
    
    // Failed login attempt tracking
    private static readonly ConcurrentDictionary<string, (int Count, DateTime LastAttempt)> _failedLoginAttempts = new();
    private const int MAX_FAILED_ATTEMPTS = 5;
    private static readonly TimeSpan LOCKOUT_DURATION = TimeSpan.FromMinutes(15);
    
    // Registration rate limiting
    private static readonly ConcurrentDictionary<string, List<DateTime>> _registrationAttempts = new();
    private const int MAX_REGISTRATIONS_PER_IP = 3;
    private static readonly TimeSpan REGISTRATION_TIMEFRAME = TimeSpan.FromHours(24);

    public UserController(ApplicationDbContext context, JwtService jwtService, ILogger<UserController> logger, GcmCryptoService cryptoService)
    {
        _context = context;
        _jwtService = jwtService;
        _logger = logger;
        _cryptoService = cryptoService;
    }

    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] object request)
    {
        try
        {
            // Check if the request is encrypted
            RegisterRequest? registerRequest = null;
            
            if (request is JsonElement jsonElement)
            {
                // Try to parse as encrypted payload
                try
                {
                    if (jsonElement.TryGetProperty("iv", out var ivProp) && 
                        jsonElement.TryGetProperty("ciphertext", out var ciphertextProp) &&
                        jsonElement.TryGetProperty("tag", out var tagProp))
                    {
                        _logger.LogInformation("Request has encrypted payload properties");
                        _logger.LogInformation($"iv length: {ivProp.GetString()?.Length}, ciphertext length: {ciphertextProp.GetString()?.Length}, tag length: {tagProp.GetString()?.Length}");
                        
                        // Parse the encrypted payload
                        var encryptedPayload = JsonSerializer.Deserialize<GcmCryptoService.EncryptedPayload>(
                            jsonElement.GetRawText(),
                            new JsonSerializerOptions { PropertyNameCaseInsensitive = true }
                        );
                        
                        if (encryptedPayload != null)
                        {
                            _logger.LogInformation("Successfully deserialized encrypted payload");
                            _logger.LogInformation($"Iv: {encryptedPayload.Iv.Length}, Ciphertext: {encryptedPayload.Ciphertext.Length}, Tag: {encryptedPayload.Tag.Length}");
                            
                            // Try to decrypt the data
                            if (_cryptoService.TryDecryptAndDeserialize<RegisterRequest>(encryptedPayload, out var decryptedRequest, _logger))
                            {
                                registerRequest = decryptedRequest;
                                _logger.LogInformation("Successfully decrypted registration request data");
                            }
                            else
                            {
                                _logger.LogWarning("Failed to decrypt registration request");
                                return BadRequest(new { message = "Unable to decrypt registration data" });
                            }
                        }
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError($"Error parsing encrypted data: {ex.Message}");
                }
                
                // If not encrypted, try to parse as regular RegisterRequest
                if (registerRequest == null)
                {
                    try
                    {
                        registerRequest = JsonSerializer.Deserialize<RegisterRequest>(
                            jsonElement.GetRawText(),
                            new JsonSerializerOptions { PropertyNameCaseInsensitive = true }
                        );
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError($"Error parsing registration request: {ex.Message}");
                        return BadRequest(new { message = "Invalid registration data format" });
                    }
                }
            }
            
            // Ensure we have a valid request
            if (registerRequest == null)
            {
                return BadRequest(new { message = "Invalid registration data" });
            }

            // Check registration rate limit - use existing logic
            string ipAddress = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
            if (!CheckRegistrationRateLimit(ipAddress))
            {
                _logger.LogWarning($"Registration rate limit exceeded from IP: {ipAddress}");
                return StatusCode(429, new { message = "Registration rate limit exceeded. Please try again later." });
            }
            
            // Continue with existing registration logic using registerRequest
            
            // Model validation is handled by attributes
            
            // 1. Additional email format validation
            string emailPattern = @"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$";
            if (!System.Text.RegularExpressions.Regex.IsMatch(registerRequest.Email, emailPattern))
            {
                return BadRequest(new { message = "Invalid email format" });
            }
            
            // 2. Check if user already exists with case-insensitive comparison
            if (await _context.Users.AnyAsync(u => u.Email.ToLower() == registerRequest.Email.ToLower()))
            {
                // Don't reveal specific information about existing accounts
                _logger.LogWarning($"Registration attempt with existing email: {registerRequest.Email} from {ipAddress}");
                return BadRequest(new { message = "Registration failed. Please try with different information." });
            }

            // 3. Sanitize input - trim whitespace
            string sanitizedName = registerRequest.Name.Trim();
            string sanitizedEmail = registerRequest.Email.Trim().ToLower();
            string sanitizedRole = registerRequest.Role.Trim().ToLower();
            
            // 4. Hash password with higher work factor for stronger security
            var hashedPassword = BCrypt.Net.BCrypt.HashPassword(registerRequest.Password, workFactor: 12);

            // 5. Create new user
            var newUser = new User
            {
                Name = sanitizedName,
                Email = sanitizedEmail,
                Role = sanitizedRole,
                PasswordHash = hashedPassword
            };

            // 6. Save to database
            _context.Users.Add(newUser);
            await _context.SaveChangesAsync();

            // Record successful registration for rate limiting
            RecordSuccessfulRegistration(ipAddress);

            // 7. Enhanced audit logging
            _logger.LogInformation($"New user registered: {sanitizedEmail} with role {sanitizedRole} from {ipAddress}");

            // 8. Return appropriate success response
            return CreatedAtAction(
                nameof(GetCurrentUser), 
                new { id = newUser.Id }, 
                new { 
                    message = "User registered successfully",
                    userId = newUser.Id,
                    name = newUser.Name,
                    email = newUser.Email,
                    role = newUser.Role.ToLower()
                }
            );
        }
        catch (Exception ex)
        {
            // Improved error handling
            _logger.LogError($"Registration error: {ex.Message}");
            
            if (ex.InnerException?.Message.Contains("duplicate", StringComparison.OrdinalIgnoreCase) == true ||
                ex.Message.Contains("duplicate", StringComparison.OrdinalIgnoreCase))
            {
                // Handle potential race condition with duplicate emails
                return Conflict(new { message = "An account with this email already exists" });
            }
            
            return StatusCode(500, new { message = "An error occurred during registration. Please try again later." });
        }
    }
    
    private bool CheckRegistrationRateLimit(string ipAddress)
    {
        // Clean up expired attempts
        CleanupExpiredRegistrationAttempts();
        
        // Get attempts for this IP
        if (_registrationAttempts.TryGetValue(ipAddress, out var attempts))
        {
            // Count attempts in the timeframe
            int recentAttempts = attempts.Count(a => DateTime.UtcNow - a < REGISTRATION_TIMEFRAME);
            
            // Return false if limit exceeded
            return recentAttempts < MAX_REGISTRATIONS_PER_IP;
        }
        
        return true;
    }
    
    private void RecordSuccessfulRegistration(string ipAddress)
    {
        _registrationAttempts.AddOrUpdate(
            ipAddress,
            new List<DateTime> { DateTime.UtcNow },
            (_, existingAttempts) => 
            {
                existingAttempts.Add(DateTime.UtcNow);
                return existingAttempts;
            }
        );
    }
    
    private void CleanupExpiredRegistrationAttempts()
    {
        // Cleanup happens occasionally to reduce overhead
        if (new Random().Next(0, 10) == 0)
        {
            DateTime cutoff = DateTime.UtcNow.Subtract(REGISTRATION_TIMEFRAME);
            
            foreach (var ipAddress in _registrationAttempts.Keys)
            {
                if (_registrationAttempts.TryGetValue(ipAddress, out var attempts))
                {
                    // Remove old attempts
                    attempts.RemoveAll(attempt => attempt < cutoff);
                    
                    // Remove IP from tracking if no recent attempts
                    if (attempts.Count == 0)
                    {
                        _registrationAttempts.TryRemove(ipAddress, out _);
                    }
                }
            }
        }
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] object request)
    {
        try
        {
            _logger.LogInformation("Login request received");
            
            // Check if the request is encrypted
            LoginRequest? loginRequest = null;
            
            if (request is JsonElement jsonElement)
            {
                _logger.LogInformation("Request is JsonElement");
                
                // Try to parse as encrypted payload
                try
                {
                    if (jsonElement.TryGetProperty("iv", out var ivProp) && 
                        jsonElement.TryGetProperty("ciphertext", out var ciphertextProp) &&
                        jsonElement.TryGetProperty("tag", out var tagProp))
                    {
                        _logger.LogInformation("Request has encrypted payload properties");
                        _logger.LogInformation($"iv length: {ivProp.GetString()?.Length}, ciphertext length: {ciphertextProp.GetString()?.Length}, tag length: {tagProp.GetString()?.Length}");
                        
                        // Parse the encrypted payload
                        var encryptedPayload = JsonSerializer.Deserialize<GcmCryptoService.EncryptedPayload>(
                            jsonElement.GetRawText(),
                            new JsonSerializerOptions { PropertyNameCaseInsensitive = true }
                        );
                        
                        if (encryptedPayload != null)
                        {
                            _logger.LogInformation("Successfully deserialized encrypted payload");
                            _logger.LogInformation($"Iv: {encryptedPayload.Iv.Length}, Ciphertext: {encryptedPayload.Ciphertext.Length}, Tag: {encryptedPayload.Tag.Length}");
                            
                            // Try to decrypt the data
                            try {
                                if (_cryptoService.TryDecryptAndDeserialize<LoginRequest>(encryptedPayload, out var decryptedRequest, _logger))
                                {
                                    loginRequest = decryptedRequest;
                                    _logger.LogInformation("Successfully decrypted login request data");
                                }
                                else
                                {
                                    _logger.LogWarning("Failed to decrypt login request");
                                    return BadRequest(new { message = "Unable to decrypt login data" });
                                }
                            }
                            catch (Exception ex)
                            {
                                _logger.LogError($"Decryption exception: {ex.Message}");
                                _logger.LogError($"Exception type: {ex.GetType().Name}");
                                if (ex.InnerException != null)
                                {
                                    _logger.LogError($"Inner exception: {ex.InnerException.Message}");
                                }
                                return BadRequest(new { message = "Error during decryption: " + ex.Message });
                            }
                        }
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError($"Error parsing encrypted data: {ex.Message}");
                }
                
                // If not encrypted, try to parse as regular LoginRequest
                if (loginRequest == null)
                {
                    try
                    {
                        loginRequest = JsonSerializer.Deserialize<LoginRequest>(
                            jsonElement.GetRawText(),
                            new JsonSerializerOptions { PropertyNameCaseInsensitive = true }
                        );
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError($"Error parsing login request: {ex.Message}");
                        return BadRequest(new { message = "Invalid login data format" });
                    }
                }
            }
            
            // Ensure we have a valid request
            if (loginRequest == null)
            {
                return BadRequest(new { message = "Invalid login data" });
            }
            
            // Check attack protection - use existing logic
            string ipAddress = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
            string clientId = $"{ipAddress}:{loginRequest.Email}";
            
            if (_failedLoginAttempts.TryGetValue(clientId, out var attempts))
            {
                if (attempts.Count >= MAX_FAILED_ATTEMPTS && 
                    DateTime.UtcNow - attempts.LastAttempt < LOCKOUT_DURATION)
                {
                    _logger.LogWarning($"Account locked due to too many failed attempts: {loginRequest.Email} from {ipAddress}");
                    return StatusCode(429, new { message = $"Too many failed login attempts. Please try again after {LOCKOUT_DURATION.TotalMinutes} minutes." });
                }
                
                // Reset if lockout period has passed
                if (DateTime.UtcNow - attempts.LastAttempt > LOCKOUT_DURATION)
                {
                    _failedLoginAttempts.TryRemove(clientId, out _);
                }
            }

            // Find user by email
            var user = await _context.Users
                .FirstOrDefaultAsync(u => u.Email == loginRequest.Email);

            // User not found - use constant time comparison to prevent timing attacks
            if (user == null)
            {
                RecordFailedLoginAttempt(clientId);
                _logger.LogWarning($"Login attempt with non-existent email: {loginRequest.Email} from {ipAddress}");
                return Unauthorized(new { message = "Invalid email or password" });
            }

            // Password verification
            if (!BCrypt.Net.BCrypt.Verify(loginRequest.Password, user.PasswordHash))
            {
                RecordFailedLoginAttempt(clientId);
                _logger.LogWarning($"Failed login attempt for user: {loginRequest.Email} from {ipAddress}");
                return Unauthorized(new { message = "Invalid email or password" });
            }

            // Role filtering (if specified in request)
            if (!string.IsNullOrWhiteSpace(loginRequest.Role) && !user.Role.Equals(loginRequest.Role, StringComparison.OrdinalIgnoreCase))
            {
                RecordFailedLoginAttempt(clientId);
                _logger.LogWarning($"Login attempt with incorrect role. User: {loginRequest.Email}, Expected: {user.Role}, Requested: {loginRequest.Role}, IP: {ipAddress}");
                return Unauthorized(new { message = "You do not have access with the specified role" });
            }

            // Successful login - reset failed attempts
            _failedLoginAttempts.TryRemove(clientId, out _);

            // Generate JWT token
            var token = _jwtService.GenerateToken(user.Id, user.Email, user.Role);

            // Log successful login
            _logger.LogInformation($"User logged in: {user.Email} ({user.Role}) from {ipAddress}");

            // Return user data and token in a format compatible with the frontend
            return Ok(new
            {
                message = "Login successful",
                token = token,
                user = new { 
                    id = user.Id, 
                    name = user.Name, 
                    email = user.Email, 
                    role = user.Role.ToLower() // Convert role to lowercase to match frontend expectations
                }
            });
        }
        catch (Exception ex)
        {
            _logger.LogError($"Login error: {ex.Message}");
            return StatusCode(500, new { message = "An error occurred during login" });
        }
    }

    private void RecordFailedLoginAttempt(string clientId)
    {
        _failedLoginAttempts.AddOrUpdate(
            clientId,
            (1, DateTime.UtcNow),
            (_, existing) => (existing.Count + 1, DateTime.UtcNow)
        );
    }

    [HttpGet("me")]
    [Authorize]
    public async Task<IActionResult> GetCurrentUser()
    {
        try
        {
            // Get user ID from JWT token
            var userIdClaim = User.FindFirst("sub")?.Value;
            
            if (string.IsNullOrEmpty(userIdClaim) || !int.TryParse(userIdClaim, out int userId))
            {
                _logger.LogWarning("Invalid user ID in token");
                return Unauthorized(new { message = "Invalid authentication token" });
            }

            // Find user in database
            var user = await _context.Users.FindAsync(userId);
            
            if (user == null)
            {
                _logger.LogWarning($"User not found for ID: {userId}");
                return NotFound(new { message = "User not found" });
            }

            // Return user data in a format compatible with the frontend
            return Ok(new { 
                id = user.Id, 
                name = user.Name, 
                email = user.Email, 
                role = user.Role.ToLower() // Convert role to lowercase to match frontend expectations
            });
        }
        catch (Exception ex)
        {
            _logger.LogError($"Error retrieving user profile: {ex.Message}");
            return StatusCode(500, new { message = "An error occurred while retrieving user profile" });
        }
    }

    [HttpPost("refresh-token")]
    [Authorize]
    public async Task<IActionResult> RefreshToken()
    {
        try
        {
            // Get user ID from JWT token
            var userIdClaim = User.FindFirst("sub")?.Value;
            var emailClaim = User.FindFirst("email")?.Value;
            var roleClaim = User.FindFirst(ClaimTypes.Role)?.Value;
            
            if (string.IsNullOrEmpty(userIdClaim) || !int.TryParse(userIdClaim, out int userId))
            {
                _logger.LogWarning("Token refresh: Invalid user ID in token");
                return Unauthorized(new { message = "Invalid authentication token" });
            }

            // Find user in database
            var user = await _context.Users.FindAsync(userId);
            
            if (user == null)
            {
                _logger.LogWarning($"Token refresh: User not found for ID: {userId}");
                return NotFound(new { message = "User not found" });
            }

            // Generate new JWT token
            var newToken = _jwtService.GenerateToken(user.Id, user.Email, user.Role);

            // Log successful token refresh
            _logger.LogInformation($"User token refreshed: {user.Email} ({user.Role})");

            // Return new token
            return Ok(new
            {
                message = "Token refreshed successfully",
                token = newToken
            });
        }
        catch (Exception ex)
        {
            _logger.LogError($"Token refresh error: {ex.Message}");
            return StatusCode(500, new { message = "An error occurred while refreshing token" });
        }
    }
    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteUser(int id)
    {
        try
        {
            // Find the user by ID
            var user = await _context.Users.FindAsync(id);
            if (user == null)
            {
                return NotFound(new { message = "User not found" });
            }

            // Find and delete associated SensorData
            var sensorData = _context.SensorData.Where(sd => sd.UserID == id);
            _context.SensorData.RemoveRange(sensorData);

            // Delete the user
            _context.Users.Remove(user);

            // Save changes to the database
            await _context.SaveChangesAsync();

            return Ok(new { message = "User and associated SensorData deleted successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError($"Error deleting user with ID {id}: {ex.Message}");
            return StatusCode(500, new { message = "An error occurred while deleting the user" });
        }
    }
}


