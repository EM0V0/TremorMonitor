using MQTTnet;
using MQTTnet.Client;
using System.Text;
using System.Text.Json;

namespace NeuroMotionDemo.Services
{
    public class MqttService : IDisposable
    {
        private IMqttClient? _mqttClient;
        private bool _disposed = false;
        private string _brokerIp = "";
        private int _brokerPort = 1883;

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

        public async Task ConnectAsync(string brokerIp, int brokerPort = 1883)
        {
            // Store connection parameters for reconnecting if needed
            _brokerIp = brokerIp;
            _brokerPort = brokerPort;

            try
            {
                Console.WriteLine($"Connecting to MQTT broker at {brokerIp}:{brokerPort}");

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
            var options = new MqttClientOptionsBuilder()
                .WithClientId($"NeuroMotionDemo_{Guid.NewGuid()}")
                .WithTcpServer(_brokerIp, _brokerPort)
                .WithCleanSession()
                .Build();

            await _mqttClient!.ConnectAsync(options, CancellationToken.None);
            Console.WriteLine("Connected to MQTT broker successfully");

            // Subscribe to topics after successful connection
            var subscribeOptions = new MqttClientSubscribeOptionsBuilder()
                .WithTopicFilter(builder => builder.WithTopic("parkinsons/tremor/#"))
                .Build();

            await _mqttClient.SubscribeAsync(subscribeOptions, CancellationToken.None);
            Console.WriteLine("Subscribed to parkinsons/tremor/#");

            // Register message handler only once
            _mqttClient.ApplicationMessageReceivedAsync += HandleMessageReceived;
        }

        // Only one implementation of HandleMessageReceived
        private Task HandleMessageReceived(MqttApplicationMessageReceivedEventArgs e)
        {
            try
            {
                var payload = Encoding.UTF8.GetString(e.ApplicationMessage.PayloadSegment);
                var topic = e.ApplicationMessage.Topic;

                Console.WriteLine($"Received message on topic: {topic}");

                if (string.IsNullOrEmpty(payload)) return Task.CompletedTask;

                var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                var data = JsonSerializer.Deserialize<Dictionary<string, object>>(payload, options);

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
