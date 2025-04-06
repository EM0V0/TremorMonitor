using System;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using MQTTnet;

namespace NeuroMotion
{
    public  class MQTTClient
    {
        private IMqttClient _client;
        private string _raspberryIP;

        public MQTTClient(string raspberryIP)
        {
            _raspberryIP = raspberryIP;
        }

        public async Task ConnectAndSubscribeAsync()
        {
            var factory = new MQTTnet.MqttClientFactory();
            _client = factory.CreateMqttClient();

            var options = new MqttClientOptionsBuilder()
                .WithTcpServer(_raspberryIP)
                .Build();

            _client.ConnectedAsync += async e =>
            {
                Console.WriteLine("Connected to raspberry pi");
                await _client.SubscribeAsync("sensors/darkside");
                Console.WriteLine("Subscribed to sensors/neuromotion.");
            };

            _client.ApplicationMessageReceivedAsync += e =>
            {
                var payload = Encoding.UTF8.GetString(e.ApplicationMessage.Payload);
                try
                {
                    var json = JsonDocument.Parse(payload);
                    double data1 = json.RootElement.GetProperty("data1").GetDouble();
                    double data2 = json.RootElement.GetProperty("data2").GetDouble();
                    Console.WriteLine($"Data 1: {data1} | Data 2: {data1}");
                }
                catch
                {
                    Console.WriteLine($"Invalid payload: {payload}");
                }

                return Task.CompletedTask;
            };

            await _client.ConnectAsync(options);
        }
    }
}
