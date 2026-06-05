"""Tests for learning module generator."""

from __future__ import annotations

import json
import os
import shutil
import tempfile

import pytest

from lr_hatch_coaming.models import (
    ControlParameters,
    DecisionResult,
    MeasureStatus,
    NdtClause,
    NdtExtraction,
    ProjectMeta,
)
from lr_hatch_coaming.ndt_extractor import extract_ndt_from_text
from lr_hatch_coaming.learning_generator import (
    generate_learning_modules,
    write_learning_outputs,
)


SAMPLE_TEXT = """
100% ultrasonic testing during construction on block-to-block butt joints.
Note 2: Where enhanced NDE is adopted as Measure 3, periodic in-service NDE may be required.
CTOD value shall not be less than 0.18 mm at the minimum design temperature.
Enhanced NDE shall comply with ShipRight procedures.
"""


@pytest.fixture
def output_dir():
    d = tempfile.mkdtemp(prefix="lr_learning_test_")
    yield d
    shutil.rmtree(d, ignore_errors=True)


def _decision_result(required: dict) -> DecisionResult:
    return DecisionResult(
        project_meta=ProjectMeta(project_id="LEARN-TEST-001"),
        control_parameters=ControlParameters(t_control=75.0, y_control=390),
        required_measures={str(k): v.value for k, v in required.items()},
    )


class TestLearningGenerator:

    def test_generates_m1_module(self, output_dir):
        ndt = extract_ndt_from_text(SAMPLE_TEXT)
        decision = _decision_result({1: MeasureStatus.required, 2: MeasureStatus.not_required})
        output = generate_learning_modules(ndt, decision, {}, output_dir)
        assert any(m.module_id == "M1_100pct_UT" for m in output.modules)
        assert os.path.isfile(os.path.join(output_dir, "learning", "modules", "M1_100pct_UT.md"))

    def test_generates_m2_when_conditional(self, output_dir):
        ndt = extract_ndt_from_text(SAMPLE_TEXT)
        decision = _decision_result({
            1: MeasureStatus.required,
            2: MeasureStatus.conditional,
            3: MeasureStatus.required,
        })
        output = generate_learning_modules(ndt, decision, {}, output_dir)
        assert any(m.module_id == "M2_in_service_NDE" for m in output.modules)

    def test_quiz_bank_has_ctod_question(self, output_dir):
        ndt = extract_ndt_from_text(SAMPLE_TEXT)
        decision = _decision_result({3: MeasureStatus.required})
        output = generate_learning_modules(ndt, decision, {}, output_dir)
        ctod_quiz = next((q for q in output.quiz_items if "CTOD" in q.question_en), None)
        assert ctod_quiz is not None
        assert ctod_quiz.correct_answer == "False"

    def test_write_learning_outputs(self, output_dir):
        ndt = extract_ndt_from_text(SAMPLE_TEXT)
        # Activate M1 and M3 so measure-specific quizzes are generated
        decision = _decision_result({
            1: MeasureStatus.required,
            3: MeasureStatus.required,
        })
        output = generate_learning_modules(ndt, decision, {}, output_dir)
        paths = write_learning_outputs(output_dir, output)

        assert os.path.isfile(paths["modules_index"])
        assert os.path.isfile(paths["quiz_bank"])

        with open(paths["modules_index"]) as f:
            index = json.load(f)
        assert index["total_modules"] >= 1
        assert index["total_quizzes"] >= 1

        with open(paths["quiz_bank"]) as f:
            quizzes = json.load(f)
        assert len(quizzes) >= 3

    def test_measure_quizzes_gated_without_measures(self, output_dir):
        """A generic doc (no active measures) should not get hatch-coaming M2/M3 quizzes."""
        general_text = """
        Firms engaged in NDT services shall be approved as service suppliers.
        Magnetic particle testing (MT) for surface defects.
        """
        ndt = extract_ndt_from_text(general_text)
        decision = _decision_result({})
        output = generate_learning_modules(ndt, decision, {}, output_dir)
        quiz_ids = {q.quiz_id for q in output.quiz_items}
        assert "Q-M3-CTOD-TF-001" not in quiz_ids
        assert "Q-M2-NOTE2-001" not in quiz_ids

    def test_module_content_bilingual(self, output_dir):
        ndt = extract_ndt_from_text(SAMPLE_TEXT)
        decision = _decision_result({1: MeasureStatus.required})
        output = generate_learning_modules(ndt, decision, {}, output_dir)
        m1 = next(m for m in output.modules if m.module_id == "M1_100pct_UT")
        assert "학습 목표" in m1.content_md
        assert "Learning Objectives" in m1.content_md
        assert "NDE" in m1.content_md or "NDT" in m1.content_md

    def test_general_category_modules_generated(self, output_dir):
        general_text = """
        Firms engaged in NDT services shall be approved as service suppliers.
        NDT personnel shall be certified to ISO 9712 Level II.
        Close-up survey and thickness measurement at survey checkpoints.
        Magnetic particle testing (MT) and radiographic testing (RT) required.
        """
        ndt = extract_ndt_from_text(general_text)
        decision = _decision_result({1: MeasureStatus.required})
        output = generate_learning_modules(ndt, decision, {}, output_dir)

        module_ids = {m.module_id for m in output.modules}
        assert "NDT_service_supplier" in module_ids
        assert "NDT_survey" in module_ids
        assert "NDT_qualification" in module_ids

        # Category modules are not tied to a measure
        ss = next(m for m in output.modules if m.module_id == "NDT_service_supplier")
        assert ss.measure_ids == []
        assert os.path.isfile(os.path.join(output_dir, "learning", "modules", "NDT_service_supplier.md"))

    def test_html_viewer_generated(self, output_dir):
        ndt = extract_ndt_from_text(SAMPLE_TEXT)
        decision = _decision_result({1: MeasureStatus.required, 3: MeasureStatus.required})
        output = generate_learning_modules(ndt, decision, {}, output_dir)
        paths = write_learning_outputs(output_dir, output)

        assert "viewer_html" in paths
        assert os.path.isfile(paths["viewer_html"])
        with open(paths["viewer_html"], encoding="utf-8") as f:
            html = f.read()
        assert html.startswith("<!DOCTYPE html>")
        assert "const MODULES =" in html
        assert "const QUIZZES =" in html
        # Embedded data must be present (not placeholders)
        assert "__MODULES_JSON__" not in html
        assert "__QUIZZES_JSON__" not in html

    def test_category_quiz_items(self, output_dir):
        general_text = """
        Firms engaged in NDT services shall be approved as service suppliers.
        NDT personnel shall be certified to ISO 9712 Level II.
        """
        ndt = extract_ndt_from_text(general_text)
        decision = _decision_result({1: MeasureStatus.required})
        output = generate_learning_modules(ndt, decision, {}, output_dir)
        quiz_ids = {q.quiz_id for q in output.quiz_items}
        assert "Q-SS-001" in quiz_ids
        assert "Q-QUAL-001" in quiz_ids
