# 1. Firebase Realtime Database now, MQTT-swappable later

Date: 2026-11-24 · Status: Superseded by the [MQTT bench architecture](../mqtt.md) after the course confirmed MQTT.

## Context
The course lesson covered MQTT, but it is unconfirmed whether the rubric requires it. MQTT needs a broker plus an always-on bridge to persist history, which neither Vercel (serverless) nor Firebase provides natively. The Bench Prototype must be built Wed–Thu, Nov 25–26.

## Decision
Use Firebase Realtime Database as the only transport between ESP32 and Dashboard. Keep MQTT a drop-in replacement by:
- Naming DB paths like MQTT topics: `aquanode/<deviceId>/{readings,settings,commands,alerts}`.
- Isolating all communication in one firmware module (`transport`: `sendReading`, `onSettings`, `onCommand`) and one frontend data module.

## Consequences
- Fewest moving parts for Thursday; history storage for free.
- If MQTT becomes required: add HiveMQ Cloud broker + a small bridge to persist Readings, and rewrite only the two transport modules.
