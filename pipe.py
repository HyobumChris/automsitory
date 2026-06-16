"""
IGF Code double-wall pipe with flanged branch
(ASME B36.10M / ASTM A53-A106 / ASME B16.5)

  Outer pipe : NPS 3 (DN80) Sch 10S — OD 88.9, wall 3.05, ID 82.8
  Inner pipe : NPS 2 (DN50) Sch 40  — OD 60.3, wall 3.91, ID 52.5
  Branch     : NPS 1 (DN25) Sch 40 stub, vertical at mid-span,
               passing through a cutout in the outer pipe
  Flange     : Welding neck, NPS 1 Class 150 (ASME B16.5),
               seated just above the outer pipe surface

CAD frame: pipes run along +Z, branch rises along +Y.
"""

import math

import cadquery as cq

LENGTH = 1000.0
BRANCH_POS = LENGTH / 2  # branch location along the pipe

# Outer pipe (secondary enclosure)
OUTER_OD = 88.9
OUTER_WALL = 3.05
# Circular opening in the outer pipe — forms a natural saddle cut line
CUTOUT_DIA = 70.0

# Inner pipe (gas fuel line)
INNER_OD = 60.3
INNER_WALL = 3.91
INNER_BORE = INNER_OD - 2 * INNER_WALL  # 52.48

# Branch outlet: cold-formed (extruded) collar drawn from the inner pipe
# wall itself — one piece with the inner pipe, no set-in nozzle and no
# saddle weld; the only branch weld is the girth weld to the flange
BRANCH_OD = 26.7   # outlet neck OD (NPS 3/4 equivalent)
BRANCH_WALL = 2.87  # T2
BRANCH_BORE = BRANCH_OD - 2 * BRANCH_WALL  # 20.96
FORM_R = 3.5       # cold-forming blend radius at the collar root
# Flange weld point sits inside the cutout, below the outer pipe crown (R44.45):
# the flange hub passes down through the opening to meet the short collar.
# Field measurement: pipe surface -> weld line ~10 mm at the collar flank
# (surface y=27.04 there), so weld at y=37 (crown protrusion 6.85)
STUB_TOP = 37.0

# Compact disc-type welding neck flange (proportions from reference photo:
# straight neck — no taper — and disc bottom right at the cutout edge height)
FLG_OD = 70.0         # flange ring OD ≈ cutout diameter
FLG_THK = 13.0        # ring thickness (raised face separate)
RF_DIA = 60.0         # raised face diameter
RF_HT = 1.6           # raised face height
NECK_LEN = 8.0        # straight neck: weld end (y=37) to disc bottom (y=45) —
                      # disc grazing the cutout crest (y=44.45)
FLG_LTH = NECK_LEN + FLG_THK + RF_HT  # 24.6


def z_cylinder(dia: float, length: float) -> cq.Workplane:
    return cq.Workplane("XY").circle(dia / 2).extrude(length)


def to_branch(wp: cq.Workplane) -> cq.Workplane:
    """Rotate a +Z-built solid to point along +Y and move it to the branch."""
    return wp.rotate((0, 0, 0), (1, 0, 0), -90).translate((0, 0, BRANCH_POS))


# --- Outer pipe with circular saddle cutout ---
outer = z_cylinder(OUTER_OD, LENGTH).cut(z_cylinder(OUTER_OD - 2 * OUTER_WALL, LENGTH))
outer = outer.cut(to_branch(z_cylinder(CUTOUT_DIA, 100.0)))

# --- Inner pipe with cold-formed branch outlet (one solid) ---
# Union the run pipe with the collar stock, blend the root with the forming
# radius, then bore both flow paths
run_solid = z_cylinder(INNER_OD, LENGTH)
stock = run_solid.union(to_branch(z_cylinder(BRANCH_OD, STUB_TOP)))
stock = stock.edges(
    cq.selectors.BoxSelector(
        (-17, 24, BRANCH_POS - 17), (17, 33, BRANCH_POS + 17)
    )
).fillet(FORM_R)
inner = (
    stock.cut(z_cylinder(INNER_BORE, LENGTH))
    .cut(to_branch(z_cylinder(BRANCH_BORE, STUB_TOP + 1.0)))
)
# Bore-side flare: the collar is drawn outward from the wall, so the hole
# edge inside the pipe is a smooth pulled radius — nothing protrudes inward
inner = inner.edges(
    cq.selectors.BoxSelector(
        (-12, 22, BRANCH_POS - 12), (12, 26.9, BRANCH_POS + 12)
    )
).fillet(2.0)

# --- Welding neck flange (built along +Z, weld end at z=0, face at z=FLG_LTH) ---
profile = [
    (BRANCH_OD / 2, 0),
    (BRANCH_OD / 2, NECK_LEN),
    (FLG_OD / 2, NECK_LEN),
    (FLG_OD / 2, NECK_LEN + FLG_THK),
    (RF_DIA / 2, NECK_LEN + FLG_THK),
    (RF_DIA / 2, FLG_LTH),
    (0.001, FLG_LTH),
    (0.001, 0),
]
flange = (
    cq.Workplane("XZ")
    .polyline(profile)
    .close()
    .revolve(360, (0, 0, 0), (0, 1, 0))
    .cut(z_cylinder(BRANCH_BORE, FLG_LTH))
)
flange = to_branch(flange).translate((0, STUB_TOP, 0))

# --- Weld bead (girth weld at the flange joint only — the collar root is
# cold-formed, so there is no saddle weld) ---
GIRTH_BEAD = 0.5   # girth weld base bulge at the flange neck / collar joint

# Girth weld: slim torus around the neck at the weld line (y = STUB_TOP)
girth = to_branch(
    cq.Workplane(
        obj=cq.Solid.makeTorus(
            BRANCH_OD / 2, GIRTH_BEAD,
            cq.Vector(0, 0, STUB_TOP), cq.Vector(0, 0, 1),
        )
    )
)

# Weld weave decoration: thin disks standing along the weld path ("stack of
# dimes") — each disk's round face spans the bead width, so the overlapped
# edges read as crescent ripples transverse to the travel direction
NECK_R = BRANCH_OD / 2


def weave_disk(disk_r: float, thickness: float, path_r: float,
               th: float, py: float) -> cq.Workplane:
    """Disk centered on the weld path with its axis tangent to the path."""
    return (
        cq.Workplane("YZ")
        .circle(disk_r)
        .extrude(thickness / 2, both=True)
        .rotate((0, 0, 0), (0, 1, 0), -(math.degrees(th) + 90))
        .translate((path_r * math.cos(th), py,
                    BRANCH_POS + path_r * math.sin(th)))
    )


ripples = []

# Girth weave: disks Ø3.2 × t0.8, sunk 0.8 into the neck → 0.8 mm proud,
# ~0.3 mm ripple relief above the base torus
N_GIRTH = 100
for i in range(N_GIRTH):
    th = 2 * math.pi * i / N_GIRTH
    ripples.append(
        weave_disk(1.6, 0.8, NECK_R - 0.8, th, STUB_TOP).val()
    )

# Compound (no boolean union needed) keeps generation fast
welds = cq.Workplane(
    obj=cq.Compound.makeCompound([girth.val()] + ripples)
)

# --- Export ---
assembly = (
    cq.Assembly(name="double_wall_pipe_branch")
    .add(outer, name="outer_NPS3_Sch10S", color=cq.Color(0.7, 0.72, 0.76, 0.5))
    .add(inner, name="inner_NPS2_Sch40", color=cq.Color(0.85, 0.6, 0.2))
    .add(flange, name="flange_WN_compact", color=cq.Color(0.78, 0.8, 0.84))
    .add(welds, name="weld_beads", color=cq.Color(0.62, 0.64, 0.68))
)
assembly.export("double_wall_pipe.step")

cq.exporters.export(outer, "outer_NPS3_Sch10S.stl", tolerance=0.01)
cq.exporters.export(inner, "inner_NPS2_Sch40.stl", tolerance=0.01)
cq.exporters.export(flange, "flange_WN_compact.stl", tolerance=0.01)
cq.exporters.export(welds, "weld_beads.stl", tolerance=0.01)

print(f"Outer: OD={OUTER_OD}, circular cutout dia={CUTOUT_DIA} at z={BRANCH_POS}")
print(f"Inner: OD={INNER_OD}, cold-formed outlet OD={BRANCH_OD}, form R={FORM_R}")
print(f"Flange: compact WN OD{FLG_OD}, face at y={STUB_TOP + FLG_LTH}")
print("Exported: double_wall_pipe.step + 4 STLs (outlet integral with inner)")
