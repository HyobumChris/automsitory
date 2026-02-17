"""Scan-first OCR extraction for LR rules with auditable evidence output."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

from .models import ManualReviewFlag, ProjectInput, RuleStatus, UNSPECIFIED
from .rules_db import (
    EvidenceRecord,
    RulesExtractionDB,
    Table821Row,
    Table822Rule,
    TextRequirement,
    load_rules_db,
    parse_manual_table_input,
    save_rules_db,
    status_from_text,
)

try:
    import fitz  # type: ignore

    HAS_FITZ = True
except Exception:
    HAS_FITZ = False

try:
    from PIL import Image  # type: ignore

    HAS_PIL = True
except Exception:
    HAS_PIL = False

try:
    import pytesseract  # type: ignore

    HAS_TESSERACT = True
except Exception:
    HAS_TESSERACT = False


PageEntry = Dict[str, Any]


def _safe_float(value: Any) -> Optional[float]:
    try:
        return float(value)
    except Exception:
        return None


def _next_evidence_id(db: RulesExtractionDB) -> str:
    return f"ev_{len(db.evidence) + 1:05d}"


def _register_evidence(
    db: RulesExtractionDB,
    *,
    key: str,
    scan_file: str,
    page_index: int,
    snippet_path: str,
    text: str,
    confidence: float,
    bbox: Optional[List[int]] = None,
) -> str:
    ev_id = _next_evidence_id(db)
    db.evidence[ev_id] = EvidenceRecord(
        evidence_id=ev_id,
        key=key,
        scan_file=scan_file,
        page_index=page_index,
        bbox=bbox,
        ocr_confidence=confidence,
        snippet_path=snippet_path,
        extracted_text=text[:800],
    )
    return ev_id


def _read_image(path: Path, evidence_dir: Path) -> List[PageEntry]:
    entries: List[PageEntry] = []
    if not HAS_PIL:
        return entries

    img = Image.open(path)
    snippet_path = evidence_dir / f"{path.stem}_p0.png"
    img.save(snippet_path)
    text = ""
    confidence = 0.0
    if HAS_TESSERACT:
        try:
            data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)
            tokens: List[str] = []
            conf_sum = 0.0
            conf_count = 0
            for idx, token in enumerate(data.get("text", [])):
                token = (token or "").strip()
                if not token:
                    continue
                tokens.append(token)
                conf_raw = data.get("conf", [])[idx]
                conf = _safe_float(conf_raw)
                if conf is not None and conf >= 0:
                    conf_sum += conf / 100.0
                    conf_count += 1
            text = " ".join(tokens)
            confidence = conf_sum / conf_count if conf_count else 0.0
        except Exception:
            text = ""
            confidence = 0.0

    entries.append(
        {
            "scan_file": str(path),
            "page_index": 0,
            "text": text,
            "confidence": confidence,
            "snippet_path": str(snippet_path),
        }
    )
    return entries


def _read_pdf(path: Path, page_hint: Any, evidence_dir: Path) -> List[PageEntry]:
    entries: List[PageEntry] = []
    if not HAS_FITZ:
        return entries

    doc = fitz.open(str(path))
    pages: Sequence[int]
    if isinstance(page_hint, int) and 0 <= page_hint < doc.page_count:
        pages = [page_hint]
    else:
        pages = list(range(doc.page_count))

    for page_index in pages:
        page = doc.load_page(page_index)
        page_text = (page.get_text("text") or "").strip()
        confidence = 0.95 if page_text else 0.0
        snippet_path = evidence_dir / f"{path.stem}_p{page_index}.png"
        pix = page.get_pixmap(dpi=220)
        pix.save(str(snippet_path))

        if not page_text and HAS_PIL and HAS_TESSERACT:
            img = Image.open(snippet_path)
            try:
                data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)
                tokens: List[str] = []
                conf_sum = 0.0
                conf_count = 0
                for idx, token in enumerate(data.get("text", [])):
                    token = (token or "").strip()
                    if not token:
                        continue
                    tokens.append(token)
                    conf_raw = data.get("conf", [])[idx]
                    conf = _safe_float(conf_raw)
                    if conf is not None and conf >= 0:
                        conf_sum += conf / 100.0
                        conf_count += 1
                page_text = " ".join(tokens)
                confidence = conf_sum / conf_count if conf_count else 0.0
            except Exception:
                page_text = ""
                confidence = 0.0

        entries.append(
            {
                "scan_file": str(path),
                "page_index": page_index,
                "text": page_text,
                "confidence": confidence,
                "snippet_path": str(snippet_path),
            }
        )
    doc.close()
    return entries


def _status_tokens(line: str) -> List[RuleStatus]:
    tokens = re.findall(r"(See\s*Note\s*2|Not\s*required|Required)", line, flags=re.IGNORECASE)
    return [status_from_text(token) for token in tokens]


def _extract_thickness(line: str) -> Tuple[Optional[float], Optional[float], str]:
    compact = line.replace(" ", "")
    m = re.search(r"(\d+(?:\.\d+)?)<t[<=≤](\d+(?:\.\d+)?)", compact)
    if m:
        t_min = float(m.group(1))
        t_max = float(m.group(2))
        return t_min, t_max, f"{t_min}<t<={t_max}"
    m = re.search(r"t[<=≤](\d+(?:\.\d+)?)", compact)
    if m:
        t_max = float(m.group(1))
        return 0.0, t_max, f"t<={t_max}"
    return None, None, UNSPECIFIED


def _extract_table_821(db: RulesExtractionDB, entries: List[PageEntry]) -> None:
    current_yield: Optional[int] = None
    for entry in entries:
        lines = [ln.strip() for ln in (entry["text"] or "").splitlines() if ln.strip()]
        for line in lines:
            y_match = re.search(r"\b(355|390|460)\b", line)
            if y_match and ("n/mm" in line.lower() or "yield" in line.lower()):
                current_yield = int(y_match.group(1))
                continue

            t_min, t_max, t_range = _extract_thickness(line)
            if t_min is None or t_max is None:
                continue

            if current_yield is None:
                fallback_y = re.search(r"\b(355|390|460)\b", line)
                if fallback_y:
                    current_yield = int(fallback_y.group(1))
                else:
                    db.manual_review_flags.append(
                        ManualReviewFlag(
                            flag_id="ocr_821_missing_yield",
                            message=f"Table 8.2.1 row has no yield context: {line[:120]}",
                            category="rules_extraction",
                            severity="warning",
                        )
                    )
                    continue

            tokens = _status_tokens(line)
            if len(tokens) < 4:
                db.manual_review_flags.append(
                    ManualReviewFlag(
                        flag_id="ocr_821_incomplete_row",
                        message=f"Could not parse all statuses from line: {line[:140]}",
                        category="rules_extraction",
                        severity="warning",
                    )
                )
                m1 = m2 = m3 = m4 = m5 = RuleStatus.unspecified
                raw_m3m4 = UNSPECIFIED
            else:
                m1 = tokens[0]
                m2 = tokens[1]
                if len(tokens) >= 5:
                    m3 = tokens[2]
                    m4 = tokens[3]
                    m5 = tokens[4]
                    raw_m3m4 = "split"
                else:
                    raw_m3m4 = tokens[2].value
                    m3 = tokens[2]
                    m4 = tokens[2]
                    m5 = tokens[3]

            ev_id = _register_evidence(
                db,
                key=f"table_821_{current_yield}_{t_range}",
                scan_file=entry["scan_file"],
                page_index=entry["page_index"],
                snippet_path=entry["snippet_path"],
                text=line,
                confidence=entry["confidence"],
            )
            row = Table821Row(
                yield_strength_nmm2=current_yield,
                thickness_range=t_range,
                t_min_exclusive=t_min,
                t_max_inclusive=t_max,
                m1=m1,
                m2=m2,
                m3=m3,
                m4=m4,
                m5=m5,
                raw_m3m4_column=raw_m3m4,
                evidence_by_measure={
                    "m1": ev_id,
                    "m2": ev_id,
                    "m3": ev_id,
                    "m4": ev_id,
                    "m5": ev_id,
                },
            )
            db.table_821.append(row)


def _normalize_member_role(raw: str) -> str:
    low = raw.lower()
    if "upper deck" in low:
        return "upper_deck_plate"
    if "coaming side" in low or "hatch coaming side" in low:
        return "hatch_coaming_side_plate"
    return UNSPECIFIED


def _extract_table_822(db: RulesExtractionDB, entries: List[PageEntry]) -> None:
    context_role = UNSPECIFIED
    for entry in entries:
        lines = [ln.strip() for ln in (entry["text"] or "").splitlines() if ln.strip()]
        for line in lines:
            role = _normalize_member_role(line)
            if role != UNSPECIFIED:
                context_role = role

            bca_match = re.search(r"\b(BCA\d+)\b", line, flags=re.IGNORECASE)
            if not bca_match:
                continue

            y_match = re.search(r"\b(355|390|460)\b", line)
            t_min, t_max, t_range = _extract_thickness(line)
            if t_min is None or t_max is None:
                t_min, t_max, t_range = UNSPECIFIED, UNSPECIFIED, UNSPECIFIED
            y_value: Any = int(y_match.group(1)) if y_match else UNSPECIFIED

            ev_id = _register_evidence(
                db,
                key=f"table_822_{context_role}_{bca_match.group(1).upper()}",
                scan_file=entry["scan_file"],
                page_index=entry["page_index"],
                snippet_path=entry["snippet_path"],
                text=line,
                confidence=entry["confidence"],
            )

            db.table_822.append(
                Table822Rule(
                    member_role=context_role,
                    yield_strength_nmm2=y_value,
                    thickness_range=t_range,
                    t_min_exclusive=t_min,
                    t_max_inclusive=t_max,
                    bca_type=bca_match.group(1).upper(),
                    condition_text=line[:220],
                    evidence_id=ev_id,
                )
            )


def _find_first_match(entries: List[PageEntry], patterns: List[str]) -> Optional[Tuple[PageEntry, str]]:
    for entry in entries:
        text = entry["text"] or ""
        for pattern in patterns:
            match = re.search(pattern, text, flags=re.IGNORECASE | re.DOTALL)
            if match:
                return entry, match.group(0)
    return None


def _extract_textual_requirements(db: RulesExtractionDB, entries: List[PageEntry]) -> None:
    specs: Dict[str, Dict[str, Any]] = {
        "measure_1_ut_100": {
            "patterns": [r"(ut|ultrasonic).{0,80}100\s*%", r"100\s*%.{0,80}(ut|ultrasonic)"],
            "normalized": {"nde": "UT", "coverage_percent": 100},
        },
        "block_shift_min_300mm": {
            "patterns": [r"block\s*shift.{0,120}300\s*mm", r"offset.{0,80}300\s*mm"],
            "normalized": {"offset_min_mm": 300},
        },
        "crack_arrest_hole_fatigue_assessment": {
            "patterns": [r"crack\s*arrest\s*hole.{0,180}fatigue", r"hole.{0,160}special.{0,80}fatigue"],
            "normalized": {"fatigue_special_assessment_required": True},
        },
        "enhanced_nde_stricter_acceptance": {
            "patterns": [r"enhanced\s*nde.{0,200}stricter.{0,120}acceptance", r"shipright.{0,200}acceptance"],
            "normalized": {"stricter_acceptance_criteria": True},
        },
        "enhanced_nde_alternative_nde_by_lr_agreement": {
            "patterns": [r"inaccessible.{0,160}alternative\s*nde.{0,120}lr", r"alternative\s*nde.{0,120}agreement"],
            "normalized": {"alternative_nde_by_lr_agreement": True},
        },
        "enhanced_nde_ctod_min_0_18": {
            "patterns": [r"ctod.{0,40}0\.18\s*mm", r"0\.18\s*mm.{0,50}ctod"],
            "normalized": {"ctod_min_mm": 0.18},
        },
        "enhanced_nde_egw_not_permitted": {
            "patterns": [r"egw.{0,80}(not\s+permitted|not\s+allowed|shall\s+not)"],
            "normalized": {"egw_permitted": False},
        },
        "pjp_required_coaming_to_deck": {
            "patterns": [r"(pjp|partial\s+joint\s+penetration).{0,120}(required|approved)"],
            "normalized": {"pjp_required": True},
        },
        "thickness_gt_100_special_consideration": {
            "patterns": [r"thickness.{0,40}>?\s*100\s*mm.{0,160}special\s*consideration"],
            "normalized": {"special_consideration": True},
        },
        "measure3_coaming_side_bca_requirement": {
            "patterns": [r"coaming\s*side\s*plate.{0,160}(bca|brittle\s*crack\s*arrest).{0,80}measure\s*3"],
            "normalized": {"measure3_requires_coaming_side_bca": True},
        },
    }

    for key, meta in specs.items():
        found = _find_first_match(entries, meta["patterns"])
        if not found:
            db.textual_requirements[key] = TextRequirement(
                key=key,
                requirement_text=UNSPECIFIED,
                normalized=meta["normalized"],
                evidence_id="",
            )
            db.manual_review_flags.append(
                ManualReviewFlag(
                    flag_id=f"missing_text_requirement_{key}",
                    message=f"No scan evidence found for requirement key: {key}",
                    category="rules_extraction",
                    severity="warning",
                )
            )
            continue

        entry, matched_text = found
        ev_id = _register_evidence(
            db,
            key=key,
            scan_file=entry["scan_file"],
            page_index=entry["page_index"],
            snippet_path=entry["snippet_path"],
            text=matched_text,
            confidence=entry["confidence"],
        )
        db.textual_requirements[key] = TextRequirement(
            key=key,
            requirement_text=matched_text.strip(),
            normalized=meta["normalized"],
            evidence_id=ev_id,
        )


def _build_from_scans(project_input: ProjectInput, out_dir: Path) -> RulesExtractionDB:
    db = RulesExtractionDB(source_mode="ocr")
    evidence_dir = out_dir / "evidence" / "ocr_snippets"
    evidence_dir.mkdir(parents=True, exist_ok=True)

    all_entries: List[PageEntry] = []
    for src in project_input.sources.scanned_rule_files:
        path = Path(src.path)
        if not path.is_absolute():
            path = (Path.cwd() / path).resolve()
        db.source_files.append(str(path))
        if not path.exists():
            db.manual_review_flags.append(
                ManualReviewFlag(
                    flag_id=f"scan_missing_{src.label}",
                    message=f"Scanned file not found: {path}",
                    category="rules_extraction",
                    severity="error",
                )
            )
            continue

        suffix = path.suffix.lower()
        if suffix == ".pdf":
            all_entries.extend(_read_pdf(path, src.page_hint, evidence_dir))
        elif suffix in {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}:
            all_entries.extend(_read_image(path, evidence_dir))
        else:
            db.manual_review_flags.append(
                ManualReviewFlag(
                    flag_id=f"scan_type_unsupported_{src.label}",
                    message=f"Unsupported scan file format: {path}",
                    category="rules_extraction",
                    severity="warning",
                )
            )

    if not all_entries:
        db.manual_review_flags.append(
            ManualReviewFlag(
                flag_id="ocr_no_entries",
                message="No OCR entries were produced from scanned files.",
                category="rules_extraction",
                severity="error",
            )
        )
        return db

    _extract_table_821(db, all_entries)
    _extract_table_822(db, all_entries)
    _extract_textual_requirements(db, all_entries)

    if not db.table_821:
        db.manual_review_flags.append(
            ManualReviewFlag(
                flag_id="ocr_table821_empty",
                message="Table 8.2.1 extraction failed. Provide manual_table_input.",
                category="rules_extraction",
                severity="error",
            )
        )
    if not db.table_822:
        db.manual_review_flags.append(
            ManualReviewFlag(
                flag_id="ocr_table822_empty",
                message="Table 8.2.2 extraction failed. Provide manual_table_input.",
                category="rules_extraction",
                severity="error",
            )
        )

    db.metadata = {
        "has_fitz": HAS_FITZ,
        "has_pillow": HAS_PIL,
        "has_tesseract": HAS_TESSERACT,
        "allow_web_fetch": project_input.project_meta.allow_web_fetch,
    }
    return db


def extract_or_load_rules_db(project_input: ProjectInput, out_dir: Path) -> RulesExtractionDB:
    """Load existing rules DB, or build from manual table input / OCR scans."""
    existing_path = out_dir / "rules_extraction.json"
    if existing_path.exists():
        db = load_rules_db(existing_path)
        db.source_mode = "existing_json"
        return db

    if project_input.manual_table_input is not None:
        db = parse_manual_table_input(project_input.manual_table_input.model_dump())
        db.metadata["manual_mode_reason"] = "manual_table_input provided"
        save_rules_db(existing_path, db)
        return db

    db = _build_from_scans(project_input, out_dir)
    save_rules_db(existing_path, db)
    return db

