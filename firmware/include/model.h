#pragma once
#include <Arduino.h>
#include <sys/time.h>

struct Reading {
  float ph = NAN, tempC = NAN, turbidityNTU = NAN, turbidityV = NAN;
  uint64_t ts = 0;
};

struct Range {
  float min, max;
  Range(float a = NAN, float b = NAN) : min(a), max(b) {}
  // 0 = in range, -1 = low, 1 = high
  int check(float v) const {
    if (isnan(v)) return 0;
    if (!isnan(min) && v < min) return -1;
    if (!isnan(max) && v > max) return 1;
    return 0;
  }
};

struct Settings {
  uint16_t readingIntervalSec = 10;
  bool pumpEnabled = true;
  float pumpOnMin = 15, pumpOffMin = 45;
  bool feedEnabled = true;
  static const uint8_t MAX_FEEDS = 8;
  char feedTimes[MAX_FEEDS][6] = {"08:00", "18:00"};
  uint8_t feedCount = 2;
  int sweepDeg = 90;
  bool skipIfTurbid = true;
  Range ph{6.8f, 7.6f}, tempC{22.0f, 28.0f}, turbidityNTU{NAN, 50.0f};
};

struct Status {
  bool pumpOn = false;
  uint64_t lastFeedTs = 0;
};

// Epoch milliseconds (valid once NTP has synced).
inline uint64_t nowMs() {
  struct timeval tv; gettimeofday(&tv, nullptr);
  return (uint64_t)tv.tv_sec * 1000ULL + tv.tv_usec / 1000;
}
inline bool timeValid() { return time(nullptr) > 1700000000; }
