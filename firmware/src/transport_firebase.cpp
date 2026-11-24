// Firebase Realtime Database transport over plain HTTPS REST (no Firebase library needed).
// Auth: email/password -> ID token (re-signed every 50 min). Paths mirror MQTT-style topics.
#include "transport.h"
#include "config.h"
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

static WiFiClientSecure tls;
static HTTPClient http;
static String idToken;
static uint32_t tokenAtMs = 0;
static uint32_t lastCmdPoll = 0, lastSettingsPoll = 0, lastWifiTry = 0;
static String lastSettingsJson;
static SettingsHandler settingsCb;
static CommandHandler commandCb;
static const String BASE = String(FIREBASE_DB_URL) + "/aquanode/" DEVICE_ID "/";

static bool wifiUp() { return WiFi.status() == WL_CONNECTED; }

static bool signIn() {
  HTTPClient a;
  a.begin(tls, "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" FIREBASE_API_KEY);
  a.addHeader("Content-Type", "application/json");
  JsonDocument body;
  body["email"] = DEVICE_EMAIL; body["password"] = DEVICE_PASSWORD; body["returnSecureToken"] = true;
  String b; serializeJson(body, b);
  int code = a.POST(b);
  String resp = a.getString(); a.end();
  if (code != 200) { Serial.printf("[cloud] sign-in failed %d: %s\n", code, resp.c_str()); return false; }
  JsonDocument doc; deserializeJson(doc, resp);
  idToken = doc["idToken"].as<String>();
  tokenAtMs = millis();
  Serial.println("[cloud] signed in");
  return true;
}

// method: GET/PUT/PATCH/POST. path relative to device base, e.g. "status", "readings". query: extra params.
static int request(const char* method, const String& path, const String& body = "", String* out = nullptr, const String& query = "") {
  if (!wifiUp()) return -1;
  if (idToken.isEmpty() || millis() - tokenAtMs > 50UL * 60UL * 1000UL) { if (!signIn()) return -2; }
  String url = BASE + path + ".json?auth=" + idToken + query;
  http.begin(tls, url);
  http.addHeader("Content-Type", "application/json");
  int code = http.sendRequest(method, body);
  if (out) *out = http.getString();
  http.end();
  if (code == 401) idToken = "";  // token expired/revoked -> re-sign-in next time
  if (code != 200) Serial.printf("[cloud] %s %s -> %d\n", method, path.c_str(), code);
  return code;
}

static void setNum(JsonDocument& d, const char* k, float v) { if (isnan(v)) d[k] = nullptr; else d[k] = v; }

void transportBegin(SettingsHandler onSettings, CommandHandler onCommand) {
  settingsCb = onSettings; commandCb = onCommand;
#if ENABLE_CLOUD
  tls.setInsecure();          // prototype: skip certificate check (add root CA before deployment)
  http.setReuse(true);        // keep the TLS connection open between requests (much faster)
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.printf("[wifi] connecting to %s", WIFI_SSID);
  for (int i = 0; i < 40 && !wifiUp(); i++) { delay(500); Serial.print('.'); }
  Serial.println(wifiUp() ? " connected " + WiFi.localIP().toString() : " failed (will keep retrying)");
  configTzTime(TZ_INFO, "pool.ntp.org", "time.google.com");
  for (int i = 0; i < 20 && !timeValid(); i++) delay(250);
  Serial.printf("[time] %s\n", timeValid() ? "synced" : "not synced yet");
#else
  Serial.println("[cloud] disabled (ENABLE_CLOUD 0)");
#endif
}

bool transportReady() {
#if ENABLE_CLOUD
  return wifiUp() && timeValid();
#else
  return false;
#endif
}

void transportLoop() {
#if ENABLE_CLOUD
  if (!wifiUp()) {
    if (millis() - lastWifiTry > 10000) { lastWifiTry = millis(); Serial.println("[wifi] reconnecting..."); WiFi.reconnect(); }
    return;
  }
  if (!timeValid()) return;

  if (millis() - lastSettingsPoll > SETTINGS_POLL_MS || lastSettingsPoll == 0) {
    lastSettingsPoll = millis();
    String json;
    if (request("GET", "settings", "", &json) == 200 && json != "null" && json != lastSettingsJson) {
      lastSettingsJson = json;
      settingsCb(json);
    }
  }

  if (millis() - lastCmdPoll > COMMAND_POLL_MS) {
    lastCmdPoll = millis();
    String json;
    if (request("GET", "commands", "", &json, "&orderBy=%22status%22&equalTo=%22pending%22") != 200 || json == "null") return;
    JsonDocument doc;
    if (deserializeJson(doc, json)) return;
    for (JsonPair kv : doc.as<JsonObject>()) {
      String id = kv.key().c_str();
      const char* result = commandCb(kv.value()["type"].as<String>(), kv.value()["ts"].as<uint64_t>());
      JsonDocument upd; upd["status"] = result; upd["doneTs"] = nowMs();
      String b; serializeJson(upd, b);
      request("PATCH", "commands/" + id, b);
    }
  }
#endif
}

void sendReading(const Reading& r) {
  if (!transportReady()) return;
  JsonDocument d;
  setNum(d, "ph", r.ph); setNum(d, "tempC", r.tempC);
  setNum(d, "turbidityNTU", r.turbidityNTU); setNum(d, "turbidityV", r.turbidityV);
  d["ts"] = r.ts;
  String b; serializeJson(d, b);
  request("PUT", "latest", b);
  request("POST", "readings", b);
}

void sendStatus(const Status& s) {
  if (!transportReady()) return;
  JsonDocument d;
  d["online"] = true; d["lastSeen"] = nowMs(); d["pumpOn"] = s.pumpOn; d["fw"] = FW_VERSION;
  if (s.lastFeedTs) d["lastFeedTs"] = s.lastFeedTs;
  String b; serializeJson(d, b);
  request("PATCH", "status", b);
}

void sendAlert(const char* metric, float value, const Range& r, uint64_t ts) {
  if (!transportReady()) return;
  JsonDocument d;
  d["metric"] = metric; d["value"] = value; setNum(d, "min", r.min); setNum(d, "max", r.max); d["ts"] = ts;
  String b; serializeJson(d, b);
  request("POST", "alerts", b);
}

void sendEvent(const char* type, const String& reason) {
  Serial.printf("[event] %s %s\n", type, reason.c_str());
  if (!transportReady()) return;
  JsonDocument d;
  d["type"] = type; d["ts"] = nowMs();
  if (reason.length()) d["reason"] = reason;
  String b; serializeJson(d, b);
  request("POST", "events", b);
}
