#pragma once
// The ONLY firmware interface to the backend (see docs/adr/0001). Implemented by transport_mqtt.cpp.
#include "model.h"

typedef void (*SettingsHandler)(const String& json);
// Return the final command status to record: "done" or "expired".
typedef const char* (*CommandHandler)(const String& type, uint64_t ts);

void transportBegin(SettingsHandler onSettings, CommandHandler onCommand);  // Wi-Fi, NTP, and MQTT configuration
void transportLoop();                    // start MQTT and dispatch incoming Settings and Commands
bool transportReady();
void sendReading(const Reading& r);
void sendStatus(const Status& s);
void sendAlert(const char* metric, float value, const Range& r, uint64_t ts);
void sendEvent(const char* type, const String& reason = "");
