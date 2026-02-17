"""Rules extraction database schema and helper utilities."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

from pydantic import BaseModel, Field, field_validator

from .models import ManualReviewFlag, RuleStatus, UNSPECIFIED


class EvidenceRecord(BaseModel):
    evidence_id: str
    key: str
    scan_file: str
    page_index: int
    bbox: Optional[List[int]] = None
    ocr_confidence: float = 0.0
    snippet_path: str = ""
    extracted_text: str = ""

    @field_validator("ocr_confidence")
    @classmethod
    def _clamp_confidence(cls, value: float) -> float:
        if value < 0:
            return 0.0
        if value > 1:
            return 1.0
        return round(float(value), 4)


class Table821Row(BaseModel):
    yield_strength_nmm2: int
    thickness_range: str
    t_min_exclusive: Union[float, int, str]
    t_max_inclusive: Union[float, int, str]
    m1: RuleStatus
    m2: RuleStatus
    m3: RuleStatus
    m4: RuleStatus
    m5: RuleStatus
    raw_m3m4_column: str = UNSPECIFIED
    notes: List[str] = Field(default_factory=list)
    evidence_by_measure: Dict[str, str] = Field(default_factory=dict)


class Table822Rule(BaseModel):
    member_role: str
    yield_strength_nmm2: Union[int, str]
    thickness_range: str
    t_min_exclusive: Union[float, int, str]
    t_max_inclusive: Union[float, int, str]
    bca_type: str
    condition_text: str = UNSPECIFIED
    evidence_id: str = ""


class TextRequirement(BaseModel):
    key: str
    requirement_text: str = UNSPECIFIED
    normalized: Dict[str, Any] = Field(default_factory=dict)
    evidence_id: str = ""


class RulesExtractionDB(BaseModel):
    source_mode: str = "ocr"
    source_files: List[str] = Field(default_factory=list)
    table_821: List[Table821Row] = Field(default_factory=list)
    table_822: List[Table822Rule] = Field(default_factory=list)
    textual_requirements: Dict[str, TextRequirement] = Field(default_factory=dict)
    evidence: Dict[str, EvidenceRecord] = Field(default_factory=dict)
    manual_review_flags: List[ManualReviewFlag] = Field(default_factory=list)
    web_conflict_flags: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)

    def lookup_821(self, y_control: int, t_control: float) -> Optional[Table821Row]:
        for row in self.table_821:
            if row.yield_strength_nmm2 != int(y_control):
                continue
            t_min = row.t_min_exclusive
            t_max = row.t_max_inclusive
            if not isinstance(t_min, (int, float)) or not isinstance(t_max, (int, float)):
                continue
            if float(t_min) < float(t_control) <= float(t_max):
                return row
        return None

    def lookup_822(self, member_role: str, y_value: int, t_value: float) -> Optional[Table822Rule]:
        for row in self.table_822:
            if row.member_role != member_role:
                continue
            if not isinstance(row.yield_strength_nmm2, int):
                continue
            if int(row.yield_strength_nmm2) != int(y_value):
                continue
            t_min = row.t_min_exclusive
            t_max = row.t_max_inclusive
            if not isinstance(t_min, (int, float)) or not isinstance(t_max, (int, float)):
                continue
            if float(t_min) < float(t_value) <= float(t_max):
                return row
        return None


def load_rules_db(path: Union[str, Path]) -> RulesExtractionDB:
    content = Path(path).read_text(encoding="utf-8")
    return RulesExtractionDB.model_validate_json(content)


def save_rules_db(path: Union[str, Path], db: RulesExtractionDB) -> None:
    Path(path).write_text(db.model_dump_json(indent=2), encoding="utf-8")


def status_from_text(raw: str) -> RuleStatus:
    low = raw.strip().lower()
    if "see" in low and "note" in low:
        return RuleStatus.see_note_2
    if "not" in low and "required" in low:
        return RuleStatus.not_required
    if "required" in low:
        return RuleStatus.required
    return RuleStatus.unspecified


def merge_evidence_ids(*items: str) -> List[str]:
    merged = [item for item in items if item]
    return sorted(set(merged))


def parse_manual_table_input(manual_data: Dict[str, Any]) -> RulesExtractionDB:
    """Build a rules DB from explicit manual table input JSON."""
    db = RulesExtractionDB(source_mode="manual_table_input")
    for raw in manual_data.get("table_821", []):
        row = Table821Row.model_validate(raw)
        db.table_821.append(row)
    for raw in manual_data.get("table_822", []):
        row = Table822Rule.model_validate(raw)
        db.table_822.append(row)
    for key, value in manual_data.get("textual_requirements", {}).items():
        text = str(value)
        db.textual_requirements[key] = TextRequirement(key=key, requirement_text=text)
    if not db.table_821 or not db.table_822:
        db.manual_review_flags.append(
            ManualReviewFlag(
                flag_id="manual_table_incomplete",
                message="manual_table_input is missing table_821 or table_822 rows.",
                category="rules_extraction",
                severity="error",
            )
        )
    return db

