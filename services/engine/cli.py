"""
CLI entry point for LR Hatch Coaming Measure Engine.

Usage:
  python -m services.engine.cli --input inputs/project.json --out outputs/demo
"""
from __future__ import annotations

import json
import logging
import sys
from pathlib import Path

import click

from .rules_db import (
    ProjectInput,
    RulesExtraction,
    load_project_input,
    save_json,
    save_dict_json,
)
from .ocr_extract import extract_rules
from .decision_engine import run_decision
from .diagram_2d import generate_2d_diagrams
from .model_3d import generate_3d_model

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@click.command()
@click.option("--input", "input_path", required=True, help="Path to project input JSON")
@click.option("--out", "output_dir", default="outputs/demo", help="Output directory")
@click.option("--rules", "rules_path", default=None, help="Existing rules_extraction.json (skip OCR)")
@click.option("--colors", "colors_path", default="configs/colors.json", help="Colors config JSON")
@click.option("--mapping", "mapping_path", default="configs/mapping_rules.json", help="Mapping rules JSON")
@click.option("--skip-3d", is_flag=True, help="Skip 3D model generation")
@click.option("--skip-2d", is_flag=True, help="Skip 2D diagram generation")
def main(
    input_path: str,
    output_dir: str,
    rules_path: str | None,
    colors_path: str,
    mapping_path: str,
    skip_3d: bool,
    skip_2d: bool,
):
    """LR Hatch Coaming Brittle Fracture Prevention – Measure 1-5 Engine."""
    logger.info("=" * 70)
    logger.info("LR Hatch Coaming Measure Engine v1.0")
    logger.info("=" * 70)

    # 1. Load project input
    logger.info("Loading project input from: %s", input_path)
    project = load_project_input(input_path)
    logger.info("Project: %s, Members: %d, Joints: %d",
                project.project_meta.project_id, len(project.members), len(project.joints))

    # 2. Extract rules (OCR or fallback)
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    rules_output = str(out_dir / "rules_extraction.json")

    source_files = [sf.model_dump() for sf in project.sources.scanned_rule_files]
    rules = extract_rules(
        source_files=source_files,
        evidence_dir="evidence/ocr_snippets",
        output_path=rules_output,
        existing_rules_path=rules_path,
    )
    logger.info("Rules extracted: %d Table 8.2.1 rows, %d Table 8.2.2 rows, %d clauses",
                len(rules.table_821), len(rules.table_822), len(rules.rule_clauses))

    # 3. Run decision engine
    logger.info("Running decision engine...")
    dr = run_decision(project, rules, mapping_path)
    decision_path = str(out_dir / "decision_results.json")
    save_json(dr, decision_path)
    logger.info("Decision results saved: %s", decision_path)

    # 4. Generate 2D diagrams
    if not skip_2d:
        logger.info("Generating 2D diagrams...")
        paths_2d = generate_2d_diagrams(project, dr, output_dir, colors_path)
        for k, v in paths_2d.items():
            logger.info("  %s: %s", k, v)
    else:
        logger.info("2D diagram generation skipped.")

    # 5. Generate 3D model
    if not skip_3d:
        logger.info("Generating 3D model...")
        paths_3d = generate_3d_model(project, dr, output_dir, colors_path)
        for k, v in paths_3d.items():
            logger.info("  %s: %s", k, v)
    else:
        logger.info("3D model generation skipped.")

    # 6. Print summary report
    _print_summary(dr)

    logger.info("=" * 70)
    logger.info("Engine run complete. Output: %s", output_dir)
    logger.info("=" * 70)


def _print_summary(dr):
    """Print summary report to console."""
    s = dr.summary
    print("\n" + "=" * 70)
    print("  SUMMARY REPORT")
    print("=" * 70)
    print(f"  Project ID       : {dr.project_id}")
    print(f"  t_control (mm)   : {s.get('t_control_mm', '미지정')}")
    print(f"  y_control (N/mm²): {s.get('y_control_nmm2', '미지정')}")
    print(f"  Table 8.2.1 Row  : {s.get('table_821_row', '미지정')}")
    print(f"  Required Measures: {s.get('required_measures_global', [])}")
    print()

    print("  --- Member Applied Measures ---")
    for mid, mids in s.get("member_applied_measures", {}).items():
        print(f"    {mid}: Measures {mids}")
    if not s.get("member_applied_measures"):
        print("    (none)")

    print()
    print("  --- Joint Applied Measures ---")
    for jid, mids in s.get("joint_applied_measures", {}).items():
        print(f"    {jid}: Measures {mids}")
    if not s.get("joint_applied_measures"):
        print("    (none)")

    print()
    print(f"  Total Applied Measures : {s.get('total_applied', 0)}")
    print(f"  Manual Review Flags    : {s.get('manual_review_count', 0)}")

    flags = s.get("flags_summary", [])
    if flags:
        print()
        print("  --- Manual Review Flags ---")
        for i, flag in enumerate(flags, 1):
            print(f"    {i}. {flag}")

    print("=" * 70 + "\n")


if __name__ == "__main__":
    main()
