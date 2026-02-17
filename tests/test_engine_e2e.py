"""E2E tests for the scan-first LR decision pipeline."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict

from services.engine.cli import run_pipeline


def _write_json(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _base_input() -> Dict[str, Any]:
    return {
        "project_meta": {
            "project_id": "TEST-001",
            "vessel_name": "미지정",
            "date_local": "2026-02-17",
            "timezone": "Asia/Seoul",
            "allow_web_fetch": False,
        },
        "sources": {
            "scanned_rule_files": [
                {
                    "path": "inputs/rules/nonexistent_scan.pdf",
                    "label": "LR scan",
                    "page_hint": "미지정",
                }
            ],
            "diagram_files": [],
            "optional_shipright_files": [
                {
                    "path": "inputs/shipright/nonexistent.pdf",
                    "label": "ShipRight",
                    "present": False,
                }
            ],
        },
        "members": [
            {
                "member_id": "M01",
                "member_role": "hatch_coaming_side_plate",
                "zone": "cargo_hold_region",
                "yield_strength_nmm2": 355,
                "grade": "EH36",
                "thickness_mm_as_built": 45,
                "geometry_ref": "미지정",
            },
            {
                "member_id": "M02",
                "member_role": "hatch_coaming_top_plate",
                "zone": "cargo_hold_region",
                "yield_strength_nmm2": 355,
                "grade": "EH36",
                "thickness_mm_as_built": 40,
                "geometry_ref": "미지정",
            },
            {
                "member_id": "M03",
                "member_role": "upper_deck_plate",
                "zone": "cargo_hold_region",
                "yield_strength_nmm2": 355,
                "grade": "EH36",
                "thickness_mm_as_built": 45,
                "geometry_ref": "미지정",
            },
        ],
        "joints": [
            {
                "joint_id": "J01",
                "joint_type": "block_to_block_butt",
                "zone": "cargo_hold_region",
                "connected_members": ["M01", "M03"],
                "weld_process": "FCAW",
                "geom": {"type": "line", "data": {"x": 1200}},
                "related_joint_ids": [],
                "notes": "미지정",
            },
            {
                "joint_id": "J02",
                "joint_type": "coaming_to_deck_connection",
                "zone": "cargo_hold_region",
                "connected_members": ["M01", "M03"],
                "weld_process": "FCAW",
                "geom": {"type": "point", "data": {"x": 0}},
                "related_joint_ids": [],
                "notes": "미지정",
            },
        ],
        "measure3_choice": {
            "option": "block_shift",
            "parameters": {
                "block_shift_offset_mm": 320,
                "hole_diameter_mm": "미지정",
                "insert_type": "미지정",
                "enhanced_nde_method": "미지정",
                "enhanced_nde_acceptance_criteria_ref": "미지정",
            },
        },
        "visualization_inputs": {
            "output_dir": "outputs/demo",
            "hatch_opening_bbox": {"L": 10000, "B": 8000, "H": 2000},
        },
        "manual_table_input": "inputs/manual_table_input.json",
    }


def _args(input_path: Path, out_dir: Path) -> argparse.Namespace:
    return argparse.Namespace(
        input=str(input_path),
        out=str(out_dir),
        mapping_config="configs/mapping_rules.json",
        colors_config="configs/colors.json",
        manual_table="",
        force_ocr=False,
    )


def test_case1_low_thickness_minimal_measures_and_existing_rules_reuse(tmp_path: Path) -> None:
    input_payload = _base_input()
    input_payload["project_meta"]["project_id"] = "CASE1"
    input_path = tmp_path / "case1_input.json"
    out_dir = tmp_path / "out_case1"
    _write_json(input_path, input_payload)

    # first run: OCR fails, manual table fallback applies
    summary1 = run_pipeline(_args(input_path, out_dir))
    assert summary1["required_measures_global"]["1"] == "not_required"
    assert summary1["required_measures_global"]["3"] == "not_required"
    assert summary1["required_measures_global"]["4"] == "not_required"
    assert summary1["required_measures_global"]["5"] == "not_required"

    decision = json.loads((out_dir / "decision_results.json").read_text(encoding="utf-8"))
    # Only structural requirement (measure 0 / PJP) should exist in this case.
    applied_ids = {item["measure_id"] for item in decision["applied_measures_flat"]}
    assert 1 not in applied_ids
    assert 3 not in applied_ids

    # second run: should reuse existing rules_extraction.json and skip OCR
    summary2 = run_pipeline(_args(input_path, out_dir))
    assert summary2["rules_reused_from_existing_json"] is True


def test_case2_multiple_measures_85_range_enhanced_nde(tmp_path: Path) -> None:
    payload = _base_input()
    payload["project_meta"]["project_id"] = "CASE2"
    payload["members"][0]["yield_strength_nmm2"] = 390
    payload["members"][0]["thickness_mm_as_built"] = 85
    payload["members"][1]["yield_strength_nmm2"] = 390
    payload["members"][1]["thickness_mm_as_built"] = 78
    payload["members"][2]["yield_strength_nmm2"] = 390
    payload["members"][2]["thickness_mm_as_built"] = 85
    payload["measure3_choice"]["option"] = "enhanced_NDE"
    payload["measure3_choice"]["parameters"]["enhanced_nde_method"] = "PAUT"
    payload["measure3_choice"]["parameters"]["enhanced_nde_acceptance_criteria_ref"] = "미지정"

    input_path = tmp_path / "case2_input.json"
    out_dir = tmp_path / "out_case2"
    _write_json(input_path, payload)

    summary = run_pipeline(_args(input_path, out_dir))
    assert summary["required_measures_global"]["1"] == "required"
    assert summary["required_measures_global"]["2"] == "conditional"
    assert summary["required_measures_global"]["3"] == "required"
    assert summary["required_measures_global"]["4"] == "required"
    assert summary["required_measures_global"]["5"] == "required"

    decision = json.loads((out_dir / "decision_results.json").read_text(encoding="utf-8"))
    applied_ids = {item["measure_id"] for item in decision["applied_measures_flat"]}
    assert {1, 2, 3, 4, 5}.issubset(applied_ids)


def test_case3_thickness_gt_100_special_consideration_flag(tmp_path: Path) -> None:
    payload = _base_input()
    payload["project_meta"]["project_id"] = "CASE3"
    payload["members"][0]["yield_strength_nmm2"] = 390
    payload["members"][0]["thickness_mm_as_built"] = 110
    payload["members"][1]["yield_strength_nmm2"] = 390
    payload["members"][1]["thickness_mm_as_built"] = 105
    payload["members"][2]["yield_strength_nmm2"] = 390
    payload["members"][2]["thickness_mm_as_built"] = 108

    input_path = tmp_path / "case3_input.json"
    out_dir = tmp_path / "out_case3"
    _write_json(input_path, payload)

    summary = run_pipeline(_args(input_path, out_dir))
    decision = json.loads((out_dir / "decision_results.json").read_text(encoding="utf-8"))
    assert decision["special_consideration"] is True
    flags = decision["manual_review_flags"]
    assert any(flag["flag_id"] == "thickness_gt_100" for flag in flags)
    assert summary["required_measures_global"]["1"] in ("미지정", "required", "not_required")

