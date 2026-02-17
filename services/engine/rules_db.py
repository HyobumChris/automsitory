"""Typed schemas for LR hatch coaming rules and decisions.

The engine treats scanned rule files as the primary source of truth.
Any unknown value must remain "미지정" instead of being guessed.
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, Field, field_validator, model_validator

UNSPECIFIED = "미지정"

YieldValue = Union[Literal[355, 390, 460], str]
NumOrUnspecified = Union[float, int, str]

MeasureCellStatus = Literal["required", "not_required"]
Measure2CellStatus = Literal["required", "not_required", "see_note_2"]
RequirementStatus = Literal["found", "not_found", "미지정"]
ApplyStatus = Literal[
    "required",
    "conditional",
    "pending_manual_choice",
    "not_applicable",
    "noncompliant",
    "미지정",
]


def is_unspecified(value: Any) -> bool:
    """Return True if value is the explicit unspecified sentinel."""
    return isinstance(value, str) and value == UNSPECIFIED


def to_float_or_unspecified(value: Any) -> Union[float, str]:
    """Convert numeric-like values to float, else keep 미지정."""
    if is_unspecified(value):
        return UNSPECIFIED
    if isinstance(value, (int, float)):
        return float(value)
    return UNSPECIFIED


class ProjectMeta(BaseModel):
    project_id: str
    vessel_name: str = UNSPECIFIED
    date_local: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    timezone: str = "Asia/Seoul"
    allow_web_fetch: bool = False


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
    member_role: Literal[
        "upper_deck_plate",
        "hatch_coaming_side_plate",
        "hatch_coaming_top_plate",
        "attached_longitudinal",
        "other",
        "unknown",
    ]
    zone: Literal["cargo_hold_region", "outside_cargo_hold", "미지정"] = UNSPECIFIED
    yield_strength_nmm2: YieldValue = UNSPECIFIED
    grade: str = UNSPECIFIED
    thickness_mm_as_built: NumOrUnspecified = UNSPECIFIED
    geometry_ref: str = UNSPECIFIED

    @field_validator("yield_strength_nmm2")
    @classmethod
    def validate_yield(cls, value: YieldValue) -> YieldValue:
        if is_unspecified(value):
            return UNSPECIFIED
        if isinstance(value, int) and value in (355, 390, 460):
            return value
        raise ValueError("yield_strength_nmm2 must be 355/390/460 or '미지정'")

    @field_validator("thickness_mm_as_built")
    @classmethod
    def validate_thickness(cls, value: NumOrUnspecified) -> NumOrUnspecified:
        if is_unspecified(value):
            return UNSPECIFIED
        if isinstance(value, (int, float)) and value > 0:
            return float(value)
        raise ValueError("thickness_mm_as_built must be positive number or '미지정'")


class JointGeom(BaseModel):
    type: Literal["point", "line", "polyline", "미지정"] = UNSPECIFIED
    data: Any = UNSPECIFIED


class JointInput(BaseModel):
    joint_id: str
    joint_type: Literal[
        "block_to_block_butt",
        "coaming_to_deck_connection",
        "attachment_weld",
        "other",
    ]
    zone: Literal["cargo_hold_region", "outside_cargo_hold", "미지정"] = UNSPECIFIED
    connected_members: List[str] = Field(default_factory=list)
    weld_process: Literal["FCAW", "GMAW", "EGW", "SAW", "SMAW", "미지정"] = UNSPECIFIED
    geom: JointGeom = Field(default_factory=JointGeom)
    related_joint_ids: List[str] = Field(default_factory=list)
    notes: str = UNSPECIFIED

    @field_validator("connected_members")
    @classmethod
    def validate_connected_members(cls, value: List[str]) -> List[str]:
        if not value:
            raise ValueError("connected_members must include at least one member id")
        return value


class Measure3Parameters(BaseModel):
    block_shift_offset_mm: NumOrUnspecified = UNSPECIFIED
    hole_diameter_mm: NumOrUnspecified = UNSPECIFIED
    insert_type: str = UNSPECIFIED
    enhanced_nde_method: Literal["UT", "PAUT", "TOFD", "RT", "미지정"] = UNSPECIFIED
    enhanced_nde_acceptance_criteria_ref: str = UNSPECIFIED


class Measure3Choice(BaseModel):
    option: Literal[
        "block_shift",
        "crack_arrest_hole",
        "crack_arrest_insert",
        "enhanced_NDE",
        "미지정",
    ] = UNSPECIFIED
    parameters: Measure3Parameters = Field(default_factory=Measure3Parameters)


class HatchOpeningBBox(BaseModel):
    L: float
    B: float
    H: float

    @field_validator("L", "B", "H")
    @classmethod
    def validate_bbox_values(cls, value: float) -> float:
        if value <= 0:
            raise ValueError("hatch_opening_bbox dimensions must be positive")
        return value


class VisualizationInputs(BaseModel):
    output_dir: str
    hatch_opening_bbox: Union[HatchOpeningBBox, str] = UNSPECIFIED


class ManualTableInput(BaseModel):
    table_821: List[Dict[str, Any]] = Field(default_factory=list)
    table_822: List[Dict[str, Any]] = Field(default_factory=list)
    textual_requirements: Dict[str, Dict[str, Any]] = Field(default_factory=dict)


class ProjectInput(BaseModel):
    project_meta: ProjectMeta
    sources: Sources = Field(default_factory=Sources)
    members: List[MemberInput] = Field(default_factory=list)
    joints: List[JointInput] = Field(default_factory=list)
    measure3_choice: Measure3Choice = Field(default_factory=Measure3Choice)
    visualization_inputs: VisualizationInputs
    manual_table_input: Union[ManualTableInput, str, None] = None


class EvidenceRecord(BaseModel):
    key: str
    scan_file: str
    page_index: Optional[int] = None
    bbox: Optional[List[float]] = None
    ocr_confidence: float = 0.0
    snippet_path: str = UNSPECIFIED
    extracted_text: str = UNSPECIFIED


class Table821Entry(BaseModel):
    yield_strength_nmm2: YieldValue = UNSPECIFIED
    thickness_range: str = UNSPECIFIED
    t_lower_exclusive_mm: NumOrUnspecified = UNSPECIFIED
    t_upper_inclusive_mm: NumOrUnspecified = UNSPECIFIED
    m1: Union[MeasureCellStatus, str] = UNSPECIFIED
    m2: Union[Measure2CellStatus, str] = UNSPECIFIED
    m3: Union[MeasureCellStatus, str] = UNSPECIFIED
    m4: Union[MeasureCellStatus, str] = UNSPECIFIED
    m5: Union[MeasureCellStatus, str] = UNSPECIFIED
    notes: List[str] = Field(default_factory=list)
    evidence_keys: List[str] = Field(default_factory=list)


class Table822Entry(BaseModel):
    structure_member: str = UNSPECIFIED
    yield_strength_nmm2: YieldValue = UNSPECIFIED
    thickness_range: str = UNSPECIFIED
    t_lower_exclusive_mm: NumOrUnspecified = UNSPECIFIED
    t_upper_inclusive_mm: NumOrUnspecified = UNSPECIFIED
    bca_type: str = UNSPECIFIED
    condition_text: str = UNSPECIFIED
    evidence_keys: List[str] = Field(default_factory=list)


class TextRequirement(BaseModel):
    key: str
    requirement_text: str = UNSPECIFIED
    status: RequirementStatus = UNSPECIFIED
    evidence_keys: List[str] = Field(default_factory=list)


class MeasureDefinition(BaseModel):
    measure_id: int
    name: str
    target_type: Literal["member", "joint", "mixed"]
    description: str = UNSPECIFIED
    evidence_keys: List[str] = Field(default_factory=list)


class RulesExtraction(BaseModel):
    source_files: List[str] = Field(default_factory=list)
    table_821: List[Table821Entry] = Field(default_factory=list)
    table_822: List[Table822Entry] = Field(default_factory=list)
    textual_requirements: Dict[str, TextRequirement] = Field(default_factory=dict)
    measure_definitions: Dict[str, MeasureDefinition] = Field(default_factory=dict)
    evidence: Dict[str, EvidenceRecord] = Field(default_factory=dict)
    ocr_confidence_summary: Dict[str, float] = Field(default_factory=dict)
    extraction_notes: List[str] = Field(default_factory=list)
    manual_review_flags: List[str] = Field(default_factory=list)


class ManualReviewFlag(BaseModel):
    flag_id: str
    message: str
    related_targets: List[str] = Field(default_factory=list)
    rule_reference: str = UNSPECIFIED
    evidence_keys: List[str] = Field(default_factory=list)


class AppliedMeasure(BaseModel):
    measure_id: int
    measure_name: str
    target_type: Literal["member", "joint"]
    target_id: str
    status: ApplyStatus
    condition_expression: str = UNSPECIFIED
    requirements: List[str] = Field(default_factory=list)
    rule_references: List[str] = Field(default_factory=list)
    evidence_keys: List[str] = Field(default_factory=list)
    details: Dict[str, Any] = Field(default_factory=dict)
    noncompliance: bool = False


class TargetDecision(BaseModel):
    target_id: str
    target_type: Literal["member", "joint"]
    applied_measures: List[AppliedMeasure] = Field(default_factory=list)


class ControlParameters(BaseModel):
    t_side: NumOrUnspecified = UNSPECIFIED
    t_top: NumOrUnspecified = UNSPECIFIED
    t_control: NumOrUnspecified = UNSPECIFIED
    y_side: YieldValue = UNSPECIFIED
    y_top: YieldValue = UNSPECIFIED
    y_control: YieldValue = UNSPECIFIED


class DecisionResults(BaseModel):
    project_meta: ProjectMeta
    control_parameters: ControlParameters
    required_measures_global: Dict[str, str] = Field(default_factory=dict)
    members: List[TargetDecision] = Field(default_factory=list)
    joints: List[TargetDecision] = Field(default_factory=list)
    applied_measures_flat: List[AppliedMeasure] = Field(default_factory=list)
    note2_context: Dict[str, Any] = Field(default_factory=dict)
    special_consideration: Union[bool, str] = False
    manual_review_flags: List[ManualReviewFlag] = Field(default_factory=list)
    generation_timestamp_utc: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )

    @model_validator(mode="after")
    def validate_append_only_invariants(self) -> "DecisionResults":
        for target in [*self.members, *self.joints]:
            ids = [m.measure_id for m in target.applied_measures]
            if ids != sorted(set(ids)):
                raise ValueError(
                    f"target {target.target_id} applied_measures must be unique and sorted"
                )
        return self


def load_json_file(path: str) -> Dict[str, Any]:
    import json

    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json_file(path: str, payload: Union[Dict[str, Any], BaseModel]) -> None:
    import json

    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        if isinstance(payload, BaseModel):
            json.dump(payload.model_dump(mode="json"), handle, ensure_ascii=False, indent=2)
        else:
            json.dump(payload, handle, ensure_ascii=False, indent=2)

