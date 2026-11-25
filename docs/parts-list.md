# Bench Prototype — Parts List

Everything needed on the table to build the Bench Prototype with our exact modules.
✅ = we already have it · 🛒 = get before build day · ⭐ = optional/stretch.

## 1. Main parts (already bought)

| ✓ | Part | Notes for build day |
|---|---|---|
| ✅ | ESP32 DevKit (WROOM-32) | Powered from the laptop USB during the bench test |
| ✅ | DS18B20 waterproof probe + module | Power the module from **3.3V**, not 5V (its pull-up would put 5V on the ESP32 pin). The module already has the 4.7kΩ pull-up resistor |
| ✅ | SGD90-360 servo (continuous rotation) | Runs from the **external 5V**, not the ESP32 |
| ✅ | 5V waterproof mini pump + tubes | Switched by the relay; must always be **under water** when running |
| ✅ | DIYMore pH probe + module (PH-4502C type) | 5V; use the **PO** pin; output goes through a divider |
| ✅ | Turbidity probe + module (B0G4MDZW62) | 5V; analog output goes through a divider; if the board has an A/D switch, set it to **A** |
| ✅ | 3.3V–5V relay module | VCC = 5V, IN = GPIO26 |
| ✅ | Buck converter | **Not used** in the Bench Prototype; the power bank already gives 5V. Kept for Final Assembly |

## 2. Power

| ✓ | Item | Qty | Why |
|---|---|---|---|
| 🛒 | **Power bank**, 2 USB ports, **2A or more** per port; ideally has a low-current / "always on" mode | 1 | The 5V supply for the pump, servo, relay and the pH/turbidity modules. No cutting or soldering |
| 🛒 | **USB-A male to screw-terminal / pin breakout** (or "USB to Dupont" 5V cable) | 1 | Plugs into the power bank and brings 5V + GND to the breadboard rails, with no cutting |
| 🛒 | Electrolytic capacitor **470–1000µF, 16V or more** | 1–2 | Across the 5V rail, so the servo/pump starting doesn't reset the ESP32 |
| 🛒 | Diode **1N4007** (or 1N4001–1N5819) | 1 | Across the pump's terminals, stripe toward +, to absorb the motor's voltage spikes |
| 🛒 | Data-capable micro-USB / USB-C cable (match your ESP32) | 1 | Some cables are charge-only and the board won't show up |

## 3. Resistors

| ✓ | Item | Qty | Why |
|---|---|---|---|
| 🛒 | **10kΩ** | 2 | Top resistor of each divider (pH, turbidity) |
| 🛒 | **20kΩ** (or 2 more 10kΩ in series per divider) | 2 | Bottom resistor of each divider |
| ⭐ | 4.7kΩ | 1 | Only if the DS18B20 module turns out **not** to have its own pull-up (spare) |

Divider wiring, one per sensor: **module out → 10kΩ → ESP32 pin → 20kΩ → GND**. Other values are fine if the bottom resistor is about 2× the top one; update `R_TOP`/`R_BOTTOM` in `firmware/include/config.h`.

## 4. Wiring and tools

| ✓ | Item | Qty |
|---|---|---|
| 🛒 | Full-size breadboard (830 points) — the ESP32 is wide; two breadboards side by side also works | 1–2 |
| 🛒 | Jumper wires: male-male, male-female, female-female (about 20 each) | 1 set |
| 🛒 | Multimeter (checking module output voltages and the 5V rail) | 1 |
| 🛒 | Small screwdriver (pots on the pH and turbidity boards, relay screw terminals) | 1 |
| 🛒 | Electrical tape or heat-shrink (cover exposed joints near water) | 1 |
| ⭐ | Alligator clip leads | a few |

## 5. Feeder mechanism (the servo needs something to turn)

| ✓ | Item | Why |
|---|---|---|
| 🛒 | Small container (pill bottle / film canister / bottle cap) with a hole cut in its side or bottom | Food hopper |
| 🛒 | Disc or paddle on the servo horn (plastic lid / cardboard + the servo's own horn) | Turns under the hole to let food fall out |
| 🛒 | Hot glue or double-sided tape, cable ties | Mounting the servo and hopper |
| 🛒 | Fish food (flakes or small pellets) | Testing the Feed Portion sizes |

## 6. Water tests and calibration

| ✓ | Item | Why |
|---|---|---|
| 🛒 | 3–4 cups/jars | Clean water, tap water, cloudy water, pump container |
| 🛒 | Vinegar, baking soda | Moves pH down / up for the demo |
| 🛒 | Milk or a little soil | Makes water cloudy (Skip-Feed Rule demo, T12) |
| 🛒 | Warm and cold water | Shows the temperature changing |
| ⭐ | pH buffer powder packets **4.00 / 6.86** (often sold with pH pens) | 2-point pH calibration (T14) |
| ⭐ | Distilled water | Rinsing the pH probe between buffers |
| ✅ | pH probe storage cap (keep it wet; KCl solution if it dried out) | Dry probe = wrong readings |

## 7. Safety and recording

| ✓ | Item |
|---|---|
| 🛒 | Towel + tray (keep water away from the breadboard) |
| 🛒 | Phone stand / tripod, charged phone (Checkpoint clips) |

## Power layout (bench)

```
Laptop USB ──► ESP32 (3.3V pin ──► DS18B20 module)
Power bank ──► USB breakout ──► 5V rail ──┬─► relay VCC ──► relay COM/NO ──► pump (+1N4007 across it)
                                           ├─► servo red
                                           ├─► pH module VCC, turbidity module VCC
                                           └─► 470–1000µF capacitor to GND (long leg = +)
ALL GNDs joined: ESP32 GND ↔ breakout GND ↔ every module GND
```

- Never connect the power bank's 5V to the ESP32's 5V/VIN pin while the laptop USB is also plugged in.
- **Power bank auto-off:** many banks switch off when the load is tiny (pump off, servo idle). Check: leave it idle 2 minutes; if the relay board's LED goes dark, turn on the bank's low-current mode (often a double-press or long-press of its button), or use a bank that has one.
