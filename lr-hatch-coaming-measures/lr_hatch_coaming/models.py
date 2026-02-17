"""Pydantic data models for the LR Hatch Coaming Measures system.

All physical quantities carry explicit units in field names (mm, N/mm²).
'미지정' is the canonical sentinel for unspecified/unknown values.
"""

from __future__ import annotations

import datetime
from enum import Enum
from typing import Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, Field, model_validator


# ── Sentinel ────────────────────────────────────────────────────────────────
UNSPECIFIED: str = "미지정"


# ── Enums ───────────────────────────────────────────────────────────────────
class MemberRole(str, Enum):
    upper_deck_plate = "upper_deck_plate"
    hatch_coaming_side_plate = "hatch_coaming_side_plate"
    hatch_coaming_top_plate = "hatch_coaming_top_plate"
    attached_longitudinal = "attached_longitudinal"
    other = "other"
    unknown = "unknown"


class JointType(str, Enum):
    block_to_block_butt = "block_to_block_butt"
    coaming_to_deck_connection = "coaming_to_deck_connection"
    attachment_weld = "attachment_weld"
    other = "other"


class Zone(str, Enum):
    cargo_hold_region = "cargo_hold_region"
    outside_cargo_hold = "outside_cargo_hold"
    unspecified = "미지정"


class WeldProcess(str, Enum):
    FCAW = "FCAW"
    GMAW = "GMAW"
    EGW = "EGW"
    SAW = "SAW"
    SMAW = "SMAW"
    unspecified = "미지정"


class GeomType(str, Enum):
    point = "point"
    line = "line"
    polyline = "polyline"
    unspecified = "미지정"


class Measure3Option(str, Enum):
    block_shift = "block_shift"
    crack_arrest_hole = "crack_arrest_hole"
    crack_arrest_insert = "crack_arrest_insert"
    enhanced_NDE = "enhanced_NDE"
    unspecified = "미지정"


class EnhancedNDEMethod(str, Enum):
    UT = "UT"
    PAUT = "PAUT"
    TOFD = "TOFD"
    RT = "RT"
    unspecified = "미지정"


class MeasureStatus(str, Enum):
    required = "Required"
    not_required = "Not required"
    conditional = "Conditional"
    see_note_2 = "See Note 2"
    pending_manual_choice = "pending_manual_choice"


class MeasureTarget(str, Enum):
    member = "member"
    joint = "joint"


# ── Input Models ────────────────────────────────────────────────────────────
class ProjectMeta(BaseModel):
    project_id: str
    vessel_name: str = UNSPECIFIED
    date_local: str = Field(
        default_factory=lambda: datetime.date.today().isoformat(),
        pattern=r"^\d{4}-\d{2}-\d{2}$",
    )
    allow_web_fetch: bool = False


class ScannedRuleImage(BaseModel):
    file_path: str
    doc_label: str
    page_hint: str = UNSPECIFIED


class OptionalRef(BaseModel):
    file_path_or_url: str
    label: str


class Sources(BaseModel):
    scanned_rule_images: List[ScannedRuleImage] = Field(default_factory=list)
    optional_refs: List[OptionalRef] = Field(default_factory=list)


class MemberInput(BaseModel):
    member_id: str
    member_role: MemberRole
    yield_strength_nmm2: Union[Literal[355, 390, 460], str] = UNSPECIFIED
    grade: str = UNSPECIFIED
    thickness_mm_as_built: Union[float, str] = UNSPECIFIED
    zone: Zone = Zone.unspecified
    geometry_ref: str = UNSPECIFIED


class JointGeom(BaseModel):
    type: GeomType = GeomType.unspecified
    data: Any = UNSPECIFIED


class JointInput(BaseModel):
    joint_id: str
    joint_type: JointType
    connected_members: List[str] = Field(min_length=1, max_length=2)
    zone: Zone = Zone.unspecified
    weld_process: WeldProcess = WeldProcess.unspecified
    geom: JointGeom = Field(default_factory=JointGeom)
    notes: str = UNSPECIFIED


class Measure3Parameters(BaseModel):
    block_shift_offset_mm: Union[float, str] = UNSPECIFIED
    hole_diameter_mm: Union[float, str] = UNSPECIFIED
    insert_type: str = UNSPECIFIED
    enhanced_nde_method: EnhancedNDEMethod = EnhancedNDEMethod.unspecified
    enhanced_nde_acceptance_criteria_ref: str = UNSPECIFIED


class Measure3Choice(BaseModel):
    option: Measure3Option = Measure3Option.unspecified
    parameters: Measure3Parameters = Field(default_factory=Measure3Parameters)


class HatchOpeningBbox(BaseModel):
    L: float
    B: float
    H: float


class VisualizationInputs(BaseModel):
    output_dir: str
    hatch_opening_bbox: Union[HatchOpeningBbox, str] = UNSPECIFIED


class PipelineInput(BaseModel):
    """Top-level input to the pipeline."""

    project_meta: ProjectMeta
    sources: Sources = Field(default_factory=Sources)
    members: List[MemberInput] = Field(default_factory=list)
    joints: List[JointInput] = Field(default_factory=list)
    measure3_choice: Measure3Choice = Field(default_factory=Measure3Choice)
    visualization_inputs: VisualizationInputs


# ── Rule Extraction Models ──────────────────────────────────────────────────
class TableCell(BaseModel):
    """A single cell in Table 8.2.1."""

    status: MeasureStatus
    raw_text: str = ""


class Table821Row(BaseModel):
    yield_strength_nmm2: int
    thickness_range_mm: str  # e.g. "50 < t ≤ 65"
    t_min_mm: float
    t_max_mm: float
    measure_1: TableCell
    measure_2: TableCell
    measure_3_and_4: TableCell
    measure_5: TableCell


class Table822Entry(BaseModel):
    """BCA type lookup from Table 8.2.2."""

    member_category: str  # "upper_deck" or "hatch_coaming_side"
    yield_strength_nmm2: int
    thickness_range_mm: str
    t_min_mm: float
    t_max_mm: float
    bca_type: str  # e.g. "BCA1", "BCA2"


class RulesExtraction(BaseModel):
    """Complete extracted rule set from scanned documents."""

    table_821: List[Table821Row] = Field(default_factory=list)
    table_822: List[Table822Entry] = Field(default_factory=list)
    textual_requirements: Dict[str, str] = Field(default_factory=dict)
    ocr_confidence: Dict[str, float] = Field(default_factory=dict)
    source_snippets: Dict[str, str] = Field(default_factory=dict)
    extraction_warnings: List[str] = Field(default_factory=list)


# ── Decision/Application Output Models ──────────────────────────────────────
class ManualReviewFlag(BaseModel):
    flag_id: str
    category: str
    message: str
    related_ids: List[str] = Field(default_factory=list)
    evidence_ref: str = ""


class MeasureApplication(BaseModel):
    """A single measure applied to a target (member or joint)."""

    measure_id: int  # 1-5
    measure_name: str
    status: MeasureStatus
    target_type: MeasureTarget
    target_id: str  # member_id or joint_id
    details: Dict[str, Any] = Field(default_factory=dict)
    evidence_snippet_key: str = ""
    rule_ref: str = ""  # e.g. "Table 8.2.1 row: yield=390, 65<t≤85"


class ControlParameters(BaseModel):
    t_side: Union[float, str] = UNSPECIFIED
    t_top: Union[float, str] = UNSPECIFIED
    t_control: Union[float, str] = UNSPECIFIED
    y_side: Union[int, str] = UNSPECIFIED
    y_top: Union[int, str] = UNSPECIFIED
    y_control: Union[int, str] = UNSPECIFIED


class DecisionResult(BaseModel):
    project_meta: ProjectMeta
    control_parameters: ControlParameters
    table_821_lookup: Dict[str, Any] = Field(default_factory=dict)
    required_measures: Dict[int, MeasureStatus] = Field(default_factory=dict)
    applications: List[MeasureApplication] = Field(default_factory=list)
    manual_review_flags: List[ManualReviewFlag] = Field(default_factory=list)
    pending_choices: List[Dict[str, Any]] = Field(default_factory=list)
    generation_timestamp: str = Field(
        default_factory=lambda: datetime.datetime.now(datetime.timezone.utc).isoformat()
    )


# ── Manual Matrix Fallback ──────────────────────────────────────────────────
class ManualMatrixEntry(BaseModel):
    """For manual input when OCR fails."""

    yield_strength_nmm2: int
    t_min_mm: float
    t_max_mm: float
    measure_1: str
    measure_2: str
    measure_3_and_4: str
    measure_5: str
