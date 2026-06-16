"""
diagram_2d.py – Generate 2D SVG/PNG visualizations of hatch coaming plan and section views.

Produces:
  (a) hatch_plan.svg/png – Plan view (upper deck + hatch opening + coaming outline + joints)
  (b) hatch_section.svg/png – Section view (upper deck – coaming side – coaming top cross-section)

Members are rendered as fill areas, joints as stroke lines/symbols.
Measure overlays are accumulated using semi-transparent coloured layers.
"""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import svgwrite

from services.engine.rules_db import (
    UNSPECIFIED,
    DecisionResults,
    ProjectInput,
    VisualizationInputs,
)

logger = logging.getLogger(__name__)


def _load_colors() -> dict:
    p = Path("configs/colors.json")
    if p.exists():
        with open(p, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def _measure_color(mid: int, colors: dict) -> Tuple[str, float]:
    """Return (hex_color, alpha) for a measure ID."""
    m = colors.get("measures", {}).get(str(mid), {})
    return m.get("hex", "#888888"), m.get("alpha", 0.25)


def _measure_css(mid: int, colors: dict) -> str:
    m = colors.get("measures", {}).get(str(mid), {})
    return m.get("css", "rgba(128,128,128,0.25)")


def _measure_label(mid: int, colors: dict) -> str:
    m = colors.get("measures", {}).get(str(mid), {})
    return m.get("label", f"Measure {mid}")


def _annotation_keywords(results: DecisionResults, target_id: str) -> List[str]:
    """Collect short annotation keywords for a target."""
    keywords = []
    all_results = {}
    all_results.update(results.member_results)
    all_results.update(results.joint_results)
    tr = all_results.get(target_id)
    if not tr:
        return keywords
    for am in tr.applied_measures:
        if am.measure_id == 0:
            for req in am.requirements:
                if "PJP" in req.description:
                    keywords.append("PJP")
                if "EGW" in req.description:
                    keywords.append("EGW prohibited")
        elif am.measure_id == 1:
            keywords.append("UT100%")
        elif am.measure_id == 2:
            keywords.append("In-svc NDE")
        elif am.measure_id == 3:
            for req in am.requirements:
                if "BCA" in req.description:
                    keywords.append("BCA")
                if "block shift" in req.description.lower() or "offset" in req.description.lower():
                    keywords.append("Offset≥300")
                if "CTOD" in req.description:
                    keywords.append("CTOD≥0.18")
                if "hole" in req.description.lower():
                    keywords.append("CrackHole")
                if "insert" in req.description.lower():
                    keywords.append("Insert")
                if "Enhanced NDE" in req.description or "enhanced" in req.description.lower():
                    keywords.append("EnhNDE")
        elif am.measure_id == 4:
            for n in am.notes:
                if "BCA" in n:
                    keywords.append(n.split(":")[-1].strip() if ":" in n else "BCA")
                    break
            else:
                keywords.append("BCA(M4)")
        elif am.measure_id == 5:
            keywords.append("BCA(M5)")
    return keywords


def _get_measures_for_target(results: DecisionResults, target_id: str) -> List[int]:
    all_results = {}
    all_results.update(results.member_results)
    all_results.update(results.joint_results)
    tr = all_results.get(target_id)
    if not tr:
        return []
    return [am.measure_id for am in tr.applied_measures]


def generate_plan_svg(
    project: ProjectInput,
    results: DecisionResults,
    output_dir: str,
) -> str:
    """Generate plan view SVG."""
    colors = _load_colors()
    bbox = project.visualization_inputs.get_bbox()

    W = 800
    H = 600
    margin = 80
    dwg = svgwrite.Drawing(size=(f"{W}px", f"{H}px"))
    dwg.add(dwg.rect((0, 0), (W, H), fill="white", stroke="none"))

    title = "Hatch Coaming – Plan View"
    if bbox is None:
        title += " (schematic – dimensions unspecified)"
        deck_w, deck_h = W - 2 * margin, H - 2 * margin
        hatch_w, hatch_h = deck_w * 0.7, deck_h * 0.65
    else:
        L, B = bbox.L, bbox.B
        scale = min((W - 2 * margin) / (L * 1.3), (H - 2 * margin) / (B * 1.3))
        deck_w, deck_h = L * 1.3 * scale, B * 1.3 * scale
        hatch_w, hatch_h = L * scale, B * scale

    deck_x = (W - deck_w) / 2
    deck_y = (H - deck_h) / 2 + 15
    hatch_x = (W - hatch_w) / 2
    hatch_y = (H - hatch_h) / 2 + 15

    dwg.add(dwg.text(title, insert=(W / 2, 25), text_anchor="middle",
                      font_size="14px", font_family="sans-serif", fill="#333"))

    # Upper deck plate
    deck_measures = _get_measures_for_target(results, "M01")
    dwg.add(dwg.rect((deck_x, deck_y), (deck_w, deck_h),
                      fill="#E8E8E8", stroke="#666", stroke_width=1))
    for mid in deck_measures:
        hex_c, alpha = _measure_color(mid, colors)
        dwg.add(dwg.rect((deck_x, deck_y), (deck_w, deck_h),
                          fill=hex_c, opacity=alpha, stroke="none"))
    dwg.add(dwg.text("Upper Deck (M01)", insert=(deck_x + 5, deck_y + 15),
                      font_size="10px", font_family="sans-serif", fill="#333"))

    # Hatch opening
    dwg.add(dwg.rect((hatch_x, hatch_y), (hatch_w, hatch_h),
                      fill="white", stroke="#333", stroke_width=2))
    dwg.add(dwg.text("Hatch Opening", insert=(hatch_x + hatch_w / 2, hatch_y + hatch_h / 2),
                      text_anchor="middle", font_size="11px", font_family="sans-serif", fill="#666"))

    # Coaming outline (just inside hatch edge)
    coaming_inset = 8
    cx, cy = hatch_x - coaming_inset, hatch_y - coaming_inset
    cw, ch = hatch_w + 2 * coaming_inset, hatch_h + 2 * coaming_inset
    coaming_measures = _get_measures_for_target(results, "M02")
    dwg.add(dwg.rect((cx, cy), (cw, ch),
                      fill="none", stroke="#DC143C", stroke_width=3, stroke_dasharray="8,4"))
    for mid in coaming_measures:
        hex_c, alpha = _measure_color(mid, colors)
        dwg.add(dwg.rect((cx, cy), (cw, ch),
                          fill="none", stroke=hex_c, stroke_width=5, opacity=alpha))
    dwg.add(dwg.text("Coaming Side (M02)", insert=(cx, cy - 5),
                      font_size="9px", font_family="sans-serif", fill="#DC143C"))

    # Joints
    joint_y_offset = 0
    for j in project.joints:
        j_measures = _get_measures_for_target(results, j.joint_id)
        keywords = _annotation_keywords(results, j.joint_id)

        if j.joint_type == "block_to_block_butt":
            jx = hatch_x + hatch_w * 0.5
            jy1 = deck_y
            jy2 = deck_y + deck_h
            for mid in j_measures:
                hex_c, alpha = _measure_color(mid, colors)
                dwg.add(dwg.line((jx - 1, jy1), (jx - 1, jy2),
                                 stroke=hex_c, stroke_width=3, opacity=max(alpha, 0.5)))
            dwg.add(dwg.line((jx, jy1), (jx, jy2),
                             stroke="#FF8C00", stroke_width=1.5, stroke_dasharray="6,3"))
            label_y = jy1 - 5 - joint_y_offset
            dwg.add(dwg.text(f"{j.joint_id} (butt)", insert=(jx + 3, label_y),
                             font_size="8px", font_family="sans-serif", fill="#FF8C00"))
            if keywords:
                dwg.add(dwg.text(", ".join(keywords), insert=(jx + 3, label_y + 10),
                                 font_size="7px", font_family="sans-serif", fill="#C00"))
            joint_y_offset += 18

        elif j.joint_type == "coaming_to_deck_connection":
            for mid in j_measures:
                hex_c, alpha = _measure_color(mid, colors)
                dwg.add(dwg.rect((cx - 2, cy - 2), (cw + 4, ch + 4),
                                 fill="none", stroke=hex_c, stroke_width=2, opacity=max(alpha, 0.5)))
            dwg.add(dwg.text(f"{j.joint_id} (c2d)", insert=(cx + cw + 5, cy + 15),
                             font_size="8px", font_family="sans-serif", fill="#1E90FF"))
            if keywords:
                dwg.add(dwg.text(", ".join(keywords), insert=(cx + cw + 5, cy + 25),
                                 font_size="7px", font_family="sans-serif", fill="#C00"))

    # Legend
    ly = H - 55
    dwg.add(dwg.text("Legend:", insert=(15, ly), font_size="10px",
                      font_family="sans-serif", fill="#333", font_weight="bold"))
    for i, mid in enumerate([1, 2, 3, 4, 5]):
        hex_c, _ = _measure_color(mid, colors)
        lbl = _measure_label(mid, colors)
        x = 15 + (i % 3) * 250
        y = ly + 15 + (i // 3) * 15
        dwg.add(dwg.rect((x, y - 8), (10, 10), fill=hex_c, opacity=0.7))
        dwg.add(dwg.text(lbl, insert=(x + 14, y), font_size="8px",
                          font_family="sans-serif", fill="#333"))

    os.makedirs(output_dir, exist_ok=True)
    svg_path = os.path.join(output_dir, "hatch_plan.svg")
    dwg.saveas(svg_path)
    logger.info(f"Saved plan SVG: {svg_path}")

    png_path = _svg_to_png(svg_path)
    return svg_path


def generate_section_svg(
    project: ProjectInput,
    results: DecisionResults,
    output_dir: str,
) -> str:
    """Generate section view SVG (upper deck – coaming side – coaming top)."""
    colors = _load_colors()
    bbox = project.visualization_inputs.get_bbox()

    W = 800
    H = 500
    margin = 60
    dwg = svgwrite.Drawing(size=(f"{W}px", f"{H}px"))
    dwg.add(dwg.rect((0, 0), (W, H), fill="white", stroke="none"))

    title = "Hatch Coaming – Section View"
    if bbox is None:
        title += " (schematic)"

    dwg.add(dwg.text(title, insert=(W / 2, 25), text_anchor="middle",
                      font_size="14px", font_family="sans-serif", fill="#333"))

    # Section dimensions
    deck_thick = 20
    side_h = 200 if bbox is None else min(bbox.H * 0.08, 250)
    top_thick = 15
    deck_y = H * 0.65
    deck_left = margin
    deck_right = W - margin
    deck_w = deck_right - deck_left

    coaming_left = deck_left + deck_w * 0.2
    coaming_right = deck_left + deck_w * 0.8
    coaming_w = coaming_right - coaming_left

    # Upper deck plate
    m01_measures = _get_measures_for_target(results, "M01")
    dwg.add(dwg.rect((deck_left, deck_y), (deck_w, deck_thick),
                      fill="#D0D0D0", stroke="#666", stroke_width=1))
    for mid in m01_measures:
        hex_c, alpha = _measure_color(mid, colors)
        dwg.add(dwg.rect((deck_left, deck_y), (deck_w, deck_thick),
                          fill=hex_c, opacity=alpha, stroke="none"))
    dwg.add(dwg.text("Upper Deck (M01)", insert=(deck_left + 5, deck_y + deck_thick + 15),
                      font_size="9px", font_family="sans-serif", fill="#333"))
    kw_m01 = _annotation_keywords(results, "M01")
    if kw_m01:
        dwg.add(dwg.text(", ".join(kw_m01), insert=(deck_left + 5, deck_y + deck_thick + 25),
                          font_size="7px", font_family="sans-serif", fill="#C00"))

    # Coaming side plates (left and right walls)
    side_thick = 12
    side_top = deck_y - side_h
    m02_measures = _get_measures_for_target(results, "M02")

    for sx in [coaming_left, coaming_right - side_thick]:
        dwg.add(dwg.rect((sx, side_top), (side_thick, side_h),
                          fill="#B8B8B8", stroke="#666", stroke_width=1))
        for mid in m02_measures:
            hex_c, alpha = _measure_color(mid, colors)
            dwg.add(dwg.rect((sx, side_top), (side_thick, side_h),
                              fill=hex_c, opacity=alpha, stroke="none"))

    dwg.add(dwg.text("Coaming Side (M02)", insert=(coaming_left - 5, side_top - 5),
                      font_size="9px", font_family="sans-serif", fill="#DC143C"))
    kw_m02 = _annotation_keywords(results, "M02")
    if kw_m02:
        dwg.add(dwg.text(", ".join(kw_m02), insert=(coaming_left - 5, side_top + 12),
                          font_size="7px", font_family="sans-serif", fill="#C00"))

    # Coaming top plate
    m03_measures = _get_measures_for_target(results, "M03")
    dwg.add(dwg.rect((coaming_left, side_top - top_thick), (coaming_w, top_thick),
                      fill="#C8C8C8", stroke="#666", stroke_width=1))
    for mid in m03_measures:
        hex_c, alpha = _measure_color(mid, colors)
        dwg.add(dwg.rect((coaming_left, side_top - top_thick), (coaming_w, top_thick),
                          fill=hex_c, opacity=alpha, stroke="none"))
    dwg.add(dwg.text("Coaming Top (M03)", insert=(coaming_left + coaming_w / 2, side_top - top_thick - 8),
                      text_anchor="middle", font_size="9px", font_family="sans-serif", fill="#666"))

    # Joint markers
    for j in project.joints:
        j_measures = _get_measures_for_target(results, j.joint_id)
        keywords = _annotation_keywords(results, j.joint_id)

        if j.joint_type == "coaming_to_deck_connection":
            for jx in [coaming_left, coaming_right - side_thick]:
                circle_y = deck_y
                for mid in j_measures:
                    hex_c, alpha = _measure_color(mid, colors)
                    dwg.add(dwg.circle((jx + side_thick / 2, circle_y),
                                       r=8, fill=hex_c, opacity=max(alpha, 0.4)))
                dwg.add(dwg.circle((jx + side_thick / 2, circle_y),
                                   r=5, fill="none", stroke="#1E90FF", stroke_width=2))
            dwg.add(dwg.text(f"{j.joint_id}", insert=(coaming_right + 15, deck_y + 5),
                             font_size="8px", font_family="sans-serif", fill="#1E90FF"))
            if keywords:
                dwg.add(dwg.text(", ".join(keywords), insert=(coaming_right + 15, deck_y + 15),
                                 font_size="7px", font_family="sans-serif", fill="#C00"))

        elif j.joint_type == "block_to_block_butt":
            mid_x = (coaming_left + coaming_right) / 2
            for mid in j_measures:
                hex_c, alpha = _measure_color(mid, colors)
                dwg.add(dwg.line((mid_x, deck_y - 3), (mid_x, deck_y + deck_thick + 3),
                                 stroke=hex_c, stroke_width=3, opacity=max(alpha, 0.5)))
            dwg.add(dwg.line((mid_x, deck_y - 3), (mid_x, deck_y + deck_thick + 3),
                             stroke="#FF8C00", stroke_width=1, stroke_dasharray="4,2"))

    # Legend
    ly = H - 45
    dwg.add(dwg.text("Legend:", insert=(15, ly), font_size="10px",
                      font_family="sans-serif", fill="#333", font_weight="bold"))
    for i, mid in enumerate([1, 2, 3, 4, 5]):
        hex_c, _ = _measure_color(mid, colors)
        lbl = _measure_label(mid, colors)
        x = 15 + (i % 3) * 250
        y = ly + 15 + (i // 3) * 15
        dwg.add(dwg.rect((x, y - 8), (10, 10), fill=hex_c, opacity=0.7))
        dwg.add(dwg.text(lbl, insert=(x + 14, y), font_size="8px",
                          font_family="sans-serif", fill="#333"))

    os.makedirs(output_dir, exist_ok=True)
    svg_path = os.path.join(output_dir, "hatch_section.svg")
    dwg.saveas(svg_path)
    logger.info(f"Saved section SVG: {svg_path}")

    png_path = _svg_to_png(svg_path)
    return svg_path


def _svg_to_png(svg_path: str) -> Optional[str]:
    """Convert SVG to PNG using cairosvg if available."""
    try:
        import cairosvg
        png_path = svg_path.replace(".svg", ".png")
        cairosvg.svg2png(url=svg_path, write_to=png_path, scale=2)
        logger.info(f"Saved PNG: {png_path}")
        return png_path
    except Exception as e:
        logger.warning(f"SVG to PNG conversion failed: {e}")
        return None


def generate_2d_diagrams(
    project: ProjectInput,
    results: DecisionResults,
    output_dir: str,
) -> List[str]:
    """Generate all 2D diagrams and return list of file paths."""
    paths = []
    paths.append(generate_plan_svg(project, results, output_dir))
    paths.append(generate_section_svg(project, results, output_dir))
    return [p for p in paths if p]
