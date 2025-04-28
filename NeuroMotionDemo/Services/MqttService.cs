using MQTTnet;
using MQTTnet.Client;
using System.Text;
using System.Text.Json;
using System.Security.Cryptography.X509Certificates;
using System.Security.Authentication;

namespace NeuroMotionDemo.Services
{
    public class MqttService : IDisposable
    {
        private IMqttClient? _mqttClient;
        private bool _disposed = false;
        private string _brokerHost = "";
        private int _brokerPort = 8883;

        // Track subscribers for reconnection
        private List<EventHandler<SensorDataEventArgs>> _subscribers = new();

        // Private backing field for the event
        private event EventHandler<SensorDataEventArgs>? _dataReceived;

        public MqttService()
        {
            // No need to initialize here since we're using the backing field
        }

        // Public event with custom add/remove
        public event EventHandler<SensorDataEventArgs> DataReceived
        {
            add
            {
                // Store subscribers to reconnect them if needed
                if (!_subscribers.Contains(value))
                {
                    _subscribers.Add(value);
                }
                _dataReceived += value;
            }
            remove
            {
                _subscribers.Remove(value);
                _dataReceived -= value;
            }
        }

        // Used when navigating between pages to restore event handlers
        public void ReconnectEventHandlers()
        {
            _dataReceived = null; // Clear current handlers
            foreach (var handler in _subscribers)
            {
                _dataReceived += handler;
            }
        }

        // Track connection state
        public bool IsConnected => _mqttClient?.IsConnected ?? false;

        public async Task ConnectAsync(string brokerHost, int brokerPort = 8883)
        {
            // Store connection parameters for reconnecting if needed
            _brokerHost = brokerHost;
            _brokerPort = brokerPort;

            try
            {
                Console.WriteLine($"Connecting to MQTT broker at {brokerHost}:{brokerPort}");

                // Create a new client if needed
                if (_mqttClient == null || _mqttClient.IsConnected == false)
                {
                    var factory = new MqttFactory();
                    _mqttClient = factory.CreateMqttClient();

                    // Set up reconnection handler
                    _mqttClient.DisconnectedAsync += async (e) =>
                    {
                        Console.WriteLine("MQTT client disconnected. Attempting to reconnect...");
                        await Task.Delay(TimeSpan.FromSeconds(5));
                        try
                        {
                            await ConnectClientAsync();
                        }
                        catch (Exception ex)
                        {
                            Console.WriteLine($"Reconnection failed: {ex.Message}");
                        }
                    };
                }

                await ConnectClientAsync();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"MQTT connection error: {ex.Message}");
                throw;
            }
        }

        private async Task ConnectClientAsync()
        {
            try
            {
                // Define certificate paths
                string caCertPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "certs", "mosquitto-ca.crt");
                string clientPfxPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "certs", "dashboard-client.pfx");

                // Check if certificate files exist
                if (!File.Exists(caCertPath))
                {
                    Console.WriteLine($"CA certificate not found at: {caCertPath}");
                    throw new FileNotFoundException("CA certificate not found", caCertPath);
                }

                if (!File.Exists(clientPfxPath))
                {
                    Console.WriteLine($"Client PFX certificate not found at: {clientPfxPath}");
                    throw new FileNotFoundException("Client PFX certificate not found", clientPfxPath);
                }

                Console.WriteLine("Loading certificates...");

                // Load the CA certificate
                var caCert = new X509Certificate2(caCertPath);

                // Load the client certificate from PFX with private key
                var clientCert = new X509Certificate2(
                    clientPfxPath,
                    "d4r361de",  // Password used when creating the PFX
                    X509KeyStorageFlags.Exportable | X509KeyStorageFlags.MachineKeySet | X509KeyStorageFlags.PersistKeySet
                );

                Console.WriteLine($"Loaded client certificate: {clientCert.Subject}");

                // Create certificate collection
                var clientCertificates = new List<X509Certificate>() { clientCert };

                // Get credentials from environment variables or use defaults
                string username = Environment.GetEnvironmentVariable("MQTT_USERNAME") ?? "mqttuser";
                string password = Environment.GetEnvironmentVariable("MQTT_PASSWORD") ?? "d4r361de";

                var options = new MqttClientOptionsBuilder()
                    .WithClientId($"NeuroMotionDemo_{Guid.NewGuid()}")
                    .WithTcpServer(_brokerHost, _brokerPort) // Using hostname instead of IP
                    .WithCredentials(username, password)
                    .WithTls(new MqttClientOptionsBuilderTlsParameters
                    {
                        UseTls = true,
                        SslProtocol = SslProtocols.Tls13,
                        Certificates = clientCertificates,
                        // For Tailscale, we need to handle the hostname validation
                        CertificateValidationHandler = (certContext) =>
                        {
                            try
                            {
                                if (certContext.Certificate == null)
                                {
                                    Console.WriteLine("Server did not provide a certificate");
                                    return false;
                                }

                                // Validate server certificate against our CA
                                var chain = new X509Chain();
                                chain.ChainPolicy.RevocationMode = X509RevocationMode.NoCheck;
                                chain.ChainPolicy.VerificationFlags = X509VerificationFlags.NoFlag;
                                // These two lines are critical for custom CA certificates
                                chain.ChainPolicy.CustomTrustStore.Add(caCert);
                                chain.ChainPolicy.TrustMode = X509ChainTrustMode.CustomRootTrust;

                                var serverCert = new X509Certificate2(certContext.Certificate);

                                // Log certificate details for debugging
                                Console.WriteLine($"Server certificate subject: {serverCert.Subject}");
                                Console.WriteLine($"Server certificate issuer: {serverCert.Issuer}");

                                var isValid = chain.Build(serverCert);

                                if (!isValid)
                                {
                                    Console.WriteLine("Certificate validation failed");
                                    foreach (var status in chain.ChainStatus)
                                    {
                                        Console.WriteLine($"Chain error: {status.StatusInformation}");
                                    }

                                    // For Tailscale testing, you might want to return true even with validation issues
                                    // But in production, this should return false for security
                                    return false;
                                }

                                // Check if certificate is valid for the hostname
                                // This is important when using Tailscale DNS names
                                if (_brokerHost.EndsWith(".ts.net"))
                                {
                                    Console.WriteLine($"Validating certificate for Tailscale host: {_brokerHost}");
                                    // For Tailscale, we might need more flexible hostname validation
                                }

                                Console.WriteLine("Server certificate validated successfully");
                                return true;
                            }
                            catch (Exception ex)
                            {
                                Console.WriteLine($"Certificate validation error: {ex.Message}");
                                return false;
                            }
                        }
                    })
                    .WithCleanSession()
                    .Build();

                Console.WriteLine($"Connecting to MQTT broker at {_brokerHost}:{_brokerPort}");
                await _mqttClient!.ConnectAsync(options, CancellationToken.None);
                Console.WriteLine("Connected to MQTT broker successfully");

                // Subscribe to topics after successful connection
                var subscribeOptions = new MqttClientSubscribeOptionsBuilder()
                    .WithTopicFilter(builder => builder.WithTopic("parkinsons/tremor/#").WithQualityOfServiceLevel(MQTTnet.Protocol.MqttQualityOfServiceLevel.AtLeastOnce))
                    .Build();

                await _mqttClient.SubscribeAsync(subscribeOptions, CancellationToken.None);
                Console.WriteLine("Subscribed to parkinsons/tremor/#");

                // Register message handler only once
                _mqttClient.ApplicationMessageReceivedAsync += HandleMessageReceived;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"MQTT connection error: {ex.Message}");
                if (ex.InnerException != null)
                {
                    Console.WriteLine($"Inner exception: {ex.InnerException.Message}");
                }
                throw;
            }
        }

        // Only one implementation of HandleMessageReceived
        private Task HandleMessageReceived(MqttApplicationMessageReceivedEventArgs e)
        {
            try
            {
                var payload = Encoding.UTF8.GetString(e.ApplicationMessage.PayloadSegment);
                var topic = e.ApplicationMessage.Topic;

                Console.WriteLine($"Payload content: {payload.Substring(0, Math.Min(100, payload.Length))}...");

                if (string.IsNullOrEmpty(payload)) return Task.CompletedTask;

                var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                var data = JsonSerializer.Deserialize<Dictionary<string, object>>(payload, options);
                Console.WriteLine($"Deserialized {data?.Count ?? 0} data items");


                if (data != null)
                {
                    // Use the backing field with null check
                    _dataReceived?.Invoke(this, new SensorDataEventArgs
                    {
                        Topic = topic,
                        Data = data
                    });
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error processing message: {ex.Message}");


            }

            return Task.CompletedTask;
        }

        public void Dispose()
        {
            if (!_disposed)
            {
                _mqttClient?.Dispose();
                _disposed = true;
            }
        }
    }

    public class SensorDataEventArgs : EventArgs
    {
        public required string Topic { get; set; }
        public required Dictionary<string, object> Data { get; set; }
    }
}
