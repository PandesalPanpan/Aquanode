# AquaNode — Glossary

**AquaNode** — The whole system: a miniature automated aquaponics balancer that monitors water quality and schedules fish feeding to keep fish and plants in balance.

**Bench Prototype** — Every active component (pH, turbidity, temperature sensors, pump, servo) wired to one ESP32 on a breadboard, tested in a cup/jar of water — *not* in the aquarium. Done when: each part works alone → all run in one sketch → readings reach the backend → dashboard shows live data and can command pump/feeder. Calibration is a stretch goal.

**Reading** — One timestamped snapshot of pH, turbidity, and temperature sent by the ESP32.

**Safe Range** — The min/max a Reading should stay within (per metric). Leaving it raises an Alert.

**Alert** — A notice shown on the dashboard when a Reading leaves its Safe Range.

**Settings** — Everything the user can configure from the app: pump on/off durations, feeding times, Safe Ranges, skip-feed rule on/off. The ESP32 keeps the last Settings it received so it keeps working offline.

**Command** — A one-off manual action sent from the app: pump on/off, feed now.

**Skip-Feed Rule** — If turbidity is outside its Safe Range at feeding time, the scheduled feeding is skipped (overfeeding clouds water). This is what makes AquaNode a *balancer*, not just a monitor.

**Dashboard** — The responsive web app (works on phone and laptop) for viewing Readings/Alerts and changing Settings/sending Commands.

**Final Assembly** — Moving the working Bench Prototype into the aquarium with grow trays, enclosure, and PCB. Comes after the Bench Prototype; out of scope for now.

**Transport** — The single layer (one firmware module, one frontend module) that moves Readings, Settings, Commands, and Alerts between ESP32 and Dashboard. Currently Firebase Realtime Database; designed to be swapped for MQTT (see docs/adr/0001).

**Checkpoint** — A moment in the plan where something works for the first time (marked 🎥). Each Checkpoint gets one short clip (what we test → wiring/code → result) and an entry in the Recording Log. Failures and fixes are recorded too.

**Recording Log** — `docs/recording-log.md`: one line per clip (Checkpoint ID, filename, note), used to assemble the tutorial video later.
