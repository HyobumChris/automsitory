"""Tests for decision engine and measure applicator.

Three representative cases:
  1. EH36 (yield=355, t=55mm) — Measure 1 only
  2. EH40/EH47 (yield=390/460, t=85–100mm) — Measures 1,3,4,5 + Note 2
  3. Thickness > 100mm — special consideration (all measures)
"""

from __future__ import annotations

import pytest

from lr_hatch_coaming.models import (
    UNSPECIFIED,
    ControlParameters,
    Measure3Choice,
    Measure3Option,
    Measure3Parameters,
    MeasureStatus,
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
from lr_hatch_coaming.decision_engine import (
    derive_control_parameters,
    determine_required_measures,
    run_decision,
)
from lr_hatch_coaming.measure_applicator import apply_measures
from lr_hatch_coaming.rule_tables import get_default_table_821, get_default_table_822


# ── Fixtures ────────────────────────────────────────────────────────────────

def _make_pipeline(
    side_yield: int,
    side_thickness: float,
    top_yield: int,
    top_thickness: float,
    m3_option: Measure3Option = Measure3Option.unspecified,
    extra_members=None,
    extra_joints=None,
    nde_method: EnhancedNDEMethod = EnhancedNDEMethod.unspecified,
) -> PipelineInput:
    members = [
        MemberInput(
            member_id="SIDE-01",
            member_role=MemberRole.hatch_coaming_side_plate,
            yield_strength_nmm2=side_yield,
            grade=f"EH{side_yield // 10}",
            thickness_mm_as_built=side_thickness,
            zone=Zone.cargo_hold_region,
        ),
        MemberInput(
            member_id="TOP-01",
            member_role=MemberRole.hatch_coaming_top_plate,
            yield_strength_nmm2=top_yield,
            grade=f"EH{top_yield // 10}",
            thickness_mm_as_built=top_thickness,
            zone=Zone.cargo_hold_region,
        ),
        MemberInput(
            member_id="DECK-01",
            member_role=MemberRole.upper_deck_plate,
            yield_strength_nmm2=side_yield,
            grade=f"EH{side_yield // 10}",
            thickness_mm_as_built=side_thickness,
            zone=Zone.cargo_hold_region,
        ),
    ]
    if extra_members:
        members.extend(extra_members)

    joints = [
        JointInput(
            joint_id="J-BUTT-01",
            joint_type=JointType.block_to_block_butt,
            connected_members=["SIDE-01", "DECK-01"],
            zone=Zone.cargo_hold_region,
            weld_process=WeldProcess.FCAW,
        ),
        JointInput(
            joint_id="J-COAM-DECK-01",
            joint_type=JointType.coaming_to_deck_connection,
            connected_members=["SIDE-01", "DECK-01"],
            zone=Zone.cargo_hold_region,
        ),
    ]
    if extra_joints:
        joints.extend(extra_joints)

    m3_params = Measure3Parameters()
    if m3_option == Measure3Option.enhanced_NDE:
        m3_params.enhanced_nde_method = nde_method
    elif m3_option == Measure3Option.block_shift:
        m3_params.block_shift_offset_mm = 350.0

    return PipelineInput(
        project_meta=ProjectMeta(project_id="TEST-001"),
        members=members,
        joints=joints,
        measure3_choice=Measure3Choice(option=m3_option, parameters=m3_params),
        visualization_inputs=VisualizationInputs(output_dir="/tmp/test_output"),
    )


# ── Case 1: EH36 (yield=355, t=55mm) — Measure 1 only ─────────────────────

class TestCase1_EH36:
    """EH36: yield=355 N/mm², thickness=55mm (50 < t ≤ 65).
    Expected: Measure 1 Required, rest Not required.
    """

    def setup_method(self):
        self.pi = _make_pipeline(
            side_yield=355, side_thickness=55.0,
            top_yield=355, top_thickness=50.0,
        )
        self.table_821 = get_default_table_821()

    def test_control_parameters(self):
        cp, flags = derive_control_parameters(self.pi.members)
        assert cp.t_side == 55.0
        assert cp.t_top == 50.0
        assert cp.t_control == 55.0  # max(55, 50)
        assert cp.y_control == 355
        assert len(flags) == 0  # yields match

    def test_required_measures(self):
        cp, req, info, flags = run_decision(self.pi, self.table_821)
        assert req[1] == MeasureStatus.required
        assert req[2] == MeasureStatus.not_required
        assert req[3] == MeasureStatus.not_required
        assert req[4] == MeasureStatus.not_required
        assert req[5] == MeasureStatus.not_required

    def test_measure_applications(self):
        cp, req, info, flags = run_decision(self.pi, self.table_821)
        apps, app_flags, pending = apply_measures(
            req, self.pi.members, self.pi.joints,
            self.pi.measure3_choice, get_default_table_822(),
        )
        # Measure 1 should be applied to block-to-block butt joint
        m1_apps = [a for a in apps if a.measure_id == 1]
        assert len(m1_apps) >= 1
        assert m1_apps[0].target_id == "J-BUTT-01"

        # PJP should be applied to coaming-to-deck connection
        pjp_apps = [a for a in apps if a.measure_id == 0]
        assert len(pjp_apps) >= 1

        # No Measure 3/4/5 applications
        m345 = [a for a in apps if a.measure_id in (3, 4, 5)]
        assert len(m345) == 0


# ── Case 2: EH40/EH47 mixed (yield=390/460, t=90mm) — Full measures ────────

class TestCase2_EH40_47:
    """EH40 side (390) + EH47 top (460), thickness=90mm.
    y_control = max(390,460) = 460, t_control = 90mm.
    Row: yield=460, 85 < t ≤ 100 → all measures Required, M2=See Note 2.
    """

    def setup_method(self):
        self.pi_enhanced = _make_pipeline(
            side_yield=390, side_thickness=90.0,
            top_yield=460, top_thickness=85.0,
            m3_option=Measure3Option.enhanced_NDE,
            nde_method=EnhancedNDEMethod.PAUT,
        )
        self.pi_block_shift = _make_pipeline(
            side_yield=390, side_thickness=90.0,
            top_yield=460, top_thickness=85.0,
            m3_option=Measure3Option.block_shift,
        )
        self.table_821 = get_default_table_821()

    def test_control_yield_mismatch_flagged(self):
        cp, flags = derive_control_parameters(self.pi_enhanced.members)
        assert cp.y_control == 460
        assert cp.t_control == 90.0
        yield_flags = [f for f in flags if f.flag_id == "yield_mismatch"]
        assert len(yield_flags) == 1

    def test_measures_with_enhanced_nde(self):
        """Enhanced NDE → Measure 2 becomes conditional (Note 2)."""
        cp, req, info, flags = run_decision(self.pi_enhanced, self.table_821)
        assert req[1] == MeasureStatus.required
        assert req[2] == MeasureStatus.conditional  # Note 2 + enhanced_NDE
        assert req[3] == MeasureStatus.required
        assert req[4] == MeasureStatus.required
        assert req[5] == MeasureStatus.required
        assert info.get("note_2_applied") is True

    def test_measures_with_block_shift(self):
        """Block shift → Measure 2 NOT applicable (Note 2 not met)."""
        cp, req, info, flags = run_decision(self.pi_block_shift, self.table_821)
        assert req[1] == MeasureStatus.required
        assert req[2] == MeasureStatus.not_required  # Note 2 not met
        assert req[3] == MeasureStatus.required
        assert req[4] == MeasureStatus.required
        assert req[5] == MeasureStatus.required

    def test_3_plus_4_expansion(self):
        """Verify "3+4 Required" expands to both 3 and 4."""
        cp, req, info, flags = run_decision(self.pi_enhanced, self.table_821)
        assert req[3] == MeasureStatus.required
        assert req[4] == MeasureStatus.required

    def test_cumulative_applications(self):
        """Verify all applicable measures are cumulatively applied."""
        cp, req, info, flags = run_decision(self.pi_enhanced, self.table_821)
        apps, app_flags, pending = apply_measures(
            req, self.pi_enhanced.members, self.pi_enhanced.joints,
            self.pi_enhanced.measure3_choice, get_default_table_822(),
        )
        measure_ids = {a.measure_id for a in apps}
        assert 1 in measure_ids  # UT
        assert 2 in measure_ids  # Conditional
        assert 3 in measure_ids  # BCA side + enhanced NDE
        assert 4 in measure_ids  # BCA upper deck
        assert 5 in measure_ids  # BCA upper deck (traceability)
        assert 0 in measure_ids  # PJP

    def test_bca_assigned_to_side_plate(self):
        """Measure 3 should assign BCA steel to coaming side plate."""
        cp, req, info, flags = run_decision(self.pi_enhanced, self.table_821)
        apps, _, _ = apply_measures(
            req, self.pi_enhanced.members, self.pi_enhanced.joints,
            self.pi_enhanced.measure3_choice, get_default_table_822(),
        )
        bca_side = [
            a for a in apps
            if a.measure_id == 3 and a.target_id == "SIDE-01"
        ]
        assert len(bca_side) >= 1
        assert "bca_type" in bca_side[0].details

    def test_egw_prohibited_flag(self):
        """If an EGW joint exists and enhanced NDE is chosen, flag it."""
        pi = _make_pipeline(
            side_yield=390, side_thickness=90.0,
            top_yield=460, top_thickness=85.0,
            m3_option=Measure3Option.enhanced_NDE,
            nde_method=EnhancedNDEMethod.PAUT,
            extra_joints=[
                JointInput(
                    joint_id="J-EGW-01",
                    joint_type=JointType.block_to_block_butt,
                    connected_members=["SIDE-01", "DECK-01"],
                    zone=Zone.cargo_hold_region,
                    weld_process=WeldProcess.EGW,
                ),
            ],
        )
        cp, req, _, _ = run_decision(pi, self.table_821)
        apps, app_flags, _ = apply_measures(
            req, pi.members, pi.joints,
            pi.measure3_choice, get_default_table_822(),
        )
        egw_flags = [f for f in app_flags if "egw" in f.flag_id.lower()]
        assert len(egw_flags) >= 1


# ── Case 3: Thickness > 100mm — special consideration ──────────────────────

class TestCase3_ThickGT100:
    """Thickness > 100mm triggers special consideration.
    All measures should be Required + manual review flag.
    """

    def setup_method(self):
        self.pi = _make_pipeline(
            side_yield=460, side_thickness=110.0,
            top_yield=460, top_thickness=105.0,
            m3_option=Measure3Option.block_shift,
        )
        self.table_821 = get_default_table_821()

    def test_special_consideration_flag(self):
        cp, req, info, flags = run_decision(self.pi, self.table_821)
        assert cp.t_control == 110.0
        thick_flags = [f for f in flags if f.flag_id == "thickness_gt100"]
        assert len(thick_flags) >= 1

    def test_all_measures_required(self):
        cp, req, info, flags = run_decision(self.pi, self.table_821)
        for mid in (1, 2, 3, 4, 5):
            assert req[mid] == MeasureStatus.required, f"Measure {mid} should be Required"

    def test_member_thick_flag_in_applicator(self):
        cp, req, _, _ = run_decision(self.pi, self.table_821)
        apps, app_flags, _ = apply_measures(
            req, self.pi.members, self.pi.joints,
            self.pi.measure3_choice, get_default_table_822(),
        )
        thick_flags = [f for f in app_flags if "thick_gt100" in f.flag_id]
        assert len(thick_flags) >= 1


# ── Edge cases ──────────────────────────────────────────────────────────────

class TestEdgeCases:

    def test_unspecified_thickness(self):
        """When thickness is 미지정, t_control should be 미지정."""
        members = [
            MemberInput(
                member_id="S1",
                member_role=MemberRole.hatch_coaming_side_plate,
                yield_strength_nmm2=355,
                thickness_mm_as_built=UNSPECIFIED,
            ),
            MemberInput(
                member_id="T1",
                member_role=MemberRole.hatch_coaming_top_plate,
                yield_strength_nmm2=355,
                thickness_mm_as_built=UNSPECIFIED,
            ),
        ]
        cp, flags = derive_control_parameters(members)
        assert cp.t_control == UNSPECIFIED

    def test_note_2_not_applied_without_enhanced_nde(self):
        """Even if table says See Note 2, M2 stays Not required without enhanced_NDE."""
        table = get_default_table_821()
        req, info, flags = determine_required_measures(
            table, 390, 70.0,
            Measure3Choice(option=Measure3Option.block_shift),
        )
        assert req[2] == MeasureStatus.not_required

    def test_note_2_applied_with_enhanced_nde(self):
        table = get_default_table_821()
        req, info, flags = determine_required_measures(
            table, 390, 70.0,
            Measure3Choice(option=Measure3Option.enhanced_NDE),
        )
        assert req[2] == MeasureStatus.conditional

    def test_pending_choice_when_m3_unspecified(self):
        """Measure 3 required but option=미지정 → pending choice."""
        table_822 = get_default_table_822()
        req = {
            1: MeasureStatus.required,
            2: MeasureStatus.not_required,
            3: MeasureStatus.required,
            4: MeasureStatus.required,
            5: MeasureStatus.not_required,
        }
        pi = _make_pipeline(
            side_yield=390, side_thickness=70.0,
            top_yield=390, top_thickness=65.0,
            m3_option=Measure3Option.unspecified,
        )
        apps, flags, pending = apply_measures(
            req, pi.members, pi.joints,
            pi.measure3_choice, table_822,
        )
        assert len(pending) >= 1
        assert pending[0]["measure_id"] == 3
        assert pending[0]["status"] == "pending_manual_choice"
