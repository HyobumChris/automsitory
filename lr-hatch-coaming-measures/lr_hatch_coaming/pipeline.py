"""End-to-end pipeline orchestrator.

Runs: OCR → Rule merge → Decision → Measure application →
      NDT extraction → Learning modules → Visualization → Evidence/Audit output.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, Optional

from .models import (
    UNSPECIFIED,
    ControlParameters,
    DecisionResult,
    HatchOpeningBbox,
    MeasureStatus,
    PipelineInput,
    RulesExtraction,
)
from .ocr_extractor import extract_rules
from .rule_tables import get_default_table_821, get_default_table_822, merge_ocr_with_defaults
from .decision_engine import run_decision
from .measure_applicator import apply_measures
from .viz_2d import write_2d_outputs
from .viz_3d import write_3d_outputs
from .evidence import write_audit_json, write_evidence, write_ndt_evidence
from .ndt_extractor import (
    enrich_applications_with_ndt,
    extract_ndt_specs,
    write_ndt_snippets,
)
from .learning_generator import generate_learning_modules, write_learning_outputs

logger = logging.getLogger(__name__)


def run_pipeline(
    pipeline_input: PipelineInput,
    color_overrides: Optional[Dict[int, str]] = None,
) -> Dict[str, Any]:
    """Execute the full pipeline and return summary + file paths.

    Args:
        pipeline_input: validated PipelineInput
        color_overrides: optional measure_id → hex colour overrides

    Returns:
        dict with keys: output_dir, rules_extraction_path, decision_results_path,
                        diagram_paths, model3d_paths, evidence_paths, summary
    """
    output_dir = pipeline_input.visualization_inputs.output_dir
    os.makedirs(output_dir, exist_ok=True)

    # ── Step 1: OCR extraction ──────────────────────────────────────────
    logger.info("Step 1: OCR extraction from scanned images")
    ocr_result = extract_rules(
        pipeline_input.sources.scanned_rule_images,
        evidence_dir=os.path.join(output_dir, "evidence", "ocr_snippets"),
    )

    # ── Step 2: Merge with defaults ─────────────────────────────────────
    logger.info("Step 2: Merging OCR results with default tables")
    rules = merge_ocr_with_defaults(ocr_result)

    # ── Step 3: Decision engine ─────────────────────────────────────────
    logger.info("Step 3: Running decision engine")
    cp, required_measures, lookup_info, flags = run_decision(
        pipeline_input, rules.table_821,
    )

    # ── Step 4: Measure application ─────────────────────────────────────
    logger.info("Step 4: Applying measures cumulatively to targets")
    applications, app_flags, pending = apply_measures(
        required_measures=required_measures,
        members=pipeline_input.members,
        joints=pipeline_input.joints,
        measure3_choice=pipeline_input.measure3_choice,
        table_822=rules.table_822,
    )
    all_flags = flags + app_flags

    # ── Step 4b: NDT extraction ─────────────────────────────────────────
    logger.info("Step 4b: Extracting NDT/NDE clauses from rules")
    ndt_result = extract_ndt_specs(rules, pipeline_input.sources)
    applications = enrich_applications_with_ndt(applications, ndt_result)
    ndt_snippet_paths = write_ndt_snippets(
        output_dir,
        ndt_result,
        keyed_text=rules.textual_requirements,
    )

    # Build decision result
    decision_result = DecisionResult(
        project_meta=pipeline_input.project_meta,
        control_parameters=cp,
        table_821_lookup=lookup_info,
        required_measures={k: v.value for k, v in required_measures.items()},
        applications=applications,
        manual_review_flags=all_flags,
        pending_choices=pending,
    )

    # ── Step 4c: Learning module generation ─────────────────────────────
    logger.info("Step 4c: Generating NDT learning modules")
    learning_output = generate_learning_modules(
        ndt_result,
        decision_result,
        rules.textual_requirements,
        output_dir,
    )
    learning_paths = write_learning_outputs(output_dir, learning_output)

    # ── Step 5: Resolve bbox ────────────────────────────────────────────
    bbox_input = pipeline_input.visualization_inputs.hatch_opening_bbox
    bbox: Optional[HatchOpeningBbox] = None
    if isinstance(bbox_input, HatchOpeningBbox):
        bbox = bbox_input

    # ── Step 6: 2D visualization ────────────────────────────────────────
    logger.info("Step 5: Generating 2D diagrams")
    req_measures_str = {k: v.value for k, v in required_measures.items()}
    cp_dict = cp.model_dump()
    diagram_paths = write_2d_outputs(
        output_dir=output_dir,
        bbox=bbox,
        members=pipeline_input.members,
        joints=pipeline_input.joints,
        applications=applications,
        required_measures=req_measures_str,
        control_params=cp_dict,
        color_overrides=color_overrides,
    )

    # ── Step 7: 3D visualization ────────────────────────────────────────
    logger.info("Step 6: Generating 3D model and viewer")
    model3d_paths = write_3d_outputs(
        output_dir=output_dir,
        bbox=bbox,
        members=pipeline_input.members,
        joints=pipeline_input.joints,
        applications=applications,
        color_overrides=color_overrides,
    )

    # ── Step 8: Evidence + Audit JSON ───────────────────────────────────
    logger.info("Step 7: Writing audit JSON and evidence")
    audit_paths = write_audit_json(output_dir, rules, decision_result)
    evidence_paths = write_evidence(output_dir, rules, decision_result)
    ndt_evidence_paths = write_ndt_evidence(output_dir, ndt_result)
    evidence_paths.update(ndt_evidence_paths)

    # ── Summary ─────────────────────────────────────────────────────────
    summary = {
        "project_id": pipeline_input.project_meta.project_id,
        "vessel_name": pipeline_input.project_meta.vessel_name,
        "control_parameters": {
            "t_control": cp.t_control,
            "y_control": cp.y_control,
        },
        "measures_required": {
            f"measure_{k}": v.value for k, v in required_measures.items()
        },
        "total_applications": len(applications),
        "manual_review_flags_count": len(all_flags),
        "pending_choices_count": len(pending),
        "ndt_clauses_count": len(ndt_result.clauses),
        "learning_modules_count": len(learning_output.modules),
        "learning_quizzes_count": len(learning_output.quiz_items),
        "output_files": {
            **audit_paths,
            **diagram_paths,
            **model3d_paths,
            **evidence_paths,
            **learning_paths,
            **ndt_snippet_paths,
        },
        "learning_paths": learning_paths,
    }

    # Write summary
    summary_path = os.path.join(output_dir, "pipeline_summary.json")
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False, default=str)

    logger.info("Pipeline complete. Output at: %s", output_dir)
    return summary
