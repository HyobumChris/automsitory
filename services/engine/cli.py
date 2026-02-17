"""
cli.py – End-to-end CLI for LR Hatch Coaming Measure determination and visualization.

Usage:
    python -m services.engine.cli --input inputs/project.json --out outputs/demo
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from pathlib import Path

from services.engine.rules_db import ProjectInput, DecisionResults, UNSPECIFIED
from services.engine.ocr_extract import load_or_extract_rules
from services.engine.decision_engine import run_decision_engine
from services.engine.diagram_2d import generate_2d_diagrams
from services.engine.model_3d import generate_3d_model

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


def _print_separator(title: str = ""):
    width = 72
    if title:
        pad = (width - len(title) - 4) // 2
        print(f"\n{'='*pad} [{title}] {'='*pad}")
    else:
        print("=" * width)


def _print_summary(project: ProjectInput, results: DecisionResults):
    """Print summary report to console."""
    _print_separator("SUMMARY REPORT")
    print(f"Project ID   : {results.project_id}")
    print(f"Vessel       : {project.project_meta.vessel_name}")
    print(f"Date         : {project.project_meta.date_local}")
    print()

    _print_separator("CONTROL VALUES")
    cv = results.control_values
    print(f"  t_control (coaming)  : {cv.t_control}")
    print(f"  y_control (coaming)  : {cv.y_control}")
    print(f"  side thickness       : {cv.side_thickness}")
    print(f"  top thickness        : {cv.top_thickness}")
    print(f"  side yield           : {cv.side_yield}")
    print(f"  top yield            : {cv.top_yield}")
    print()

    _print_separator("REQUIRED MEASURES (Global)")
    if results.required_measures_global:
        print(f"  Measures: {results.required_measures_global}")
    else:
        print("  No measures required by Table 8.2.1 (thickness below range or lookup failed).")
    if results.special_consideration:
        print("  *** SPECIAL CONSIDERATION required (t > 100 mm) ***")
    print()

    _print_separator("Table 8.2.1 Row Used")
    if results.table_821_row_used:
        row = results.table_821_row_used
        print(f"  Yield: {row.get('yield_strength_nmm2')} N/mm², "
              f"Thickness range: {row.get('thickness_range')}")
        for k in ["m1", "m2", "m3", "m4", "m5"]:
            val = row.get(k, "?")
            if hasattr(val, "value"):
                val = val.value
            print(f"    {k.upper()}: {val}")
    else:
        print("  No matching row found.")
    print()

    _print_separator("MEMBER RESULTS")
    for mid, tr in sorted(results.member_results.items()):
        measures = [
            f"M{am.measure_id}({am.status})"
            for am in tr.applied_measures
        ]
        print(f"  {mid} [{tr.target_type}]: {', '.join(measures) if measures else 'none'}")
        for am in tr.applied_measures:
            for req in am.requirements:
                print(f"      → {req.description}")
            for note in am.notes:
                print(f"      ⟶ {note}")
    print()

    _print_separator("JOINT RESULTS")
    for jid, tr in sorted(results.joint_results.items()):
        measures = [
            f"M{am.measure_id}({am.status})"
            for am in tr.applied_measures
        ]
        print(f"  {jid} [{tr.target_type}]: {', '.join(measures) if measures else 'none'}")
        for am in tr.applied_measures:
            for req in am.requirements:
                print(f"      → {req.description}")
            for note in am.notes:
                print(f"      ⟶ {note}")
    print()

    _print_separator("MANUAL REVIEW FLAGS")
    if results.manual_review_flags:
        for i, flag in enumerate(results.manual_review_flags, 1):
            print(f"  {i}. {flag}")
    else:
        print("  None.")
    print()

    _print_separator("NONCOMPLIANCE FLAGS")
    if results.noncompliance_flags:
        for i, flag in enumerate(results.noncompliance_flags, 1):
            print(f"  {i}. ⚠ {flag}")
    else:
        print("  None.")
    _print_separator()


def main():
    parser = argparse.ArgumentParser(
        description="LR Hatch Coaming Brittle Fracture Measure Determination Engine"
    )
    parser.add_argument(
        "--input", "-i", required=True,
        help="Path to project input JSON file"
    )
    parser.add_argument(
        "--out", "-o", default=None,
        help="Output directory (overrides input's output_dir)"
    )
    parser.add_argument(
        "--manual-table", default=None,
        help="Path to manually-provided rules extraction JSON"
    )
    parser.add_argument(
        "--skip-viz", action="store_true",
        help="Skip visualization generation"
    )
    parser.add_argument(
        "--skip-3d", action="store_true",
        help="Skip 3D model generation"
    )
    args = parser.parse_args()

    # Load input
    input_path = Path(args.input)
    if not input_path.exists():
        logger.error(f"Input file not found: {input_path}")
        sys.exit(1)

    with open(input_path, "r", encoding="utf-8") as f:
        raw_input = json.load(f)

    project = ProjectInput(**raw_input)
    output_dir = args.out or project.visualization_inputs.output_dir
    os.makedirs(output_dir, exist_ok=True)

    logger.info(f"Project: {project.project_meta.project_id}")
    logger.info(f"Output:  {output_dir}")

    # Step 1: Load/extract rules
    logger.info("Step 1: Loading rules extraction DB...")
    sources_dict = raw_input.get("sources", {})
    rules_db, ocr_flags = load_or_extract_rules(
        sources=sources_dict,
        output_dir=output_dir,
        manual_table_path=args.manual_table,
    )

    # Step 2: Run decision engine
    logger.info("Step 2: Running decision engine...")
    results = run_decision_engine(project, rules_db)
    results.manual_review_flags.extend(
        f for f in ocr_flags if f not in results.manual_review_flags
    )

    # Save decision results
    results_path = os.path.join(output_dir, "decision_results.json")
    with open(results_path, "w", encoding="utf-8") as f:
        json.dump(results.to_dict(), f, ensure_ascii=False, indent=2)
    logger.info(f"Saved decision results: {results_path}")

    # Step 3: Visualization
    if not args.skip_viz:
        logger.info("Step 3: Generating 2D diagrams...")
        try:
            paths_2d = generate_2d_diagrams(project, results, output_dir)
            for p in paths_2d:
                logger.info(f"  Generated: {p}")
        except Exception as e:
            logger.error(f"2D diagram generation failed: {e}")

    if not args.skip_3d:
        logger.info("Step 4: Generating 3D model...")
        try:
            paths_3d = generate_3d_model(project, results, output_dir)
            for p in paths_3d:
                logger.info(f"  Generated: {p}")
        except Exception as e:
            logger.error(f"3D model generation failed: {e}")

    # Print summary
    _print_summary(project, results)

    logger.info("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
