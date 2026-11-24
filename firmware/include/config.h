#pragma once
// ===== Everything hardware-specific lives here. Update at Thursday T0 after identifying modules. =====
#include "secrets.h"

#define DEVICE_ID   "bench-01"
#define FW_VERSION  "0.1.0"
#define FIREBASE_DB_URL  "https://aquanode-bench-2611-default-rtdb.asia-southeast1.firebasedatabase.app"
#define FIREBASE_API_KEY "AIzaSyCBPUpfYt8UusSKb3CVaNexKThTOvCASiU"
#define TZ_INFO "PHT-8"            // POSIX TZ string for UTC+8 (Philippines)

// ---- Feature flags: turn components on one at a time (T2..T9). Disabled sensors report null. ----
#define ENABLE_TEMP       1
#define ENABLE_TURBIDITY  1
#define ENABLE_PH         1
#define ENABLE_PUMP       1
#define ENABLE_FEEDER     1
#define ENABLE_CLOUD      1        // 0 = offline, Serial only (T8 Integration I)

// ---- Pins (ADC1 only for analog: GPIO32-39, because ADC2 stops working when WiFi is on) ----
#define PIN_PH          34
#define PIN_TURBIDITY   35
#define PIN_TEMP        4          // DS18B20 data, 4.7k pull-up to 3.3V
#define PIN_PUMP_RELAY  26
#define PIN_SERVO       13
#define RELAY_ACTIVE_LOW 1         // most blue relay modules switch ON when IN is LOW

// ---- Voltage divider on 5V analog sensors: module out -> R_TOP -> pin -> R_BOTTOM -> GND ----
#define R_TOP     10000.0f
#define R_BOTTOM  20000.0f
#define DIVIDER_RATIO ((R_TOP + R_BOTTOM) / R_BOTTOM)   // pin voltage * ratio = module voltage

// ---- Calibration (T14). pH = PH_SLOPE * V + PH_OFFSET, V = module output voltage ----
// Typical PH-4502C: ~2.5 V at pH 7, ~-5.7 pH per volt. Replace with 2-point buffer calibration.
#define PH_SLOPE   -5.70f
#define PH_OFFSET  21.34f
// Turbidity: SEN0189 datasheet curve (valid ~2.5-4.2 V). TURB_V_OFFSET shifts so clear water reads ~0 NTU.
#define TURB_V_OFFSET 0.0f

#define SAMPLES 20                 // analog samples per reading (median-ish average)
#define COMMAND_POLL_MS   2000
#define SETTINGS_POLL_MS  15000
#define COMMAND_EXPIRE_MS (5UL * 60UL * 1000UL)
