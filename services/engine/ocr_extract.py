"""
OCR extraction module for LR Rules scanned images / PDFs.

Responsibilities:
  - Extract Table 8.2.1 and Table 8.2.2 from scans
  - Extract rule clause text with keywords
  - Save evidence snippets (cropped bounding boxes)
  - Produce rules_extraction.json

Fallback:
  - If OCR tools (tesseract, pdf2image) are unavailable,
    return a manual_table_input prompt or use existing rules_extraction.json.
"""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from .rules_db import (
    EvidenceRecord,
    MeasureDefinition,
    MeasureStatus,
    RuleClause,
    RulesExtraction,
    Table821Cell,
    Table821Row,
    Table822Row,
    save_json,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# OCR availability check
# ---------------------------------------------------------------------------
_OCR_AVAILABLE = False
try:
    import pytesseract  # type: ignore
    _OCR_AVAILABLE = True
except ImportError:
    pass

_PDF2IMAGE_AVAILABLE = False
try:
    from pdf2image import convert_from_path  # type: ignore
    _PDF2IMAGE_AVAILABLE = True
except ImportError:
    pass

_PIL_AVAILABLE = False
try:
    from PIL import Image  # type: ignore
    _PIL_AVAILABLE = True
except ImportError:
    pass


# ---------------------------------------------------------------------------
# Evidence snippet saving
# ---------------------------------------------------------------------------

def save_snippet(
    image,  # PIL.Image
    bbox: Optional[Tuple[int, int, int, int]],
    output_dir: Path,
    snippet_name: str,
) -> str:
    """Crop bbox from image and save as PNG; return relative path."""
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / f"{snippet_name}.png"
    if bbox and _PIL_AVAILABLE:
        cropped = image.crop(bbox)
        cropped.save(str(path))
    elif _PIL_AVAILABLE:
        image.save(str(path))
    return str(path)


# ---------------------------------------------------------------------------
# Hardcoded fallback data (representative of LR Pt4 Ch8 2.3)
# Used when OCR is unavailable or rules_extraction.json doesn't exist
# ---------------------------------------------------------------------------

def _build_fallback_table_821() -> List[Table821Row]:
    """
    Build Table 8.2.1 from known LR rule structure.
    Thickness ranges and yield strength categories per specification.
    This is a structured representation; in production the OCR module
    would extract these values from scanned tables.
    """
    rows: List[Table821Row] = []

    # YS 355, 50 < t <= 85: Measures 1 required
    rows.append(Table821Row(
        yield_strength_nmm2=355,
        thickness_range="50<t<=85",
        thickness_min_exclusive=50,
        thickness_max_inclusive=85,
        cell=Table821Cell(
            m1=MeasureStatus.required,
            m2=MeasureStatus.not_required,
            m3=MeasureStatus.not_required,
            m4=MeasureStatus.not_required,
            m5=MeasureStatus.not_required,
            notes=["Measure 1 only for YS355 50-85mm range"],
        ),
    ))

    # YS 355, 85 < t <= 100: Measures 1, 3+4 required
    rows.append(Table821Row(
        yield_strength_nmm2=355,
        thickness_range="85<t<=100",
        thickness_min_exclusive=85,
        thickness_max_inclusive=100,
        cell=Table821Cell(
            m1=MeasureStatus.required,
            m2=MeasureStatus.see_note_2,
            m3=MeasureStatus.required,
            m4=MeasureStatus.required,
            m5=MeasureStatus.not_required,
            notes=["3+4 required together", "Measure 2: see Note 2"],
        ),
    ))

    # YS 390, 50 < t <= 85: Measures 1, 3+4 required
    rows.append(Table821Row(
        yield_strength_nmm2=390,
        thickness_range="50<t<=85",
        thickness_min_exclusive=50,
        thickness_max_inclusive=85,
        cell=Table821Cell(
            m1=MeasureStatus.required,
            m2=MeasureStatus.see_note_2,
            m3=MeasureStatus.required,
            m4=MeasureStatus.required,
            m5=MeasureStatus.not_required,
            notes=["3+4 required together", "Measure 2: see Note 2"],
        ),
    ))

    # YS 390, 85 < t <= 100: Measures 1, 3+4, 5 required
    rows.append(Table821Row(
        yield_strength_nmm2=390,
        thickness_range="85<t<=100",
        thickness_min_exclusive=85,
        thickness_max_inclusive=100,
        cell=Table821Cell(
            m1=MeasureStatus.required,
            m2=MeasureStatus.see_note_2,
            m3=MeasureStatus.required,
            m4=MeasureStatus.required,
            m5=MeasureStatus.required,
            notes=["3+4 required together", "Measure 5 required", "Measure 2: see Note 2"],
        ),
    ))

    # YS 460, 50 < t <= 85: Measures 1, 3+4, 5 required
    rows.append(Table821Row(
        yield_strength_nmm2=460,
        thickness_range="50<t<=85",
        thickness_min_exclusive=50,
        thickness_max_inclusive=85,
        cell=Table821Cell(
            m1=MeasureStatus.required,
            m2=MeasureStatus.see_note_2,
            m3=MeasureStatus.required,
            m4=MeasureStatus.required,
            m5=MeasureStatus.required,
            notes=["3+4 required together", "Measure 5 required", "Measure 2: see Note 2"],
        ),
    ))

    # YS 460, 85 < t <= 100: Measures 1, 3+4, 5 required
    rows.append(Table821Row(
        yield_strength_nmm2=460,
        thickness_range="85<t<=100",
        thickness_min_exclusive=85,
        thickness_max_inclusive=100,
        cell=Table821Cell(
            m1=MeasureStatus.required,
            m2=MeasureStatus.see_note_2,
            m3=MeasureStatus.required,
            m4=MeasureStatus.required,
            m5=MeasureStatus.required,
            notes=["3+4 required together", "Measure 5 required", "Measure 2: see Note 2"],
        ),
    ))

    return rows


def _build_fallback_table_822() -> List[Table822Row]:
    """
    Build Table 8.2.2 – BCA steel type requirements by structural member.
    """
    rows: List[Table822Row] = []

    for ys in [355, 390, 460]:
        # Upper deck plate
        rows.append(Table822Row(
            structural_member="upper_deck_plate",
            yield_strength_nmm2=ys,
            thickness_range="50<t<=100",
            thickness_min_exclusive=50,
            thickness_max_inclusive=100,
            bca_type="BCA1" if ys <= 390 else "BCA2",
        ))
        # Hatch coaming side plate
        rows.append(Table822Row(
            structural_member="hatch_coaming_side_plate",
            yield_strength_nmm2=ys,
            thickness_range="50<t<=100",
            thickness_min_exclusive=50,
            thickness_max_inclusive=100,
            bca_type="BCA1" if ys <= 355 else "BCA2",
        ))

    return rows


def _build_fallback_measure_definitions() -> List[MeasureDefinition]:
    return [
        MeasureDefinition(
            measure_id=1,
            name="Construction NDE",
            target_type="joint",
            description="100% UT of block-to-block butt welds in cargo hold region for upper flange longitudinal members",
        ),
        MeasureDefinition(
            measure_id=2,
            name="Periodic In-service NDE",
            target_type="joint",
            description="Periodic in-service NDE at frequency/extent agreed with LR. Conditional on enhanced NDE selection (Note 2).",
        ),
        MeasureDefinition(
            measure_id=3,
            name="Crack Arrest Measures",
            target_type="member+joint",
            description="One of: block shift (>=300mm offset), crack arrest hole, crack arrest insert, or enhanced NDE. "
                        "Additionally, BCA steel may be required for hatch coaming side plate.",
        ),
        MeasureDefinition(
            measure_id=4,
            name="Upper Deck BCA Steel",
            target_type="member",
            description="Brittle crack arrest steel for upper deck plates in cargo hold region per Table 8.2.2.",
        ),
        MeasureDefinition(
            measure_id=5,
            name="Upper Deck BCA Steel (extended range)",
            target_type="member",
            description="Additional BCA steel requirement for upper deck plates – separate traceability from Measure 4.",
        ),
    ]


def _build_fallback_clauses() -> List[RuleClause]:
    return [
        RuleClause(
            clause_id="CL-001",
            text="Block-to-block butt welds in adjacent strakes shall be staggered by at least 300 mm.",
            keywords=["block shift", "stagger", "offset", "300 mm"],
        ),
        RuleClause(
            clause_id="CL-002",
            text="Where crack arrest holes are fitted, fatigue strength at the hole corners and intersections shall be specially assessed.",
            keywords=["crack arrest hole", "fatigue strength", "special assessment"],
        ),
        RuleClause(
            clause_id="CL-003",
            text="Where enhanced NDE is selected as the crack arrest measure, stricter acceptance criteria per ShipRight procedure apply. "
                 "CTOD value shall be not less than 0.18 mm. Electrogas welding (EGW) is not permitted.",
            keywords=["enhanced NDE", "CTOD", "0.18 mm", "EGW", "not permitted", "ShipRight"],
        ),
        RuleClause(
            clause_id="CL-004",
            text="The connection of hatch coaming to upper deck shall be made using LR-approved partial joint penetration (PJP) welding.",
            keywords=["coaming", "upper deck", "PJP", "partial joint penetration"],
        ),
        RuleClause(
            clause_id="CL-005",
            text="Where the thickness exceeds 100 mm, special consideration is to be given.",
            keywords=["thickness", "100 mm", "special consideration"],
        ),
        RuleClause(
            clause_id="CL-006",
            text="Hatch coaming side plate in way of cargo hold region shall be provided with brittle crack arrest (BCA) steel.",
            keywords=["hatch coaming side plate", "BCA", "brittle crack arrest", "cargo hold"],
        ),
        RuleClause(
            clause_id="CL-007",
            text="Note 2: Where enhanced NDE is selected as Measure 3, periodic in-service NDE (Measure 2) may be required "
                 "at frequency and extent to be agreed with LR.",
            keywords=["Note 2", "enhanced NDE", "Measure 2", "periodic", "in-service"],
        ),
    ]


# ---------------------------------------------------------------------------
# Main extraction function
# ---------------------------------------------------------------------------

def extract_rules(
    source_files: List[Dict[str, Any]],
    evidence_dir: str = "evidence/ocr_snippets",
    output_path: str = "outputs/demo/rules_extraction.json",
    existing_rules_path: Optional[str] = None,
) -> RulesExtraction:
    """
    Extract rules from scanned files, or fall back to existing extraction / defaults.

    Priority:
      1. If existing_rules_path is given and file exists -> load and return
      2. Attempt OCR extraction from source_files
      3. Fall back to built-in representative data (manual_table_input mode)
    """
    # Priority 1: existing extraction
    if existing_rules_path and Path(existing_rules_path).exists():
        logger.info("Loading existing rules extraction from %s", existing_rules_path)
        with open(existing_rules_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return RulesExtraction(**data)

    # Priority 2: attempt OCR
    if _OCR_AVAILABLE and _PIL_AVAILABLE:
        logger.info("Attempting OCR extraction from source files...")
        result = _try_ocr_extraction(source_files, evidence_dir)
        if result is not None:
            save_json(result, output_path)
            return result
        logger.warning("OCR extraction returned no results; falling back to defaults.")

    # Priority 3: fallback (manual_table_input mode)
    logger.info("Using fallback rule data (manual_table_input mode). "
                "Provide rules_extraction.json or scanned files for production use.")

    ev_dir = Path(evidence_dir)
    ev_dir.mkdir(parents=True, exist_ok=True)

    extraction = RulesExtraction(
        extraction_date=datetime.now().isoformat(),
        source_files=[sf.get("path", "") for sf in source_files] if source_files else [],
        table_821=_build_fallback_table_821(),
        table_822=_build_fallback_table_822(),
        measure_definitions=_build_fallback_measure_definitions(),
        rule_clauses=_build_fallback_clauses(),
        special_consideration_threshold_mm=100.0,
        manual_review_flags=[
            "Rules extracted from fallback data (manual_table_input mode). "
            "Verify against actual scanned LR Pt4 Ch8 2.3 Tables 8.2.1 and 8.2.2."
        ],
    )

    save_json(extraction, output_path)
    logger.info("Fallback rules_extraction.json saved to %s", output_path)
    return extraction


# ---------------------------------------------------------------------------
# OCR extraction (when tools available)
# ---------------------------------------------------------------------------

def _try_ocr_extraction(
    source_files: List[Dict[str, Any]],
    evidence_dir: str,
) -> Optional[RulesExtraction]:
    """
    Attempt to OCR source files and build RulesExtraction.
    Returns None if extraction is not feasible.
    """
    all_texts: List[str] = []
    evidence_records: List[EvidenceRecord] = []
    ev_dir = Path(evidence_dir)
    ev_dir.mkdir(parents=True, exist_ok=True)

    for sf in source_files:
        fpath = sf.get("path", "")
        if not Path(fpath).exists():
            logger.warning("Source file not found: %s", fpath)
            continue

        try:
            images = _load_images(fpath, sf.get("page_hint"))
        except Exception as e:
            logger.warning("Failed to load images from %s: %s", fpath, e)
            continue

        for idx, img in enumerate(images):
            try:
                text = pytesseract.image_to_string(img)
                all_texts.append(text)

                snippet_name = f"ocr_{Path(fpath).stem}_p{idx}"
                snippet_path = save_snippet(img, None, ev_dir, snippet_name)

                evidence_records.append(EvidenceRecord(
                    scan_file=fpath,
                    page_index=idx,
                    bbox=None,
                    ocr_confidence=0.5,  # placeholder
                    snippet_path=snippet_path,
                    raw_text=text[:500],
                ))
            except Exception as e:
                logger.warning("OCR failed for %s page %d: %s", fpath, idx, e)

    if not all_texts:
        return None

    # Build extraction from OCR text – simplified parser
    # In production this would use table detection, cell extraction, etc.
    extraction = RulesExtraction(
        extraction_date=datetime.now().isoformat(),
        source_files=[sf.get("path", "") for sf in source_files],
        table_821=_build_fallback_table_821(),  # TODO: replace with parsed OCR
        table_822=_build_fallback_table_822(),
        measure_definitions=_build_fallback_measure_definitions(),
        rule_clauses=_build_fallback_clauses(),
        special_consideration_threshold_mm=100.0,
        manual_review_flags=[
            "OCR extraction performed but table parsing used fallback structure. "
            "Manual verification recommended."
        ],
    )

    # Attach evidence to table rows
    for row in extraction.table_821:
        row.cell.evidence = evidence_records[:1] if evidence_records else []

    return extraction


def _load_images(fpath: str, page_hint=None) -> list:
    """Load images from PDF or image file."""
    ext = Path(fpath).suffix.lower()
    if ext == ".pdf" and _PDF2IMAGE_AVAILABLE:
        if page_hint and page_hint != "미지정":
            return convert_from_path(fpath, first_page=int(page_hint), last_page=int(page_hint))
        return convert_from_path(fpath)
    elif ext in (".png", ".jpg", ".jpeg", ".tiff", ".bmp") and _PIL_AVAILABLE:
        return [Image.open(fpath)]
    return []
