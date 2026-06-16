"""
decision_engine.py – LR Rules-based Measure 1~5 automatic determination engine.

Implements the append-only, member/joint-separated decision logic
per LR Pt4 Ch8 2.3, Tables 8.2.1 / 8.2.2.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

from services.engine.rules_db import (
    UNSPECIFIED,
    AppliedMeasure,
    AppliedStatus,
    ControlValues,
    DecisionResults,
    EvidenceRef,
    JointInput,
    MemberInput,
    Measure3Choice,
    ProjectInput,
    Requirement,
    RulesExtractionDB,
    Table821Row,
)

logger = logging.getLogger(__name__)


def _load_mapping_rules() -> dict:
    """Load project-specific mapping rules."""
    p = Path("configs/mapping_rules.json")
    if p.exists():
        with open(p, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def _is_numeric(val: Any) -> bool:
    if val == UNSPECIFIED or val is None:
        return False
    try:
        float(val)
        return True
    except (TypeError, ValueError):
        return False


def _num(val: Any) -> Optional[float]:
    if _is_numeric(val):
        return float(val)
    return None


def _derive_control_values(
    members: List[MemberInput],
    flags: List[str],
) -> ControlValues:
    """Derive t_control and y_control from coaming side/top members."""
    cv = ControlValues()

    side_members = [m for m in members if m.member_role == "hatch_coaming_side_plate"]
    top_members = [m for m in members if m.member_role == "hatch_coaming_top_plate"]

    if side_members:
        m = side_members[0]
        cv.side_thickness = m.thickness_mm_as_built
        cv.side_yield = m.yield_strength_nmm2
    if top_members:
        m = top_members[0]
        cv.top_thickness = m.thickness_mm_as_built
        cv.top_yield = m.yield_strength_nmm2

    st = _num(cv.side_thickness)
    tt = _num(cv.top_thickness)
    if st is not None and tt is not None:
        cv.t_control = max(st, tt)
    elif st is not None:
        cv.t_control = st
        flags.append("top_thickness 미지정 – t_control uses side only.")
    elif tt is not None:
        cv.t_control = tt
        flags.append("side_thickness 미지정 – t_control uses top only.")
    else:
        cv.t_control = UNSPECIFIED
        flags.append("Both side and top thickness 미지정 – t_control cannot be derived.")

    sy = _num(cv.side_yield)
    ty = _num(cv.top_yield)
    if sy is not None and ty is not None:
        cv.y_control = max(sy, ty)
        if sy != ty:
            flags.append(
                f"side_yield ({sy}) != top_yield ({ty}). "
                f"y_control = max = {cv.y_control}. Manual review recommended."
            )
    elif sy is not None:
        cv.y_control = sy
        flags.append("top_yield 미지정 – y_control uses side only.")
    elif ty is not None:
        cv.y_control = ty
        flags.append("side_yield 미지정 – y_control uses top only.")
    else:
        cv.y_control = UNSPECIFIED
        flags.append("Both side and top yield 미지정 – y_control cannot be derived.")

    return cv


def _lookup_required_measures(
    rules_db: RulesExtractionDB,
    y_control: Any,
    t_control: Any,
    flags: List[str],
) -> Tuple[Set[int], Optional[Table821Row], bool]:
    """
    Lookup Table 8.2.1 and return (required_set, row_used, special_consideration).
    """
    if not _is_numeric(y_control) or not _is_numeric(t_control):
        flags.append("Cannot lookup Table 8.2.1 – y_control or t_control is 미지정.")
        return set(), None, False

    y = int(float(y_control))
    t = float(t_control)
    special = False

    mapping = _load_mapping_rules()
    threshold = mapping.get("thickness_special_consideration_mm", 100)
    if t > threshold:
        special = True
        flags.append(
            f"Thickness {t} mm > {threshold} mm. Special consideration required per LR rules."
        )

    row = rules_db.lookup_821(y, t)
    if row is None:
        if t <= 50:
            flags.append(
                f"Thickness {t} mm <= 50 mm for yield {y} N/mm² – "
                "below Table 8.2.1 range. No measures required by table."
            )
            return set(), None, special
        flags.append(
            f"No Table 8.2.1 match for yield={y}, t={t}. "
            "Manual review required."
        )
        return set(), None, special

    required: Set[int] = set()
    measure_map = {1: row.m1, 2: row.m2, 3: row.m3, 4: row.m4, 5: row.m5}
    for mid, status in measure_map.items():
        if status.value == "required":
            required.add(mid)
        # see_note_2 handled separately (not auto-added)

    return required, row, special


def _get_evidence_for_reg(rules_db: RulesExtractionDB, key: str) -> EvidenceRef:
    """Get evidence reference for a regulation text."""
    rt = rules_db.get_regulation_text(key)
    if rt:
        return rt.evidence
    return EvidenceRef()


def _get_reg_text(rules_db: RulesExtractionDB, key: str) -> str:
    """Get regulation text content."""
    rt = rules_db.get_regulation_text(key)
    if rt:
        return rt.text
    return UNSPECIFIED


def _apply_measure1(
    results: DecisionResults,
    joints: List[JointInput],
    members: List[MemberInput],
    rules_db: RulesExtractionDB,
    mapping: dict,
):
    """Measure 1 – Construction NDE (target=joint)."""
    if 1 not in results.required_measures_global:
        return

    upper_roles = set(mapping.get("upper_flange_long_member_roles", []))
    butt_types = set(mapping.get("block_to_block_butt_joint_types", []))
    member_map = {m.member_id: m for m in members}

    for j in joints:
        if j.zone != "cargo_hold_region":
            continue
        if j.joint_type not in butt_types:
            continue

        connected_roles = set()
        for mid in j.connected_members:
            m = member_map.get(mid)
            if m:
                connected_roles.add(m.member_role)

        if connected_roles & upper_roles:
            target = results.get_or_create_joint(j.joint_id)
            reg_text = _get_reg_text(rules_db, "block_shift_min_offset")
            measure = AppliedMeasure(
                measure_id=1,
                status=AppliedStatus.applied.value,
                target_type="joint",
                target_id=j.joint_id,
                requirements=[
                    Requirement(
                        description="Construction NDE: 100% UT of butt welds required.",
                        rule_ref="LR Pt4 Ch8 2.3 – Measure 1",
                        evidence=_get_evidence_for_reg(rules_db, "block_shift_min_offset"),
                    )
                ],
                condition_expr="zone==cargo_hold_region AND joint_type in block_to_block_butt AND connected_member_role in upper_flange_long_member",
                rule_basis="Table 8.2.1 Measure 1 Required",
                notes=[],
            )
            target.add_measure(measure)
        elif not connected_roles:
            results.manual_review_flags.append(
                f"Joint {j.joint_id}: connected member roles unknown – "
                "Measure 1 applicability pending manual review."
            )


def _apply_measure3(
    results: DecisionResults,
    project: ProjectInput,
    rules_db: RulesExtractionDB,
    mapping: dict,
):
    """Measure 3 – Crack arrest measures (target=member + joint)."""
    if 3 not in results.required_measures_global:
        return

    m3 = project.measure3_choice
    option = m3.option

    # A) BCA steel for hatch coaming side plate (always required when M3 required)
    bca_roles = mapping.get("bca_target_roles_measure3_coaming", ["hatch_coaming_side_plate"])
    for member in project.members:
        if member.member_role in bca_roles and member.zone == "cargo_hold_region":
            ys = _num(member.yield_strength_nmm2)
            tk = _num(member.thickness_mm_as_built)
            bca_type = UNSPECIFIED
            if ys is not None and tk is not None:
                row822 = rules_db.lookup_822(member.member_role, int(ys), tk)
                if row822:
                    bca_type = row822.bca_type

            target = results.get_or_create_member(member.member_id)
            measure = AppliedMeasure(
                measure_id=3,
                status=AppliedStatus.applied.value,
                target_type="member",
                target_id=member.member_id,
                requirements=[
                    Requirement(
                        description=f"Provide BCA steel ({bca_type}) for hatch coaming side plate.",
                        rule_ref="LR Pt4 Ch8 2.3 – Measure 3 (coaming side BCA)",
                        evidence=_get_evidence_for_reg(rules_db, "coaming_side_bca"),
                    )
                ],
                condition_expr="Measure 3 required AND member_role==hatch_coaming_side_plate",
                rule_basis=_get_reg_text(rules_db, "coaming_side_bca"),
                notes=[f"BCA type from Table 8.2.2: {bca_type}"],
            )
            target.add_measure(measure)

    # B) Option-specific measures
    if option == UNSPECIFIED:
        # Pending manual choice
        for j in project.joints:
            if j.zone == "cargo_hold_region" and j.joint_type == "block_to_block_butt":
                target = results.get_or_create_joint(j.joint_id)
                measure = AppliedMeasure(
                    measure_id=3,
                    status=AppliedStatus.pending_manual_choice.value,
                    target_type="joint",
                    target_id=j.joint_id,
                    requirements=[
                        Requirement(
                            description="Measure 3 option not selected. Choose one of: block_shift, crack_arrest_hole, crack_arrest_insert, enhanced_NDE.",
                            rule_ref="LR Pt4 Ch8 2.3 – Measure 3",
                        )
                    ],
                    condition_expr="Measure 3 required, option=미지정",
                    rule_basis="Awaiting user selection",
                    notes=["Available options: block_shift, crack_arrest_hole, crack_arrest_insert, enhanced_NDE"],
                )
                target.add_measure(measure)
        return

    if option == "block_shift":
        _apply_m3_block_shift(results, project, rules_db, mapping)
    elif option == "crack_arrest_hole":
        _apply_m3_crack_arrest_hole(results, project, rules_db, mapping)
    elif option == "crack_arrest_insert":
        _apply_m3_crack_arrest_insert(results, project, rules_db, mapping)
    elif option == "enhanced_NDE":
        _apply_m3_enhanced_nde(results, project, rules_db, mapping)


def _apply_m3_block_shift(
    results: DecisionResults,
    project: ProjectInput,
    rules_db: RulesExtractionDB,
    mapping: dict,
):
    """Measure 3 – Block shift option."""
    min_offset = mapping.get("block_shift_min_offset_mm", 300)
    params = project.measure3_choice.parameters
    offset_val = _num(params.block_shift_offset_mm)

    for j in project.joints:
        if j.zone != "cargo_hold_region":
            continue
        if j.joint_type != "block_to_block_butt":
            continue

        status = AppliedStatus.applied.value
        pass_fail = "미지정"
        notes = [f"Block shift: offset >= {min_offset} mm required"]

        if offset_val is not None:
            if offset_val >= min_offset:
                pass_fail = "PASS"
                notes.append(f"Offset = {offset_val} mm >= {min_offset} mm → PASS")
            else:
                pass_fail = "FAIL"
                notes.append(f"Offset = {offset_val} mm < {min_offset} mm → FAIL")
                results.noncompliance_flags.append(
                    f"Joint {j.joint_id}: block shift offset {offset_val} mm < {min_offset} mm"
                )
        else:
            notes.append("Offset value 미지정 – manual verification required")
            results.manual_review_flags.append(
                f"Joint {j.joint_id}: block shift offset 미지정"
            )

        target = results.get_or_create_joint(j.joint_id)
        measure = AppliedMeasure(
            measure_id=3,
            status=status,
            target_type="joint",
            target_id=j.joint_id,
            requirements=[
                Requirement(
                    description=f"Block shift arrangement: offset >= {min_offset} mm. Result: {pass_fail}",
                    rule_ref="LR Pt4 Ch8 2.3 – Measure 3 (block shift)",
                    evidence=_get_evidence_for_reg(rules_db, "block_shift_min_offset"),
                )
            ],
            condition_expr=f"Measure 3 required, option=block_shift, offset>={min_offset}mm",
            rule_basis=_get_reg_text(rules_db, "block_shift_min_offset"),
            notes=notes,
        )
        target.add_measure(measure)


def _apply_m3_crack_arrest_hole(
    results: DecisionResults,
    project: ProjectInput,
    rules_db: RulesExtractionDB,
    mapping: dict,
):
    """Measure 3 – Crack arrest hole option."""
    for j in project.joints:
        if j.zone != "cargo_hold_region":
            continue
        if j.joint_type != "block_to_block_butt":
            continue

        target = results.get_or_create_joint(j.joint_id)
        measure = AppliedMeasure(
            measure_id=3,
            status=AppliedStatus.applied.value,
            target_type="joint",
            target_id=j.joint_id,
            requirements=[
                Requirement(
                    description="Crack arrest holes fitted. Fatigue strength at hole corners and intersections to be specially assessed.",
                    rule_ref="LR Pt4 Ch8 2.3 – Measure 3 (crack arrest hole)",
                    evidence=_get_evidence_for_reg(rules_db, "crack_arrest_hole_fatigue"),
                )
            ],
            condition_expr="Measure 3 required, option=crack_arrest_hole",
            rule_basis=_get_reg_text(rules_db, "crack_arrest_hole_fatigue"),
            notes=[
                f"Hole diameter: {project.measure3_choice.parameters.hole_diameter_mm}",
                "Special fatigue assessment required for hole corners and intersections.",
            ],
        )
        target.add_measure(measure)


def _apply_m3_crack_arrest_insert(
    results: DecisionResults,
    project: ProjectInput,
    rules_db: RulesExtractionDB,
    mapping: dict,
):
    """Measure 3 – Crack arrest insert option."""
    insert_type = project.measure3_choice.parameters.insert_type

    for j in project.joints:
        if j.zone != "cargo_hold_region":
            continue
        if j.joint_type != "block_to_block_butt":
            continue

        target = results.get_or_create_joint(j.joint_id)
        measure = AppliedMeasure(
            measure_id=3,
            status=AppliedStatus.applied.value,
            target_type="joint",
            target_id=j.joint_id,
            requirements=[
                Requirement(
                    description=f"Crack arrest insert applied (type: {insert_type}).",
                    rule_ref="LR Pt4 Ch8 2.3 – Measure 3 (crack arrest insert)",
                )
            ],
            condition_expr="Measure 3 required, option=crack_arrest_insert",
            rule_basis="Insert plate or weld metal insert applied at butt weld.",
            notes=[f"Insert type: {insert_type}"],
        )
        target.add_measure(measure)


def _apply_m3_enhanced_nde(
    results: DecisionResults,
    project: ProjectInput,
    rules_db: RulesExtractionDB,
    mapping: dict,
):
    """Measure 3 – Enhanced NDE option."""
    params = project.measure3_choice.parameters
    ctod_min = mapping.get("ctod_min_mm", 0.18)
    nde_method = params.enhanced_nde_method
    acceptance_ref = params.enhanced_nde_acceptance_criteria_ref
    egw_not_permitted = mapping.get("egw_not_permitted_when_enhanced_nde", True)

    notes_base = [
        f"Enhanced NDE method: {nde_method}",
        f"Acceptance criteria ref: {acceptance_ref}",
        f"CTOD >= {ctod_min} mm required",
    ]

    if acceptance_ref == UNSPECIFIED:
        results.manual_review_flags.append(
            "Enhanced NDE acceptance criteria reference 미지정. "
            "ShipRight procedure reference required."
        )

    for j in project.joints:
        if j.zone != "cargo_hold_region":
            continue
        if j.joint_type != "block_to_block_butt":
            continue

        notes = list(notes_base)
        status = AppliedStatus.applied.value

        # EGW check
        if egw_not_permitted and j.weld_process == "EGW":
            results.noncompliance_flags.append(
                f"Joint {j.joint_id}: EGW weld process not permitted "
                "when enhanced NDE is required (Measure 3)."
            )
            notes.append("NONCOMPLIANCE: EGW not permitted with enhanced NDE.")

        if acceptance_ref == UNSPECIFIED:
            status = AppliedStatus.conditional.value

        target = results.get_or_create_joint(j.joint_id)
        measure = AppliedMeasure(
            measure_id=3,
            status=status,
            target_type="joint",
            target_id=j.joint_id,
            requirements=[
                Requirement(
                    description=f"Enhanced NDE with stricter acceptance criteria. CTOD >= {ctod_min} mm.",
                    rule_ref="LR Pt4 Ch8 2.3 – Measure 3 (enhanced NDE)",
                    evidence=_get_evidence_for_reg(rules_db, "enhanced_nde_ctod"),
                ),
                Requirement(
                    description="Stricter acceptance criteria per ShipRight procedures.",
                    rule_ref="LR Pt4 Ch8 2.3 – Measure 3 (enhanced NDE acceptance)",
                    evidence=_get_evidence_for_reg(rules_db, "enhanced_nde_acceptance"),
                ),
            ],
            condition_expr="Measure 3 required, option=enhanced_NDE",
            rule_basis=_get_reg_text(rules_db, "enhanced_nde_ctod"),
            notes=notes,
        )
        target.add_measure(measure)


def _apply_measure4(
    results: DecisionResults,
    members: List[MemberInput],
    rules_db: RulesExtractionDB,
    mapping: dict,
):
    """Measure 4 – Upper deck BCA steel (target=member)."""
    if 4 not in results.required_measures_global:
        return

    bca_roles = mapping.get("bca_target_roles_measure4", ["upper_deck_plate"])

    for member in members:
        if member.member_role not in bca_roles:
            continue
        if member.zone != "cargo_hold_region":
            continue

        ys = _num(member.yield_strength_nmm2)
        tk = _num(member.thickness_mm_as_built)
        bca_type = UNSPECIFIED
        if ys is not None and tk is not None:
            row822 = rules_db.lookup_822(member.member_role, int(ys), tk)
            if row822:
                bca_type = row822.bca_type

        target = results.get_or_create_member(member.member_id)
        measure = AppliedMeasure(
            measure_id=4,
            status=AppliedStatus.applied.value,
            target_type="member",
            target_id=member.member_id,
            requirements=[
                Requirement(
                    description=f"Upper deck plate to be of BCA steel ({bca_type}).",
                    rule_ref="LR Pt4 Ch8 2.3 – Measure 4",
                )
            ],
            condition_expr="Measure 4 required AND member_role==upper_deck_plate AND zone==cargo_hold_region",
            rule_basis="Table 8.2.1 Measure 4 Required, BCA type from Table 8.2.2",
            notes=[f"BCA type: {bca_type}"],
        )
        target.add_measure(measure)


def _apply_measure5(
    results: DecisionResults,
    members: List[MemberInput],
    rules_db: RulesExtractionDB,
    mapping: dict,
):
    """Measure 5 – Upper deck BCA steel extended (target=member)."""
    if 5 not in results.required_measures_global:
        return

    bca_roles = mapping.get("bca_target_roles_measure5", ["upper_deck_plate"])

    for member in members:
        if member.member_role not in bca_roles:
            continue
        if member.zone != "cargo_hold_region":
            continue

        ys = _num(member.yield_strength_nmm2)
        tk = _num(member.thickness_mm_as_built)
        bca_type = UNSPECIFIED
        if ys is not None and tk is not None:
            row822 = rules_db.lookup_822(member.member_role, int(ys), tk)
            if row822:
                bca_type = row822.bca_type

        target = results.get_or_create_member(member.member_id)
        measure = AppliedMeasure(
            measure_id=5,
            status=AppliedStatus.applied.value,
            target_type="member",
            target_id=member.member_id,
            requirements=[
                Requirement(
                    description=f"Upper deck plate to be of BCA steel ({bca_type}) – Measure 5 extended application.",
                    rule_ref="LR Pt4 Ch8 2.3 – Measure 5",
                )
            ],
            condition_expr="Measure 5 required AND member_role==upper_deck_plate AND zone==cargo_hold_region",
            rule_basis="Table 8.2.1 Measure 5 Required, BCA type from Table 8.2.2",
            notes=[f"BCA type: {bca_type}", "Separate traceability from Measure 4"],
        )
        target.add_measure(measure)


def _apply_measure2(
    results: DecisionResults,
    project: ProjectInput,
    row_used: Optional[Table821Row],
    rules_db: RulesExtractionDB,
):
    """
    Measure 2 – Periodic in-service NDE (target=joint, conditional).
    Only applies when Table 8.2.1 says see_note_2 AND measure3_choice.option == enhanced_NDE.
    """
    if row_used is None:
        return

    if row_used.m2.value != "see_note_2":
        return

    if project.measure3_choice.option != "enhanced_NDE":
        return

    for j in project.joints:
        if j.zone != "cargo_hold_region":
            continue
        if j.joint_type != "block_to_block_butt":
            continue

        target = results.get_or_create_joint(j.joint_id)
        measure = AppliedMeasure(
            measure_id=2,
            status=AppliedStatus.conditional.value,
            target_type="joint",
            target_id=j.joint_id,
            requirements=[
                Requirement(
                    description="Periodic in-service NDE may be required. Frequency and extent to be agreed with LR.",
                    rule_ref="LR Pt4 Ch8 2.3 – Measure 2 (Note 2)",
                    evidence=_get_evidence_for_reg(rules_db, "note_2_measure_2"),
                )
            ],
            condition_expr="Table 8.2.1 m2==see_note_2 AND measure3_choice.option==enhanced_NDE",
            rule_basis=_get_reg_text(rules_db, "note_2_measure_2"),
            notes=["Conditional: frequency/extent to be agreed with LR"],
        )
        target.add_measure(measure)


def _apply_always_rules(
    results: DecisionResults,
    project: ProjectInput,
    rules_db: RulesExtractionDB,
    mapping: dict,
):
    """Apply rules that always apply regardless of measure set (PJP, EGW prohibition)."""
    pjp_types = set(mapping.get("pjp_required_joint_types", ["coaming_to_deck_connection"]))
    egw_not_permitted = mapping.get("egw_not_permitted_when_enhanced_nde", True)
    is_enhanced_nde = project.measure3_choice.option == "enhanced_NDE"

    for j in project.joints:
        # PJP requirement for coaming-to-deck
        if j.joint_type in pjp_types:
            target = results.get_or_create_joint(j.joint_id)
            pjp_measure = AppliedMeasure(
                measure_id=0,  # special: welding detail requirement, not a numbered measure
                status=AppliedStatus.applied.value,
                target_type="joint",
                target_id=j.joint_id,
                requirements=[
                    Requirement(
                        description="LR-approved partial joint penetration (PJP) welding required for hatch coaming to upper deck connection.",
                        rule_ref="LR Pt4 Ch8 2.3 – Welding detail",
                        evidence=_get_evidence_for_reg(rules_db, "pjp_coaming_deck"),
                    )
                ],
                condition_expr="joint_type==coaming_to_deck_connection",
                rule_basis=_get_reg_text(rules_db, "pjp_coaming_deck"),
                notes=["Always applicable for coaming-to-deck connections"],
            )
            target.add_measure(pjp_measure)

        # EGW prohibition when enhanced NDE required
        if (
            egw_not_permitted
            and is_enhanced_nde
            and j.weld_process == "EGW"
            and 3 in results.required_measures_global
        ):
            target = results.get_or_create_joint(j.joint_id)
            egw_measure = AppliedMeasure(
                measure_id=0,
                status=AppliedStatus.noncompliant.value,
                target_type="joint",
                target_id=j.joint_id,
                requirements=[
                    Requirement(
                        description="EGW not permitted where enhanced NDE is required as Measure 3.",
                        rule_ref="LR Pt4 Ch8 2.3 – EGW restriction",
                        evidence=_get_evidence_for_reg(rules_db, "egw_not_permitted"),
                    )
                ],
                condition_expr="weld_process==EGW AND enhanced_NDE required",
                rule_basis=_get_reg_text(rules_db, "egw_not_permitted"),
                notes=["NONCOMPLIANCE FLAG"],
            )
            target.add_measure(egw_measure)
            results.noncompliance_flags.append(
                f"Joint {j.joint_id}: EGW process not permitted with enhanced NDE (Measure 3)."
            )


def run_decision_engine(
    project: ProjectInput,
    rules_db: RulesExtractionDB,
) -> DecisionResults:
    """
    Main decision engine entry point.
    Returns DecisionResults with append-only measure application.
    """
    flags: List[str] = list(rules_db.manual_review_flags)
    mapping = _load_mapping_rules()

    # 1. Derive control values
    cv = _derive_control_values(project.members, flags)

    # 2. Lookup required measures global
    required_set, row_used, special = _lookup_required_measures(
        rules_db, cv.y_control, cv.t_control, flags
    )

    results = DecisionResults(
        project_id=project.project_meta.project_id,
        control_values=cv,
        required_measures_global=sorted(required_set),
        table_821_row_used=row_used.model_dump() if row_used else None,
        special_consideration=special,
        manual_review_flags=flags,
    )

    # 3. Apply measures in order (append-only)
    _apply_measure1(results, project.joints, project.members, rules_db, mapping)
    _apply_measure3(results, project, rules_db, mapping)
    _apply_measure4(results, project.members, rules_db, mapping)
    _apply_measure5(results, project.members, rules_db, mapping)
    _apply_measure2(results, project, row_used, rules_db)

    # 4. Always-applicable rules
    _apply_always_rules(results, project, rules_db, mapping)

    return results
