using System;
using System.Collections.Generic;
using System.Linq;
using NeuroMotionDemo.Models;
using System.Text.Json;

namespace NeuroMotionDemo.Services
{
    public class TrendDataService
    {
        private readonly Dictionary<string, List<TrendDataPoint>> _trendData = new();
        private readonly TimeSpan _dataRetentionPeriod = TimeSpan.FromSeconds(30);

        public event Action? OnDataUpdate;

        public TrendDataService()
        {
            OnDataUpdate = delegate { };
        }

        public void AddDataPoint(string sensorName, string parameter, double value)
        {
            var key = $"{sensorName}_{parameter}";
            if (!_trendData.ContainsKey(key))
            {
                _trendData[key] = new List<TrendDataPoint>();
            }

            // Add new data point with current time
            _trendData[key].Add(new TrendDataPoint
            {
                Timestamp = DateTime.Now,
                Value = value,
                SensorName = sensorName,
                ParameterName = parameter
            });

            // Remove data older than 30 seconds
            var cutoffTime = DateTime.Now.Subtract(_dataRetentionPeriod);
            _trendData[key] = _trendData[key].Where(p => p.Timestamp >= cutoffTime).ToList();

            // Notify listeners that data has changed
            OnDataUpdate?.Invoke();
        }

        public void ProcessMqttData(Dictionary<string, object> data, string sensorName)
        {
            try
            {
                Console.WriteLine($"Processing MQTT data for sensor: {sensorName}");

                // Check for the location field
                string location = sensorName;
                if (data.TryGetValue("location", out var locationObj) && locationObj is JsonElement locationElement)
                {
                    location = locationElement.GetString() ?? sensorName;
                }

                if (data.TryGetValue("features", out var featuresObj) &&
                    featuresObj is JsonElement featuresElement)
                {
                    var features = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(
                        featuresElement.GetRawText());

                    if (features != null)
                    {
                        // Process each axis (x, y, z) or directly process "torso" if that's how data is structured
                        if (features.TryGetValue("torso", out var torsoElement))
                        {
                            var torso = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(
                                torsoElement.GetRawText());

                            if (torso != null)
                            {
                                // Process X, Y, Z axes from torso data
                                foreach (var axis in new[] { "x", "y", "z" })
                                {
                                    if (torso.TryGetValue(axis, out var axisElement))
                                    {
                                        var axisData = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(
                                            axisElement.GetRawText());

                                        if (axisData != null)
                                        {
                                            // Extract each parameter
                                            foreach (var param in new[] { "rms", "dominant_freq", "tremor_power", "tremor_index" })
                                            {
                                                if (axisData.TryGetValue(param, out var valueElement) &&
                                                    valueElement.TryGetDouble(out double value))
                                                {
                                                    AddDataPoint($"{location}_{axis}", param, value);
                                                    Console.WriteLine($"Added trend point: {location}_{axis} - {param} = {value}");
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        else
                        {
                            // Process direct axes if not using "torso" structure
                            foreach (var axis in new[] { "x", "y", "z", "magnitude" })
                            {
                                if (features.TryGetValue(axis, out var axisElement))
                                {
                                    var axisData = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(
                                        axisElement.GetRawText());

                                    if (axisData != null)
                                    {
                                        // Extract each parameter
                                        foreach (var param in new[] { "rms", "dominant_freq", "tremor_power", "tremor_index" })
                                        {
                                            if (axisData.TryGetValue(param, out var valueElement) &&
                                                valueElement.TryGetDouble(out double value))
                                            {
                                                AddDataPoint($"{location}_{axis}", param, value);
                                                Console.WriteLine($"Added trend point: {location}_{axis} - {param} = {value}");
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error processing data for trend: {ex.Message}");
            }
        }

        public List<TrendDataPoint> GetTrendData(string sensorName, string parameter)
        {
            var key = $"{sensorName}_{parameter}";
            return _trendData.TryGetValue(key, out var data) ? data.ToList() : new List<TrendDataPoint>();
        }

        public List<string> GetAvailableParameters()
        {
            var parameters = new HashSet<string>();
            foreach (var series in _trendData.Values)
            {
                foreach (var point in series)
                {
                    parameters.Add(point.ParameterName);
                }
            }
            return parameters.ToList();
        }

        public List<string> GetAvailableSensors()
        {
            var sensors = new HashSet<string>();
            foreach (var series in _trendData.Values)
            {
                foreach (var point in series)
                {
                    sensors.Add(point.SensorName);
                }
            }
            return sensors.ToList();
        }

        public void ForceUpdate()
        {
            // Trigger UI refresh even if no new data
            OnDataUpdate?.Invoke();
        }
    }
}
