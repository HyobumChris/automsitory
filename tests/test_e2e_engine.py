from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict

from services.engine.cli import run_pipeline_from_paths


MANUAL_TABLE_PATH = "/workspace/inputs/manual_table_input.json"
COLORS_PATH = "/workspace/configs/colors.json"
MAPPING_PATH = "/workspace/configs/mapping_rules.json"


def _base_input() -> Dict[str, Any]:
    return {
        "project_meta": {
            "project_id": "TEST",
            "vessel_name": "미지정",
            "date_local": "2026-02-17",
            "timezone": "Asia/Seoul",
            "allow_web_fetch": False,
        },
        "sources": {
            "scanned_rule_files": [],
            "diagram_files": [],
            "optional_shipright_files": [
                {
                    "path": "inputs/shipright/shipright.pdf",
                    "label": "ShipRight Enhanced NDE",
                    "present": False,
                }
            ],
        },
        "members": [
            {
                "member_id": "M01",
                "member_role": "hatch_coaming_side_plate",
                "zone": "cargo_hold_region",
                "yield_strength_nmm2": 390,
                "grade": "EH36",
                "thickness_mm_as_built": 90,
                "geometry_ref": "coaming_side",
            },
            {
                "member_id": "M02",
                "member_role": "hatch_coaming_top_plate",
                "zone": "cargo_hold_region",
                "yield_strength_nmm2": 390,
                "grade": "EH36",
                "thickness_mm_as_built": 86,
                "geometry_ref": "coaming_top",
            },
            {
                "member_id": "M03",
                "member_role": "upper_deck_plate",
                "zone": "cargo_hold_region",
                "yield_strength_nmm2": 390,
                "grade": "EH36",
                "thickness_mm_as_built": 90,
                "geometry_ref": "upper_deck",
            },
            {
                "member_id": "M04",
                "member_role": "attached_longitudinal",
                "zone": "cargo_hold_region",
                "yield_strength_nmm2": 390,
                "grade": "EH36",
                "thickness_mm_as_built": 20,
                "geometry_ref": "longitudinal",
            },
        ],
        "joints": [
            {
                "joint_id": "J01",
                "joint_type": "block_to_block_butt",
                "zone": "cargo_hold_region",
                "connected_members": ["M01", "M03"],
                "weld_process": "FCAW",
                "geom": {"type": "line", "data": {"start": {"x": 1000, "y": 0}, "end": {"x": 1000, "y": 2000}}},
                "related_joint_ids": ["J02"],
                "notes": "미지정",
            },
            {
                "joint_id": "J02",
                "joint_type": "block_to_block_butt",
                "zone": "cargo_hold_region",
                "connected_members": ["M03", "M04"],
                "weld_process": "GMAW",
                "geom": {"type": "line", "data": {"start": {"x": 1400, "y": 0}, "end": {"x": 1400, "y": 2000}}},
                "related_joint_ids": ["J01"],
                "notes": "미지정",
            },
            {
                "joint_id": "J03",
                "joint_type": "coaming_to_deck_connection",
                "zone": "cargo_hold_region",
                "connected_members": ["M01", "M03"],
                "weld_process": "SMAW",
                "geom": {"type": "point", "data": {"x": 0, "y": 0}},
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
                "enhanced_nde_method": "UT",
                "enhanced_nde_acceptance_criteria_ref": "미지정",
            },
        },
        "visualization_inputs": {
            "output_dir": "미지정",
            "hatch_opening_bbox": {"L": 10000, "B": 8000, "H": 2000},
        },
    }


def _run(tmp_path: Path, payload: Dict[str, Any]) -> Dict[str, Any]:
    input_path = tmp_path / "project.json"
    out_dir = tmp_path / "out"
    out_dir.mkdir(parents=True, exist_ok=True)
    input_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    summary = run_pipeline_from_paths(
        input_path=str(input_path),
        out_path=str(out_dir),
        colors_path=COLORS_PATH,
        mapping_path=MAPPING_PATH,
        manual_table_path=MANUAL_TABLE_PATH,
    )
    decision_path = out_dir / "decision_results.json"
    assert decision_path.exists()
    return {
        "summary": summary,
        "decision": json.loads(decision_path.read_text(encoding="utf-8")),
        "out_dir": out_dir,
    }


def test_case_1_low_thickness_minimal_measures(tmp_path: Path) -> None:
    payload = _base_input()
    for member in payload["members"]:
        if member["member_role"] in ("hatch_coaming_side_plate", "hatch_coaming_top_plate", "upper_deck_plate"):
            member["thickness_mm_as_built"] = 40
    payload["measure3_choice"]["option"] = "block_shift"
    result = _run(tmp_path, payload)
    required = result["decision"]["required_measures_global"]
    assert required["measure_1"] == "not_applicable"
    assert required["measure_3"] == "not_applicable"
    assert required["measure_4"] == "not_applicable"
    assert required["measure_5"] == "not_applicable"

    applications = result["decision"]["applications"]
    assert any(app["measure_id"] == 0 for app in applications), "PJP always-on requirement should be applied."


def test_case_2_many_measures_enhanced_nde(tmp_path: Path) -> None:
    payload = _base_input()
    payload["sources"]["optional_shipright_files"][0]["present"] = True
    payload["measure3_choice"]["option"] = "enhanced_NDE"
    payload["measure3_choice"]["parameters"]["enhanced_nde_acceptance_criteria_ref"] = "ShipRight-AC-01"
    payload["joints"][1]["weld_process"] = "EGW"
    result = _run(tmp_path, payload)
    required = result["decision"]["required_measures_global"]
    assert required["measure_1"] == "required"
    assert required["measure_2"] == "conditional"
    assert required["measure_3"] == "required"
    assert required["measure_4"] == "required"
    assert required["measure_5"] == "required"

    applications = result["decision"]["applications"]
    assert any(app["measure_id"] == 2 and app["status"] == "conditional" for app in applications)
    assert any(app["measure_id"] == 3 and app.get("noncompliance") for app in applications)


def test_case_3_thickness_gt_100_special_consideration(tmp_path: Path) -> None:
    payload = _base_input()
    for member in payload["members"]:
        if member["member_role"] == "hatch_coaming_side_plate":
            member["thickness_mm_as_built"] = 110
        if member["member_role"] == "hatch_coaming_top_plate":
            member["thickness_mm_as_built"] = 108
    payload["measure3_choice"]["option"] = "block_shift"
    result = _run(tmp_path, payload)
    flags = result["decision"]["manual_review_flags"]
    flag_ids = {flag["flag_id"] for flag in flags}
    assert "control_thickness_gt_100" in flag_ids
    assert "global_lookup_no_row" in flag_ids

