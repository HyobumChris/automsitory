"""Decision engine for LR hatch coaming brittle-crack measures.

Implements:
- strict "미지정" handling
- Table 8.2.1 lookup + "3+4" expansion
- Note 2 conditional gating for Measure 2
- target-specific cumulative application (member vs joint)
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple, Union

from .rules_db import (
    AppliedMeasure,
    ControlParameters,
    DecisionResults,
    ManualReviewFlag,
    MemberInput,
    ProjectInput,
    RulesExtraction,
    Table821Entry,
    Table822Entry,
    TargetDecision,
    UNSPECIFIED,
    is_unspecified,
    load_json_file,
    to_float_or_unspecified,
)


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float))


def _status_string(value: Union[str, Any]) -> str:
    if isinstance(value, str):
        return value
    return str(value)


def _load_mapping_rules(config_path: Optional[str]) -> Dict[str, Any]:
    default = {
        "upper_flange_member_roles": [
            "upper_deck_plate",
            "hatch_coaming_side_plate",
            "hatch_coaming_top_plate",
            "attached_longitudinal",
        ]
    }
    if not config_path:
        return default
    path = Path(config_path)
    if not path.is_file():
        return default
    payload = load_json_file(str(path))
    if not isinstance(payload, dict):
        return default
    merged = {**default, **payload}
    return merged


def derive_control_parameters(
    members: List[MemberInput],
) -> Tuple[ControlParameters, List[ManualReviewFlag]]:
    """Derive control values from coaming side/top members.

    Non-negotiable:
    - t_control is "미지정" if either side/top thickness is "미지정"
    - y_control is max(side, top) only when both are numeric
    """

    flags: List[ManualReviewFlag] = []

    side = next((m for m in members if m.member_role == "hatch_coaming_side_plate"), None)
    top = next((m for m in members if m.member_role == "hatch_coaming_top_plate"), None)

    cp = ControlParameters()
    cp.t_side = side.thickness_mm_as_built if side else UNSPECIFIED
    cp.t_top = top.thickness_mm_as_built if top else UNSPECIFIED
    cp.y_side = side.yield_strength_nmm2 if side else UNSPECIFIED
    cp.y_top = top.yield_strength_nmm2 if top else UNSPECIFIED

    if _is_number(cp.t_side) and _is_number(cp.t_top):
        cp.t_control = max(float(cp.t_side), float(cp.t_top))
    else:
        cp.t_control = UNSPECIFIED
        flags.append(
            ManualReviewFlag(
                flag_id="control_thickness_unspecified",
                message=(
                    "t_control cannot be derived because side/top thickness is incomplete. "
                    "Kept as '미지정'."
                ),
                related_targets=[
                    side.member_id if side else "missing_side_member",
                    top.member_id if top else "missing_top_member",
                ],
            )
        )

    if _is_number(cp.y_side) and _is_number(cp.y_top):
        cp.y_control = max(int(cp.y_side), int(cp.y_top))
        if int(cp.y_side) != int(cp.y_top):
            flags.append(
                ManualReviewFlag(
                    flag_id="control_yield_mismatch",
                    message=(
                        f"side_yield({cp.y_side}) != top_yield({cp.y_top}); "
                        f"y_control=max={cp.y_control} used."
                    ),
                    related_targets=[
                        side.member_id if side else "missing_side_member",
                        top.member_id if top else "missing_top_member",
                    ],
                )
            )
    else:
        cp.y_control = UNSPECIFIED
        flags.append(
            ManualReviewFlag(
                flag_id="control_yield_unspecified",
                message=(
                    "y_control cannot be derived because side/top yield is incomplete. "
                    "Kept as '미지정'."
                ),
                related_targets=[
                    side.member_id if side else "missing_side_member",
                    top.member_id if top else "missing_top_member",
                ],
            )
        )

    return cp, flags


def _match_table_821_row(table_821: List[Table821Entry], y: int, t: float) -> Optional[Table821Entry]:
    for row in table_821:
        if not _is_number(row.yield_strength_nmm2):
            continue
        if int(row.yield_strength_nmm2) != int(y):
            continue
        if not _is_number(row.t_lower_exclusive_mm) or not _is_number(row.t_upper_inclusive_mm):
            continue
        lo = float(row.t_lower_exclusive_mm)
        hi = float(row.t_upper_inclusive_mm)
        if lo < t <= hi:
            return row
        if lo == 0.0 and t <= hi:
            return row
    return None


def _lookup_bca_type(
    table_822: List[Table822Entry],
    structure_member: str,
    y: Union[int, str],
    t: Union[float, str],
) -> str:
    if not _is_number(y) or not _is_number(t):
        return UNSPECIFIED
    for row in table_822:
        if row.structure_member != structure_member:
            continue
        if not _is_number(row.yield_strength_nmm2):
            continue
        if int(row.yield_strength_nmm2) != int(y):
            continue
        if not _is_number(row.t_lower_exclusive_mm) or not _is_number(row.t_upper_inclusive_mm):
            continue
        lo = float(row.t_lower_exclusive_mm)
        hi = float(row.t_upper_inclusive_mm)
        if lo < float(t) <= hi or (lo == 0.0 and float(t) <= hi):
            return row.bca_type
    return UNSPECIFIED


def _init_targets(project_input: ProjectInput) -> Tuple[Dict[str, TargetDecision], Dict[str, TargetDecision]]:
    member_targets: Dict[str, TargetDecision] = {}
    for member in project_input.members:
        member_targets[member.member_id] = TargetDecision(
            target_id=member.member_id,
            target_type="member",
            applied_measures=[],
        )

    joint_targets: Dict[str, TargetDecision] = {}
    for joint in project_input.joints:
        joint_targets[joint.joint_id] = TargetDecision(
            target_id=joint.joint_id,
            target_type="joint",
            applied_measures=[],
        )
    return member_targets, joint_targets


def _merge_measure(existing: AppliedMeasure, incoming: AppliedMeasure) -> AppliedMeasure:
    requirements = sorted(set(existing.requirements + incoming.requirements))
    rule_refs = sorted(set(existing.rule_references + incoming.rule_references))
    evidence = sorted(set(existing.evidence_keys + incoming.evidence_keys))
    merged_details = {**existing.details, **incoming.details}

    # Keep stronger state for traceability.
    status_priority = {
        "noncompliant": 5,
        "required": 4,
        "conditional": 3,
        "pending_manual_choice": 2,
        "not_applicable": 1,
        "미지정": 0,
    }
    merged_status = (
        existing.status
        if status_priority.get(existing.status, 0) >= status_priority.get(incoming.status, 0)
        else incoming.status
    )

    return AppliedMeasure(
        measure_id=existing.measure_id,
        measure_name=existing.measure_name,
        target_type=existing.target_type,
        target_id=existing.target_id,
        status=merged_status,
        condition_expression=incoming.condition_expression
        if incoming.condition_expression != UNSPECIFIED
        else existing.condition_expression,
        requirements=requirements,
        rule_references=rule_refs,
        evidence_keys=evidence,
        details=merged_details,
        noncompliance=existing.noncompliance or incoming.noncompliance,
    )


def _append_measure(target: TargetDecision, measure: AppliedMeasure) -> None:
    """Append-only + idempotent insertion by measure_id."""
    for idx, existing in enumerate(target.applied_measures):
        if existing.measure_id == measure.measure_id:
            target.applied_measures[idx] = _merge_measure(existing, measure)
            break
    else:
        target.applied_measures.append(measure)
    target.applied_measures.sort(key=lambda item: item.measure_id)


def _text_requirement(
    rules: RulesExtraction,
    key: str,
    fallback: str = UNSPECIFIED,
) -> Tuple[str, List[str]]:
    req = rules.textual_requirements.get(key)
    if not req:
        return fallback, []
    text = req.requirement_text if req.requirement_text != UNSPECIFIED else fallback
    return text, list(req.evidence_keys)


def _find_joint_x(joint: Any) -> Union[float, str]:
    geom = getattr(joint, "geom", None)
    if geom is None or geom.data == UNSPECIFIED:
        return UNSPECIFIED
    data = geom.data
    if isinstance(data, dict) and "x" in data and _is_number(data["x"]):
        return float(data["x"])
    if isinstance(data, list) and data:
        if _is_number(data[0]):
            return float(data[0])
        if isinstance(data[0], (list, tuple)) and data[0] and _is_number(data[0][0]):
            return float(data[0][0])
        if isinstance(data[0], dict) and _is_number(data[0].get("x")):
            return float(data[0]["x"])
    return UNSPECIFIED


@dataclass
class RequiredMeasureGlobal:
    statuses: Dict[str, str]
    matched_row: Optional[Table821Entry]
    special_consideration: Union[bool, str]
    note2_row_is_see_note_2: bool


def determine_required_measures_global(
    cp: ControlParameters,
    rules: RulesExtraction,
    measure3_option: str,
) -> Tuple[RequiredMeasureGlobal, List[ManualReviewFlag]]:
    flags: List[ManualReviewFlag] = []
    statuses = {"1": UNSPECIFIED, "2": UNSPECIFIED, "3": UNSPECIFIED, "4": UNSPECIFIED, "5": UNSPECIFIED}
    matched_row = None
    note2_row_is_see_note_2 = False
    special_consideration: Union[bool, str] = False

    if not _is_number(cp.y_control) or not _is_number(cp.t_control):
        flags.append(
            ManualReviewFlag(
                flag_id="global_lookup_skipped",
                message="Table 8.2.1 lookup skipped because y_control or t_control is '미지정'.",
            )
        )
        return (
            RequiredMeasureGlobal(
                statuses=statuses,
                matched_row=None,
                special_consideration=UNSPECIFIED,
                note2_row_is_see_note_2=False,
            ),
            flags,
        )

    y_val = int(cp.y_control)
    t_val = float(cp.t_control)
    if t_val > 100:
        special_consideration = True
        flags.append(
            ManualReviewFlag(
                flag_id="thickness_gt_100",
                message="t_control > 100mm: special consideration required.",
                rule_reference="LR textual requirement: thickness > 100mm special consideration",
                evidence_keys=(
                    rules.textual_requirements.get("thickness_gt_100_special_consideration").evidence_keys
                    if rules.textual_requirements.get("thickness_gt_100_special_consideration")
                    else []
                ),
            )
        )

    matched_row = _match_table_821_row(rules.table_821, y=y_val, t=t_val)
    if matched_row is None:
        flags.append(
            ManualReviewFlag(
                flag_id="global_lookup_no_row",
                message=f"No Table 8.2.1 row matches y_control={y_val}, t_control={t_val}.",
            )
        )
        return (
            RequiredMeasureGlobal(
                statuses=statuses,
                matched_row=None,
                special_consideration=special_consideration,
                note2_row_is_see_note_2=False,
            ),
            flags,
        )

    statuses["1"] = _status_string(matched_row.m1)
    statuses["3"] = _status_string(matched_row.m3)
    statuses["4"] = _status_string(matched_row.m4)
    statuses["5"] = _status_string(matched_row.m5)

    note2_row_is_see_note_2 = _status_string(matched_row.m2) == "see_note_2"
    if note2_row_is_see_note_2 and measure3_option == "enhanced_NDE":
        statuses["2"] = "conditional"
    elif note2_row_is_see_note_2:
        statuses["2"] = "not_applicable"
    else:
        statuses["2"] = _status_string(matched_row.m2)

    return (
        RequiredMeasureGlobal(
            statuses=statuses,
            matched_row=matched_row,
            special_consideration=special_consideration,
            note2_row_is_see_note_2=note2_row_is_see_note_2,
        ),
        flags,
    )


def _member_roles_for_joint(joint_id: str, project_input: ProjectInput) -> List[str]:
    joint = next((j for j in project_input.joints if j.joint_id == joint_id), None)
    if not joint:
        return []
    role_map = {m.member_id: m.member_role for m in project_input.members}
    return [role_map.get(mid, "unknown") for mid in joint.connected_members]


def run_decision_engine(
    project_input: ProjectInput,
    rules: RulesExtraction,
    mapping_rules_path: Optional[str] = None,
) -> DecisionResults:
    """Generate decision_results.json content from project input + rules DB."""
    mapping_rules = _load_mapping_rules(mapping_rules_path)
    upper_flange_roles = set(mapping_rules.get("upper_flange_member_roles", []))

    cp, cp_flags = derive_control_parameters(project_input.members)
    global_result, global_flags = determine_required_measures_global(
        cp,
        rules,
        project_input.measure3_choice.option,
    )

    member_targets, joint_targets = _init_targets(project_input)
    flags: List[ManualReviewFlag] = [*cp_flags, *global_flags]

    member_map = {member.member_id: member for member in project_input.members}
    joint_map = {joint.joint_id: joint for joint in project_input.joints}

    # --- Measure 1 (joint) -------------------------------------------------
    if global_result.statuses.get("1") == "required":
        req_text, req_evidence = _text_requirement(
            rules,
            "construction_nde_ut100",
            fallback="UT 100% during construction (scan sentence 미지정)",
        )
        for joint in project_input.joints:
            if joint.zone != "cargo_hold_region" or joint.joint_type != "block_to_block_butt":
                continue
            roles = [member_map.get(mid).member_role if member_map.get(mid) else "unknown" for mid in joint.connected_members]
            if any(role == "unknown" for role in roles):
                flags.append(
                    ManualReviewFlag(
                        flag_id=f"m1_joint_member_unknown_{joint.joint_id}",
                        message="Cannot confirm Measure 1 scope because a connected member role is unknown.",
                        related_targets=[joint.joint_id, *joint.connected_members],
                    )
                )
                continue
            if not all(role in upper_flange_roles for role in roles):
                continue
            _append_measure(
                joint_targets[joint.joint_id],
                AppliedMeasure(
                    measure_id=1,
                    measure_name="Construction NDE",
                    target_type="joint",
                    target_id=joint.joint_id,
                    status="required",
                    condition_expression=(
                        "zone=cargo_hold_region AND joint_type=block_to_block_butt "
                        "AND connected_members in upper_flange_category"
                    ),
                    requirements=[req_text],
                    rule_references=["Table 8.2.1 Measure 1"],
                    evidence_keys=req_evidence,
                ),
            )

    # Candidate joints for Measure 3 options and Measure 2.
    candidate_joints: List[Any] = []
    for joint in project_input.joints:
        if joint.zone != "cargo_hold_region" or joint.joint_type != "block_to_block_butt":
            continue
        roles = [member_map.get(mid).member_role if member_map.get(mid) else "unknown" for mid in joint.connected_members]
        if any(role in upper_flange_roles for role in roles):
            candidate_joints.append(joint)

    # --- Measure 3 option-independent member requirement -------------------
    if global_result.statuses.get("3") == "required":
        bca_text, bca_evidence = _text_requirement(
            rules,
            "coaming_side_bca_required",
            fallback=UNSPECIFIED,
        )
        if bca_text == UNSPECIFIED:
            flags.append(
                ManualReviewFlag(
                    flag_id="m3_side_bca_sentence_missing",
                    message=(
                        "Measure 3 side-plate BCA sentence not confidently extracted. "
                        "Kept as manual review."
                    ),
                )
            )
        else:
            for member in project_input.members:
                if member.member_role != "hatch_coaming_side_plate":
                    continue
                bca_type = _lookup_bca_type(
                    rules.table_822,
                    "hatch_coaming_side_plate",
                    member.yield_strength_nmm2,
                    member.thickness_mm_as_built,
                )
                _append_measure(
                    member_targets[member.member_id],
                    AppliedMeasure(
                        measure_id=3,
                        measure_name="Crack arrest measure set",
                        target_type="member",
                        target_id=member.member_id,
                        status="required",
                        condition_expression="Measure 3 required AND role=hatch_coaming_side_plate",
                        requirements=[bca_text],
                        rule_references=["Measure 3 sentence", "Table 8.2.2"],
                        evidence_keys=bca_evidence,
                        details={"bca_type": bca_type},
                    ),
                )

        # Option branch
        option = project_input.measure3_choice.option
        params = project_input.measure3_choice.parameters

        if option == UNSPECIFIED:
            for joint in candidate_joints:
                _append_measure(
                    joint_targets[joint.joint_id],
                    AppliedMeasure(
                        measure_id=3,
                        measure_name="Crack arrest measure set",
                        target_type="joint",
                        target_id=joint.joint_id,
                        status="pending_manual_choice",
                        condition_expression="Measure 3 required but option is '미지정'",
                        requirements=[
                            "Select one option: block_shift | crack_arrest_hole | "
                            "crack_arrest_insert | enhanced_NDE"
                        ],
                        rule_references=["Table 8.2.1 Measure 3"],
                    ),
                )
        elif option == "block_shift":
            text, evidence = _text_requirement(
                rules,
                "block_shift_offset_min_300",
                fallback="Offset >= 300mm required",
            )
            for joint in candidate_joints:
                offset_value: Union[float, str] = UNSPECIFIED
                from_geom = False
                if joint.related_joint_ids:
                    x0 = _find_joint_x(joint)
                    for rel_id in joint.related_joint_ids:
                        rel_joint = joint_map.get(rel_id)
                        if rel_joint is None:
                            continue
                        x1 = _find_joint_x(rel_joint)
                        if _is_number(x0) and _is_number(x1):
                            offset_value = abs(float(x0) - float(x1))
                            from_geom = True
                            break
                if is_unspecified(offset_value):
                    if _is_number(params.block_shift_offset_mm):
                        offset_value = float(params.block_shift_offset_mm)
                    else:
                        flags.append(
                            ManualReviewFlag(
                                flag_id=f"m3_block_shift_offset_missing_{joint.joint_id}",
                                message=(
                                    "Cannot verify block-shift offset from geometry or parameter. "
                                    "Set to 미지정."
                                ),
                                related_targets=[joint.joint_id],
                                evidence_keys=evidence,
                            )
                        )
                pass_fail = "미지정"
                status = "required"
                noncompliance = False
                if _is_number(offset_value):
                    if float(offset_value) >= 300.0:
                        pass_fail = "pass"
                    else:
                        pass_fail = "fail"
                        status = "noncompliant"
                        noncompliance = True
                        flags.append(
                            ManualReviewFlag(
                                flag_id=f"m3_block_shift_fail_{joint.joint_id}",
                                message=f"Offset {offset_value}mm < 300mm requirement.",
                                related_targets=[joint.joint_id],
                                evidence_keys=evidence,
                            )
                        )
                _append_measure(
                    joint_targets[joint.joint_id],
                    AppliedMeasure(
                        measure_id=3,
                        measure_name="Crack arrest measure set",
                        target_type="joint",
                        target_id=joint.joint_id,
                        status=status,  # type: ignore[arg-type]
                        condition_expression="offset >= 300mm",
                        requirements=[text],
                        rule_references=["Measure 3 block shift option"],
                        evidence_keys=evidence,
                        details={
                            "option": "block_shift",
                            "offset_mm": offset_value,
                            "evaluation": pass_fail,
                            "from_geometry": from_geom,
                        },
                        noncompliance=noncompliance,
                    ),
                )
        elif option == "crack_arrest_hole":
            text, evidence = _text_requirement(
                rules,
                "crack_arrest_hole_fatigue_assessment",
                fallback=(
                    "Crack arrest hole corner/intersection requires special fatigue strength "
                    "assessment."
                ),
            )
            for joint in candidate_joints:
                _append_measure(
                    joint_targets[joint.joint_id],
                    AppliedMeasure(
                        measure_id=3,
                        measure_name="Crack arrest measure set",
                        target_type="joint",
                        target_id=joint.joint_id,
                        status="required",
                        condition_expression="measure3_choice.option == crack_arrest_hole",
                        requirements=[text],
                        rule_references=["Measure 3 crack arrest hole option"],
                        evidence_keys=evidence,
                        details={
                            "option": "crack_arrest_hole",
                            "hole_diameter_mm": params.hole_diameter_mm,
                            "fatigue_strength_special_assessment_required": True,
                        },
                    ),
                )
        elif option == "crack_arrest_insert":
            for joint in candidate_joints:
                _append_measure(
                    joint_targets[joint.joint_id],
                    AppliedMeasure(
                        measure_id=3,
                        measure_name="Crack arrest measure set",
                        target_type="joint",
                        target_id=joint.joint_id,
                        status="required",
                        condition_expression="measure3_choice.option == crack_arrest_insert",
                        requirements=["Insert plate or weld metal crack arrest insert required."],
                        rule_references=["Measure 3 crack arrest insert option"],
                        details={
                            "option": "crack_arrest_insert",
                            "insert_type": params.insert_type,
                        },
                    ),
                )
        elif option == "enhanced_NDE":
            stricter_text, stricter_ev = _text_requirement(
                rules,
                "enhanced_nde_stricter_acceptance",
                fallback="Stricter acceptance criteria (ShipRight) required.",
            )
            ctod_text, ctod_ev = _text_requirement(
                rules,
                "enhanced_nde_ctod_0_18",
                fallback="CTOD >= 0.18mm required.",
            )
            egw_text, egw_ev = _text_requirement(
                rules,
                "enhanced_nde_egw_not_permitted",
                fallback="EGW not permitted when enhanced NDE is used for Measure 3.",
            )
            shipright_present = any(item.present for item in project_input.sources.optional_shipright_files)
            acceptance_ref = params.enhanced_nde_acceptance_criteria_ref
            base_status: str = "required"
            if (not shipright_present) or is_unspecified(acceptance_ref):
                base_status = "conditional"
                flags.append(
                    ManualReviewFlag(
                        flag_id="m3_enhanced_nde_incomplete_reference",
                        message=(
                            "Enhanced NDE selected but ShipRight file is missing or "
                            "acceptance criteria reference is '미지정'."
                        ),
                        rule_reference="Measure 3 enhanced NDE conditions",
                        evidence_keys=sorted(set(stricter_ev + ctod_ev)),
                    )
                )

            for joint in candidate_joints:
                status = base_status
                noncompliance = False
                if joint.weld_process == "EGW":
                    status = "noncompliant"
                    noncompliance = True
                    flags.append(
                        ManualReviewFlag(
                            flag_id=f"egw_not_permitted_{joint.joint_id}",
                            message="EGW not permitted when Measure 3 enhanced NDE is selected.",
                            related_targets=[joint.joint_id],
                            rule_reference="Measure 3 enhanced NDE",
                            evidence_keys=egw_ev,
                        )
                    )

                _append_measure(
                    joint_targets[joint.joint_id],
                    AppliedMeasure(
                        measure_id=3,
                        measure_name="Crack arrest measure set",
                        target_type="joint",
                        target_id=joint.joint_id,
                        status=status,  # type: ignore[arg-type]
                        condition_expression="measure3_choice.option == enhanced_NDE",
                        requirements=[
                            stricter_text,
                            ctod_text,
                            egw_text,
                            "If inaccessible for planned NDE, alternative NDE needs LR agreement.",
                        ],
                        rule_references=["Measure 3 enhanced NDE option", "ShipRight"],
                        evidence_keys=sorted(set(stricter_ev + ctod_ev + egw_ev)),
                        details={
                            "option": "enhanced_NDE",
                            "enhanced_nde_method": params.enhanced_nde_method,
                            "acceptance_criteria_ref": acceptance_ref,
                            "ctod_min_mm": 0.18,
                            "egw_not_permitted": True,
                            "weld_process": joint.weld_process,
                        },
                        noncompliance=noncompliance,
                    ),
                )

    # --- Measure 4 (member upper deck) ------------------------------------
    if global_result.statuses.get("4") == "required":
        for member in project_input.members:
            if member.member_role != "upper_deck_plate" or member.zone != "cargo_hold_region":
                continue
            bca_type = _lookup_bca_type(
                rules.table_822,
                "upper_deck_plate",
                member.yield_strength_nmm2,
                member.thickness_mm_as_built,
            )
            _append_measure(
                member_targets[member.member_id],
                AppliedMeasure(
                    measure_id=4,
                    measure_name="Upper deck BCA steel",
                    target_type="member",
                    target_id=member.member_id,
                    status="required",
                    condition_expression="Measure 4 required AND role=upper_deck_plate",
                    requirements=["Upper deck BCA steel required per Table 8.2.2."],
                    rule_references=["Table 8.2.1 Measure 4", "Table 8.2.2"],
                    details={"bca_type": bca_type},
                ),
            )

    # --- Measure 5 (same target logic as measure 4, separate trace id) ----
    if global_result.statuses.get("5") == "required":
        for member in project_input.members:
            if member.member_role != "upper_deck_plate" or member.zone != "cargo_hold_region":
                continue
            bca_type = _lookup_bca_type(
                rules.table_822,
                "upper_deck_plate",
                member.yield_strength_nmm2,
                member.thickness_mm_as_built,
            )
            _append_measure(
                member_targets[member.member_id],
                AppliedMeasure(
                    measure_id=5,
                    measure_name="Upper deck BCA steel (traceability)",
                    target_type="member",
                    target_id=member.member_id,
                    status="required",
                    condition_expression="Measure 5 required AND role=upper_deck_plate",
                    requirements=["Upper deck BCA steel required per Table 8.2.2."],
                    rule_references=["Table 8.2.1 Measure 5", "Table 8.2.2"],
                    details={"bca_type": bca_type},
                ),
            )

    # --- Measure 2 conditional (Note 2 + enhanced_NDE only) ---------------
    if (
        global_result.note2_row_is_see_note_2
        and project_input.measure3_choice.option == "enhanced_NDE"
        and global_result.statuses.get("2") == "conditional"
    ):
        for joint in candidate_joints:
            _append_measure(
                joint_targets[joint.joint_id],
                AppliedMeasure(
                    measure_id=2,
                    measure_name="Periodic in-service NDE (Note 2)",
                    target_type="joint",
                    target_id=joint.joint_id,
                    status="conditional",
                    condition_expression=(
                        "Table 8.2.1 m2=see_note_2 AND "
                        "measure3_choice.option=enhanced_NDE"
                    ),
                    requirements=["Frequency/extent to be agreed with LR."],
                    rule_references=["Table 8.2.1 Note 2"],
                ),
            )

    # --- Always-on weld detail requirement (coaming_to_deck) --------------
    pjp_text, pjp_ev = _text_requirement(
        rules,
        "coaming_to_deck_pjp_required",
        fallback="LR-approved PJP required for coaming side-upper deck connection.",
    )
    for joint in project_input.joints:
        if joint.joint_type != "coaming_to_deck_connection":
            continue
        _append_measure(
            joint_targets[joint.joint_id],
            AppliedMeasure(
                measure_id=0,
                measure_name="Weld detail requirement",
                target_type="joint",
                target_id=joint.joint_id,
                status="required",
                condition_expression="joint_type=coaming_to_deck_connection",
                requirements=[pjp_text],
                rule_references=["Coaming-to-deck connection requirement"],
                evidence_keys=pjp_ev,
                details={"keyword": "PJP"},
            ),
        )

    # Flatten outputs
    member_results = sorted(member_targets.values(), key=lambda item: item.target_id)
    joint_results = sorted(joint_targets.values(), key=lambda item: item.target_id)

    flat: List[AppliedMeasure] = []
    for target in [*member_results, *joint_results]:
        flat.extend(target.applied_measures)

    note2_context = {
        "table_m2_status": global_result.matched_row.m2 if global_result.matched_row else UNSPECIFIED,
        "measure3_option": project_input.measure3_choice.option,
        "note2_row_is_see_note_2": global_result.note2_row_is_see_note_2,
        "note2_applied_as_conditional": (
            global_result.note2_row_is_see_note_2
            and project_input.measure3_choice.option == "enhanced_NDE"
        ),
    }

    return DecisionResults(
        project_meta=project_input.project_meta,
        control_parameters=cp,
        required_measures_global=global_result.statuses,
        members=member_results,
        joints=joint_results,
        applied_measures_flat=sorted(
            flat,
            key=lambda m: (m.target_type, m.target_id, m.measure_id),
        ),
        note2_context=note2_context,
        special_consideration=global_result.special_consideration,
        manual_review_flags=flags,
    )

