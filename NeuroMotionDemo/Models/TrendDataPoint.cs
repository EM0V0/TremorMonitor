// Models/TrendDataPoint.cs
namespace NeuroMotionDemo.Models
{
    public class TrendDataPoint
    {
        public DateTime Timestamp { get; set; }
        public double Value { get; set; }
        public string SensorName { get; set; } = string.Empty;
        public string ParameterName { get; set; } = string.Empty;
    }
}

