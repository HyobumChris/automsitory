"""Cumulative measure applicator.

Applies Measures 1–5 to specific targets (members or joints).
All applications are append-only — new measures never remove existing ones.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Union

from .models import (
    UNSPECIFIED,
    JointInput,
    JointType,
    ManualReviewFlag,
    Measure3Choice,
    Measure3Option,
    MeasureApplication,
    MeasureStatus,
    MeasureTarget,
    MemberInput,
    MemberRole,
    Table822Entry,
    WeldProcess,
    Zone,
)
from .rule_tables import lookup_table_822

logger = logging.getLogger(__name__)

# Roles considered "upper flange" for Measure 1 applicability
_UPPER_FLANGE_ROLES = {
    MemberRole.upper_deck_plate,
    MemberRole.hatch_coaming_side_plate,
    MemberRole.hatch_coaming_top_plate,
    MemberRole.attached_longitudinal,
}


def _is_num(val: Any) -> bool:
    return isinstance(val, (int, float))


def apply_measures(
    required_measures: Dict[int, MeasureStatus],
    members: List[MemberInput],
    joints: List[JointInput],
    measure3_choice: Measure3Choice,
    table_822: List[Table822Entry],
) -> tuple[List[MeasureApplication], List[ManualReviewFlag], List[Dict[str, Any]]]:
    """Apply all required measures cumulatively to members and joints.

    Returns:
        applications: list of applied measures (append-only accumulator)
        flags: manual review flags
        pending: pending choices needing user input
    """
    applications: List[MeasureApplication] = []
    flags: List[ManualReviewFlag] = []
    pending: List[Dict[str, Any]] = []

    member_map = {m.member_id: m for m in members}

    # ── Measure 1 (target=joint) ────────────────────────────────────────
    if required_measures.get(1) == MeasureStatus.required:
        for j in joints:
            if (
                j.zone == Zone.cargo_hold_region
                and j.joint_type == JointType.block_to_block_butt
            ):
                # Check if connected members are upper flange
                connected_upper = all(
                    member_map.get(mid, MemberInput(
                        member_id="?", member_role=MemberRole.unknown
                    )).member_role in _UPPER_FLANGE_ROLES
                    for mid in j.connected_members
                )
                if connected_upper:
                    applications.append(MeasureApplication(
                        measure_id=1,
                        measure_name="100% UT during construction",
                        status=MeasureStatus.required,
                        target_type=MeasureTarget.joint,
                        target_id=j.joint_id,
                        details={
                            "description": (
                                "100% ultrasonic testing of upper flange "
                                "longitudinal members block-to-block butt joints "
                                "during construction."
                            ),
                            "connected_members": j.connected_members,
                        },
                        rule_ref="Table 8.2.1 Measure 1",
                    ))

    # ── Measure 2 (target=joint, conditional) ───────────────────────────
    if required_measures.get(2) in (MeasureStatus.required, MeasureStatus.conditional):
        # Measure 2 applies only when Measure 3 is via enhanced NDE
        if measure3_choice.option == Measure3Option.enhanced_NDE:
            for j in joints:
                if (
                    j.zone == Zone.cargo_hold_region
                    and j.joint_type == JointType.block_to_block_butt
                ):
                    connected_upper = all(
                        member_map.get(mid, MemberInput(
                            member_id="?", member_role=MemberRole.unknown
                        )).member_role in _UPPER_FLANGE_ROLES
                        for mid in j.connected_members
                    )
                    if connected_upper:
                        applications.append(MeasureApplication(
                            measure_id=2,
                            measure_name="Enhanced NDE conditional (Note 2)",
                            status=MeasureStatus.conditional,
                            target_type=MeasureTarget.joint,
                            target_id=j.joint_id,
                            details={
                                "description": (
                                    "Conditional measure per Note 2: applicable "
                                    "because Measure 3 is achieved via enhanced NDE."
                                ),
                                "nde_method": measure3_choice.parameters.enhanced_nde_method.value,
                            },
                            rule_ref="Table 8.2.1 Note 2",
                        ))

    # ── Measure 3 (target=member + joint) ───────────────────────────────
    if required_measures.get(3) == MeasureStatus.required:
        _apply_measure_3(
            measure3_choice, members, joints, member_map,
            table_822, applications, flags, pending,
        )

    # ── Measure 4 (target=member): BCA steel for upper deck ─────────────
    if required_measures.get(4) == MeasureStatus.required:
        for m in members:
            if m.member_role == MemberRole.upper_deck_plate:
                bca_entry = None
                if _is_num(m.yield_strength_nmm2) and _is_num(m.thickness_mm_as_built):
                    bca_entry = lookup_table_822(
                        table_822, "upper_deck",
                        int(m.yield_strength_nmm2),
                        float(m.thickness_mm_as_built),
                    )
                bca_type = bca_entry.bca_type if bca_entry else UNSPECIFIED
                applications.append(MeasureApplication(
                    measure_id=4,
                    measure_name="BCA steel for upper deck plate",
                    status=MeasureStatus.required,
                    target_type=MeasureTarget.member,
                    target_id=m.member_id,
                    details={
                        "description": (
                            "Upper deck plate requires BCA (Brittle Crack Arrest) "
                            "steel per Table 8.2.2."
                        ),
                        "bca_type": bca_type,
                        "yield": m.yield_strength_nmm2,
                        "thickness": m.thickness_mm_as_built,
                    },
                    rule_ref="Table 8.2.1 Measure 4 + Table 8.2.2",
                ))

    # ── Measure 5 (target=member): same as 4 but separate ID ───────────
    if required_measures.get(5) == MeasureStatus.required:
        for m in members:
            if m.member_role == MemberRole.upper_deck_plate:
                bca_entry = None
                if _is_num(m.yield_strength_nmm2) and _is_num(m.thickness_mm_as_built):
                    bca_entry = lookup_table_822(
                        table_822, "upper_deck",
                        int(m.yield_strength_nmm2),
                        float(m.thickness_mm_as_built),
                    )
                bca_type = bca_entry.bca_type if bca_entry else UNSPECIFIED
                applications.append(MeasureApplication(
                    measure_id=5,
                    measure_name="BCA steel for upper deck plate (Measure 5)",
                    status=MeasureStatus.required,
                    target_type=MeasureTarget.member,
                    target_id=m.member_id,
                    details={
                        "description": (
                            "Upper deck plate – additional BCA requirement "
                            "tracked as Measure 5 for traceability."
                        ),
                        "bca_type": bca_type,
                        "yield": m.yield_strength_nmm2,
                        "thickness": m.thickness_mm_as_built,
                    },
                    rule_ref="Table 8.2.1 Measure 5 + Table 8.2.2",
                ))

    # ── PJP requirement (target=joint) ──────────────────────────────────
    for j in joints:
        if j.joint_type == JointType.coaming_to_deck_connection:
            applications.append(MeasureApplication(
                measure_id=0,  # 0 = structural requirement, not numbered measure
                measure_name="LR-approved PJP weld required",
                status=MeasureStatus.required,
                target_type=MeasureTarget.joint,
                target_id=j.joint_id,
                details={
                    "description": (
                        "Coaming-to-deck connection requires LR-approved "
                        "partial joint penetration (PJP) weld."
                    ),
                },
                rule_ref="Sec 8 – coaming side to upper deck connection",
            ))

    # ── thickness > 100mm flag ──────────────────────────────────────────
    for m in members:
        if _is_num(m.thickness_mm_as_built) and float(m.thickness_mm_as_built) > 100:
            flags.append(ManualReviewFlag(
                flag_id=f"thick_gt100_{m.member_id}",
                category="special_consideration",
                message=(
                    f"Member {m.member_id} thickness "
                    f"{m.thickness_mm_as_built}mm > 100mm. "
                    "Special consideration required."
                ),
                related_ids=[m.member_id],
            ))

    return applications, flags, pending


def _apply_measure_3(
    measure3_choice: Measure3Choice,
    members: List[MemberInput],
    joints: List[JointInput],
    member_map: Dict[str, MemberInput],
    table_822: List[Table822Entry],
    applications: List[MeasureApplication],
    flags: List[ManualReviewFlag],
    pending: List[Dict[str, Any]],
) -> None:
    """Apply Measure 3 sub-options to appropriate targets."""

    # (a) BCA steel for hatch coaming side plate (always when Measure 3 required)
    for m in members:
        if m.member_role == MemberRole.hatch_coaming_side_plate:
            bca_entry = None
            if _is_num(m.yield_strength_nmm2) and _is_num(m.thickness_mm_as_built):
                bca_entry = lookup_table_822(
                    table_822, "hatch_coaming_side",
                    int(m.yield_strength_nmm2),
                    float(m.thickness_mm_as_built),
                )
            bca_type = bca_entry.bca_type if bca_entry else UNSPECIFIED
            applications.append(MeasureApplication(
                measure_id=3,
                measure_name="BCA steel for hatch coaming side plate",
                status=MeasureStatus.required,
                target_type=MeasureTarget.member,
                target_id=m.member_id,
                details={
                    "description": (
                        "Hatch coaming side plate requires BCA "
                        "(Brittle Crack Arrest) steel when Measure 3 is required."
                    ),
                    "bca_type": bca_type,
                    "yield": m.yield_strength_nmm2,
                    "thickness": m.thickness_mm_as_built,
                },
                rule_ref="Measure 3 – BCA requirement + Table 8.2.2",
            ))

    # (b) Sub-option specific
    option = measure3_choice.option

    if option == Measure3Option.unspecified:
        pending.append({
            "measure_id": 3,
            "status": "pending_manual_choice",
            "message": (
                "Measure 3 is required but sub-option is 미지정. "
                "Please select one of: block_shift, crack_arrest_hole, "
                "crack_arrest_insert, enhanced_NDE."
            ),
            "allowed_options": [
                "block_shift", "crack_arrest_hole",
                "crack_arrest_insert", "enhanced_NDE",
            ],
            "required_params_by_option": {
                "block_shift": ["block_shift_offset_mm"],
                "crack_arrest_hole": ["hole_diameter_mm"],
                "crack_arrest_insert": ["insert_type"],
                "enhanced_NDE": [
                    "enhanced_nde_method",
                    "enhanced_nde_acceptance_criteria_ref",
                ],
            },
        })
        return

    if option == Measure3Option.block_shift:
        _apply_block_shift(measure3_choice, joints, member_map, applications, flags)
    elif option == Measure3Option.crack_arrest_hole:
        _apply_crack_arrest_hole(measure3_choice, joints, member_map, applications, flags)
    elif option == Measure3Option.crack_arrest_insert:
        _apply_crack_arrest_insert(measure3_choice, joints, member_map, applications, flags)
    elif option == Measure3Option.enhanced_NDE:
        _apply_enhanced_nde(measure3_choice, joints, member_map, applications, flags)


def _apply_block_shift(
    choice: Measure3Choice,
    joints: List[JointInput],
    member_map: Dict[str, MemberInput],
    applications: List[MeasureApplication],
    flags: List[ManualReviewFlag],
) -> None:
    offset = choice.parameters.block_shift_offset_mm
    offset_ok = _is_num(offset) and float(offset) >= 300.0

    for j in joints:
        if j.joint_type != JointType.block_to_block_butt:
            continue
        # Check if joint connects coaming side or upper deck
        roles = {
            member_map[mid].member_role
            for mid in j.connected_members
            if mid in member_map
        }
        if roles & {MemberRole.hatch_coaming_side_plate, MemberRole.upper_deck_plate}:
            details: Dict[str, Any] = {
                "description": (
                    "Block shift: coaming side butt weld vs upper deck butt weld "
                    "offset must be ≥ 300mm."
                ),
                "block_shift_offset_mm": offset,
                "offset_meets_requirement": offset_ok,
            }
            if _is_num(offset) and not offset_ok:
                flags.append(ManualReviewFlag(
                    flag_id=f"block_shift_short_{j.joint_id}",
                    category="measure_3_block_shift",
                    message=(
                        f"Joint {j.joint_id}: block shift offset {offset}mm < 300mm."
                    ),
                    related_ids=[j.joint_id],
                ))
            applications.append(MeasureApplication(
                measure_id=3,
                measure_name="Block shift requirement",
                status=MeasureStatus.required,
                target_type=MeasureTarget.joint,
                target_id=j.joint_id,
                details=details,
                rule_ref="Measure 3 – block shift ≥ 300mm",
            ))


def _apply_crack_arrest_hole(
    choice: Measure3Choice,
    joints: List[JointInput],
    member_map: Dict[str, MemberInput],
    applications: List[MeasureApplication],
    flags: List[ManualReviewFlag],
) -> None:
    hole_dia = choice.parameters.hole_diameter_mm
    for j in joints:
        if j.joint_type != JointType.block_to_block_butt:
            continue
        roles = {
            member_map[mid].member_role
            for mid in j.connected_members
            if mid in member_map
        }
        if roles & {MemberRole.hatch_coaming_side_plate, MemberRole.upper_deck_plate}:
            applications.append(MeasureApplication(
                measure_id=3,
                measure_name="Crack arrest hole",
                status=MeasureStatus.required,
                target_type=MeasureTarget.joint,
                target_id=j.joint_id,
                details={
                    "description": (
                        "Crack arrest hole at corner/intersection. "
                        "Fatigue strength special assessment required."
                    ),
                    "hole_diameter_mm": hole_dia,
                    "fatigue_assessment_required": True,
                },
                rule_ref="Measure 3 – crack arrest hole",
            ))


def _apply_crack_arrest_insert(
    choice: Measure3Choice,
    joints: List[JointInput],
    member_map: Dict[str, MemberInput],
    applications: List[MeasureApplication],
    flags: List[ManualReviewFlag],
) -> None:
    insert_type = choice.parameters.insert_type
    for j in joints:
        if j.joint_type != JointType.block_to_block_butt:
            continue
        roles = {
            member_map[mid].member_role
            for mid in j.connected_members
            if mid in member_map
        }
        if roles & {MemberRole.hatch_coaming_side_plate, MemberRole.upper_deck_plate}:
            applications.append(MeasureApplication(
                measure_id=3,
                measure_name="Crack arrest insert plate/weld metal",
                status=MeasureStatus.required,
                target_type=MeasureTarget.joint,
                target_id=j.joint_id,
                details={
                    "description": (
                        "High crack-arrest performance insert plate or "
                        "weld metal insert required."
                    ),
                    "insert_type": insert_type,
                },
                rule_ref="Measure 3 – crack arrest insert",
            ))


def _apply_enhanced_nde(
    choice: Measure3Choice,
    joints: List[JointInput],
    member_map: Dict[str, MemberInput],
    applications: List[MeasureApplication],
    flags: List[ManualReviewFlag],
) -> None:
    nde_method = choice.parameters.enhanced_nde_method.value
    criteria_ref = choice.parameters.enhanced_nde_acceptance_criteria_ref

    for j in joints:
        if j.joint_type != JointType.block_to_block_butt:
            continue

        # EGW prohibition
        if j.weld_process == WeldProcess.EGW:
            flags.append(ManualReviewFlag(
                flag_id=f"egw_prohibited_{j.joint_id}",
                category="measure_3_enhanced_nde",
                message=(
                    f"Joint {j.joint_id}: EGW weld process is prohibited "
                    "when Measure 3 is achieved via enhanced NDE."
                ),
                related_ids=[j.joint_id],
            ))

        roles = {
            member_map[mid].member_role
            for mid in j.connected_members
            if mid in member_map
        }
        if roles & {MemberRole.hatch_coaming_side_plate, MemberRole.upper_deck_plate,
                     MemberRole.attached_longitudinal}:
            applications.append(MeasureApplication(
                measure_id=3,
                measure_name="Enhanced NDE with stricter acceptance",
                status=MeasureStatus.required,
                target_type=MeasureTarget.joint,
                target_id=j.joint_id,
                details={
                    "description": (
                        "ShipRight-based stricter acceptance criteria. "
                        "CTOD ≥ 0.18mm required. EGW prohibited."
                    ),
                    "nde_method": nde_method,
                    "acceptance_criteria_ref": criteria_ref,
                    "ctod_min_mm": 0.18,
                    "egw_prohibited": True,
                    "weld_process": j.weld_process.value,
                },
                rule_ref="Measure 3 – enhanced NDE (ShipRight)",
            ))
