"""Decision engine for LR Hatch Coaming Measures 1–5.

Derives control thickness/yield → Table 8.2.1 lookup →
required measures determination → Note 2 / "3+4" expansion.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Tuple, Union

from .models import (
    UNSPECIFIED,
    ControlParameters,
    ManualReviewFlag,
    Measure3Choice,
    Measure3Option,
    MeasureStatus,
    MemberInput,
    MemberRole,
    PipelineInput,
    Table821Row,
)
from .rule_tables import lookup_table_821

logger = logging.getLogger(__name__)


def _is_specified_number(val: Any) -> bool:
    return isinstance(val, (int, float)) and val != UNSPECIFIED


def derive_control_parameters(
    members: List[MemberInput],
) -> Tuple[ControlParameters, List[ManualReviewFlag]]:
    """Derive t_control and y_control from side/top plate members."""
    flags: List[ManualReviewFlag] = []
    cp = ControlParameters()

    side_members = [m for m in members if m.member_role == MemberRole.hatch_coaming_side_plate]
    top_members = [m for m in members if m.member_role == MemberRole.hatch_coaming_top_plate]

    # Thickness
    if side_members and _is_specified_number(side_members[0].thickness_mm_as_built):
        cp.t_side = float(side_members[0].thickness_mm_as_built)
    if top_members and _is_specified_number(top_members[0].thickness_mm_as_built):
        cp.t_top = float(top_members[0].thickness_mm_as_built)

    if _is_specified_number(cp.t_side) and _is_specified_number(cp.t_top):
        cp.t_control = max(cp.t_side, cp.t_top)
    elif _is_specified_number(cp.t_side):
        cp.t_control = cp.t_side
        flags.append(ManualReviewFlag(
            flag_id="t_control_partial",
            category="control_parameter",
            message="t_top is 미지정; t_control derived from t_side only.",
            related_ids=[m.member_id for m in side_members],
        ))
    elif _is_specified_number(cp.t_top):
        cp.t_control = cp.t_top
        flags.append(ManualReviewFlag(
            flag_id="t_control_partial",
            category="control_parameter",
            message="t_side is 미지정; t_control derived from t_top only.",
            related_ids=[m.member_id for m in top_members],
        ))
    # else: both 미지정 → t_control stays 미지정

    # Yield strength
    if side_members and _is_specified_number(side_members[0].yield_strength_nmm2):
        cp.y_side = int(side_members[0].yield_strength_nmm2)
    if top_members and _is_specified_number(top_members[0].yield_strength_nmm2):
        cp.y_top = int(top_members[0].yield_strength_nmm2)

    if _is_specified_number(cp.y_side) and _is_specified_number(cp.y_top):
        cp.y_control = max(cp.y_side, cp.y_top)
        if cp.y_side != cp.y_top:
            flags.append(ManualReviewFlag(
                flag_id="yield_mismatch",
                category="control_parameter",
                message=(
                    f"Side yield ({cp.y_side}) != top yield ({cp.y_top}). "
                    f"Using max ({cp.y_control}) but manual review recommended."
                ),
                related_ids=[
                    m.member_id for m in side_members + top_members
                ],
            ))
    elif _is_specified_number(cp.y_side):
        cp.y_control = cp.y_side
        flags.append(ManualReviewFlag(
            flag_id="y_control_partial",
            category="control_parameter",
            message="y_top is 미지정; y_control derived from y_side only.",
            related_ids=[m.member_id for m in side_members],
        ))
    elif _is_specified_number(cp.y_top):
        cp.y_control = cp.y_top
        flags.append(ManualReviewFlag(
            flag_id="y_control_partial",
            category="control_parameter",
            message="y_side is 미지정; y_control derived from y_top only.",
            related_ids=[m.member_id for m in top_members],
        ))

    return cp, flags


def determine_required_measures(
    table_821: List[Table821Row],
    y_control: Union[int, str],
    t_control: Union[float, str],
    measure3_choice: Measure3Choice,
) -> Tuple[Dict[int, MeasureStatus], Dict[str, Any], List[ManualReviewFlag]]:
    """Determine which measures are required based on Table 8.2.1 lookup.

    Returns:
        required_measures: dict {measure_id: status}
        lookup_info: metadata about the lookup
        flags: any manual review flags
    """
    flags: List[ManualReviewFlag] = []
    required: Dict[int, MeasureStatus] = {
        1: MeasureStatus.not_required,
        2: MeasureStatus.not_required,
        3: MeasureStatus.not_required,
        4: MeasureStatus.not_required,
        5: MeasureStatus.not_required,
    }
    lookup_info: Dict[str, Any] = {}

    if not _is_specified_number(y_control) or not _is_specified_number(t_control):
        flags.append(ManualReviewFlag(
            flag_id="control_unspecified",
            category="decision",
            message=(
                f"Cannot perform Table 8.2.1 lookup: "
                f"y_control={y_control}, t_control={t_control}. "
                "All measures left as Not required (manual review needed)."
            ),
        ))
        return required, lookup_info, flags

    y = int(y_control)
    t = float(t_control)

    # Thickness > 100 special consideration
    if t > 100:
        flags.append(ManualReviewFlag(
            flag_id="thickness_gt100",
            category="special_consideration",
            message=(
                f"Control thickness {t}mm > 100mm. "
                "Special consideration required per LR rules. "
                "All measures assumed Required pending manual review."
            ),
        ))
        for m in required:
            required[m] = MeasureStatus.required
        lookup_info["special"] = "thickness > 100mm → all measures Required"
        return required, lookup_info, flags

    # Standard lookup
    row = lookup_table_821(table_821, y, t)
    if row is None:
        # Try nearest yield
        for try_yield in [355, 390, 460]:
            row = lookup_table_821(table_821, try_yield, t)
            if row:
                flags.append(ManualReviewFlag(
                    flag_id="yield_fallback",
                    category="decision",
                    message=(
                        f"No exact row for yield={y}, thickness={t}. "
                        f"Fell back to yield={try_yield}."
                    ),
                ))
                break

    if row is None:
        flags.append(ManualReviewFlag(
            flag_id="no_table_row",
            category="decision",
            message=f"No matching row in Table 8.2.1 for yield={y}, t={t}.",
        ))
        return required, lookup_info, flags

    lookup_info["matched_row"] = {
        "yield": row.yield_strength_nmm2,
        "range": row.thickness_range_mm,
        "m1": row.measure_1.status.value,
        "m2": row.measure_2.status.value,
        "m3_4": row.measure_3_and_4.status.value,
        "m5": row.measure_5.status.value,
    }

    # Measure 1
    required[1] = row.measure_1.status

    # Measure 3+4 expansion: if Required → both 3 and 4 are Required
    if row.measure_3_and_4.status == MeasureStatus.required:
        required[3] = MeasureStatus.required
        required[4] = MeasureStatus.required
    elif row.measure_3_and_4.status == MeasureStatus.not_required:
        required[3] = MeasureStatus.not_required
        required[4] = MeasureStatus.not_required

    # Measure 5
    required[5] = row.measure_5.status

    # Measure 2: Note 2 handling
    if row.measure_2.status == MeasureStatus.see_note_2:
        # Note 2: Measure 2 is conditional — only if Measure 3 is achieved via enhanced_NDE
        if measure3_choice.option == Measure3Option.enhanced_NDE:
            required[2] = MeasureStatus.conditional
            lookup_info["note_2_applied"] = True
        else:
            required[2] = MeasureStatus.not_required
            lookup_info["note_2_applied"] = False
            lookup_info["note_2_reason"] = (
                f"Measure 3 option is '{measure3_choice.option.value}', "
                "not 'enhanced_NDE'. Measure 2 not applicable per Note 2."
            )
    else:
        required[2] = row.measure_2.status

    return required, lookup_info, flags


def run_decision(
    pipeline_input: PipelineInput,
    table_821: List[Table821Row],
) -> Tuple[
    ControlParameters,
    Dict[int, MeasureStatus],
    Dict[str, Any],
    List[ManualReviewFlag],
]:
    """Full decision pipeline: derive params → lookup → determine measures."""
    cp, cp_flags = derive_control_parameters(pipeline_input.members)

    required_measures, lookup_info, decision_flags = determine_required_measures(
        table_821=table_821,
        y_control=cp.y_control,
        t_control=cp.t_control,
        measure3_choice=pipeline_input.measure3_choice,
    )

    all_flags = cp_flags + decision_flags

    # Additional grade validation
    for m in pipeline_input.members:
        if (
            _is_specified_number(m.yield_strength_nmm2)
            and int(m.yield_strength_nmm2) == 460
            and m.grade != UNSPECIFIED
            and not m.grade.upper().startswith("EH")
        ):
            all_flags.append(ManualReviewFlag(
                flag_id=f"grade_check_{m.member_id}",
                category="grade_validation",
                message=(
                    f"Member {m.member_id}: yield=460 but grade='{m.grade}' "
                    "does not start with 'EH'. Verify grade designation."
                ),
                related_ids=[m.member_id],
            ))

    return cp, required_measures, lookup_info, all_flags
