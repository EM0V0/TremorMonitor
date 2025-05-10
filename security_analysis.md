# NeuroMotion Security Implementation Analysis

This document provides a comprehensive overview of the security measures implemented in the NeuroMotion project, which includes a .NET Core backend, a React/TypeScript frontend, and Raspberry Pi components. The analysis focuses on all security aspects, with special attention to the login process and data protection.

## Table of Contents

1. [Authentication and Authorization](#authentication-and-authorization)
   - [Login Process Flow](#login-process-flow)
   - [AES-GCM Encryption](#aes-gcm-encryption)
   - [JWT Implementation](#jwt-implementation)
   - [Password Security](#password-security)

2. [Transport Layer Security](#transport-layer-security)
   - [HTTPS Configuration](#https-configuration)
   - [Security Headers](#security-headers)
   - [CORS Settings](#cors-settings)

3. [Frontend Security](#frontend-security)
   - [Content Security Policy](#content-security-policy)
   - [Secure Cookie Management](#secure-cookie-management)
   - [Session Management](#session-management)

4. [Backend Security](#backend-security)
   - [Account Protection](#account-protection)
   - [API Security](#api-security)
   - [Error Handling](#error-handling)

5. [Security Best Practices](#security-best-practices)
   - [Defense in Depth](#defense-in-depth)
   - [Key Management](#key-management)
   - [Logging and Monitoring](#logging-and-monitoring)

## Authentication and Authorization

### Login Process Flow

The login process is designed with multiple layers of security. Below is the complete flow from client request to successful authentication:

1. **Frontend Login Request Preparation**:

```typescript
// NeuroMotion_Front/src/services/authService.ts
login: async (loginData: { email: string, password: string, role?: string, rememberMe?: boolean }): Promise<AuthResponse> => {
  try {
    // Get encryption key
    const cryptoKey = await cryptoKeyService.getKey();
    
    // Encrypt login data
    const encryptedData = await encryptJson({
      Email: email,
      Password: password,
      Role: role,
      RememberMe: rememberMe || false
    }, cryptoKey);
    
    // Send encrypted login request
    const response = await api.post<AuthResponse>('/user/login', encryptedData);
    
    // Process login response
    if (response && response.token) {
      // Save token and user info
      cookieService.setToken(response.token);
      sessionStorage.setItem('lastActivity', String(Date.now()));
      
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
}
```

2. **Backend Login Request Processing**:

```csharp
// NeuroMotion API/Controllers/UserController.cs
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
            // Try to parse as encrypted payload
            try
            {
                if (jsonElement.TryGetProperty("iv", out var ivProp) && 
                    jsonElement.TryGetProperty("ciphertext", out var ciphertextProp) &&
                    jsonElement.TryGetProperty("tag", out var tagProp))
                {
                    // Parse the encrypted payload
                    var encryptedPayload = JsonSerializer.Deserialize<GcmCryptoService.EncryptedPayload>(
                        jsonElement.GetRawText(),
                        new JsonSerializerOptions { PropertyNameCaseInsensitive = true }
                    );
                    
                    if (encryptedPayload != null)
                    {
                        // Decrypt the payload
                        var decryptedJson = _cryptoService.DecryptJson(encryptedPayload);
                        loginRequest = JsonSerializer.Deserialize<LoginRequest>(
                            decryptedJson,
                            new JsonSerializerOptions { PropertyNameCaseInsensitive = true }
                        );
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError($"Error decrypting login request: {ex.Message}");
                // Continue and try to parse as unencrypted
            }
            
            // If not encrypted, try to parse as regular LoginRequest
            if (loginRequest == null)
            {
                loginRequest = JsonSerializer.Deserialize<LoginRequest>(
                    jsonElement.GetRawText(),
                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true }
                );
            }
        }
        
        // Check failed login attempts
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
        }

        // Find user by email
        var user = await _context.Users
            .FirstOrDefaultAsync(u => u.Email == loginRequest.Email);

        // Verify password with BCrypt
        if (user == null || !BCrypt.Net.BCrypt.Verify(loginRequest.Password, user.PasswordHash))
        {
            RecordFailedLoginAttempt(clientId);
            return Unauthorized(new { message = "Invalid email or password" });
        }

        // Generate JWT token
        var token = _jwtService.GenerateToken(user.Id, user.Email, user.Role);

        // Return user data and token
        return Ok(new
        {
            message = "Login successful",
            token = token,
            user = new { 
                id = user.Id, 
                name = user.Name, 
                email = user.Email, 
                role = user.Role
            }
        });
    }
    catch (Exception ex)
    {
        _logger.LogError($"Login error: {ex.Message}");
        return StatusCode(500, new { message = "An error occurred during login" });
    }
}
```

### AES-GCM Encryption

The project uses AES-256-GCM for encrypting sensitive data, providing confidentiality, integrity, and authenticity. Below are the key implementations:

1. **Frontend Encryption (Web Crypto API)**:

```typescript
// NeuroMotion_Front/src/utils/gcmCrypto.ts
export async function encryptJson(data: any, base64Key: string): Promise<EncryptedPayload> {
  try {
    // Import the key
    const key = await importKey(base64Key);
    
    // Generate random IV (12 bytes)
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    
    // Convert data to JSON string, then to UTF-8 byte array
    const jsonString = JSON.stringify(data);
    const plaintext = encodeUtf8(jsonString);
    
    // Encrypt the data with AES-GCM
    const ciphertextWithTag = await window.crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv,
        tagLength: 128 // GCM authentication tag length, 128 bits (16 bytes)
      },
      key,
      plaintext
    );
    
    // Separate ciphertext and tag
    const encrypted = new Uint8Array(ciphertextWithTag);
    const actualCiphertextLength = encrypted.length - 16; // Last 16 bytes are the tag
    const actualCiphertext = encrypted.slice(0, actualCiphertextLength);
    const tag = encrypted.slice(actualCiphertextLength);
    
    // Return Base64-encoded components
    return {
      Iv: uint8ArrayToBase64(iv),
      Ciphertext: uint8ArrayToBase64(actualCiphertext),
      Tag: uint8ArrayToBase64(tag)
    };
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
}
```

2. **Backend Encryption/Decryption**:

```csharp
// NeuroMotion API/Services/GcmCryptoService.cs
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
        // Wrap all crypto-related exceptions
        throw new CryptographicException("Decryption failed. Data may be tampered with or corrupted.", ex);
    }
}
```

3. **Key Management**:

```typescript
// NeuroMotion_Front/src/services/cryptoKeyService.ts
export const cryptoKeyService = {
  getKey: async (): Promise<string> => {
    // Try to get from session storage
    const cachedKey = sessionStorage.getItem(KEY_STORAGE_NAME);
    if (cachedKey) {
      return cachedKey;
    }

    try {
      // Fetch key from server
      const response = await api.get<CryptoKeyResponse>('/crypto/key');
      const { key } = response;
      
      // Cache key in session storage
      sessionStorage.setItem(KEY_STORAGE_NAME, key);
      
      return key;
    } catch (error) {
      console.error('Failed to fetch encryption key:', error);
      throw new Error('Failed to get encryption key. Please try again later.');
    }
  },

  clearKey: (): void => {
    sessionStorage.removeItem(KEY_STORAGE_NAME);
  }
};
```

### JWT Implementation

The system uses JWT (JSON Web Tokens) for stateless authentication after the initial login:

1. **JWT Generation**:

```csharp
// NeuroMotion API/Services/JwtService.cs
public string GenerateToken(int userId, string email, string role)
{
    var securityKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_secretKey));
    var credentials = new SigningCredentials(securityKey, SecurityAlgorithms.HmacSha256);

    var claims = new[]
    {
        new Claim(JwtRegisteredClaimNames.Sub, userId.ToString()),
        new Claim(JwtRegisteredClaimNames.Email, email),
        new Claim(ClaimTypes.Role, role),
        new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
        new Claim(JwtRegisteredClaimNames.Iat, DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString(), ClaimValueTypes.Integer64),
        new Claim("auth_time", DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString(), ClaimValueTypes.Integer64),
        new Claim("client_id", _audience)
    };

    var token = new JwtSecurityToken(
        issuer: _issuer,
        audience: _audience,
        claims: claims,
        expires: DateTime.UtcNow.AddMinutes(_expirationMinutes),
        signingCredentials: credentials
    );

    return new JwtSecurityTokenHandler().WriteToken(token);
}
```

2. **JWT Token Validation**:

```csharp
// NeuroMotion API/Program.cs
// Configure JWT authentication
builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
}).AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        ValidIssuer = builder.Configuration["Jwt:Issuer"] ?? "NeuroMotion",
        ValidAudience = builder.Configuration["Jwt:Audience"] ?? "NeuroMotionClients",
        IssuerSigningKey = new SymmetricSecurityKey(
            Encoding.UTF8.GetBytes(
                builder.Configuration["Jwt:SecretKey"] ?? 
                "DefaultSecretKeyForDevelopmentOnly-PleaseChangeInProduction"
            )
        )
    };
});
```

3. **Token Expiration Handling**:

```typescript
// NeuroMotion_Front/src/services/authService.ts
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
}
```

### Password Security

The system employs BCrypt for secure password storage:

```csharp
// NeuroMotion API/Controllers/UserController.cs
// Password verification during login
if (user == null || !BCrypt.Net.BCrypt.Verify(loginRequest.Password, user.PasswordHash))
{
    RecordFailedLoginAttempt(clientId);
    _logger.LogWarning($"Failed login attempt for user: {loginRequest.Email} from {ipAddress}");
    return Unauthorized(new { message = "Invalid email or password" });
}

// Password hashing during registration
string passwordHash = BCrypt.Net.BCrypt.HashPassword(registerRequest.Password);
```

BCrypt:
- Automatically generates and incorporates a random salt
- Uses a configurable work factor to adjust computational intensity
- Is resistant to brute force attacks due to its slow computation time

## Transport Layer Security

### HTTPS Configuration

The application enforces HTTPS for all connections:

1. **Backend HTTPS Configuration**:

```csharp
// NeuroMotion API/Program.cs
// Configure Kestrel to use HTTPS
builder.WebHost.ConfigureKestrel(options =>
{
    // HTTP endpoint (optional, can be kept for development)
    options.ListenAnyIP(5037);
    
    // HTTPS endpoint
    options.ListenAnyIP(5038, listenOptions =>
    {
        // Get certificate path and password from environment variables or use defaults
        var certPath = Environment.GetEnvironmentVariable("CERTIFICATE_PATH") ?? "./certs/https.pfx";
        var certPassword = Environment.GetEnvironmentVariable("CERTIFICATE_PASSWORD") ?? "password";
        
        try
        {
            // Load PFX certificate
            listenOptions.UseHttps(options =>
            {
                options.ServerCertificate = new X509Certificate2(certPath, certPassword);
            });
            
            Console.WriteLine($"HTTPS configuration successful, using certificate: {certPath}");
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"HTTPS configuration failed: {ex.Message}");
        }
    });
});

// Later in the application pipeline
// Use HTTPS redirection
app.UseHttpsRedirection();
```

2. **Frontend HTTPS Configuration**:

```typescript
// NeuroMotion_Front/vite.config.ts
export default defineConfig({
  // ...
  server: {
    port: 3000,
    host: 'localhost',
    
    // HTTPS configuration for secure local development
    https: {
      // Load PFX certificate (PKCS#12 format) from local filesystem
      pfx: fs.readFileSync('./certs/https.pfx'),
      // Password for the PFX certificate
      passphrase: 'password'
    },
    
    // Proxy API requests to the backend server
    proxy: {
      '/api': {
        // Forward requests to the backend HTTPS server
        target: 'https://localhost:5038',
        // Allow changing the Origin header to match the target
        changeOrigin: true,
        // Skip certificate validation for self-signed certificates in development
        secure: false,
      }
    }
  }
});
```

### Security Headers

The backend implements various security headers to prevent common attacks:

```csharp
// NeuroMotion API/Program.cs
// Add custom security headers middleware
app.Use(async (context, next) =>
{
    // Add security headers
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    context.Response.Headers["X-Frame-Options"] = "DENY";
    context.Response.Headers["X-XSS-Protection"] = "1; mode=block";
    context.Response.Headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
    context.Response.Headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()";
    
    // Add Strict-Transport-Security header (HSTS)
    if (!context.Request.IsHttps)
    {
        context.Response.Headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload";
    }
    
    await next();
});
```

These headers provide:
- **X-Content-Type-Options**: Prevents MIME type sniffing
- **X-Frame-Options**: Prevents clickjacking attacks
- **X-XSS-Protection**: Additional layer of XSS protection
- **Referrer-Policy**: Controls what information is sent in the Referer header
- **Permissions-Policy**: Restricts access to browser features
- **Strict-Transport-Security**: Forces browsers to use HTTPS

### CORS Settings

The application carefully configures CORS to allow only specific origins:

```csharp
// NeuroMotion API/Program.cs
// Add CORS
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowReactApp", policy =>
    {
        policy.WithOrigins(
                "http://localhost:3000",  // HTTP React port
                "https://localhost:3000", // HTTPS React port
                "http://localhost:5173",  // Default Vite port
                "https://localhost:5173", // HTTPS Vite port
                "http://localhost:5037",  // Custom port
                "https://localhost:5038"  // HTTPS custom port
            )
            .AllowAnyMethod()
            .AllowAnyHeader()
            .WithExposedHeaders(
                "X-Pagination", 
                "X-Total-Count",
                "x-request-id"
            )
            .SetIsOriginAllowedToAllowWildcardSubdomains()
            .AllowCredentials();
    });
});

// Enable CORS - must be before authorization middleware
app.UseCors("AllowReactApp");
```

## Frontend Security

### Content Security Policy

The frontend implements Content Security Policy (CSP) to prevent XSS and other injection attacks:

```typescript
// NeuroMotion_Front/src/main.tsx
// Only apply CSP in production mode
const isProduction = import.meta.env.PROD;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isProduction ? (
      <Helmet>
        <meta http-equiv="Content-Security-Policy" 
              content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://localhost:5037 https://neuromotion-api.example.com; form-action 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; block-all-mixed-content; upgrade-insecure-requests;" />
        <meta http-equiv="X-Content-Type-Options" content="nosniff" />
        <meta http-equiv="X-Frame-Options" content="DENY" />
        <meta http-equiv="X-XSS-Protection" content="1; mode=block" />
        <meta http-equiv="Referrer-Policy" content="strict-origin-when-cross-origin" />
        <meta http-equiv="Permissions-Policy" content="camera=(), microphone=(), geolocation=(), interest-cohort=()" />
      </Helmet>
    ) : (
      // Development environment CSP
      <Helmet>
        <meta http-equiv="Content-Security-Policy" 
              content="default-src 'self' localhost:*; script-src 'self' 'unsafe-inline' 'unsafe-eval' localhost:*; connect-src 'self' localhost:* ws://localhost:*; img-src 'self' data: blob: localhost:*; style-src 'self' 'unsafe-inline' localhost:* https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; frame-src 'self'; object-src 'none';" />
        <meta http-equiv="X-Content-Type-Options" content="nosniff" />
      </Helmet>
    )}
    <App />
  </React.StrictMode>
);
```

This CSP restricts:
- Where scripts can be loaded from (`script-src`)
- Where styles can be loaded from (`style-src`)
- Where images can be loaded from (`img-src`)
- Where connections can be made to (`connect-src`)
- Where forms can be submitted to (`form-action`)
- And more

### Secure Cookie Management

Cookies are secured with multiple protections:

```typescript
// NeuroMotion_Front/src/services/cookieService.ts
// Cookie configuration - Enhanced security settings
const cookieConfig = {
  secure: true,                 // Only send via HTTPS
  sameSite: 'strict' as const,  // Restrict third-party cookies
  expires: 1,                   // Reduced expiration to 1 day
  path: '/'                     // Available across the entire site
};

// Cookie names for auth data - More complex names to prevent guessing
const TOKEN_COOKIE_NAME = 'nm_auth_tkn';
const USER_COOKIE_NAME = 'nm_auth_usr';

const cookieService = {
  setToken(token: string): void {
    Cookies.set(TOKEN_COOKIE_NAME, token, cookieConfig);
  }
  
  // Additional obfuscation for user data
  setUser(user: User): void {
    // Convert user object to JSON string and encode in base64
    // Add simple XOR obfuscation algorithm, not just simple base64 encoding
    const userStr = JSON.stringify(user);
    const encodedUser = btoa(userStr.split('').map((c, i) => 
      String.fromCharCode(c.charCodeAt(0) ^ (i % 7 + 1))
    ).join(''));
    
    Cookies.set(USER_COOKIE_NAME, encodedUser, cookieConfig);
  }
}
```

These protections include:
- **Secure flag**: Ensures cookies are only sent over HTTPS
- **SameSite=strict**: Prevents cookies from being sent in cross-site requests
- **Short expiration**: Reduces the window of opportunity for attacks
- **Obfuscation**: Adds a layer of protection for sensitive data

### Session Management

The application implements session tracking and timeout:

```typescript
// NeuroMotion_Front/src/services/authService.ts
/**
 * Update activity timestamp
 */
updateActivityTimestamp: (): void => {
  sessionStorage.setItem('lastActivity', String(Date.now()));
},

/**
 * Check if session has timed out
 */
hasSessionTimedOut: (timeoutMinutes: number): boolean => {
  const lastActivity = sessionStorage.getItem('lastActivity');
  if (!lastActivity) return true;
  
  const lastActivityTime = parseInt(lastActivity, 10);
  const currentTime = Date.now();
  const timeoutMs = timeoutMinutes * 60 * 1000;
  
  return (currentTime - lastActivityTime) > timeoutMs;
}
```

## Backend Security

### Account Protection

The backend implements multiple protections against brute-force attacks:

```csharp
// NeuroMotion API/Controllers/UserController.cs
// Failed login attempt tracking
private static readonly ConcurrentDictionary<string, (int Count, DateTime LastAttempt)> _failedLoginAttempts = new();
private const int MAX_FAILED_ATTEMPTS = 5;
private static readonly TimeSpan LOCKOUT_DURATION = TimeSpan.FromMinutes(15);

// Within the Login method
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

// Record failed attempts
private void RecordFailedLoginAttempt(string clientId)
{
    _failedLoginAttempts.AddOrUpdate(
        clientId,
        (1, DateTime.UtcNow),
        (_, existing) => (existing.Count + 1, DateTime.UtcNow)
    );
}
```

This system:
- Tracks failed login attempts by IP + Email combination
- Locks accounts after 5 failed attempts
- Implements a 15-minute lockout period
- Prevents timing attacks by using constant-time comparisons

### API Security

The API endpoints are protected with authorization requirements:

```csharp
// Example of protected endpoint
[HttpGet("me")]
[Authorize]  // Requires valid JWT token
public async Task<IActionResult> GetCurrentUser()
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

    // Return user data
    return Ok(new { 
        id = user.Id, 
        name = user.Name, 
        email = user.Email, 
        role = user.Role.ToLower()
    });
}
```

### Error Handling

The application implements secure error handling to prevent information leakage:

```csharp
// NeuroMotion API/Program.cs
// Add global exception handler
app.UseExceptionHandler(appError =>
{
    appError.Run(async context =>
    {
        context.Response.StatusCode = StatusCodes.Status500InternalServerError;
        context.Response.ContentType = "application/json";
        
        var contextFeature = context.Features.Get<IExceptionHandlerFeature>();
        if (contextFeature != null)
        {
            // Log the error internally
            var logger = context.RequestServices.GetRequiredService<ILogger<Program>>();
            logger.LogError($"Something went wrong: {contextFeature.Error}");
            
            // Return sanitized error message to client
            await context.Response.WriteAsync(new
            {
                StatusCode = context.Response.StatusCode,
                Message = "An internal error occurred. Please try again later."
            }.ToString() ?? "");
        }
    });
});
```

This approach:
- Logs detailed errors server-side
- Returns sanitized error messages to clients
- Prevents information disclosure

## Security Best Practices

### Defense in Depth

The NeuroMotion project implements security at multiple layers:

1. **Network Layer**:
   - HTTPS everywhere
   - Strict CORS policies
   - Security headers

2. **Application Layer**:
   - JWT authentication
   - Role-based access control
   - Session management
   - Input validation
   - Content Security Policy

3. **Data Layer**:
   - AES-256-GCM encryption
   - BCrypt password hashing
   - Secure cookie storage
   - Data validation

### Key Management

1. **Backend Key Management**:
   - Uses environment variables for sensitive keys
   - Validates key lengths and formats
   - Implements key rotation capabilities

2. **Frontend Key Management**:
   - Fetches keys securely via HTTPS
   - Caches keys in session storage
   - Clears keys on logout
   - Never exposes keys to DOM or localStorage

### Logging and Monitoring

The application implements comprehensive logging for security events:

```csharp
// Example from UserController.cs
_logger.LogWarning($"Failed login attempt for user: {loginRequest.Email} from {ipAddress}");
_logger.LogInformation($"User logged in: {user.Email} ({user.Role}) from {ipAddress}");
```

Logged security events include:
- Failed login attempts
- Successful logins
- Token refreshes
- Account lockouts
- Decryption failures

These logs are essential for:
- Detecting attack attempts
- Investigating security incidents
- Compliance reporting
- Continuous security improvement 