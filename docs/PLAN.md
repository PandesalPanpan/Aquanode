# AquaNode — Bench Prototype Plan (Wed Nov 25 – Thu Nov 26, 2026)

Terms in **bold** are defined in [`CONTEXT.md`](../CONTEXT.md). Transport decision: [`adr/0001`](adr/0001-firebase-rtdb-now-mqtt-swappable.md).

## Goal
Reach a working **Bench Prototype** by Thursday night, in this priority order:

| # | Outcome | Checklist ref | Priority |
|---|---|---|---|
| 1 | Each sensor/actuator works alone | II.1 | Must |
| 2 | All run together in one ESP32 sketch (Serial output) | II.3 | Must |
| 3 | ESP32 pushes **Readings** to Firebase | II.4–5 | Should |
| 4 | **Dashboard** shows live data, sends **Commands**, edits **Settings** | II.6–7 | Should |
| 5 | Calibration (pH buffers, turbidity, servo angles) | II.2 | Stretch |

**Out of scope:** aquarium, grow trays, PCB, enclosure (**Final Assembly**), MQTT, native mobile app.

## Decisions (locked)
- **Hardware unknown until Thursday** → all pins/constants in `firmware/include/config.h`; first task Thursday is module identification.
- **Transport:** Firebase Realtime Database, paths named like MQTT topics (swappable later).
- **Dashboard:** React + Vite, responsive (phone + laptop), hosted on Firebase Hosting. Firebase Auth (email/password): one login for you two, one for the device.
- **Firmware:** PlatformIO (VS Code) so the AI agent can build/upload/read Serial from the terminal.
- **Autonomy lives on the ESP32:** pump timer, feeding schedule, Safe Range checks, **Skip-Feed Rule** all run on-device using the last **Settings** received; keeps working if WiFi drops.
- **Time:** ESP32 syncs via NTP, timezone UTC+8.
- **Location Thursday:** home, 2.4 GHz WiFi.

## Architecture

```
 ┌───────────── ESP32 (firmware/) ─────────────┐        ┌── Firebase ──┐       ┌─ Dashboard (web/) ─┐
 │ sensors: pH · turbidity · temp              │        │ Realtime DB  │       │ live tiles + chart │
 │ actuators: pump (relay) · feeder (servo)    │ ─────▶ │ Auth         │ ◀───▶ │ alerts             │
 │ scheduler: pump timer · feed times · rules  │ ◀───── │ Hosting      │       │ controls/settings  │
 │ transport: sendReading/onSettings/onCommand │        └──────────────┘       └────────────────────┘
 └─────────────────────────────────────────────┘
```

## Data model (Realtime Database)

```
aquanode/<deviceId>/
  status      { online, lastSeen, pumpOn, lastFeedTs, fw }
  latest      { ph, turbidityV, turbidityNTU, tempC, ts }
  readings/<pushId>  { ph, turbidityV, turbidityNTU, tempC, ts }      # every readingIntervalSec
  settings    {
    readingIntervalSec: 10,
    pump:  { enabled: true, onMin: 15, offMin: 45 },
    feed:  { enabled: true, times: ["08:00","18:00"], sweepDeg: 90, skipIfTurbid: true },
    safe:  { ph: {min: 6.8, max: 7.6}, tempC: {min: 22, max: 28}, turbidityNTU: {max: 50} }
  }
  commands/<pushId>  { type: "pump_on" | "pump_off" | "feed_now", ts, status: "pending" | "done" }
  alerts/<pushId>    { metric, value, min, max, ts }
  events/<pushId>    { type: "fed" | "feed_skipped" | "pump_on" | "pump_off" | "boot", reason?, ts }
```
Default Safe Ranges are placeholders; tune for your fish species.

## Repo layout
```
CONTEXT.md
docs/  PLAN.md · adr/ · recording-log.md · wiring/ (photos) · datasheets/
firmware/  platformio.ini · include/config.h · include/secrets.h (gitignored)
           src/main.cpp · sensors.* · actuators.* · scheduler.* · transport_firebase.*
web/       React + Vite app; src/data/transport.ts is the only file that talks to Firebase
tools/     fake-device.mjs (simulates the ESP32 so the Dashboard can be built without hardware)
database.rules.json · firebase.json
```

---

## Wednesday Nov 25: software (no hardware needed)

| ID | Task | Done when | 🎥 |
|---|---|---|---|
| W0 | `git init`, folders, `.gitignore` (secrets, node_modules, .pio) | first commit | screen: project intro |
| W1 | Create Firebase project: Realtime DB, Auth (email/password), Hosting; create 2 users (team, device) | console shows DB | 🎥 setup walkthrough |
| W2 | Write `database.rules.json`: only signed-in users can read/write `aquanode/` | rules deployed | — |
| W3 | `tools/fake-device.mjs`: pushes fake Readings every 5 s, applies Settings, executes Commands (marks `done`, logs events), raises Alerts | data streams in console | 🎥 "fake ESP32" demo |
| W4 | Dashboard: login → live tiles (pH/temp/turbidity, color by Safe Range) → history chart → alerts list → controls (pump toggle, Feed now) → Settings form → events log | works against fake device | 🎥 UI tour |
| W5 | Deploy to Firebase Hosting, open on phone | URL works on phone | 🎥 phone demo |
| W6 | Firmware skeleton: PlatformIO project, `config.h`, module stubs, `pio run` compiles | green build | screen: code structure |
| W7 | Hardware prep (teammate): list every module, photograph, find model numbers/datasheets → `docs/datasheets/` | list complete | 📷 photos |

If short on time, W4 order is the priority order; Settings form and events log can slip to Thursday evening.

## Thursday Nov 26: hardware day at home

General rule: **one component at a time, test sketch first, then add to the main firmware.** Every row is a **Checkpoint** → clip + Recording Log line. Swap builder/filmer each Checkpoint.

| ID | Checkpoint | Test | Pass when |
|---|---|---|---|
| T0 | Inventory | Lay out every part, read model numbers, update `config.h` pin map | photo + table filled in |
| T1 | Board alive | Blink LED + "hello" on Serial via `pio run -t upload` + monitor | LED blinks, Serial prints |
| T2 | Temperature | DS18B20 + 4.7kΩ pull-up; hand-warm the probe, then cold water | °C rises/falls sensibly |
| T3 | Turbidity | Clear water vs. water with a few drops of milk/soil | voltage clearly drops when cloudy |
| T4 | pH | Tap water (~7), vinegar (~3), baking-soda water (~8–9) | readings move in the right direction |
| T5 | Relay | Relay alone first (hear the click, LED toggles) | clicks on command |
| T6 | Pump | Pump **submerged** in a container, via relay | water flows on/off |
| T7 | Feeder | Servo sweep 0→90→0 on external 5V | smooth sweep, no ESP32 brownout/reset |
| T8 | Integration I | All in one sketch; Serial prints a full Reading every 10 s; pump timer + feed schedule run (use short test intervals, e.g. 1 min) | runs 15 min without reset |
| T9 | Online | WiFi + Firebase transport; Readings appear in DB | Dashboard shows real data |
| T10 | Remote control | Dashboard: pump toggle + Feed now | physical action within ~3 s |
| T11 | Settings sync | Change pump timing/feed time/Safe Range in Dashboard | ESP32 applies it (Serial confirms) |
| T12 | **Balancer demo** ⭐ | Make water cloudy right before a scheduled feed | feed skipped, `feed_skipped` event + turbidity Alert on Dashboard |
| T13 | Resilience | Unplug router for 1 min | local schedule keeps running; data resumes after reconnect |
| T14 | Stretch: calibration | pH 2-point with buffers (6.86/4.01), turbidity clear-water baseline, servo portion size | values saved in `config.h` |

T12 is the strongest tutorial moment, so film it carefully.

### Default wiring (adjust at T0)

| Part | Power | Signal → ESP32 | Notes |
|---|---|---|---|
| pH module | 5V | analog out → **voltage divider** (10kΩ/20kΩ) → GPIO34 | ADC1 only (ADC2 dies with WiFi) |
| Turbidity module | 5V | analog out → **voltage divider** → GPIO35 | ADC1 only |
| DS18B20 | 3.3V | data → GPIO4, 4.7kΩ data↔3.3V | |
| Relay module | 5V | IN → GPIO26 | check active-LOW vs HIGH |
| Pump | own supply via relay COM/NO | — | never run dry |
| Servo | **external 5V** | PWM → GPIO13 | not from ESP32 3.3V pin |

**All grounds common.** Measure a module's analog output with a multimeter before connecting it to the ESP32 if unsure of its range.

### Bring/check before Thursday
- [ ] Breadboard, jumper wires (M-M, M-F), **data-capable** USB cable
- [ ] Resistors: 2× 10kΩ, 2× 20kΩ (or 2×10kΩ in series), 1× 4.7kΩ
- [ ] Multimeter
- [ ] External 5V supply (2A+) for servo/pump (USB phone charger + cut cable / breakout works)
- [ ] 3 cups/jars: clean water, tap water, cloudy water; vinegar, baking soda, milk
- [ ] Towel, tray — keep water away from the breadboard
- [ ] pH buffer solutions (stretch), keep pH probe tip wet in its storage cap
- [ ] Phone stand/tripod, OBS or Win+Alt+R for screen capture, charged phone

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
| Firebase lib won't build/connect | Use plain HTTPS REST (`HTTPClient`) + poll commands every 2 s |
| Analog readings noisy | Average 20 samples, median filter |
| ESP32 resets when servo/pump starts | Separate 5V supply, common GND, 470–1000 µF cap on 5V rail |
| Board not recognized on USB | Install CP210x / CH340 driver; try another (data) cable |
| MQTT turns out to be required | Swap transport modules per ADR 0001 (~2–3 h) |

## Open items
- Confirm servo, power supply, pH buffers availability.
- Confirm team split (proposed: you = W0–W6 software, teammate = W7 hardware prep; Thursday rotate builder/filmer).
- Ask instructor whether MQTT is required.
