"""Builds the AquaNode Feeder's printed parts in FreeCAD.

Run headless:  Y:\\Applications\\FreeCAD\\bin\\freecadcmd.exe cad\\feeder\\build_feeder.py
Writes feeder.FCStd plus main_body.{step,stl} and servo_adapter.{step,stl}
in the same folder as this script.

Every dimension lives in the "Params" spreadsheet inside feeder.FCStd. Open the
.FCStd in FreeCAD, change a cell (e.g. glass_gap), press Recompute, then
File > Export the body as STEP (for Fusion) or STL (for Creality Print).

Main body dimensions were measured from Aquassist's Main_Body.stl (see
original/CREDITS.md); the Wemos D1 mini box is left out on purpose, and the
glass gap is a parameter (4.7 mm in the original).
"""
import os
import FreeCAD as App
import Part
import Import
import Mesh
import MeshPart

HERE = os.path.dirname(os.path.abspath(__file__))

doc = App.newDocument("feeder")
sheet = doc.addObject("Spreadsheet::Sheet", "Params")

# name, value (mm), note
PARAMS = [
    ("wall", 4.5, "plate thickness (all plates)"),
    ("height", 43.0, "extrusion height of the whole body (Z)"),
    ("spine_len", 60.0, "spine length (Y)"),
    ("servo_plate_len", 36.08, "servo plate length past the spine (X)"),
    ("hook_len", 45.0, "hook plate length (X), i.e. how far it reaches down the glass"),
    ("hook_offset", 25.0, "spine distance from its servo end to the inner hook plate"),
    ("glass_gap", 6.4, "slot for the aquarium glass: measured thickness + 0.4"),
    ("win_x0", 11.1, "servo window start, from the spine's outer face"),
    ("win_w", 22.43, "servo window width (servo body length)"),
    ("win_z0", 15.42, "servo window bottom, from the body bottom"),
    ("win_h", 12.19, "servo window height (servo body width)"),
    ("hole_d", 2.36, "servo screw hole diameter"),
    ("hole_pitch", 27.8, "distance between the two servo screw holes"),
    ("adapter_d", 24.0, "servo adapter disc diameter (= screw outer diameter)"),
    ("adapter_t", 4.0, "servo adapter disc thickness"),
    ("horn_hub_d", 7.4, "MEASURE ON BUILD DAY: horn hub diameter + 0.2"),
    ("horn_len", 20.0, "MEASURE ON BUILD DAY: horn tip-to-tip length + 0.3"),
    ("horn_arm_w", 5.8, "MEASURE ON BUILD DAY: horn arm width at the hub + 0.2"),
    ("horn_depth", 2.0, "pocket depth for the horn (horn thickness)"),
    ("spline_d", 5.0, "clearance hole for the servo spline and horn screw"),
]
for row, (name, value, note) in enumerate(PARAMS, start=1):
    sheet.set(f"A{row}", name)
    sheet.set(f"B{row}", str(value))
    sheet.setAlias(f"B{row}", name)
    sheet.set(f"C{row}", note)
doc.recompute()


def box(name, l, w, h, x, y, z):
    """Part::Box whose size/position are expressions on the Params sheet."""
    b = doc.addObject("Part::Box", name)
    for prop, expr in (("Length", l), ("Width", w), ("Height", h)):
        b.setExpression(prop, expr)
    for prop, expr in (("x", x), ("y", y), ("z", z)):
        b.setExpression(f".Placement.Base.{prop}", expr)
    return b


def cyl(name, d, h, x, y, z, rot=None):
    c = doc.addObject("Part::Cylinder", name)
    c.setExpression("Radius", f"({d}) / 2")
    c.setExpression("Height", h)
    if rot:
        c.Placement.Rotation = rot
    for prop, expr in (("x", x), ("y", y), ("z", z)):
        c.setExpression(f".Placement.Base.{prop}", expr)
    return c


# Coordinates: X = up when hung on the tank (servo end up, hook down),
# Y = along the spine (servo end at y=0), Z = extrusion. Spine's outer face x=0.
P = "Params."
spine = box("Spine", f"{P}wall", f"{P}spine_len", f"{P}height", "0", "0", "0")
servo_plate = box("ServoPlate", f"{P}wall + {P}servo_plate_len", f"{P}wall",
                  f"{P}height", "0", "0", "0")
hook_in = box("HookInner", f"{P}hook_len", f"{P}wall", f"{P}height",
              f"-{P}hook_len", f"{P}hook_offset", "0")
hook_out = box("HookOuter", f"{P}hook_len", f"{P}wall", f"{P}height",
               f"-{P}hook_len", f"{P}hook_offset + {P}wall + {P}glass_gap", "0")

solid = doc.addObject("Part::MultiFuse", "BodySolid")
solid.Shapes = [spine, servo_plate, hook_in, hook_out]

window = box("ServoWindow", f"{P}win_w", f"{P}wall + 2", f"{P}win_h",
             f"{P}win_x0", "-1", f"{P}win_z0")
y_axis = App.Rotation(App.Vector(1, 0, 0), -90)  # cylinder along +Y
hole_z = f"{P}win_z0 + {P}win_h / 2"
hole_mid = f"{P}win_x0 + {P}win_w / 2"
hole_a = cyl("ScrewHoleA", f"{P}hole_d", f"{P}wall + 2",
             f"{hole_mid} - {P}hole_pitch / 2", "-1", hole_z, y_axis)
hole_b = cyl("ScrewHoleB", f"{P}hole_d", f"{P}wall + 2",
             f"{hole_mid} + {P}hole_pitch / 2", "-1", hole_z, y_axis)
cutters = doc.addObject("Part::MultiFuse", "ServoCutouts")
cutters.Shapes = [window, hole_a, hole_b]

body = doc.addObject("Part::Cut", "MainBody")
body.Base, body.Tool = solid, cutters

# Servo adapter: disc glued to the screw's end, with a pocket the servo horn
# sits in, so the horn's own spline fits the servo exactly.
# Placed beside the body so both are visible.
ax = "100"
disc = cyl("AdapterDisc", f"{P}adapter_d", f"{P}adapter_t", ax, "0", "0")
pocket_z = f"{P}adapter_t - {P}horn_depth"
hub = cyl("HornHub", f"{P}horn_hub_d", f"{P}horn_depth + 1", ax, "0", pocket_z)
arm = box("HornArm", f"{P}horn_len", f"{P}horn_arm_w", f"{P}horn_depth + 1",
          f"{ax} - {P}horn_len / 2", f"-{P}horn_arm_w / 2", pocket_z)
spline = cyl("SplineHole", f"{P}spline_d", f"{P}adapter_t + 2", ax, "0", "-1")
horn_cut = doc.addObject("Part::MultiFuse", "HornPocket")
horn_cut.Shapes = [hub, arm, spline]
adapter = doc.addObject("Part::Cut", "ServoAdapter")
adapter.Base, adapter.Tool = disc, horn_cut

doc.recompute()
for o in doc.Objects:
    if "Invalid" in o.State or "Error" in o.State:
        raise SystemExit(f"recompute failed on {o.Name}: {o.State}")

for obj, stem in ((body, "main_body"), (adapter, "servo_adapter")):
    shape = obj.Shape
    if not shape.isValid() or len(shape.Solids) != 1:
        raise SystemExit(f"{stem}: bad solid (valid={shape.isValid()}, solids={len(shape.Solids)})")
    Import.export([obj], os.path.join(HERE, f"{stem}.step"))
    mesh = MeshPart.meshFromShape(Shape=shape, LinearDeflection=0.02,
                                  AngularDeflection=0.2, Relative=False)
    mesh.write(os.path.join(HERE, f"{stem}.stl"))
    bb = shape.BoundBox
    print(f"{stem}: volume {shape.Volume:.1f} mm3, size "
          f"{bb.XLength:.2f} x {bb.YLength:.2f} x {bb.ZLength:.2f} mm")

doc.saveAs(os.path.join(HERE, "feeder.FCStd"))
print("saved", os.path.join(HERE, "feeder.FCStd"))
