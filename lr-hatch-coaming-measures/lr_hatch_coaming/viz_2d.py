"""2D SVG/PNG visualization of hatch coaming with measure overlays.

Generates plan view and section view diagrams with colour-coded
measure applications on members (faces) and joints (lines/symbols).
"""

from __future__ import annotations

import math
import os
from typing import Any, Dict, List, Optional, Union

from .models import (
    UNSPECIFIED,
    HatchOpeningBbox,
    MeasureApplication,
    MeasureTarget,
    MemberInput,
    MemberRole,
    JointInput,
    JointType,
)

# ── Default colour palette (measure_id → hex) ──────────────────────────────
DEFAULT_COLORS: Dict[int, str] = {
    0: "#9E9E9E",  # PJP / structural
    1: "#2196F3",  # Measure 1 – blue
    2: "#FF9800",  # Measure 2 – orange
    3: "#F44336",  # Measure 3 – red
    4: "#4CAF50",  # Measure 4 – green
    5: "#9C27B0",  # Measure 5 – purple
}

# ── SVG helpers ─────────────────────────────────────────────────────────────

_SVG_HEADER = """\
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}"
     width="{w}" height="{h}" style="background:#fff">
<defs>
  <style>
    text {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; }}
    .title {{ font-size: 16px; font-weight: bold; }}
    .label {{ font-size: 10px; fill: #333; }}
    .dim {{ font-size: 9px; fill: #666; }}
  </style>
  {extra_defs}
</defs>
"""

_SVG_FOOTER = "</svg>\n"


def _hatching_pattern(pid: str, color: str) -> str:
    return (
        f'<pattern id="{pid}" width="8" height="8" patternUnits="userSpaceOnUse"'
        f' patternTransform="rotate(45)">'
        f'<line x1="0" y1="0" x2="0" y2="8" stroke="{color}" stroke-width="2"/>'
        f"</pattern>"
    )


def _rect(x: float, y: float, w: float, h: float,
          fill: str = "none", stroke: str = "#000",
          sw: float = 1.5, opacity: float = 1.0,
          extra: str = "") -> str:
    return (
        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" '
        f'fill="{fill}" stroke="{stroke}" stroke-width="{sw}" '
        f'opacity="{opacity}" {extra}/>'
    )


def _line(x1: float, y1: float, x2: float, y2: float,
          stroke: str = "#000", sw: float = 1.5,
          dash: str = "", extra: str = "") -> str:
    d = f'stroke-dasharray="{dash}"' if dash else ""
    return (
        f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" '
        f'stroke="{stroke}" stroke-width="{sw}" {d} {extra}/>'
    )


def _text(x: float, y: float, txt: str, cls: str = "label",
          anchor: str = "middle") -> str:
    return f'<text x="{x}" y="{y}" class="{cls}" text-anchor="{anchor}">{txt}</text>'


def _circle(cx: float, cy: float, r: float, fill: str, stroke: str = "#000",
            sw: float = 1) -> str:
    return (
        f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}" '
        f'stroke="{stroke}" stroke-width="{sw}"/>'
    )


# ── Plan view ───────────────────────────────────────────────────────────────

def generate_plan_svg(
    bbox: Optional[HatchOpeningBbox],
    members: List[MemberInput],
    joints: List[JointInput],
    applications: List[MeasureApplication],
    color_overrides: Optional[Dict[int, str]] = None,
) -> str:
    """Generate plan-view SVG of hatch opening + overlays."""
    colors = {**DEFAULT_COLORS, **(color_overrides or {})}

    # Dimensions (schematic if bbox not provided)
    L = bbox.L if bbox and isinstance(bbox, HatchOpeningBbox) else 12000
    B = bbox.B if bbox and isinstance(bbox, HatchOpeningBbox) else 3600

    scale = 800 / max(L, B)
    sL = L * scale
    sB = B * scale
    margin = 80
    W = sL + 2 * margin
    H = sB + 2 * margin + 80  # extra for legend

    # Build target → measures map
    target_measures: Dict[str, List[MeasureApplication]] = {}
    for app in applications:
        target_measures.setdefault(app.target_id, []).append(app)

    # Patterns
    patterns = []
    for mid, c in colors.items():
        patterns.append(_hatching_pattern(f"hatch_m{mid}", c))

    parts: List[str] = []
    parts.append(_SVG_HEADER.format(
        vb=f"0 0 {W} {H}", w=int(W), h=int(H),
        extra_defs="\n".join(patterns),
    ))

    # Title
    parts.append(_text(W / 2, 24, "Hatch Opening – Plan View", "title"))

    ox, oy = margin, margin + 30

    # Hatch opening outline
    parts.append(_rect(ox, oy, sL, sB, fill="#ECEFF1", stroke="#263238", sw=2))
    parts.append(_text(ox + sL / 2, oy + sB / 2, f"{L}×{B} mm", "dim"))

    # Upper deck plates (top/bottom strips)
    deck_h = 30
    parts.append(_rect(ox, oy - deck_h, sL, deck_h, fill="#E3F2FD", stroke="#1565C0"))
    parts.append(_text(ox + sL / 2, oy - deck_h / 2 + 4, "Upper deck plate", "label"))
    parts.append(_rect(ox, oy + sB, sL, deck_h, fill="#E3F2FD", stroke="#1565C0"))

    # Coaming side plates (left/right strips)
    coam_w = 20
    parts.append(_rect(ox - coam_w, oy, coam_w, sB, fill="#FFEBEE", stroke="#C62828"))
    parts.append(_rect(ox + sL, oy, coam_w, sB, fill="#FFEBEE", stroke="#C62828"))

    # Coaming top plates (top strip on coaming)
    top_h = 10
    parts.append(_rect(ox - coam_w, oy - deck_h - top_h, coam_w + sL + coam_w, top_h,
                        fill="#FFF3E0", stroke="#E65100"))

    # Overlay measure colours on members
    for m in members:
        apps = target_measures.get(m.member_id, [])
        if not apps:
            continue
        for i, app in enumerate(apps):
            c = colors.get(app.measure_id, "#888")
            alpha = max(0.15, 0.35 - i * 0.05)
            if m.member_role == MemberRole.upper_deck_plate:
                parts.append(_rect(ox, oy - deck_h, sL, deck_h,
                                   fill=c, opacity=alpha))
                parts.append(_rect(ox, oy + sB, sL, deck_h,
                                   fill=c, opacity=alpha))
            elif m.member_role == MemberRole.hatch_coaming_side_plate:
                parts.append(_rect(ox - coam_w, oy, coam_w, sB,
                                   fill=c, opacity=alpha))
                parts.append(_rect(ox + sL, oy, coam_w, sB,
                                   fill=c, opacity=alpha))

    # Joints as lines/symbols
    n_joints = max(len(joints), 1)
    for idx, j in enumerate(joints):
        apps = target_measures.get(j.joint_id, [])
        jx = ox + (idx + 1) * sL / (n_joints + 1)
        if j.joint_type == JointType.block_to_block_butt:
            for app in apps:
                c = colors.get(app.measure_id, "#888")
                parts.append(_line(jx, oy - deck_h - top_h, jx, oy + sB + deck_h,
                                   stroke=c, sw=2.5, dash="6,3"))
            parts.append(_text(jx, oy + sB + deck_h + 14,
                               f"{j.joint_id}", "dim"))
        elif j.joint_type == JointType.coaming_to_deck_connection:
            for app in apps:
                c = colors.get(app.measure_id, "#888")
                parts.append(_line(ox - coam_w, oy, ox, oy, stroke=c, sw=3))
                parts.append(_line(ox + sL, oy, ox + sL + coam_w, oy,
                                   stroke=c, sw=3))
            parts.append(_text(ox - coam_w - 5, oy + 4, j.joint_id, "dim", "end"))

    # Legend
    ly = oy + sB + deck_h + 35
    parts.append(_text(ox, ly, "Legend:", "label", "start"))
    lx = ox + 50
    seen_measures: Dict[int, str] = {}
    for app in applications:
        if app.measure_id not in seen_measures:
            seen_measures[app.measure_id] = app.measure_name
    for mid, mname in sorted(seen_measures.items()):
        c = colors.get(mid, "#888")
        parts.append(_rect(lx, ly - 8, 14, 10, fill=c, stroke="none", opacity=0.7))
        parts.append(_text(lx + 18, ly, f"M{mid}: {mname}", "dim", "start"))
        lx += 200

    parts.append(_SVG_FOOTER)
    return "".join(parts)


# ── Section view ────────────────────────────────────────────────────────────

def generate_section_svg(
    bbox: Optional[HatchOpeningBbox],
    members: List[MemberInput],
    joints: List[JointInput],
    applications: List[MeasureApplication],
    color_overrides: Optional[Dict[int, str]] = None,
) -> str:
    """Generate cross-section SVG of hatch coaming structure."""
    colors = {**DEFAULT_COLORS, **(color_overrides or {})}

    B = bbox.B if bbox and isinstance(bbox, HatchOpeningBbox) else 3600
    Hc = bbox.H if bbox and isinstance(bbox, HatchOpeningBbox) else 2500

    scale = 500 / max(B, Hc)
    sB = B * scale
    sH = Hc * scale
    margin = 80
    W = sB + 2 * margin
    H_svg = sH + 2 * margin + 80

    target_measures: Dict[str, List[MeasureApplication]] = {}
    for app in applications:
        target_measures.setdefault(app.target_id, []).append(app)

    parts: List[str] = []
    parts.append(_SVG_HEADER.format(
        vb=f"0 0 {W} {H_svg}", w=int(W), h=int(H_svg),
        extra_defs="",
    ))
    parts.append(_text(W / 2, 24, "Hatch Coaming – Cross Section", "title"))

    ox, oy = margin, margin + 30

    # Upper deck (horizontal bar)
    deck_t = 20
    parts.append(_rect(ox, oy + sH, sB, deck_t, fill="#E3F2FD", stroke="#1565C0", sw=2))
    parts.append(_text(ox + sB / 2, oy + sH + deck_t / 2 + 4, "Upper Deck", "label"))

    # Coaming side plates (vertical bars on both sides)
    coam_w = 12
    parts.append(_rect(ox - coam_w, oy, coam_w, sH, fill="#FFEBEE", stroke="#C62828", sw=2))
    parts.append(_rect(ox + sB, oy, coam_w, sH, fill="#FFEBEE", stroke="#C62828", sw=2))

    # Coaming top plate (horizontal bar at top)
    top_t = 10
    parts.append(_rect(ox - coam_w, oy - top_t, coam_w * 2 + sB, top_t,
                        fill="#FFF3E0", stroke="#E65100", sw=2))
    parts.append(_text(ox + sB / 2, oy - top_t / 2 + 3, "Coaming Top", "label"))

    # Hatch opening
    parts.append(_rect(ox, oy, sB, sH, fill="none", stroke="#263238", sw=1, extra='stroke-dasharray="4,4"'))
    parts.append(_text(ox + sB / 2, oy + sH / 2, "Hatch\nOpening", "dim"))

    # Member overlays
    for m in members:
        apps = target_measures.get(m.member_id, [])
        for i, app in enumerate(apps):
            c = colors.get(app.measure_id, "#888")
            alpha = max(0.15, 0.4 - i * 0.05)
            if m.member_role == MemberRole.upper_deck_plate:
                parts.append(_rect(ox, oy + sH, sB, deck_t, fill=c, opacity=alpha))
            elif m.member_role == MemberRole.hatch_coaming_side_plate:
                parts.append(_rect(ox - coam_w, oy, coam_w, sH, fill=c, opacity=alpha))
                parts.append(_rect(ox + sB, oy, coam_w, sH, fill=c, opacity=alpha))
            elif m.member_role == MemberRole.hatch_coaming_top_plate:
                parts.append(_rect(ox - coam_w, oy - top_t,
                                   coam_w * 2 + sB, top_t, fill=c, opacity=alpha))

    # Joint overlays
    for j in joints:
        apps = target_measures.get(j.joint_id, [])
        if j.joint_type == JointType.coaming_to_deck_connection:
            for app in apps:
                c = colors.get(app.measure_id, "#888")
                # Connection point at coaming base
                parts.append(_circle(ox - coam_w / 2, oy + sH, 5, fill=c))
                parts.append(_circle(ox + sB + coam_w / 2, oy + sH, 5, fill=c))
        elif j.joint_type == JointType.block_to_block_butt:
            for app in apps:
                c = colors.get(app.measure_id, "#888")
                # Horizontal line across section
                parts.append(_line(ox - coam_w - 5, oy + sH * 0.5,
                                   ox + sB + coam_w + 5, oy + sH * 0.5,
                                   stroke=c, sw=2, dash="4,4"))

    # Dimension annotations
    parts.append(_line(ox, oy + sH + deck_t + 15, ox + sB, oy + sH + deck_t + 15,
                        stroke="#666", sw=0.8))
    parts.append(_text(ox + sB / 2, oy + sH + deck_t + 28, f"B = {B} mm", "dim"))

    parts.append(_line(ox + sB + coam_w + 15, oy, ox + sB + coam_w + 15, oy + sH,
                        stroke="#666", sw=0.8))
    parts.append(_text(ox + sB + coam_w + 30, oy + sH / 2, f"H = {Hc} mm", "dim", "start"))

    parts.append(_SVG_FOOTER)
    return "".join(parts)


# ── Mermaid decision flow ──────────────────────────────────────────────────

def generate_decision_flow_mmd(
    required_measures: Dict[int, str],
    control_params: Dict[str, Any],
) -> str:
    """Generate Mermaid flowchart of the decision process."""
    lines = [
        "flowchart TD",
        '    A["Input: Members + Joints"] --> B["Derive Control Parameters"]',
        f'    B --> C["t_control = {control_params.get("t_control", "미지정")}mm\\n'
        f'y_control = {control_params.get("y_control", "미지정")} N/mm²"]',
        '    C --> D["Table 8.2.1 Lookup"]',
    ]
    for mid, status in sorted(required_measures.items()):
        node = f"M{mid}"
        lines.append(f'    D --> {node}["Measure {mid}: {status}"]')
        color = DEFAULT_COLORS.get(mid, "#888")
        lines.append(f"    style {node} fill:{color},color:#fff")

    lines.append('    D --> E["Apply to Targets\\n(cumulative)"]')
    lines.append('    E --> F["Visualization + Audit JSON"]')
    return "\n".join(lines)


# ── File output ─────────────────────────────────────────────────────────────

def write_2d_outputs(
    output_dir: str,
    bbox: Optional[HatchOpeningBbox],
    members: List[MemberInput],
    joints: List[JointInput],
    applications: List[MeasureApplication],
    required_measures: Dict[int, str],
    control_params: Dict[str, Any],
    color_overrides: Optional[Dict[int, str]] = None,
) -> Dict[str, str]:
    """Write all 2D diagram files and return paths."""
    diagrams_dir = os.path.join(output_dir, "diagrams")
    os.makedirs(diagrams_dir, exist_ok=True)

    paths: Dict[str, str] = {}

    plan_svg = generate_plan_svg(bbox, members, joints, applications, color_overrides)
    plan_path = os.path.join(diagrams_dir, "hatch_plan.svg")
    with open(plan_path, "w", encoding="utf-8") as f:
        f.write(plan_svg)
    paths["hatch_plan_svg"] = plan_path

    section_svg = generate_section_svg(bbox, members, joints, applications, color_overrides)
    section_path = os.path.join(diagrams_dir, "hatch_section.svg")
    with open(section_path, "w", encoding="utf-8") as f:
        f.write(section_svg)
    paths["hatch_section_svg"] = section_path

    mmd = generate_decision_flow_mmd(required_measures, control_params)
    mmd_path = os.path.join(diagrams_dir, "decision_flow.mmd")
    with open(mmd_path, "w", encoding="utf-8") as f:
        f.write(mmd)
    paths["decision_flow_mmd"] = mmd_path

    return paths
