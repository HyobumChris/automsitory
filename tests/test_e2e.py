"""
test_e2e.py – End-to-end tests for the LR Hatch Coaming Measure determination engine.

Three representative test cases:
  1) Case 1 (Low): thickness below table range → minimal measures
  2) Case 2 (High): 85-100mm range → measures 1,3,4,5 with block_shift
  3) Case 3 (Special): t>100mm with EGW + enhanced_NDE → special consideration + noncompliance
"""
import json
import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from services.engine.rules_db import (
    UNSPECIFIED,
    ProjectInput,
    RulesExtractionDB,
    DecisionResults,
)
from services.engine.decision_engine import run_decision_engine
from services.engine.ocr_extract import load_or_extract_rules
from services.engine.diagram_2d import generate_2d_diagrams
from services.engine.model_3d import generate_3d_model


FALLBACK = Path("configs/rules_extraction_fallback.json")


def _load_project(name: str) -> ProjectInput:
    path = Path("inputs") / name
    with open(path, "r", encoding="utf-8") as f:
        return ProjectInput(**json.load(f))


def _get_rules_db() -> RulesExtractionDB:
    return RulesExtractionDB.load(FALLBACK)


class TestCase1Low(unittest.TestCase):
    """Case 1: Low thickness (40mm) at 355 N/mm² → below Table 8.2.1 range."""

    @classmethod
    def setUpClass(cls):
        cls.project = _load_project("project_case1_low.json")
        cls.rules_db = _get_rules_db()
        cls.results = run_decision_engine(cls.project, cls.rules_db)
        cls.tmpdir = tempfile.mkdtemp()

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmpdir, ignore_errors=True)

    def test_control_values(self):
        cv = self.results.control_values
        self.assertEqual(cv.t_control, 40.0)
        self.assertEqual(cv.y_control, 355.0)

    def test_no_measures_required(self):
        self.assertEqual(self.results.required_measures_global, [])

    def test_no_special_consideration(self):
        self.assertFalse(self.results.special_consideration)

    def test_pjp_still_applied(self):
        """PJP is an always-applicable rule for coaming_to_deck connections."""
        j02 = self.results.joint_results.get("J02")
        self.assertIsNotNone(j02)
        measure_ids = [am.measure_id for am in j02.applied_measures]
        self.assertIn(0, measure_ids)
        pjp_measure = [am for am in j02.applied_measures if am.measure_id == 0][0]
        self.assertIn("PJP", pjp_measure.requirements[0].description)

    def test_member_results_empty_or_no_numbered_measures(self):
        for mid, tr in self.results.member_results.items():
            numbered = [am for am in tr.applied_measures if am.measure_id > 0]
            self.assertEqual(len(numbered), 0, f"Member {mid} should have no numbered measures")

    def test_manual_review_flags_has_below_range(self):
        flags_text = " ".join(self.results.manual_review_flags)
        self.assertIn("50", flags_text)

    def test_2d_diagrams_generated(self):
        paths = generate_2d_diagrams(self.project, self.results, self.tmpdir)
        self.assertTrue(len(paths) >= 2)
        for p in paths:
            self.assertTrue(os.path.exists(p))

    def test_3d_model_generated(self):
        paths = generate_3d_model(self.project, self.results, self.tmpdir)
        self.assertTrue(len(paths) >= 2)
        for p in paths:
            self.assertTrue(os.path.exists(p))


class TestCase2High(unittest.TestCase):
    """Case 2: High thickness (90-92mm) at 390 N/mm² → measures 1,3,4,5 with block_shift."""

    @classmethod
    def setUpClass(cls):
        cls.project = _load_project("project_case2_high.json")
        cls.rules_db = _get_rules_db()
        cls.results = run_decision_engine(cls.project, cls.rules_db)
        cls.tmpdir = tempfile.mkdtemp()

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmpdir, ignore_errors=True)

    def test_control_values(self):
        cv = self.results.control_values
        self.assertEqual(cv.t_control, 92.0)
        self.assertEqual(cv.y_control, 390.0)

    def test_required_measures(self):
        self.assertEqual(sorted(self.results.required_measures_global), [1, 3, 4, 5])

    def test_no_special_consideration(self):
        self.assertFalse(self.results.special_consideration)

    def test_measure1_applied_to_butt_joints(self):
        for jid in ["J01", "J03"]:
            tr = self.results.joint_results.get(jid)
            self.assertIsNotNone(tr, f"Joint {jid} should have results")
            measure_ids = [am.measure_id for am in tr.applied_measures]
            self.assertIn(1, measure_ids, f"Joint {jid} should have Measure 1")

    def test_measure3_block_shift_applied(self):
        for jid in ["J01", "J03"]:
            tr = self.results.joint_results.get(jid)
            m3 = [am for am in tr.applied_measures if am.measure_id == 3]
            self.assertTrue(len(m3) > 0, f"Joint {jid} should have Measure 3")
            notes_text = " ".join(m3[0].notes)
            self.assertIn("PASS", notes_text)
            self.assertIn("350", notes_text)

    def test_measure3_bca_coaming_side(self):
        m02 = self.results.member_results.get("M02")
        self.assertIsNotNone(m02, "M02 should have member results")
        m3 = [am for am in m02.applied_measures if am.measure_id == 3]
        self.assertTrue(len(m3) > 0, "M02 should have Measure 3 (BCA)")
        self.assertIn("BCA", m3[0].requirements[0].description)

    def test_measure4_upper_deck(self):
        m01 = self.results.member_results.get("M01")
        self.assertIsNotNone(m01)
        m4 = [am for am in m01.applied_measures if am.measure_id == 4]
        self.assertTrue(len(m4) > 0, "M01 should have Measure 4")
        self.assertIn("BCA", m4[0].requirements[0].description)

    def test_measure5_upper_deck(self):
        m01 = self.results.member_results.get("M01")
        m5 = [am for am in m01.applied_measures if am.measure_id == 5]
        self.assertTrue(len(m5) > 0, "M01 should have Measure 5")

    def test_measure2_not_applied_without_enhanced_nde(self):
        """Measure 2 see_note_2 but option=block_shift → M2 not applied."""
        for jid, tr in self.results.joint_results.items():
            m2 = [am for am in tr.applied_measures if am.measure_id == 2]
            self.assertEqual(len(m2), 0, f"Joint {jid} should NOT have Measure 2")

    def test_cumulative_append_only(self):
        """Verify measures are accumulated and sorted by measure_id."""
        j01 = self.results.joint_results.get("J01")
        ids = [am.measure_id for am in j01.applied_measures]
        self.assertEqual(ids, sorted(ids), "Measures should be sorted by ID")
        self.assertTrue(len(ids) >= 2, "J01 should have at least 2 measures")

    def test_pjp_for_coaming_deck(self):
        j02 = self.results.joint_results.get("J02")
        self.assertIsNotNone(j02)
        m0 = [am for am in j02.applied_measures if am.measure_id == 0]
        self.assertTrue(len(m0) > 0)
        self.assertIn("PJP", m0[0].requirements[0].description)

    def test_no_noncompliance(self):
        self.assertEqual(len(self.results.noncompliance_flags), 0)

    def test_2d_diagrams(self):
        paths = generate_2d_diagrams(self.project, self.results, self.tmpdir)
        self.assertTrue(len(paths) >= 2)

    def test_3d_model(self):
        paths = generate_3d_model(self.project, self.results, self.tmpdir)
        self.assertTrue(len(paths) >= 2)


class TestCase3Special(unittest.TestCase):
    """Case 3: t>100mm, EGW + enhanced_NDE → special consideration + noncompliance."""

    @classmethod
    def setUpClass(cls):
        cls.project = _load_project("project_case3_special.json")
        cls.rules_db = _get_rules_db()
        cls.results = run_decision_engine(cls.project, cls.rules_db)
        cls.tmpdir = tempfile.mkdtemp()

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmpdir, ignore_errors=True)

    def test_control_values(self):
        cv = self.results.control_values
        self.assertEqual(cv.t_control, 110.0)
        self.assertEqual(cv.y_control, 460.0)

    def test_special_consideration(self):
        self.assertTrue(self.results.special_consideration)

    def test_no_table_match(self):
        """t=110 > 100mm → no table 8.2.1 match."""
        self.assertIsNone(self.results.table_821_row_used)

    def test_manual_review_flags_present(self):
        flags_text = " ".join(self.results.manual_review_flags)
        self.assertIn("100", flags_text)
        self.assertIn("special", flags_text.lower())

    def test_pjp_applied(self):
        j02 = self.results.joint_results.get("J02")
        self.assertIsNotNone(j02)
        m0 = [am for am in j02.applied_measures if am.measure_id == 0]
        self.assertTrue(len(m0) > 0)

    def test_2d_diagrams_schematic(self):
        paths = generate_2d_diagrams(self.project, self.results, self.tmpdir)
        self.assertTrue(len(paths) >= 2)

    def test_3d_model_schematic(self):
        paths = generate_3d_model(self.project, self.results, self.tmpdir)
        self.assertTrue(len(paths) >= 2)


class TestAppendOnlyIdempotent(unittest.TestCase):
    """Verify append-only / idempotent behavior of measure application."""

    def test_duplicate_measure_idempotent(self):
        from services.engine.rules_db import TargetResult, AppliedMeasure, Requirement, EvidenceRef
        tr = TargetResult(target_type="member", target_id="test")
        m1 = AppliedMeasure(
            measure_id=3, status="applied", target_type="member", target_id="test",
            requirements=[Requirement(description="Test req 1")],
            notes=["note1"],
        )
        m1_dup = AppliedMeasure(
            measure_id=3, status="applied", target_type="member", target_id="test",
            requirements=[Requirement(description="Test req 2")],
            notes=["note2"],
        )
        tr.add_measure(m1)
        tr.add_measure(m1_dup)
        self.assertEqual(len(tr.applied_measures), 1)
        self.assertIn("note1", tr.applied_measures[0].notes)
        self.assertIn("note2", tr.applied_measures[0].notes)

    def test_measures_sorted_by_id(self):
        from services.engine.rules_db import TargetResult, AppliedMeasure
        tr = TargetResult(target_type="joint", target_id="test")
        tr.add_measure(AppliedMeasure(measure_id=4, status="applied", target_type="joint", target_id="test"))
        tr.add_measure(AppliedMeasure(measure_id=1, status="applied", target_type="joint", target_id="test"))
        tr.add_measure(AppliedMeasure(measure_id=3, status="applied", target_type="joint", target_id="test"))
        ids = [am.measure_id for am in tr.applied_measures]
        self.assertEqual(ids, [1, 3, 4])


class TestNote2MeasureCondition(unittest.TestCase):
    """Verify Note 2 (Measure 2) conditional logic."""

    def test_measure2_applied_with_enhanced_nde(self):
        """When see_note_2 AND enhanced_NDE → M2 conditional."""
        project = _load_project("project_case3_special.json")
        rules_db = _get_rules_db()

        # Modify: set thickness within table range to get see_note_2
        project.members[0].thickness_mm_as_built = 95
        project.members[1].thickness_mm_as_built = 98
        project.members[2].thickness_mm_as_built = 90

        results = run_decision_engine(project, rules_db)
        self.assertIn(2, [
            am.measure_id
            for tr in results.joint_results.values()
            for am in tr.applied_measures
        ])
        for tr in results.joint_results.values():
            m2 = [am for am in tr.applied_measures if am.measure_id == 2]
            for m in m2:
                self.assertEqual(m.status, "conditional")

    def test_measure2_not_applied_with_block_shift(self):
        """When see_note_2 BUT option=block_shift → M2 not applied."""
        project = _load_project("project_case2_high.json")
        rules_db = _get_rules_db()
        results = run_decision_engine(project, rules_db)
        all_m2 = [
            am for tr in results.joint_results.values()
            for am in tr.applied_measures if am.measure_id == 2
        ]
        self.assertEqual(len(all_m2), 0)


class TestRulesDBLookup(unittest.TestCase):
    """Test rules DB lookup functions."""

    @classmethod
    def setUpClass(cls):
        cls.db = _get_rules_db()

    def test_lookup_821_355_60(self):
        row = self.db.lookup_821(355, 60)
        self.assertIsNotNone(row)
        self.assertEqual(row.m1.value, "required")
        self.assertEqual(row.m3.value, "not_required")

    def test_lookup_821_390_90(self):
        row = self.db.lookup_821(390, 90)
        self.assertIsNotNone(row)
        self.assertEqual(row.m1.value, "required")
        self.assertEqual(row.m3.value, "required")
        self.assertEqual(row.m4.value, "required")
        self.assertEqual(row.m5.value, "required")
        self.assertEqual(row.m2.value, "see_note_2")

    def test_lookup_821_below_range(self):
        row = self.db.lookup_821(355, 40)
        self.assertIsNone(row)

    def test_lookup_821_above_range(self):
        row = self.db.lookup_821(460, 110)
        self.assertIsNone(row)

    def test_lookup_822_upper_deck(self):
        row = self.db.lookup_822("upper_deck_plate", 390, 80)
        self.assertIsNotNone(row)
        self.assertEqual(row.bca_type, "BCA2")

    def test_lookup_822_coaming_side(self):
        row = self.db.lookup_822("hatch_coaming_side_plate", 355, 70)
        self.assertIsNotNone(row)
        self.assertEqual(row.bca_type, "BCA1")


class TestEGWNoncompliance(unittest.TestCase):
    """Test EGW noncompliance when enhanced NDE is required."""

    def test_egw_flagged(self):
        """EGW + enhanced NDE within table range → noncompliance."""
        project = _load_project("project_case3_special.json")
        project.members[0].thickness_mm_as_built = 95
        project.members[1].thickness_mm_as_built = 98
        project.members[2].thickness_mm_as_built = 90
        rules_db = _get_rules_db()
        results = run_decision_engine(project, rules_db)

        self.assertTrue(len(results.noncompliance_flags) > 0)
        nc_text = " ".join(results.noncompliance_flags)
        self.assertIn("EGW", nc_text)


if __name__ == "__main__":
    unittest.main()
