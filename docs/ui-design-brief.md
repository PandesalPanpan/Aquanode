# Dashboard UI Redesign — Brief

Status: **planned for after Thursday's Bench Prototype** (current simple UI is enough for testing). Only `web/src/App.jsx`, `web/src/styles.css`, and assets change — `web/src/data/transport.js` stays untouched.

## Principles
1. **Layman first.** Anyone (a teacher, a parent, a judge) understands the screen in 2 seconds with no technical knowledge.
2. **Animations mirror the hardware.** Every animation shows something the device is actually doing — no decorative motion.
3. **Data stays readable.** Numbers and status words always win over effects and background.
4. **Fast on phones.** Optimized assets, animations respect `prefers-reduced-motion`.

## Plain-language wording
| Technical (now) | Layman (redesign) |
|---|---|
| pH | **Water acidity** (pH 7.2) |
| Turbidity 12 NTU | **Water clarity**: Clear / Slightly cloudy / Cloudy (NTU in small print) |
| Temperature | **Water temperature** |
| safe / too high / too low | **Good** ✓ / **Needs attention** + a one-line reason ("Water is too warm for the fish") |
| Online / Offline | "AquaNode is connected" / "AquaNode hasn't reported in 3 min" |
| Events: fed, feed_skipped, pump_on | "Fish were fed at 8:00 AM" · "Feeding skipped — water too cloudy" · "Water pump started" |
| Settings: onMin / offMin, sweepDeg | "Run the pump for **15** minutes, then rest **45** minutes" · "Food portion: small / medium / large" |
| Safe Range min/max | "Keep acidity between **6.8** and **7.6**" (with a short "why" hint) |

## Animations (tied to real state)
| Hardware state | Animation |
|---|---|
| **Pump running** (`status.pumpOn`) | Bubbles rising + gentle water flow in the pump card; stops when the pump stops |
| **Feeding** (new `fed` event) | Food pellets (small circles) drop from a feeder icon and sink |
| **Feeding skipped** | Pellets stop at the top, feeder shakes "no", cloudy overlay |
| **Water clarity** | Water illustration gets murkier as turbidity rises |
| **Reading arrives** | Numbers count to the new value; subtle pulse on the tile |
| **Needs attention** | Tile glows amber/red with a soft pulse (not flashing) |
| **Offline** | Scene desaturates, "sleeping" state |

## Background
- **Photo of our own AquaNode aquarium** (taken after Final Assembly) — unique and real, not stock/abstract.
- Placeholder until then: free-license photo (Unsplash/Pexels, "aquaponics" / "planted aquarium"), credited.
- Treatment: dimmed + blurred behind frosted-glass cards so text stays readable.
- Delivery: AVIF + WebP fallback, ~1920px wide desktop / ~1080px mobile variant, target ≤ 300 KB each.

## Tutorial tie-in
Redesign gets its own chapter/clip: before vs. after, and each animation shown triggering from the real hardware (press Feed now → servo turns AND pellets drop on screen).
