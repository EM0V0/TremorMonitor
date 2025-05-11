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
    public async Task<IActionResult> GetSensorData(int userId)
    {
        try
        {
            var sensorData = await _context.SensorData
                .AsNoTracking()
                .Where(sd => sd.UserID == userId)
                .OrderByDescending(sd => sd.CreatedAt)
                .Take(100)
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
    public IActionResult GetSimulatedSensorData()
    {
        try
        {
            var simulatedData = GenerateSimulatedSensorData();
            return Ok(simulatedData);
        }
        catch (Exception ex)
        {
            _logger.LogError($"Error generating simulated sensor data: {ex.Message}");
            return StatusCode(500, new { message = "An error occurred while generating simulated sensor data." });
        }
    }

    // Helper function to generate 50 simulated SensorData values
    private List<SensorData> GenerateSimulatedSensorData()
    {
        var random = new Random();
        var simulatedData = new List<SensorData>();

        for (int i = 0; i < 50; i++)
        {
            simulatedData.Add(new SensorData
            {
                UserID = 1,
                TremorPower = (float)(random.NextDouble() * 100), 
                TremorIndex = (float)(random.NextDouble() * 1000),
                CreatedAt = DateTime.UtcNow.AddSeconds(-i) // Simulate timestamps within the last 50 seconds
            });
        }

        return simulatedData;
    }
}
