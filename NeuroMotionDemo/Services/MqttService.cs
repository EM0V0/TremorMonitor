using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Authentication;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Options;
using MQTTnet;
using MQTTnet.Client;
using MQTTnet.Protocol;
using NeuroMotionDemo.Models;
using MySql.Data.MySqlClient;
using System.Configuration;

namespace NeuroMotionDemo.Services
{
    public class MqttService : IDisposable
    {
        private readonly MqttConfig _config;
        private readonly string _rdsConnectionString;
        private IMqttClient? _mqttClient;
        private bool _disposed;
        private string _brokerHost = "";
        private int _brokerPort = 8883;


        // Persist subscribers for reconnect
        private readonly List<EventHandler<SensorDataEventArgs>> _subscribers = new();
        private event EventHandler<SensorDataEventArgs>? _dataReceived;

        public event EventHandler<SensorDataEventArgs> DataReceived
        {
            add
            {
                if (!_subscribers.Contains(value))
                    _subscribers.Add(value);
                _dataReceived += value;
            }
            remove
            {
                _subscribers.Remove(value);
                _dataReceived -= value;
            }
        }

        public bool IsConnected => _mqttClient?.IsConnected ?? false;

        public MqttService(IOptions<MqttConfig> config)
        {
            _config = config.Value;

            _rdsConnectionString = "server=darkside-0.cfe6qu6mkp7w.us-east-2.rds.amazonaws.com;port=3306;user=admin;password=YpbATp9vLstRgwuS5oA0;database=neuromotion;CharSet=utf8mb4;";


        }

        /// <summary>
        /// Re-attach saved event handlers after reconnect
        /// </summary>
        public void ReconnectEventHandlers()
        {
            _dataReceived = null;
            foreach (var handler in _subscribers)
                _dataReceived += handler;
        }

        /// <summary>
        /// Entry point to connect (or reconnect) to broker
        /// </summary>
        public async Task ConnectAsync(string? brokerHost = null, int? brokerPort = null)
        {
            _brokerHost = brokerHost ?? _config.DefaultBrokerHost;
            _brokerPort = brokerPort ?? _config.DefaultBrokerPort;

            if (_mqttClient == null || !_mqttClient.IsConnected)
            {
                var factory = new MqttFactory();
                _mqttClient = factory.CreateMqttClient();

                // auto-reconnect on disconnect
                _mqttClient.DisconnectedAsync += async _ =>
                {
                    Console.WriteLine("MQTT disconnected—waiting 5s to reconnect...");
                    await Task.Delay(TimeSpan.FromSeconds(5));
                    await ConnectClientAsync();
                };
            }

            await ConnectClientAsync();
        }

        /// <summary>
        /// Builds TLS options, credentials, subscribes & registers handlers
        /// </summary>
        private async Task ConnectClientAsync()
        {
            // resolve cert paths
            var baseDir = AppDomain.CurrentDomain.BaseDirectory;
            var caPath = Path.Combine(baseDir, _config.Certificates.CaCertPath);
            var pfxPath = Path.Combine(baseDir, _config.Certificates.ClientCertPath);

            if (!File.Exists(caPath))
                throw new FileNotFoundException("CA certificate missing", caPath);
            if (!File.Exists(pfxPath))
                throw new FileNotFoundException("Client PFX missing", pfxPath);

            // load CA & client certs
            var caCert = new X509Certificate2(caPath);
            var pfxPwd = _config.Certificates.ClientCertPassword
                         ?? throw new InvalidOperationException("ClientCertPassword not set");
            var clientCert = new X509Certificate2(
                pfxPath, pfxPwd,
                X509KeyStorageFlags.Exportable | X509KeyStorageFlags.MachineKeySet);

            // credentials
            var user = _config.Credentials.Username
                       ?? throw new InvalidOperationException("MQTT username not set");
            var pass = _config.Credentials.Password
                       ?? throw new InvalidOperationException("MQTT password not set");

            // TLS parameters with custom CA trust
            var tlsParams = new MqttClientOptionsBuilderTlsParameters
            {
                UseTls = true,
                SslProtocol = SslProtocols.Tls13,
                Certificates = new[] { clientCert },
                CertificateValidationHandler = ctx =>
                {
                    var chain = new X509Chain
                    {
                        ChainPolicy =
                        {
                            RevocationMode    = X509RevocationMode.NoCheck,
                            VerificationFlags = X509VerificationFlags.NoFlag,
                            CustomTrustStore  = { caCert },
                            TrustMode         = X509ChainTrustMode.CustomRootTrust
                        }
                    };
                    var server = new X509Certificate2(ctx.Certificate!);
                    if (!chain.Build(server))
                    {
                        foreach (var s in chain.ChainStatus)
                            Console.WriteLine($"Chain error: {s.StatusInformation}");
                        return false;
                    }
                    return true;
                }
            };

            // build client options
            var options = new MqttClientOptionsBuilder()
                .WithClientId($"NeuroMotion_{Guid.NewGuid()}")
                .WithTcpServer(_brokerHost, _brokerPort)
                .WithCredentials(user, pass)
                .WithTls(tlsParams)
                .WithCleanSession()
                .Build();

            Console.WriteLine($"Connecting to {_brokerHost}:{_brokerPort}...");
            await _mqttClient!.ConnectAsync(options, CancellationToken.None);
            Console.WriteLine("MQTT connected.");

            // subscribe
            var topicFilter = new MqttTopicFilterBuilder()
                .WithTopic("parkinsons/tremor/#")
                .WithQualityOfServiceLevel(MqttQualityOfServiceLevel.AtLeastOnce)
                .Build();

            await _mqttClient.SubscribeAsync(topicFilter, CancellationToken.None);
            Console.WriteLine("Subscribed to parkinsons/tremor/#");

            // ensure single handler
            _mqttClient.ApplicationMessageReceivedAsync -= HandleMessageReceived;
            _mqttClient.ApplicationMessageReceivedAsync += HandleMessageReceived;
        }

        /// <summary>
        /// Parses JSON payload and raises DataReceived
        /// </summary>
        private Task HandleMessageReceived(MqttApplicationMessageReceivedEventArgs e)
        {
            try
            {
                var payload = Encoding.UTF8.GetString(e.ApplicationMessage.PayloadSegment);
                if (string.IsNullOrWhiteSpace(payload))
                    return Task.CompletedTask;

                var data = JsonSerializer.Deserialize<Dictionary<string, object>>(
                    payload,
                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true }
                );

                if (data != null)
                {
                    _dataReceived?.Invoke(this, new SensorDataEventArgs
                    {
                        Topic = e.ApplicationMessage.Topic,
                        Data = data
                    });

                    SendDataToRdsAsync(data);
                }                    
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error handling message: {ex.Message}");
            }

            return Task.CompletedTask;
        }

        /// <summary>
        /// Sends parsed MQTT data to the RDS database
        /// </summary>
        private async Task SendDataToRdsAsync(Dictionary<string, object> data)
        {
            try
            {
                using var connection = new MySqlConnection(_rdsConnectionString);
                await connection.OpenAsync();

                // Example: Insert data into a table named "SensorData"
                var query = @"
                        INSERT INTO SensorData (UserID, TremorPower, TremorIndex, CurrentTime)
                        VALUES (@UserID, @TremorPower, @TremorIndex, @CurrentTime)";

                using var command = new MySqlCommand(query, connection);

                // Map data to parameters
                command.Parameters.AddWithValue("@UserID", data["UserID"]);
                command.Parameters.AddWithValue("@TremorPower", data["TremorPower"]);
                command.Parameters.AddWithValue("@TremorIndex", data["TremorIndex"]);
                command.Parameters.AddWithValue("@CurrentTime", DateTime.UtcNow);

                await command.ExecuteNonQueryAsync();
                Console.WriteLine("Data successfully inserted into RDS.");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error sending data to RDS: {ex.Message}");
            }
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
