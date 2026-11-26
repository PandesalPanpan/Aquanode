#pragma once
// Local wall clock for the feeding schedule. Internet time (NTP) is the source of truth when online;
// otherwise the clock keeps running from the last good time, so the schedule also runs offline.
#include <Arduino.h>

void clockBegin();                      // timezone + restore the last saved time from flash (if the clock is unset)
void clockLoop();                       // saves the time to flash every few minutes
bool clockSetLocal(const String& text); // "YYYY-MM-DD HH:MM" in local time (console); false if it can't parse
bool clockSynced();                     // internet time has set the clock since this boot
const char* clockSource();              // "internet", "console", "saved", "kept" (survived a reset) or "none"
void clockPrint();                      // prints the current time and where it came from
