"""Learning module generator from NDT extraction and decision results.

Produces Markdown lessons, quiz bank JSON, and modules index under
output_dir/learning/.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, List, Optional

from .models import (
    DecisionResult,
    LearningModule,
    LearningOutput,
    MeasureStatus,
    NdtClause,
    NdtExtraction,
    QuizItem,
)

logger = logging.getLogger(__name__)

# Measure catalog — aligned with hatch-coaming-3d rulesEngine.ts
_MEASURE_CATALOG: Dict[int, Dict[str, str]] = {
    1: {
        "title_ko": "Measure 1 — 건조 중 100% NDE (UT)",
        "title_en": "Measure 1 — 100% NDE (UT) During Construction",
        "rule_ref": "Pt 4, Ch 8, 2.3.8",
        "desc_ko": (
            "화물창 구역 내 상부 플랜지 종재의 block-to-block butt 용접에 "
            "건조 중 100% 초음파 탐상(UT)을 실시합니다."
        ),
        "desc_en": (
            "100% ultrasonic testing during construction on all block-to-block "
            "butt joints of upper flange longitudinal members in the cargo hold region."
        ),
        "module_file": "M1_100pct_UT.md",
        "difficulty": "basic",
    },
    2: {
        "title_ko": "Measure 2 — 운항 중 주기적 NDE",
        "title_en": "Measure 2 — Periodic In-Service NDE",
        "rule_ref": "Pt 4, Ch 8, 2.3.10(d)",
        "desc_ko": (
            "Measure 3을 enhanced NDE로 충족한 경우 Note 2에 따라 "
            "운항 중 주기적 NDE가 요구될 수 있습니다. 빈도와 범위는 LR과 협의합니다."
        ),
        "desc_en": (
            "Periodic NDE during service may be required per Note 2 when "
            "Measure 3 is achieved via enhanced NDE. Frequency and extent agreed with LR."
        ),
        "module_file": "M2_in_service_NDE.md",
        "difficulty": "intermediate",
    },
    3: {
        "title_ko": "Measure 3 — Enhanced NDE",
        "title_en": "Measure 3 — Enhanced NDE with Stricter Acceptance",
        "rule_ref": "Pt 4, Ch 8, 2.3.10(d)",
        "desc_ko": (
            "ShipRight 절차에 따른 엄격한 수용 기준의 enhanced NDE. "
            "CTOD ≥ 0.18 mm (최저 설계온도). EGW 용접 금지."
        ),
        "desc_en": (
            "Enhanced NDE with stricter acceptance criteria per ShipRight. "
            "CTOD ≥ 0.18 mm at minimum design temperature. EGW not permitted."
        ),
        "module_file": "M3_enhanced_NDE.md",
        "difficulty": "advanced",
    },
}


def _clause_for_measure(clauses: List[NdtClause], measure_id: int) -> Optional[NdtClause]:
    for clause in clauses:
        if measure_id in clause.measure_ids:
            return clause
    return None


def _all_clauses_for_measure(clauses: List[NdtClause], measure_id: int) -> List[NdtClause]:
    return [c for c in clauses if measure_id in c.measure_ids]


def _status_label(status_val: Any) -> str:
    if isinstance(status_val, MeasureStatus):
        return status_val.value
    return str(status_val)


def _render_module_md(
    measure_id: int,
    catalog: Dict[str, str],
    clauses: List[NdtClause],
    required_status: str,
    project_id: str,
) -> str:
    lines = [
        f"# {catalog['title_ko']}",
        "",
        f"**{catalog['title_en']}**",
        "",
        f"- LR Reference: `{catalog['rule_ref']}`",
        f"- Project: `{project_id}`",
        f"- Applicability for this case: **{required_status}**",
        "",
        "## 학습 목표 (Learning Objectives)",
        "",
    ]

    objectives_ko = [
        f"NDE (비파괴검사, NDT) Measure {measure_id}의 적용 조건을 설명할 수 있다.",
        "적용 범위(joint type, zone, construction vs in-service)를 구분할 수 있다.",
        f"Table 8.2.1 및 {catalog['rule_ref']} 근거를 인용할 수 있다.",
    ]
    objectives_en = [
        f"Explain when NDE (Non-Destructive Examination / NDT) Measure {measure_id} applies.",
        "Distinguish scope: joint type, zone, construction vs in-service stage.",
        f"Cite Table 8.2.1 and {catalog['rule_ref']}.",
    ]

    for ko, en in zip(objectives_ko, objectives_en):
        lines.append(f"- **KO:** {ko}")
        lines.append(f"  **EN:** {en}")
    lines.append("")

    lines.extend([
        "## 규칙 요약 (Rule Summary)",
        "",
        f"**KO:** {catalog['desc_ko']}",
        "",
        f"**EN:** {catalog['desc_en']}",
        "",
    ])

    if clauses:
        lines.extend(["## 추출된 NDT 조항 (Extracted NDT Clauses)", ""])
        for clause in clauses:
            lines.append(f"### `{clause.clause_id}`")
            if clause.method:
                lines.append(f"- Method: **{clause.method.value}**")
            if clause.coverage:
                lines.append(f"- Coverage: **{clause.coverage}**")
            if clause.scope:
                lines.append(f"- Scope: {clause.scope}")
            if clause.rule_ref:
                lines.append(f"- Rule ref: `{clause.rule_ref}`")
            lines.append("")
            lines.append(f"> {clause.requirement_text}")
            lines.append("")

    if measure_id == 2:
        lines.extend([
            "## 판단 시나리오 (Decision Scenarios)",
            "",
            "| Measure 3 option | Measure 2 applicable? |",
            "|------------------|----------------------|",
            "| block_shift | No — Note 2 not triggered |",
            "| crack_arrest_hole | No |",
            "| crack_arrest_insert | No |",
            "| enhanced_NDE | Yes — Conditional (Note 2) |",
            "",
        ])
    elif measure_id == 3:
        lines.extend([
            "## CTOD 요건 (CTOD Requirement)",
            "",
            "> CTOD value shall not be less than **0.18 mm** at the minimum design temperature.",
            "",
            "**Note:** CTOD is part of Measure 3 enhanced NDE, **not** Measure 2.",
            "",
        ])

    lines.extend([
        "## 용어 (Terminology)",
        "",
        "- **NDE** — Non-Destructive Examination (LR terminology)",
        "- **NDT** — Non-Destructive Testing (비파괴검사)",
        "- **UT** — Ultrasonic Testing (초음파 탐상)",
        "",
    ])

    return "\n".join(lines)


def _build_quiz_items(
    ndt_extraction: NdtExtraction,
    decision_result: DecisionResult,
    module_ids: List[str],
) -> List[QuizItem]:
    quizzes: List[QuizItem] = []
    req = decision_result.required_measures

    if "M1_100pct_UT" in module_ids or 1 in [int(k) if str(k).isdigit() else k for k in req]:
        quizzes.append(QuizItem(
            quiz_id="Q-M1-001",
            module_id="M1_100pct_UT",
            question_type="multiple_choice",
            question_ko="Measure 1 (100% UT)이 적용되는 용접 이음은?",
            question_en="Which weld joint does Measure 1 (100% UT) apply to?",
            options=[
                "Block-to-block butt joints, upper flange, cargo hold region",
                "All fillet welds on hatch coaming",
                "Coaming-to-deck PJP connections only",
                "All welds outside cargo hold region",
            ],
            correct_answer="Block-to-block butt joints, upper flange, cargo hold region",
            explanation_ko="Measure 1은 화물창 구역 상부 플랜지 종재의 block-to-block butt 용접에 100% UT를 요구합니다.",
            explanation_en="Measure 1 requires 100% UT on block-to-block butt joints of upper flange members in the cargo hold region.",
            rule_ref="Pt 4, Ch 8, 2.3.8",
            measure_ids=[1],
        ))

    quizzes.append(QuizItem(
        quiz_id="Q-M2-NOTE2-001",
        module_id="M2_in_service_NDE",
        question_type="multiple_choice",
        question_ko="Measure 3을 enhanced NDE로 선택했을 때 Measure 2는?",
        question_en="When Measure 3 is achieved via enhanced NDE, Measure 2 is:",
        options=[
            "Conditional — periodic in-service NDE per Note 2",
            "Not required under any circumstance",
            "Always required regardless of Measure 3",
            "Replaced by CTOD testing only",
        ],
        correct_answer="Conditional — periodic in-service NDE per Note 2",
        explanation_ko="Note 2: enhanced NDE를 Measure 3으로 채택하면 운항 중 주기적 NDE(Measure 2)가 조건부로 요구될 수 있습니다.",
        explanation_en="Note 2: where enhanced NDE is adopted as Measure 3, periodic in-service NDE (Measure 2) may be required.",
        rule_ref="Table 8.2.1 Note 2",
        measure_ids=[2, 3],
    ))

    quizzes.append(QuizItem(
        quiz_id="Q-M3-CTOD-TF-001",
        module_id="M3_enhanced_NDE",
        question_type="true_false",
        question_ko="CTOD ≥ 0.18 mm 요건은 Measure 2에 속한다.",
        question_en="The CTOD ≥ 0.18 mm requirement belongs to Measure 2.",
        options=["True", "False"],
        correct_answer="False",
        explanation_ko="CTOD ≥ 0.18 mm는 Measure 3 enhanced NDE의 요건이며 Measure 2와 무관합니다.",
        explanation_en="CTOD ≥ 0.18 mm is part of Measure 3 enhanced NDE, not Measure 2.",
        rule_ref="Pt 4, Ch 8, 2.3.10(d)",
        measure_ids=[3],
    ))

    quizzes.append(QuizItem(
        quiz_id="Q-M3-EGW-001",
        module_id="M3_enhanced_NDE",
        question_type="case_study",
        question_ko="t=85mm, EH40, Measure 3=enhanced NDE(PAUT) 선택, block butt joint에 EGW 사용. compliant?",
        question_en="t=85mm, EH40, Measure 3=enhanced NDE (PAUT), EGW used on block butt joint. Compliant?",
        options=["Compliant", "Non-compliant — EGW prohibited", "Compliant if CTOD test passed", "Not applicable"],
        correct_answer="Non-compliant — EGW prohibited",
        explanation_ko="enhanced NDE가 요구되는 경우 EGW(전기 가스 용접)는 허용되지 않습니다.",
        explanation_en="Electrogas welding (EGW) is not permitted where enhanced NDE is required as Measure 3.",
        rule_ref="Pt 4, Ch 8, 2.3.10(d)",
        measure_ids=[3],
    ))

    quizzes.append(QuizItem(
        quiz_id="Q-M3-METHOD-001",
        module_id="M3_enhanced_NDE",
        question_type="multiple_choice",
        question_ko="Enhanced NDE에 사용 가능한 방법이 아닌 것은?",
        question_en="Which is NOT a valid enhanced NDE method?",
        options=["PAUT", "TOFD", "Visual inspection only", "RT"],
        correct_answer="Visual inspection only",
        explanation_ko="Enhanced NDE 방법으로 UT, PAUT, TOFD, RT가 정의되어 있습니다.",
        explanation_en="Enhanced NDE methods include UT, PAUT, TOFD, and RT.",
        rule_ref="Pt 4, Ch 8, 2.3.10(d)",
        measure_ids=[3],
    ))

    return quizzes


def generate_learning_modules(
    ndt_extraction: NdtExtraction,
    decision_result: DecisionResult,
    textual_requirements: Dict[str, str],
    output_dir: str,
) -> LearningOutput:
    """Generate learning modules and quiz bank from NDT extraction and decision."""
    learning_dir = os.path.join(output_dir, "learning")
    modules_dir = os.path.join(learning_dir, "modules")
    os.makedirs(modules_dir, exist_ok=True)

    output = LearningOutput()
    req = decision_result.required_measures
    project_id = decision_result.project_meta.project_id

    active_measures: List[int] = []
    for mid in (1, 2, 3):
        key = mid
        status = req.get(key, req.get(str(key), MeasureStatus.not_required))
        status_str = _status_label(status)
        if status_str in (
            MeasureStatus.required.value,
            MeasureStatus.conditional.value,
            MeasureStatus.see_note_2.value,
        ):
            active_measures.append(mid)

    # Always include M3 CTOD sub-module if any M3 NDT clause exists
    m3_clauses = _all_clauses_for_measure(ndt_extraction.clauses, 3)
    has_ctod = any("ctod" in c.clause_id.lower() or "0.18" in c.requirement_text for c in m3_clauses)

    module_ids: List[str] = []

    for measure_id in active_measures:
        catalog = _MEASURE_CATALOG.get(measure_id)
        if not catalog:
            continue

        status = req.get(measure_id, req.get(str(measure_id), "Not required"))
        status_str = _status_label(status)
        clauses = _all_clauses_for_measure(ndt_extraction.clauses, measure_id)

        content_md = _render_module_md(
            measure_id, catalog, clauses, status_str, project_id
        )

        module_id = catalog["module_file"].replace(".md", "")
        module_ids.append(module_id)

        module = LearningModule(
            module_id=module_id,
            title_ko=catalog["title_ko"],
            title_en=catalog["title_en"],
            measure_ids=[measure_id],
            difficulty=catalog["difficulty"],
            learning_objectives_ko=[
                f"NDE Measure {measure_id} 적용 조건 설명",
                "적용 범위 및 LR 참조 인용",
            ],
            learning_objectives_en=[
                f"Explain NDE Measure {measure_id} applicability",
                "Cite scope and LR references",
            ],
            content_md=content_md,
            evidence_refs=[c.clause_id for c in clauses],
        )

        md_path = os.path.join(modules_dir, catalog["module_file"])
        with open(md_path, "w", encoding="utf-8") as f:
            f.write(content_md)
        module.content_md = content_md
        output.modules.append(module)

    if has_ctod and any(m.measure_ids == [3] for m in output.modules):
        ctod_md = _render_module_md(
            3,
            {
                **_MEASURE_CATALOG[3],
                "title_ko": "Measure 3 — CTOD 요건",
                "title_en": "Measure 3 — CTOD Requirement",
                "module_file": "M3_enhanced_NDE_CTOD.md",
            },
            [c for c in m3_clauses if "ctod" in c.clause_id.lower() or "0.18" in c.requirement_text],
            _status_label(req.get(3, req.get("3", "Required"))),
            project_id,
        )
        ctod_path = os.path.join(modules_dir, "M3_enhanced_NDE_CTOD.md")
        with open(ctod_path, "w", encoding="utf-8") as f:
            f.write(ctod_md)
        ctod_module = LearningModule(
            module_id="M3_enhanced_NDE_CTOD",
            title_ko="Measure 3 — CTOD 요건",
            title_en="Measure 3 — CTOD Requirement",
            measure_ids=[3],
            difficulty="advanced",
            learning_objectives_ko=["CTOD ≥ 0.18 mm 요건 설명", "Measure 2와의 구분"],
            learning_objectives_en=["Explain CTOD ≥ 0.18 mm requirement", "Distinguish from Measure 2"],
            content_md=ctod_md,
            evidence_refs=[c.clause_id for c in m3_clauses if "ctod" in c.clause_id.lower()],
        )
        output.modules.append(ctod_module)
        module_ids.append("M3_enhanced_NDE_CTOD")

    if not output.modules:
        # Fallback: generate basic NDT overview module from extracted clauses
        overview_md = _render_module_md(
            1,
            _MEASURE_CATALOG[1],
            ndt_extraction.clauses,
            "Reference",
            project_id,
        )
        overview_path = os.path.join(modules_dir, "NDT_overview.md")
        with open(overview_path, "w", encoding="utf-8") as f:
            f.write(overview_md)
        output.modules.append(LearningModule(
            module_id="NDT_overview",
            title_ko="NDT/NDE 개요",
            title_en="NDT/NDE Overview",
            measure_ids=[1, 2, 3],
            difficulty="basic",
            content_md=overview_md,
            evidence_refs=[c.clause_id for c in ndt_extraction.clauses],
        ))
        module_ids.append("NDT_overview")

    output.quiz_items = _build_quiz_items(ndt_extraction, decision_result, module_ids)

    for module in output.modules:
        module.quiz_ids = [
            q.quiz_id for q in output.quiz_items
            if q.module_id == module.module_id
            or (q.measure_ids and any(m in q.measure_ids for m in module.measure_ids))
        ]

    return output


def write_learning_outputs(
    output_dir: str,
    learning_output: LearningOutput,
) -> Dict[str, str]:
    """Write modules_index.json and quiz_bank.json to learning/."""
    learning_dir = os.path.join(output_dir, "learning")
    os.makedirs(learning_dir, exist_ok=True)
    paths: Dict[str, str] = {}

    index = {
        "modules": [
            {
                "module_id": m.module_id,
                "title_ko": m.title_ko,
                "title_en": m.title_en,
                "measure_ids": m.measure_ids,
                "difficulty": m.difficulty,
                "file": f"modules/{m.module_id}.md" if not m.module_id.startswith("M") else f"modules/{m.module_id.replace('M1_100pct_UT', 'M1_100pct_UT')}.md",
                "quiz_ids": m.quiz_ids,
                "evidence_refs": m.evidence_refs,
            }
            for m in learning_output.modules
        ],
        "total_modules": len(learning_output.modules),
        "total_quizzes": len(learning_output.quiz_items),
    }

    # Fix file paths in index
    file_map = {
        "M1_100pct_UT": "modules/M1_100pct_UT.md",
        "M2_in_service_NDE": "modules/M2_in_service_NDE.md",
        "M3_enhanced_NDE": "modules/M3_enhanced_NDE.md",
        "M3_enhanced_NDE_CTOD": "modules/M3_enhanced_NDE_CTOD.md",
        "NDT_overview": "modules/NDT_overview.md",
    }
    for entry in index["modules"]:
        entry["file"] = file_map.get(entry["module_id"], f"modules/{entry['module_id']}.md")

    index_path = os.path.join(learning_dir, "modules_index.json")
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(index, f, indent=2, ensure_ascii=False)
    paths["modules_index"] = index_path

    quiz_path = os.path.join(learning_dir, "quiz_bank.json")
    with open(quiz_path, "w", encoding="utf-8") as f:
        json.dump(
            [q.model_dump() for q in learning_output.quiz_items],
            f,
            indent=2,
            ensure_ascii=False,
        )
    paths["quiz_bank"] = quiz_path

    return paths
