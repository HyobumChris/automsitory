"""2D diagram generation (plan/section) and Mermaid flow output."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Tuple

from .models import (
    AppliedMeasure,
    DecisionResults,
    JointInput,
    JointType,
    MemberInput,
    MemberRole,
    ProjectInput,
    UNSPECIFIED,
)

try:
    from PIL import Image, ImageDraw  # type: ignore

    HAS_PIL = True
except Exception:
    HAS_PIL = False


DEFAULT_COLORS: Dict[int, Dict[str, Any]] = {
    1: {"hex": "#FF8C00", "alpha": 0.25},
    2: {"hex": "#1E90FF", "alpha": 0.25},
    3: {"hex": "#DC143C", "alpha": 0.25},
    4: {"hex": "#2E8B57", "alpha": 0.25},
    5: {"hex": "#8A2BE2", "alpha": 0.25},
    0: {"hex": "#666666", "alpha": 0.2},
}


def _target_measure_map(applications: List[AppliedMeasure]) -> Dict[str, List[AppliedMeasure]]:
    out: Dict[str, List[AppliedMeasure]] = {}
    for app in applications:
        out.setdefault(app.target_id, []).append(app)
    for key in list(out.keys()):
        out[key] = sorted(out[key], key=lambda item: item.measure_id)
    return out


def _plan_svg(
    project_input: ProjectInput,
    decision: DecisionResults,
    colors: Dict[int, Dict[str, Any]],
) -> str:
    bbox = project_input.visualization_inputs.hatch_opening_bbox
    if isinstance(bbox, str):
        L, B = 1000.0, 700.0
        dim_label = "치수 미지정(스케치)"
    else:
        L, B = float(bbox.L), float(bbox.B)
        dim_label = f"L={bbox.L} B={bbox.B}"

    width = 1200
    height = 820
    margin = 80
    sx = (width - 2 * margin) / L
    sy = (height - 230) / B
    scale = min(sx, sy)
    deck_w = L * scale
    deck_h = B * scale
    x0 = (width - deck_w) / 2
    y0 = 120

    target_map = _target_measure_map(decision.applications)

    def overlay_rect(x: float, y: float, w: float, h: float, member_id: str) -> str:
        apps = target_map.get(member_id, [])
        out = []
        for idx, app in enumerate(apps):
            c = colors.get(app.measure_id, {"hex": "#888888", "alpha": 0.2})
            out.append(
                f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{c["hex"]}" '
                f'fill-opacity="{max(0.1, c["alpha"] - idx * 0.03)}" stroke="none" />'
            )
        return "".join(out)

    side_member_ids = [m.member_id for m in project_input.members if m.member_role == MemberRole.hatch_coaming_side_plate]
    deck_member_ids = [m.member_id for m in project_input.members if m.member_role == MemberRole.upper_deck_plate]
    top_member_ids = [m.member_id for m in project_input.members if m.member_role == MemberRole.hatch_coaming_top_plate]

    svg = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        "<style>",
        "text { font-family: Arial, sans-serif; fill:#222; }",
        ".title { font-size: 20px; font-weight: 700; }",
        ".label { font-size: 12px; }",
        ".small { font-size: 10px; fill:#444; }",
        "</style>",
        '<text x="40" y="44" class="title">Hatch Coaming Plan (누적 오버레이)</text>',
        f'<text x="40" y="64" class="label">{dim_label}</text>',
        f'<rect x="{x0}" y="{y0}" width="{deck_w}" height="{deck_h}" fill="#F8FBFF" stroke="#333" stroke-width="2"/>',
        f'<rect x="{x0}" y="{y0 - 28}" width="{deck_w}" height="28" fill="#DCEEFF" stroke="#225EA8" stroke-width="1"/>',
        f'<rect x="{x0}" y="{y0 + deck_h}" width="{deck_w}" height="28" fill="#DCEEFF" stroke="#225EA8" stroke-width="1"/>',
        f'<rect x="{x0 - 20}" y="{y0}" width="20" height="{deck_h}" fill="#FFE2E2" stroke="#8E1B1B" stroke-width="1"/>',
        f'<rect x="{x0 + deck_w}" y="{y0}" width="20" height="{deck_h}" fill="#FFE2E2" stroke="#8E1B1B" stroke-width="1"/>',
        f'<rect x="{x0 - 20}" y="{y0 - 40}" width="{deck_w + 40}" height="12" fill="#FFF1D6" stroke="#A35300" stroke-width="1"/>',
    ]

    for member_id in deck_member_ids:
        svg.append(overlay_rect(x0, y0 - 28, deck_w, 28, member_id))
        svg.append(overlay_rect(x0, y0 + deck_h, deck_w, 28, member_id))
    for member_id in side_member_ids:
        svg.append(overlay_rect(x0 - 20, y0, 20, deck_h, member_id))
        svg.append(overlay_rect(x0 + deck_w, y0, 20, deck_h, member_id))
    for member_id in top_member_ids:
        svg.append(overlay_rect(x0 - 20, y0 - 40, deck_w + 40, 12, member_id))

    joint_count = max(1, len(project_input.joints))
    for idx, joint in enumerate(project_input.joints):
        xj = x0 + (idx + 1) * deck_w / (joint_count + 1)
        apps = target_map.get(joint.joint_id, [])
        if joint.joint_type == JointType.block_to_block_butt:
            for app in apps:
                c = colors.get(app.measure_id, {"hex": "#777"})
                svg.append(
                    f'<line x1="{xj}" y1="{y0 - 42}" x2="{xj}" y2="{y0 + deck_h + 36}" '
                    f'stroke="{c["hex"]}" stroke-width="3" stroke-dasharray="6,4"/>'
                )
            svg.append(f'<text x="{xj}" y="{y0 + deck_h + 52}" class="small">{joint.joint_id}</text>')
        else:
            for app in apps:
                c = colors.get(app.measure_id, {"hex": "#777"})
                svg.append(
                    f'<line x1="{x0 - 20}" y1="{y0}" x2="{x0}" y2="{y0}" stroke="{c["hex"]}" stroke-width="4"/>'
                )
            svg.append(f'<text x="{x0 - 26}" y="{y0 - 6}" class="small">{joint.joint_id}</text>')

    legend_x = 40
    legend_y = height - 120
    svg.append(f'<text x="{legend_x}" y="{legend_y - 12}" class="label">Legend (Measure)</text>')
    cursor = legend_x
    for measure_id in (1, 2, 3, 4, 5):
        c = colors.get(measure_id, {"hex": "#999999"})["hex"]
        svg.append(f'<rect x="{cursor}" y="{legend_y}" width="18" height="12" fill="{c}" fill-opacity="0.45"/>')
        svg.append(f'<text x="{cursor + 22}" y="{legend_y + 11}" class="small">M{measure_id}</text>')
        cursor += 75

    note_y = legend_y + 28
    keyword_notes = ["UT100%", "Offset≥300", "CTOD≥0.18", "BCA", "PJP", "EGW 금지"]
    svg.append(f'<text x="{legend_x}" y="{note_y}" class="small">Keywords: {" / ".join(keyword_notes)}</text>')

    svg.append("</svg>")
    return "".join(svg)


def _section_svg(
    project_input: ProjectInput,
    decision: DecisionResults,
    colors: Dict[int, Dict[str, Any]],
) -> str:
    bbox = project_input.visualization_inputs.hatch_opening_bbox
    if isinstance(bbox, str):
        B, H = 800.0, 500.0
        dim_label = "치수 미지정(스케치)"
    else:
        B, H = float(bbox.B), float(bbox.H)
        dim_label = f"B={bbox.B} H={bbox.H}"

    width = 1000
    height = 760
    margin = 140
    scale = min((width - 2 * margin) / B, (height - 250) / H)
    sw = B * scale
    sh = H * scale
    x0 = (width - sw) / 2
    y0 = 140

    target_map = _target_measure_map(decision.applications)

    svg = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        "<style>",
        "text { font-family: Arial, sans-serif; fill:#222; }",
        ".title { font-size: 20px; font-weight: 700; }",
        ".small { font-size: 11px; fill:#444; }",
        "</style>",
        '<text x="40" y="44" class="title">Hatch Coaming Section (누적 오버레이)</text>',
        f'<text x="40" y="64" class="small">{dim_label}</text>',
        f'<rect x="{x0}" y="{y0 + sh}" width="{sw}" height="22" fill="#DCEEFF" stroke="#225EA8" stroke-width="1"/>',
        f'<rect x="{x0 - 16}" y="{y0}" width="16" height="{sh}" fill="#FFE2E2" stroke="#8E1B1B" stroke-width="1"/>',
        f'<rect x="{x0 + sw}" y="{y0}" width="16" height="{sh}" fill="#FFE2E2" stroke="#8E1B1B" stroke-width="1"/>',
        f'<rect x="{x0 - 16}" y="{y0 - 14}" width="{sw + 32}" height="14" fill="#FFF1D6" stroke="#A35300" stroke-width="1"/>',
        f'<rect x="{x0}" y="{y0}" width="{sw}" height="{sh}" fill="none" stroke="#555" stroke-dasharray="4,4"/>',
    ]

    member_geoms = {
        MemberRole.upper_deck_plate: (x0, y0 + sh, sw, 22),
        MemberRole.hatch_coaming_side_plate: (x0 - 16, y0, 16, sh),
        MemberRole.hatch_coaming_top_plate: (x0 - 16, y0 - 14, sw + 32, 14),
    }
    for member in project_input.members:
        if member.member_role not in member_geoms:
            continue
        apps = target_map.get(member.member_id, [])
        if not apps:
            continue
        gx, gy, gw, gh = member_geoms[member.member_role]
        for idx, app in enumerate(apps):
            c = colors.get(app.measure_id, {"hex": "#777777", "alpha": 0.2})
            svg.append(
                f'<rect x="{gx}" y="{gy}" width="{gw}" height="{gh}" fill="{c["hex"]}" '
                f'fill-opacity="{max(0.1, c["alpha"] - idx * 0.03)}" stroke="none"/>'
            )

    for joint in project_input.joints:
        apps = target_map.get(joint.joint_id, [])
        if not apps:
            continue
        if joint.joint_type == JointType.coaming_to_deck_connection:
            for app in apps:
                c = colors.get(app.measure_id, {"hex": "#777777"})
                svg.append(f'<circle cx="{x0 - 8}" cy="{y0 + sh}" r="6" fill="{c["hex"]}" />')
                svg.append(f'<circle cx="{x0 + sw + 8}" cy="{y0 + sh}" r="6" fill="{c["hex"]}" />')
        elif joint.joint_type == JointType.block_to_block_butt:
            for app in apps:
                c = colors.get(app.measure_id, {"hex": "#777777"})
                yj = y0 + sh * 0.55
                svg.append(
                    f'<line x1="{x0 - 20}" y1="{yj}" x2="{x0 + sw + 20}" y2="{yj}" '
                    f'stroke="{c["hex"]}" stroke-width="3" stroke-dasharray="6,3"/>'
                )

    svg.append(f'<text x="{x0 + sw / 2}" y="{y0 + sh + 48}" class="small">Section B={B}mm</text>')
    svg.append(f'<text x="{x0 + sw + 24}" y="{y0 + sh / 2}" class="small">H={H}mm</text>')
    svg.append("</svg>")
    return "".join(svg)


def _write_png(path: Path, width: int, height: int, blocks: List[Tuple[int, int, int, int, str]]) -> None:
    if not HAS_PIL:
        return
    img = Image.new("RGB", (width, height), color=(255, 255, 255))
    draw = ImageDraw.Draw(img, "RGBA")
    for x, y, w, h, color_hex in blocks:
        color_hex = color_hex.lstrip("#")
        r = int(color_hex[0:2], 16)
        g = int(color_hex[2:4], 16)
        b = int(color_hex[4:6], 16)
        draw.rectangle([(x, y), (x + w, y + h)], fill=(r, g, b, 90), outline=(70, 70, 70, 180))
    img.save(path)


def _mermaid_flow(decision: DecisionResults) -> str:
    required = decision.required_measures_global
    cumulative = ["[]"]
    applied = []
    for mid in [1, 3, 4, 5]:
        if required.get(f"measure_{mid}") == "required":
            applied.append(str(mid))
            cumulative.append(f"[{','.join(applied)}]")
    if len(cumulative) == 1:
        cumulative.append("[]")
    note2_conditional = required.get("measure_2") == "conditional"

    lines = [
        "flowchart TD",
        '  A["Step1: Material(yield/grade)"] --> B["Step2: Thickness input"]',
        '  B --> C["Step3: Table 8.2.1 lookup"]',
        '  C --> D["Required Measures Global"]',
        f'  D --> E["Cumulative apply: {" -> ".join(cumulative)}"]',
        '  E --> F["Step4: Measure 3 option"]',
    ]
    if note2_conditional:
        lines.append('  F --> G["option=enhanced_NDE ? Measure2=conditional"]')
    else:
        lines.append('  F --> G["option!=enhanced_NDE => Measure2 미적용"]')
    lines.extend(
        [
            '  G --> H["Step5: member/joint 누적 결과"]',
            '  H --> I["Step6: Export JSON + 2D + 3D"]',
        ]
    )
    return "\n".join(lines) + "\n"


def generate_2d_outputs(
    project_input: ProjectInput,
    decision: DecisionResults,
    out_dir: Path,
    colors: Dict[int, Dict[str, Any]],
) -> Dict[str, str]:
    diagrams_dir = out_dir / "diagrams"
    diagrams_dir.mkdir(parents=True, exist_ok=True)

    plan_svg = _plan_svg(project_input, decision, colors)
    plan_svg_path = diagrams_dir / "hatch_plan.svg"
    plan_svg_path.write_text(plan_svg, encoding="utf-8")

    section_svg = _section_svg(project_input, decision, colors)
    section_svg_path = diagrams_dir / "hatch_section.svg"
    section_svg_path.write_text(section_svg, encoding="utf-8")

    # Lightweight PNG fallback drawings.
    plan_png_path = diagrams_dir / "hatch_plan.png"
    section_png_path = diagrams_dir / "hatch_section.png"
    _write_png(
        plan_png_path,
        1200,
        820,
        [
            (140, 160, 920, 420, "#DCEEFF"),
            (120, 190, 20, 360, "#FFE2E2"),
            (1060, 190, 20, 360, "#FFE2E2"),
        ],
    )
    _write_png(
        section_png_path,
        1000,
        760,
        [
            (180, 180, 640, 300, "#FFE2E2"),
            (200, 500, 600, 24, "#DCEEFF"),
        ],
    )

    mmd_text = _mermaid_flow(decision)
    mmd_path = diagrams_dir / "decision_flow.mmd"
    mmd_path.write_text(mmd_text, encoding="utf-8")

    return {
        "hatch_plan_svg": str(plan_svg_path),
        "hatch_section_svg": str(section_svg_path),
        "hatch_plan_png": str(plan_png_path) if plan_png_path.exists() else "",
        "hatch_section_png": str(section_png_path) if section_png_path.exists() else "",
        "decision_flow_mmd": str(mmd_path),
    }

