#include "sensors.h"
#include "config.h"
#include <OneWire.h>
#include <DallasTemperature.h>
#include <Preferences.h>

// Clear-water turbidity offset: starts at TURB_V_OFFSET, replaced by "cal turbidity" (saved in flash).
static float turbOffset = TURB_V_OFFSET;

static OneWire oneWire(PIN_TEMP);
static DallasTemperature ds(&oneWire);

void sensorsBegin() {
  analogSetAttenuation(ADC_11db);     // full 0-3.3 V range
  Preferences p; p.begin("aquanode", true);
  if (p.isKey("turbOff")) {
    turbOffset = p.getFloat("turbOff", TURB_V_OFFSET);
    Serial.printf("[sensors] turbidity calibration loaded: offset %+.3f V\n", turbOffset);
  }
  p.end();
#if ENABLE_TEMP
  ds.begin();
  Serial.printf("[sensors] DS18B20 found: %d\n", ds.getDeviceCount());
#endif
}

// Average the middle half of SAMPLES sorted readings -> module voltage (before divider).
static float readModuleVolts(int pin) {
  uint32_t mv[SAMPLES];
  for (int i = 0; i < SAMPLES; i++) { mv[i] = analogReadMilliVolts(pin); delay(10); }
  std::sort(mv, mv + SAMPLES);
  uint32_t sum = 0;
  for (int i = SAMPLES / 4; i < SAMPLES * 3 / 4; i++) sum += mv[i];
  return (sum / (float)(SAMPLES / 2)) / 1000.0f * DIVIDER_RATIO;
}

Reading sensorsRead() {
  Reading r;
#if ENABLE_TEMP
  ds.requestTemperatures();
  float t = ds.getTempCByIndex(0);
  r.tempC = (t == DEVICE_DISCONNECTED_C) ? NAN : t;
#endif
#if ENABLE_PH
  r.phV = readModuleVolts(PIN_PH);
  r.ph = PH_SLOPE * r.phV + PH_OFFSET;
#endif
#if ENABLE_TURBIDITY
  float v = readModuleVolts(PIN_TURBIDITY) + turbOffset;
  r.turbidityV = v;
  float vc = constrain(v, 2.5f, 4.2f);
  float ntu = -1120.4f * vc * vc + 5742.3f * vc - 4352.9f;   // SEN0189 datasheet curve
  r.turbidityNTU = max(0.0f, ntu);
#endif
  r.ts = nowMs();
  return r;
}

// Probe must be in CLEAR water. Shifts the reading so clear water sits at the top of the
// SEN0189 curve (4.2 V = about 0 NTU) and saves the offset in flash.
void sensorsCalibrateTurbidity() {
#if ENABLE_TURBIDITY
  float raw = readModuleVolts(PIN_TURBIDITY);
  if (raw < 2.5f) {
    Serial.printf("[cal] turbidity reads %.3f V: too low for clear water. Check the wiring/divider and that the probe is in clear water.\n", raw);
    return;
  }
  turbOffset = 4.2f - raw;
  Preferences p; p.begin("aquanode", false);
  p.putFloat("turbOff", turbOffset);
  p.end();
  Serial.printf("[cal] clear water = %.3f V -> offset %+.3f V saved. Clear water now reads ~0 NTU.\n", raw, turbOffset);
#else
  Serial.println("[cal] turbidity is disabled (ENABLE_TURBIDITY 0)");
#endif
}

void sensorsResetCalibration() {
  Preferences p; p.begin("aquanode", false);
  p.remove("turbOff");
  p.end();
  turbOffset = TURB_V_OFFSET;
  Serial.printf("[cal] turbidity offset back to config.h value (%+.3f V)\n", turbOffset);
}
