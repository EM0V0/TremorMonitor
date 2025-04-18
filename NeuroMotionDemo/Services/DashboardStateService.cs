using System.Text.Json;

namespace NeuroMotionDemo.Services
{
    public class DashboardStateService
    {
        public Dictionary<string, Dictionary<string, object>> SensorData { get; private set; }
            = new Dictionary<string, Dictionary<string, object>>();

        public DashboardStateService()
        {
            OnDataUpdate = delegate { };
        }

        public event Action OnDataUpdate;

        public void UpdateSensorData(string topic, Dictionary<string, object> data)
        {
            // Extract sensor name from topic (e.g., "parkinsons/tremor/left_hand" -> "left_hand")
            var sensorName = topic.Split('/').LastOrDefault() ?? "unknown";

            SensorData[sensorName] = data;
            Console.WriteLine($"Updated data for sensor: {sensorName}");

            // Notify UI components that data has been updated
            OnDataUpdate.Invoke();
        }
    }
}
