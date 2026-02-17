"""Decision engine for LR hatch coaming brittle fracture measures."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Tuple

from .models import (
    AppliedMeasure,
    ControlParameters,
    DecisionResults,
    DecisionStatus,
    JointInput,
    JointType,
    ManualReviewFlag,
    Measure3Option,
    MemberInput,
    MemberRole,
    ProjectInput,
    RuleStatus,
    TargetDecision,
    TargetType,
    UNSPECIFIED,
    WeldProcess,
    Zone,
)
from .rules_db import RulesExtractionDB, TextRequirement


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float))


def _requirement_text(req: Optional[TextRequirement]) -> str:
    if req is None:
        return UNSPECIFIED
    return req.requirement_text or UNSPECIFIED


def _requirement_evidence(req: Optional[TextRequirement]) -> str:
    if req is None:
        return ""
    return req.evidence_id or ""


def _extract_xy_from_geom(geom_data: Any) -> Optional[Tuple[float, float]]:
    if isinstance(geom_data, dict):
        if "x" in geom_data and "y" in geom_data:
            try:
                return float(geom_data["x"]), float(geom_data["y"])
            except Exception:
                return None
        if "start" in geom_data and isinstance(geom_data["start"], dict):
            start = geom_data["start"]
            if "x" in start and "y" in start:
                try:
                    return float(start["x"]), float(start["y"])
                except Exception:
                    return None
        if "points" in geom_data and isinstance(geom_data["points"], list) and geom_data["points"]:
            first = geom_data["points"][0]
            if isinstance(first, dict) and "x" in first and "y" in first:
                try:
                    return float(first["x"]), float(first["y"])
                except Exception:
                    return None
    if isinstance(geom_data, list) and geom_data:
        first = geom_data[0]
        if isinstance(first, (list, tuple)) and len(first) >= 2:
            try:
                return float(first[0]), float(first[1])
            except Exception:
                return None
    return None


@dataclass
class GlobalDecision:
    required_measures: Dict[int, DecisionStatus]
    lookup_info: Dict[str, Any]
    control_parameters: ControlParameters
    flags: List[ManualReviewFlag]


class ApplicationAccumulator:
    """Append-only accumulator with idempotent merge for same target/measure."""

    def __init__(self) -> None:
        self._items: Dict[Tuple[str, str, int], AppliedMeasure] = {}

    def add(self, measure: AppliedMeasure) -> None:
        key = (measure.target_type.value, measure.target_id, measure.measure_id)
        existing = self._items.get(key)
        if existing is None:
            self._items[key] = measure
            return
        existing.requirements = list(dict.fromkeys(existing.requirements + measure.requirements))
        existing.rule_refs = sorted(set(existing.rule_refs + measure.rule_refs))
        existing.evidence_ids = sorted(set(existing.evidence_ids + measure.evidence_ids))
        existing.notes = list(dict.fromkeys(existing.notes + measure.notes))
        existing.noncompliance = existing.noncompliance or measure.noncompliance
        existing.extra = {**existing.extra, **measure.extra}
        if existing.status != DecisionStatus.required and measure.status == DecisionStatus.required:
            existing.status = measure.status
        elif existing.status == DecisionStatus.pending_manual_choice and measure.status != DecisionStatus.pending_manual_choice:
            existing.status = measure.status

    def values(self) -> List[AppliedMeasure]:
        return sorted(
            self._items.values(),
            key=lambda app: (app.target_type.value, app.target_id, app.measure_id),
        )


def derive_control_parameters(members: List[MemberInput]) -> Tuple[ControlParameters, List[ManualReviewFlag]]:
    flags: List[ManualReviewFlag] = []
    cp = ControlParameters()

    side = [m for m in members if m.member_role == MemberRole.hatch_coaming_side_plate]
    top = [m for m in members if m.member_role == MemberRole.hatch_coaming_top_plate]

    side_t = [float(m.thickness_mm_as_built) for m in side if _is_number(m.thickness_mm_as_built)]
    top_t = [float(m.thickness_mm_as_built) for m in top if _is_number(m.thickness_mm_as_built)]
    side_y = [int(m.yield_strength_nmm2) for m in side if _is_number(m.yield_strength_nmm2)]
    top_y = [int(m.yield_strength_nmm2) for m in top if _is_number(m.yield_strength_nmm2)]

    cp.t_side = max(side_t) if side_t else UNSPECIFIED
    cp.t_top = max(top_t) if top_t else UNSPECIFIED
    cp.y_side = max(side_y) if side_y else UNSPECIFIED
    cp.y_top = max(top_y) if top_y else UNSPECIFIED

    # Non-negotiable: if either side/top is unspecified, keep control as 미지정.
    if _is_number(cp.t_side) and _is_number(cp.t_top):
        cp.t_control = max(float(cp.t_side), float(cp.t_top))
    else:
        cp.t_control = UNSPECIFIED
        flags.append(
            ManualReviewFlag(
                flag_id="t_control_unspecified",
                message="t_control is 미지정 because side/top thickness is incomplete.",
                category="control_parameter",
                related_ids=[m.member_id for m in side + top],
            )
        )

    if _is_number(cp.y_side) and _is_number(cp.y_top):
        cp.y_control = max(int(cp.y_side), int(cp.y_top))
        if int(cp.y_side) != int(cp.y_top):
            flags.append(
                ManualReviewFlag(
                    flag_id="yield_side_top_mismatch",
                    message=(
                        f"side_yield({cp.y_side}) != top_yield({cp.y_top}); "
                        f"y_control={cp.y_control} used with manual review."
                    ),
                    category="control_parameter",
                    related_ids=[m.member_id for m in side + top],
                )
            )
    else:
        cp.y_control = UNSPECIFIED
        flags.append(
            ManualReviewFlag(
                flag_id="y_control_unspecified",
                message="y_control is 미지정 because side/top yield is incomplete.",
                category="control_parameter",
                related_ids=[m.member_id for m in side + top],
            )
        )

    return cp, flags


def determine_global_required_measures(
    project_input: ProjectInput,
    rules_db: RulesExtractionDB,
    control: ControlParameters,
) -> GlobalDecision:
    flags: List[ManualReviewFlag] = []
    lookup_info: Dict[str, Any] = {}
    required: Dict[int, DecisionStatus] = {
        1: DecisionStatus.not_applicable,
        2: DecisionStatus.not_applicable,
        3: DecisionStatus.not_applicable,
        4: DecisionStatus.not_applicable,
        5: DecisionStatus.not_applicable,
    }

    if not _is_number(control.y_control) or not _is_number(control.t_control):
        flags.append(
            ManualReviewFlag(
                flag_id="global_lookup_input_unspecified",
                message=(
                    "Table 8.2.1 lookup skipped because y_control or t_control is 미지정."
                ),
                category="decision_lookup",
            )
        )
        return GlobalDecision(required, lookup_info, control, flags)

    y_control = int(control.y_control)
    t_control = float(control.t_control)
    if t_control > 100:
        lookup_info["special_consideration"] = True
        flags.append(
            ManualReviewFlag(
                flag_id="control_thickness_gt_100",
                message="t_control > 100mm, special consideration must be reviewed.",
                category="special_consideration",
            )
        )
    row = rules_db.lookup_821(y_control, t_control)
    if row is None:
        flags.append(
            ManualReviewFlag(
                flag_id="global_lookup_no_row",
                message=f"No Table 8.2.1 row for y={y_control}, t={t_control}.",
                category="decision_lookup",
            )
        )
        return GlobalDecision(required, lookup_info, control, flags)

    lookup_info["matched_row"] = row.model_dump()

    # M1/M3/M4/M5
    required[1] = DecisionStatus.required if row.m1 == RuleStatus.required else DecisionStatus.not_applicable
    required[3] = DecisionStatus.required if row.m3 == RuleStatus.required else DecisionStatus.not_applicable
    required[4] = DecisionStatus.required if row.m4 == RuleStatus.required else DecisionStatus.not_applicable
    required[5] = DecisionStatus.required if row.m5 == RuleStatus.required else DecisionStatus.not_applicable

    if row.raw_m3m4_column not in (UNSPECIFIED, "split") and row.m3 == RuleStatus.required and row.m4 == RuleStatus.required:
        lookup_info["expanded_3_plus_4"] = True

    # Measure 2 special Note 2 gating
    if row.m2 == RuleStatus.see_note_2:
        if project_input.measure3_choice.option == Measure3Option.enhanced_NDE:
            required[2] = DecisionStatus.conditional
            lookup_info["note_2_triggered"] = True
        else:
            required[2] = DecisionStatus.not_applicable
            lookup_info["note_2_triggered"] = False
    elif row.m2 == RuleStatus.required:
        required[2] = DecisionStatus.required
    elif row.m2 == RuleStatus.unspecified:
        required[2] = DecisionStatus.not_applicable
        flags.append(
            ManualReviewFlag(
                flag_id="table_821_m2_unspecified",
                message="Measure 2 status in Table 8.2.1 is 미지정.",
                category="decision_lookup",
            )
        )

    return GlobalDecision(required, lookup_info, control, flags)


def _upper_flange_candidate(
    joint: JointInput,
    member_map: Dict[str, MemberInput],
    upper_flange_roles: Iterable[MemberRole],
) -> Tuple[bool, bool]:
    roles: List[MemberRole] = []
    has_unknown = False
    for member_id in joint.connected_members:
        member = member_map.get(member_id)
        if member is None:
            has_unknown = True
            continue
        roles.append(member.member_role)
        if member.member_role == MemberRole.unknown:
            has_unknown = True
    if not roles:
        return False, True
    role_set = set(roles)
    return role_set.issubset(set(upper_flange_roles)), has_unknown


def _candidate_joints_for_m1_m3(
    joints: List[JointInput],
    member_map: Dict[str, MemberInput],
    upper_flange_roles: Iterable[MemberRole],
) -> List[JointInput]:
    out: List[JointInput] = []
    for joint in joints:
        if joint.zone != Zone.cargo_hold_region:
            continue
        if joint.joint_type != JointType.block_to_block_butt:
            continue
        in_scope, _ = _upper_flange_candidate(joint, member_map, upper_flange_roles)
        if in_scope:
            out.append(joint)
    return out


def _lookup_bca(
    rules_db: RulesExtractionDB,
    *,
    member_role: str,
    member: MemberInput,
) -> Tuple[str, List[str]]:
    evidence_ids: List[str] = []
    if not _is_number(member.yield_strength_nmm2) or not _is_number(member.thickness_mm_as_built):
        return UNSPECIFIED, evidence_ids
    row = rules_db.lookup_822(member_role, int(member.yield_strength_nmm2), float(member.thickness_mm_as_built))
    if row is None:
        return UNSPECIFIED, evidence_ids
    if row.evidence_id:
        evidence_ids.append(row.evidence_id)
    return row.bca_type, evidence_ids


def _measure_name(measure_id: int) -> str:
    names = {
        0: "Structural weld requirement",
        1: "Measure 1 - Construction NDE",
        2: "Measure 2 - Periodic in-service NDE",
        3: "Measure 3 - Crack arrest measure set",
        4: "Measure 4 - Upper deck BCA steel",
        5: "Measure 5 - Upper deck BCA steel (traceability)",
    }
    return names.get(measure_id, f"Measure {measure_id}")


def apply_measures_to_targets(
    project_input: ProjectInput,
    rules_db: RulesExtractionDB,
    global_decision: GlobalDecision,
    mapping_rules: Dict[str, Any],
) -> Tuple[List[AppliedMeasure], List[Dict[str, Any]], List[ManualReviewFlag]]:
    flags: List[ManualReviewFlag] = []
    pending_choices: List[Dict[str, Any]] = []
    acc = ApplicationAccumulator()

    member_map = {member.member_id: member for member in project_input.members}
    upper_flange_roles = {
        MemberRole(role)
        for role in mapping_rules.get(
            "upper_flange_roles",
            [
                "upper_deck_plate",
                "hatch_coaming_side_plate",
                "hatch_coaming_top_plate",
                "attached_longitudinal",
            ],
        )
    }

    req_m1 = rules_db.textual_requirements.get("measure_1_ut_100")
    req_pjp = rules_db.textual_requirements.get("pjp_required_coaming_to_deck")
    req_block_shift = rules_db.textual_requirements.get("block_shift_min_300mm")
    req_hole = rules_db.textual_requirements.get("crack_arrest_hole_fatigue_assessment")
    req_enhanced = rules_db.textual_requirements.get("enhanced_nde_stricter_acceptance")
    req_alt_nde = rules_db.textual_requirements.get("enhanced_nde_alternative_nde_by_lr_agreement")
    req_ctod = rules_db.textual_requirements.get("enhanced_nde_ctod_min_0_18")
    req_egw = rules_db.textual_requirements.get("enhanced_nde_egw_not_permitted")
    req_side_bca = rules_db.textual_requirements.get("measure3_coaming_side_bca_requirement")

    # Always-on PJP requirement for coaming-to-deck connection joints.
    for joint in project_input.joints:
        if joint.joint_type != JointType.coaming_to_deck_connection:
            continue
        evidence_ids = [_requirement_evidence(req_pjp)] if _requirement_evidence(req_pjp) else []
        acc.add(
            AppliedMeasure(
                measure_id=0,
                measure_name=_measure_name(0),
                status=DecisionStatus.required,
                target_type=TargetType.joint,
                target_id=joint.joint_id,
                condition_expression="joint_type == coaming_to_deck_connection",
                requirements=[_requirement_text(req_pjp)],
                rule_refs=["Coaming side-upper deck connection sentence"],
                evidence_ids=evidence_ids,
                notes=["LR-approved PJP required"],
            )
        )

    # Measure 1
    if global_decision.required_measures[1] == DecisionStatus.required:
        for joint in project_input.joints:
            if joint.zone != Zone.cargo_hold_region or joint.joint_type != JointType.block_to_block_butt:
                continue
            in_scope, has_unknown = _upper_flange_candidate(joint, member_map, upper_flange_roles)
            if has_unknown:
                flags.append(
                    ManualReviewFlag(
                        flag_id=f"m1_unknown_scope_{joint.joint_id}",
                        message="Measure 1 scope unclear due to missing/unknown connected member role.",
                        category="measure_1",
                        related_ids=[joint.joint_id] + joint.connected_members,
                    )
                )
                acc.add(
                    AppliedMeasure(
                        measure_id=1,
                        measure_name=_measure_name(1),
                        status=DecisionStatus.pending_manual_review,
                        target_type=TargetType.joint,
                        target_id=joint.joint_id,
                        condition_expression="scope unresolved",
                        requirements=[_requirement_text(req_m1)],
                        rule_refs=["Table 8.2.1 Measure 1"],
                        evidence_ids=[_requirement_evidence(req_m1)] if _requirement_evidence(req_m1) else [],
                        notes=["pending_manual_review"],
                    )
                )
                continue
            if not in_scope:
                continue
            acc.add(
                AppliedMeasure(
                    measure_id=1,
                    measure_name=_measure_name(1),
                    status=DecisionStatus.required,
                    target_type=TargetType.joint,
                    target_id=joint.joint_id,
                    condition_expression=(
                        "zone=cargo_hold_region && joint_type=block_to_block_butt && upper_flange_long_member"
                    ),
                    requirements=[_requirement_text(req_m1)],
                    rule_refs=["Table 8.2.1 Measure 1"],
                    evidence_ids=[_requirement_evidence(req_m1)] if _requirement_evidence(req_m1) else [],
                    notes=["UT100%"],
                )
            )

    # Candidate joints for M2/M3
    candidate_joints = _candidate_joints_for_m1_m3(project_input.joints, member_map, upper_flange_roles)

    # Measure 3 - option-independent BCA requirement on coaming side member
    if global_decision.required_measures[3] == DecisionStatus.required:
        side_req_confirmed = (
            req_side_bca is not None
            and req_side_bca.requirement_text != UNSPECIFIED
            and req_side_bca.normalized.get("measure3_requires_coaming_side_bca") is True
        )
        if side_req_confirmed:
            for member in project_input.members:
                if member.member_role != MemberRole.hatch_coaming_side_plate:
                    continue
                bca_type, bca_evidence = _lookup_bca(
                    rules_db,
                    member_role="hatch_coaming_side_plate",
                    member=member,
                )
                evidence = bca_evidence[:]
                if req_side_bca.evidence_id:
                    evidence.append(req_side_bca.evidence_id)
                acc.add(
                    AppliedMeasure(
                        measure_id=3,
                        measure_name=_measure_name(3),
                        status=DecisionStatus.required,
                        target_type=TargetType.member,
                        target_id=member.member_id,
                        condition_expression="Measure 3 required && coaming side BCA sentence present",
                        requirements=[_requirement_text(req_side_bca)],
                        rule_refs=["Measure 3 sentence", "Table 8.2.2"],
                        evidence_ids=evidence,
                        notes=[f"BCA={bca_type}"],
                        extra={"bca_type": bca_type},
                    )
                )
        else:
            flags.append(
                ManualReviewFlag(
                    flag_id="m3_side_bca_sentence_missing",
                    message=(
                        "Measure 3 coaming side BCA sentence evidence is 미지정; "
                        "auto-application skipped for side plate member."
                    ),
                    category="measure_3",
                )
            )

        option = project_input.measure3_choice.option
        if option == Measure3Option.unspecified:
            pending_choices.append(
                {
                    "measure_id": 3,
                    "status": DecisionStatus.pending_manual_choice.value,
                    "allowed_options": [opt.value for opt in Measure3Option if opt != Measure3Option.unspecified],
                    "message": "Measure 3 option is 미지정. Select one option to finalize option-dependent actions.",
                }
            )
            for joint in candidate_joints:
                acc.add(
                    AppliedMeasure(
                        measure_id=3,
                        measure_name=_measure_name(3),
                        status=DecisionStatus.pending_manual_choice,
                        target_type=TargetType.joint,
                        target_id=joint.joint_id,
                        condition_expression="Measure 3 option 미지정",
                        requirements=[UNSPECIFIED],
                        rule_refs=["Table 8.2.1 Measure 3"],
                        notes=["pending_manual_choice"],
                    )
                )

        elif option == Measure3Option.block_shift:
            for joint in candidate_joints:
                offset = project_input.measure3_choice.parameters.block_shift_offset_mm
                offset_source = "parameter"
                if not _is_number(offset) and joint.related_joint_ids and joint.geom.data != UNSPECIFIED:
                    p1 = _extract_xy_from_geom(joint.geom.data)
                    ref_joint = next((j for j in project_input.joints if j.joint_id == joint.related_joint_ids[0]), None)
                    if ref_joint and ref_joint.geom.data != UNSPECIFIED and p1:
                        p2 = _extract_xy_from_geom(ref_joint.geom.data)
                        if p2:
                            offset = abs(p1[0] - p2[0])
                            offset_source = "geom_related_joint"
                pass_fail = "미지정"
                status = DecisionStatus.required
                noncompliance = False
                if _is_number(offset):
                    pass_fail = "pass" if float(offset) >= 300 else "fail"
                    if pass_fail == "fail":
                        noncompliance = True
                        flags.append(
                            ManualReviewFlag(
                                flag_id=f"m3_block_shift_fail_{joint.joint_id}",
                                message=f"Offset {offset}mm < 300mm for joint {joint.joint_id}.",
                                category="measure_3_block_shift",
                                related_ids=[joint.joint_id],
                                severity="error",
                            )
                        )
                else:
                    status = DecisionStatus.pending_manual_review
                    flags.append(
                        ManualReviewFlag(
                            flag_id=f"m3_block_shift_unspecified_{joint.joint_id}",
                            message="Block shift offset is 미지정; cannot verify >= 300mm.",
                            category="measure_3_block_shift",
                            related_ids=[joint.joint_id],
                        )
                    )

                evidence = [_requirement_evidence(req_block_shift)] if _requirement_evidence(req_block_shift) else []
                acc.add(
                    AppliedMeasure(
                        measure_id=3,
                        measure_name=_measure_name(3),
                        status=status,
                        target_type=TargetType.joint,
                        target_id=joint.joint_id,
                        condition_expression="block_shift offset >= 300mm",
                        requirements=[_requirement_text(req_block_shift)],
                        rule_refs=["Measure 3 block shift sentence"],
                        evidence_ids=evidence,
                        notes=[f"offset={offset}", f"check={pass_fail}"],
                        noncompliance=noncompliance,
                        extra={"offset_mm": offset, "offset_source": offset_source, "result": pass_fail},
                    )
                )

        elif option == Measure3Option.crack_arrest_hole:
            for joint in candidate_joints:
                acc.add(
                    AppliedMeasure(
                        measure_id=3,
                        measure_name=_measure_name(3),
                        status=DecisionStatus.required,
                        target_type=TargetType.joint,
                        target_id=joint.joint_id,
                        condition_expression="option == crack_arrest_hole",
                        requirements=[_requirement_text(req_hole)],
                        rule_refs=["Measure 3 crack arrest hole sentence"],
                        evidence_ids=[_requirement_evidence(req_hole)] if _requirement_evidence(req_hole) else [],
                        notes=["fatigue special assessment required"],
                        extra={"hole_diameter_mm": project_input.measure3_choice.parameters.hole_diameter_mm},
                    )
                )

        elif option == Measure3Option.crack_arrest_insert:
            for joint in candidate_joints:
                acc.add(
                    AppliedMeasure(
                        measure_id=3,
                        measure_name=_measure_name(3),
                        status=DecisionStatus.required,
                        target_type=TargetType.joint,
                        target_id=joint.joint_id,
                        condition_expression="option == crack_arrest_insert",
                        requirements=[
                            "insert plate or weld metal insert required",
                        ],
                        rule_refs=["Measure 3 crack arrest insert sentence"],
                        evidence_ids=[],
                        notes=[f"insert_type={project_input.measure3_choice.parameters.insert_type}"],
                        extra={"insert_type": project_input.measure3_choice.parameters.insert_type},
                    )
                )

        elif option == Measure3Option.enhanced_NDE:
            shipright_present = any(file.present for file in project_input.sources.optional_shipright_files)
            criteria_ref = project_input.measure3_choice.parameters.enhanced_nde_acceptance_criteria_ref
            criteria_missing = criteria_ref == UNSPECIFIED or not criteria_ref
            for joint in candidate_joints:
                status = DecisionStatus.required
                notes = ["stricter acceptance criteria", "CTOD>=0.18", "EGW not permitted"]
                if (not shipright_present) or criteria_missing:
                    status = DecisionStatus.conditional
                    flags.append(
                        ManualReviewFlag(
                            flag_id=f"m3_enhanced_nde_conditional_{joint.joint_id}",
                            message=(
                                "Enhanced NDE chosen but ShipRight file is missing "
                                "or acceptance criteria ref is 미지정."
                            ),
                            category="measure_3_enhanced_nde",
                            related_ids=[joint.joint_id],
                        )
                    )
                noncompliance = joint.weld_process == WeldProcess.EGW
                if noncompliance:
                    flags.append(
                        ManualReviewFlag(
                            flag_id=f"egw_not_permitted_{joint.joint_id}",
                            message="EGW not permitted when enhanced_NDE is required.",
                            category="noncompliance",
                            related_ids=[joint.joint_id],
                            severity="error",
                        )
                    )
                    notes.append("noncompliance: EGW process detected")
                evidence_ids = [
                    evidence
                    for evidence in (
                        _requirement_evidence(req_enhanced),
                        _requirement_evidence(req_alt_nde),
                        _requirement_evidence(req_ctod),
                        _requirement_evidence(req_egw),
                    )
                    if evidence
                ]
                acc.add(
                    AppliedMeasure(
                        measure_id=3,
                        measure_name=_measure_name(3),
                        status=status,
                        target_type=TargetType.joint,
                        target_id=joint.joint_id,
                        condition_expression="option == enhanced_NDE",
                        requirements=[
                            _requirement_text(req_enhanced),
                            _requirement_text(req_alt_nde),
                            _requirement_text(req_ctod),
                            _requirement_text(req_egw),
                        ],
                        rule_refs=["Measure 3 enhanced NDE sentence", "ShipRight reference"],
                        evidence_ids=evidence_ids,
                        notes=notes,
                        noncompliance=noncompliance,
                        extra={
                            "enhanced_nde_method": project_input.measure3_choice.parameters.enhanced_nde_method.value,
                            "acceptance_criteria_ref": criteria_ref,
                        },
                    )
                )

    # Measure 4 and 5 for upper deck members in cargo hold region.
    for measure_id in (4, 5):
        if global_decision.required_measures[measure_id] != DecisionStatus.required:
            continue
        for member in project_input.members:
            if member.member_role != MemberRole.upper_deck_plate:
                continue
            if member.zone != Zone.cargo_hold_region:
                continue
            bca_type, bca_evidence = _lookup_bca(
                rules_db,
                member_role="upper_deck_plate",
                member=member,
            )
            if bca_type == UNSPECIFIED:
                flags.append(
                    ManualReviewFlag(
                        flag_id=f"m{measure_id}_bca_unspecified_{member.member_id}",
                        message=f"Measure {measure_id}: BCA type lookup returned 미지정.",
                        category=f"measure_{measure_id}",
                        related_ids=[member.member_id],
                    )
                )
            acc.add(
                AppliedMeasure(
                    measure_id=measure_id,
                    measure_name=_measure_name(measure_id),
                    status=DecisionStatus.required,
                    target_type=TargetType.member,
                    target_id=member.member_id,
                    condition_expression="role=upper_deck_plate && zone=cargo_hold_region",
                    requirements=["upper deck BCA steel required"],
                    rule_refs=[f"Table 8.2.1 Measure {measure_id}", "Table 8.2.2"],
                    evidence_ids=bca_evidence,
                    notes=[f"BCA={bca_type}"],
                    extra={"bca_type": bca_type},
                )
            )

    # Measure 2 conditional application (only when already deemed conditional/required).
    if global_decision.required_measures[2] == DecisionStatus.conditional:
        for joint in candidate_joints:
            acc.add(
                AppliedMeasure(
                    measure_id=2,
                    measure_name=_measure_name(2),
                    status=DecisionStatus.conditional,
                    target_type=TargetType.joint,
                    target_id=joint.joint_id,
                    condition_expression="Table 8.2.1 Note 2 && measure3_choice=enhanced_NDE",
                    requirements=["frequency/extent LR agreement required"],
                    rule_refs=["Table 8.2.1 Note 2"],
                    notes=["conditional per Note 2"],
                )
            )

    return acc.values(), pending_choices, flags


def build_target_view(
    members: List[MemberInput],
    joints: List[JointInput],
    applications: List[AppliedMeasure],
) -> Dict[str, List[TargetDecision]]:
    by_target: Dict[Tuple[str, str], List[AppliedMeasure]] = {}
    for app in applications:
        key = (app.target_type.value, app.target_id)
        by_target.setdefault(key, []).append(app)

    member_results: List[TargetDecision] = []
    for member in members:
        key = (TargetType.member.value, member.member_id)
        apps = sorted(by_target.get(key, []), key=lambda item: item.measure_id)
        member_results.append(
            TargetDecision(
                target_type=TargetType.member,
                target_id=member.member_id,
                applied_measures=apps,
            )
        )

    joint_results: List[TargetDecision] = []
    for joint in joints:
        key = (TargetType.joint.value, joint.joint_id)
        apps = sorted(by_target.get(key, []), key=lambda item: item.measure_id)
        joint_results.append(
            TargetDecision(
                target_type=TargetType.joint,
                target_id=joint.joint_id,
                applied_measures=apps,
            )
        )

    return {"members": member_results, "joints": joint_results}


def run_decision_engine(
    project_input: ProjectInput,
    rules_db: RulesExtractionDB,
    mapping_rules: Dict[str, Any],
) -> DecisionResults:
    control, control_flags = derive_control_parameters(project_input.members)
    global_decision = determine_global_required_measures(project_input, rules_db, control)
    applications, pending_choices, application_flags = apply_measures_to_targets(
        project_input,
        rules_db,
        global_decision,
        mapping_rules,
    )

    target_view = build_target_view(project_input.members, project_input.joints, applications)
    required_global = {
        f"measure_{measure_id}": status.value
        for measure_id, status in sorted(global_decision.required_measures.items())
    }
    all_flags = (
        list(rules_db.manual_review_flags)
        + control_flags
        + global_decision.flags
        + application_flags
    )

    return DecisionResults(
        project_meta=project_input.project_meta,
        control_parameters=control,
        required_measures_global=required_global,
        table_821_lookup=global_decision.lookup_info,
        targets=target_view,
        applications=applications,
        pending_choices=pending_choices,
        manual_review_flags=all_flags,
    )

