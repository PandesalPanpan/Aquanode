#include "settings_store.h"
#include <ArduinoJson.h>
#include <Preferences.h>

static void readRange(JsonVariantConst v, Range& r) {
  if (v.isNull()) return;
  r.min = v["min"].isNull() ? NAN : v["min"].as<float>();
  r.max = v["max"].isNull() ? NAN : v["max"].as<float>();
}

bool settingsFromJson(const String& json, Settings& s) {
  JsonDocument doc;
  if (deserializeJson(doc, json) || !doc.is<JsonObject>()) return false;
  // Same limits as the Dashboard (READING_INTERVAL in web/src/data/defaults.js); also keeps it inside uint16_t.
  s.readingIntervalSec = constrain(doc["readingIntervalSec"] | (int)s.readingIntervalSec, 2, 3600);
  JsonVariantConst p = doc["pump"];
  s.pumpEnabled = p["enabled"] | s.pumpEnabled;
  s.pumpOnMin = p["onMin"] | s.pumpOnMin;
  s.pumpOffMin = p["offMin"] | s.pumpOffMin;
  JsonVariantConst f = doc["feed"];
  s.feedEnabled = f["enabled"] | s.feedEnabled;
  s.portion = constrain(f["portion"] | (int)s.portion, 1, 3);
  s.skipIfTurbid = f["skipIfTurbid"] | s.skipIfTurbid;
  if (f["times"].is<JsonArrayConst>()) {
    s.feedCount = 0;
    for (JsonVariantConst t : f["times"].as<JsonArrayConst>()) {
      if (s.feedCount >= Settings::MAX_FEEDS) break;
      strlcpy(s.feedTimes[s.feedCount++], t | "", 6);
    }
  }
  JsonVariantConst safe = doc["safe"];
  readRange(safe["ph"], s.ph);
  readRange(safe["tempC"], s.tempC);
  readRange(safe["turbidityNTU"], s.turbidityNTU);
  return true;
}

void settingsLoad(Settings& s) {
  Preferences p; p.begin("aquanode", true);
  String json = p.getString("settings", "");
  p.end();
  if (json.length() && settingsFromJson(json, s)) Serial.println("[settings] loaded from flash");
}

void settingsSave(const String& json) {
  Preferences p; p.begin("aquanode", false);
  p.putString("settings", json);
  p.end();
}
