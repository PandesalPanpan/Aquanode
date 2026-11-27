#pragma once
// ===== Everything hardware-specific lives here. Update at Thursday T0 after identifying modules. =====
#include "secrets.h"

#define DEVICE_ID   "bench-01"
#define FW_VERSION  "0.3.0-mqtt"
#define TZ_INFO "PHT-8"            // POSIX TZ string for UTC+8 (Philippines)

#ifndef AQUANODE_DEMO_READINGS
#define AQUANODE_DEMO_READINGS 0
#endif

// ---- Feature flags: turn components on one at a time (T2..T9). Disabled sensors report null. ----
#define ENABLE_TEMP       (!AQUANODE_DEMO_READINGS)
#define ENABLE_TURBIDITY  (!AQUANODE_DEMO_READINGS)
#define ENABLE_PH         (!AQUANODE_DEMO_READINGS)
#define ENABLE_PUMP       (!AQUANODE_DEMO_READINGS)
#define ENABLE_FEEDER     (!AQUANODE_DEMO_READINGS)
#define ENABLE_CLOUD      1        // 0 = offline, Serial only (T8 Integration I)

// ---- Pins: follow AquaNode_Schematic_v1 (KiCad) except the relay, see below ----
// Analog sensors stay on ADC1 (GPIO32-39), because ADC2 stops working when WiFi is on.
#define PIN_PH          35         // schematic: U4 Po -> R3 10k / R2 20k -> IO35
#define PIN_TURBIDITY   34         // schematic: U3 A  -> R4 10k / R5 20k -> IO34
#define PIN_TEMP        25         // schematic: U2 DQ -> IO25, R1 4.7k pull-up to 3.3V
#define PIN_SERVO       13         // schematic: M1 PWM -> IO13
// Relay: the schematic drives an NPN from IO0, but IO0 is a boot pin (held LOW at reset = the board
// boots into download mode instead of running). We use the relay MODULE on IO26 instead.
#define PIN_PUMP_RELAY  26
// Pump relay levels on PIN_PUMP_RELAY: Start pump = LOW, Stop pump = HIGH (active-LOW relay module).
// Bare NPN + relay (schematic K1/Q1) needs the opposite: swap the two values.
#define PUMP_ON_LEVEL   LOW
#define PUMP_OFF_LEVEL  HIGH
// 1 = open-drain: Start pulls GPIO 26 to GND, Stop releases it (the relay module pulls IN up to its own
// VCC). Stops the module's 5 V from back-feeding into the 3.3 V pin, which can leave the relay half on.
// Set 0 for a bare NPN driver (needs a real HIGH to switch on).
#define PUMP_OPEN_DRAIN 1

// ---- Feeder servo (SGD90-360 is very likely a continuous-rotation servo) ----
// Bench check: press "Feed now". Keeps spinning then stops -> continuous (1). Twitches to an angle and back -> positional (0).
#define FEEDER_CONTINUOUS 1
// Continuous: pulse width that means "stop". If it creeps while idle, nudge between 1450..1550.
#define SERVO_STOP_US   1500
#define SERVO_SPIN_US   1300       // forward speed; further from STOP = faster. Use 1700 to reverse direction.
// Feed Portion 1/2/3 (small/medium/large) -> spin time in ms (continuous) or sweep angle in degrees (positional).
#define PORTION_SPIN_MS  { 3000, 3000, 3000 }   // bench test: every portion spins 3 s; tune per portion on the tank
#define PORTION_DEG      { 45, 90, 135 }

// ---- Voltage divider on 5V analog sensors: module out -> R_TOP -> pin -> R_BOTTOM -> GND ----
#define R_TOP     10000.0f
#define R_BOTTOM  20000.0f
#define DIVIDER_RATIO ((R_TOP + R_BOTTOM) / R_BOTTOM)   // pin voltage * ratio = module voltage

// ---- Calibration (T14). pH = PH_SLOPE * V + PH_OFFSET, V = module output voltage ----
// Typical PH-4502C: ~2.5 V at pH 7, ~-5.7 pH per volt. Replace with 2-point buffer calibration.
#define PH_SLOPE   -5.70f
#define PH_OFFSET  21.34f
// Turbidity: SEN0189 datasheet curve (valid ~2.5-4.2 V). TURB_V_OFFSET shifts so clear water reads ~0 NTU.
#define TURB_V_OFFSET 0.0f        // default only: "cal turbidity" in the Serial Monitor measures and saves the real one

#define SAMPLES 20                 // analog samples per reading (median-ish average)
#define COMMAND_EXPIRE_MS (5UL * 60UL * 1000UL)
