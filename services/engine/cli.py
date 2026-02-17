"""CLI entrypoint for LR hatch coaming decision pipeline."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict, List

from .decision_engine import run_decision_engine
from .diagram_2d import write_2d_outputs
from .model_3d import write_3d_outputs
from .ocr_extract import extract_rules
from .rules_db import (
    DecisionResults,
    ProjectInput,
    RulesExtraction,
    load_json_file,
    write_json_file,
)


def _load_project_input(path: str) -> ProjectInput:
    payload = load_json_file(path)
    return ProjectInput(**payload)


def _load_rules_if_exists(path: Path) -> RulesExtraction:
    payload = json.loads(path.read_text(encoding="utf-8"))
    return RulesExtraction(**payload)


def _target_summary(decision: DecisionResults) -> Dict[str, List[str]]:
    member_summary: List[str] = []
    joint_summary: List[str] = []

    for member in decision.members:
        ids = [str(item.measure_id) for item in member.applied_measures]
        member_summary.append(f"{member.target_id}: [{','.join(ids)}]")

    for joint in decision.joints:
        ids = [str(item.measure_id) for item in joint.applied_measures]
        joint_summary.append(f"{joint.target_id}: [{','.join(ids)}]")

    return {"members": member_summary, "joints": joint_summary}


def run_pipeline(args: argparse.Namespace) -> Dict[str, Any]:
    project_input = _load_project_input(args.input)
    project_input.visualization_inputs.output_dir = args.out
    if args.manual_table:
        project_input.manual_table_input = args.manual_table

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    rules_path = out / "rules_extraction.json"
    if rules_path.is_file() and not args.force_ocr:
        rules = _load_rules_if_exists(rules_path)
        reused_existing_rules = True
    else:
        rules = extract_rules(project_input, output_dir=str(out))
        reused_existing_rules = False
        write_json_file(str(rules_path), rules)

    decision = run_decision_engine(
        project_input=project_input,
        rules=rules,
        mapping_rules_path=args.mapping_config,
    )

    decision_path = out / "decision_results.json"
    write_json_file(str(decision_path), decision)

    diagram_paths = write_2d_outputs(
        project_input=project_input,
        decision=decision,
        output_dir=str(out),
        colors_config_path=args.colors_config,
        root_diagrams_dir="diagrams",
    )
    model_paths = write_3d_outputs(
        project_input=project_input,
        decision=decision,
        rules=rules,
        output_dir=str(out),
        colors_config_path=args.colors_config,
    )

    summary = {
        "project_id": project_input.project_meta.project_id,
        "output_dir": str(out),
        "rules_reused_from_existing_json": reused_existing_rules,
        "required_measures_global": decision.required_measures_global,
        "target_application_summary": _target_summary(decision),
        "manual_review_flags": [flag.model_dump(mode="json") for flag in decision.manual_review_flags],
        "artifacts": {
            "rules_extraction_json": str(rules_path),
            "decision_results_json": str(decision_path),
            **diagram_paths,
            **model_paths,
        },
    }
    write_json_file(str(out / "summary_report.json"), summary)
    return summary


def _print_console_summary(summary: Dict[str, Any]) -> None:
    print("")
    print("=== 요약 리포트 ===")
    print(f"- Project ID: {summary['project_id']}")
    print("- Required measures global:")
    for measure_id, status in summary["required_measures_global"].items():
        print(f"  M{measure_id}: {status}")
    print("- Target별 적용 요약:")
    print("  [Members]")
    for row in summary["target_application_summary"]["members"]:
        print(f"   - {row}")
    print("  [Joints]")
    for row in summary["target_application_summary"]["joints"]:
        print(f"   - {row}")
    print("- manual_review_flags:")
    if summary["manual_review_flags"]:
        for flag in summary["manual_review_flags"]:
            print(f"   - {flag['flag_id']}: {flag['message']}")
    else:
        print("   - 없음")
    print("===================")


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="LR hatch coaming Measure 1~5 decision + visualization pipeline"
    )
    parser.add_argument("--input", required=True, help="Input project JSON path")
    parser.add_argument("--out", required=True, help="Output directory")
    parser.add_argument(
        "--mapping-config",
        default="configs/mapping_rules.json",
        help="Mapping rules JSON path",
    )
    parser.add_argument(
        "--colors-config",
        default="configs/colors.json",
        help="Color configuration JSON path",
    )
    parser.add_argument(
        "--manual-table",
        default="",
        help="Manual table input JSON path (fallback when OCR incomplete)",
    )
    parser.add_argument(
        "--force-ocr",
        action="store_true",
        help="Force OCR extraction even when rules_extraction.json exists",
    )
    return parser


def main() -> None:
    parser = build_arg_parser()
    args = parser.parse_args()
    summary = run_pipeline(args)
    _print_console_summary(summary)


if __name__ == "__main__":
    main()

