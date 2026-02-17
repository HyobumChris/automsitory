"""Scan-first rules extraction for LR Table 8.2.1/8.2.2.

This module never fetches rule text from the web unless explicitly requested
via project_meta.allow_web_fetch=true. Scanned files are always the primary
evidence source.
"""

from __future__ import annotations

import re
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple, Union

from .rules_db import (
    ManualTableInput,
    MeasureDefinition,
    ProjectInput,
    RequirementStatus,
    RulesExtraction,
    Table821Entry,
    Table822Entry,
    TextRequirement,
    UNSPECIFIED,
    EvidenceRecord,
    is_unspecified,
    load_json_file,
)

try:
    import fitz  # type: ignore
except Exception:  # pragma: no cover - optional dependency
    fitz = None

try:
    from PIL import Image  # type: ignore
except Exception:  # pragma: no cover - optional dependency
    Image = None

try:
    import pytesseract  # type: ignore
except Exception:  # pragma: no cover - optional dependency
    pytesseract = None

try:
    import easyocr  # type: ignore
except Exception:  # pragma: no cover - optional dependency
    easyocr = None


@dataclass
class OCRBlock:
    text: str
    evidence_key: str
    confidence: float


def _safe_name(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", value).strip("_")


def _ocr_image(path: str) -> Tuple[str, float]:
    if pytesseract is not None and Image is not None:
        img = Image.open(path)
        data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)
        words: List[str] = []
        confs: List[float] = []
        for idx, token in enumerate(data.get("text", [])):
            token = token.strip()
            if not token:
                continue
            words.append(token)
            try:
                raw_conf = float(data["conf"][idx])
            except Exception:
                raw_conf = -1.0
            if raw_conf >= 0:
                confs.append(raw_conf / 100.0)
        if words:
            return " ".join(words), sum(confs) / len(confs) if confs else 0.0

    if easyocr is not None:
        reader = easyocr.Reader(["en"], gpu=False)
        rows = reader.readtext(path)
        words = [row[1] for row in rows]
        confs = [float(row[2]) for row in rows]
        if words:
            return " ".join(words), sum(confs) / len(confs) if confs else 0.0

    return "", 0.0


def _render_pdf_page_to_png(pdf_path: str, page_index: int, target_path: str) -> bool:
    if fitz is None:
        return False
    doc = fitz.open(pdf_path)
    try:
        page = doc.load_page(page_index)
        pix = page.get_pixmap(dpi=250)
        pix.save(target_path)
        return True
    finally:
        doc.close()


def _extract_pdf_page_text(pdf_path: str, page_index: int) -> Tuple[str, float]:
    if fitz is None:
        return "", 0.0

    doc = fitz.open(pdf_path)
    try:
        page = doc.load_page(page_index)
        text = page.get_text("text").strip()
        if text:
            return text, 0.98
    finally:
        doc.close()

    # fallback OCR via rendered image
    tmp_image = Path("/tmp") / f"_lr_pdf_ocr_{_safe_name(Path(pdf_path).stem)}_{page_index}.png"
    if _render_pdf_page_to_png(pdf_path, page_index, str(tmp_image)):
        text, conf = _ocr_image(str(tmp_image))
        return text, conf
    return "", 0.0


def _normalize_text(line: str) -> str:
    return re.sub(r"\s+", " ", line).strip()


def _status_from_phrase(raw: str) -> str:
    low = _normalize_text(raw).lower()
    if "see note 2" in low:
        return "see_note_2"
    if "not required" in low:
        return "not_required"
    if "required" in low:
        return "required"
    return UNSPECIFIED


def _extract_status_tokens(line: str) -> List[str]:
    # order matters: not required before required
    pattern = re.compile(r"see\s*note\s*2|not\s*required|required", re.IGNORECASE)
    return [_status_from_phrase(m.group(0)) for m in pattern.finditer(line)]


def _parse_thickness_range(line: str) -> Tuple[UnionFloatOrStr, UnionFloatOrStr, str]:
    low = _normalize_text(line.lower()).replace("≤", "<=").replace("≥", ">=")
    m = re.search(r"(\d+(?:\.\d+)?)\s*<\s*t\s*<=\s*(\d+(?:\.\d+)?)", low)
    if m:
        t_lo = float(m.group(1))
        t_hi = float(m.group(2))
        return t_lo, t_hi, f"{m.group(1)}<t<={m.group(2)}"

    m = re.search(r"t\s*<=\s*(\d+(?:\.\d+)?)", low)
    if m:
        t_hi = float(m.group(1))
        return 0.0, t_hi, f"t<={m.group(1)}"

    return UNSPECIFIED, UNSPECIFIED, UNSPECIFIED


UnionFloatOrStr = Union[float, str]


def _parse_table_821(blocks: Iterable[OCRBlock]) -> List[Table821Entry]:
    rows: List[Table821Entry] = []
    current_yield: Union[int, str] = UNSPECIFIED
    seen = set()
    for block in blocks:
        for raw_line in block.text.splitlines():
            line = _normalize_text(raw_line)
            if not line:
                continue

            y_match = re.search(r"\b(355|390|460)\b", line)
            if y_match and ("n/mm" in line.lower() or "yield" in line.lower()):
                current_yield = int(y_match.group(1))
                continue

            if any(word in line.lower() for word in ("table 8.2.2", "bca type")):
                continue

            t_lo, t_hi, range_text = _parse_thickness_range(line)
            if is_unspecified(t_lo) or is_unspecified(t_hi):
                continue

            statuses = _extract_status_tokens(line)
            if len(statuses) < 4:
                continue

            y_value = current_yield
            if is_unspecified(y_value):
                y_inline = re.search(r"\b(355|390|460)\b", line)
                if y_inline:
                    y_value = int(y_inline.group(1))
            if is_unspecified(y_value):
                continue

            m1 = statuses[0]
            m2 = statuses[1]
            m34 = statuses[2]
            m5 = statuses[3]

            m3 = "required" if m34 == "required" else "not_required"
            m4 = "required" if m34 == "required" else "not_required"

            key = (y_value, range_text, m1, m2, m3, m4, m5)
            if key in seen:
                continue
            seen.add(key)

            rows.append(
                Table821Entry(
                    yield_strength_nmm2=y_value,
                    thickness_range=range_text,
                    t_lower_exclusive_mm=t_lo,
                    t_upper_inclusive_mm=t_hi,
                    m1=m1,
                    m2=m2,
                    m3=m3,
                    m4=m4,
                    m5=m5,
                    notes=[],
                    evidence_keys=[block.evidence_key],
                )
            )
    return rows


def _parse_table_822(blocks: Iterable[OCRBlock]) -> List[Table822Entry]:
    entries: List[Table822Entry] = []
    current_member = UNSPECIFIED
    seen = set()
    for block in blocks:
        for raw_line in block.text.splitlines():
            line = _normalize_text(raw_line)
            low = line.lower()
            if not line:
                continue

            if "upper deck" in low:
                current_member = "upper_deck_plate"
            if "coaming side" in low or "hatch coaming side" in low:
                current_member = "hatch_coaming_side_plate"

            bca_match = re.search(r"\b(BCA\s*[0-9A-Za-z]+)\b", line, flags=re.IGNORECASE)
            if not bca_match:
                continue

            t_lo, t_hi, range_text = _parse_thickness_range(line)
            y_match = re.search(r"\b(355|390|460)\b", line)
            y_val: Union[int, str] = int(y_match.group(1)) if y_match else UNSPECIFIED

            key = (current_member, y_val, range_text, bca_match.group(1).upper().replace(" ", ""))
            if key in seen:
                continue
            seen.add(key)

            entries.append(
                Table822Entry(
                    structure_member=current_member,
                    yield_strength_nmm2=y_val,
                    thickness_range=range_text,
                    t_lower_exclusive_mm=t_lo,
                    t_upper_inclusive_mm=t_hi,
                    bca_type=bca_match.group(1).upper().replace(" ", ""),
                    condition_text=line,
                    evidence_keys=[block.evidence_key],
                )
            )
    return entries


def _find_requirement(
    key: str,
    blocks: List[OCRBlock],
    patterns: List[str],
) -> TextRequirement:
    regexes = [re.compile(pattern, re.IGNORECASE) for pattern in patterns]
    for block in blocks:
        for raw_line in block.text.splitlines():
            line = _normalize_text(raw_line)
            if not line:
                continue
            if any(rx.search(line) for rx in regexes):
                return TextRequirement(
                    key=key,
                    requirement_text=line,
                    status="found",
                    evidence_keys=[block.evidence_key],
                )
    return TextRequirement(key=key, requirement_text=UNSPECIFIED, status="not_found", evidence_keys=[])


def _extract_text_requirements(blocks: List[OCRBlock]) -> Dict[str, TextRequirement]:
    return {
        "block_shift_offset_min_300": _find_requirement(
            "block_shift_offset_min_300",
            blocks,
            [r"block\s*shift", r"offset.*300", r"300\s*mm"],
        ),
        "crack_arrest_hole_fatigue_assessment": _find_requirement(
            "crack_arrest_hole_fatigue_assessment",
            blocks,
            [r"crack arrest hole", r"fatigue.*assessment", r"special.*fatigue"],
        ),
        "enhanced_nde_stricter_acceptance": _find_requirement(
            "enhanced_nde_stricter_acceptance",
            blocks,
            [r"enhanced.*nde", r"stricter.*acceptance", r"shipright"],
        ),
        "enhanced_nde_lr_alternative_for_inaccessible": _find_requirement(
            "enhanced_nde_lr_alternative_for_inaccessible",
            blocks,
            [r"inaccessible", r"alternative nde", r"agreement.*lr"],
        ),
        "enhanced_nde_ctod_0_18": _find_requirement(
            "enhanced_nde_ctod_0_18",
            blocks,
            [r"ctod", r"0\.18\s*mm"],
        ),
        "enhanced_nde_egw_not_permitted": _find_requirement(
            "enhanced_nde_egw_not_permitted",
            blocks,
            [r"egw", r"not permitted", r"shall not.*egw", r"egw.*prohibit"],
        ),
        "coaming_to_deck_pjp_required": _find_requirement(
            "coaming_to_deck_pjp_required",
            blocks,
            [r"coaming.*deck", r"pjp", r"partial joint penetration", r"lr-approved"],
        ),
        "thickness_gt_100_special_consideration": _find_requirement(
            "thickness_gt_100_special_consideration",
            blocks,
            [r"special consideration", r"thickness.*100", r">\s*100\s*mm"],
        ),
        "coaming_side_bca_required": _find_requirement(
            "coaming_side_bca_required",
            blocks,
            [r"coaming side plate", r"bca", r"brittle crack arrest steel"],
        ),
    }


def _default_measure_definitions(text_requirements: Dict[str, TextRequirement]) -> Dict[str, MeasureDefinition]:
    def evidence_for(keys: List[str]) -> List[str]:
        ev: List[str] = []
        for key in keys:
            req = text_requirements.get(key)
            if req:
                ev.extend(req.evidence_keys)
        return sorted(set(ev))

    return {
        "1": MeasureDefinition(
            measure_id=1,
            name="Construction NDE",
            target_type="joint",
            description="Construction-stage NDE for relevant butt joints.",
            evidence_keys=evidence_for(["enhanced_nde_stricter_acceptance"]),
        ),
        "2": MeasureDefinition(
            measure_id=2,
            name="Periodic in-service NDE (Note 2)",
            target_type="joint",
            description="Conditional periodic in-service NDE when Note 2 applies.",
            evidence_keys=[],
        ),
        "3": MeasureDefinition(
            measure_id=3,
            name="Crack arrest measure set",
            target_type="mixed",
            description="Coaming-side BCA steel + chosen crack-arrest option.",
            evidence_keys=evidence_for(
                [
                    "coaming_side_bca_required",
                    "block_shift_offset_min_300",
                    "crack_arrest_hole_fatigue_assessment",
                    "enhanced_nde_ctod_0_18",
                ]
            ),
        ),
        "4": MeasureDefinition(
            measure_id=4,
            name="Upper deck BCA steel",
            target_type="member",
            description="Upper deck plate BCA steel requirement.",
            evidence_keys=[],
        ),
        "5": MeasureDefinition(
            measure_id=5,
            name="Upper deck BCA steel (traceability)",
            target_type="member",
            description="Same target logic as Measure 4 with independent traceability.",
            evidence_keys=[],
        ),
    }


def _materialize_manual_table(
    manual_source: Optional[UnionManualSource],
) -> Optional[ManualTableInput]:
    if manual_source is None:
        return None
    if isinstance(manual_source, ManualTableInput):
        return manual_source
    if isinstance(manual_source, dict):
        return ManualTableInput(**manual_source)
    if isinstance(manual_source, str):
        path = Path(manual_source)
        if path.is_file():
            return ManualTableInput(**load_json_file(str(path)))
    return None


UnionManualSource = Union[ManualTableInput, Dict[str, Any], str]


def _copy_or_convert_image(src: str, dst: str) -> bool:
    Path(dst).parent.mkdir(parents=True, exist_ok=True)
    if Image is None:
        try:
            shutil.copyfile(src, dst)
            return True
        except Exception:
            return False
    try:
        img = Image.open(src)
        img.save(dst)
        return True
    except Exception:
        return False


def extract_rules(project_input: ProjectInput, output_dir: str) -> RulesExtraction:
    """Extract rule database from scanned inputs, with manual fallback support."""
    evidence_dir = Path(output_dir) / "evidence" / "ocr_snippets"
    evidence_dir.mkdir(parents=True, exist_ok=True)

    rules = RulesExtraction()
    rules.source_files = [item.path for item in project_input.sources.scanned_rule_files]

    blocks: List[OCRBlock] = []
    evidence_counter = 1

    for source in project_input.sources.scanned_rule_files:
        source_path = Path(source.path)
        if not source_path.is_file():
            rules.manual_review_flags.append(f"scan_file_missing:{source.path}")
            continue

        suffix = source_path.suffix.lower()
        safe_label = _safe_name(source.label or source_path.stem)

        if suffix == ".pdf":
            if fitz is None:
                rules.manual_review_flags.append(f"pdf_backend_unavailable:{source.path}")
                continue
            doc = fitz.open(str(source_path))
            try:
                if isinstance(source.page_hint, int):
                    pages = [source.page_hint]
                else:
                    pages = list(range(doc.page_count))
                for page_index in pages:
                    if page_index < 0 or page_index >= doc.page_count:
                        rules.manual_review_flags.append(
                            f"invalid_page_hint:{source.path}:{page_index}"
                        )
                        continue
                    text, conf = _extract_pdf_page_text(str(source_path), page_index)
                    snippet_rel = f"evidence/ocr_snippets/{safe_label}_p{page_index}.png"
                    snippet_abs = Path(output_dir) / snippet_rel
                    rendered = _render_pdf_page_to_png(str(source_path), page_index, str(snippet_abs))
                    if not rendered:
                        snippet_rel = UNSPECIFIED

                    ev_key = f"ev_{evidence_counter:05d}"
                    evidence_counter += 1
                    rules.evidence[ev_key] = EvidenceRecord(
                        key=ev_key,
                        scan_file=str(source_path),
                        page_index=page_index,
                        bbox=None,
                        ocr_confidence=round(conf, 3),
                        snippet_path=snippet_rel,
                        extracted_text=text[:4000] if text else UNSPECIFIED,
                    )
                    rules.ocr_confidence_summary[f"{source.label}:p{page_index}"] = round(conf, 3)
                    if text:
                        blocks.append(OCRBlock(text=text, evidence_key=ev_key, confidence=conf))
            finally:
                doc.close()
            continue

        if suffix in (".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp", ".webp"):
            text, conf = _ocr_image(str(source_path))
            snippet_rel = f"evidence/ocr_snippets/{safe_label}.png"
            snippet_abs = Path(output_dir) / snippet_rel
            copied = _copy_or_convert_image(str(source_path), str(snippet_abs))
            if not copied:
                snippet_rel = UNSPECIFIED

            ev_key = f"ev_{evidence_counter:05d}"
            evidence_counter += 1
            rules.evidence[ev_key] = EvidenceRecord(
                key=ev_key,
                scan_file=str(source_path),
                page_index=0,
                bbox=None,
                ocr_confidence=round(conf, 3),
                snippet_path=snippet_rel,
                extracted_text=text[:4000] if text else UNSPECIFIED,
            )
            rules.ocr_confidence_summary[source.label] = round(conf, 3)
            if text:
                blocks.append(OCRBlock(text=text, evidence_key=ev_key, confidence=conf))
            continue

        rules.manual_review_flags.append(f"unsupported_scan_type:{source.path}")

    rules.table_821 = _parse_table_821(blocks)
    rules.table_822 = _parse_table_822(blocks)
    rules.textual_requirements = _extract_text_requirements(blocks)
    rules.measure_definitions = _default_measure_definitions(rules.textual_requirements)

    if not rules.table_821:
        rules.manual_review_flags.append("table_821_unparsed")
    if not rules.table_822:
        rules.manual_review_flags.append("table_822_unparsed")

    # Manual fallback if OCR does not provide tables.
    manual_source = _materialize_manual_table(project_input.manual_table_input)
    if manual_source is not None and (not rules.table_821 or not rules.table_822):
        if manual_source.table_821:
            rules.table_821 = [Table821Entry(**row) for row in manual_source.table_821]
        if manual_source.table_822:
            rules.table_822 = [Table822Entry(**row) for row in manual_source.table_822]
        if manual_source.textual_requirements:
            rebuilt: Dict[str, TextRequirement] = {}
            for key, value in manual_source.textual_requirements.items():
                if isinstance(value, dict):
                    payload = dict(value)
                    payload.pop("key", None)
                    rebuilt[key] = TextRequirement(key=key, **payload)
                else:
                    rebuilt[key] = TextRequirement(
                        key=key,
                        requirement_text=str(value),
                        status="found",
                        evidence_keys=[],
                    )
            rules.textual_requirements = rebuilt
        rules.extraction_notes.append("manual_table_input_applied")

    if not rules.table_821 or not rules.table_822:
        rules.extraction_notes.append(
            "OCR incomplete. Keep 미지정 values and escalate manual_review_flags."
        )

    if project_input.project_meta.allow_web_fetch:
        # No automatic web merging is performed. We only mark that optional
        # verification may be conducted manually to avoid source conflict.
        rules.extraction_notes.append(
            "allow_web_fetch=true: optional human-assisted reference verification allowed."
        )

    return rules

