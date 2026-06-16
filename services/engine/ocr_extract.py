"""
ocr_extract.py – Scan OCR + table reconstruction + evidence snippet extraction.

Primary source is user-provided scanned images/PDFs.
Falls back to pre-built rules_extraction.json if scans are unavailable.
Supports manual_table_input mode for user-provided JSON tables.
"""
from __future__ import annotations

import json
import logging
import os
import shutil
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from services.engine.rules_db import (
    EvidenceRef,
    RulesExtractionDB,
    UNSPECIFIED,
)

logger = logging.getLogger(__name__)

FALLBACK_PATH = Path("configs/rules_extraction_fallback.json")


def _try_ocr_pdf(pdf_path: str, page_hint: Any = None) -> Optional[dict]:
    """
    Attempt OCR on a PDF file.
    Requires optional dependencies: pdf2image, pytesseract.
    Returns extracted dict or None on failure.
    """
    try:
        from pdf2image import convert_from_path  # type: ignore
        import pytesseract  # type: ignore

        pages = convert_from_path(pdf_path, dpi=300)
        if page_hint is not None and page_hint != UNSPECIFIED:
            idx = int(page_hint)
            if 0 <= idx < len(pages):
                pages = [pages[idx]]

        full_text = ""
        for page in pages:
            full_text += pytesseract.image_to_string(page, lang="eng") + "\n"

        return {"raw_text": full_text, "page_count": len(pages)}
    except ImportError:
        logger.warning("OCR dependencies (pdf2image, pytesseract) not available.")
        return None
    except Exception as e:
        logger.warning(f"OCR failed for {pdf_path}: {e}")
        return None


def _try_ocr_image(img_path: str) -> Optional[dict]:
    """Attempt OCR on an image file."""
    try:
        from PIL import Image  # type: ignore
        import pytesseract  # type: ignore

        img = Image.open(img_path)
        text = pytesseract.image_to_string(img, lang="eng")
        return {"raw_text": text}
    except ImportError:
        logger.warning("OCR dependencies (pytesseract) not available.")
        return None
    except Exception as e:
        logger.warning(f"OCR failed for {img_path}: {e}")
        return None


def _crop_snippet(
    img_path: str,
    bbox: Optional[List[float]],
    output_path: str,
) -> Optional[str]:
    """Crop a region from an image and save as evidence snippet."""
    try:
        from PIL import Image

        img = Image.open(img_path)
        if bbox and len(bbox) == 4:
            cropped = img.crop(tuple(bbox))
        else:
            cropped = img
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        cropped.save(output_path)
        return output_path
    except Exception as e:
        logger.warning(f"Snippet crop failed: {e}")
        return None


def extract_rules_from_scans(
    scanned_rule_files: List[dict],
    evidence_dir: str = "evidence/ocr_snippets",
) -> Tuple[Optional[dict], List[str]]:
    """
    Process scanned rule files and extract structured table data.

    Returns:
        (rules_dict, manual_review_flags)
        rules_dict is None if OCR fails / no files provided.
    """
    manual_flags: List[str] = []

    if not scanned_rule_files:
        manual_flags.append("No scanned rule files provided – using fallback.")
        return None, manual_flags

    ocr_results = []
    for sf in scanned_rule_files:
        path = sf.get("path", "")
        page_hint = sf.get("page_hint", UNSPECIFIED)

        if not os.path.exists(path):
            manual_flags.append(f"Scan file not found: {path}")
            continue

        ext = Path(path).suffix.lower()
        if ext == ".pdf":
            result = _try_ocr_pdf(path, page_hint)
        elif ext in (".png", ".jpg", ".jpeg", ".tiff", ".bmp"):
            result = _try_ocr_image(path)
        else:
            manual_flags.append(f"Unsupported scan file format: {ext} ({path})")
            continue

        if result:
            ocr_results.append({"file": path, **result})
        else:
            manual_flags.append(f"OCR failed or dependencies missing for: {path}")

    if not ocr_results:
        manual_flags.append("All OCR attempts failed – using fallback.")
        return None, manual_flags

    # Table parsing from raw OCR text is non-trivial.
    # Flag for manual review and return partial data.
    manual_flags.append(
        "OCR text extracted but automated table parsing not yet fully implemented. "
        "Please verify rules_extraction.json manually."
    )
    return None, manual_flags


def load_or_extract_rules(
    sources: dict,
    output_dir: str = "outputs/demo",
    evidence_dir: str = "evidence/ocr_snippets",
    manual_table_path: Optional[str] = None,
) -> Tuple[RulesExtractionDB, List[str]]:
    """
    Main entry: load rules extraction DB from scan OCR, manual input, or fallback.

    Priority:
    1. Pre-existing rules_extraction.json in output_dir (skip OCR)
    2. manual_table_path (user-provided JSON)
    3. OCR from scans
    4. Fallback
    """
    manual_flags: List[str] = []

    # 1. Pre-existing extraction
    existing = Path(output_dir) / "rules_extraction.json"
    if existing.exists():
        logger.info(f"Using existing rules extraction: {existing}")
        db = RulesExtractionDB.load(existing)
        manual_flags.extend(db.manual_review_flags)
        return db, manual_flags

    # 2. Manual table input
    if manual_table_path and Path(manual_table_path).exists():
        logger.info(f"Using manual table input: {manual_table_path}")
        db = RulesExtractionDB.load(manual_table_path)
        manual_flags.extend(db.manual_review_flags)
        _save_rules(db.raw, output_dir)
        return db, manual_flags

    # 3. OCR from scans
    scanned_files = sources.get("scanned_rule_files", [])
    if scanned_files:
        ocr_data, ocr_flags = extract_rules_from_scans(scanned_files, evidence_dir)
        manual_flags.extend(ocr_flags)
        if ocr_data:
            db = RulesExtractionDB(ocr_data)
            _save_rules(ocr_data, output_dir)
            return db, manual_flags

    # 4. Fallback
    logger.info(f"Using fallback rules: {FALLBACK_PATH}")
    manual_flags.append("Using fallback rules_extraction – verify against actual LR rules scan.")
    db = RulesExtractionDB.load(FALLBACK_PATH)
    manual_flags.extend(db.manual_review_flags)
    fallback_data = db.raw.copy()
    _save_rules(fallback_data, output_dir)
    return db, manual_flags


def _save_rules(data: dict, output_dir: str):
    """Save rules extraction to output directory."""
    out_path = Path(output_dir) / "rules_extraction.json"
    os.makedirs(output_dir, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    logger.info(f"Saved rules extraction to {out_path}")
