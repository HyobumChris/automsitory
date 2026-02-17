"""
Decision Engine – LR Hatch Coaming Brittle Fracture Prevention Measures 1–5.

Applies measures cumulatively (append-only) to members and joints,
separating member targets from joint targets.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple, Union

from .rules_db import (
    AppliedMeasure,
    ControlValues,
    DecisionResults,
    DecisionStatus,
    EvidenceRecord,
    ManualReviewFlag,
    Measure3Option,
    MeasureStatus,
    MemberInput,
    MemberRole,
    JointInput,
    JointType,
    ProjectInput,
    RulesExtraction,
    Table821Row,
    Table822Row,
    TargetType,
    WeldProcess,
    Zone,
    is_unspecified,
    save_json,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Configuration loading
# ---------------------------------------------------------------------------

def _load_mapping_rules(path: str = "configs/mapping_rules.json") -> Dict[str, Any]:
    if Path(path).exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


# ---------------------------------------------------------------------------
# Helper: derive control values
# ---------------------------------------------------------------------------

def _derive_control_values(
    project: ProjectInput,
    mapping: Dict[str, Any],
) -> Tuple[ControlValues, List[ManualReviewFlag]]:
    """
    Derive t_control and y_control from coaming side and top plates.
    """
    flags: List[ManualReviewFlag] = []
    cv = ControlValues()

    side_t: Optional[float] = None
    top_t: Optional[float] = None
    side_y: Optional[float] = None
    top_y: Optional[float] = None

    for m in project.members:
        role = m.member_role
        if role == MemberRole.hatch_coaming_side_plate:
            if not is_unspecified(m.thickness_mm_as_built):
                side_t = float(m.thickness_mm_as_built)
            if not is_unspecified(m.yield_strength_nmm2):
                side_y = float(m.yield_strength_nmm2)
        elif role == MemberRole.hatch_coaming_top_plate:
            if not is_unspecified(m.thickness_mm_as_built):
                top_t = float(m.thickness_mm_as_built)
            if not is_unspecified(m.yield_strength_nmm2):
                top_y = float(m.yield_strength_nmm2)

    # t_control = max(side, top) if both known
    if side_t is not None and top_t is not None:
        cv.t_control_mm = max(side_t, top_t)
    elif side_t is not None:
        cv.t_control_mm = side_t
        flags.append(ManualReviewFlag(
            flag_id="CTRL-T-01",
            description="Hatch coaming top plate thickness is 미지정; t_control based on side plate only.",
        ))
    elif top_t is not None:
        cv.t_control_mm = top_t
        flags.append(ManualReviewFlag(
            flag_id="CTRL-T-02",
            description="Hatch coaming side plate thickness is 미지정; t_control based on top plate only.",
        ))
    else:
        cv.t_control_mm = "미지정"
        flags.append(ManualReviewFlag(
            flag_id="CTRL-T-03",
            description="Both coaming side and top plate thicknesses are 미지정; t_control cannot be determined.",
            severity="error",
        ))

    # y_control = max(side, top) if both known
    if side_y is not None and top_y is not None:
        cv.y_control_nmm2 = max(side_y, top_y)
        if side_y != top_y:
            flags.append(ManualReviewFlag(
                flag_id="CTRL-Y-01",
                description=f"Coaming side yield ({side_y}) != top yield ({top_y}). "
                            f"Using max={max(side_y, top_y)}. Review required.",
            ))
    elif side_y is not None:
        cv.y_control_nmm2 = side_y
        flags.append(ManualReviewFlag(
            flag_id="CTRL-Y-02",
            description="Hatch coaming top plate yield is 미지정; y_control based on side plate only.",
        ))
    elif top_y is not None:
        cv.y_control_nmm2 = top_y
        flags.append(ManualReviewFlag(
            flag_id="CTRL-Y-03",
            description="Hatch coaming side plate yield is 미지정; y_control based on top plate only.",
        ))
    else:
        cv.y_control_nmm2 = "미지정"
        flags.append(ManualReviewFlag(
            flag_id="CTRL-Y-04",
            description="Both coaming yield strengths are 미지정; y_control cannot be determined.",
            severity="error",
        ))

    return cv, flags


# ---------------------------------------------------------------------------
# Table 8.2.1 lookup
# ---------------------------------------------------------------------------

def _lookup_table_821(
    rules: RulesExtraction,
    y_control: float,
    t_control: float,
) -> Tuple[Optional[Table821Row], List[ManualReviewFlag]]:
    """Find matching row in Table 8.2.1."""
    flags: List[ManualReviewFlag] = []

    # Map y_control to the nearest category (round up to conservative)
    ys_categories = sorted(set(r.yield_strength_nmm2 for r in rules.table_821))
    matched_ys = None
    for ys in ys_categories:
        if y_control <= ys:
            matched_ys = ys
            break
    if matched_ys is None:
        matched_ys = ys_categories[-1] if ys_categories else None
        flags.append(ManualReviewFlag(
            flag_id="T821-YS-01",
            description=f"y_control={y_control} exceeds max table YS category. Using {matched_ys}.",
        ))

    if matched_ys is None:
        return None, flags

    for row in rules.table_821:
        if row.yield_strength_nmm2 != matched_ys:
            continue
        t_min = row.thickness_min_exclusive
        t_max = row.thickness_max_inclusive
        if t_min is not None and t_max is not None:
            if t_min < t_control <= t_max:
                return row, flags

    flags.append(ManualReviewFlag(
        flag_id="T821-RANGE-01",
        description=f"No matching thickness range for t_control={t_control}, ys={matched_ys}.",
    ))
    return None, flags


def _expand_required_measures(row: Table821Row) -> Set[int]:
    """Extract set of required measure IDs from a Table 8.2.1 row."""
    M: Set[int] = set()
    cell = row.cell
    if cell.m1 == MeasureStatus.required:
        M.add(1)
    if cell.m2 == MeasureStatus.required:
        M.add(2)
    if cell.m3 == MeasureStatus.required:
        M.add(3)
    if cell.m4 == MeasureStatus.required:
        M.add(4)
    if cell.m5 == MeasureStatus.required:
        M.add(5)
    return M


# ---------------------------------------------------------------------------
# Table 8.2.2 lookup (BCA type)
# ---------------------------------------------------------------------------

def _lookup_bca_type(
    rules: RulesExtraction,
    structural_member: str,
    yield_strength: float,
    thickness: float,
) -> str:
    """Look up BCA type from Table 8.2.2."""
    for row in rules.table_822:
        if row.structural_member != structural_member:
            continue
        ys_match = (row.yield_strength_nmm2 == int(yield_strength) or
                    abs(row.yield_strength_nmm2 - yield_strength) < 10)
        t_min = row.thickness_min_exclusive or 0
        t_max = row.thickness_max_inclusive or 999
        if ys_match and t_min < thickness <= t_max:
            return row.bca_type
    return "미지정"


# ---------------------------------------------------------------------------
# Evidence helpers
# ---------------------------------------------------------------------------

def _find_clause_evidence(rules: RulesExtraction, keywords: List[str]) -> List[EvidenceRecord]:
    """Find evidence records from rule clauses matching keywords."""
    evidence: List[EvidenceRecord] = []
    for clause in rules.rule_clauses:
        for kw in keywords:
            if kw.lower() in clause.text.lower():
                ev = EvidenceRecord(
                    raw_text=clause.text[:300],
                    snippet_path="미지정",
                )
                if clause.evidence:
                    ev = clause.evidence[0]
                evidence.append(ev)
                break
    return evidence


def _find_clause_text(rules: RulesExtraction, keywords: List[str]) -> str:
    """Get clause text matching keywords."""
    for clause in rules.rule_clauses:
        for kw in keywords:
            if kw.lower() in clause.text.lower():
                return clause.text
    return "미지정"


# ---------------------------------------------------------------------------
# Measure application functions (append-only, idempotent)
# ---------------------------------------------------------------------------

def _append_measure(
    results: List[AppliedMeasure],
    measure: AppliedMeasure,
) -> List[AppliedMeasure]:
    """Append measure to list, idempotent (no duplicates for same measure_id+target_id)."""
    for existing in results:
        if existing.measure_id == measure.measure_id and existing.target_id == measure.target_id:
            # Merge evidence
            existing_snippets = {e.snippet_path for e in existing.evidence}
            for ev in measure.evidence:
                if ev.snippet_path not in existing_snippets:
                    existing.evidence.append(ev)
            # Merge notes
            for note in measure.notes:
                if note not in existing.notes:
                    existing.notes.append(note)
            return results
    results.append(measure)
    return results


# ---------------------------------------------------------------------------
# Individual Measure application
# ---------------------------------------------------------------------------

def _apply_measure_1(
    project: ProjectInput,
    rules: RulesExtraction,
    mapping: Dict[str, Any],
    results: List[AppliedMeasure],
    flags: List[ManualReviewFlag],
) -> List[AppliedMeasure]:
    """Measure 1: Construction NDE (target=joint)."""
    upper_roles = set(mapping.get("upper_flange_long_member_roles", []))
    cargo_zones = set(mapping.get("cargo_hold_region_zones", ["cargo_hold_region"]))
    butt_types = set(mapping.get("block_to_block_butt_types", ["block_to_block_butt"]))

    member_map = {m.member_id: m for m in project.members}
    evidence = _find_clause_evidence(rules, ["Construction NDE", "UT", "100%", "block-to-block butt"])
    clause_text = _find_clause_text(rules, ["block-to-block butt"])

    for joint in project.joints:
        jt = joint.joint_type
        jzone = joint.zone

        if is_unspecified(jt) or is_unspecified(jzone):
            flags.append(ManualReviewFlag(
                flag_id=f"M1-{joint.joint_id}-UNSPEC",
                target_id=joint.joint_id,
                description=f"Joint {joint.joint_id}: type or zone is 미지정, cannot determine Measure 1 applicability.",
            ))
            results = _append_measure(results, AppliedMeasure(
                measure_id=1,
                status=DecisionStatus.pending_manual_review,
                target_id=joint.joint_id,
                target_type=TargetType.joint,
                requirements=["NDE: UT 100% (pending manual review)"],
                rule_ref=clause_text,
                evidence=evidence,
                notes=["Joint type or zone is 미지정"],
            ))
            continue

        if jt not in butt_types:
            continue
        if jzone not in cargo_zones:
            continue

        # Check connected members are in upper flange category
        connected_upper = False
        for mid in joint.connected_members:
            mem = member_map.get(mid)
            if mem and not is_unspecified(mem.member_role) and mem.member_role in upper_roles:
                connected_upper = True
                break

        if not connected_upper and joint.connected_members:
            # Check if any member role is unknown
            any_unknown = any(
                member_map.get(mid) and (is_unspecified(member_map[mid].member_role) or member_map[mid].member_role == MemberRole.unknown)
                for mid in joint.connected_members
            )
            if any_unknown:
                flags.append(ManualReviewFlag(
                    flag_id=f"M1-{joint.joint_id}-ROLE",
                    target_id=joint.joint_id,
                    description=f"Joint {joint.joint_id}: connected member role unclear, cannot confirm upper flange category.",
                ))
                results = _append_measure(results, AppliedMeasure(
                    measure_id=1,
                    status=DecisionStatus.pending_manual_review,
                    target_id=joint.joint_id,
                    target_type=TargetType.joint,
                    requirements=["NDE: UT 100% (pending – member role unclear)"],
                    rule_ref=clause_text,
                    evidence=evidence,
                ))
            continue

        if connected_upper:
            results = _append_measure(results, AppliedMeasure(
                measure_id=1,
                status=DecisionStatus.applied,
                target_id=joint.joint_id,
                target_type=TargetType.joint,
                requirements=["NDE: UT 100% of block-to-block butt welds"],
                condition_expr=f"zone={jzone} AND joint_type={jt} AND connected_to_upper_flange_member",
                rule_ref=clause_text,
                evidence=evidence,
            ))

    return results


def _apply_measure_3(
    project: ProjectInput,
    rules: RulesExtraction,
    mapping: Dict[str, Any],
    results: List[AppliedMeasure],
    flags: List[ManualReviewFlag],
    cv: ControlValues,
) -> List[AppliedMeasure]:
    """Measure 3: Crack arrest measures (target=member+joint)."""
    option = project.measure3_choice.option
    params = project.measure3_choice.parameters
    member_map = {m.member_id: m for m in project.members}

    # --- Part A: BCA steel for hatch coaming side plate (always required if Measure 3 in scope) ---
    bca_clause = _find_clause_text(rules, ["hatch coaming side plate", "BCA", "brittle crack arrest"])
    bca_evidence = _find_clause_evidence(rules, ["hatch coaming side plate", "BCA"])

    for m in project.members:
        if m.member_role == MemberRole.hatch_coaming_side_plate:
            zone_ok = (m.zone == Zone.cargo_hold_region or is_unspecified(m.zone))
            if not zone_ok:
                continue

            ys = float(m.yield_strength_nmm2) if not is_unspecified(m.yield_strength_nmm2) else None
            thk = float(m.thickness_mm_as_built) if not is_unspecified(m.thickness_mm_as_built) else None

            bca_type = "미지정"
            if ys is not None and thk is not None:
                bca_type = _lookup_bca_type(rules, "hatch_coaming_side_plate", ys, thk)

            results = _append_measure(results, AppliedMeasure(
                measure_id=3,
                status=DecisionStatus.applied,
                target_id=m.member_id,
                target_type=TargetType.member,
                requirements=[
                    f"Provide brittle crack arrest (BCA) steel – type: {bca_type}",
                    "Per Table 8.2.2 for hatch coaming side plate",
                ],
                condition_expr="Measure 3 required AND role=hatch_coaming_side_plate",
                rule_ref=bca_clause,
                evidence=bca_evidence,
            ))

    # --- Part B: Option-specific measures ---
    if is_unspecified(option):
        # Option not selected – mark pending
        flags.append(ManualReviewFlag(
            flag_id="M3-OPT-UNSPEC",
            description="Measure 3 option is 미지정. User must select one of: "
                        "block_shift, crack_arrest_hole, crack_arrest_insert, enhanced_NDE.",
        ))
        # Apply pending to relevant joints
        for joint in project.joints:
            if joint.joint_type == JointType.block_to_block_butt:
                results = _append_measure(results, AppliedMeasure(
                    measure_id=3,
                    status=DecisionStatus.pending_manual_choice,
                    target_id=joint.joint_id,
                    target_type=TargetType.joint,
                    requirements=[
                        "Measure 3 option not selected. Choose: block_shift / crack_arrest_hole / crack_arrest_insert / enhanced_NDE"
                    ],
                    notes=["Available options listed for user selection"],
                ))
        return results

    if option == Measure3Option.block_shift:
        return _apply_m3_block_shift(project, rules, mapping, params, results, flags)
    elif option == Measure3Option.crack_arrest_hole:
        return _apply_m3_crack_arrest_hole(project, rules, mapping, params, results, flags)
    elif option == Measure3Option.crack_arrest_insert:
        return _apply_m3_crack_arrest_insert(project, rules, mapping, params, results, flags)
    elif option == Measure3Option.enhanced_NDE:
        return _apply_m3_enhanced_nde(project, rules, mapping, params, results, flags)

    return results


def _apply_m3_block_shift(
    project, rules, mapping, params, results, flags,
) -> List[AppliedMeasure]:
    """Measure 3 – block shift option."""
    min_offset = mapping.get("block_shift_min_offset_mm", 300)
    clause_text = _find_clause_text(rules, ["block shift", "stagger", "300 mm"])
    evidence = _find_clause_evidence(rules, ["block shift", "stagger", "300 mm"])

    offset_val = params.block_shift_offset_mm
    if is_unspecified(offset_val):
        # No offset data provided
        for joint in project.joints:
            if joint.joint_type == JointType.block_to_block_butt:
                results = _append_measure(results, AppliedMeasure(
                    measure_id=3,
                    status=DecisionStatus.pending_manual_review,
                    target_id=joint.joint_id,
                    target_type=TargetType.joint,
                    requirements=[
                        f"Block shift: offset >= {min_offset} mm required (offset value 미지정)",
                    ],
                    rule_ref=clause_text,
                    evidence=evidence,
                    notes=["block_shift_offset_mm is 미지정; cannot verify compliance"],
                ))
        flags.append(ManualReviewFlag(
            flag_id="M3-BS-OFFSET",
            description=f"block_shift_offset_mm is 미지정. Must verify offset >= {min_offset} mm.",
        ))
    else:
        offset_f = float(offset_val)
        pass_fail = "PASS" if offset_f >= min_offset else "FAIL"
        for joint in project.joints:
            if joint.joint_type == JointType.block_to_block_butt:
                status = DecisionStatus.applied if pass_fail == "PASS" else DecisionStatus.applied
                reqs = [
                    f"Block shift offset = {offset_f} mm (required >= {min_offset} mm): {pass_fail}",
                ]
                notes = []
                if pass_fail == "FAIL":
                    notes.append(f"NONCOMPLIANCE: offset {offset_f} mm < required {min_offset} mm")
                    flags.append(ManualReviewFlag(
                        flag_id=f"M3-BS-FAIL-{joint.joint_id}",
                        target_id=joint.joint_id,
                        description=f"Block shift offset {offset_f} mm < {min_offset} mm at joint {joint.joint_id}.",
                        severity="error",
                    ))
                results = _append_measure(results, AppliedMeasure(
                    measure_id=3,
                    status=status,
                    target_id=joint.joint_id,
                    target_type=TargetType.joint,
                    requirements=reqs,
                    condition_expr=f"offset={offset_f}mm >= {min_offset}mm -> {pass_fail}",
                    rule_ref=clause_text,
                    evidence=evidence,
                    notes=notes,
                ))

    return results


def _apply_m3_crack_arrest_hole(project, rules, mapping, params, results, flags):
    """Measure 3 – crack arrest hole option."""
    clause_text = _find_clause_text(rules, ["crack arrest hole", "fatigue"])
    evidence = _find_clause_evidence(rules, ["crack arrest hole", "fatigue"])

    for joint in project.joints:
        if joint.joint_type == JointType.block_to_block_butt:
            hole_dia = params.hole_diameter_mm
            reqs = [
                f"Crack arrest hole fitted (diameter: {hole_dia} mm)",
                "Fatigue strength at hole corners and intersections: special assessment REQUIRED",
            ]
            results = _append_measure(results, AppliedMeasure(
                measure_id=3,
                status=DecisionStatus.applied,
                target_id=joint.joint_id,
                target_type=TargetType.joint,
                requirements=reqs,
                rule_ref=clause_text,
                evidence=evidence,
            ))

    return results


def _apply_m3_crack_arrest_insert(project, rules, mapping, params, results, flags):
    """Measure 3 – crack arrest insert option."""
    insert_type = params.insert_type
    for joint in project.joints:
        if joint.joint_type == JointType.block_to_block_butt:
            results = _append_measure(results, AppliedMeasure(
                measure_id=3,
                status=DecisionStatus.applied,
                target_id=joint.joint_id,
                target_type=TargetType.joint,
                requirements=[
                    f"Crack arrest insert applied (type: {insert_type})",
                    "Insert plate or weld metal insert as per approved design",
                ],
            ))
    return results


def _apply_m3_enhanced_nde(project, rules, mapping, params, results, flags):
    """Measure 3 – enhanced NDE option."""
    ctod_min = mapping.get("ctod_min_mm", 0.18)
    egw_ok = mapping.get("egw_permitted_with_enhanced_nde", False)
    clause_text = _find_clause_text(rules, ["enhanced NDE", "CTOD", "EGW"])
    evidence = _find_clause_evidence(rules, ["enhanced NDE", "CTOD", "EGW"])

    nde_method = params.enhanced_nde_method
    criteria_ref = params.enhanced_nde_acceptance_criteria_ref

    for joint in project.joints:
        if joint.joint_type == JointType.block_to_block_butt:
            reqs = [
                f"Enhanced NDE method: {nde_method}",
                "Stricter acceptance criteria per ShipRight procedure apply",
                f"CTOD >= {ctod_min} mm required",
                "Electrogas welding (EGW) is NOT permitted",
            ]
            notes = []
            status = DecisionStatus.applied

            if is_unspecified(criteria_ref):
                status = DecisionStatus.conditional
                notes.append("enhanced_nde_acceptance_criteria_ref is 미지정; requires ShipRight document")
                flags.append(ManualReviewFlag(
                    flag_id=f"M3-ENDE-REF-{joint.joint_id}",
                    target_id=joint.joint_id,
                    description="Enhanced NDE acceptance criteria reference is 미지정. Provide ShipRight document.",
                ))

            # Check EGW noncompliance
            if joint.weld_process == WeldProcess.EGW and not egw_ok:
                notes.append("NONCOMPLIANCE: EGW process used but NOT permitted with enhanced NDE")
                flags.append(ManualReviewFlag(
                    flag_id=f"M3-EGW-{joint.joint_id}",
                    target_id=joint.joint_id,
                    description=f"EGW not permitted at joint {joint.joint_id} when enhanced NDE is selected.",
                    severity="error",
                ))

            results = _append_measure(results, AppliedMeasure(
                measure_id=3,
                status=status,
                target_id=joint.joint_id,
                target_type=TargetType.joint,
                requirements=reqs,
                condition_expr=f"enhanced_NDE; CTOD>={ctod_min}; EGW_permitted={egw_ok}",
                rule_ref=clause_text,
                evidence=evidence,
                notes=notes,
            ))

    return results


def _apply_measure_4(
    project, rules, mapping, results, flags, cv,
) -> List[AppliedMeasure]:
    """Measure 4: Upper deck BCA steel (target=member)."""
    clause_text = _find_clause_text(rules, ["upper deck", "BCA"])
    evidence = _find_clause_evidence(rules, ["upper deck", "BCA"])

    for m in project.members:
        if m.member_role != MemberRole.upper_deck_plate:
            continue
        if not is_unspecified(m.zone) and m.zone != Zone.cargo_hold_region:
            continue

        ys = float(m.yield_strength_nmm2) if not is_unspecified(m.yield_strength_nmm2) else None
        thk = float(m.thickness_mm_as_built) if not is_unspecified(m.thickness_mm_as_built) else None

        bca_type = "미지정"
        if ys is not None and thk is not None:
            bca_type = _lookup_bca_type(rules, "upper_deck_plate", ys, thk)

        results = _append_measure(results, AppliedMeasure(
            measure_id=4,
            status=DecisionStatus.applied,
            target_id=m.member_id,
            target_type=TargetType.member,
            requirements=[
                f"Provide BCA steel – type: {bca_type}",
                "Per Table 8.2.2 for upper deck plate in cargo hold region",
            ],
            condition_expr="Measure 4 required AND role=upper_deck_plate AND zone=cargo_hold_region",
            rule_ref=clause_text,
            evidence=evidence,
        ))

    return results


def _apply_measure_5(
    project, rules, mapping, results, flags, cv,
) -> List[AppliedMeasure]:
    """Measure 5: Upper deck BCA steel extended (target=member)."""
    clause_text = _find_clause_text(rules, ["upper deck", "BCA"])
    evidence = _find_clause_evidence(rules, ["upper deck", "BCA"])

    for m in project.members:
        if m.member_role != MemberRole.upper_deck_plate:
            continue
        if not is_unspecified(m.zone) and m.zone != Zone.cargo_hold_region:
            continue

        ys = float(m.yield_strength_nmm2) if not is_unspecified(m.yield_strength_nmm2) else None
        thk = float(m.thickness_mm_as_built) if not is_unspecified(m.thickness_mm_as_built) else None

        bca_type = "미지정"
        if ys is not None and thk is not None:
            bca_type = _lookup_bca_type(rules, "upper_deck_plate", ys, thk)

        results = _append_measure(results, AppliedMeasure(
            measure_id=5,
            status=DecisionStatus.applied,
            target_id=m.member_id,
            target_type=TargetType.member,
            requirements=[
                f"Provide BCA steel (Measure 5) – type: {bca_type}",
                "Per Table 8.2.2 for upper deck plate (extended range, separate traceability)",
            ],
            condition_expr="Measure 5 required AND role=upper_deck_plate AND zone=cargo_hold_region",
            rule_ref=clause_text,
            evidence=evidence,
        ))

    return results


def _apply_measure_2(
    project, rules, mapping, results, flags, cv, row,
) -> List[AppliedMeasure]:
    """
    Measure 2: Periodic in-service NDE (target=joint, conditional).
    Only when table says see_note_2 AND measure3_choice.option == enhanced_NDE.
    """
    if row is None:
        return results

    cell = row.cell
    if cell.m2 != MeasureStatus.see_note_2:
        return results

    if project.measure3_choice.option != Measure3Option.enhanced_NDE:
        return results

    clause_text = _find_clause_text(rules, ["Note 2", "enhanced NDE", "Measure 2", "periodic"])
    evidence = _find_clause_evidence(rules, ["Note 2", "Measure 2", "periodic"])

    for joint in project.joints:
        if joint.joint_type == JointType.block_to_block_butt:
            results = _append_measure(results, AppliedMeasure(
                measure_id=2,
                status=DecisionStatus.conditional,
                target_id=joint.joint_id,
                target_type=TargetType.joint,
                requirements=[
                    "Periodic in-service NDE required",
                    "Frequency and extent to be agreed with LR",
                ],
                condition_expr="Table 8.2.1 see_note_2 AND measure3_choice.option==enhanced_NDE",
                rule_ref=clause_text,
                evidence=evidence,
                notes=["Conditional per Note 2"],
            ))

    return results


def _apply_weld_detail_rules(
    project, rules, mapping, results, flags,
) -> List[AppliedMeasure]:
    """Always-applicable welding detail rules (PJP, EGW check)."""
    pjp_clause = _find_clause_text(rules, ["PJP", "partial joint penetration", "coaming"])
    pjp_evidence = _find_clause_evidence(rules, ["PJP", "partial joint penetration"])

    for joint in project.joints:
        # PJP for coaming-to-deck connection
        if joint.joint_type == JointType.coaming_to_deck_connection:
            results = _append_measure(results, AppliedMeasure(
                measure_id=0,  # Not a numbered measure, but a weld detail rule
                status=DecisionStatus.applied,
                target_id=joint.joint_id,
                target_type=TargetType.joint,
                requirements=[
                    "LR-approved partial joint penetration (PJP) welding REQUIRED",
                ],
                condition_expr="joint_type=coaming_to_deck_connection",
                rule_ref=pjp_clause,
                evidence=pjp_evidence,
                notes=["Welding detail rule – always applicable for coaming-to-deck connections"],
            ))

        # EGW check when enhanced NDE is in the required set
        if joint.weld_process == WeldProcess.EGW:
            # Check if enhanced NDE is required for this joint
            has_enhanced_nde = any(
                am.measure_id == 3 and am.target_id == joint.joint_id
                and "enhanced NDE" in str(am.requirements).lower()
                for am in results
            )
            if has_enhanced_nde:
                flags.append(ManualReviewFlag(
                    flag_id=f"EGW-NC-{joint.joint_id}",
                    target_id=joint.joint_id,
                    description=f"EGW not permitted at joint {joint.joint_id} where enhanced NDE is required.",
                    severity="error",
                ))

    return results


# ---------------------------------------------------------------------------
# Special consideration (t > 100mm)
# ---------------------------------------------------------------------------

def _check_special_consideration(
    project: ProjectInput,
    rules: RulesExtraction,
    flags: List[ManualReviewFlag],
) -> None:
    threshold = rules.special_consideration_threshold_mm
    for m in project.members:
        if not is_unspecified(m.thickness_mm_as_built):
            if float(m.thickness_mm_as_built) > threshold:
                flags.append(ManualReviewFlag(
                    flag_id=f"SPECIAL-{m.member_id}",
                    target_id=m.member_id,
                    description=f"Member {m.member_id} thickness {m.thickness_mm_as_built} mm > {threshold} mm. "
                                f"Special consideration required per LR rules.",
                    severity="warning",
                ))


# ---------------------------------------------------------------------------
# Main decision function
# ---------------------------------------------------------------------------

def run_decision(
    project: ProjectInput,
    rules: RulesExtraction,
    mapping_path: str = "configs/mapping_rules.json",
) -> DecisionResults:
    """Run the full decision engine and produce DecisionResults."""
    mapping = _load_mapping_rules(mapping_path)
    results_list: List[AppliedMeasure] = []
    all_flags: List[ManualReviewFlag] = []

    # 1. Derive control values
    cv, cv_flags = _derive_control_values(project, mapping)
    all_flags.extend(cv_flags)

    # 2. Table 8.2.1 lookup
    row: Optional[Table821Row] = None
    if not is_unspecified(cv.y_control_nmm2) and not is_unspecified(cv.t_control_mm):
        row, lookup_flags = _lookup_table_821(rules, float(cv.y_control_nmm2), float(cv.t_control_mm))
        all_flags.extend(lookup_flags)

    M: Set[int] = set()
    if row is not None:
        M = _expand_required_measures(row)
        cv.required_measures_global = sorted(M)
        cv.table_821_row_used = f"YS={row.yield_strength_nmm2}, range={row.thickness_range}"
    else:
        cv.required_measures_global = []
        if not is_unspecified(cv.y_control_nmm2) and not is_unspecified(cv.t_control_mm):
            all_flags.append(ManualReviewFlag(
                flag_id="T821-NO-MATCH",
                description="No matching row in Table 8.2.1 for derived control values.",
            ))

    cv.manual_review_flags = all_flags[:]

    # 3. Apply measures in order (cumulative)
    if 1 in M:
        results_list = _apply_measure_1(project, rules, mapping, results_list, all_flags)

    if 3 in M:
        results_list = _apply_measure_3(project, rules, mapping, results_list, all_flags, cv)

    if 4 in M:
        results_list = _apply_measure_4(project, rules, mapping, results_list, all_flags, cv)

    if 5 in M:
        results_list = _apply_measure_5(project, rules, mapping, results_list, all_flags, cv)

    # Measure 2 – conditional (note 2 logic)
    _apply_measure_2(project, rules, mapping, results_list, all_flags, cv, row)

    # Always-applicable weld detail rules
    _apply_weld_detail_rules(project, rules, mapping, results_list, all_flags)

    # Special consideration
    _check_special_consideration(project, rules, all_flags)

    # Sort applied measures by (target_id, measure_id)
    results_list.sort(key=lambda am: (am.target_id, am.measure_id))

    # Build summary
    summary = _build_summary(project, cv, results_list, all_flags)

    dr = DecisionResults(
        project_id=project.project_meta.project_id,
        control_values=cv,
        applied_measures=results_list,
        manual_review_flags=all_flags,
        summary=summary,
    )

    return dr


def _build_summary(
    project: ProjectInput,
    cv: ControlValues,
    results: List[AppliedMeasure],
    flags: List[ManualReviewFlag],
) -> Dict[str, Any]:
    """Build a human-readable summary dict."""
    member_measures: Dict[str, List[int]] = {}
    joint_measures: Dict[str, List[int]] = {}

    for am in results:
        if am.target_type == TargetType.member:
            member_measures.setdefault(am.target_id, [])
            if am.measure_id not in member_measures[am.target_id]:
                member_measures[am.target_id].append(am.measure_id)
        else:
            joint_measures.setdefault(am.target_id, [])
            if am.measure_id not in joint_measures[am.target_id]:
                joint_measures[am.target_id].append(am.measure_id)

    return {
        "t_control_mm": cv.t_control_mm,
        "y_control_nmm2": cv.y_control_nmm2,
        "required_measures_global": cv.required_measures_global,
        "table_821_row": cv.table_821_row_used,
        "member_applied_measures": member_measures,
        "joint_applied_measures": joint_measures,
        "total_applied": len(results),
        "manual_review_count": len(flags),
        "flags_summary": [f.description for f in flags],
    }
