"""Builds the AquaNode Component Box: a small box for the electronics that hangs on the tank's long
glass wall with two glass clips (the same hook idea as the Feeder's main body).

Run headless:  Y:\\Applications\\FreeCAD\\bin\\freecadcmd.exe cad\\component-box\\build_component_box.py
Writes component_box.FCStd (assembled, hanging on a slice of glass) and, in print/, one STEP + STL
per part in the orientation to print it, plus parts.txt.

Parts: the box (open top), a lift-off lid, and 2 identical clips bolted to the box's back with
M3 bolts. The clips are separate so a different glass thickness only means reprinting the clips.
Cable holes are in the box's floor: water running down a cable drips off underneath.

To change a size, edit PARAMS and run the script again.
"""
import math
import os
import FreeCAD as App
import Part
import Import
import MeshPart

V = App.Vector
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "print")
os.makedirs(OUT, exist_ok=True)

PARAMS = {
    # Box (X = along the glass, Y = away from the glass, Z = up)
    "box_w": 180.0,        # outside width along the glass
    "box_d": 70.0,         # outside depth, away from the glass
    "box_h": 120.0,        # outside height (without the lid)
    "wall": 2.4,
    "floor": 2.4,
    "corner_r": 4.0,       # rounded vertical corners
    # Lid
    "lid_t": 2.4,
    "lip_h": 6.0,          # lip that drops inside the box walls
    "lip_t": 1.6,
    "lid_clear": 0.3,      # gap between lip and box wall, each side
    # Cable holes in the floor
    "hole_d": 16.0,        # 16 mm grommet; the pH probe's BNC plug passes through
    "hole_pitch": 26.0,
    # Vents: vertical slots high on both short sides
    "vent_n": 4, "vent_w": 2.5, "vent_h": 22.0, "vent_pitch": 7.0, "vent_from_top": 12.0,
    # Glass clips (same idea as the Feeder's hook; Feeder uses glass_gap 6.4 too)
    "glass_gap": 6.4,      # MEASURE: glass thickness + 0.4
    "clip_t": 4.5,         # clip plate thickness (Feeder: 4.5)
    "clip_w": 30.0,        # clip width along the glass
    "clip_plate_h": 45.0,  # plate bolted to the box's back
    "hook_len": 35.0,      # how far the inner plate reaches down inside the tank
    "clip_inset": 28.0,    # clip centre from each end of the box
    "bolt_d": 3.4,         # M3 clearance
    "bolt_pitch": 22.0,    # two bolts per clip, one above the other
    "nut_af": 5.8,         # M3 nut across flats + clearance (pocket on the clip's glass side)
    "nut_depth": 2.6,
}
HOLE_USES = ["pH", "turbidity", "temperature", "pump", "servo", "USB / power"]
globals().update(PARAMS)


def rounded_box(w, d, h, r, x=0, y=0, z=0):
    b = Part.makeBox(w, d, h, V(x, y, z))
    if r > 0:
        edges = [e for e in b.Edges if abs(e.Vertexes[0].Point.z - e.Vertexes[1].Point.z) > 1e-6]
        b = b.makeFillet(r, edges)
    return b


def ycyl(d, x, z, y0, length):
    return Part.makeCylinder(d / 2, length, V(x, y0, z), V(0, 1, 0))


# Box: back face at y=0 (against the clips), front at y=box_d.
box = rounded_box(box_w, box_d, box_h, corner_r)
box = box.cut(rounded_box(box_w - 2 * wall, box_d - 2 * wall, box_h, max(corner_r - wall, 0.5),
                          wall, wall, floor))

span = hole_pitch * (len(HOLE_USES) - 1)
assert span + hole_d < box_w - 2 * wall - 6, "cable holes don't fit: lower hole_pitch"
hole_xy = [(box_w / 2 - span / 2 + i * hole_pitch, box_d / 2) for i in range(len(HOLE_USES))]
for x, y in hole_xy:
    box = box.cut(Part.makeCylinder(hole_d / 2, floor + 2, V(x, y, -1)))

vz = box_h - vent_from_top - vent_h
vspan = vent_pitch * (vent_n - 1)
for x0 in (-1, box_w - wall - 1):
    for i in range(vent_n):
        y = box_d / 2 - vspan / 2 + i * vent_pitch - vent_w / 2
        box = box.cut(Part.makeBox(wall + 2, vent_w, vent_h, V(x0, y, vz)))

# Bolt holes in the back wall, matching the clips.
clip_xs = (clip_inset, box_w - clip_inset)
bolt_zs = (box_h - clip_t - clip_plate_h / 2 + bolt_pitch / 2,
           box_h - clip_t - clip_plate_h / 2 - bolt_pitch / 2)
for x in clip_xs:
    for z in bolt_zs:
        box = box.cut(ycyl(bolt_d, x, z, -1, wall + 2))
box = box.removeSplitter()

# Lid: plate + lip that drops inside the walls.
lid = rounded_box(box_w, box_d, lid_t, corner_r, 0, 0, box_h)
c = wall + lid_clear
lip_outer = rounded_box(box_w - 2 * c, box_d - 2 * c, lip_h, max(corner_r - c, 0.5), c, c, box_h - lip_h)
lip_inner = rounded_box(box_w - 2 * (c + lip_t), box_d - 2 * (c + lip_t), lip_h + 1,
                        max(corner_r - c - lip_t, 0.5), c + lip_t, c + lip_t, box_h - lip_h - 0.5)
lid = lid.fuse(lip_outer.cut(lip_inner)).removeSplitter()
# Finger notch in the front edge so the lid is easy to lift.
lid = lid.cut(Part.makeCylinder(9, lid_t + 2, V(box_w / 2, box_d + 5, box_h - 1))).removeSplitter()


def make_clip(xc):
    """Inverted-U hook: plate on the box's back, bridge over the glass, inner plate down into the tank.
    The bridge's top is level with the box's top edge."""
    x0 = xc - clip_w / 2
    top = box_h
    plate = Part.makeBox(clip_w, clip_t, clip_plate_h + clip_t, V(x0, -clip_t, top - clip_t - clip_plate_h))
    bridge = Part.makeBox(clip_w, 2 * clip_t + glass_gap, clip_t, V(x0, -(2 * clip_t + glass_gap), top - clip_t))
    inner = Part.makeBox(clip_w, clip_t, hook_len + clip_t,
                         V(x0, -(2 * clip_t + glass_gap), top - clip_t - hook_len))
    clip = plate.fuse([bridge, inner])
    for z in bolt_zs:
        clip = clip.cut(ycyl(bolt_d, xc, z, -clip_t - 1, clip_t + 2))
        # Hex pocket on the glass side so the nut sits flush and can't scratch the glass.
        r = nut_af / 3 ** 0.5  # circumradius of the hexagon
        hexagon = Part.makePolygon([V(xc + r * math.cos(math.radians(60 * k)), -clip_t - 0.01,
                                      z + r * math.sin(math.radians(60 * k))) for k in range(7)])
        clip = clip.cut(Part.Face(hexagon).extrude(V(0, nut_depth, 0)))
    return clip.removeSplitter()


clips = [make_clip(x) for x in clip_xs]
glass = Part.makeBox(box_w + 60, glass_gap - 0.4, 260, V(-30, -(clip_t + glass_gap - 0.2), box_h - 250))

# --- Document (assembled, hanging on a slice of glass) ----------------------------------------
doc = App.newDocument("component_box")
for name, sh in [("Box", box), ("Lid", lid), ("ClipLeft", clips[0]), ("ClipRight", clips[1]),
                 ("Glass_for_reference_only", glass)]:
    o = doc.addObject("Part::Feature", name)
    o.Shape = sh
doc.recompute()
doc.saveAs(os.path.join(HERE, "component_box.FCStd"))


# --- Export parts in print orientation -----------------------------------------------------------
def to_bed(sh, rot=None):
    sh = sh.copy()
    if rot:
        sh.rotate(V(0, 0, 0), *rot)
    bb = sh.BoundBox
    sh.translate(V(-bb.Center.x, -bb.Center.y, -bb.ZMin))
    return sh


prints = [
    ("box", to_bed(box), 1, "open side up"),
    ("lid", to_bed(lid, (V(1, 0, 0), 180)), 1, "top face down, lip up"),
    # Profile flat on the bed (the U shape is visible from above): no supports.
    ("glass_clip", to_bed(clips[0], (V(0, 1, 0), 90)), 2, "on its side, U shape flat on the bed"),
]
lines = ["PRINT (PLA or PETG, 3 walls, 20% infill, no supports)"]
for stem, sh, qty, how in prints:
    assert sh.isValid() and len(sh.Solids) == 1, stem
    feat = doc.addObject("Part::Feature", f"print_{stem}")
    feat.Shape = sh
    Import.export([feat], os.path.join(OUT, f"{stem}.step"))
    MeshPart.meshFromShape(Shape=sh, LinearDeflection=0.02, AngularDeflection=0.2,
                           Relative=False).write(os.path.join(OUT, f"{stem}.stl"))
    doc.removeObject(feat.Name)
    bb = sh.BoundBox
    lines.append(f"  {qty} x {stem}.stl  {bb.XLength:.0f} x {bb.YLength:.0f} x {bb.ZLength:.0f} mm, "
                 f"{sh.Volume / 1000:.1f} cm3, {how}")
lines += ["", "HARDWARE",
          f"  4 x M3 x 10 mm bolt + 4 x M3 nut (bolt head inside the box, nut in the clip's hex pocket)",
          f"  {len(HOLE_USES)} x 16 mm rubber grommet (optional) for the floor holes: {', '.join(HOLE_USES)}",
          "", f"Inside: {box_w - 2 * wall:g} x {box_d - 2 * wall:g} x {box_h - floor:g} mm. "
          f"Glass gap {glass_gap:g} mm (fits glass up to {glass_gap - 0.4:g} mm; foam tape if thinner)."]
text = "\n".join(lines)
open(os.path.join(OUT, "parts.txt"), "w", encoding="utf-8").write(text + "\n")
print(text)
