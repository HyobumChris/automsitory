# -*- coding: utf-8 -*-
"""Per-shot top-view cards for the viewer: layout + DWDI coverage."""
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Circle, Polygon

plt.rcParams["font.family"] = "Segoe UI"
plt.rcParams["axes.unicode_minus"] = False

R_NECK = 13.35
R_WELD = 14.2
R_FILM = 24.0
R_IQI = 15.0
R_CUT = 35.0
PIPE_HW = 44.45
SRC_D = 60.0

FILM_ARC = np.degrees(1.8)   # ~103 deg
IQI_ARC = np.degrees(1.1)

shots = [(-60, "#2f4858", 1), (0, "#5b7c99", 2), (60, "#9db4c4", 3)]

def dirvec(az_deg):
    a = np.radians(az_deg)
    return np.array([np.sin(a), np.cos(a)])

def draw_arc(ax, r, center_az, span_deg, **kw):
    th = np.radians(90 - center_az + np.linspace(-span_deg / 2, span_deg / 2, 60))
    ax.plot(r * np.cos(th), r * np.sin(th), **kw)

for az, color, num in shots:
    # landscape aspect to match the spec panel in the viewer
    fig, ax = plt.subplots(figsize=(7.0, 4.27))

    ax.axhspan(-PIPE_HW, PIPE_HW, color="#e0e0e0", alpha=0.6, zorder=0)
    ax.add_patch(Circle((0, 0), R_CUT, fc="white", ec="#999999",
                        lw=1.2, ls="--", zorder=1))
    ax.add_patch(Circle((0, 0), R_NECK, fc="#ccd1d8", ec="#555c66",
                        lw=1.0, zorder=2))
    th = np.linspace(0, 2 * np.pi, 100)
    ax.plot(R_WELD * np.cos(th), R_WELD * np.sin(th),
            color="#b0b6be", lw=2.0, zorder=3)

    d = dirvec(az)
    n = np.array([-d[1], d[0]])
    src = d * SRC_D
    far = -d * (R_FILM + 6)
    ax.add_patch(Polygon([src + n * 3, src - n * 3,
                          far - n * 16, far + n * 16],
                         closed=True, fc=color, alpha=0.15, ec="none", zorder=2))
    ax.plot([src[0], far[0]], [src[1], far[1]], color=color, lw=1.2, zorder=3)
    ax.plot(*src, "o", ms=11, color="#cc2222", zorder=6)
    tube_end = d * (SRC_D + 16)
    ax.plot([src[0], tube_end[0]], [src[1], tube_end[1]],
            color="#666c77", lw=5, solid_capstyle="round", zorder=5)

    # film + IQI
    draw_arc(ax, R_FILM, az + 180, FILM_ARC, color="#1c4023", lw=6,
             solid_capstyle="round", zorder=5)
    draw_arc(ax, R_IQI, az, IQI_ARC, color="#e8d44d", lw=5,
             solid_capstyle="round", zorder=6)

    # DWDI coverage on the weld: film-side image (solid) + source-side (dashed)
    draw_arc(ax, R_WELD, az + 180, FILM_ARC, color=color, lw=8,
             solid_capstyle="round", zorder=7)
    draw_arc(ax, R_WELD, az, FILM_ARC, color=color, lw=8, alpha=0.4,
             solid_capstyle="round", zorder=7)

    fdir = dirvec(az + 180)
    idir = dirvec(az)
    ax.annotate("Film-side image\n(solid arc)", xy=fdir * R_WELD,
                xytext=fdir * 56, ha="center", fontsize=11, color=color,
                fontweight="bold",
                arrowprops=dict(arrowstyle="->", color=color))
    ax.annotate("Source-side image\n(faint arc)", xy=idir * R_WELD + n * 8,
                xytext=idir * 42 + n * 38, ha="center", fontsize=11,
                color=color, alpha=0.85,
                arrowprops=dict(arrowstyle="->", color=color, alpha=0.6))
    ax.annotate("Ir-192", xy=src, xytext=src - n * 24 + d * 2, ha="center",
                fontsize=10, color="#cc2222",
                arrowprops=dict(arrowstyle="->", color="#cc2222"))
    ax.annotate("Film", xy=fdir * R_FILM - n * 6,
                xytext=fdir * 33 - n * 26, ha="center", fontsize=10,
                color="#1c4023",
                arrowprops=dict(arrowstyle="->", color="#1c4023"))
    ax.annotate("IQI", xy=idir * R_IQI + n * 4, xytext=idir * 24 + n * 26,
                ha="center", fontsize=10, color="#a89b20",
                arrowprops=dict(arrowstyle="->", color="#a89b20"))

    ax.set_title(f"Shot {num} (azimuth {az:+d}\u00b0) \u2014 DWDI coverage",
                 fontsize=12, pad=6)
    ax.text(0, -76, "One exposure images both the film-side and source-side walls",
            ha="center", fontsize=9, color="#555555")
    ax.set_xlim(-132, 132); ax.set_ylim(-84, 84)
    ax.set_aspect("equal"); ax.axis("off")
    fig.tight_layout()
    fig.savefig(f"rt_shot{num}.png", dpi=110, facecolor="white")
    plt.close(fig)
    print(f"saved rt_shot{num}.png")
