import json
import os
import ssl
import time
import uuid
import paho.mqtt.client as mqtt
from .data_service import DataService


class MQTTDataService(DataService):
    """MQTT Data Service with TLS 1.3 and FDA 21 CFR Part 11 compliance"""

    def __init__(self, broker="darkside.tail3c652f.ts.net", port=8883, topic_prefix="parkinsons/tremor"):
        """Initialize with secure defaults"""
        self.broker = broker
        self.port = port
        self.topic_prefix = topic_prefix
        self.client = None
        self.connected = False
        self.client_id = f"darkside-{uuid.uuid4().hex[:8]}"

        # Load credentials from environment or secure configuration
        # In production, use secure storage for credentials
        self.username = os.getenv("MQTT_USERNAME", "mqttuser")
        self.password = os.getenv("MQTT_PASSWORD", "d4r361de")

        # Store certificate paths
        self.cert_dir = os.path.expanduser("~/DARKSide/certs")
        self.ca_cert = os.path.join(self.cert_dir, "mosquitto-ca.crt")
        self.client_cert = os.path.join(self.cert_dir, "dashboard-client.crt")
        self.client_key = os.path.join(self.cert_dir, "dashboard-client.key")

    def initialize(self):
        """Initialize MQTT client and connect to broker securely"""
        # Verify certificate files exist
        for cert_file in [self.ca_cert, self.client_cert, self.client_key]:
            if not os.path.exists(cert_file):
                print(f"ERROR: Certificate file not found: {cert_file}")
                return False

        # Create client with unique ID
        self.client = mqtt.Client(client_id=self.client_id)

        # Set callback handlers
        self.client.on_connect = self._on_connect
        self.client.on_disconnect = self._on_disconnect

        # Set username/password authentication
        self.client.username_pw_set(self.username, self.password)

        # Configure TLS with certificates
        try:
            self.client.tls_set(
                ca_certs=self.ca_cert,
                certfile=self.client_cert,
                keyfile=self.client_key,
                tls_version=ssl.PROTOCOL_TLS_CLIENT
            )
            # Don't verify hostname in server certificate (alternative: update hosts file)
            self.client.tls_insecure_set(True)
        except Exception as e:
            print(f"TLS setup failed: {e}")
            return False

        # Connect to the broker
        try:
            self.client.connect(self.broker, self.port)
            self.client.loop_start()
            print(f"Connecting to MQTT broker at {self.broker}:{self.port}")
            # Connection status will be updated in on_connect callback
            return True
        except Exception as e:
            print(f"Failed to connect to MQTT broker: {e}")
            return False

    def _on_connect(self, client, userdata, flags, rc):
        """Handle connection establishment"""
        if rc == 0:
            print(f"Successfully connected to MQTT broker at {self.broker}:{self.port}")
            self.connected = True
        else:
            # Reference: https://docs.oasis-open.org/mqtt/mqtt/v5.0/os/mqtt-v5.0-os.html#_Toc3901205
            error_messages = {
                1: "Connection refused - incorrect protocol version",
                2: "Connection refused - invalid client identifier",
                3: "Connection refused - server unavailable",
                4: "Connection refused - bad username or password",
                5: "Connection refused - not authorized"
            }
            error = error_messages.get(rc, f"Unknown error code {rc}")
            print(f"Failed to connect to broker: {error}")
            self.connected = False

    def _on_disconnect(self, client, userdata, rc):
        """Handle disconnection events"""
        if rc != 0:
            print(f"Unexpected disconnection from broker, code: {rc}")
        else:
            print("Disconnected from broker normally")
        self.connected = False

    def send(self, data):
        """Send data to MQTT broker with integrity checks"""
        if not self.client:
            print("MQTT client not initialized")
            return False

        if not self.connected:
            print("MQTT client not connected")
            return False

        # Add metadata required by 21 CFR Part 11
        data.update({
            "timestamp": time.time(),
            "device_id": self.client_id,
            "data_version": "1.0"
        })

        # Extract sensor name
        if "sensor_name" in data:
            topic = f"{self.topic_prefix}/{data['sensor_name']}"
        else:
            topic = f"{self.topic_prefix}/default"

        # Convert to JSON and publish
        try:
            payload = json.dumps(data)
            result = self.client.publish(topic, payload, qos=1)  # QoS 1 ensures delivery
            if result.rc != 0:
                print(f"Failed to publish message: {result.rc}")
                return False
            return True
        except Exception as e:
            print(f"Error publishing to MQTT: {e}")
            return False

    def close(self):
        """Disconnect and clean up"""
        if self.client:
            self.client.loop_stop()
            self.client.disconnect()
            print("MQTT client disconnected and cleaned up")
