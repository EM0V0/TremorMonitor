using NeuroMotionDemo.Components;
using NeuroMotionDemo.Services;
using NeuroMotionDemo.Models;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Radzen;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container
builder.Services.AddRazorComponents()
    .AddInteractiveServerComponents();

// Configure MQTT options from appsettings.json
builder.Services
    .Configure<MqttConfig>(builder.Configuration.GetSection("MqttConfig"))
    .AddSingleton<MqttService>();


// Register our custom services
builder.Services.AddSingleton<DashboardStateService>();
builder.Services.AddSingleton<MqttService>();
builder.Services.AddSingleton<TrendDataService>();

// Add Radzen services
builder.Services.AddRadzenComponents();
builder.Services.AddScoped<DialogService>();
builder.Services.AddScoped<NotificationService>();
builder.Services.AddScoped<TooltipService>();
builder.Services.AddScoped<ContextMenuService>();

var app = builder.Build();

// Configure the HTTP request pipeline
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error");
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseStaticFiles();
app.UseAntiforgery();

app.MapRazorComponents<App>()
    .AddInteractiveServerRenderMode();
app.Run();
