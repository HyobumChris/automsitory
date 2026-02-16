"""Built-in default Table 8.2.1 and Table 8.2.2 data + lookup functions.

These defaults are used when OCR extraction fails or no scanned images
are provided.  They can be overridden via manual_matrix input or
successful OCR extraction.

Reference: LR Rules for the Classification of Ships – Part 3, Ch 4, Sec 8.
"""

from __future__ import annotations

from typing import Dict, List, Optional, Tuple

from .models import (
    UNSPECIFIED,
    MeasureStatus,
    RulesExtraction,
    Table821Row,
    Table822Entry,
    TableCell,
    ManualMatrixEntry,
)

# ── Table 8.2.1 defaults ───────────────────────────────────────────────────
# Key: (yield_strength_nmm2, t_min_mm, t_max_mm)
# Values: (measure_1, measure_2, measure_3_and_4, measure_5)

_S = MeasureStatus

_DEFAULT_TABLE_821: List[Table821Row] = [
    # ── Yield = 355 N/mm² ──
    Table821Row(
        yield_strength_nmm2=355,
        thickness_range_mm="t ≤ 50",
        t_min_mm=0, t_max_mm=50,
        measure_1=TableCell(status=_S.not_required),
        measure_2=TableCell(status=_S.not_required),
        measure_3_and_4=TableCell(status=_S.not_required),
        measure_5=TableCell(status=_S.not_required),
    ),
    Table821Row(
        yield_strength_nmm2=355,
        thickness_range_mm="50 < t ≤ 65",
        t_min_mm=50, t_max_mm=65,
        measure_1=TableCell(status=_S.required),
        measure_2=TableCell(status=_S.not_required),
        measure_3_and_4=TableCell(status=_S.not_required),
        measure_5=TableCell(status=_S.not_required),
    ),
    Table821Row(
        yield_strength_nmm2=355,
        thickness_range_mm="65 < t ≤ 85",
        t_min_mm=65, t_max_mm=85,
        measure_1=TableCell(status=_S.required),
        measure_2=TableCell(status=_S.see_note_2),
        measure_3_and_4=TableCell(status=_S.required),
        measure_5=TableCell(status=_S.not_required),
    ),
    Table821Row(
        yield_strength_nmm2=355,
        thickness_range_mm="85 < t ≤ 100",
        t_min_mm=85, t_max_mm=100,
        measure_1=TableCell(status=_S.required),
        measure_2=TableCell(status=_S.see_note_2),
        measure_3_and_4=TableCell(status=_S.required),
        measure_5=TableCell(status=_S.required),
    ),
    # ── Yield = 390 N/mm² ──
    Table821Row(
        yield_strength_nmm2=390,
        thickness_range_mm="t ≤ 40",
        t_min_mm=0, t_max_mm=40,
        measure_1=TableCell(status=_S.not_required),
        measure_2=TableCell(status=_S.not_required),
        measure_3_and_4=TableCell(status=_S.not_required),
        measure_5=TableCell(status=_S.not_required),
    ),
    Table821Row(
        yield_strength_nmm2=390,
        thickness_range_mm="40 < t ≤ 50",
        t_min_mm=40, t_max_mm=50,
        measure_1=TableCell(status=_S.required),
        measure_2=TableCell(status=_S.not_required),
        measure_3_and_4=TableCell(status=_S.not_required),
        measure_5=TableCell(status=_S.not_required),
    ),
    Table821Row(
        yield_strength_nmm2=390,
        thickness_range_mm="50 < t ≤ 65",
        t_min_mm=50, t_max_mm=65,
        measure_1=TableCell(status=_S.required),
        measure_2=TableCell(status=_S.see_note_2),
        measure_3_and_4=TableCell(status=_S.required),
        measure_5=TableCell(status=_S.not_required),
    ),
    Table821Row(
        yield_strength_nmm2=390,
        thickness_range_mm="65 < t ≤ 85",
        t_min_mm=65, t_max_mm=85,
        measure_1=TableCell(status=_S.required),
        measure_2=TableCell(status=_S.see_note_2),
        measure_3_and_4=TableCell(status=_S.required),
        measure_5=TableCell(status=_S.required),
    ),
    Table821Row(
        yield_strength_nmm2=390,
        thickness_range_mm="85 < t ≤ 100",
        t_min_mm=85, t_max_mm=100,
        measure_1=TableCell(status=_S.required),
        measure_2=TableCell(status=_S.see_note_2),
        measure_3_and_4=TableCell(status=_S.required),
        measure_5=TableCell(status=_S.required),
    ),
    # ── Yield = 460 N/mm² ──
    Table821Row(
        yield_strength_nmm2=460,
        thickness_range_mm="t ≤ 30",
        t_min_mm=0, t_max_mm=30,
        measure_1=TableCell(status=_S.not_required),
        measure_2=TableCell(status=_S.not_required),
        measure_3_and_4=TableCell(status=_S.not_required),
        measure_5=TableCell(status=_S.not_required),
    ),
    Table821Row(
        yield_strength_nmm2=460,
        thickness_range_mm="30 < t ≤ 40",
        t_min_mm=30, t_max_mm=40,
        measure_1=TableCell(status=_S.required),
        measure_2=TableCell(status=_S.not_required),
        measure_3_and_4=TableCell(status=_S.not_required),
        measure_5=TableCell(status=_S.not_required),
    ),
    Table821Row(
        yield_strength_nmm2=460,
        thickness_range_mm="40 < t ≤ 50",
        t_min_mm=40, t_max_mm=50,
        measure_1=TableCell(status=_S.required),
        measure_2=TableCell(status=_S.see_note_2),
        measure_3_and_4=TableCell(status=_S.required),
        measure_5=TableCell(status=_S.not_required),
    ),
    Table821Row(
        yield_strength_nmm2=460,
        thickness_range_mm="50 < t ≤ 65",
        t_min_mm=50, t_max_mm=65,
        measure_1=TableCell(status=_S.required),
        measure_2=TableCell(status=_S.see_note_2),
        measure_3_and_4=TableCell(status=_S.required),
        measure_5=TableCell(status=_S.required),
    ),
    Table821Row(
        yield_strength_nmm2=460,
        thickness_range_mm="65 < t ≤ 85",
        t_min_mm=65, t_max_mm=85,
        measure_1=TableCell(status=_S.required),
        measure_2=TableCell(status=_S.see_note_2),
        measure_3_and_4=TableCell(status=_S.required),
        measure_5=TableCell(status=_S.required),
    ),
    Table821Row(
        yield_strength_nmm2=460,
        thickness_range_mm="85 < t ≤ 100",
        t_min_mm=85, t_max_mm=100,
        measure_1=TableCell(status=_S.required),
        measure_2=TableCell(status=_S.see_note_2),
        measure_3_and_4=TableCell(status=_S.required),
        measure_5=TableCell(status=_S.required),
    ),
]

# ── Table 8.2.2 defaults (BCA type assignment) ─────────────────────────────
_DEFAULT_TABLE_822: List[Table822Entry] = [
    # Upper deck
    Table822Entry(
        member_category="upper_deck",
        yield_strength_nmm2=355,
        thickness_range_mm="65 < t ≤ 100",
        t_min_mm=65, t_max_mm=100,
        bca_type="BCA1",
    ),
    Table822Entry(
        member_category="upper_deck",
        yield_strength_nmm2=390,
        thickness_range_mm="50 < t ≤ 65",
        t_min_mm=50, t_max_mm=65,
        bca_type="BCA1",
    ),
    Table822Entry(
        member_category="upper_deck",
        yield_strength_nmm2=390,
        thickness_range_mm="65 < t ≤ 100",
        t_min_mm=65, t_max_mm=100,
        bca_type="BCA1",
    ),
    Table822Entry(
        member_category="upper_deck",
        yield_strength_nmm2=460,
        thickness_range_mm="40 < t ≤ 50",
        t_min_mm=40, t_max_mm=50,
        bca_type="BCA1",
    ),
    Table822Entry(
        member_category="upper_deck",
        yield_strength_nmm2=460,
        thickness_range_mm="50 < t ≤ 65",
        t_min_mm=50, t_max_mm=65,
        bca_type="BCA1",
    ),
    Table822Entry(
        member_category="upper_deck",
        yield_strength_nmm2=460,
        thickness_range_mm="65 < t ≤ 100",
        t_min_mm=65, t_max_mm=100,
        bca_type="BCA2",
    ),
    # Hatch coaming side
    Table822Entry(
        member_category="hatch_coaming_side",
        yield_strength_nmm2=355,
        thickness_range_mm="65 < t ≤ 85",
        t_min_mm=65, t_max_mm=85,
        bca_type="BCA1",
    ),
    Table822Entry(
        member_category="hatch_coaming_side",
        yield_strength_nmm2=355,
        thickness_range_mm="85 < t ≤ 100",
        t_min_mm=85, t_max_mm=100,
        bca_type="BCA1",
    ),
    Table822Entry(
        member_category="hatch_coaming_side",
        yield_strength_nmm2=390,
        thickness_range_mm="50 < t ≤ 65",
        t_min_mm=50, t_max_mm=65,
        bca_type="BCA1",
    ),
    Table822Entry(
        member_category="hatch_coaming_side",
        yield_strength_nmm2=390,
        thickness_range_mm="65 < t ≤ 85",
        t_min_mm=65, t_max_mm=85,
        bca_type="BCA2",
    ),
    Table822Entry(
        member_category="hatch_coaming_side",
        yield_strength_nmm2=390,
        thickness_range_mm="85 < t ≤ 100",
        t_min_mm=85, t_max_mm=100,
        bca_type="BCA2",
    ),
    Table822Entry(
        member_category="hatch_coaming_side",
        yield_strength_nmm2=460,
        thickness_range_mm="40 < t ≤ 50",
        t_min_mm=40, t_max_mm=50,
        bca_type="BCA1",
    ),
    Table822Entry(
        member_category="hatch_coaming_side",
        yield_strength_nmm2=460,
        thickness_range_mm="50 < t ≤ 65",
        t_min_mm=50, t_max_mm=65,
        bca_type="BCA2",
    ),
    Table822Entry(
        member_category="hatch_coaming_side",
        yield_strength_nmm2=460,
        thickness_range_mm="65 < t ≤ 100",
        t_min_mm=65, t_max_mm=100,
        bca_type="BCA2",
    ),
]


def get_default_table_821() -> List[Table821Row]:
    return list(_DEFAULT_TABLE_821)


def get_default_table_822() -> List[Table822Entry]:
    return list(_DEFAULT_TABLE_822)


def lookup_table_821(
    table: List[Table821Row],
    yield_strength: int,
    thickness: float,
) -> Optional[Table821Row]:
    """Find the matching row in Table 8.2.1 for given yield and thickness."""
    for row in table:
        if row.yield_strength_nmm2 != yield_strength:
            continue
        if row.t_min_mm < thickness <= row.t_max_mm:
            return row
        # Edge case: t == 0 and t_min == 0 (e.g., "t ≤ 50")
        if row.t_min_mm == 0 and thickness <= row.t_max_mm:
            return row
    return None


def lookup_table_822(
    table: List[Table822Entry],
    member_category: str,
    yield_strength: int,
    thickness: float,
) -> Optional[Table822Entry]:
    """Find BCA type from Table 8.2.2."""
    for entry in table:
        if entry.member_category != member_category:
            continue
        if entry.yield_strength_nmm2 != yield_strength:
            continue
        if entry.t_min_mm < thickness <= entry.t_max_mm:
            return entry
        if entry.t_min_mm == 0 and thickness <= entry.t_max_mm:
            return entry
    return None


def merge_ocr_with_defaults(ocr_extraction: RulesExtraction) -> RulesExtraction:
    """Merge OCR-extracted tables with defaults, preferring OCR where available."""
    result = RulesExtraction(
        textual_requirements=dict(ocr_extraction.textual_requirements),
        ocr_confidence=dict(ocr_extraction.ocr_confidence),
        source_snippets=dict(ocr_extraction.source_snippets),
        extraction_warnings=list(ocr_extraction.extraction_warnings),
    )

    if ocr_extraction.table_821:
        result.table_821 = list(ocr_extraction.table_821)
    else:
        result.table_821 = get_default_table_821()
        result.extraction_warnings.append(
            "Using built-in default Table 8.2.1 (OCR extraction unavailable)."
        )

    if ocr_extraction.table_822:
        result.table_822 = list(ocr_extraction.table_822)
    else:
        result.table_822 = get_default_table_822()
        result.extraction_warnings.append(
            "Using built-in default Table 8.2.2 (OCR extraction unavailable)."
        )

    return result


def build_from_manual_matrix(
    entries_821: List[ManualMatrixEntry],
) -> List[Table821Row]:
    """Build Table 8.2.1 rows from user-provided manual matrix entries."""
    rows: List[Table821Row] = []
    for e in entries_821:
        range_str = f"{e.t_min_mm} < t ≤ {e.t_max_mm}" if e.t_min_mm > 0 else f"t ≤ {e.t_max_mm}"
        rows.append(
            Table821Row(
                yield_strength_nmm2=e.yield_strength_nmm2,
                thickness_range_mm=range_str,
                t_min_mm=e.t_min_mm,
                t_max_mm=e.t_max_mm,
                measure_1=TableCell(status=_parse_manual_status(e.measure_1), raw_text=e.measure_1),
                measure_2=TableCell(status=_parse_manual_status(e.measure_2), raw_text=e.measure_2),
                measure_3_and_4=TableCell(status=_parse_manual_status(e.measure_3_and_4), raw_text=e.measure_3_and_4),
                measure_5=TableCell(status=_parse_manual_status(e.measure_5), raw_text=e.measure_5),
            )
        )
    return rows


def _parse_manual_status(val: str) -> MeasureStatus:
    low = val.strip().lower()
    if "not" in low and "required" in low:
        return _S.not_required
    if "note 2" in low or "see note" in low:
        return _S.see_note_2
    if "required" in low:
        return _S.required
    return _S.required
