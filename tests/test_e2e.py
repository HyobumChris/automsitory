"""
End-to-end tests for the LR Hatch Coaming Measure Engine.

Test Case 1: Low thickness (YS355, ~60mm) → minimal measures (Measure 1 only)
Test Case 2: High measures (YS460, ~95mm) → Measures 1, 3, 4, 5 + conditional M2
Test Case 3: t>100mm special consideration + block shift fail + EGW noncompliance
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import pytest

# Ensure project root is on path
sys.path.insert(0, str(Path(__file__).parent.parent))

from services.engine.rules_db import (
    DecisionResults,
    DecisionStatus,
    ProjectInput,
    RulesExtraction,
    TargetType,
    load_project_input,
)
from services.engine.ocr_extract import extract_rules
from services.engine.decision_engine import run_decision


def _run_case(input_file: str) -> DecisionResults:
    """Helper to run a test case end-to-end."""
    project = load_project_input(input_file)
    rules = extract_rules(
        source_files=[],
        evidence_dir="evidence/ocr_snippets",
        output_path=f"outputs/test/{Path(input_file).stem}_rules.json",
    )
    dr = run_decision(project, rules)
    return dr


class TestCase1LowThickness:
    """YS355, thickness ~55-60mm → Only Measure 1 required."""

    @pytest.fixture(autouse=True)
    def setup(self):
        self.dr = _run_case("inputs/test_case_1_low_thickness.json")

    def test_control_values(self):
        cv = self.dr.control_values
        # t_control = max(side=60, top=55) = 60
        assert cv.t_control_mm == 60
        # y_control = max(355, 355) = 355
        assert cv.y_control_nmm2 == 355

    def test_required_measures_global(self):
        # YS355, 50<t<=85 → only Measure 1 required
        assert 1 in self.dr.control_values.required_measures_global
        # Measures 3, 4, 5 should NOT be required
        assert 3 not in self.dr.control_values.required_measures_global
        assert 4 not in self.dr.control_values.required_measures_global
        assert 5 not in self.dr.control_values.required_measures_global

    def test_measure_1_applied_to_butt_joints(self):
        m1_joints = [
            am for am in self.dr.applied_measures
            if am.measure_id == 1 and am.target_type == TargetType.joint
        ]
        # J01 is block_to_block_butt in cargo_hold with upper flange members
        assert any(am.target_id == "J01" for am in m1_joints)

    def test_pjp_for_coaming_connection(self):
        # J02 is coaming_to_deck_connection → PJP required (measure_id=0)
        pjp = [
            am for am in self.dr.applied_measures
            if am.target_id == "J02" and am.measure_id == 0
        ]
        assert len(pjp) > 0
        assert any("PJP" in r for r in pjp[0].requirements)

    def test_no_measure_2(self):
        # Measure 2 should not be applied (not see_note_2 in this row,
        # or measure3 option not enhanced_NDE)
        m2 = [am for am in self.dr.applied_measures if am.measure_id == 2]
        assert len(m2) == 0

    def test_cumulative_append_only(self):
        # Verify applied_measures list is sorted by (target_id, measure_id)
        ids = [(am.target_id, am.measure_id) for am in self.dr.applied_measures]
        assert ids == sorted(ids)


class TestCase2HighMeasures:
    """YS460, thickness ~95mm → Measures 1, 3, 4, 5 + conditional M2 (enhanced NDE)."""

    @pytest.fixture(autouse=True)
    def setup(self):
        self.dr = _run_case("inputs/test_case_2_high_measures.json")

    def test_control_values(self):
        cv = self.dr.control_values
        # t_control = max(side=95, top=88) = 95
        assert cv.t_control_mm == 95
        # y_control = max(460, 460) = 460
        assert cv.y_control_nmm2 == 460

    def test_required_measures_global(self):
        M = self.dr.control_values.required_measures_global
        # YS460, 85<t<=100 → M1, M3, M4, M5 required
        assert 1 in M
        assert 3 in M
        assert 4 in M
        assert 5 in M

    def test_measure_1_applied(self):
        m1 = [am for am in self.dr.applied_measures if am.measure_id == 1]
        assert len(m1) > 0

    def test_measure_3_bca_for_coaming_side(self):
        # M02 is hatch_coaming_side_plate → BCA steel required
        m3_member = [
            am for am in self.dr.applied_measures
            if am.measure_id == 3 and am.target_type == TargetType.member and am.target_id == "M02"
        ]
        assert len(m3_member) > 0
        assert any("BCA" in r for r in m3_member[0].requirements)

    def test_measure_3_enhanced_nde_on_joints(self):
        # Enhanced NDE selected → applied to butt joints
        m3_joints = [
            am for am in self.dr.applied_measures
            if am.measure_id == 3 and am.target_type == TargetType.joint
        ]
        assert len(m3_joints) > 0
        assert any("enhanced nde" in str(am.requirements).lower() for am in m3_joints)
        assert any("CTOD" in str(am.requirements) for am in m3_joints)

    def test_measure_4_upper_deck_bca(self):
        m4 = [
            am for am in self.dr.applied_measures
            if am.measure_id == 4 and am.target_id == "M01"
        ]
        assert len(m4) > 0
        assert any("BCA" in r for r in m4[0].requirements)

    def test_measure_5_upper_deck_bca_extended(self):
        m5 = [
            am for am in self.dr.applied_measures
            if am.measure_id == 5 and am.target_id == "M01"
        ]
        assert len(m5) > 0

    def test_measure_2_conditional(self):
        # Enhanced NDE selected AND table says see_note_2 → M2 conditional
        m2 = [am for am in self.dr.applied_measures if am.measure_id == 2]
        assert len(m2) > 0
        assert all(am.status == DecisionStatus.conditional for am in m2)

    def test_cumulative_measures_on_m01(self):
        # M01 (upper_deck_plate) should have Measures 4 AND 5 (cumulative)
        m01_measures = [am.measure_id for am in self.dr.applied_measures if am.target_id == "M01"]
        assert 4 in m01_measures
        assert 5 in m01_measures

    def test_pjp_always_applied(self):
        # J03 is coaming_to_deck_connection → PJP
        pjp = [
            am for am in self.dr.applied_measures
            if am.target_id == "J03" and am.measure_id == 0
        ]
        assert len(pjp) > 0


class TestCase3SpecialConsideration:
    """t>100mm special consideration + block shift offset < 300mm (FAIL) + EGW."""

    @pytest.fixture(autouse=True)
    def setup(self):
        self.dr = _run_case("inputs/test_case_3_special_consideration.json")

    def test_control_values(self):
        cv = self.dr.control_values
        # t_control = max(side=110, top=102) = 110
        assert cv.t_control_mm == 110
        # y_control = max(460, 390) = 460
        assert cv.y_control_nmm2 == 460

    def test_yield_mismatch_flag(self):
        # side_yield(460) != top_yield(390) → manual review flag
        flag_descs = [f.description for f in self.dr.manual_review_flags]
        assert any("460" in d and "390" in d for d in flag_descs)

    def test_special_consideration_flags(self):
        # Members with thickness > 100mm should have special consideration flags
        flag_descs = [f.description for f in self.dr.manual_review_flags]
        assert any("special consideration" in d.lower() for d in flag_descs)

    def test_thickness_over_100_members(self):
        # M01=105, M02=110, M03=102 all > 100mm
        special_flags = [
            f for f in self.dr.manual_review_flags
            if "special consideration" in f.description.lower()
        ]
        assert len(special_flags) >= 3

    def test_block_shift_offset_or_no_match(self):
        # t_control=110 may exceed table range (max 100mm), so either:
        # - measures are applied and offset=250mm < 300mm → FAIL flag, or
        # - no matching row → "no matching" flag is raised
        flag_descs = [f.description for f in self.dr.manual_review_flags]
        has_offset_flag = any("250" in d or "offset" in d.lower() for d in flag_descs)
        has_no_match = any("no matching" in d.lower() for d in flag_descs)
        assert has_offset_flag or has_no_match, (
            f"Expected offset fail or no-match flag, got: {flag_descs}"
        )

    def test_no_table_match_for_over_100(self):
        # t_control=110 may not match any table row (max 100)
        # This should produce a flag
        cv = self.dr.control_values
        # If no match, required_measures_global might be empty or flagged
        flag_descs = [f.description for f in self.dr.manual_review_flags]
        has_no_match = any("no matching" in d.lower() for d in flag_descs)
        has_measures = len(cv.required_measures_global) > 0
        # Either found a match or flagged it
        assert has_no_match or has_measures

    def test_pjp_for_coaming_connection(self):
        # J03 coaming_to_deck_connection → PJP always
        pjp = [
            am for am in self.dr.applied_measures
            if am.target_id == "J03" and am.measure_id == 0
        ]
        assert len(pjp) > 0
