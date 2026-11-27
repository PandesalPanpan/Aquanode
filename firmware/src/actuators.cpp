#include "actuators.h"
#include "config.h"
#include <Arduino.h>
#include <ESP32Servo.h>

static bool pumpOn = false;
static Servo servo;
#if FEEDER_CONTINUOUS
static int stopUs = SERVO_STOP_US;
#endif

void feederSetStopUs(int us) {
#if FEEDER_CONTINUOUS
  stopUs = constrain(us, 1000, 2000);
  Serial.printf("[feeder] stop pulse = %d us (copy into SERVO_STOP_US when it holds still)\n", stopUs);
#else
  Serial.println("[feeder] stop trim only applies when FEEDER_CONTINUOUS is 1");
#endif
}

void feederHoldStop(uint32_t ms) {
#if FEEDER_CONTINUOUS && ENABLE_FEEDER
  servo.attach(PIN_SERVO, 500, 2400);
  servo.writeMicroseconds(stopUs); delay(ms);
  servo.detach();
#endif
}

void actuatorsBegin() {
#if ENABLE_PUMP
  // Set the Stop level (HIGH) before making the pin an output: a pin that becomes an output
  // while LOW would start the pump for a moment at every boot.
  digitalWrite(PIN_PUMP_RELAY, PUMP_OFF_LEVEL);
#if PUMP_OPEN_DRAIN
  pinMode(PIN_PUMP_RELAY, OUTPUT_OPEN_DRAIN);   // HIGH = released (floats up to the module's VCC)
#else
  pinMode(PIN_PUMP_RELAY, OUTPUT);
#endif
#endif
  pumpSet(false);
}

// Start pump -> pin LOW. Stop pump -> pin HIGH.
void pumpSet(bool on) {
  pumpOn = on;
  const uint8_t level = on ? PUMP_ON_LEVEL : PUMP_OFF_LEVEL;
#if ENABLE_PUMP
  digitalWrite(PIN_PUMP_RELAY, level);
#endif
  Serial.printf("[pump] %s (GPIO %d = %s)\n", on ? "ON" : "OFF", PIN_PUMP_RELAY,
                level == LOW ? "LOW" : (PUMP_OPEN_DRAIN ? "HIGH, released" : "HIGH"));
}

bool pumpIsOn() { return pumpOn; }

#if FEEDER_CONTINUOUS && ENABLE_FEEDER
// Steps the pulse 5 us every 20 ms (about 0.8 s from stop to full speed) to keep the start-up current low.
static void rampServo(int fromUs, int toUs) {
  for (int us = fromUs; us != toUs;) {
    us += (toUs > us) ? min(5, toUs - us) : -min(5, us - toUs);
    servo.writeMicroseconds(us);
    delay(20);
  }
}
#endif

// One feeding. Servo is detached afterwards to stop jitter/creep and save power.
void feederRun(uint8_t portion) {
  const int i = constrain((int)portion, 1, 3) - 1;
#if FEEDER_CONTINUOUS
  // Continuous-rotation servo: pulse width sets speed/direction, so a portion is a spin TIME.
  static const uint16_t spinMs[3] = PORTION_SPIN_MS;
  Serial.printf("[feeder] portion %d: spin %u ms\n", i + 1, spinMs[i]);
#if ENABLE_FEEDER
  servo.attach(PIN_SERVO, 500, 2400);
  servo.writeMicroseconds(stopUs); delay(100);
  rampServo(stopUs, SERVO_SPIN_US);   // gradual start: a sudden one browns out the ESP32 on USB power
  delay(spinMs[i]);
  rampServo(SERVO_SPIN_US, stopUs);
  delay(200);
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
