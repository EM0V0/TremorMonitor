using System;

namespace NeuroMotion
{
    class Program
    {
        static async Task Main(string[] args)
        {
            // Replace with the IP address of your Raspberry Pi or MQTT broker
            string raspberryIP = "192.168.1.50";

            var mqttClient = new MQTTClient(raspberryIP);

            Console.WriteLine("Connecting to MQTT broker...");
            await mqttClient.ConnectAndSubscribeAsync();

            Console.WriteLine("Listening for sensor data...");
            Console.WriteLine("Press Enter to exit.");
            Console.ReadLine();

            Console.WriteLine("Hello World!");
            MySQLHelper helper = new MySQLHelper();
            helper.Close();
        }
    }
}