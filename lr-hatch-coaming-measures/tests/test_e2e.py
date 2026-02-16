"""End-to-end pipeline tests.

Runs the full pipeline with sample inputs and verifies output files exist.
"""

from __future__ import annotations

import json
import os
import shutil
import tempfile

import pytest

from lr_hatch_coaming.models import (
    HatchOpeningBbox,
    Measure3Choice,
    Measure3Option,
    Measure3Parameters,
    MemberInput,
    MemberRole,
    JointInput,
    JointType,
    PipelineInput,
    ProjectMeta,
    Sources,
    VisualizationInputs,
    WeldProcess,
    Zone,
    EnhancedNDEMethod,
)
from lr_hatch_coaming.pipeline import run_pipeline


@pytest.fixture
def output_dir():
    d = tempfile.mkdtemp(prefix="lr_hatch_test_")
    yield d
    shutil.rmtree(d, ignore_errors=True)


def _sample_input(output_dir: str, m3_option: Measure3Option = Measure3Option.block_shift) -> PipelineInput:
    m3_params = Measure3Parameters(block_shift_offset_mm=350.0)
    if m3_option == Measure3Option.enhanced_NDE:
        m3_params = Measure3Parameters(
            enhanced_nde_method=EnhancedNDEMethod.PAUT,
            enhanced_nde_acceptance_criteria_ref="ShipRight-FDA-2023",
        )

    return PipelineInput(
        project_meta=ProjectMeta(
            project_id="E2E-TEST-001",
            vessel_name="MV Test Carrier",
            date_local="2026-02-16",
            allow_web_fetch=False,
        ),
        sources=Sources(),
        members=[
            MemberInput(
                member_id="SIDE-01",
                member_role=MemberRole.hatch_coaming_side_plate,
                yield_strength_nmm2=390,
                grade="EH40",
                thickness_mm_as_built=75.0,
                zone=Zone.cargo_hold_region,
            ),
            MemberInput(
                member_id="TOP-01",
                member_role=MemberRole.hatch_coaming_top_plate,
                yield_strength_nmm2=390,
                grade="EH40",
                thickness_mm_as_built=60.0,
                zone=Zone.cargo_hold_region,
            ),
            MemberInput(
                member_id="DECK-01",
                member_role=MemberRole.upper_deck_plate,
                yield_strength_nmm2=390,
                grade="EH40",
                thickness_mm_as_built=70.0,
                zone=Zone.cargo_hold_region,
            ),
            MemberInput(
                member_id="LONG-01",
                member_role=MemberRole.attached_longitudinal,
                yield_strength_nmm2=355,
                grade="EH36",
                thickness_mm_as_built=25.0,
                zone=Zone.cargo_hold_region,
            ),
        ],
        joints=[
            JointInput(
                joint_id="J-BUTT-01",
                joint_type=JointType.block_to_block_butt,
                connected_members=["SIDE-01", "DECK-01"],
                zone=Zone.cargo_hold_region,
                weld_process=WeldProcess.FCAW,
            ),
            JointInput(
                joint_id="J-BUTT-02",
                joint_type=JointType.block_to_block_butt,
                connected_members=["DECK-01", "LONG-01"],
                zone=Zone.cargo_hold_region,
                weld_process=WeldProcess.SAW,
            ),
            JointInput(
                joint_id="J-COAM-DECK-01",
                joint_type=JointType.coaming_to_deck_connection,
                connected_members=["SIDE-01", "DECK-01"],
                zone=Zone.cargo_hold_region,
            ),
        ],
        measure3_choice=Measure3Choice(option=m3_option, parameters=m3_params),
        visualization_inputs=VisualizationInputs(
            output_dir=output_dir,
            hatch_opening_bbox=HatchOpeningBbox(L=14500, B=4200, H=2800),
        ),
    )


class TestE2EPipeline:

    def test_full_pipeline_block_shift(self, output_dir):
        pi = _sample_input(output_dir, Measure3Option.block_shift)
        summary = run_pipeline(pi)

        assert summary["project_id"] == "E2E-TEST-001"
        assert summary["total_applications"] > 0

        # Check output files exist
        assert os.path.isfile(os.path.join(output_dir, "rules_extraction.json"))
        assert os.path.isfile(os.path.join(output_dir, "decision_results.json"))
        assert os.path.isfile(os.path.join(output_dir, "pipeline_summary.json"))
        assert os.path.isfile(os.path.join(output_dir, "diagrams", "hatch_plan.svg"))
        assert os.path.isfile(os.path.join(output_dir, "diagrams", "hatch_section.svg"))
        assert os.path.isfile(os.path.join(output_dir, "diagrams", "decision_flow.mmd"))
        assert os.path.isfile(os.path.join(output_dir, "model3d", "hatch_coaming.glb"))
        assert os.path.isfile(os.path.join(output_dir, "model3d", "viewer.html"))

    def test_full_pipeline_enhanced_nde(self, output_dir):
        pi = _sample_input(output_dir, Measure3Option.enhanced_NDE)
        summary = run_pipeline(pi)

        # With enhanced NDE, Measure 2 should appear
        decision = json.loads(
            open(os.path.join(output_dir, "decision_results.json")).read()
        )
        assert "2" in decision["required_measures"] or 2 in decision["required_measures"]

    def test_decision_results_json_structure(self, output_dir):
        pi = _sample_input(output_dir)
        run_pipeline(pi)

        with open(os.path.join(output_dir, "decision_results.json")) as f:
            data = json.load(f)

        assert "project_meta" in data
        assert "control_parameters" in data
        assert "required_measures" in data
        assert "applications" in data
        assert "manual_review_flags" in data

        # Each application must have target_type
        for app in data["applications"]:
            assert app["target_type"] in ("member", "joint")
            assert "measure_id" in app
            assert "target_id" in app

    def test_glb_valid_header(self, output_dir):
        pi = _sample_input(output_dir)
        run_pipeline(pi)

        glb_path = os.path.join(output_dir, "model3d", "hatch_coaming.glb")
        with open(glb_path, "rb") as f:
            magic = f.read(4)
        # glTF magic number
        assert magic == b"glTF"

    def test_svg_well_formed(self, output_dir):
        pi = _sample_input(output_dir)
        run_pipeline(pi)

        for svg_name in ("hatch_plan.svg", "hatch_section.svg"):
            path = os.path.join(output_dir, "diagrams", svg_name)
            with open(path) as f:
                content = f.read()
            assert content.startswith("<?xml")
            assert "</svg>" in content

    def test_cumulative_applications_no_removal(self, output_dir):
        """Verify that running pipeline doesn't remove prior applications."""
        pi = _sample_input(output_dir, Measure3Option.block_shift)
        summary1 = run_pipeline(pi)
        count1 = summary1["total_applications"]

        # Run again (simulating add of new measure) — should not decrease
        summary2 = run_pipeline(pi)
        assert summary2["total_applications"] >= count1
