#pragma once
// Copy to secrets.h (gitignored) and fill in. Never commit secrets.h.
#define WIFI_SSID       "your-2.4GHz-wifi"
#define WIFI_PASSWORD   "wifi-password"
#define AQUANODE_MQTT_URI      "mqtts://your-broker-hostname:8883"
#define AQUANODE_MQTT_USERNAME "esp32-client"
#define AQUANODE_MQTT_PASSWORD "broker-password"
// Paste the broker's trusted root CA here as a single string with escaped line breaks.
#define AQUANODE_MQTT_CA       "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----\n"
