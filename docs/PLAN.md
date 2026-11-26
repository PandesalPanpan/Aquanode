# AquaNode — Bench Prototype Plan (Wed Nov 25 – Thu Nov 26, 2026)

Terms in **bold** are defined in [`CONTEXT.md`](../CONTEXT.md). See the [MQTT bench setup](mqtt.md) for the current transport and startup steps.

## Goal
Reach a working **Bench Prototype** by Thursday night, in this priority order:

| # | Outcome | Checklist ref | Priority |
|---|---|---|---|
| 1 | Each sensor/actuator works alone | II.1 | Must |
| 2 | All run together in one ESP32 sketch (Serial output) | II.3 | Must |
| 3 | ESP32 publishes **Readings** over MQTT and the bridge writes them to Firebase | II.4–5 | Should |
| 4 | **Dashboard** shows live data, sends **Commands**, edits **Settings** | II.6–7 | Should |
| 5 | Calibration (pH buffers, turbidity, servo angles) | II.2 | Stretch |

**Out of scope:** aquarium, grow trays, PCB, enclosure (**Final Assembly**) and native mobile app.

## Decisions (locked)
- **Hardware unknown until Thursday** → all pins/constants in `firmware/include/config.h`; first task Thursday is module identification.
- **Transport** uses MQTT from the ESP32 to a broker. A bridge synchronizes messages with Firebase Realtime Database.
- **Dashboard:** React + Vite, responsive (phone + laptop), hosted on Firebase Hosting. Firebase Auth (email/password): one login for you two, one for the bridge.
- **Firmware:** PlatformIO (VS Code) so the AI agent can build/upload/read Serial from the terminal.
- **Autonomy lives on the ESP32:** pump timer, feeding schedule, Safe Range checks, **Skip-Feed Rule** all run on-device using the last **Settings** received; keeps working if WiFi drops.
- **Time:** ESP32 syncs via NTP, timezone UTC+8.
- **Location Thursday:** home, 2.4 GHz WiFi.

## Architecture

```
 ESP32 <-> MQTT broker <-> bridge <-> Firebase Realtime Database <-> Dashboard
```

## Data model (Realtime Database)

```
aquanode/<deviceId>/
  status      { online, lastSeen, pumpOn, lastFeedTs, fw }
  latest      { ph, turbidityV, turbidityNTU, tempC, ts }
  readings/<messageId>  { ph, turbidityV, turbidityNTU, tempC, ts }      # every readingIntervalSec
  settings    {
    readingIntervalSec: 10,
    pump:  { enabled: true, onMin: 15, offMin: 45 },
    feed:  { enabled: true, times: ["08:00","18:00"], portion: 2, skipIfTurbid: true },
    safe:  { ph: {min: 6.8, max: 7.6}, tempC: {min: 22, max: 28}, turbidityNTU: {max: 50} }
  }
  commands/<pushId>  { type: "pump_on" | "pump_off" | "feed_now", ts, status: "pending" | "done" | "expired" | "uncertain" | "failed", doneTs? }
  alerts/<messageId>    { metric, value, min, max, ts }
  events/<messageId>    { type: "fed" | "feed_skipped" | "pump_on" | "pump_off" | "boot", reason?, ts }
```
Default Safe Ranges are placeholders; tune for your fish species.

## Repo layout
```
CONTEXT.md
docs/  PLAN.md · adr/ · recording-log.md · wiring/ (photos) · datasheets/
firmware/  platformio.ini · include/config.h · include/secrets.h (gitignored)
           src/main.cpp · sensors.* · actuators.* · settings_store.* · transport_mqtt.*
web/       React + Vite app; src/data/transport.js is the only file that talks to Firebase
tools/     mqtt-bridge.mjs · fake-device.mjs · smoke-test.mjs
database.rules.json · firebase.json
```

---

## Wednesday Nov 25: software (no hardware needed)

| ID | Task | Done when | 🎥 |
|---|---|---|---|
| W0 | `git init`, folders, `.gitignore` (secrets, node_modules, .pio) | first commit | screen: project intro |
| W1 | Create Firebase project: Realtime DB, Auth (email/password), Hosting; create 2 users (team, device) | console shows DB | 🎥 setup walkthrough |
| W2 | Write `database.rules.json`: only signed-in users can read/write `aquanode/` | rules deployed | — |
| W3 | `tools/fake-device.mjs` publishes Readings over MQTT, applies Settings, and acknowledges Commands. The bridge syncs with Firebase | data streams in console | 🎥 "fake ESP32" demo |
| W4 | Dashboard: login → live tiles (pH/temp/turbidity, color by Safe Range) → history chart → alerts list → controls (pump toggle, Feed now) → Settings form → events log | works against fake device | 🎥 UI tour |
| W5 | Deploy to Firebase Hosting, open on phone | URL works on phone | 🎥 phone demo |
| W6 | Firmware skeleton: PlatformIO project, `config.h`, module stubs, `pio run` compiles | green build | screen: code structure |
| W7 | Hardware prep (teammate): list every module, photograph, find model numbers/datasheets → `docs/datasheets/` | list complete | 📷 photos |

If short on time, W4 order is the priority order; Settings form and events log can slip to Thursday evening.

## Thursday Nov 26: hardware day at home

Start with the [Thursday MQTT handoff](mqtt.md#thursday-handoff--november-26-2026) for the verified baseline and the board-only MQTT check.

General rule: **upload the full firmware once, then wire one component at a time and test it from the [bench test console](#bench-test-console-no-wifi-needed)** (no re-upload unless `config.h` changes). T0–T8 work without internet; T9–T13 need the MQTT broker + bridge from [mqtt.md](mqtt.md). Every row is a **Checkpoint** → clip + Recording Log line. Swap builder/filmer each Checkpoint.

| ID | Checkpoint | Test | Pass when |
|---|---|---|---|
| T0 | Inventory | Lay out every part, read model numbers, update `config.h` pin map | photo + table filled in |
| T1 | Board alive | Upload full firmware once: `pio run -e esp32dev -t upload`, then `pio device monitor` | banner + console help line print |
| T2 | Temperature | DS18B20 module on **3.3V**, DAT → GPIO25; press EN to reboot; `read`; hand-warm probe, then cold water | `DS18B20 found: 1`; °C rises/falls sensibly |
| T3 | Turbidity | Multimeter on module output first; then output → divider → GPIO34; `read` in clear vs. milky water | voltage clearly drops when cloudy |
| T4 | pH | PO → divider → GPIO35; wait 1 min warm-up; `read` in tap water (~7), vinegar (~3), baking-soda water (~8–9); note the raw volts | readings move in the right direction |
| T5 | Relay | Relay alone (no pump): `pump on` / `pump off` | clicks; if reversed set `RELAY_ACTIVE_LOW 0` and re-upload |
| T6 | Pump | Pump **submerged first**, power-bank 5V via relay COM/NO, 1N4007 across pump; `pump on` / `pump off` | water flows on/off |
| T7 | Feeder | Servo on power-bank 5V, signal → GPIO13, capacitor on the 5V rail; `feed 1`/`2`/`3`; tune with `stop <us>` | spins & stops cleanly, no creep, no ESP32 reset |
| T8 | Integration I | Everything wired at once; Serial prints a full Reading every 10 s; offline feed test: `time <today> 07:59` → the 08:00 default feed runs a minute later | runs 15 min without reset; scheduled feed runs offline |
| T9 | Online | Wi-Fi + MQTT; Readings reach Firebase through the bridge | Dashboard shows real data |
| T10 | Remote control | Dashboard: pump toggle + Feed now | physical action within ~3 s |
| T11 | Settings sync | Change pump timing/feed time/Safe Range in Dashboard | ESP32 applies it (Serial confirms) |
| T12 | **Balancer demo** ⭐ | Make water cloudy right before a scheduled feed | feed skipped, `feed_skipped` event + turbidity Alert on Dashboard |
| T13 | Resilience | Unplug router for 1 min | local schedule keeps running; data resumes after reconnect |
| T15 | Wi-Fi Setup Mode (after T9) | No saved Wi-Fi, or hold BOOT 3 s after startup → ESP32 opens `AquaNode-Setup`; phone joins, picks the 2.4 GHz network, enters password | ESP32 joins the new Wi-Fi and keeps it after a reboot; a router outage (T13) never opens Setup Mode |
| T16 | Stretch: Alert push | Dashboard installed on a phone (iPhone: iOS 16.4+, added to Home Screen); allow notifications; make water cloudy | phone shows the turbidity Alert with the app closed. Console prep done: FCM API (V1) enabled, Web Push key in `web/push-config.json`; still needs a service-account key for the bridge + the code |
| T14 | Stretch: calibration | Turbidity clear-water baseline (`cal turbidity`, do it before T12), servo portion size (pH buffers skipped; pH stays uncalibrated) | values saved in `config.h` |

T12 is the strongest tutorial moment, so film it carefully.

### Bench test console (no WiFi needed)
Open the Serial Monitor (`pio device monitor`, 115200) and type:
`read` (all sensors + raw pH/turbidity volts) · `pump on` / `pump off` · `feed 1|2|3` · `stop <us>` (try a servo stop pulse for 3 s; when it holds still, copy the value into `SERVO_STOP_US`) · `time` / `time YYYY-MM-DD HH:MM` (show or set the clock offline) · `cal turbidity` (probe in clear water; saves the offset in flash) · `cal reset` · `help`.

After a restart the pump starts **OFF** and the timer switches it on after the off-duration (default 45 min). The feeding schedule runs from the board's own clock: internet time when online, otherwise the last saved time (saved every 5 min) or a time set with `time`.
Use the raw pH volts in buffer solutions for the T14 calibration.

### Default wiring (follows `AquaNode_Schematic_v1`, except the relay)

| Part | Power | Signal → ESP32 | Notes |
|---|---|---|---|
| pH module | 5V | analog out → **voltage divider** (10kΩ/20kΩ) → GPIO35 (R3/R2) | ADC1 only (ADC2 dies with WiFi) |
| Turbidity module | 5V | analog out → **voltage divider** (10kΩ/20kΩ) → GPIO34 (R4/R5) | ADC1 only |
| DS18B20 module | **3.3V** (not 5V) | data → GPIO25 | 4.7kΩ pull-up DQ→3.3V (R1); a module board already has it |
| Relay module | 5V | IN → GPIO26 | check active-LOW vs HIGH. The schematic drives a bare relay via NPN from IO0: not used, IO0 is a boot pin |
| Pump | own supply via relay COM/NO | — | never run dry |
| Servo (SGD90-360, continuous) | **external 5V** | PWM → GPIO13 | not from ESP32 3.3V pin |
| Power bank (via USB breakout) | 5V rail for pump, servo, relay, pH, turbidity | — | buck converter not used on the bench; GND common with ESP32 |

**All grounds common.** Measure a module's analog output with a multimeter before connecting it to the ESP32 if unsure of its range.

### Bring/check before build day
See **[parts-list.md](parts-list.md)**: full list for our exact modules, with what we have vs. still need, plus the bench power layout.

## Recording protocol
- Each 🎥/Checkpoint → one clip, 30 s–3 min: **what we're testing → wiring/code → result**.
- Film failures too (20 s: what broke, why, the fix).
- Log every clip in `docs/recording-log.md` immediately.
- File names: `<ID>_<short-name>_<take>.mp4`, e.g. `T4_ph-vinegar_1.mp4`.
- Photo of the breadboard after each hardware Checkpoint → `docs/wiring/<ID>.jpg`.

## Risks & fallbacks
| Risk | Fallback |
|---|---|
| Servo / power supply not available | Code + Dashboard button exist; film T7 later |
| Analog readings noisy | Average 20 samples, median filter |
| ESP32 resets when servo/pump starts | Separate 5V supply, common GND, 470–1000 µF cap on 5V rail |
| Board not recognized on USB | Install CP210x / CH340 driver; try another (data) cable |

## Open items
- Confirm servo, power supply, pH buffers availability.
- Confirm team split (proposed: you = W0–W6 software, teammate = W7 hardware prep; Thursday rotate builder/filmer).
- Verify the MQTT round trip with the simulator before connecting the ESP32.
