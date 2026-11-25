#include "sensors.h"
#include "config.h"
#include <OneWire.h>
#include <DallasTemperature.h>

static OneWire oneWire(PIN_TEMP);
static DallasTemperature ds(&oneWire);

void sensorsBegin() {
  analogSetAttenuation(ADC_11db);     // full 0-3.3 V range
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
  float v = readModuleVolts(PIN_TURBIDITY) + TURB_V_OFFSET;
  r.turbidityV = v;
  float vc = constrain(v, 2.5f, 4.2f);
  float ntu = -1120.4f * vc * vc + 5742.3f * vc - 4352.9f;   // SEN0189 datasheet curve
  r.turbidityNTU = max(0.0f, ntu);
#endif
  r.ts = nowMs();
  return r;
}
