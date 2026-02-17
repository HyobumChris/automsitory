"""Input/output data models for LR hatch coaming application."""

from __future__ import annotations

from datetime import date, datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, Field, field_validator, model_validator

UNSPECIFIED = "미지정"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class RuleStatus(str, Enum):
    required = "required"
    not_required = "not_required"
    see_note_2 = "see_note_2"
    unspecified = UNSPECIFIED


class DecisionStatus(str, Enum):
    required = "required"
    conditional = "conditional"
    pending_manual_choice = "pending_manual_choice"
    pending_manual_review = "pending_manual_review"
    not_applicable = "not_applicable"


class TargetType(str, Enum):
    member = "member"
    joint = "joint"


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
    unspecified = UNSPECIFIED


class WeldProcess(str, Enum):
    FCAW = "FCAW"
    GMAW = "GMAW"
    EGW = "EGW"
    SAW = "SAW"
    SMAW = "SMAW"
    unspecified = UNSPECIFIED


class GeomType(str, Enum):
    point = "point"
    line = "line"
    polyline = "polyline"
    unspecified = UNSPECIFIED


class Measure3Option(str, Enum):
    block_shift = "block_shift"
    crack_arrest_hole = "crack_arrest_hole"
    crack_arrest_insert = "crack_arrest_insert"
    enhanced_NDE = "enhanced_NDE"
    unspecified = UNSPECIFIED


class EnhancedNDEMethod(str, Enum):
    UT = "UT"
    PAUT = "PAUT"
    TOFD = "TOFD"
    RT = "RT"
    unspecified = UNSPECIFIED


class ProjectMeta(BaseModel):
    project_id: str
    vessel_name: str = UNSPECIFIED
    date_local: str = Field(default_factory=lambda: date.today().isoformat())
    timezone: str = "Asia/Seoul"
    allow_web_fetch: bool = False

    @field_validator("date_local")
    @classmethod
    def _validate_date(cls, value: str) -> str:
        datetime.strptime(value, "%Y-%m-%d")
        return value


class ScannedRuleFile(BaseModel):
    path: str
    label: str
    page_hint: Union[int, str] = UNSPECIFIED


class DiagramFile(BaseModel):
    path: str
    label: str


class OptionalShipRightFile(BaseModel):
    path: str
    label: str
    present: bool = False


class Sources(BaseModel):
    scanned_rule_files: List[ScannedRuleFile] = Field(default_factory=list)
    diagram_files: List[DiagramFile] = Field(default_factory=list)
    optional_shipright_files: List[OptionalShipRightFile] = Field(default_factory=list)


class MemberInput(BaseModel):
    member_id: str
    member_role: MemberRole
    zone: Zone = Zone.unspecified
    yield_strength_nmm2: Union[int, str] = UNSPECIFIED
    grade: str = UNSPECIFIED
    thickness_mm_as_built: Union[float, int, str] = UNSPECIFIED
    geometry_ref: str = UNSPECIFIED

    @field_validator("yield_strength_nmm2")
    @classmethod
    def _validate_yield(cls, value: Union[int, str]) -> Union[int, str]:
        if value == UNSPECIFIED:
            return value
        iv = int(value)
        if iv not in (355, 390, 460):
            raise ValueError("yield_strength_nmm2 must be 355/390/460 or '미지정'")
        return iv


class JointGeom(BaseModel):
    type: GeomType = GeomType.unspecified
    data: Any = UNSPECIFIED


class JointInput(BaseModel):
    joint_id: str
    joint_type: JointType
    zone: Zone = Zone.unspecified
    connected_members: List[str] = Field(default_factory=list)
    weld_process: WeldProcess = WeldProcess.unspecified
    geom: JointGeom = Field(default_factory=JointGeom)
    related_joint_ids: List[str] = Field(default_factory=list)
    notes: str = UNSPECIFIED


class Measure3Parameters(BaseModel):
    block_shift_offset_mm: Union[float, int, str] = UNSPECIFIED
    hole_diameter_mm: Union[float, int, str] = UNSPECIFIED
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


class ManualTable821Row(BaseModel):
    yield_strength_nmm2: int
    thickness_range: str
    t_min_exclusive: Union[float, int, str]
    t_max_inclusive: Union[float, int, str]
    m1: RuleStatus
    m2: RuleStatus
    m3: RuleStatus
    m4: RuleStatus
    m5: RuleStatus


class ManualTable822Row(BaseModel):
    member_role: str
    yield_strength_nmm2: Union[int, str]
    thickness_range: str
    t_min_exclusive: Union[float, int, str]
    t_max_inclusive: Union[float, int, str]
    bca_type: str


class ManualTableInput(BaseModel):
    table_821: List[ManualTable821Row] = Field(default_factory=list)
    table_822: List[ManualTable822Row] = Field(default_factory=list)
    textual_requirements: Dict[str, str] = Field(default_factory=dict)


class ProjectInput(BaseModel):
    project_meta: ProjectMeta
    sources: Sources
    members: List[MemberInput] = Field(default_factory=list)
    joints: List[JointInput] = Field(default_factory=list)
    measure3_choice: Measure3Choice = Field(default_factory=Measure3Choice)
    visualization_inputs: VisualizationInputs
    manual_table_input: Optional[ManualTableInput] = None

    model_config = {"extra": "allow"}


class ManualReviewFlag(BaseModel):
    flag_id: str
    message: str
    category: str
    related_ids: List[str] = Field(default_factory=list)
    severity: Literal["info", "warning", "error"] = "warning"


class ControlParameters(BaseModel):
    t_side: Union[float, str] = UNSPECIFIED
    t_top: Union[float, str] = UNSPECIFIED
    t_control: Union[float, str] = UNSPECIFIED
    y_side: Union[int, str] = UNSPECIFIED
    y_top: Union[int, str] = UNSPECIFIED
    y_control: Union[int, str] = UNSPECIFIED


class AppliedMeasure(BaseModel):
    measure_id: int
    measure_name: str
    status: DecisionStatus
    target_type: TargetType
    target_id: str
    condition_expression: str = UNSPECIFIED
    requirements: List[str] = Field(default_factory=list)
    rule_refs: List[str] = Field(default_factory=list)
    evidence_ids: List[str] = Field(default_factory=list)
    notes: List[str] = Field(default_factory=list)
    noncompliance: bool = False
    extra: Dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _sort_lists(self) -> "AppliedMeasure":
        self.evidence_ids = sorted(set(self.evidence_ids))
        self.rule_refs = sorted(set(self.rule_refs))
        self.requirements = list(dict.fromkeys(self.requirements))
        self.notes = list(dict.fromkeys(self.notes))
        return self


class TargetDecision(BaseModel):
    target_type: TargetType
    target_id: str
    applied_measures: List[AppliedMeasure] = Field(default_factory=list)


class DecisionResults(BaseModel):
    project_meta: ProjectMeta
    control_parameters: ControlParameters
    required_measures_global: Dict[str, str] = Field(default_factory=dict)
    table_821_lookup: Dict[str, Any] = Field(default_factory=dict)
    targets: Dict[str, List[TargetDecision]] = Field(default_factory=dict)
    applications: List[AppliedMeasure] = Field(default_factory=list)
    pending_choices: List[Dict[str, Any]] = Field(default_factory=list)
    manual_review_flags: List[ManualReviewFlag] = Field(default_factory=list)
    generated_at_utc: str = Field(default_factory=now_iso)

