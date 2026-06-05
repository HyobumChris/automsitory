"""Tests for NDT clause extraction."""

from __future__ import annotations

import pytest

from lr_hatch_coaming.models import (
    RulesExtraction,
    Sources,
)
from lr_hatch_coaming.ndt_extractor import (
    enrich_applications_with_ndt,
    extract_ndt_from_text,
    extract_ndt_specs,
)
from lr_hatch_coaming.models import MeasureApplication, MeasureStatus, MeasureTarget


SAMPLE_RULE_TEXT = """
Table 8.2.1 Measures for hatch coaming.

Measure 1: 100% ultrasonic testing (UT) shall be carried out during construction
on all block-to-block butt joints of upper flange longitudinal members
in the cargo hold region. Pt 4, Ch 8, 2.3.8.

Note 2: Where enhanced NDE is adopted as Measure 3, periodic in-service NDE
(Measure 2) may be required. The frequency and extent to be agreed with LR.

Where enhanced NDE is adopted as Measure 3, CTOD value shall not be less than
0.18 mm at the minimum design temperature.

Enhanced NDE shall comply with stricter acceptance criteria in accordance
with ShipRight procedures. PAUT may be used.

Electrogas welding (EGW) is not permitted where enhanced NDE is required as Measure 3.
"""


class TestNdtExtractor:

    def test_extract_ndt_from_text_finds_m1(self):
        result = extract_ndt_from_text(SAMPLE_RULE_TEXT)
        clause_ids = {c.clause_id for c in result.clauses}
        assert "measure_1_ut" in clause_ids

    def test_extract_ndt_from_text_finds_enhanced_nde(self):
        result = extract_ndt_from_text(SAMPLE_RULE_TEXT)
        clause_ids = {c.clause_id for c in result.clauses}
        assert "measure_3_enhanced_nde" in clause_ids
        assert "measure_3_ctod" in clause_ids or "ctod_requirement" in clause_ids

    def test_extract_ndt_from_text_finds_note_2(self):
        result = extract_ndt_from_text(SAMPLE_RULE_TEXT)
        clause_ids = {c.clause_id for c in result.clauses}
        assert "measure_2_in_service" in clause_ids or "note_2_measure_2" in clause_ids

    def test_extract_ndt_from_text_finds_egw_prohibition(self):
        result = extract_ndt_from_text(SAMPLE_RULE_TEXT)
        clause_ids = {c.clause_id for c in result.clauses}
        assert "egw_prohibition" in clause_ids

    def test_extract_ndt_specs_with_pasted_text(self):
        rules = RulesExtraction()
        sources = Sources(rule_text_paste=SAMPLE_RULE_TEXT)
        result = extract_ndt_specs(rules, sources)
        assert len(result.clauses) >= 3

    def test_extract_ndt_specs_fallback_when_empty(self):
        rules = RulesExtraction()
        sources = Sources()
        result = extract_ndt_specs(rules, sources)
        # Should load fallback regulation texts with NDT content
        assert len(result.clauses) >= 1

    def test_enrich_applications_with_ndt(self):
        apps = [
            MeasureApplication(
                measure_id=1,
                measure_name="100% UT",
                status=MeasureStatus.required,
                target_type=MeasureTarget.joint,
                target_id="J-01",
            ),
        ]
        from lr_hatch_coaming.ndt_extractor import extract_ndt_from_text

        ndt = extract_ndt_from_text(SAMPLE_RULE_TEXT)
        enriched = enrich_applications_with_ndt(apps, ndt)
        assert enriched[0].evidence_snippet_key == "measure_1_ut"

    def test_empty_text_warning(self):
        result = extract_ndt_from_text("")
        assert result.extraction_warnings
        assert not result.clauses
