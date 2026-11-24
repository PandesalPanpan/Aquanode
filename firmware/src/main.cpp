// AquaNode firmware — the "brain": pump cycle, feeding schedule, Skip-Feed Rule, Safe Range alerts.
// All of this runs locally from the last Settings received, so it keeps working without WiFi.
#include <Arduino.h>
#include "config.h"
#include "model.h"
#include "sensors.h"
#include "actuators.h"
#include "settings_store.h"
#include "transport.h"

static Settings S;
static Status status;
static Reading last;
static uint32_t phaseEndMs = 0, lastReadingMs = 0, lastStatusMs = 0, lastFeedCheckMs = 0;
static char lastFeedSlot[20] = "";
static int alerted[3] = {0, 0, 0};

static uint32_t minutesToMs(float m) { return (uint32_t)(m * 60000.0f); }

static void setPump(bool on, const char* why) {
  pumpSet(on);
  status.pumpOn = on;
  phaseEndMs = millis() + minutesToMs(on ? S.pumpOnMin : S.pumpOffMin);
  sendEvent(on ? "pump_on" : "pump_off", why);
  sendStatus(status);
}

static void feed(const String& reason) {
  feederSweep(S.sweepDeg);
  status.lastFeedTs = nowMs();
  sendEvent("fed", reason);
  sendStatus(status);
}

static void scheduledFeed(const char* slot) {
  float maxNtu = S.turbidityNTU.max;
  if (S.skipIfTurbid && !isnan(maxNtu) && !isnan(last.turbidityNTU) && last.turbidityNTU > maxNtu) {
    sendEvent("feed_skipped", String("turbidity ") + (int)last.turbidityNTU + " NTU > " + (int)maxNtu + " at " + slot);
    return;
  }
  feed(String("schedule ") + slot);
}

static void onSettings(const String& json) {
  Settings n = S;
  if (!settingsFromJson(json, n)) { Serial.println("[settings] invalid JSON ignored"); return; }
  bool pumpTimingChanged = n.pumpOnMin != S.pumpOnMin || n.pumpOffMin != S.pumpOffMin;
  S = n;
  settingsSave(json);
  if (pumpTimingChanged) phaseEndMs = millis() + minutesToMs(status.pumpOn ? S.pumpOnMin : S.pumpOffMin);
  Serial.printf("[settings] applied: every %us, pump %.1f/%.1f min, %u feed times\n",
                S.readingIntervalSec, S.pumpOnMin, S.pumpOffMin, S.feedCount);
}

static const char* onCommand(const String& type, uint64_t ts) {
  if (nowMs() - ts > COMMAND_EXPIRE_MS) { Serial.printf("[cmd] %s expired\n", type.c_str()); return "expired"; }
  Serial.printf("[cmd] %s\n", type.c_str());
  if (type == "pump_on") setPump(true, "manual");
  else if (type == "pump_off") setPump(false, "manual");
  else if (type == "feed_now") feed("manual");
  return "done";
}

static void checkAlerts(const Reading& r) {
  const char* names[3] = {"ph", "tempC", "turbidityNTU"};
  float vals[3] = {r.ph, r.tempC, r.turbidityNTU};
  const Range* ranges[3] = {&S.ph, &S.tempC, &S.turbidityNTU};
  for (int i = 0; i < 3; i++) {
    int out = ranges[i]->check(vals[i]);
    if (out && !alerted[i]) {
      Serial.printf("[ALERT] %s=%.2f too %s\n", names[i], vals[i], out < 0 ? "low" : "high");
      sendAlert(names[i], vals[i], *ranges[i], r.ts);
    }
    alerted[i] = out;
  }
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n=== AquaNode " FW_VERSION " (" DEVICE_ID ") ===");
  settingsLoad(S);
  sensorsBegin();
  actuatorsBegin();
  transportBegin(onSettings, onCommand);
  phaseEndMs = millis();  // start pump cycle immediately
  sendEvent("boot", FW_VERSION);
}

void loop() {
  transportLoop();

  // Readings
  if (millis() - lastReadingMs >= S.readingIntervalSec * 1000UL || lastReadingMs == 0) {
    lastReadingMs = millis();
    last = sensorsRead();
    Serial.printf("[reading] pH %.2f | temp %.2f C | turbidity %.0f NTU (%.3f V) | pump %s\n",
                  last.ph, last.tempC, last.turbidityNTU, last.turbidityV, status.pumpOn ? "ON" : "off");
    checkAlerts(last);
    sendReading(last);
    sendStatus(status);
    lastStatusMs = millis();
  }

  // Pump cycle
  if (!S.pumpEnabled) { if (status.pumpOn) setPump(false, "pump disabled"); }
  else if ((int32_t)(millis() - phaseEndMs) >= 0) setPump(!status.pumpOn, "timer");

  // Feeding schedule (checked once a second; needs NTP time)
  if (millis() - lastFeedCheckMs >= 1000 && S.feedEnabled && timeValid()) {
    lastFeedCheckMs = millis();
    struct tm t;
    if (getLocalTime(&t, 0)) {
      char hhmm[6], slot[20];
      strftime(hhmm, sizeof hhmm, "%H:%M", &t);
      strftime(slot, sizeof slot, "%Y-%m-%d %H:%M", &t);
      for (uint8_t i = 0; i < S.feedCount; i++) {
        if (strcmp(S.feedTimes[i], hhmm) == 0 && strcmp(slot, lastFeedSlot) != 0) {
          strlcpy(lastFeedSlot, slot, sizeof lastFeedSlot);
          scheduledFeed(hhmm);
        }
      }
    }
  }
  delay(20);
}
