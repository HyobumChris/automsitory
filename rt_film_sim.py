# -*- coding: utf-8 -*-
"""Simulated radiographs for the 3 DWDI shots.

For every film pixel a ray is marched from the Ir-192 source to the curved
film (R20, 103 deg arc, 16 mm tall), the steel path length is integrated
through the actual assembly geometry, and exposure follows I = I0*exp(-mu*L)
with mu ~= 0.0546/mm (Ir-192 in steel, HVL ~12.7 mm). Film is a negative:
air = dark, steel = lighter, flange shadow = bright band.
"""
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from PIL import Image, ImageFilter

plt.rcParams["font.family"] = "Segoe UI"

# ---- geometry (weld plane = y 0, branch axis = y axis) ----
MU = 0.0546                # 1/mm
NECK_RO, NECK_RI = 13.35, 10.48
BEAD_RO = 14.7
FLG_RO, FLG_Y0, FLG_Y1 = 35.0, 8.0, 22.6
PIPE_AXIS_Y = -37.0        # run pipe axis (inner & outer share it)
IN_RO, IN_RI = 30.15, 26.24
OUT_RO, OUT_RI = 44.45, 41.4
CUT_R = 35.0
FILM_R, FILM_ARC, FILM_H = 24.0, 1.8, 16.0   # stand-off cassette at R24
SRC_D, SRC_H = 185.0, 20.0

# IQI: 7 wires W10..W16 (dia 0.4..0.1 mm) at R14.6 on the source side
WIRE_R = 14.6
WIRE_DIA = np.array([0.40, 0.32, 0.25, 0.20, 0.16, 0.125, 0.10])
WIRE_DPHI = 2.0 / WIRE_R

W, H, NS = 760, 340, 480   # film px, march samples

def steel_mask(x, y, z):
    r2b = x * x + z * z
    rad2 = (y - PIPE_AXIS_Y) ** 2 + z * z
    neck = (r2b >= NECK_RI**2) & (r2b <= NECK_RO**2) & (y >= -7) & (y <= FLG_Y0)
    bead = (r2b >= NECK_RO**2) & (r2b <= BEAD_RO**2) & (np.abs(y) <= 1.8)
    # cold-formed collar root: blend radius (R3.5) drawn from the inner pipe
    saddle = (r2b >= NECK_RO**2) & (r2b <= 16.85**2) & (y >= -10.0) & (y <= -3.3)
    flange = (r2b >= NECK_RI**2) & (r2b <= FLG_RO**2) & (y >= FLG_Y0) & (y <= FLG_Y1)
    hole_b = r2b <= NECK_RO**2
    inner = (rad2 >= IN_RI**2) & (rad2 <= IN_RO**2) & ~(hole_b & (y > PIPE_AXIS_Y))
    hole_c = r2b <= CUT_R**2
    outer = (rad2 >= OUT_RI**2) & (rad2 <= OUT_RO**2) & ~(hole_c & (y > PIPE_AXIS_Y))
    return neck | bead | saddle | flange | inner | outer

def render(az_deg, num):
    a = np.radians(az_deg)
    S = np.array([SRC_D * np.sin(a), SRC_H, SRC_D * np.cos(a)])

    u = np.linspace(-FILM_ARC / 2, FILM_ARC / 2, W)
    h = np.linspace(FILM_H / 2, -FILM_H / 2, H)
    psi = a + np.pi + u                       # film azimuth per column
    Fx = FILM_R * np.sin(psi)[None, :].repeat(H, 0)
    Fz = FILM_R * np.cos(psi)[None, :].repeat(H, 0)
    Fy = h[:, None].repeat(W, 1)

    L = np.zeros((H, W), dtype=np.float32)
    t = np.linspace(0.0, 1.0, NS, dtype=np.float32)[:, None]
    for r0 in range(0, H, 20):                # chunk rows to bound memory
        r1 = min(r0 + 20, H)
        fx = Fx[r0:r1].ravel()[None, :]
        fy = Fy[r0:r1].ravel()[None, :]
        fz = Fz[r0:r1].ravel()[None, :]
        px = S[0] + t * (fx - S[0])
        py = S[1] + t * (fy - S[1])
        pz = S[2] + t * (fz - S[2])
        seg = np.sqrt((fx - S[0])**2 + (fy - S[1])**2 + (fz - S[2])**2) / NS
        L[r0:r1] = (steel_mask(px, py, pz).sum(0) * seg).reshape(r1 - r0, W)

    # IQI wires analytically (too thin for the march step)
    for i in range(7):
        phi = a + (i - 3) * WIRE_DPHI
        C = np.array([WIRE_R * np.sin(phi), WIRE_R * np.cos(phi)])
        rw = WIRE_DIA[i] / 2
        dx, dz = Fx - S[0], Fz - S[2]
        nrm = np.sqrt(dx * dx + dz * dz)
        # 2D distance from wire centre to the ray (in plan view)
        dist = np.abs(dx * (S[2] - C[1]) - dz * (S[0] - C[0])) / nrm
        chord = 2 * np.sqrt(np.clip(rw * rw - dist * dist, 0, None))
        tc = ((C[0] - S[0]) * dx + (C[1] - S[2]) * dz) / (nrm * nrm)
        yc = S[1] + tc * (Fy - S[1])
        L += np.where((chord > 0) & (np.abs(yc) <= 4.5), chord, 0)

    # exposure -> film brightness (negative image), unsharpness, grain
    E = np.exp(-MU * L)
    B = 1.0 - E
    # film characteristic: stretch to the useful density range (high-contrast
    # industrial film look)
    lo, hi = np.percentile(B, 1), np.percentile(B, 99.5)
    B = np.clip((B - lo) / (hi - lo), 0, 1) ** 1.15
    img = Image.fromarray((np.clip(B, 0, 1) * 255).astype(np.uint8))
    img = img.filter(ImageFilter.GaussianBlur(radius=4))       # Ug ~0.4 mm
    B = np.asarray(img, dtype=np.float32) / 255.0
    rng = np.random.default_rng(42 + num)
    B = np.clip(B + rng.normal(0, 0.015, B.shape), 0, 1)

    # ---- present as a developed film strip ----
    fig, ax = plt.subplots(figsize=(9.6, 4.9))
    fig.patch.set_facecolor("#202326")
    ax.imshow(B, cmap="gray", vmin=0, vmax=1,
              extent=[-FILM_ARC / 2 * FILM_R, FILM_ARC / 2 * FILM_R,
                      -FILM_H / 2, FILM_H / 2], aspect="equal")
    # lead ID characters (block radiation -> white on film)
    ax.text(-16.5, -6.8, "10 ISO 16", fontsize=9, color="#f2f2f2",
            fontweight="bold")
    ax.text(14.5, -6.8, f"S{num}", fontsize=10, color="#f2f2f2",
            fontweight="bold")
    for sp in ax.spines.values():
        sp.set_color("#555")
    ax.set_xticks([]); ax.set_yticks([])

    az_lbl = f"{az_deg:+d}"
    strip_w = FILM_ARC * FILM_R
    ax.set_title(f"Shot {num} (azimuth {az_lbl}\u00b0) \u2014 simulated film "
                 f"(DWDI, Ir-192, flattened strip {strip_w:.0f}\u00d716 mm)",
                 fontsize=11, color="#dddddd", pad=10)
    notes = ("dark = air \u00b7 grey bands = weld walls (film-side sharp, "
             "source-side offset down) \u00b7 bright top = flange shadow \u00b7 "
             "thin lines = IQI wires")
    fig.text(0.5, 0.04, notes, ha="center", fontsize=8.5, color="#9aa0a6")
    fig.tight_layout(rect=[0, 0.06, 1, 1])
    fig.savefig(f"rt_film{num}.png", dpi=120, facecolor=fig.get_facecolor())
    plt.close(fig)
    print(f"saved rt_film{num}.png")

for az, num in ((-60, 1), (0, 2), (60, 3)):
    render(az, num)
