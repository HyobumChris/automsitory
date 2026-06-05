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
    NdtCategory,
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


# General (measure-agnostic) NDT topic catalog — covers the broader set of
# NDT clauses in LR rules: service supplier management, hull survey
# checkpoints, personnel qualification, methods, extent, acceptance, etc.
_CATEGORY_CATALOG: Dict[str, Dict[str, str]] = {
    NdtCategory.method.value: {
        "title_ko": "NDT 방법론 (UT/RT/MT/PT/VT/ET)",
        "title_en": "NDT Methods (UT/RT/MT/PT/VT/ET)",
        "intro_ko": (
            "LR 규칙에서 인정하는 비파괴검사 방법과 각 방법의 적용 대상을 다룹니다. "
            "초음파(UT), 방사선(RT), 자분(MT), 침투(PT), 육안(VT), 와전류(ET)."
        ),
        "intro_en": (
            "NDT methods recognized across LR rules and their applicability: "
            "Ultrasonic (UT), Radiographic (RT), Magnetic Particle (MT), "
            "Liquid Penetrant (PT), Visual (VT), Eddy Current (ET)."
        ),
        "difficulty": "basic",
    },
    NdtCategory.extent.value: {
        "title_ko": "검사 범위 및 비율 (Extent of Examination)",
        "title_en": "Extent of Examination",
        "intro_ko": "검사 비율(100%, spot, random), 샘플링, 검사 대상 범위에 관한 조항.",
        "intro_en": "Coverage (100%, spot, random), sampling, and scope of NDT.",
        "difficulty": "intermediate",
    },
    NdtCategory.acceptance.value: {
        "title_ko": "합격 기준 (Acceptance Criteria)",
        "title_en": "Acceptance Criteria",
        "intro_ko": "결함 지시(indication)의 허용 한계 및 합격/불합격 판정 기준.",
        "intro_en": "Allowable indication limits and accept/reject criteria.",
        "difficulty": "intermediate",
    },
    NdtCategory.qualification.value: {
        "title_ko": "검사원·절차 자격 (Qualification)",
        "title_en": "Personnel & Procedure Qualification",
        "intro_ko": "검사원 자격(ISO 9712, SNT-TC-1A, Level II/III) 및 절차 승인 요건.",
        "intro_en": "Personnel qualification (ISO 9712, SNT-TC-1A, Level II/III) and procedure approval.",
        "difficulty": "intermediate",
    },
    NdtCategory.service_supplier.value: {
        "title_ko": "서비스 공급자 관리 (Service Supplier)",
        "title_en": "Service Supplier Management",
        "intro_ko": (
            "NDT 용역을 수행하는 firm(서비스 공급자)의 승인, 자격, 감사 등 "
            "관리 체계에 관한 LR 요건."
        ),
        "intro_en": (
            "LR requirements for approval, qualification, and audit of firms "
            "(service suppliers) providing NDT services."
        ),
        "difficulty": "advanced",
    },
    NdtCategory.survey.value: {
        "title_ko": "선체 검사 체크포인트 (Hull Survey Checkpoints)",
        "title_en": "Hull Survey Checkpoints",
        "intro_ko": (
            "정기/중간/특별검사, close-up survey, 두께 계측 등 운항 중 "
            "선체 검사에서의 NDT 위치 및 범위."
        ),
        "intro_en": (
            "NDT locations and extent during periodical/intermediate/special "
            "surveys, close-up survey, and thickness measurement."
        ),
        "difficulty": "advanced",
    },
    NdtCategory.timing.value: {
        "title_ko": "검사 시점 (Timing)",
        "title_en": "Inspection Timing",
        "intro_ko": "건조 중, 용접 후, 운항 중, 주기적 검사 시점에 관한 조항.",
        "intro_en": "Construction, post-weld, in-service, and periodic timing clauses.",
        "difficulty": "basic",
    },
    NdtCategory.prohibition.value: {
        "title_ko": "제한 및 금지 조항 (Prohibitions)",
        "title_en": "Restrictions & Prohibitions",
        "intro_ko": "특정 공법·재료·조건의 제한 또는 금지에 관한 조항.",
        "intro_en": "Clauses restricting or prohibiting certain processes, materials, or conditions.",
        "difficulty": "intermediate",
    },
    NdtCategory.general.value: {
        "title_ko": "기타 NDT 조항 (General)",
        "title_en": "Other NDT Clauses",
        "intro_ko": "위 분류에 속하지 않는 일반 NDT 관련 조항.",
        "intro_en": "General NDT-related clauses not covered by other categories.",
        "difficulty": "basic",
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


def _render_category_module_md(
    category_value: str,
    catalog: Dict[str, str],
    clauses: List[NdtClause],
    project_id: str,
) -> str:
    lines = [
        f"# {catalog['title_ko']}",
        "",
        f"**{catalog['title_en']}**",
        "",
        f"- Project: `{project_id}`",
        f"- Category: `{category_value}`",
        f"- Extracted clauses: **{len(clauses)}**",
        "",
        "## 개요 (Overview)",
        "",
        f"**KO:** {catalog['intro_ko']}",
        "",
        f"**EN:** {catalog['intro_en']}",
        "",
        "## 추출된 조항 (Extracted Clauses)",
        "",
    ]

    if not clauses:
        lines.append("_(이 카테고리에 해당하는 조항이 추출되지 않았습니다.)_")
        lines.append("")
    for i, clause in enumerate(clauses, 1):
        methods = ", ".join(m.value for m in clause.methods) if clause.methods else "-"
        lines.append(f"### {i}. `{clause.clause_id}`")
        lines.append(f"- Methods: **{methods}**")
        if clause.rule_ref:
            lines.append(f"- Rule ref: `{clause.rule_ref}`")
        lines.append("")
        lines.append(f"> {clause.requirement_text}")
        lines.append("")

    lines.extend([
        "## 용어 (Terminology)",
        "",
        "- **NDE / NDT** — Non-Destructive Examination / Testing (비파괴검사)",
        "- **UT** Ultrasonic · **RT** Radiographic · **MT** Magnetic Particle",
        "- **PT** Liquid Penetrant · **VT** Visual · **ET** Eddy Current",
        "",
    ])

    return "\n".join(lines)


def _generate_category_modules(
    ndt_extraction: NdtExtraction,
    project_id: str,
    modules_dir: str,
) -> List[LearningModule]:
    """Generate measure-agnostic NDT modules grouped by category."""
    modules: List[LearningModule] = []

    # Group general (non-measure) clauses by category
    by_category: Dict[str, List[NdtClause]] = {}
    for clause in ndt_extraction.clauses:
        if clause.measure_ids:
            continue  # measure-specific clauses handled elsewhere
        cat = clause.category.value if hasattr(clause.category, "value") else str(clause.category)
        by_category.setdefault(cat, []).append(clause)

    for cat_value, clauses in by_category.items():
        catalog = _CATEGORY_CATALOG.get(cat_value, _CATEGORY_CATALOG[NdtCategory.general.value])
        module_id = f"NDT_{cat_value}"
        content_md = _render_category_module_md(cat_value, catalog, clauses, project_id)

        md_path = os.path.join(modules_dir, f"{module_id}.md")
        with open(md_path, "w", encoding="utf-8") as f:
            f.write(content_md)

        modules.append(LearningModule(
            module_id=module_id,
            title_ko=catalog["title_ko"],
            title_en=catalog["title_en"],
            measure_ids=[],
            difficulty=catalog.get("difficulty", "basic"),
            learning_objectives_ko=[
                f"{catalog['title_ko']} 관련 LR NDT 조항을 이해한다.",
                "추출된 조항의 적용 대상과 방법을 설명할 수 있다.",
            ],
            learning_objectives_en=[
                f"Understand LR NDT clauses for: {catalog['title_en']}.",
                "Explain the applicability and methods of extracted clauses.",
            ],
            content_md=content_md,
            evidence_refs=[c.clause_id for c in clauses],
        ))

    return modules


def _build_category_quiz_items(modules: List[LearningModule]) -> List[QuizItem]:
    """Generic quizzes for general NDT category modules."""
    quizzes: List[QuizItem] = []
    cat_module_ids = {m.module_id for m in modules}

    if "NDT_service_supplier" in cat_module_ids:
        quizzes.append(QuizItem(
            quiz_id="Q-SS-001",
            module_id="NDT_service_supplier",
            question_type="multiple_choice",
            question_ko="NDT 용역을 수행하는 firm에 대해 LR이 요구하는 것은?",
            question_en="What does LR require regarding firms performing NDT services?",
            options=[
                "서비스 공급자 승인 및 자격 관리",
                "별도 요건 없음",
                "선주 자체 승인만으로 충분",
                "검사 결과만 제출하면 됨",
            ],
            correct_answer="서비스 공급자 승인 및 자격 관리",
            explanation_ko="NDT 용역 firm은 LR의 서비스 공급자 승인 체계에 따라 승인·자격·감사가 관리되어야 합니다.",
            explanation_en="Firms providing NDT services must be approved and managed under LR's service supplier scheme.",
            rule_ref="Service Supplier approval",
            measure_ids=[],
        ))

    if "NDT_survey" in cat_module_ids:
        quizzes.append(QuizItem(
            quiz_id="Q-SURVEY-001",
            module_id="NDT_survey",
            question_type="true_false",
            question_ko="Close-up survey와 두께 계측은 운항 중 선체 검사의 NDT 체크포인트에 포함된다.",
            question_en="Close-up survey and thickness measurement are NDT checkpoints during in-service hull surveys.",
            options=["True", "False"],
            correct_answer="True",
            explanation_ko="정기/중간/특별검사에서 close-up survey와 두께 계측은 주요 NDT 체크포인트입니다.",
            explanation_en="Close-up survey and thickness measurement are key NDT checkpoints in periodical/intermediate/special surveys.",
            rule_ref="Hull survey requirements",
            measure_ids=[],
        ))

    if "NDT_qualification" in cat_module_ids:
        quizzes.append(QuizItem(
            quiz_id="Q-QUAL-001",
            module_id="NDT_qualification",
            question_type="multiple_choice",
            question_ko="NDT 검사원 자격 기준으로 흔히 인용되는 표준은?",
            question_en="Which standard is commonly cited for NDT personnel qualification?",
            options=["ISO 9712 / SNT-TC-1A", "ISO 9001", "MARPOL Annex VI", "SOLAS Ch II-1"],
            correct_answer="ISO 9712 / SNT-TC-1A",
            explanation_ko="NDT 검사원 자격은 일반적으로 ISO 9712 또는 SNT-TC-1A에 따라 Level I/II/III로 인증됩니다.",
            explanation_en="NDT personnel are typically certified to Level I/II/III per ISO 9712 or SNT-TC-1A.",
            rule_ref="Personnel qualification",
            measure_ids=[],
        ))

    if "NDT_method" in cat_module_ids:
        quizzes.append(QuizItem(
            quiz_id="Q-METHOD-001",
            module_id="NDT_method",
            question_type="multiple_choice",
            question_ko="표면 결함 검출에 주로 사용되는 NDT 방법은?",
            question_en="Which NDT method is primarily used for surface defect detection?",
            options=["MT / PT (자분·침투)", "UT (초음파)", "RT (방사선)", "두께 계측"],
            correct_answer="MT / PT (자분·침투)",
            explanation_ko="자분(MT)·침투(PT)는 표면/표면直下 결함, UT·RT는 내부 결함 검출에 주로 사용됩니다.",
            explanation_en="MT/PT detect surface/near-surface defects; UT/RT detect internal defects.",
            rule_ref="NDT methods",
            measure_ids=[],
        ))

    return quizzes


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

    # ── General (measure-agnostic) NDT category modules ─────────────────
    # Covers service supplier management, hull survey checkpoints, personnel
    # qualification, methods, extent, acceptance, etc. — beyond M1-5.
    category_modules = _generate_category_modules(ndt_extraction, project_id, modules_dir)
    output.modules.extend(category_modules)
    module_ids.extend(m.module_id for m in category_modules)

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
    output.quiz_items.extend(_build_category_quiz_items(category_modules))

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
                "file": f"modules/{m.module_id}.md",
                "quiz_ids": m.quiz_ids,
                "evidence_refs": m.evidence_refs,
            }
            for m in learning_output.modules
        ],
        "total_modules": len(learning_output.modules),
        "total_quizzes": len(learning_output.quiz_items),
    }

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
