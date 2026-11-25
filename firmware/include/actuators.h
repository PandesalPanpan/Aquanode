#pragma once
#include <stdint.h>
void actuatorsBegin();
void pumpSet(bool on);
bool pumpIsOn();
void feederSetStopUs(int us);       // bench trim of SERVO_STOP_US without re-uploading
void feederHoldStop(uint32_t ms);  // send the stop pulse for ms, to see if the servo creeps
void feederRun(uint8_t portion);   // portion 1..3 -> spin time or sweep angle (see config.h)
