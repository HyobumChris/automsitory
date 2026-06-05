#!/usr/bin/env python3
"""NDT learning module generator from any LR rule document.

Usage:
    python3 run_ndt.py <rule.pdf | rule.txt> [output_dir]

Extracts NDT/NDE clauses (methods, extent, acceptance, qualification,
service supplier, survey checkpoints, hatch-coaming Measures 1-5, ...) from
an LR rule PDF or text file and generates bilingual learning modules + a
quiz bank under <output_dir>/learning/.
"""

from __future__ import annotations

import json
import logging
import os
import sys
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("run_ndt")


def main(input_path: str, output_dir: str = "./output_ndt") -> None:
    from lr_hatch_coaming.models import (
        ControlParameters,
        DecisionResult,
        ProjectMeta,
    )
    from lr_hatch_coaming.ndt_extractor import (
        extract_ndt_from_pdf,
        extract_ndt_from_text,
    )
    from lr_hatch_coaming.learning_generator import (
        generate_learning_modules,
        write_learning_outputs,
    )
    from lr_hatch_coaming.evidence import write_ndt_evidence

    path = Path(input_path)
    if not path.is_file():
        logger.error("Input file not found: %s", path)
        sys.exit(1)

    ext = path.suffix.lower()
    logger.info("Extracting NDT clauses from %s", path.name)

    if ext == ".pdf":
        ndt = extract_ndt_from_pdf(str(path))
    else:
        text = path.read_text(encoding="utf-8", errors="ignore")
        ndt = extract_ndt_from_text(text)

    if not ndt.clauses:
        logger.warning("No NDT clauses extracted. Warnings: %s", ndt.extraction_warnings)

    # Minimal decision result — no hatch-coaming measures assumed for a
    # generic rule document; category-based modules are generated instead.
    project_id = path.stem[:60]
    decision = DecisionResult(
        project_meta=ProjectMeta(project_id=project_id),
        control_parameters=ControlParameters(),
        required_measures={},
    )

    os.makedirs(output_dir, exist_ok=True)
    learning = generate_learning_modules(ndt, decision, {}, output_dir)
    paths = write_learning_outputs(output_dir, learning)
    ndt_paths = write_ndt_evidence(output_dir, ndt)

    from collections import Counter

    cats = Counter(c.category.value for c in ndt.clauses)

    print("\n" + "=" * 60)
    print("NDT EXTRACTION SUMMARY")
    print("=" * 60)
    print(f"Source            : {path.name}")
    print(f"NDT clauses       : {len(ndt.clauses)}")
    print(f"Categories        : {dict(cats)}")
    print(f"Learning modules  : {len(learning.modules)}")
    print(f"Quiz items        : {len(learning.quiz_items)}")
    print("-" * 60)
    print("Modules:")
    for m in learning.modules:
        mids = m.measure_ids or "-"
        print(f"  [{m.difficulty:12}] {m.module_id:24} measures={mids}")
    print("-" * 60)
    print(f"modules_index : {paths['modules_index']}")
    print(f"quiz_bank     : {paths['quiz_bank']}")
    print(f"ndt_clauses   : {ndt_paths['ndt_clauses']}")
    print("=" * 60)

    if ndt.extraction_warnings:
        print("\nWarnings:")
        for w in ndt.extraction_warnings:
            print(f"  - {w}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    inp = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else "./output_ndt"
    main(inp, out)
