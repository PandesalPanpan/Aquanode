# Feeder: 3D-printed parts

Adapted from Aquassist (credits and license in [`original/CREDITS.md`](original/CREDITS.md)). Changes from the original:

1. **The Wemos D1 mini box is removed.** The Feeder holds only the SGD90-360 servo. Its cable (5V, GND, signal → GPIO13) runs to the ESP32.
2. **The glass gap is now a setting** (`glass_gap`, default **6.4 mm**; the original was 4.7 mm).
3. **New servo adapter**, because the original was only a Fusion file. Its horn pocket sizes are **placeholders** until the real horn is measured.

## What to print

| Part | File | Notes |
|---|---|---|
| Main body | `main_body.stl` | Check `glass_gap` first (see below) |
| Servo adapter | `servo_adapter.stl` | Measure the horn first (see below) |
| Archimedes screw | `original/archimedes_screw.stl` | As-is |
| Screw cover | `original/archimedes_screw_cover.3mf` | As-is |
| Food box | `original/Feeder_storage.3mf` | As-is |
| Food box lid | `original/storage_box_cap.3mf` | As-is |

The original authors printed in PLA on a Prusa. Glue the adapter to the screw with instant glue (super glue); the servo pushes tightly into its window.

## Before printing: two measurements

| Setting | How to measure | Then set it to |
|---|---|---|
| `glass_gap` | Thickness of the aquarium glass where the Feeder hangs (also check for a plastic rim) | thickness + 0.4 mm |
| `horn_hub_d`, `horn_len`, `horn_arm_w`, `horn_depth` | The single-arm horn that comes with the servo | values in the sheet's notes (each includes a little clearance) |

If the glass hasn't been measured, print at 6.4 mm and stick **double-sided foam mounting tape** inside the gap to take up the slack.

## Changing a size

**FreeCAD** (free, no login; installed at `Y:\Applications\FreeCAD`): open `feeder.FCStd` → double-click **Params** → change the value in column B → close the sheet → **Edit ▸ Refresh** (Ctrl+R). Select `MainBody` or `ServoAdapter` → **File ▸ Export** → STL (for Creality Print) or STEP (for Fusion).

**Or rebuild everything from the script:** change the number in `PARAMS` in `build_feeder.py`, then run:

```
Y:\Applications\FreeCAD\bin\freecadcmd.exe cad\feeder\build_feeder.py
```

**Fusion:** open `main_body.step` / `servo_adapter.step`. They come in as solid bodies you can edit with Press Pull etc., but not with FreeCAD's parameter sheet.

## Checks done (2026-11-27)

- Rebuilt body at gap 4.7 mm vs. the original `Main_Body.stl` with the Wemos box cut away: same outer size (85.58 × 60 × 43 mm). The only real difference is the original's 2 mm pocket in the hook plate under the Wemos box (≈2,250 mm³), which our version leaves solid.
- Not yet test-printed or test-fitted on a real servo or tank.
