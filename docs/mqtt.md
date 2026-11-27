# MQTT bench setup

The Dashboard keeps Firebase Auth, Hosting, and Realtime Database. The ESP32 and simulator publish and subscribe to the MQTT broker. Run one bridge for this device to relay traffic between Firebase and the broker. The laptop can run the bridge for Thursday's demo. For remote access after the laptop shuts down, run the bridge on an always-on host.

## Thursday handoff · November 26, 2026

- **Verified on November 25.** The local MQTT and Firebase emulator smoke test passed for live Readings, history, Settings, pump and feeder Commands, duplicate Feed Now delivery, and expiry. A separate browser check showed a simulated Reading and an acknowledged pump toggle. The Dashboard and both ESP32 firmware configurations built successfully.
- **First hardware check.** The hosted broker still needs to be set up and the live bridge started. The existing gitignored `firmware/include/secrets.h` needs the MQTT settings from `secrets.example.h`. PlatformIO detected no ESP32 over USB on November 25, so connect the board and use the sensor-free `esp32dev-mqtt-bench` build first. Verify a fresh Reading and a pump Command acknowledgment from a phone on mobile data. Stop the simulator before this check.
- **After MQTT works on the board.** Use checkpoint T0 in the [bench plan](PLAN.md) to identify the actual modules. Confirm pin assignments, signal voltages, and relay polarity. Update `firmware/include/config.h` and adjust `firmware/src/sensors.cpp` if the sensor interface or conversion curve differs. Flash `esp32dev` after the individual parts pass, then run the plan's T9–T13 checks. Record the demo results in the [recording log](recording-log.md).

## Hosted setup

1. Create a private MQTT broker with TLS and MQTT 3.1.1 support. Give the ESP32 and bridge separate credentials. Keep the broker address, credentials, and root CA outside Git.
2. Run `npm --prefix tools ci`. In the bridge's environment, set `AQUANODE_MQTT_URL` to the broker's `mqtts://host:port`, set `AQUANODE_MQTT_USERNAME` and `AQUANODE_MQTT_PASSWORD`, and set `AQUANODE_EMAIL` and `AQUANODE_PASSWORD` to the Firebase device account already used by the project. If the broker uses a private CA, set `AQUANODE_MQTT_CA_FILE` to its PEM file. Start the process with `npm --prefix tools run bridge`.
3. For a dry run, run `npm --prefix tools run fake` in a second terminal with the same broker URL and the device-side MQTT credentials. Sign in to the Dashboard and check live readings, history, the pump control, and Feed Now. Stop the simulator before the real ESP32 connects because both use `bench-01`.
4. Fill in the Wi-Fi and MQTT definitions in `firmware/include/secrets.h` using `secrets.example.h` as the template. Use the broker's root CA for `AQUANODE_MQTT_CA`. From `firmware`, run `pio run -e esp32dev-mqtt-bench -t upload` for a board-only test with fixed readings and actuators disabled. Open `pio device monitor` and look for `[mqtt] connected`. From a phone on mobile data, open the hosted Dashboard and verify a Reading and a Command acknowledgment. Use `pio run -e esp32dev -t upload` after verifying the real parts and wiring.
5. To run the API checks against a live Firebase project, set `AQUANODE_TEAM_EMAIL` and `AQUANODE_TEAM_PASSWORD`, then run `npm --prefix tools run smoke` while the simulator is connected. This sends a Feed Now command and toggles the pump, so use the simulator or the board-only build for this check.

## Topics and access

All topics start with `aquanode/bench-01/`. Limit broker credentials to that prefix and these directions.

| Topic suffix | Publisher | Subscriber | Contents |
| --- | --- | --- | --- |
| `readings`, `alerts`, `events` | Device | Bridge | Existing Firebase payload plus a message ID for deduplication |
| `status` | Device | Bridge | Device status and `lastSeen` |
| `settings` | Bridge | Device | Current Settings, retained by the broker |
| `commands` | Bridge | Device | Firebase Command ID, type, and timestamp |
| `command-results` | Device | Bridge | Command ID, result, and completion timestamp |

Commands are sent without retention. The bridge retries pending Commands and expires them after five minutes. The ESP32 persists recent Command IDs before calling the hardware. A restart after the claim and before saving the result can produce `uncertain` and leaves that Command ineligible for another actuation. `failed` means the device or bridge rejected the Command. The Firebase command record shows the result. The Dashboard determines whether the device is online from the age of `lastSeen`.

## Local verification

Install the tooling dependencies using `npm --prefix tools ci`. With Firebase CLI and Java 21 available, run this from the project root. On this PC, the `java` on PATH is Java 8, so first run `$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"` (`JAVA_HOME` is `Y:\Android\jdk-21`).

```powershell
firebase emulators:exec --project demo-aquanode --only auth,database "node tools/mqtt-smoke.mjs"
```

The test starts a loopback MQTT broker and uses the Auth and Realtime Database emulators. It checks live Readings, history, Settings (including that readings actually arrive every 2 s and then every 6 s after the reading interval changes), pump and feeder Commands, duplicate delivery, and expiry. `npm --prefix tools run test:interval` checks the reading-interval limits on their own, without emulators.

To try the Dashboard with no ESP32, run the whole system locally and leave it running:

```powershell
firebase emulators:exec --project demo-aquanode --only auth,database "node tools/local-sim.mjs"
```

Then, in a second terminal, set `$env:VITE_AQUANODE_EMULATORS = '1'` and run `npm --prefix web run dev`. Sign in as `team@example.test` with password `emu-team-password`. The reading interval (Settings → "Checking the water") accepts whole seconds from 2 to 3600. The Dashboard, simulator and firmware all apply the same limits.
