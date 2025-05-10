using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using NeuroMotion_API; // replace with the actual namespace for ApplicationDbContext
using NeuroMotion_API.Services;
using System.Text;
using Microsoft.AspNetCore.Diagnostics;
using System.Security.Cryptography.X509Certificates;

var builder = WebApplication.CreateBuilder(args);

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
            // Will not block application startup, but HTTPS may be unavailable
        }
    });
});

// Register GcmCryptoService for AES-GCM encryption
builder.Services.AddSingleton<GcmCryptoService>();

// Add DbContext with connection string
builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseMySql(
        builder.Configuration.GetConnectionString("RDSConnectionString"),
        ServerVersion.AutoDetect(builder.Configuration.GetConnectionString("RDSConnectionString"))
    ));

// Configure JWT service
builder.Services.AddSingleton(provider => 
{
    var configuration = provider.GetRequiredService<IConfiguration>();
    
    // 添加默认值防止null引用
    var secretKey = configuration["Jwt:SecretKey"] ?? "DefaultSecretKeyForDevelopmentOnly-PleaseChangeInProduction";
    var issuer = configuration["Jwt:Issuer"] ?? "NeuroMotion";
    var audience = configuration["Jwt:Audience"] ?? "NeuroMotionClients";
    
    // 确保expirationMinutes有一个默认值
    var expirationMinutesStr = configuration["Jwt:ExpirationMinutes"] ?? "60";
    var expirationMinutes = int.Parse(expirationMinutesStr);
    
    return new JwtService(secretKey, issuer, audience, expirationMinutes);
});

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

// Add CSRF protection
builder.Services.AddAntiforgery(options => 
{
    options.HeaderName = "X-CSRF-TOKEN";
    options.SuppressXFrameOptionsHeader = false;
    options.Cookie.Name = "CSRF-TOKEN";
    options.Cookie.HttpOnly = true;
    options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
    options.Cookie.SameSite = SameSiteMode.Strict;
});

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
    
    // Add detailed error information in development
    app.UseDeveloperExceptionPage();
}

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

// Use HTTPS redirection
app.UseHttpsRedirection();

// Enable CORS - must be before authorization middleware
app.UseCors("AllowReactApp");

// Add authentication middleware
app.UseAuthentication();
app.UseAuthorization();

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

app.MapControllers();

// Print startup information
app.Lifetime.ApplicationStarted.Register(() =>
{
    var urls = app.Urls;
    Console.ForegroundColor = ConsoleColor.Green;
    Console.WriteLine("Server started successfully!");
    Console.WriteLine($"Listening on: {string.Join(", ", urls)}");
    Console.ResetColor();
    Console.WriteLine("Press Ctrl+C to shut down.");
});

app.Run();
