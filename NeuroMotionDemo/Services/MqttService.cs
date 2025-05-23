﻿using System;
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
        private Func<MqttClientDisconnectedEventArgs, Task>? _reconnectHandler;


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

            // Unhook old handler if present
            if (_mqttClient != null && _reconnectHandler != null)
                _mqttClient.DisconnectedAsync -= _reconnectHandler;

            // Create new client
            var factory = new MqttFactory();
            _mqttClient = factory.CreateMqttClient();

            // Define and hook reconnect
            _reconnectHandler = async args =>
            {
                Console.WriteLine("MQTT disconnected—waiting 5s to reconnect.");
                await Task.Delay(TimeSpan.FromSeconds(5));
                await ConnectAsync();
            };
            _mqttClient.DisconnectedAsync += _reconnectHandler;

            // Now do the actual connect+subscribe
            await ConnectClientAsync();
        }

        public async Task DisconnectAsync()
        {
            if (_mqttClient?.IsConnected == true)
            {
                // remove our auto-reconnect handler
                if (_reconnectHandler != null)
                {
                    _mqttClient.DisconnectedAsync -= _reconnectHandler;
                    _reconnectHandler = null;
                }

                await _mqttClient.DisconnectAsync();
                _mqttClient.Dispose();
                _mqttClient = null;
            }
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
                

                string buildquery = @"
                    CREATE TABLE IF NOT EXISTS SensorData (
                        UserID      INT          NOT NULL,
                        TremorPower FLOAT          NOT NULL,
                        TremorIndex FLOAT          NOT NULL,
                        CreatedAt   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB;
                    ";

                using var buildcommand = new MySqlCommand(buildquery, connection);
                buildcommand.ExecuteNonQuery();


                // Example: Insert data into a table named "SensorData"
                var query = @"
                        INSERT INTO SensorData (UserID, TremorPower, TremorIndex, CreatedAt)
                        VALUES (@UserID, @TremorPower, @TremorIndex, @CreatedAt)";

                using var command = new MySqlCommand(query, connection);

                // now you can index into it
                // var tremorPower = JsonSerializer.Deserialize<Dictionary<string, object>>(data["features"].).Dictionary["tremor_power"];

                var torsox = float.Parse(data["torso_x_tremor_index"].ToString());
                var torsoy = float.Parse(data["torso_y_tremor_index"].ToString());
                var torsoz = float.Parse(data["torso_z_tremor_index"].ToString());
                float tremorindex = (torsox + torsoy + torsoz)/3;

                var torsopx = float.Parse(data["torso_x_tremor_power"].ToString());
                var torsopy = float.Parse(data["torso_y_tremor_power"].ToString());
                var torsopz = float.Parse(data["torso_z_tremor_power"].ToString());
                var tremorpower = (torsopx + torsopy + torsopz) / 3;

                // Map data to parameters
                command.Parameters.AddWithValue("@UserID", 1);
                command.Parameters.AddWithValue("@TremorPower", tremorpower);
                command.Parameters.AddWithValue("@TremorIndex", tremorindex);
                command.Parameters.AddWithValue("@CreatedAt", DateTime.UtcNow);

                await command.ExecuteNonQueryAsync();
                connection.Close();
                await Task.Delay(1000); // 1 second
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
