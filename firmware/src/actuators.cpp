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

// One feeding: 0 -> deg -> 0. Servo is detached afterwards to stop jitter and save power.
void feederSweep(int deg) {
  Serial.printf("[feeder] sweep %d deg\n", deg);
#if ENABLE_FEEDER
  servo.attach(PIN_SERVO, 500, 2400);
  servo.write(0);   delay(400);
  servo.write(constrain(deg, 0, 180)); delay(600);
  servo.write(0);   delay(600);
  servo.detach();
#endif
}
