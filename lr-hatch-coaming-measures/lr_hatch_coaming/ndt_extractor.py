"""NDT/NDE clause extraction from LR rule text and OCR output.

Parses structured NDT requirements from pasted text, OCR snippets, and
merged textual_requirements keys produced by ocr_extractor.
"""

from __future__ import annotations

import json
import logging
import os
import re
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from .models import (
    UNSPECIFIED,
    EnhancedNDEMethod,
    EvidenceBlock,
    NdtCategory,
    NdtClause,
    NdtExtraction,
    NdtMethod,
    RulesExtraction,
    Sources,
)

logger = logging.getLogger(__name__)

# Default regulation texts when OCR/fallback is sparse
_FALLBACK_REGULATION_PATH = Path(__file__).resolve().parents[2] / "configs" / "rules_extraction_fallback.json"

# Mapping from textual_requirements keys → structured clause metadata
_CLAUSE_SPECS: Dict[str, Dict] = {
    "measure_1_ut_requirement": {
        "clause_id": "measure_1_ut",
        "measure_ids": [1],
        "coverage": "100%",
        "scope": (
            "Upper flange longitudinal members, block-to-block butt joints, "
            "cargo hold region, during construction"
        ),
        "rule_ref": "Pt 4, Ch 8, 2.3.8",
        "method": EnhancedNDEMethod.UT,
    },
    "note_2_measure_2": {
        "clause_id": "measure_2_in_service",
        "measure_ids": [2],
        "coverage": "periodic",
        "scope": "In-service NDE; frequency and extent agreed with LR",
        "rule_ref": "Pt 4, Ch 8, 2.3.10(d)",
        "method": None,
    },
    "measure_3_enhanced_nde": {
        "clause_id": "measure_3_enhanced_nde",
        "measure_ids": [3],
        "coverage": "enhanced",
        "scope": "Stricter NDE acceptance criteria per ShipRight",
        "rule_ref": "Pt 4, Ch 8, 2.3.10(d)",
        "method": None,
    },
    "enhanced_nde_ctod": {
        "clause_id": "measure_3_ctod",
        "measure_ids": [3],
        "coverage": None,
        "scope": "CTOD at minimum design temperature",
        "rule_ref": "Pt 4, Ch 8, 2.3.10(d)",
        "method": None,
    },
    "enhanced_nde_acceptance": {
        "clause_id": "measure_3_acceptance",
        "measure_ids": [3],
        "coverage": "enhanced",
        "scope": "ShipRight stricter acceptance criteria",
        "rule_ref": "ShipRight procedures",
        "method": None,
    },
    "egw_not_permitted": {
        "clause_id": "egw_prohibition",
        "measure_ids": [3],
        "coverage": None,
        "scope": "Electrogas welding prohibited when enhanced NDE required",
        "rule_ref": "Pt 4, Ch 8, 2.3.10(d)",
        "method": None,
    },
    "ctod_requirement": {
        "clause_id": "ctod_requirement",
        "measure_ids": [3],
        "coverage": None,
        "scope": "CTOD fracture toughness requirement",
        "rule_ref": "Pt 4, Ch 8, 2.3.10(d)",
        "method": None,
    },
}

_METHOD_PATTERNS: List[Tuple[re.Pattern, EnhancedNDEMethod]] = [
    (re.compile(r"\bPAUT\b", re.I), EnhancedNDEMethod.PAUT),
    (re.compile(r"\bTOFD\b", re.I), EnhancedNDEMethod.TOFD),
    (re.compile(r"\bRT\b|\bradiographic\b", re.I), EnhancedNDEMethod.RT),
    (re.compile(r"\bUT\b|\bultrasonic\b", re.I), EnhancedNDEMethod.UT),
]

# Full NDT method detection (not limited to enhanced-NDE methods)
_NDT_METHOD_PATTERNS: List[Tuple[re.Pattern, NdtMethod]] = [
    (re.compile(r"\bPAUT\b|phased[- ]array", re.I), NdtMethod.PAUT),
    (re.compile(r"\bTOFD\b|time[- ]of[- ]flight", re.I), NdtMethod.TOFD),
    (re.compile(r"\bRT\b|radiograph", re.I), NdtMethod.RT),
    (re.compile(r"\bUT\b|ultrasonic", re.I), NdtMethod.UT),
    (re.compile(r"\bMT\b|magnetic[- ]particle", re.I), NdtMethod.MT),
    (re.compile(r"\bPT\b|liquid[- ]penetrant|dye[- ]penetrant|penetrant test", re.I), NdtMethod.PT),
    (re.compile(r"\bVT\b|visual (?:test|examination|inspection)", re.I), NdtMethod.VT),
    (re.compile(r"\bET\b|eddy[- ]current", re.I), NdtMethod.ET),
]


def _detect_method(text: str) -> Optional[EnhancedNDEMethod]:
    for pattern, method in _METHOD_PATTERNS:
        if pattern.search(text):
            return method
    return None


def _detect_methods(text: str) -> List[NdtMethod]:
    """Detect all NDT methods mentioned in a text snippet."""
    found: List[NdtMethod] = []
    for pattern, method in _NDT_METHOD_PATTERNS:
        if pattern.search(text) and method not in found:
            found.append(method)
    return found


def _load_fallback_regulation_texts() -> Dict[str, str]:
    if not _FALLBACK_REGULATION_PATH.is_file():
        return {}
    try:
        with open(_FALLBACK_REGULATION_PATH, encoding="utf-8") as f:
            data = json.load(f)
        texts = data.get("regulation_texts", {})
        return {k: v.get("text", "") if isinstance(v, dict) else str(v) for k, v in texts.items()}
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("Could not load fallback regulation texts: %s", exc)
        return {}


def _merge_text_sources(
    rules: RulesExtraction,
    sources: Sources,
) -> Tuple[str, Dict[str, str]]:
    """Combine OCR text, pasted text, and textual_requirements into one corpus."""
    parts: List[str] = []
    keyed_text: Dict[str, str] = dict(rules.textual_requirements)

    if sources.rule_text_paste and sources.rule_text_paste.strip():
        parts.append(sources.rule_text_paste.strip())

    for snippet in rules.source_snippets.values():
        if snippet.strip():
            parts.append(snippet)

    fallback = _load_fallback_regulation_texts()
    for key, text in fallback.items():
        keyed_text.setdefault(key, text)

    combined = "\n\n".join(parts)
    if keyed_text:
        combined += "\n\n" + "\n\n".join(keyed_text.values())

    return combined, keyed_text


def _clause_from_key(
    key: str,
    text: str,
    scan_file: str = UNSPECIFIED,
    confidence: Optional[float] = None,
) -> Optional[NdtClause]:
    spec = _CLAUSE_SPECS.get(key)
    if not spec:
        return None

    method = spec.get("method") or _detect_method(text)

    return NdtClause(
        clause_id=spec["clause_id"],
        category=NdtCategory.measure,
        measure_ids=list(spec["measure_ids"]),
        method=method,
        methods=_detect_methods(text),
        coverage=spec.get("coverage"),
        scope=spec.get("scope"),
        requirement_text=text.strip(),
        rule_ref=spec.get("rule_ref"),
        evidence=EvidenceBlock(
            scan_file=scan_file,
            ocr_confidence=confidence,
            snippet_path=f"evidence/ocr_snippets/{key}.txt",
        ),
    )


def _extract_from_free_text(text: str) -> List[NdtClause]:
    """Heuristic extraction directly from combined rule text."""
    clauses: List[NdtClause] = []
    low = text.lower()
    seen_ids: set[str] = set()

    patterns: List[Tuple[str, re.Pattern]] = [
        (
            "measure_1_ut",
            re.compile(
                r"(100\s*%\s*(?:UT|ultrasonic|NDE|NDT)[^.]{0,250}\.)",
                re.I | re.S,
            ),
        ),
        (
            "measure_2_in_service",
            re.compile(
                r"((?:periodic|in[- ]service)\s+(?:NDE|NDT)[^.]{0,250}\.)",
                re.I | re.S,
            ),
        ),
        (
            "measure_3_enhanced_nde",
            re.compile(
                r"(enhanced\s+(?:NDE|NDT)[^.]{0,300}\.)",
                re.I | re.S,
            ),
        ),
        (
            "measure_3_ctod",
            re.compile(
                r"(CTOD[^.]{0,200}0\.18\s*mm[^.]*\.)",
                re.I | re.S,
            ),
        ),
        (
            "egw_prohibition",
            re.compile(
                r"((?:EGW|electrogas)[^.]{0,200}(?:not permitted|prohibited|shall not)[^.]*\.)",
                re.I | re.S,
            ),
        ),
        (
            "measure_2_in_service",
            re.compile(
                r"(Note\s*2[^.]{0,300}(?:NDE|NDT)[^.]*\.)",
                re.I | re.S,
            ),
        ),
    ]

    spec_by_id = {s["clause_id"]: s for s in _CLAUSE_SPECS.values()}
    # Ensure measure-2 clauses always carry their measure id
    spec_by_id.setdefault("measure_2_in_service", {"clause_id": "measure_2_in_service", "measure_ids": [2]})

    for clause_id, pattern in patterns:
        match = pattern.search(text)
        if not match:
            continue
        if clause_id in seen_ids:
            continue
        seen_ids.add(clause_id)

        snippet = match.group(1).strip()
        spec = spec_by_id.get(clause_id, {})
        clauses.append(
            NdtClause(
                clause_id=spec.get("clause_id", clause_id),
                category=NdtCategory.measure,
                measure_ids=list(spec.get("measure_ids", [])),
                method=spec.get("method") or _detect_method(snippet),
                methods=_detect_methods(snippet),
                coverage=spec.get("coverage"),
                scope=spec.get("scope"),
                requirement_text=snippet,
                rule_ref=spec.get("rule_ref"),
                evidence=EvidenceBlock(snippet_path=f"evidence/ocr_snippets/{clause_id}.txt"),
            )
        )

    # Note 2 keyword fallback
    if "note 2" in low and "measure_2_in_service" not in seen_ids:
        idx = low.find("note 2")
        snippet = text[max(0, idx - 20) : idx + 300].strip()
        spec = spec_by_id.get("measure_2_in_service", {})
        clauses.append(
            NdtClause(
                clause_id="measure_2_in_service",
                category=NdtCategory.measure,
                measure_ids=[2],
                coverage="periodic",
                scope=spec.get("scope"),
                requirement_text=snippet,
                rule_ref=spec.get("rule_ref", "Pt 4, Ch 8, 2.3.10(d)"),
                evidence=EvidenceBlock(snippet_path="evidence/ocr_snippets/note_2_measure_2.txt"),
            )
        )

    return clauses


# ── General (measure-agnostic) NDT extraction ───────────────────────────────

# Sentence-level classifiers. Order matters: earlier categories win when a
# sentence matches multiple. Each entry: (category, signal regex).
_CATEGORY_SIGNALS: List[Tuple[NdtCategory, re.Pattern]] = [
    (
        NdtCategory.service_supplier,
        re.compile(
            r"service supplier|approved firm|approval of firm|firms? engaged|"
            r"recognized (?:firm|organization)|supplier of .{0,20}service|"
            r"approved (?:NDT|NDE) (?:company|contractor|firm)",
            re.I,
        ),
    ),
    (
        NdtCategory.survey,
        re.compile(
            r"survey|close[- ]up|thickness measurement|special survey|"
            r"periodical survey|intermediate survey|annual survey|"
            r"checkpoint|critical (?:area|location)|suspect area|in[- ]service inspection",
            re.I,
        ),
    ),
    (
        NdtCategory.qualification,
        re.compile(
            r"ISO\s?9712|SNT[- ]TC[- ]1A|level\s+(?:I{1,3}|1|2|3)\b|"
            r"qualif(?:ied|ication)|certif(?:ied|ication)|personnel|operator competence",
            re.I,
        ),
    ),
    (
        NdtCategory.acceptance,
        re.compile(
            r"acceptance criteri|shall not exceed|rejectable|defect|"
            r"indication.{0,30}(?:exceed|length|accept)|"
            r"flaw|porosity|crack.{0,20}(?:not|reject)",
            re.I,
        ),
    ),
    (
        NdtCategory.prohibition,
        re.compile(
            r"not permitted|prohibited|shall not be (?:used|permitted|applied)|"
            r"is not (?:allowed|acceptable)",
            re.I,
        ),
    ),
    (
        NdtCategory.extent,
        re.compile(
            r"\d{1,3}\s*%|spot (?:check|examination)|random|extent of "
            r"(?:examination|testing|NDE|NDT)|sampling|every \d+",
            re.I,
        ),
    ),
    (
        NdtCategory.timing,
        re.compile(
            r"during construction|during fabrication|in[- ]service|"
            r"periodic|after welding|prior to|post[- ]weld",
            re.I,
        ),
    ),
]

# A sentence is NDT-relevant if it mentions any of these signals.
# Includes explicit methods plus inspection-specific phrases (extent,
# acceptance, survey checkpoints, service supplier) so that clauses without
# a method keyword are still captured.
_NDT_RELEVANCE = re.compile(
    r"\bNDT\b|\bNDE\b|non[- ]?destructive (?:test|examination)|non[- ]?destructive|"
    r"\bUT\b|ultrasonic|\bRT\b|radiograph|"
    r"\bMT\b|magnetic[- ]particle|\bPT\b|penetrant|\bVT\b|visual (?:test|examination|inspection)|"
    r"\bET\b|eddy[- ]current|\bPAUT\b|\bTOFD\b|examination of weld|weld(?:ing)? inspection|"
    r"extent of examination|acceptance criteri|rejectable|indication.{0,30}(?:exceed|length|accept)|"
    r"close[- ]up survey|thickness measurement|service supplier|"
    r"firms? engaged|spot (?:check|examination)|examination shall be|"
    r"ISO\s?9712|SNT[- ]TC[- ]1A|certified to .{0,20}level|operators? shall be (?:qualified|certified)",
    re.I,
)

_RULE_REF_PATTERN = re.compile(
    r"Pt\s*\d+[^.,;]{0,40}?Ch\s*\d+[^.,;]{0,40}?\d+(?:\.\d+)*", re.I
)


def _split_sentences(text: str) -> List[str]:
    # Split on sentence boundaries but keep clauses reasonably whole
    raw = re.split(r"(?<=[.;])\s+|\n{2,}", text)
    return [s.strip() for s in raw if s and s.strip()]


def _classify_category(sentence: str) -> NdtCategory:
    for category, pattern in _CATEGORY_SIGNALS:
        if pattern.search(sentence):
            return category
    if _detect_methods(sentence):
        return NdtCategory.method
    return NdtCategory.general


def _extract_general_ndt_clauses(text: str) -> List[NdtClause]:
    """Extract measure-agnostic NDT clauses from arbitrary LR rule text.

    Covers service supplier management, hull survey checkpoints, personnel
    qualification, method/extent/acceptance/timing/prohibition clauses, etc.
    """
    clauses: List[NdtClause] = []
    seen_texts: set[str] = set()
    counters: Dict[str, int] = {}

    for sentence in _split_sentences(text):
        if len(sentence) < 12:
            continue
        if not _NDT_RELEVANCE.search(sentence):
            continue

        norm = re.sub(r"\s+", " ", sentence.lower())[:120]
        if norm in seen_texts:
            continue
        seen_texts.add(norm)

        category = _classify_category(sentence)
        methods = _detect_methods(sentence)
        ref_match = _RULE_REF_PATTERN.search(sentence)
        rule_ref = ref_match.group(0).strip() if ref_match else None

        counters[category.value] = counters.get(category.value, 0) + 1
        clause_id = f"ndt_{category.value}_{counters[category.value]:02d}"

        clauses.append(
            NdtClause(
                clause_id=clause_id,
                category=category,
                measure_ids=[],
                method=_detect_method(sentence),
                methods=methods,
                requirement_text=sentence.strip(),
                rule_ref=rule_ref,
                evidence=EvidenceBlock(
                    snippet_path=f"evidence/ocr_snippets/{clause_id}.txt"
                ),
            )
        )

    return clauses


def _merge_clause_lists(
    primary: List[NdtClause],
    secondary: List[NdtClause],
) -> List[NdtClause]:
    """Merge clause lists, avoiding duplicate requirement_text."""
    merged: List[NdtClause] = list(primary)
    seen = {re.sub(r"\s+", " ", c.requirement_text.lower())[:120] for c in primary}
    for clause in secondary:
        norm = re.sub(r"\s+", " ", clause.requirement_text.lower())[:120]
        if norm not in seen:
            seen.add(norm)
            merged.append(clause)
    return merged


def extract_ndt_from_text(text: str) -> NdtExtraction:
    """Extract NDT clauses from pasted or OCR-combined plain text.

    Combines measure-specific (M1-5) parsing with measure-agnostic general
    NDT extraction (service supplier, survey, qualification, method, etc.).
    """
    result = NdtExtraction()
    if not text.strip():
        result.extraction_warnings.append("No rule text provided for NDT extraction.")
        return result

    measure_clauses = _extract_from_free_text(text)
    general_clauses = _extract_general_ndt_clauses(text)
    result.clauses = _merge_clause_lists(measure_clauses, general_clauses)

    if not result.clauses:
        result.extraction_warnings.append(
            "No NDT/NDE clauses detected in provided text. "
            "Verify that the text contains NDT/NDE, UT, RT, MT, PT, VT, or related content."
        )
    return result


def extract_ndt_from_pdf(
    pdf_path: str,
    max_pages: Optional[int] = None,
) -> NdtExtraction:
    """Extract NDT clauses directly from a (multi-page) PDF rule document.

    Reads the full document text (embedded text, with OCR fallback for
    scanned pages) and runs both measure-specific and general NDT extraction.
    This is the entry point for "throw any LR rule PDF" workflows.
    """
    from .ocr_extractor import _extract_pdf_all_pages

    result = NdtExtraction()
    if not os.path.isfile(pdf_path):
        result.extraction_warnings.append(f"PDF not found: {pdf_path}")
        return result

    text, conf, n_pages = _extract_pdf_all_pages(pdf_path, max_pages=max_pages)
    if not text.strip():
        result.extraction_warnings.append(
            f"No extractable text from {pdf_path}. "
            "If this is a scanned PDF, install OCR extras: pip install -e '.[ocr]'."
        )
        return result

    extraction = extract_ndt_from_text(text)
    result.clauses = extraction.clauses
    result.extraction_warnings = extraction.extraction_warnings
    result.extraction_warnings.append(
        f"Extracted from {n_pages} page(s) of {os.path.basename(pdf_path)} "
        f"(avg OCR/text confidence {conf:.2f})."
    )
    return result


def extract_ndt_specs(
    rules: RulesExtraction,
    sources: Sources,
) -> NdtExtraction:
    """Extract structured NDT clauses from rules extraction and sources."""
    result = NdtExtraction()
    combined, keyed_text = _merge_text_sources(rules, sources)

    # Build clauses from known textual_requirements keys
    clauses_by_id: Dict[str, NdtClause] = {}
    avg_conf = (
        sum(rules.ocr_confidence.values()) / len(rules.ocr_confidence)
        if rules.ocr_confidence
        else None
    )
    scan_file = (
        sources.scanned_rule_images[0].file_path
        if sources.scanned_rule_images
        else UNSPECIFIED
    )

    for key, text in keyed_text.items():
        if not text.strip():
            continue
        clause = _clause_from_key(key, text, scan_file=scan_file, confidence=avg_conf)
        if clause:
            clauses_by_id[clause.clause_id] = clause

    # Supplement with free-text heuristics
    if combined.strip():
        for clause in _extract_from_free_text(combined):
            if clause.clause_id not in clauses_by_id:
                clauses_by_id[clause.clause_id] = clause

    measure_clauses = list(clauses_by_id.values())

    # General (measure-agnostic) NDT clauses: service supplier, survey,
    # qualification, method, extent, acceptance, etc.
    general_clauses: List[NdtClause] = []
    if combined.strip():
        general_clauses = _extract_general_ndt_clauses(combined)

    result.clauses = _merge_clause_lists(measure_clauses, general_clauses)

    if not result.clauses:
        result.extraction_warnings.append(
            "No NDT clauses extracted. Using fallback regulation texts if available."
        )
        fallback = _load_fallback_regulation_texts()
        _ndt_keywords = (
            "nde", "ndt", "non-destructive", "nondestructive", "non destructive",
            "ut", "ultrasonic", "rt", "radiograph", "mt", "magnetic particle",
            "pt", "penetrant", "vt", "visual", "ctod",
        )
        for key, text in fallback.items():
            if any(kw in text.lower() for kw in _ndt_keywords):
                clause = _clause_from_key(key, text)
                if clause and clause.clause_id not in clauses_by_id:
                    clauses_by_id[clause.clause_id] = clause
        result.clauses = list(clauses_by_id.values())

    result.extraction_warnings.extend(rules.extraction_warnings)
    return result


def enrich_applications_with_ndt(
    applications: list,
    ndt_extraction: NdtExtraction,
) -> list:
    """Fill evidence_snippet_key on MeasureApplication records from NDT clauses."""
    clause_map: Dict[int, str] = {}
    for clause in ndt_extraction.clauses:
        for mid in clause.measure_ids:
            if mid not in clause_map:
                clause_map[mid] = clause.clause_id

    measure_key_map = {
        1: "measure_1_ut",
        2: "note_2_measure_2",
        3: "measure_3_enhanced_nde",
    }

    for app in applications:
        if app.evidence_snippet_key:
            continue
        key = measure_key_map.get(app.measure_id, clause_map.get(app.measure_id, ""))
        if key:
            app.evidence_snippet_key = key

    return applications


def write_ndt_snippets(
    output_dir: str,
    ndt_extraction: NdtExtraction,
    keyed_text: Optional[Dict[str, str]] = None,
) -> Dict[str, str]:
    """Write per-clause OCR snippet text files for evidence trail."""
    snippets_dir = os.path.join(output_dir, "evidence", "ocr_snippets")
    os.makedirs(snippets_dir, exist_ok=True)
    paths: Dict[str, str] = {}
    keyed_text = keyed_text or {}

    for clause in ndt_extraction.clauses:
        safe_name = clause.clause_id.replace("/", "_")
        snippet_path = os.path.join(snippets_dir, f"{safe_name}.txt")
        with open(snippet_path, "w", encoding="utf-8") as f:
            f.write(clause.requirement_text)
        paths[clause.clause_id] = snippet_path

    for key, text in keyed_text.items():
        if key in _CLAUSE_SPECS:
            safe_name = key.replace("/", "_")
            snippet_path = os.path.join(snippets_dir, f"{safe_name}.txt")
            if not os.path.isfile(snippet_path):
                with open(snippet_path, "w", encoding="utf-8") as f:
                    f.write(text)
                paths[key] = snippet_path

    return paths
