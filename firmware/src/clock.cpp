#include "clock.h"
#include "config.h"
#include "model.h"
#include <Preferences.h>
#include <atomic>
#include <esp_sntp.h>
#include <sys/time.h>

static constexpr uint32_t SAVE_EVERY_MS = 5UL * 60UL * 1000UL;
static std::atomic<bool> synced{false};
static const char* source = "none";
static uint32_t lastSaveMs;

static void saveNow() {
  if (!timeValid()) return;
  Preferences p; p.begin("aq-clock", false);
  p.putULong64("epoch", (uint64_t)time(nullptr));
  p.end();
  lastSaveMs = millis();
}

static void onNtpSync(struct timeval*) { synced = true; }

void clockBegin() {
  setenv("TZ", TZ_INFO, 1);
  tzset();
  sntp_set_time_sync_notification_cb(onNtpSync);
  if (timeValid()) { source = "kept"; return; }   // survived a soft reset
  Preferences p; p.begin("aq-clock", true);
  uint64_t epoch = p.getULong64("epoch", 0);
  p.end();
  if (epoch > 1700000000ULL) {
    struct timeval tv = { (time_t)epoch, 0 };
    settimeofday(&tv, nullptr);
    source = "saved";
    Serial.println("[time] no internet time yet: using the last saved time (behind by however long the board was off).");
    Serial.println("[time] to correct it, type: time YYYY-MM-DD HH:MM");
  } else {
    Serial.println("[time] clock not set: the feeding schedule waits for internet time or 'time YYYY-MM-DD HH:MM'");
  }
  clockPrint();
}

void clockLoop() {
  static bool announced;
  if (synced && !announced) {
    announced = true;
    source = "internet";
    saveNow();
    clockPrint();
  }
  if (timeValid() && millis() - lastSaveMs >= SAVE_EVERY_MS) saveNow();
}

bool clockSetLocal(const String& text) {
  int y, mo, d, h, mi;
  if (sscanf(text.c_str(), "%d-%d-%d %d:%d", &y, &mo, &d, &h, &mi) != 5) return false;
  if (y < 2024 || mo < 1 || mo > 12 || d < 1 || d > 31 || h < 0 || h > 23 || mi < 0 || mi > 59) return false;
  struct tm t = {};
  t.tm_year = y - 1900; t.tm_mon = mo - 1; t.tm_mday = d;
  t.tm_hour = h; t.tm_min = mi; t.tm_isdst = -1;
  struct timeval tv = { mktime(&t), 0 };
  settimeofday(&tv, nullptr);
  source = "console";
  saveNow();
  return true;
}

bool clockSynced() { return synced; }
const char* clockSource() { return source; }

void clockPrint() {
  if (!timeValid()) { Serial.println("[time] not set"); return; }
  struct tm t;
  getLocalTime(&t, 0);
  char buf[24];
  strftime(buf, sizeof buf, "%Y-%m-%d %H:%M:%S", &t);
  Serial.printf("[time] %s (source: %s)\n", buf, source);
}
