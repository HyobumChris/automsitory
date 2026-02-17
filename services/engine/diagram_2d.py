"""2D visualization generator (plan/section) with cumulative overlays."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from .rules_db import DecisionResults, ProjectInput, TargetDecision, UNSPECIFIED

try:
    import cairosvg  # type: ignore
except Exception:  # pragma: no cover - optional dependency
    cairosvg = None

try:
    from PIL import Image, ImageDraw  # type: ignore
except Exception:  # pragma: no cover - optional dependency
    Image = None
    ImageDraw = None


DEFAULT_COLORS: Dict[int, Dict[str, Any]] = {
    1: {"hex": "#FF8C00", "alpha": 0.25},  # orange
    2: {"hex": "#1E90FF", "alpha": 0.25},  # blue
    3: {"hex": "#DC143C", "alpha": 0.25},  # crimson
    4: {"hex": "#2E8B57", "alpha": 0.25},  # green
    5: {"hex": "#8A2BE2", "alpha": 0.25},  # purple
    0: {"hex": "#666666", "alpha": 0.25},  # structural details (PJP, etc.)
}


def _load_colors(colors_config_path: Optional[str]) -> Dict[int, Dict[str, Any]]:
    colors = dict(DEFAULT_COLORS)
    if not colors_config_path:
        return colors
    path = Path(colors_config_path)
    if not path.is_file():
        return colors
    payload = json.loads(path.read_text(encoding="utf-8"))
    for key, value in payload.items():
        try:
            key_int = int(key)
        except Exception:
            continue
        if isinstance(value, dict):
            colors[key_int] = {
                "hex": value.get("hex", colors.get(key_int, {}).get("hex", "#888888")),
                "alpha": value.get("alpha", colors.get(key_int, {}).get("alpha", 0.25)),
            }
    return colors


def _hex_to_rgba(hex_code: str, alpha: float) -> str:
    h = hex_code.lstrip("#")
    if len(h) != 6:
        h = "888888"
    r = int(h[0:2], 16)
    g = int(h[2:4], 16)
    b = int(h[4:6], 16)
    return f"rgba({r},{g},{b},{alpha})"


def _write_png_from_svg(svg_text: str, png_path: str) -> None:
    if cairosvg is not None:
        cairosvg.svg2png(bytestring=svg_text.encode("utf-8"), write_to=png_path)
        return
    if Image is not None and ImageDraw is not None:
        img = Image.new("RGB", (1280, 720), "white")
        draw = ImageDraw.Draw(img)
        draw.text((30, 30), "PNG fallback (SVG is primary artifact)", fill=(30, 30, 30))
        img.save(png_path)
        return
    # Valid 1x1 PNG fallback.
    Path(png_path).write_bytes(
        bytes.fromhex(
            "89504E470D0A1A0A"
            "0000000D49484452000000010000000108060000001F15C489"
            "0000000A49444154789C6360000000020001E221BC330000000049454E44AE426082"
        )
    )


def _resolve_bbox(project_input: ProjectInput) -> Tuple[float, float, float, bool]:
    bbox = project_input.visualization_inputs.hatch_opening_bbox
    if isinstance(bbox, str) and bbox == UNSPECIFIED:
        return 10000.0, 8000.0, 2000.0, True
    return float(bbox.L), float(bbox.B), float(bbox.H), False  # type: ignore[union-attr]


def _keyword_from_measure(measure_id: int, requirements: List[str]) -> str:
    text = " ".join(requirements).lower()
    if measure_id == 1:
        return "UT100%"
    if measure_id == 2:
        return "Periodic NDE"
    if measure_id == 3 and "300" in text:
        return "Offset>=300"
    if measure_id == 3 and "ctod" in text:
        return "CTOD>=0.18"
    if measure_id == 3 and "hole" in text:
        return "Crack-hole"
    if measure_id in (4, 5):
        return "BCA"
    if "pjp" in text:
        return "PJP"
    if "egw" in text:
        return "EGW 금지"
    return f"M{measure_id}"


def _member_targets(decision: DecisionResults) -> Dict[str, TargetDecision]:
    return {item.target_id: item for item in decision.members}


def _joint_targets(decision: DecisionResults) -> Dict[str, TargetDecision]:
    return {item.target_id: item for item in decision.joints}


def _measure_legend(colors: Dict[int, Dict[str, Any]]) -> str:
    order = [1, 2, 3, 4, 5]
    x = 70
    y = 560
    parts: List[str] = ['<text x="20" y="560" font-size="12" font-family="Arial">Legend</text>']
    for measure_id in order:
        c = colors.get(measure_id, {"hex": "#888888", "alpha": 0.25})
        parts.append(
            f'<rect x="{x}" y="{y-12}" width="14" height="14" '
            f'fill="{c["hex"]}" opacity="{c["alpha"]}" stroke="#333" />'
        )
        parts.append(
            f'<text x="{x+20}" y="{y}" font-size="11" font-family="Arial">M{measure_id}</text>'
        )
        x += 90
    return "".join(parts)


def generate_plan_svg(
    project_input: ProjectInput,
    decision: DecisionResults,
    colors: Dict[int, Dict[str, Any]],
) -> str:
    L, B, _, schematic = _resolve_bbox(project_input)
    scale = 0.055
    deck_w = L * scale
    deck_h = B * scale
    ox, oy = 80, 70
    member_map = _member_targets(decision)
    joint_map = _joint_targets(decision)

    parts: List[str] = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<svg xmlns="http://www.w3.org/2000/svg" width="1300" height="620" viewBox="0 0 1300 620">',
        '<rect x="0" y="0" width="1300" height="620" fill="white"/>',
        '<text x="20" y="30" font-size="20" font-family="Arial">Hatch Plan (Cumulative Measure Overlay)</text>',
    ]
    if schematic:
        parts.append(
            '<text x="20" y="50" font-size="12" fill="#a33" font-family="Arial">'
            "치수 미지정(스케치)"
            "</text>"
        )

    # Base geometry
    parts.append(
        f'<rect x="{ox}" y="{oy}" width="{deck_w}" height="{deck_h}" '
        'fill="#eef3f8" stroke="#223" stroke-width="2"/>'
    )
    parts.append(
        f'<text x="{ox+deck_w/2}" y="{oy+deck_h/2}" font-size="12" text-anchor="middle" '
        'font-family="Arial">Hatch opening</text>'
    )

    coaming_t = 16
    # deck strips and coaming outlines
    parts.append(
        f'<rect x="{ox}" y="{oy-coaming_t}" width="{deck_w}" height="{coaming_t}" '
        'fill="#ddeeff" stroke="#678"/>'
    )
    parts.append(
        f'<rect x="{ox}" y="{oy+deck_h}" width="{deck_w}" height="{coaming_t}" '
        'fill="#ddeeff" stroke="#678"/>'
    )
    parts.append(
        f'<rect x="{ox-coaming_t}" y="{oy}" width="{coaming_t}" height="{deck_h}" '
        'fill="#ffe8e8" stroke="#844"/>'
    )
    parts.append(
        f'<rect x="{ox+deck_w}" y="{oy}" width="{coaming_t}" height="{deck_h}" '
        'fill="#ffe8e8" stroke="#844"/>'
    )

    # Member overlays (fill)
    for member in project_input.members:
        target = member_map.get(member.member_id)
        if target is None:
            continue
        for layer, measure in enumerate(target.applied_measures):
            color = colors.get(measure.measure_id, {"hex": "#999", "alpha": 0.25})
            alpha = max(0.12, float(color["alpha"]) - 0.02 * layer)
            fill = _hex_to_rgba(color["hex"], alpha)
            if member.member_role == "upper_deck_plate":
                parts.append(
                    f'<rect x="{ox}" y="{oy-coaming_t}" width="{deck_w}" height="{coaming_t}" '
                    f'fill="{fill}" stroke="none"/>'
                )
                parts.append(
                    f'<rect x="{ox}" y="{oy+deck_h}" width="{deck_w}" height="{coaming_t}" '
                    f'fill="{fill}" stroke="none"/>'
                )
            elif member.member_role == "hatch_coaming_side_plate":
                parts.append(
                    f'<rect x="{ox-coaming_t}" y="{oy}" width="{coaming_t}" height="{deck_h}" '
                    f'fill="{fill}" stroke="none"/>'
                )
                parts.append(
                    f'<rect x="{ox+deck_w}" y="{oy}" width="{coaming_t}" height="{deck_h}" '
                    f'fill="{fill}" stroke="none"/>'
                )
            elif member.member_role == "hatch_coaming_top_plate":
                parts.append(
                    f'<rect x="{ox-coaming_t}" y="{oy-coaming_t-8}" width="{deck_w+2*coaming_t}" height="8" '
                    f'fill="{fill}" stroke="none"/>'
                )

    # Joints (stroke)
    n_joints = max(1, len(project_input.joints))
    for idx, joint in enumerate(project_input.joints):
        target = joint_map.get(joint.joint_id)
        if target is None:
            continue
        x = ox + (idx + 1) * deck_w / (n_joints + 1)
        for layer, measure in enumerate(target.applied_measures):
            color = colors.get(measure.measure_id, {"hex": "#444", "alpha": 0.25})
            sw = 2 + layer * 0.6
            if joint.joint_type == "block_to_block_butt":
                parts.append(
                    f'<line x1="{x}" y1="{oy-coaming_t-10}" x2="{x}" y2="{oy+deck_h+coaming_t+10}" '
                    f'stroke="{color["hex"]}" stroke-opacity="{color["alpha"]}" stroke-width="{sw}" '
                    'stroke-dasharray="6,4"/>'
                )
            else:
                parts.append(
                    f'<line x1="{ox-coaming_t}" y1="{oy}" x2="{ox}" y2="{oy}" '
                    f'stroke="{color["hex"]}" stroke-opacity="{color["alpha"]}" stroke-width="{sw}"/>'
                )
                parts.append(
                    f'<line x1="{ox+deck_w}" y1="{oy}" x2="{ox+deck_w+coaming_t}" y2="{oy}" '
                    f'stroke="{color["hex"]}" stroke-opacity="{color["alpha"]}" stroke-width="{sw}"/>'
                )
        keywords = [
            _keyword_from_measure(m.measure_id, m.requirements)
            for m in target.applied_measures
        ]
        if keywords:
            parts.append(
                f'<text x="{x}" y="{oy+deck_h+40}" font-size="10" text-anchor="middle" '
                f'font-family="Arial">{joint.joint_id}: {",".join(sorted(set(keywords)))}</text>'
            )

    parts.append(_measure_legend(colors))
    parts.append("</svg>")
    return "".join(parts)


def generate_section_svg(
    project_input: ProjectInput,
    decision: DecisionResults,
    colors: Dict[int, Dict[str, Any]],
) -> str:
    _, B, H, schematic = _resolve_bbox(project_input)
    scale = 0.07
    b = B * scale
    h = H * scale
    ox, oy = 120, 90
    member_map = _member_targets(decision)
    joint_map = _joint_targets(decision)

    parts: List[str] = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<svg xmlns="http://www.w3.org/2000/svg" width="1300" height="620" viewBox="0 0 1300 620">',
        '<rect x="0" y="0" width="1300" height="620" fill="white"/>',
        '<text x="20" y="30" font-size="20" font-family="Arial">Hatch Section (Cumulative Measure Overlay)</text>',
    ]
    if schematic:
        parts.append(
            '<text x="20" y="50" font-size="12" fill="#a33" font-family="Arial">'
            "치수 미지정(스케치)"
            "</text>"
        )

    deck_t = 18
    side_t = 12
    top_t = 8
    # base
    parts.append(
        f'<rect x="{ox}" y="{oy+h}" width="{b}" height="{deck_t}" fill="#ddeeff" stroke="#224"/>'
    )
    parts.append(
        f'<rect x="{ox-side_t}" y="{oy}" width="{side_t}" height="{h}" fill="#ffe8e8" stroke="#844"/>'
    )
    parts.append(
        f'<rect x="{ox+b}" y="{oy}" width="{side_t}" height="{h}" fill="#ffe8e8" stroke="#844"/>'
    )
    parts.append(
        f'<rect x="{ox-side_t}" y="{oy-top_t}" width="{b+2*side_t}" height="{top_t}" '
        'fill="#fff1dd" stroke="#b84"/>'
    )

    for member in project_input.members:
        target = member_map.get(member.member_id)
        if not target:
            continue
        for layer, measure in enumerate(target.applied_measures):
            color = colors.get(measure.measure_id, {"hex": "#999", "alpha": 0.25})
            alpha = max(0.12, float(color["alpha"]) - 0.02 * layer)
            fill = _hex_to_rgba(color["hex"], alpha)
            if member.member_role == "upper_deck_plate":
                parts.append(
                    f'<rect x="{ox}" y="{oy+h}" width="{b}" height="{deck_t}" fill="{fill}" stroke="none"/>'
                )
            elif member.member_role == "hatch_coaming_side_plate":
                parts.append(
                    f'<rect x="{ox-side_t}" y="{oy}" width="{side_t}" height="{h}" fill="{fill}" stroke="none"/>'
                )
                parts.append(
                    f'<rect x="{ox+b}" y="{oy}" width="{side_t}" height="{h}" fill="{fill}" stroke="none"/>'
                )
            elif member.member_role == "hatch_coaming_top_plate":
                parts.append(
                    f'<rect x="{ox-side_t}" y="{oy-top_t}" width="{b+2*side_t}" height="{top_t}" '
                    f'fill="{fill}" stroke="none"/>'
                )

    for idx, joint in enumerate(project_input.joints):
        target = joint_map.get(joint.joint_id)
        if not target:
            continue
        y = oy + (idx + 1) * h / (len(project_input.joints) + 1 or 1)
        for layer, measure in enumerate(target.applied_measures):
            color = colors.get(measure.measure_id, {"hex": "#555", "alpha": 0.25})
            sw = 2 + 0.6 * layer
            if joint.joint_type == "block_to_block_butt":
                parts.append(
                    f'<line x1="{ox-side_t-10}" y1="{y}" x2="{ox+b+side_t+10}" y2="{y}" '
                    f'stroke="{color["hex"]}" stroke-opacity="{color["alpha"]}" stroke-width="{sw}" '
                    'stroke-dasharray="5,3"/>'
                )
            else:
                parts.append(
                    f'<circle cx="{ox-side_t/2}" cy="{oy+h}" r="5" fill="{color["hex"]}" '
                    f'fill-opacity="{color["alpha"]}"/>'
                )
                parts.append(
                    f'<circle cx="{ox+b+side_t/2}" cy="{oy+h}" r="5" fill="{color["hex"]}" '
                    f'fill-opacity="{color["alpha"]}"/>'
                )
        keywords = [_keyword_from_measure(m.measure_id, m.requirements) for m in target.applied_measures]
        if keywords:
            parts.append(
                f'<text x="{ox+b+80}" y="{y}" font-size="10" font-family="Arial">{joint.joint_id}: '
                f'{",".join(sorted(set(keywords)))}</text>'
            )

    parts.append(_measure_legend(colors))
    parts.append("</svg>")
    return "".join(parts)


def generate_decision_flow_mermaid(decision: DecisionResults) -> str:
    m1 = decision.required_measures_global.get("1", UNSPECIFIED)
    m2 = decision.required_measures_global.get("2", UNSPECIFIED)
    m3 = decision.required_measures_global.get("3", UNSPECIFIED)
    m4 = decision.required_measures_global.get("4", UNSPECIFIED)
    m5 = decision.required_measures_global.get("5", UNSPECIFIED)

    return "\n".join(
        [
            "flowchart TD",
            'A["Input: member/joint + scan evidence"] --> B["Derive t_control/y_control"]',
            'B --> C["Table 8.2.1 lookup"]',
            f'C --> D["M1={m1}, M2={m2}, M3={m3}, M4={m4}, M5={m5}"]',
            'D --> N2{"M2 cell is See Note 2?"}',
            'N2 -- No --> N2X["M2 follows row value"]',
            'N2 -- Yes --> N2E{"measure3_choice.option == enhanced_NDE?"}',
            'N2E -- Yes --> N2Y["M2 = conditional"]',
            'N2E -- No --> N2N["M2 not applied"]',
            'D --> S0["Applied set: []"]',
            'S0 --> S1["[] -> [1] (if M1 required)"]',
            'S1 --> S2["[1] -> [1,3] (if M3 required)"]',
            'S2 --> S3["[1,3] -> [1,3,4] (if M4 required)"]',
            'S3 --> S4["[1,3,4] -> [1,3,4,5] (if M5 required)"]',
            'S4 --> Z["Append-only target lists + 2D/3D export"]',
        ]
    )


def write_2d_outputs(
    project_input: ProjectInput,
    decision: DecisionResults,
    output_dir: str,
    colors_config_path: Optional[str],
    root_diagrams_dir: Optional[str] = None,
) -> Dict[str, str]:
    colors = _load_colors(colors_config_path)
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)
    diagrams_dir = out / "diagrams"
    diagrams_dir.mkdir(parents=True, exist_ok=True)

    plan_svg = generate_plan_svg(project_input, decision, colors)
    section_svg = generate_section_svg(project_input, decision, colors)
    mmd = generate_decision_flow_mermaid(decision)

    plan_svg_path = out / "hatch_plan.svg"
    section_svg_path = out / "hatch_section.svg"
    plan_png_path = out / "hatch_plan.png"
    section_png_path = out / "hatch_section.png"
    flow_path = diagrams_dir / "decision_flow.mmd"

    plan_svg_path.write_text(plan_svg, encoding="utf-8")
    section_svg_path.write_text(section_svg, encoding="utf-8")
    _write_png_from_svg(plan_svg, str(plan_png_path))
    _write_png_from_svg(section_svg, str(section_png_path))
    flow_path.write_text(mmd, encoding="utf-8")

    # requested explicit location diagrams/decision_flow.mmd at project root
    if root_diagrams_dir:
        root_path = Path(root_diagrams_dir)
        root_path.mkdir(parents=True, exist_ok=True)
        (root_path / "decision_flow.mmd").write_text(mmd, encoding="utf-8")

    return {
        "hatch_plan_svg": str(plan_svg_path),
        "hatch_plan_png": str(plan_png_path),
        "hatch_section_svg": str(section_svg_path),
        "hatch_section_png": str(section_png_path),
        "decision_flow_mmd": str(flow_path),
    }

