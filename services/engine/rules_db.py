"""
rules_db.py – Pydantic models for LR Rules extraction DB, project input, and decision results.

All "미지정" values are represented as the literal string "미지정" throughout.
"""
from __future__ import annotations

import json
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, Field, model_validator


UNSPECIFIED = "미지정"


# ── Enums ────────────────────────────────────────────────────────────────────

class MemberRole(str, Enum):
    upper_deck_plate = "upper_deck_plate"
    hatch_coaming_side_plate = "hatch_coaming_side_plate"
    hatch_coaming_top_plate = "hatch_coaming_top_plate"
    attached_longitudinal = "attached_longitudinal"
    other = "other"
    unknown = "unknown"


class Zone(str, Enum):
    cargo_hold_region = "cargo_hold_region"
    outside_cargo_hold = "outside_cargo_hold"
    unspecified = UNSPECIFIED


class JointType(str, Enum):
    block_to_block_butt = "block_to_block_butt"
    coaming_to_deck_connection = "coaming_to_deck_connection"
    attachment_weld = "attachment_weld"
    other = "other"


class WeldProcess(str, Enum):
    FCAW = "FCAW"
    GMAW = "GMAW"
    EGW = "EGW"
    SAW = "SAW"
    SMAW = "SMAW"
    unspecified = UNSPECIFIED


class Measure3Option(str, Enum):
    block_shift = "block_shift"
    crack_arrest_hole = "crack_arrest_hole"
    crack_arrest_insert = "crack_arrest_insert"
    enhanced_NDE = "enhanced_NDE"
    unspecified = UNSPECIFIED


class MeasureStatus(str, Enum):
    required = "required"
    not_required = "not_required"
    see_note_2 = "see_note_2"


class AppliedStatus(str, Enum):
    applied = "applied"
    conditional = "conditional"
    pending_manual_choice = "pending_manual_choice"
    pending_manual_review = "pending_manual_review"
    not_applied = "not_applied"
    noncompliant = "noncompliant"


class TargetType(str, Enum):
    member = "member"
    joint = "joint"


# ── Evidence ─────────────────────────────────────────────────────────────────

class EvidenceRef(BaseModel):
    scan_file: str = UNSPECIFIED
    page_index: Optional[int] = None
    bbox: Optional[List[float]] = None  # [x1,y1,x2,y2]
    ocr_confidence: Optional[float] = None
    snippet_path: Optional[str] = None


# ── Rules Extraction DB ──────────────────────────────────────────────────────

class Table821Row(BaseModel):
    yield_strength_nmm2: int
    thickness_range: str
    t_min: float
    t_max: float
    m1: MeasureStatus
    m2: MeasureStatus
    m3: MeasureStatus
    m4: MeasureStatus
    m5: MeasureStatus
    notes: List[str] = []
    evidence: EvidenceRef = EvidenceRef()


class Table822Row(BaseModel):
    structural_member: str
    condition: str
    yield_strength_nmm2: int
    thickness_range: str
    bca_type: str
    evidence: EvidenceRef = EvidenceRef()


class RegulationText(BaseModel):
    text: str
    evidence: EvidenceRef = EvidenceRef()


class RulesExtraction(BaseModel):
    model_config = {"extra": "allow"}
    _meta: Dict[str, Any] = {}
    table_8_2_1: Dict[str, Any] = {}
    table_8_2_2: Dict[str, Any] = {}
    regulation_texts: Dict[str, RegulationText] = {}


class RulesExtractionDB:
    """Accessor for rules_extraction.json (or fallback)."""

    def __init__(self, data: dict):
        self.raw = data
        self._rows_821: List[Table821Row] = []
        self._rows_822: List[Table822Row] = []
        self._reg_texts: Dict[str, RegulationText] = {}
        self._manual_review_flags: List[str] = list(
            data.get("_meta", {}).get("manual_review_flags", [])
        )
        self._parse()

    def _parse(self):
        for row_dict in self.raw.get("table_8_2_1", {}).get("rows", []):
            self._rows_821.append(Table821Row(**row_dict))
        for row_dict in self.raw.get("table_8_2_2", {}).get("rows", []):
            self._rows_822.append(Table822Row(**row_dict))
        for key, val in self.raw.get("regulation_texts", {}).items():
            self._reg_texts[key] = RegulationText(**val)

    @property
    def manual_review_flags(self) -> List[str]:
        return self._manual_review_flags

    def lookup_821(self, yield_strength: int, thickness: float) -> Optional[Table821Row]:
        """Find matching Table 8.2.1 row for given yield strength and thickness."""
        for row in self._rows_821:
            if row.yield_strength_nmm2 == yield_strength:
                if row.t_min < thickness <= row.t_max:
                    return row
        return None

    def lookup_822(self, structural_member: str, yield_strength: int, thickness: float) -> Optional[Table822Row]:
        """Find matching Table 8.2.2 row for BCA type."""
        for row in self._rows_822:
            if (
                row.structural_member == structural_member
                and row.yield_strength_nmm2 == yield_strength
            ):
                parts = row.thickness_range.replace(" ", "")
                t_min = float(parts.split("<t<=")[0].replace("<", ""))
                t_max = float(parts.split("<t<=")[1])
                if t_min < thickness <= t_max:
                    return row
        return None

    def get_regulation_text(self, key: str) -> Optional[RegulationText]:
        return self._reg_texts.get(key)

    @classmethod
    def load(cls, path: Union[str, Path]) -> "RulesExtractionDB":
        with open(path, "r", encoding="utf-8") as f:
            return cls(json.load(f))


# ── Project Input Models ─────────────────────────────────────────────────────

class ProjectMeta(BaseModel):
    project_id: str
    vessel_name: str = UNSPECIFIED
    date_local: str = UNSPECIFIED
    timezone: str = "Asia/Seoul"
    allow_web_fetch: bool = False


class SourceFile(BaseModel):
    path: str
    label: str = ""
    page_hint: Any = UNSPECIFIED
    present: Optional[bool] = None


class Sources(BaseModel):
    scanned_rule_files: List[SourceFile] = []
    diagram_files: List[SourceFile] = []
    optional_shipright_files: List[SourceFile] = []


class GeomData(BaseModel):
    model_config = {"extra": "allow"}
    type: str = UNSPECIFIED
    data: Any = UNSPECIFIED


class MemberInput(BaseModel):
    member_id: str
    member_role: str = "unknown"
    zone: str = UNSPECIFIED
    yield_strength_nmm2: Any = UNSPECIFIED
    grade: str = UNSPECIFIED
    thickness_mm_as_built: Any = UNSPECIFIED
    geometry_ref: str = UNSPECIFIED


class JointInput(BaseModel):
    joint_id: str
    joint_type: str = "other"
    zone: str = UNSPECIFIED
    connected_members: List[str] = []
    weld_process: str = UNSPECIFIED
    geom: GeomData = GeomData()
    related_joint_ids: List[str] = []
    notes: str = UNSPECIFIED


class Measure3Parameters(BaseModel):
    model_config = {"extra": "allow"}
    block_shift_offset_mm: Any = UNSPECIFIED
    hole_diameter_mm: Any = UNSPECIFIED
    insert_type: str = UNSPECIFIED
    enhanced_nde_method: str = UNSPECIFIED
    enhanced_nde_acceptance_criteria_ref: str = UNSPECIFIED


class Measure3Choice(BaseModel):
    option: str = UNSPECIFIED
    parameters: Measure3Parameters = Measure3Parameters()


class HatchBBox(BaseModel):
    L: float = 0
    B: float = 0
    H: float = 0


class VisualizationInputs(BaseModel):
    output_dir: str = "outputs/demo"
    hatch_opening_bbox: Any = UNSPECIFIED

    def get_bbox(self) -> Optional[HatchBBox]:
        if isinstance(self.hatch_opening_bbox, dict):
            return HatchBBox(**self.hatch_opening_bbox)
        return None


class ProjectInput(BaseModel):
    model_config = {"extra": "allow"}
    project_meta: ProjectMeta
    sources: Sources = Sources()
    members: List[MemberInput] = []
    joints: List[JointInput] = []
    measure3_choice: Measure3Choice = Measure3Choice()
    visualization_inputs: VisualizationInputs = VisualizationInputs()


# ── Decision Result Models ───────────────────────────────────────────────────

class Requirement(BaseModel):
    description: str
    rule_ref: str = UNSPECIFIED
    evidence: EvidenceRef = EvidenceRef()


class AppliedMeasure(BaseModel):
    measure_id: int
    status: str  # AppliedStatus value
    target_type: str  # "member" or "joint"
    target_id: str
    requirements: List[Requirement] = []
    condition_expr: str = ""
    rule_basis: str = ""
    evidence: List[EvidenceRef] = []
    notes: List[str] = []


class TargetResult(BaseModel):
    target_type: str  # "member" or "joint"
    target_id: str
    applied_measures: List[AppliedMeasure] = []

    def add_measure(self, measure: AppliedMeasure):
        """Append-only, idempotent: same measure_id on same target kept once."""
        for existing in self.applied_measures:
            if existing.measure_id == measure.measure_id:
                for ev in measure.evidence:
                    if ev not in existing.evidence:
                        existing.evidence.append(ev)
                for note in measure.notes:
                    if note not in existing.notes:
                        existing.notes.append(note)
                return
        self.applied_measures.append(measure)
        self.applied_measures.sort(key=lambda m: m.measure_id)


class ControlValues(BaseModel):
    t_control: Any = UNSPECIFIED
    y_control: Any = UNSPECIFIED
    side_thickness: Any = UNSPECIFIED
    top_thickness: Any = UNSPECIFIED
    side_yield: Any = UNSPECIFIED
    top_yield: Any = UNSPECIFIED


class DecisionResults(BaseModel):
    project_id: str
    control_values: ControlValues = ControlValues()
    required_measures_global: List[int] = []
    table_821_row_used: Optional[dict] = None
    special_consideration: bool = False
    member_results: Dict[str, TargetResult] = {}
    joint_results: Dict[str, TargetResult] = {}
    manual_review_flags: List[str] = []
    noncompliance_flags: List[str] = []

    def get_or_create_member(self, member_id: str) -> TargetResult:
        if member_id not in self.member_results:
            self.member_results[member_id] = TargetResult(
                target_type="member", target_id=member_id
            )
        return self.member_results[member_id]

    def get_or_create_joint(self, joint_id: str) -> TargetResult:
        if joint_id not in self.joint_results:
            self.joint_results[joint_id] = TargetResult(
                target_type="joint", target_id=joint_id
            )
        return self.joint_results[joint_id]

    def to_dict(self) -> dict:
        return json.loads(self.model_dump_json())
