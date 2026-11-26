// AquaNode firmware — the "brain": pump cycle, feeding schedule, Skip-Feed Rule, Safe Range alerts.
// All of this runs locally from the last Settings received, so it keeps working without WiFi.
#include <Arduino.h>
#include "config.h"
#include "model.h"
#include "sensors.h"
#include "actuators.h"
#include "settings_store.h"
#include "transport.h"
#include "clock.h"
#include <Preferences.h>

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
  feederRun(S.portion);
  status.lastFeedTs = nowMs();
  sendEvent("fed", reason);
  sendStatus(status);
}

// The last fed schedule slot is kept in flash, so a restart (or a clock restored a few minutes
// behind) never feeds the same slot twice.
static void loadFeedSlot() {
  Preferences p; p.begin("aquanode", true);
  p.getString("feedSlot", lastFeedSlot, sizeof lastFeedSlot);
  p.end();
}

static void saveFeedSlot() {
  Preferences p; p.begin("aquanode", false);
  p.putString("feedSlot", lastFeedSlot);
  p.end();
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

// ---- Bench test console: type commands in the Serial Monitor (115200, newline). Works without WiFi. ----
static void printReading(const Reading& r) {
  Serial.printf("[reading] pH %.2f (%.3f V) | temp %.2f C | turbidity %.0f NTU (%.3f V) | pump %s\n",
                r.ph, r.phV, r.tempC, r.turbidityNTU, r.turbidityV, status.pumpOn ? "ON" : "off");
}

static void consoleHelp() {
  Serial.println("[console] commands: read | pump on | pump off | feed 1|2|3 | stop <us> (e.g. stop 1480)");
  Serial.println("[console]           time | time YYYY-MM-DD HH:MM | cal turbidity (probe in CLEAR water) | cal reset | help");
}

static void handleConsole(String line) {
  line.trim();
  line.toLowerCase();
  if (!line.length()) return;
  if (line == "help") consoleHelp();
  else if (line == "time") clockPrint();
  else if (line.startsWith("time ")) {
    if (clockSetLocal(line.substring(5))) clockPrint();
    else Serial.println("[console] use: time 2026-11-26 14:30 (local time, 24-hour)");
  }
  else if (line == "cal turbidity") sensorsCalibrateTurbidity();
  else if (line == "cal reset") sensorsResetCalibration();
  else if (line == "read") { last = sensorsRead(); printReading(last); }
  else if (line == "pump on") setPump(true, "console");
  else if (line == "pump off") setPump(false, "console");
  else if (line.startsWith("feed")) {
    int p = line.substring(4).toInt();
    if (p < 1 || p > 3) { Serial.println("[console] use: feed 1, feed 2 or feed 3"); return; }
    uint8_t saved = S.portion; S.portion = p;
    feed("console");
    S.portion = saved;
  }
  else if (line.startsWith("stop")) {
    int us = line.substring(4).toInt();
    if (us < 1000 || us > 2000) { Serial.println("[console] use: stop <1000-2000>, e.g. stop 1480"); return; }
    feederSetStopUs(us);
    Serial.println("[console] holding stop pulse for 3 s - watch the servo: still = good value");
    feederHoldStop(3000);
  }
  else { Serial.printf("[console] unknown: '%s'\n", line.c_str()); consoleHelp(); }
}

static void consoleLoop() {
  static String buf;
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') { handleConsole(buf); buf = ""; }
    else if (buf.length() < 40) buf += c;
  }
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n=== AquaNode " FW_VERSION " (" DEVICE_ID ") ===");
  settingsLoad(S);
  clockBegin();
  loadFeedSlot();
  sensorsBegin();
  actuatorsBegin();
  transportBegin(onSettings, onCommand);
  // Start in the OFF phase: a restart never switches the pump on by itself.
  phaseEndMs = millis() + minutesToMs(S.pumpOffMin);
  if (S.pumpEnabled) Serial.printf("[pump] starts OFF; timer turns it ON in %.1f min (or type 'pump on')\n", S.pumpOffMin);
  consoleHelp();
}

void loop() {
  transportLoop();
  clockLoop();
  consoleLoop();

  // Readings
  if (millis() - lastReadingMs >= S.readingIntervalSec * 1000UL || lastReadingMs == 0) {
    lastReadingMs = millis();
#if AQUANODE_DEMO_READINGS
    last.ph = 7.2f;
    last.tempC = 25.5f;
    last.turbidityNTU = 12.0f;
    last.turbidityV = 4.18f;
    last.ts = nowMs();
#else
    last = sensorsRead();
#endif
    printReading(last);
    checkAlerts(last);
    sendReading(last);
    sendStatus(status);
    lastStatusMs = millis();
  }

  // Pump cycle
  if (!S.pumpEnabled) { if (status.pumpOn) setPump(false, "pump disabled"); }
  else if ((int32_t)(millis() - phaseEndMs) >= 0) setPump(!status.pumpOn, "timer");

  // Feeding schedule (checked once a second). Uses the local clock: internet time when online,
  // otherwise the last good time keeps counting (see clock.cpp), so feeding also works offline.
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
          saveFeedSlot();
          scheduledFeed(hhmm);
        }
      }
    }
  }
  delay(20);
}
