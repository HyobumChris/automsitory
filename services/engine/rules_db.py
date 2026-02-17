"""
Pydantic schemas for:
  - Input project JSON
  - Rules extraction DB (Table 8.2.1 / 8.2.2)
  - Decision results
  - Evidence records
"""
from __future__ import annotations

import json
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, Field, model_validator


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

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
    unspecified = "미지정"


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
    unspecified = "미지정"


class Measure3Option(str, Enum):
    block_shift = "block_shift"
    crack_arrest_hole = "crack_arrest_hole"
    crack_arrest_insert = "crack_arrest_insert"
    enhanced_NDE = "enhanced_NDE"
    unspecified = "미지정"


class MeasureStatus(str, Enum):
    required = "required"
    not_required = "not_required"
    see_note_2 = "see_note_2"


class DecisionStatus(str, Enum):
    applied = "applied"
    conditional = "conditional"
    pending_manual_choice = "pending_manual_choice"
    pending_manual_review = "pending_manual_review"
    not_applicable = "not_applicable"


class TargetType(str, Enum):
    member = "member"
    joint = "joint"


# ---------------------------------------------------------------------------
# Helper: allow "미지정" or actual value
# ---------------------------------------------------------------------------
Unspecified = Literal["미지정"]
StrOrUnspec = Union[str, Unspecified]
IntOrUnspec = Union[int, Unspecified]
FloatOrUnspec = Union[float, Unspecified]
NumOrUnspec = Union[int, float, Unspecified]


def is_unspecified(v: Any) -> bool:
    return v == "미지정" or v is None


# ---------------------------------------------------------------------------
# Input JSON models
# ---------------------------------------------------------------------------

class ProjectMeta(BaseModel):
    project_id: str
    vessel_name: StrOrUnspec = "미지정"
    date_local: str
    timezone: str = "Asia/Seoul"
    allow_web_fetch: bool = False


class SourceFile(BaseModel):
    path: str
    label: str = ""
    page_hint: Union[int, Unspecified] = "미지정"
    present: Optional[bool] = None


class Sources(BaseModel):
    scanned_rule_files: List[SourceFile] = []
    diagram_files: List[SourceFile] = []
    optional_shipright_files: List[SourceFile] = []


class MemberInput(BaseModel):
    member_id: str
    member_role: Union[MemberRole, Unspecified] = "미지정"
    zone: Union[Zone, Unspecified] = "미지정"
    yield_strength_nmm2: NumOrUnspec = "미지정"
    grade: StrOrUnspec = "미지정"
    thickness_mm_as_built: NumOrUnspec = "미지정"
    geometry_ref: StrOrUnspec = "미지정"


class JointGeom(BaseModel):
    type: StrOrUnspec = "미지정"
    data: Any = "미지정"


class JointInput(BaseModel):
    joint_id: str
    joint_type: Union[JointType, Unspecified] = "미지정"
    zone: Union[Zone, Unspecified] = "미지정"
    connected_members: List[str] = []
    weld_process: Union[WeldProcess, Unspecified] = "미지정"
    geom: JointGeom = JointGeom()
    related_joint_ids: List[str] = []
    notes: StrOrUnspec = "미지정"


class Measure3Parameters(BaseModel):
    block_shift_offset_mm: NumOrUnspec = "미지정"
    hole_diameter_mm: NumOrUnspec = "미지정"
    insert_type: StrOrUnspec = "미지정"
    enhanced_nde_method: StrOrUnspec = "미지정"
    enhanced_nde_acceptance_criteria_ref: StrOrUnspec = "미지정"


class Measure3Choice(BaseModel):
    option: Union[Measure3Option, Unspecified] = "미지정"
    parameters: Measure3Parameters = Measure3Parameters()


class HatchOpeningBbox(BaseModel):
    L: NumOrUnspec = "미지정"
    B: NumOrUnspec = "미지정"
    H: NumOrUnspec = "미지정"


class VisualizationInputs(BaseModel):
    output_dir: str = "outputs/demo"
    hatch_opening_bbox: Union[HatchOpeningBbox, Unspecified] = "미지정"


class ProjectInput(BaseModel):
    project_meta: ProjectMeta
    sources: Sources = Sources()
    members: List[MemberInput] = []
    joints: List[JointInput] = []
    measure3_choice: Measure3Choice = Measure3Choice()
    visualization_inputs: VisualizationInputs = VisualizationInputs()


# ---------------------------------------------------------------------------
# Rules Extraction DB models (from scan / OCR)
# ---------------------------------------------------------------------------

class EvidenceRecord(BaseModel):
    scan_file: StrOrUnspec = "미지정"
    page_index: Union[int, Unspecified] = "미지정"
    bbox: Optional[List[float]] = None  # [x1,y1,x2,y2] or null
    ocr_confidence: Optional[float] = None  # 0~1
    snippet_path: StrOrUnspec = "미지정"
    raw_text: StrOrUnspec = "미지정"


class Table821Cell(BaseModel):
    m1: MeasureStatus = MeasureStatus.not_required
    m2: MeasureStatus = MeasureStatus.not_required
    m3: MeasureStatus = MeasureStatus.not_required
    m4: MeasureStatus = MeasureStatus.not_required
    m5: MeasureStatus = MeasureStatus.not_required
    notes: List[str] = []
    evidence: List[EvidenceRecord] = []


class Table821Row(BaseModel):
    yield_strength_nmm2: int
    thickness_range: str  # e.g. "50<t<=85"
    thickness_min_exclusive: Optional[float] = None
    thickness_max_inclusive: Optional[float] = None
    cell: Table821Cell


class Table822Row(BaseModel):
    structural_member: str  # e.g. "upper_deck_plate", "hatch_coaming_side_plate"
    yield_strength_nmm2: int
    thickness_range: str
    thickness_min_exclusive: Optional[float] = None
    thickness_max_inclusive: Optional[float] = None
    bca_type: StrOrUnspec = "미지정"  # e.g. "BCA1", "BCA2"
    evidence: List[EvidenceRecord] = []


class MeasureDefinition(BaseModel):
    measure_id: int
    name: str
    target_type: str  # "member" / "joint" / "member+joint"
    description: str = ""
    evidence: List[EvidenceRecord] = []


class RuleClause(BaseModel):
    clause_id: str
    text: str
    keywords: List[str] = []
    evidence: List[EvidenceRecord] = []


class RulesExtraction(BaseModel):
    extraction_date: str = ""
    source_files: List[str] = []
    table_821: List[Table821Row] = []
    table_822: List[Table822Row] = []
    measure_definitions: List[MeasureDefinition] = []
    rule_clauses: List[RuleClause] = []
    special_consideration_threshold_mm: float = 100.0
    manual_review_flags: List[str] = []


# ---------------------------------------------------------------------------
# Decision Results models
# ---------------------------------------------------------------------------

class AppliedMeasure(BaseModel):
    measure_id: int
    status: DecisionStatus
    target_id: str  # member_id or joint_id
    target_type: TargetType
    requirements: List[str] = []
    condition_expr: StrOrUnspec = "미지정"
    rule_ref: StrOrUnspec = "미지정"
    evidence: List[EvidenceRecord] = []
    notes: List[str] = []


class ManualReviewFlag(BaseModel):
    flag_id: str
    target_id: StrOrUnspec = "미지정"
    description: str
    severity: str = "warning"  # warning / error / info


class ControlValues(BaseModel):
    t_control_mm: NumOrUnspec = "미지정"
    y_control_nmm2: NumOrUnspec = "미지정"
    required_measures_global: List[int] = []
    table_821_row_used: StrOrUnspec = "미지정"
    manual_review_flags: List[ManualReviewFlag] = []


class DecisionResults(BaseModel):
    project_id: str
    control_values: ControlValues = ControlValues()
    applied_measures: List[AppliedMeasure] = []
    manual_review_flags: List[ManualReviewFlag] = []
    summary: Dict[str, Any] = {}


# ---------------------------------------------------------------------------
# I/O helpers
# ---------------------------------------------------------------------------

def load_project_input(path: Union[str, Path]) -> ProjectInput:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return ProjectInput(**data)


def load_rules_extraction(path: Union[str, Path]) -> RulesExtraction:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return RulesExtraction(**data)


def save_json(obj: BaseModel, path: Union[str, Path]) -> None:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        f.write(obj.model_dump_json(indent=2))


def save_dict_json(data: dict, path: Union[str, Path]) -> None:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False, default=str)
