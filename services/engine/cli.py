"""CLI entry point for LR hatch coaming decision + visualization pipeline."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict

from .decision_engine import run_decision_engine
from .diagram_2d import DEFAULT_COLORS, generate_2d_outputs
from .model_3d import generate_3d_outputs
from .models import ProjectInput
from .ocr_extract import extract_or_load_rules_db
from .rules_db import save_rules_db


def _load_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _load_colors(path: Path | None) -> Dict[int, Dict[str, Any]]:
    colors = dict(DEFAULT_COLORS)
    if path is None or not path.exists():
        return colors
    payload = _load_json(path)
    for key, value in payload.items():
        mid = int(key)
        colors[mid] = {
            "hex": value.get("hex", colors.get(mid, {}).get("hex", "#999999")),
            "alpha": float(value.get("alpha", colors.get(mid, {}).get("alpha", 0.25))),
        }
    return colors


def _load_mapping(path: Path | None) -> Dict[str, Any]:
    if path is None or not path.exists():
        return {
            "upper_flange_roles": [
                "upper_deck_plate",
                "hatch_coaming_side_plate",
                "hatch_coaming_top_plate",
                "attached_longitudinal",
            ]
        }
    return _load_json(path)


def _target_summary(decision_json: Dict[str, Any]) -> Dict[str, Any]:
    out: Dict[str, Any] = {"members": {}, "joints": {}}
    for key in ("members", "joints"):
        for target in decision_json.get("targets", {}).get(key, []):
            target_id = target.get("target_id")
            measures = [item.get("measure_id") for item in target.get("applied_measures", [])]
            out[key][target_id] = measures
    return out


def run_pipeline_from_paths(
    input_path: str,
    out_path: str,
    colors_path: str | None = None,
    mapping_path: str | None = None,
    manual_table_path: str | None = None,
) -> Dict[str, Any]:
    input_file = Path(input_path).resolve()
    out_dir = Path(out_path).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    input_payload = _load_json(input_file)
    if manual_table_path:
        input_payload["manual_table_input"] = _load_json(Path(manual_table_path).resolve())
    if "visualization_inputs" not in input_payload:
        input_payload["visualization_inputs"] = {"output_dir": str(out_dir), "hatch_opening_bbox": "미지정"}
    input_payload["visualization_inputs"]["output_dir"] = str(out_dir)
    project_input = ProjectInput.model_validate(input_payload)

    colors = _load_colors(Path(colors_path).resolve() if colors_path else None)
    mapping = _load_mapping(Path(mapping_path).resolve() if mapping_path else None)

    rules_db = extract_or_load_rules_db(project_input, out_dir)
    save_rules_db(out_dir / "rules_extraction.json", rules_db)

    decision = run_decision_engine(project_input, rules_db, mapping)
    decision_path = out_dir / "decision_results.json"
    decision_path.write_text(decision.model_dump_json(indent=2), encoding="utf-8")

    diagram_paths = generate_2d_outputs(project_input, decision, out_dir, colors)
    model_paths = generate_3d_outputs(project_input, decision, rules_db, out_dir, colors)

    summary = {
        "project_id": project_input.project_meta.project_id,
        "required_measures_global": decision.required_measures_global,
        "target_summary": _target_summary(decision.model_dump()),
        "manual_review_flags": [item.model_dump() for item in decision.manual_review_flags],
        "outputs": {
            "rules_extraction_json": str(out_dir / "rules_extraction.json"),
            "decision_results_json": str(decision_path),
            **diagram_paths,
            **model_paths,
        },
    }
    summary_path = out_dir / "summary_report.json"
    summary_path.write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
    return summary


def _print_summary(summary: Dict[str, Any]) -> None:
    print("\n=== 요약 리포트 ===")
    print("[Required measures global]")
    for key, value in summary["required_measures_global"].items():
        print(f"- {key}: {value}")
    print("\n[target별 적용 요약]")
    for kind in ("members", "joints"):
        print(f"* {kind}")
        for target_id, measures in summary["target_summary"][kind].items():
            print(f"  - {target_id}: {measures}")
    print("\n[manual_review_flags]")
    for flag in summary["manual_review_flags"]:
        print(f"- {flag['flag_id']} ({flag['category']}): {flag['message']}")
    if not summary["manual_review_flags"]:
        print("- 없음")
    print("===================\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="LR hatch coaming measure engine")
    parser.add_argument("--input", required=True, help="Input project JSON path")
    parser.add_argument("--out", required=True, help="Output directory")
    parser.add_argument("--colors", default="configs/colors.json", help="Color config JSON")
    parser.add_argument("--mapping", default="configs/mapping_rules.json", help="Mapping rules JSON")
    parser.add_argument("--manual-table", default=None, help="Manual table JSON for OCR fallback")
    args = parser.parse_args()

    summary = run_pipeline_from_paths(
        input_path=args.input,
        out_path=args.out,
        colors_path=args.colors,
        mapping_path=args.mapping,
        manual_table_path=args.manual_table,
    )
    _print_summary(summary)


if __name__ == "__main__":
    main()

