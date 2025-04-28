using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using NeuroMotion; // replace with the actual namespace for ApplicationDbContext
using NeuroMotion_API.Services;
using System.Text;
using Microsoft.AspNetCore.Diagnostics;

var builder = WebApplication.CreateBuilder(args);

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
    var secretKey = configuration["Jwt:SecretKey"];
    var issuer = configuration["Jwt:Issuer"];
    var audience = configuration["Jwt:Audience"];
    var expirationMinutes = int.Parse(configuration["Jwt:ExpirationMinutes"]);
    
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
        ValidIssuer = builder.Configuration["Jwt:Issuer"],
        ValidAudience = builder.Configuration["Jwt:Audience"],
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(builder.Configuration["Jwt:SecretKey"]))
    };
});

// Add CORS
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowReactApp", policy =>
    {
        policy.WithOrigins(
                "http://localhost:3000",  // Default React port
                "http://localhost:5173",  // Default Vite port
                "http://localhost:5037"   // Custom port
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
    context.Response.Headers.Add("X-Content-Type-Options", "nosniff");
    context.Response.Headers.Add("X-Frame-Options", "DENY");
    context.Response.Headers.Add("X-XSS-Protection", "1; mode=block");
    context.Response.Headers.Add("Referrer-Policy", "strict-origin-when-cross-origin");
    context.Response.Headers.Add("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    
    // Add Strict-Transport-Security header (HSTS)
    if (!context.Request.IsHttps)
    {
        context.Response.Headers.Add("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
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
