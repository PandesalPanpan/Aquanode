// Servo bench test: keeps the feeder servo (continuous-rotation, IO13) spinning.
// Speeds up gradually so the start-up current is smaller. Prints the reset reason at boot,
// so a "BROWNOUT" line means the servo's power supply is too weak.
// Serial commands (115200, newline): a pulse in microseconds such as 1300, 1500 (stop) or 1700 (reverse),
// "s" to stop, "r" to run again.
#include <Arduino.h>
#include <ESP32Servo.h>

const int PIN_SERVO = 13;
const int STOP_US = 1500;
int runUs = 1300;      // same speed as the feeder firmware
int nowUs = STOP_US;
int targetUs = STOP_US;
Servo servo;

const char* resetName(esp_reset_reason_t r) {
  switch (r) {
    case ESP_RST_POWERON:  return "power on";
    case ESP_RST_BROWNOUT: return "BROWNOUT (voltage dropped: the servo needs its own 5 V supply)";
    case ESP_RST_SW:       return "software";
    case ESP_RST_PANIC:    return "crash";
    case ESP_RST_EXT:      return "reset button";
    default:               return "other";
  }
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.printf("\n=== Servo test (IO%d) ===\nreset reason: %s\n", PIN_SERVO, resetName(esp_reset_reason()));
  Serial.println("commands: <pulse us> e.g. 1300 | 1500 | 1700, s = stop, r = run");
  servo.attach(PIN_SERVO, 500, 2400);
  servo.writeMicroseconds(STOP_US);
  delay(500);
  targetUs = runUs;
}

void loop() {
  // Move 5 us every 20 ms: about 0.8 s from stop to full speed.
  if (nowUs != targetUs) {
    nowUs += (targetUs > nowUs) ? min(5, targetUs - nowUs) : -min(5, nowUs - targetUs);
    servo.writeMicroseconds(nowUs);
    if (nowUs == targetUs) Serial.printf("[servo] at %d us\n", nowUs);
  }

  if (Serial.available()) {
    String s = Serial.readStringUntil('\n');
    s.trim();
    if (s == "s") targetUs = STOP_US;
    else if (s == "r") targetUs = runUs;
    else if (s.toInt() >= 1000 && s.toInt() <= 2000) runUs = targetUs = s.toInt();
    else if (s.length()) Serial.println("use: 1000-2000, s or r");
  }

  static uint32_t last = 0;
  if (millis() - last > 5000) { last = millis(); Serial.printf("[servo] running at %d us, up %lus\n", nowUs, millis() / 1000); }
  delay(20);
}
