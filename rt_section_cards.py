# -*- coding: utf-8 -*-
"""Per-shot section-view cards: how the beam threads under the flange."""
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon, Rectangle

plt.rcParams["font.family"] = "Segoe UI"
plt.rcParams["axes.unicode_minus"] = False

# Section plane = vertical plane containing the beam (s = horizontal, y = up)
R_OUT = 44.45        # outer pipe radius, axis at y = 44.45
R_IN = 30.15         # inner pipe OD/2
R_NECK = 13.35       # branch neck
R_CUT = 35.0         # cutout radius (plan view)
WELD_Y = 81.45
FLG_BOT = 89.45      # weld + 8 mm
FLG_TOP = FLG_BOT + 14.6
FLG_HW = 35.0
SRC = np.array([185.0, WELD_Y + 20.0])
FILM_S = -24.0

shots = [(-60, "#2f4858", 1), (0, "#5b7c99", 2), (60, "#9db4c4", 3)]

def ellipse_pts(r, az_deg, mask_top_hw=None):
    """Cylinder (axis along x) cut by the beam plane -> ellipse."""
    ah = r / max(np.cos(np.radians(abs(az_deg))), 1e-6) if abs(az_deg) < 89 else r
    ah = min(ah, 140)
    phi = np.linspace(0, 2 * np.pi, 400)
    s = ah * np.cos(phi)
    y = 44.45 + r * np.sin(phi)
    if mask_top_hw is not None:
        hide = (y > 44.45) & (np.abs(s) < mask_top_hw)
        s, y = s.copy(), y.copy()
        y[hide] = np.nan
    return s, y

for az, color, num in shots:
    # landscape aspect to match the spec panel in the viewer
    fig, ax = plt.subplots(figsize=(7.0, 4.27))

    # outer pipe section (cut obliquely for +/-60 deg) with cutout gap on top
    s, y = ellipse_pts(R_OUT, az, mask_top_hw=R_CUT)
    ax.plot(s, y, color="#8a929c", lw=2.5, zorder=2)
    # inner pipe with branch hole on top
    s, y = ellipse_pts(R_IN, az, mask_top_hw=R_NECK)
    ax.plot(s, y, color="#e8821a", lw=2.0, zorder=2)

    # branch neck + flange
    neck_base = 44.45 + np.sqrt(max(R_IN**2 - R_NECK**2, 0))
    for sgn in (-1, 1):
        ax.plot([sgn * R_NECK, sgn * R_NECK], [neck_base, FLG_BOT],
                color="#555c66", lw=2.0, zorder=3)
    ax.add_patch(Rectangle((-FLG_HW, FLG_BOT), 2 * FLG_HW, FLG_TOP - FLG_BOT,
                           fc="#c3cad3", ec="#555c66", lw=1.5, zorder=3))
    # girth weld
    ax.plot([-R_NECK, R_NECK], [WELD_Y, WELD_Y], color="#9a6a3a", lw=1.0,
            ls="--", zorder=4)
    for sgn in (-1, 1):
        ax.plot(sgn * R_NECK, WELD_Y, "o", ms=6, color="#9a6a3a", zorder=5)

    # film (R20 strip seen edge-on) and IQI on the source side
    ax.plot([FILM_S, FILM_S], [WELD_Y - 8, WELD_Y + 8],
            color="#1c4023", lw=5, solid_capstyle="round", zorder=5)
    ax.add_patch(Rectangle((R_NECK + 0.6, WELD_Y - 4.5), 1.6, 9,
                           fc="#e8d44d", ec="none", zorder=5))

    # beam cone: diverges from the source point and floods the whole weld
    # band, threading under the flange overhang
    film_top = np.array([FILM_S, WELD_Y + 13])
    film_bot = np.array([FILM_S, WELD_Y - 13])
    ax.add_patch(Polygon([SRC, film_bot, film_top],
                         closed=True, fc=color, alpha=0.15, ec="none", zorder=1))
    ax.plot([SRC[0], FILM_S], [SRC[1], WELD_Y], color=color, lw=1.4, zorder=4)

    # rays through the near-wall and far-wall weld points -> both project
    # onto the film over a spread, not a single spot
    for wx in (R_NECK, -R_NECK):
        slope = (WELD_Y - SRC[1]) / (wx - SRC[0])
        y_film = WELD_Y + slope * (FILM_S - wx)
        ax.plot([SRC[0], FILM_S], [SRC[1], y_film], color=color, lw=0.9,
                ls="--", alpha=0.8, zorder=4)
        ax.plot(FILM_S, y_film, "o", ms=4, color=color, zorder=6)

    ax.plot(*SRC, "o", ms=10, color="#cc2222", zorder=6)
    ax.plot([SRC[0], SRC[0] + 25], [SRC[1] + 1, SRC[1] + 3.5],
            color="#666c77", lw=5, solid_capstyle="round", zorder=5)

    # annotations
    ax.annotate("", xy=(42, WELD_Y), xytext=(42, FLG_BOT),
                arrowprops=dict(arrowstyle="<->", color="#333333", lw=1.2))
    ax.text(46, (WELD_Y + FLG_BOT) / 2, "8 mm\ngap", fontsize=9.5,
            va="center", color="#333333")
    ax.annotate("Ir-192\n(elev \u22486\u00b0)", xy=SRC, xytext=(SRC[0] - 18, SRC[1] + 16),
                ha="center", fontsize=10, color="#cc2222",
                arrowprops=dict(arrowstyle="->", color="#cc2222"))
    ax.annotate("Film", xy=(FILM_S, WELD_Y - 7), xytext=(FILM_S - 30, WELD_Y - 26),
                ha="center", fontsize=10, color="#1c4023",
                arrowprops=dict(arrowstyle="->", color="#1c4023"))
    ax.annotate("near + far wall\nprojected on film",
                xy=(FILM_S, WELD_Y - 3), xytext=(FILM_S - 48, WELD_Y + 26),
                ha="center", fontsize=9, color=color,
                arrowprops=dict(arrowstyle="->", color=color, alpha=0.8))
    ax.annotate("IQI", xy=(R_NECK + 1.6, WELD_Y + 3), xytext=(R_NECK + 22, WELD_Y + 28),
                ha="center", fontsize=10, color="#a89b20",
                arrowprops=dict(arrowstyle="->", color="#a89b20"))
    ax.annotate("Weld", xy=(-R_NECK, WELD_Y), xytext=(-R_NECK - 24, WELD_Y + 22),
                ha="center", fontsize=10, color="#9a6a3a",
                arrowprops=dict(arrowstyle="->", color="#9a6a3a"))
    ax.text(SRC[0] - 60, 16, "SFD \u2248 210 mm \u00b7 beam clears the flange edge",
            fontsize=9.5, color="#555555", ha="center")

    ax.set_title(f"Shot {num} (azimuth {az:+d}\u00b0) \u2014 section view",
                 fontsize=12, pad=6)
    ax.set_xlim(-100, 205)
    ax.set_ylim(-12, 174)
    ax.set_aspect("equal")
    ax.axis("off")
    fig.tight_layout()
    fig.savefig(f"rt_side{num}.png", dpi=110, facecolor="white")
    plt.close(fig)
    print(f"saved rt_side{num}.png")
