# -*- coding: utf-8 -*-
"""Top-view diagram of the 3 RT exposures (looking down the branch axis)."""
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Circle, Polygon, FancyArrowPatch
import matplotlib.font_manager as fm

plt.rcParams["font.family"] = "Malgun Gothic"
plt.rcParams["axes.unicode_minus"] = False

# Geometry (top view: plot-x = pipe axis, plot-y = world z)
R_NECK = 13.35      # branch neck outer radius (OD 26.7)
R_WELD = 14.2       # weld bead
R_FILM = 24.0       # film strip radius (stand-off cassette)
R_IQI = 15.0        # IQI holder radius
R_CUT = 35.0        # outer pipe cutout (Ø70)
R_FLG = 35.0        # flange OD 70 -> overhangs to the cutout edge
PIPE_HW = 44.45     # outer pipe half width (OD 88.9)
SRC_D = 78.0        # source drawn closer than the real 170 mm (with note)

FILM_ARC = np.degrees(1.8)   # ~103 degrees
IQI_ARC = np.degrees(1.1)    # ~63 degrees

shots = [(-60, "#e6b800", "촬영 1 (방위 -60°)"),
         (0,   "#e06020", "촬영 2 (방위 0°)"),
         (60,  "#1f8fcc", "촬영 3 (방위 +60°)")]

def dirvec(az_deg):
    """Azimuth measured from +z (up in the plot), toward +x."""
    a = np.radians(az_deg)
    return np.array([np.sin(a), np.cos(a)])

def draw_arc(ax, r, center_az, span_deg, **kw):
    th = np.radians(90 - center_az + np.linspace(-span_deg / 2, span_deg / 2, 60))
    ax.plot(r * np.cos(th), r * np.sin(th), **kw)

def base_scene(ax):
    ax.axhspan(-PIPE_HW, PIPE_HW, color="#d8d8d8", alpha=0.45, zorder=0)
    ax.add_patch(Circle((0, 0), R_CUT, fc="white", ec="#888888",
                        lw=1.2, ls="--", zorder=1))
    ax.add_patch(Circle((0, 0), R_FLG, fc="none", ec="#7a86b0",
                        lw=2.2, alpha=0.9, zorder=4))
    ax.add_patch(Circle((0, 0), R_NECK, fc="#c9ced6", ec="#555c66",
                        lw=1.0, zorder=2))
    th = np.linspace(0, 2 * np.pi, 100)
    ax.plot(R_WELD * np.cos(th), R_WELD * np.sin(th),
            color="#9a6a3a", lw=2.5, zorder=3)

for fig_i in range(1):
    fig, axes = plt.subplots(2, 2, figsize=(12.5, 12.5))

for (az, color, title), ax in zip(shots, axes.flat[:3]):
    base_scene(ax)
    d = dirvec(az)
    n = np.array([-d[1], d[0]])           # perpendicular
    src = d * SRC_D

    # collimated beam (16 mm half width at the film side)
    far = -d * (R_FILM + 6)
    beam = Polygon([src + n * 3, src - n * 3,
                    far - n * 16, far + n * 16],
                   closed=True, fc=color, alpha=0.18, ec="none", zorder=2)
    ax.add_patch(beam)
    ax.plot([src[0], far[0]], [src[1], far[1]], color=color, lw=1.2, zorder=3)

    # source capsule + guide tube
    ax.plot(*src, "o", ms=11, color="#cc2222", zorder=6)
    tube_end = d * (SRC_D + 26)
    ax.plot([src[0], tube_end[0]], [src[1], tube_end[1]],
            color="#666c77", lw=5, solid_capstyle="round", zorder=5)

    # film: 103deg arc at R20, centered OPPOSITE the source
    draw_arc(ax, R_FILM, az + 180, FILM_ARC, color="#1c4023", lw=6,
             solid_capstyle="round", zorder=5)
    # IQI: 63deg arc at R15, on the SOURCE side, wrapped on the weld
    draw_arc(ax, R_IQI, az, IQI_ARC, color="#e8d44d", lw=5,
             solid_capstyle="round", zorder=6)

    # labels
    fdir = dirvec(az + 180)
    ax.annotate("필름 (R24, 호 103°)\n선원 반대쪽, 플랜지 밑",
                xy=fdir * R_FILM, xytext=fdir * 62 + np.array([0, -4]),
                ha="center", fontsize=9.5,
                arrowprops=dict(arrowstyle="->", color="#1c4023"))
    idir = dirvec(az)
    ax.annotate("IQI (와이어형)\n선원쪽 용접비드 위",
                xy=idir * R_IQI, xytext=idir * 50 + n * 30,
                ha="center", fontsize=9.5,
                arrowprops=dict(arrowstyle="->", color="#a89b20"))
    ax.annotate("Ir-192 선원\n(실제 거리 170 mm)",
                xy=src, xytext=src + n * (-40) + d * 6,
                ha="center", fontsize=9.5,
                arrowprops=dict(arrowstyle="->", color="#cc2222"))

    ax.set_title(title, fontsize=13, pad=10)
    ax.set_xlim(-105, 105); ax.set_ylim(-105, 105)
    ax.set_aspect("equal"); ax.axis("off")

# 4th panel: combined circumferential coverage on the weld
ax = axes.flat[3]
base_scene(ax)
for az, color, _ in shots:
    # film-side image arc (bottom ellipse) and source-side image arc (top ellipse)
    draw_arc(ax, R_WELD + 6, az + 180, FILM_ARC, color=color, lw=7,
             alpha=0.9, solid_capstyle="round")
    draw_arc(ax, R_WELD + 12, az, FILM_ARC, color=color, lw=7,
             alpha=0.45, solid_capstyle="round")
ax.annotate("진한 호 = 필름쪽 상(像)\n연한 호 = 선원쪽 상(像)\n3회 합산 → 360° 전둘레 커버",
            xy=(0, -98), ha="center", fontsize=11)
ax.set_title("판독 범위 합산 (용접 전둘레)", fontsize=13, pad=10)
ax.set_xlim(-105, 105); ax.set_ylim(-112, 105)
ax.set_aspect("equal"); ax.axis("off")

fig.suptitle("분기 용접부 RT — 위에서 본 3회 촬영 배치 (플랜지 축 방향 시점)",
             fontsize=15, y=0.98)
fig.text(0.5, 0.005,
         "회색 띠 = 외관(OD 88.9) · 점선 원 = 컷아웃 Ø70 · 파란 원 = 플랜지 Ø70 · "
         "갈색 원 = 거스 용접라인 (필름·IQI는 플랜지 8 mm 아래 틈에 삽입)",
         ha="center", fontsize=10, color="#444444")
fig.tight_layout(rect=[0, 0.02, 1, 0.96])
fig.savefig("rt_topview.png", dpi=130)
print("saved rt_topview.png")
