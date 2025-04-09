using MQTTnet;
using MQTTnet.Client;
using System.Text;
using System.Text.Json;

namespace NeuroMotionDemo.Services;

public class MqttService : IDisposable
{
    private IMqttClient? _mqttClient;
    private bool _disposed = false;

    // Initialize event in constructor
    public MqttService()
    {
        var factory = new MqttFactory();
        _mqttClient = factory.CreateMqttClient();
        DataReceived = delegate { };
    }

    public event EventHandler<SensorDataEventArgs> DataReceived;

    public async Task ConnectAsync(string brokerIp, int brokerPort = 1883)
    {
        try
        {
            Console.WriteLine($"Connecting to MQTT broker at {brokerIp}:{brokerPort}");

            var options = new MqttClientOptionsBuilder()
                .WithTcpServer(brokerIp, brokerPort)
                .WithClientId($"NeuroMotion_{Guid.NewGuid()}")
                .Build();

            await _mqttClient!.ConnectAsync(options);
            Console.WriteLine("Connected successfully to MQTT broker");

            // Subscribe to topics
            await _mqttClient.SubscribeAsync(new MqttTopicFilterBuilder()
                .WithTopic("parkinsons/tremor/#")
                .Build());
            Console.WriteLine("Subscribed to parkinsons/tremor/#");

            _mqttClient.ApplicationMessageReceivedAsync += HandleMessageReceived;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"MQTT connection error: {ex.Message}");
        }
    }

    private Task HandleMessageReceived(MqttApplicationMessageReceivedEventArgs e)
    {
        try
        {
            var payload = Encoding.UTF8.GetString(e.ApplicationMessage.PayloadSegment);
            var topic = e.ApplicationMessage.Topic;

            Console.WriteLine($"Received message on topic: {topic}");
            Console.WriteLine($"Payload: {payload}");

            if (string.IsNullOrEmpty(payload)) return Task.CompletedTask;

            var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
            var data = JsonSerializer.Deserialize<Dictionary<string, object>>(payload, options);

            if (data != null)
            {
                DataReceived.Invoke(this, new SensorDataEventArgs
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
