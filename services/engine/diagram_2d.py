"""
2D SVG/PNG diagram generator for hatch coaming measure visualization.

Generates:
  (a) Plan view: upper deck + hatch opening + coaming outline + joints
  (b) Section view: upper deck – coaming side – coaming top cross-section

Each target is colored by cumulative measure overlays.
"""
from __future__ import annotations

import json
import logging
import math
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from .rules_db import (
    AppliedMeasure,
    DecisionResults,
    HatchOpeningBbox,
    ProjectInput,
    TargetType,
    is_unspecified,
)

logger = logging.getLogger(__name__)

try:
    import svgwrite
    _SVG_AVAILABLE = True
except ImportError:
    _SVG_AVAILABLE = False
    svgwrite = None

try:
    from PIL import Image as PILImage
    _PIL_AVAILABLE = True
except ImportError:
    _PIL_AVAILABLE = False


# ---------------------------------------------------------------------------
# Color config
# ---------------------------------------------------------------------------

def _load_colors(path: str = "configs/colors.json") -> Dict[str, Any]:
    if Path(path).exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {
        "measures": {
            "0": {"hex": "#888888", "alpha": 0.2},
            "1": {"hex": "#FF8C00", "alpha": 0.25},
            "2": {"hex": "#1E90FF", "alpha": 0.25},
            "3": {"hex": "#DC143C", "alpha": 0.25},
            "4": {"hex": "#2E8B57", "alpha": 0.25},
            "5": {"hex": "#8A2BE2", "alpha": 0.25},
        }
    }


def _hex_to_rgb(h: str) -> Tuple[int, int, int]:
    h = h.lstrip("#")
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))  # type: ignore


def _measure_color(colors: Dict, measure_id: int) -> str:
    key = str(measure_id)
    if key in colors.get("measures", {}):
        return colors["measures"][key]["hex"]
    return "#888888"


def _measure_alpha(colors: Dict, measure_id: int) -> float:
    key = str(measure_id)
    if key in colors.get("measures", {}):
        return colors["measures"][key].get("alpha", 0.25)
    return 0.25


# ---------------------------------------------------------------------------
# Keyword annotations for measures
# ---------------------------------------------------------------------------

MEASURE_KEYWORDS = {
    0: "PJP",
    1: "UT100%",
    2: "InSvcNDE",
    3: "CrackArrest",
    4: "BCA(Deck)",
    5: "BCA(Ext)",
}


def _annotation_text(am: AppliedMeasure) -> str:
    parts = [MEASURE_KEYWORDS.get(am.measure_id, f"M{am.measure_id}")]
    for req in am.requirements:
        if "offset" in req.lower() and "300" in req:
            parts.append("Offset≥300")
        if "ctod" in req.lower() and "0.18" in req:
            parts.append("CTOD≥0.18")
        if "egw" in req.lower() and "not permitted" in req.lower():
            parts.append("EGW禁")
        if "bca" in req.lower():
            for token in req.split():
                if token.startswith("BCA"):
                    parts.append(token)
                    break
    return " ".join(parts)


# ---------------------------------------------------------------------------
# Build target -> measures map
# ---------------------------------------------------------------------------

def _target_measures_map(dr: DecisionResults) -> Dict[str, List[AppliedMeasure]]:
    tmap: Dict[str, List[AppliedMeasure]] = {}
    for am in dr.applied_measures:
        tmap.setdefault(am.target_id, [])
        tmap[am.target_id].append(am)
    return tmap


# ---------------------------------------------------------------------------
# Plan View SVG
# ---------------------------------------------------------------------------

def _generate_plan_svg(
    project: ProjectInput,
    dr: DecisionResults,
    colors: Dict,
    output_path: Path,
) -> str:
    """Generate plan view SVG."""
    if not _SVG_AVAILABLE:
        logger.warning("svgwrite not available; skipping plan SVG")
        return ""

    tmap = _target_measures_map(dr)

    # Determine dimensions
    bbox = project.visualization_inputs.hatch_opening_bbox
    if is_unspecified(bbox):
        L, B, H = 10000, 8000, 2000
        schematic = True
    else:
        L = float(bbox.L) if not is_unspecified(bbox.L) else 10000
        B = float(bbox.B) if not is_unspecified(bbox.B) else 8000
        H = float(bbox.H) if not is_unspecified(bbox.H) else 2000
        schematic = any(is_unspecified(getattr(bbox, a)) for a in ["L", "B", "H"])

    # SVG canvas
    scale = 0.06  # mm to px
    margin = 80
    w = L * scale + 2 * margin
    h = B * scale + 2 * margin
    dwg = svgwrite.Drawing(str(output_path), size=(f"{w}px", f"{h}px"))
    dwg.viewbox(0, 0, w, h)

    # Background
    dwg.add(dwg.rect((0, 0), (w, h), fill="white"))

    # Title
    title_text = "Hatch Coaming Plan View"
    if schematic:
        title_text += " (치수 미지정 – 스케치)"
    dwg.add(dwg.text(title_text, insert=(margin, 20), font_size="14px", font_family="Arial", fill="black"))

    # Deck area (background)
    deck_x, deck_y = margin / 2, margin / 2 + 20
    deck_w, deck_h = w - margin, h - margin - 10
    dwg.add(dwg.rect((deck_x, deck_y), (deck_w, deck_h),
                      fill="#E8E8E8", stroke="#333", stroke_width=1))

    # Hatch opening
    hx = margin
    hy = margin
    hw = L * scale
    hh = B * scale
    dwg.add(dwg.rect((hx, hy), (hw, hh), fill="white", stroke="#333", stroke_width=2))
    dwg.add(dwg.text("Hatch Opening", insert=(hx + hw / 2 - 40, hy + hh / 2),
                      font_size="12px", font_family="Arial", fill="#666"))

    # Coaming outline (slightly larger than opening)
    coaming_pad = 10
    cx, cy = hx - coaming_pad, hy - coaming_pad
    cw, ch = hw + 2 * coaming_pad, hh + 2 * coaming_pad
    dwg.add(dwg.rect((cx, cy), (cw, ch), fill="none", stroke="#555", stroke_width=3, stroke_dasharray="8,4"))

    # Draw members as colored regions
    member_map = {m.member_id: m for m in project.members}
    member_regions = _plan_member_regions(project, hx, hy, hw, hh, margin)

    for mid, region in member_regions.items():
        measures = tmap.get(mid, [])
        if not measures:
            # Draw base region
            dwg.add(dwg.rect((region["x"], region["y"]), (region["w"], region["h"]),
                              fill="#D0D0D0", stroke="#999", stroke_width=1, opacity=0.5))
        else:
            for i, am in enumerate(measures):
                color = _measure_color(colors, am.measure_id)
                alpha = _measure_alpha(colors, am.measure_id)
                offset = i * 2  # slight offset for layer visibility
                dwg.add(dwg.rect(
                    (region["x"] + offset, region["y"] + offset),
                    (region["w"], region["h"]),
                    fill=color, stroke=color, stroke_width=1,
                    opacity=alpha,
                ))

        # Label
        label_y = region["y"] + region["h"] / 2
        m = member_map.get(mid)
        label = mid
        if m:
            role = str(m.member_role).replace("_", " ") if not is_unspecified(m.member_role) else "?"
            label = f"{mid} ({role})"
        dwg.add(dwg.text(label, insert=(region["x"] + 3, label_y),
                          font_size="8px", font_family="Arial", fill="black"))

        # Annotation for measures
        if measures:
            anno_parts = [_annotation_text(am) for am in measures]
            anno = " | ".join(anno_parts)
            dwg.add(dwg.text(anno, insert=(region["x"] + 3, label_y + 12),
                              font_size="7px", font_family="Arial", fill="#333"))

    # Draw joints as lines/symbols
    joint_positions = _plan_joint_positions(project, hx, hy, hw, hh)
    for jid, pos in joint_positions.items():
        measures = tmap.get(jid, [])
        x1, y1, x2, y2 = pos

        # Base line
        dwg.add(dwg.line((x1, y1), (x2, y2), stroke="#666", stroke_width=2))

        # Measure overlay lines
        for i, am in enumerate(measures):
            color = _measure_color(colors, am.measure_id)
            offset = (i + 1) * 3
            dwg.add(dwg.line(
                (x1, y1 + offset), (x2, y2 + offset),
                stroke=color, stroke_width=3, opacity=0.7,
            ))

        # Joint label + annotations
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2
        dwg.add(dwg.text(jid, insert=(mx - 10, my - 5),
                          font_size="7px", font_family="Arial", fill="black"))
        if measures:
            anno_parts = [_annotation_text(am) for am in measures]
            anno = " | ".join(anno_parts)
            dwg.add(dwg.text(anno, insert=(mx - 10, my + 8),
                              font_size="6px", font_family="Arial", fill="#333"))

    # Legend
    _draw_legend(dwg, colors, w - 160, 30, dr)

    # Dimensions annotation
    dwg.add(dwg.text(f"L={L}mm, B={B}mm", insert=(margin, h - 10),
                      font_size="9px", font_family="Arial", fill="#666"))

    dwg.save()
    return str(output_path)


def _plan_member_regions(
    project: ProjectInput,
    hx: float, hy: float, hw: float, hh: float,
    margin: float,
) -> Dict[str, Dict[str, float]]:
    """Assign schematic regions for members in plan view."""
    regions: Dict[str, Dict[str, float]] = {}
    deck_members = []
    side_members = []
    top_members = []
    other_members = []

    for m in project.members:
        role = m.member_role
        if role == "upper_deck_plate":
            deck_members.append(m.member_id)
        elif role == "hatch_coaming_side_plate":
            side_members.append(m.member_id)
        elif role == "hatch_coaming_top_plate":
            top_members.append(m.member_id)
        else:
            other_members.append(m.member_id)

    # Deck plates: strips along top and bottom of hatch
    for i, mid in enumerate(deck_members):
        regions[mid] = {
            "x": hx,
            "y": hy + hh + 5 + i * 25,
            "w": hw,
            "h": 20,
        }

    # Side plates: left and right of hatch
    for i, mid in enumerate(side_members):
        side = i % 2
        x = hx - 25 if side == 0 else hx + hw + 5
        regions[mid] = {
            "x": x,
            "y": hy,
            "w": 20,
            "h": hh,
        }

    # Top plates: along top edge
    for i, mid in enumerate(top_members):
        regions[mid] = {
            "x": hx + i * (hw / max(len(top_members), 1)),
            "y": hy - 25,
            "w": hw / max(len(top_members), 1),
            "h": 20,
        }

    # Other
    for i, mid in enumerate(other_members):
        regions[mid] = {
            "x": margin / 2 + i * 30,
            "y": hy + hh + 40,
            "w": 25,
            "h": 15,
        }

    return regions


def _plan_joint_positions(
    project: ProjectInput,
    hx: float, hy: float, hw: float, hh: float,
) -> Dict[str, Tuple[float, float, float, float]]:
    """Assign schematic line positions for joints in plan view."""
    positions: Dict[str, Tuple[float, float, float, float]] = {}
    butt_joints = []
    connection_joints = []
    other_joints = []

    for j in project.joints:
        if j.joint_type == "block_to_block_butt":
            butt_joints.append(j.joint_id)
        elif j.joint_type == "coaming_to_deck_connection":
            connection_joints.append(j.joint_id)
        else:
            other_joints.append(j.joint_id)

    # Butt joints: vertical lines across deck/coaming
    for i, jid in enumerate(butt_joints):
        frac = (i + 1) / (len(butt_joints) + 1)
        x = hx + hw * frac
        positions[jid] = (x, hy - 30, x, hy + hh + 30)

    # Connection joints: along coaming perimeter
    for i, jid in enumerate(connection_joints):
        side = i % 4
        if side == 0:  # bottom
            frac = (i // 4 + 1) / (len(connection_joints) // 4 + 2)
            positions[jid] = (hx, hy + hh + 2, hx + hw, hy + hh + 2)
        elif side == 1:  # top
            positions[jid] = (hx, hy - 2, hx + hw, hy - 2)
        elif side == 2:  # left
            positions[jid] = (hx - 2, hy, hx - 2, hy + hh)
        else:  # right
            positions[jid] = (hx + hw + 2, hy, hx + hw + 2, hy + hh)

    # Other
    for i, jid in enumerate(other_joints):
        positions[jid] = (hx + i * 20, hy + hh + 50, hx + i * 20 + 15, hy + hh + 50)

    return positions


# ---------------------------------------------------------------------------
# Section View SVG
# ---------------------------------------------------------------------------

def _generate_section_svg(
    project: ProjectInput,
    dr: DecisionResults,
    colors: Dict,
    output_path: Path,
) -> str:
    """Generate cross-section view SVG."""
    if not _SVG_AVAILABLE:
        return ""

    tmap = _target_measures_map(dr)
    member_map = {m.member_id: m for m in project.members}

    bbox = project.visualization_inputs.hatch_opening_bbox
    if is_unspecified(bbox):
        L, B, H = 10000, 8000, 2000
        schematic = True
    else:
        L = float(bbox.L) if not is_unspecified(bbox.L) else 10000
        B = float(bbox.B) if not is_unspecified(bbox.B) else 8000
        H = float(bbox.H) if not is_unspecified(bbox.H) else 2000
        schematic = any(is_unspecified(getattr(bbox, a)) for a in ["L", "B", "H"])

    # Section dimensions (B width, H height)
    scale = 0.08
    margin = 60
    w = B * scale + 2 * margin
    h = H * scale + 2 * margin + 60
    dwg = svgwrite.Drawing(str(output_path), size=(f"{w}px", f"{h}px"))
    dwg.viewbox(0, 0, w, h)

    dwg.add(dwg.rect((0, 0), (w, h), fill="white"))

    title = "Hatch Coaming Section View"
    if schematic:
        title += " (치수 미지정 – 스케치)"
    dwg.add(dwg.text(title, insert=(margin, 20), font_size="14px", font_family="Arial", fill="black"))

    # Section geometry
    deck_y = margin + H * scale + 30  # deck level
    deck_thick = 15
    coaming_h = H * scale
    coaming_thick = 12
    top_flange_h = 8
    top_flange_ext = 15

    # Upper deck plate
    deck_x = margin
    deck_w = B * scale
    dwg.add(dwg.rect((deck_x, deck_y), (deck_w, deck_thick),
                      fill="#E8E8E8", stroke="#333", stroke_width=1))

    # Left coaming side
    lc_x = deck_x + 30
    lc_y = deck_y - coaming_h
    dwg.add(dwg.rect((lc_x, lc_y), (coaming_thick, coaming_h),
                      fill="#D0D0D0", stroke="#333", stroke_width=1))

    # Right coaming side
    rc_x = deck_x + deck_w - 30 - coaming_thick
    dwg.add(dwg.rect((rc_x, lc_y), (coaming_thick, coaming_h),
                      fill="#D0D0D0", stroke="#333", stroke_width=1))

    # Left coaming top flange
    lt_x = lc_x - top_flange_ext
    lt_y = lc_y - top_flange_h
    lt_w = coaming_thick + 2 * top_flange_ext
    dwg.add(dwg.rect((lt_x, lt_y), (lt_w, top_flange_h),
                      fill="#C0C0C0", stroke="#333", stroke_width=1))

    # Right coaming top flange
    rt_x = rc_x - top_flange_ext
    rt_y = lc_y - top_flange_h
    dwg.add(dwg.rect((rt_x, rt_y), (lt_w, top_flange_h),
                      fill="#C0C0C0", stroke="#333", stroke_width=1))

    # Map members to section regions for overlays
    section_regions: Dict[str, Dict[str, float]] = {}
    for m in project.members:
        if m.member_role == "upper_deck_plate":
            section_regions[m.member_id] = {"x": deck_x, "y": deck_y, "w": deck_w, "h": deck_thick}
        elif m.member_role == "hatch_coaming_side_plate":
            section_regions[m.member_id] = {"x": lc_x, "y": lc_y, "w": coaming_thick, "h": coaming_h}
        elif m.member_role == "hatch_coaming_top_plate":
            section_regions[m.member_id] = {"x": lt_x, "y": lt_y, "w": lt_w, "h": top_flange_h}

    # Draw measure overlays on member regions
    for mid, reg in section_regions.items():
        measures = tmap.get(mid, [])
        for i, am in enumerate(measures):
            color = _measure_color(colors, am.measure_id)
            alpha = _measure_alpha(colors, am.measure_id)
            off = i * 2
            dwg.add(dwg.rect(
                (reg["x"] + off, reg["y"] + off),
                (reg["w"], reg["h"]),
                fill=color, opacity=alpha, stroke="none",
            ))

        # Label
        m = member_map.get(mid)
        role_str = str(m.member_role).replace("_", " ") if m and not is_unspecified(m.member_role) else "?"
        label = f"{mid} ({role_str})"
        dwg.add(dwg.text(label, insert=(reg["x"] + 2, reg["y"] + reg["h"] / 2 + 3),
                          font_size="7px", font_family="Arial", fill="black"))

        if measures:
            anno = " | ".join(_annotation_text(am) for am in measures)
            dwg.add(dwg.text(anno, insert=(reg["x"] + 2, reg["y"] + reg["h"] / 2 + 13),
                              font_size="6px", font_family="Arial", fill="#333"))

    # Draw joint symbols at connections
    joint_section_pos: Dict[str, Tuple[float, float]] = {}
    for j in project.joints:
        if j.joint_type == "coaming_to_deck_connection":
            joint_section_pos[j.joint_id] = (lc_x + coaming_thick / 2, deck_y)
        elif j.joint_type == "block_to_block_butt":
            joint_section_pos[j.joint_id] = (deck_x + deck_w / 2, deck_y + deck_thick / 2)

    for jid, (jx, jy) in joint_section_pos.items():
        measures = tmap.get(jid, [])
        # Joint symbol (circle)
        dwg.add(dwg.circle((jx, jy), 5, fill="none", stroke="#666", stroke_width=1))
        for i, am in enumerate(measures):
            color = _measure_color(colors, am.measure_id)
            dwg.add(dwg.circle((jx, jy), 5 + i * 2, fill="none", stroke=color, stroke_width=2, opacity=0.7))

        if measures:
            anno = " | ".join(_annotation_text(am) for am in measures)
            dwg.add(dwg.text(f"{jid}: {anno}", insert=(jx + 10, jy + 3),
                              font_size="6px", font_family="Arial", fill="#333"))

    # Labels
    dwg.add(dwg.text("Upper Deck", insert=(deck_x + deck_w / 2 - 30, deck_y + deck_thick + 15),
                      font_size="9px", font_family="Arial", fill="#666"))
    dwg.add(dwg.text("Coaming Side", insert=(lc_x - 5, lc_y + coaming_h / 2),
                      font_size="8px", font_family="Arial", fill="#666", transform=f"rotate(-90,{lc_x},{lc_y + coaming_h / 2})"))
    dwg.add(dwg.text("Coaming Top", insert=(lt_x + 5, lt_y - 3),
                      font_size="8px", font_family="Arial", fill="#666"))

    # Legend
    _draw_legend(dwg, colors, w - 160, 30, dr)

    # Dimensions
    dwg.add(dwg.text(f"B={B}mm, H={H}mm", insert=(margin, h - 10),
                      font_size="9px", font_family="Arial", fill="#666"))

    dwg.save()
    return str(output_path)


# ---------------------------------------------------------------------------
# Legend
# ---------------------------------------------------------------------------

def _draw_legend(dwg, colors: Dict, x: float, y: float, dr: DecisionResults):
    """Draw color legend for measures."""
    active_measures = set()
    for am in dr.applied_measures:
        active_measures.add(am.measure_id)

    measures_cfg = colors.get("measures", {})
    dy = 0
    dwg.add(dwg.text("Legend:", insert=(x, y + dy), font_size="9px", font_family="Arial",
                      font_weight="bold", fill="black"))
    dy += 14
    for mid in sorted(active_measures):
        key = str(mid)
        cfg = measures_cfg.get(key, {})
        color = cfg.get("hex", "#888")
        label = cfg.get("label", f"Measure {mid}")
        dwg.add(dwg.rect((x, y + dy - 8), (10, 10), fill=color, opacity=0.7))
        dwg.add(dwg.text(label, insert=(x + 14, y + dy), font_size="8px", font_family="Arial", fill="black"))
        dy += 14


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def generate_2d_diagrams(
    project: ProjectInput,
    dr: DecisionResults,
    output_dir: str = "outputs/demo",
    colors_path: str = "configs/colors.json",
) -> Dict[str, str]:
    """Generate plan and section SVG diagrams. Returns dict of output paths."""
    colors = _load_colors(colors_path)
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    paths: Dict[str, str] = {}

    plan_path = out / "hatch_plan.svg"
    result = _generate_plan_svg(project, dr, colors, plan_path)
    if result:
        paths["plan_svg"] = result
        logger.info("Plan SVG saved: %s", result)

    section_path = out / "hatch_section.svg"
    result = _generate_section_svg(project, dr, colors, section_path)
    if result:
        paths["section_svg"] = result
        logger.info("Section SVG saved: %s", result)

    return paths
