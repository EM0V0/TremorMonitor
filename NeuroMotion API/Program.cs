using Microsoft.EntityFrameworkCore;
using NeuroMotion; // replace with the actual namespace for ApplicationDbContext

var builder = WebApplication.CreateBuilder(args);

// Add DbContext with connection string
builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseMySql(
        builder.Configuration.GetConnectionString("RDSConnectionString"),
        ServerVersion.AutoDetect(builder.Configuration.GetConnectionString("RDSConnectionString"))
    ));

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();
app.UseAuthorization();
app.MapControllers();
app.Run();
