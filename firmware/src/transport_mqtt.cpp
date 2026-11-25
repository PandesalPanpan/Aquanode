#include "transport.h"
#include "config.h"

#include <ArduinoJson.h>
#include <Preferences.h>
#include <WiFi.h>
#include <atomic>
#include <esp_system.h>
#include <mqtt_client.h>

#ifndef AQUANODE_MQTT_URI
#define AQUANODE_MQTT_URI ""
#endif
#ifndef AQUANODE_MQTT_USERNAME
#define AQUANODE_MQTT_USERNAME ""
#endif
#ifndef AQUANODE_MQTT_PASSWORD
#define AQUANODE_MQTT_PASSWORD ""
#endif
#ifndef AQUANODE_MQTT_CA
#define AQUANODE_MQTT_CA ""
#endif

static constexpr char SETTINGS_TOPIC[] = "aquanode/" DEVICE_ID "/settings";
static constexpr char COMMANDS_TOPIC[] = "aquanode/" DEVICE_ID "/commands";
static constexpr size_t MESSAGE_BYTES = 1536;
static constexpr size_t COMMAND_ID_BYTES = 25;

struct IncomingMessage {
  bool settings;
  char payload[MESSAGE_BYTES];
};

enum class CommandOutcome : uint8_t { empty, claimed, done, expired };
struct CommandRecord {
  uint64_t ts;
  char id[COMMAND_ID_BYTES];
  CommandOutcome outcome;
};

static SettingsHandler settingsCb;
static CommandHandler commandCb;
static esp_mqtt_client_handle_t mqtt;
static QueueHandle_t incoming;
static std::atomic<bool> connected{false};
static Preferences ledger;
static bool ledgerReady;
static CommandRecord commands[24] = {};
static uint32_t bootIdHigh, bootIdLow, sequence;
static uint32_t lastWifiTry, lastMqttStartTry;
static String lastSettings;
static bool bootPending = true;

static bool validId(const char* id) {
  size_t length = strlen(id);
  return length > 0 && length < COMMAND_ID_BYTES &&
    strspn(id, "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-") == length;
}

static bool expired(uint64_t ts, uint64_t now) {
  return ts > now ? ts - now > 30000 : now - ts >= COMMAND_EXPIRE_MS;
}

static bool saveLedger() {
  return ledgerReady && ledger.putBytes("recent", commands, sizeof(commands)) == sizeof(commands);
}

static const char* commandResult(const char* id, const char* type, uint64_t ts) {
  CommandRecord* slot = nullptr;
  const uint64_t now = nowMs();
  for (CommandRecord& entry : commands) {
    if (entry.outcome != CommandOutcome::empty && strcmp(entry.id, id) == 0) {
      switch (entry.outcome) {
        case CommandOutcome::done: return "done";
        case CommandOutcome::expired: return "expired";
        default: return "uncertain";
      }
    }
    if (!slot && (entry.outcome == CommandOutcome::empty || expired(entry.ts, now))) slot = &entry;
  }
  if (expired(ts, now)) return "expired";
  if (strcmp(type, "feed_now") && strcmp(type, "pump_on") && strcmp(type, "pump_off")) return "failed";
  if (!slot) return "failed";

  // Claim before moving hardware. A reset between claim and completion makes the outcome uncertain.
  const CommandRecord previous = *slot;
  *slot = {};
  slot->ts = ts;
  strlcpy(slot->id, id, sizeof(slot->id));
  slot->outcome = CommandOutcome::claimed;
  if (!saveLedger()) {
    *slot = previous;
    return "failed";
  }

  const bool done = strcmp(commandCb(type, ts), "done") == 0;
  slot->outcome = done ? CommandOutcome::done : CommandOutcome::expired;
  if (!saveLedger()) {
    slot->outcome = CommandOutcome::claimed;
    return "uncertain";
  }
  return done ? "done" : "expired";
}

static bool publish(const char* topic, const JsonDocument& document) {
  if (!transportReady()) return false;
  const String fullTopic = String("aquanode/" DEVICE_ID "/") + topic;
  String body;
  serializeJson(document, body);
  return esp_mqtt_client_enqueue(mqtt, fullTopic.c_str(), body.c_str(), body.length(), 1, 0, true) >= 0;
}

static void receiveMessage(esp_mqtt_event_handle_t event) {
  // The MQTT task owns this assembly buffer. Callbacks run on the Arduino loop after queueing.
  static IncomingMessage message;
  static bool receiving;
  if (event->current_data_offset == 0) {
    const String topic(event->topic, event->topic_len);
    message.settings = topic == SETTINGS_TOPIC;
    receiving = (message.settings || topic == COMMANDS_TOPIC) &&
      event->total_data_len > 0 && event->total_data_len < sizeof(message.payload);
  }
  if (!receiving) return;
  memcpy(message.payload + event->current_data_offset, event->data, event->data_len);
  const size_t end = event->current_data_offset + event->data_len;
  if (end == event->total_data_len) {
    message.payload[end] = '\0';
    if (xQueueSend(incoming, &message, 0) != pdTRUE) Serial.println("[mqtt] inbox full");
    receiving = false;
  }
}

static void onMqttEvent(void*, esp_event_base_t, int32_t id, void* data) {
  const auto event = static_cast<esp_mqtt_event_handle_t>(data);
  switch (id) {
    case MQTT_EVENT_CONNECTED:
      esp_mqtt_client_subscribe(event->client, SETTINGS_TOPIC, 1);
      esp_mqtt_client_subscribe(event->client, COMMANDS_TOPIC, 1);
      connected = true;
      Serial.println("[mqtt] connected");
      break;
    case MQTT_EVENT_DISCONNECTED:
      connected = false;
      Serial.println("[mqtt] disconnected");
      break;
    case MQTT_EVENT_DATA:
      receiveMessage(event);
      break;
  }
}

static void configureMqtt() {
  const String uri = AQUANODE_MQTT_URI;
  if (!uri.startsWith("mqtts://") || !strlen(AQUANODE_MQTT_CA)) {
    Serial.println("[mqtt] configure AQUANODE_MQTT_URI (mqtts://) and AQUANODE_MQTT_CA in secrets.h");
    return;
  }
  incoming = xQueueCreate(4, sizeof(IncomingMessage));
  if (!incoming) return;

  esp_mqtt_client_config_t config = {};
  config.uri = AQUANODE_MQTT_URI;
  config.cert_pem = AQUANODE_MQTT_CA;
  config.username = AQUANODE_MQTT_USERNAME;
  config.password = AQUANODE_MQTT_PASSWORD;
  config.client_id = "aquanode-esp32-" DEVICE_ID;
  config.keepalive = 15;
  config.network_timeout_ms = 4000;
  config.reconnect_timeout_ms = 3000;
  config.protocol_ver = MQTT_PROTOCOL_V_3_1_1;
  mqtt = esp_mqtt_client_init(&config);
  if (mqtt) esp_mqtt_client_register_event(mqtt, MQTT_EVENT_ANY, onMqttEvent, nullptr);
}

void transportBegin(SettingsHandler onSettings, CommandHandler onCommand) {
  settingsCb = onSettings;
  commandCb = onCommand;
#if ENABLE_CLOUD
  bootIdHigh = esp_random();
  bootIdLow = esp_random();
  ledgerReady = ledger.begin("aq-commands");
  if (ledgerReady && ledger.isKey("recent") &&
      ledger.getBytes("recent", commands, sizeof(commands)) != sizeof(commands)) {
    ledgerReady = false;
  }
  if (!ledgerReady) Serial.println("[mqtt] command storage unavailable");

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  configTzTime(TZ_INFO, "pool.ntp.org", "time.google.com");
  configureMqtt();
#else
  Serial.println("[cloud] disabled (ENABLE_CLOUD 0)");
#endif
}

bool transportReady() {
  return connected && WiFi.status() == WL_CONNECTED && timeValid();
}

static void applyMessage(const IncomingMessage& message) {
  if (message.settings) {
    if (lastSettings != message.payload) {
      lastSettings = message.payload;
      settingsCb(lastSettings);
    }
    return;
  }
  JsonDocument document;
  if (deserializeJson(document, message.payload)) return;
  const char* id = document["id"] | "";
  if (!validId(id) || !document["ts"].is<uint64_t>()) return;
  const char* result = commandResult(id, document["type"] | "", document["ts"].as<uint64_t>());
  JsonDocument response;
  response["id"] = id;
  response["status"] = result;
  response["doneTs"] = nowMs();
  publish("command-results", response);
}

void transportLoop() {
#if ENABLE_CLOUD
  if (WiFi.status() != WL_CONNECTED) {
    if (millis() - lastWifiTry >= 10000) {
      lastWifiTry = millis();
      WiFi.reconnect();
    }
    return;
  }
  if (!mqtt || !timeValid()) return;
  static bool started;
  if (!started && (lastMqttStartTry == 0 || millis() - lastMqttStartTry >= 3000)) {
    lastMqttStartTry = millis();
    started = esp_mqtt_client_start(mqtt) == ESP_OK;
  }
  if (!transportReady()) return;
  if (bootPending) {
    JsonDocument event;
    event["id"] = String(bootIdHigh, HEX) + "-" + String(bootIdLow, HEX) + "-0";
    event["type"] = "boot";
    event["reason"] = FW_VERSION;
    event["ts"] = nowMs();
    bootPending = !publish("events", event);
  }
  IncomingMessage message;
  if (xQueueReceive(incoming, &message, 0) == pdTRUE) applyMessage(message);
#endif
}

static String sampleId() {
  char id[COMMAND_ID_BYTES];
  snprintf(id, sizeof(id), "%08lx%08lx%08lx",
           (unsigned long)bootIdHigh, (unsigned long)bootIdLow, (unsigned long)++sequence);
  return String(id);
}

static void setNum(JsonDocument& document, const char* key, float value) {
  if (isnan(value)) document[key] = nullptr;
  else document[key] = value;
}

void sendReading(const Reading& r) {
  if (!transportReady()) return;
  JsonDocument document;
  document["id"] = sampleId();
  setNum(document, "ph", r.ph);
  setNum(document, "tempC", r.tempC);
  setNum(document, "turbidityNTU", r.turbidityNTU);
  setNum(document, "turbidityV", r.turbidityV);
  document["ts"] = r.ts;
  publish("readings", document);
}

void sendStatus(const Status& s) {
  if (!transportReady()) return;
  JsonDocument document;
  document["online"] = true;
  document["lastSeen"] = nowMs();
  document["pumpOn"] = s.pumpOn;
  document["fw"] = FW_VERSION;
  if (s.lastFeedTs) document["lastFeedTs"] = s.lastFeedTs;
  publish("status", document);
}

void sendAlert(const char* metric, float value, const Range& r, uint64_t ts) {
  if (!transportReady()) return;
  JsonDocument document;
  document["id"] = sampleId();
  document["metric"] = metric;
  document["value"] = value;
  setNum(document, "min", r.min);
  setNum(document, "max", r.max);
  document["ts"] = ts;
  publish("alerts", document);
}

void sendEvent(const char* type, const String& reason) {
  Serial.printf("[event] %s %s\n", type, reason.c_str());
  if (!transportReady()) return;
  JsonDocument document;
  document["id"] = sampleId();
  document["type"] = type;
  document["ts"] = nowMs();
  if (reason.length()) document["reason"] = reason;
  publish("events", document);
}
