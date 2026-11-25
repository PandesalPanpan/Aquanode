#include "actuators.h"
#include "config.h"
#include <Arduino.h>
#include <ESP32Servo.h>

static bool pumpOn = false;
static Servo servo;

void actuatorsBegin() {
#if ENABLE_PUMP
  pinMode(PIN_PUMP_RELAY, OUTPUT);
#endif
  pumpSet(false);
}

void pumpSet(bool on) {
  pumpOn = on;
#if ENABLE_PUMP
  digitalWrite(PIN_PUMP_RELAY, (on ^ RELAY_ACTIVE_LOW) ? HIGH : LOW);
#endif
  Serial.printf("[pump] %s\n", on ? "ON" : "OFF");
}

bool pumpIsOn() { return pumpOn; }

// One feeding. Servo is detached afterwards to stop jitter/creep and save power.
void feederRun(uint8_t portion) {
  const int i = constrain((int)portion, 1, 3) - 1;
#if FEEDER_CONTINUOUS
  // Continuous-rotation servo: pulse width sets speed/direction, so a portion is a spin TIME.
  static const uint16_t spinMs[3] = PORTION_SPIN_MS;
  Serial.printf("[feeder] portion %d: spin %u ms\n", i + 1, spinMs[i]);
#if ENABLE_FEEDER
  servo.attach(PIN_SERVO, 500, 2400);
  servo.writeMicroseconds(SERVO_STOP_US); delay(100);
  servo.writeMicroseconds(SERVO_SPIN_US); delay(spinMs[i]);
  servo.writeMicroseconds(SERVO_STOP_US); delay(200);
  servo.detach();
#endif
#else
  // Positional 180-degree servo: a portion is a sweep 0 -> deg -> 0.
  static const uint8_t degs[3] = PORTION_DEG;
  Serial.printf("[feeder] portion %d: sweep %u deg\n", i + 1, degs[i]);
#if ENABLE_FEEDER
  servo.attach(PIN_SERVO, 500, 2400);
  servo.write(0);       delay(400);
  servo.write(degs[i]); delay(600);
  servo.write(0);       delay(600);
  servo.detach();
#endif
#endif
}
