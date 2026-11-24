#pragma once
#include "model.h"
bool settingsFromJson(const String& json, Settings& out);
void settingsLoad(Settings& s);              // from flash (NVS); keeps defaults if none saved
void settingsSave(const String& json);       // so Settings survive reboot without WiFi
