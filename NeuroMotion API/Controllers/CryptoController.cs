using Microsoft.AspNetCore.Mvc;
using NeuroMotion_API.Services;

namespace NeuroMotion_API.Controllers
{
    /// <summary>
    /// Controller for cryptographic key management - for development use only
    /// </summary>
    [ApiController]
    [Route("api/crypto")]
    public class CryptoController : ControllerBase
    {
        private readonly GcmCryptoService _cryptoService;
        private readonly ILogger<CryptoController> _logger;
        private readonly IHostEnvironment _environment;

        public CryptoController(
            GcmCryptoService cryptoService, 
            ILogger<CryptoController> logger,
            IHostEnvironment environment)
        {
            _cryptoService = cryptoService;
            _logger = logger;
            _environment = environment;
        }

        /// <summary>
        /// Gets the encryption key - for development use only
        /// NOTE: This endpoint should be removed in production
        /// </summary>
        /// <returns>Base64-encoded encryption key</returns>
        [HttpGet("key")]
        public IActionResult GetCryptoKey()
        {
            if (_environment.IsProduction())
            {
                _logger.LogWarning("Attempt to access encryption key in production environment");
                return NotFound("This endpoint is not available in production");
            }

            try
            {
                // Retrieve and return Base64-encoded key
                string base64Key = _cryptoService.GetBase64Key();
                return Ok(new { key = base64Key });
            }
            catch (Exception ex)
            {
                _logger.LogError($"Error retrieving crypto key: {ex.Message}");
                return StatusCode(500, new { message = "Error retrieving crypto key" });
            }
        }
    }
} 