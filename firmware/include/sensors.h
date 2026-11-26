#pragma once
#include "model.h"
void sensorsBegin();
Reading sensorsRead();
void sensorsCalibrateTurbidity();         // console "cal turbidity": probe in clear water, offset saved in flash
void sensorsResetCalibration();           // console "cal reset": back to TURB_V_OFFSET from config.h
