"""OCR extraction from scanned LR rule documents.

Extracts Table 8.2.1, Table 8.2.2, and textual requirements from
scanned images/PDFs.  Falls back to manual-matrix input mode on failure.
"""

from __future__ import annotations

import json
import logging
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from .models import (
    UNSPECIFIED,
    MeasureStatus,
    RulesExtraction,
    ScannedRuleImage,
    Table821Row,
    Table822Entry,
    TableCell,
)

logger = logging.getLogger(__name__)

# ── OCR back-end abstraction ────────────────────────────────────────────────

_HAS_TESSERACT = False
_HAS_EASYOCR = False

try:
    import pytesseract
    from PIL import Image

    _HAS_TESSERACT = True
except ImportError:
    pass

try:
    import easyocr

    _HAS_EASYOCR = True
except ImportError:
    pass


def _ocr_image(image_path: str) -> Tuple[str, float]:
    """Return (text, avg_confidence) from an image file."""
    if _HAS_TESSERACT:
        img = Image.open(image_path)
        data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)
        texts, confs = [], []
        for i, txt in enumerate(data["text"]):
            if txt.strip():
                texts.append(txt)
                c = data["conf"][i]
                if isinstance(c, (int, float)) and c >= 0:
                    confs.append(float(c) / 100.0)
        full = " ".join(texts)
        avg = sum(confs) / len(confs) if confs else 0.0
        return full, avg

    if _HAS_EASYOCR:
        reader = easyocr.Reader(["en"], gpu=False)
        results = reader.readtext(image_path)
        texts = [r[1] for r in results]
        confs = [r[2] for r in results]
        full = " ".join(texts)
        avg = sum(confs) / len(confs) if confs else 0.0
        return full, avg

    return "", 0.0


def _ocr_pdf_page(pdf_path: str, page: int = 0) -> Tuple[str, float]:
    """Extract text from a single PDF page via rendering + OCR."""
    try:
        import fitz  # PyMuPDF

        doc = fitz.open(pdf_path)
        p = doc.load_page(page)
        # Try embedded text first
        text = p.get_text()
        if text.strip():
            doc.close()
            return text, 0.95
        # Render to image and OCR
        pix = p.get_pixmap(dpi=300)
        img_path = f"/tmp/_ocr_page_{page}.png"
        pix.save(img_path)
        doc.close()
        return _ocr_image(img_path)
    except ImportError:
        logger.warning("PyMuPDF not available; skipping PDF: %s", pdf_path)
        return "", 0.0


# ── Table parsers ───────────────────────────────────────────────────────────

_STATUS_MAP = {
    "required": MeasureStatus.required,
    "not required": MeasureStatus.not_required,
    "see note 2": MeasureStatus.see_note_2,
}


def _parse_status(raw: str) -> MeasureStatus:
    low = raw.strip().lower()
    for key, val in _STATUS_MAP.items():
        if key in low:
            return val
    return MeasureStatus.required  # conservative default


def _parse_table_821_from_text(text: str) -> List[Table821Row]:
    """Best-effort table extraction from OCR text for Table 8.2.1."""
    rows: List[Table821Row] = []
    # Pattern: yield thickness_range M1 M2 M3+4 M5
    # We look for lines with numbers and Required/Not required patterns
    # This is heuristic — OCR quality varies
    lines = text.split("\n")
    current_yield = 0
    for line in lines:
        line = line.strip()
        if not line:
            continue
        # Detect yield header
        yield_match = re.search(r"(\d{3})\s*[Nn]/mm", line)
        if yield_match:
            current_yield = int(yield_match.group(1))
            continue
        # Detect thickness range + statuses
        t_match = re.search(
            r"(\d+)\s*[<≤]\s*t\s*[≤<]\s*(\d+)", line
        )
        if not t_match and re.search(r"t\s*[≤<]\s*(\d+)", line):
            t_match2 = re.search(r"t\s*[≤<]\s*(\d+)", line)
            if t_match2:
                t_max = float(t_match2.group(1))
                t_min = 0.0
            else:
                continue
        elif t_match:
            t_min = float(t_match.group(1))
            t_max = float(t_match.group(2))
        else:
            continue

        if current_yield == 0:
            continue

        # Extract measure statuses — look for "Required" / "Not required" / "See Note"
        statuses = re.findall(
            r"(Required|Not\s*required|See\s*Note\s*\d+)", line, re.IGNORECASE
        )
        if len(statuses) >= 4:
            m1 = _parse_status(statuses[0])
            m2 = _parse_status(statuses[1])
            m34 = _parse_status(statuses[2])
            m5 = _parse_status(statuses[3])
        else:
            # Can't parse — skip or default
            continue

        range_str = f"{t_min} < t ≤ {t_max}" if t_min > 0 else f"t ≤ {t_max}"
        rows.append(
            Table821Row(
                yield_strength_nmm2=current_yield,
                thickness_range_mm=range_str,
                t_min_mm=t_min,
                t_max_mm=t_max,
                measure_1=TableCell(status=m1, raw_text=statuses[0] if statuses else ""),
                measure_2=TableCell(status=m2, raw_text=statuses[1] if len(statuses) > 1 else ""),
                measure_3_and_4=TableCell(status=m34, raw_text=statuses[2] if len(statuses) > 2 else ""),
                measure_5=TableCell(status=m5, raw_text=statuses[3] if len(statuses) > 3 else ""),
            )
        )
    return rows


def _parse_table_822_from_text(text: str) -> List[Table822Entry]:
    """Best-effort extraction of Table 8.2.2 BCA type lookup."""
    entries: List[Table822Entry] = []
    lines = text.split("\n")
    current_cat = ""
    for line in lines:
        low = line.lower()
        if "upper deck" in low:
            current_cat = "upper_deck"
        elif "hatch coaming" in low or "coaming side" in low:
            current_cat = "hatch_coaming_side"

        bca_match = re.search(r"(BCA\s*\d+)", line, re.IGNORECASE)
        t_match = re.search(r"(\d+)\s*[<≤]\s*t\s*[≤<]\s*(\d+)", line)
        yield_match = re.search(r"(\d{3})\s*[Nn]/mm", line)

        if bca_match and current_cat:
            bca = bca_match.group(1).replace(" ", "").upper()
            t_min = float(t_match.group(1)) if t_match else 0.0
            t_max = float(t_match.group(2)) if t_match else 999.0
            y = int(yield_match.group(1)) if yield_match else 0
            entries.append(
                Table822Entry(
                    member_category=current_cat,
                    yield_strength_nmm2=y,
                    thickness_range_mm=f"{t_min} < t ≤ {t_max}",
                    t_min_mm=t_min,
                    t_max_mm=t_max,
                    bca_type=bca,
                )
            )
    return entries


def _extract_textual_requirements(text: str) -> Dict[str, str]:
    """Extract key textual requirements from OCR output."""
    reqs: Dict[str, str] = {}
    low = text.lower()

    # Measure 1: 100% UT
    if "100%" in text and ("ut" in low or "ultrasonic" in low):
        idx = low.find("100%")
        snippet = text[max(0, idx - 50) : idx + 200]
        reqs["measure_1_ut_requirement"] = snippet.strip()

    # Measure 3 sub-options
    if "block shift" in low or "300" in text:
        idx = low.find("block shift") if "block shift" in low else low.find("300")
        snippet = text[max(0, idx - 50) : idx + 300]
        reqs["measure_3_block_shift"] = snippet.strip()

    if "crack arrest hole" in low:
        idx = low.find("crack arrest hole")
        snippet = text[max(0, idx - 50) : idx + 300]
        reqs["measure_3_crack_arrest_hole"] = snippet.strip()

    if "insert" in low and ("crack arrest" in low or "weld metal" in low):
        idx = low.find("insert")
        snippet = text[max(0, idx - 80) : idx + 300]
        reqs["measure_3_insert"] = snippet.strip()

    if "enhanced" in low and "nde" in low:
        idx = low.find("enhanced")
        snippet = text[max(0, idx - 50) : idx + 400]
        reqs["measure_3_enhanced_nde"] = snippet.strip()

    if "ctod" in low or "0.18" in text:
        idx = low.find("ctod") if "ctod" in low else low.find("0.18")
        snippet = text[max(0, idx - 50) : idx + 200]
        reqs["ctod_requirement"] = snippet.strip()

    if "bca" in low or "brittle crack arrest" in low:
        idx = low.find("bca") if "bca" in low else low.find("brittle crack arrest")
        snippet = text[max(0, idx - 50) : idx + 300]
        reqs["bca_steel_requirement"] = snippet.strip()

    # PJP weld
    if "pjp" in low or "partial joint penetration" in low:
        term = "pjp" if "pjp" in low else "partial joint penetration"
        idx = low.find(term)
        snippet = text[max(0, idx - 50) : idx + 300]
        reqs["pjp_weld_requirement"] = snippet.strip()

    # Thickness > 100 special
    if "special consideration" in low or ("100" in text and "thick" in low):
        idx = low.find("special consideration") if "special consideration" in low else low.find("100")
        snippet = text[max(0, idx - 50) : idx + 300]
        reqs["thickness_gt100_special"] = snippet.strip()

    # EGW prohibition
    if "egw" in low and ("not" in low or "prohib" in low or "shall not" in low):
        idx = low.find("egw")
        snippet = text[max(0, idx - 80) : idx + 200]
        reqs["egw_prohibition"] = snippet.strip()

    return reqs


# ── Snippet cropper ─────────────────────────────────────────────────────────

def crop_snippet(
    image_path: str, bbox: Tuple[int, int, int, int], output_path: str
) -> bool:
    """Crop a bounding-box region from an image and save as evidence snippet."""
    try:
        from PIL import Image

        img = Image.open(image_path)
        cropped = img.crop(bbox)
        cropped.save(output_path)
        return True
    except Exception as exc:
        logger.warning("Failed to crop snippet from %s: %s", image_path, exc)
        return False


# ── Main extraction orchestrator ────────────────────────────────────────────

def extract_rules(
    scanned_images: List[ScannedRuleImage],
    evidence_dir: Optional[str] = None,
) -> RulesExtraction:
    """Extract rules from scanned images/PDFs.

    If OCR is unavailable or fails, returns an empty extraction with
    warnings — the caller should then offer manual-matrix input mode.
    """
    result = RulesExtraction()
    all_text_parts: List[str] = []

    for src in scanned_images:
        fpath = src.file_path
        if not os.path.isfile(fpath):
            result.extraction_warnings.append(f"File not found: {fpath}")
            continue

        ext = os.path.splitext(fpath)[1].lower()
        if ext == ".pdf":
            text, conf = _ocr_pdf_page(fpath, page=0)
        elif ext in (".png", ".jpg", ".jpeg", ".tiff", ".bmp"):
            text, conf = _ocr_image(fpath)
        else:
            result.extraction_warnings.append(f"Unsupported file type: {fpath}")
            continue

        if not text.strip():
            result.extraction_warnings.append(
                f"OCR returned empty text for {fpath}. "
                "Switch to manual_matrix input mode."
            )
            continue

        result.ocr_confidence[src.doc_label] = round(conf, 3)
        result.source_snippets[src.doc_label] = text[:2000]  # first 2000 chars
        all_text_parts.append(text)

    combined = "\n".join(all_text_parts)

    if combined.strip():
        result.table_821 = _parse_table_821_from_text(combined)
        result.table_822 = _parse_table_822_from_text(combined)
        result.textual_requirements = _extract_textual_requirements(combined)

        if not result.table_821:
            result.extraction_warnings.append(
                "Table 8.2.1 could not be parsed from OCR output. "
                "Use manual_matrix input mode or provide clearer scans."
            )
        if not result.table_822:
            result.extraction_warnings.append(
                "Table 8.2.2 could not be parsed from OCR output. "
                "Use manual_matrix input mode or provide clearer scans."
            )
    else:
        if not scanned_images:
            result.extraction_warnings.append(
                "No scanned images provided. Using built-in default tables."
            )
        else:
            result.extraction_warnings.append(
                "All OCR attempts failed. Switch to manual_matrix input mode."
            )

    return result
