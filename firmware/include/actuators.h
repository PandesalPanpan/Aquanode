#pragma once
#include <stdint.h>
void actuatorsBegin();
void pumpSet(bool on);
bool pumpIsOn();
void feederRun(uint8_t portion);   // portion 1..3 -> spin time or sweep angle (see config.h)
