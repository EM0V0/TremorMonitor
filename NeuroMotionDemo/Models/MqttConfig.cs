namespace NeuroMotionDemo.Models
{
    public class MqttConfig
    {
        public string DefaultBrokerHost { get; set; } = "";
        public int DefaultBrokerPort { get; set; } = 8883;
        public CredentialsConfig Credentials { get; set; } = new();
        public CertificatesConfig Certificates { get; set; } = new();

        public class CredentialsConfig
        {
            public string Username { get; set; } = "";
            public string Password { get; set; } = "";
        }

        public class CertificatesConfig
        {
            public string CaCertPath { get; set; } = "";
            public string ClientCertPath { get; set; } = "";
            public string ClientCertPassword { get; set; } = "";
        }
    }
}
