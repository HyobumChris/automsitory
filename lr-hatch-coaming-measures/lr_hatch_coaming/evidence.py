"""Evidence generator — audit-ready JSON + OCR snippet references.

Produces the evidence/ directory with OCR snippets and links
each MeasureApplication to its source evidence.
"""

from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Optional

from .models import (
    DecisionResult,
    MeasureApplication,
    RulesExtraction,
)


def write_evidence(
    output_dir: str,
    rules_extraction: RulesExtraction,
    decision_result: DecisionResult,
) -> Dict[str, str]:
    """Write evidence files to output_dir/evidence/."""
    evidence_dir = os.path.join(output_dir, "evidence")
    snippets_dir = os.path.join(evidence_dir, "ocr_snippets")
    os.makedirs(snippets_dir, exist_ok=True)

    paths: Dict[str, str] = {}

    # Write OCR source snippets as individual text files
    for label, snippet_text in rules_extraction.source_snippets.items():
        safe_label = label.replace("/", "_").replace(" ", "_")
        snippet_path = os.path.join(snippets_dir, f"{safe_label}.txt")
        with open(snippet_path, "w", encoding="utf-8") as f:
            f.write(snippet_text)
        paths[f"snippet_{safe_label}"] = snippet_path

    # Write textual requirements as separate evidence
    if rules_extraction.textual_requirements:
        reqs_path = os.path.join(evidence_dir, "textual_requirements.json")
        with open(reqs_path, "w", encoding="utf-8") as f:
            json.dump(rules_extraction.textual_requirements, f, indent=2, ensure_ascii=False)
        paths["textual_requirements"] = reqs_path

    # Write OCR confidence report
    if rules_extraction.ocr_confidence:
        conf_path = os.path.join(evidence_dir, "ocr_confidence.json")
        with open(conf_path, "w", encoding="utf-8") as f:
            json.dump(rules_extraction.ocr_confidence, f, indent=2)
        paths["ocr_confidence"] = conf_path

    # Write extraction warnings
    if rules_extraction.extraction_warnings:
        warn_path = os.path.join(evidence_dir, "extraction_warnings.json")
        with open(warn_path, "w", encoding="utf-8") as f:
            json.dump(rules_extraction.extraction_warnings, f, indent=2, ensure_ascii=False)
        paths["extraction_warnings"] = warn_path

    return paths


def write_audit_json(
    output_dir: str,
    rules_extraction: RulesExtraction,
    decision_result: DecisionResult,
) -> Dict[str, str]:
    """Write the main audit JSON files."""
    os.makedirs(output_dir, exist_ok=True)
    paths: Dict[str, str] = {}

    # rules_extraction.json
    rules_path = os.path.join(output_dir, "rules_extraction.json")
    with open(rules_path, "w", encoding="utf-8") as f:
        f.write(rules_extraction.model_dump_json(indent=2))
    paths["rules_extraction"] = rules_path

    # decision_results.json
    decision_path = os.path.join(output_dir, "decision_results.json")
    with open(decision_path, "w", encoding="utf-8") as f:
        f.write(decision_result.model_dump_json(indent=2))
    paths["decision_results"] = decision_path

    return paths
