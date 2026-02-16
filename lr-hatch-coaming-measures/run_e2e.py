#!/usr/bin/env python3
"""E2E runner — load sample_input.json, run pipeline, print summary."""

from __future__ import annotations

import json
import logging
import sys
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("run_e2e")


def main(input_path: str = "sample_input.json") -> None:
    from lr_hatch_coaming.models import PipelineInput
    from lr_hatch_coaming.pipeline import run_pipeline

    path = Path(input_path)
    if not path.is_file():
        logger.error("Input file not found: %s", path)
        sys.exit(1)

    logger.info("Loading input from %s", path)
    with open(path, "r", encoding="utf-8") as f:
        raw = json.load(f)

    pipeline_input = PipelineInput(**raw)
    logger.info(
        "Project: %s | Vessel: %s",
        pipeline_input.project_meta.project_id,
        pipeline_input.project_meta.vessel_name,
    )

    summary = run_pipeline(pipeline_input)

    print("\n" + "=" * 60)
    print("PIPELINE SUMMARY")
    print("=" * 60)
    print(json.dumps(summary, indent=2, ensure_ascii=False, default=str))
    print("=" * 60)

    if summary.get("manual_review_flags_count", 0) > 0:
        print(
            f"\n⚠ {summary['manual_review_flags_count']} manual review flag(s) — "
            "see decision_results.json"
        )
    if summary.get("pending_choices_count", 0) > 0:
        print(
            f"\n⚠ {summary['pending_choices_count']} pending choice(s) — "
            "see decision_results.json"
        )

    print(f"\nOutput directory: {pipeline_input.visualization_inputs.output_dir}")


if __name__ == "__main__":
    inp = sys.argv[1] if len(sys.argv) > 1 else "sample_input.json"
    main(inp)
