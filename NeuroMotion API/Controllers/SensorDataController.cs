using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using NeuroMotion_API;
using Microsoft.Extensions.Logging;

[ApiController]
[Route("api/sensordata")]
public class SensorDataController : ControllerBase
{
    private readonly ApplicationDbContext _context;
    private readonly ILogger<SensorDataController> _logger;

    public SensorDataController(ApplicationDbContext context, ILogger<SensorDataController> logger)
    {
        _context = context;
        _logger = logger;
    }

    // POST: api/sensordata
    [HttpPost]
    public async Task<IActionResult> AddSensorData([FromBody] SensorData newSensorData)
    {
        try
        {
            // Validate the incoming data
            if (newSensorData == null)
            {
                return BadRequest(new { message = "Sensor data cannot be null." });
            }

            // Add the new SensorData to the database
            _context.SensorData.Add(newSensorData);
            await _context.SaveChangesAsync();

            // Return success response
            return CreatedAtAction(nameof(GetSensorData), new { userId = newSensorData.UserID }, new { message = "Sensor data added successfully." });
        }
        catch (Exception ex)
        {
            _logger.LogError($"Error adding sensor data: {ex.Message}");
            return StatusCode(500, new { message = "An error occurred while adding sensor data." });
        }
    }

    // GET: api/sensordata/{userId}
    [HttpGet("{userId}")]
    public async Task<IActionResult> GetSensorData(int userId, [FromQuery] int count = 100)
    {
        try
        {
            var sensorData = await _context.SensorData
                .Where(sd => sd.UserID == userId)
                .OrderByDescending(sd => sd.CreatedAt)
                .Take(count)
                .ToListAsync();

            if (sensorData == null || !sensorData.Any())
            {
                return NotFound(new { message = "No sensor data found for the specified user." });
            }

            return Ok(sensorData);
        }
        catch (Exception ex)
        {
            _logger.LogError($"Error retrieving sensor data for user {userId}: {ex.Message}");
            return StatusCode(500, new { message = "An error occurred while retrieving sensor data." });
        }
    }

    // GET: api/sensordata/simulated
    [HttpGet("simulated")]
    public IActionResult GetSimulatedSensorData([FromQuery] int count = 100)
    {
        try
        {
            var simulatedData = GenerateSimulatedSensorData(count);
            return Ok(simulatedData);
        }
        catch (Exception ex)
        {
            _logger.LogError($"Error generating simulated sensor data: {ex.Message}");
            return StatusCode(500, new { message = "An error occurred while generating simulated sensor data." });
        }
    }

    // Helper function to generate simulated SensorData values
    private List<SensorData> GenerateSimulatedSensorData(int count = 100)
    {
        var random = new Random();
        var simulatedData = new List<SensorData>();
        var baseValue = 50.0; // Start at midpoint
        var lastValue = baseValue;

        for (int i = 0; i < count; i++)
        {
            // Create more realistic tremor patterns
            // Small random walk with occasional spikes
            double change = (random.NextDouble() * 8) - 4; // Random change between -4 and +4
            
            // Occasionally add larger changes to simulate tremors
            if (random.NextDouble() < 0.2)
            {
                change = change * 2.5;
            }
            
            // Calculate new value with bounds checking
            double newValue = lastValue + change;
            newValue = Math.Max(0, Math.Min(100, newValue)); // Keep within 0-100 range
            lastValue = newValue;
            
            simulatedData.Add(new SensorData
            {
                UserID = 1,
                TremorPower = (float)newValue,
                TremorIndex = (float)(newValue * 10), // Make TremorIndex proportional to TremorPower
                CreatedAt = DateTime.UtcNow.AddSeconds(-i) // Simulate timestamps within the last 'count' seconds
            });
        }

        return simulatedData;
    }
}
