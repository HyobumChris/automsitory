"""
FastAPI server for the LR Hatch Coaming Measure Engine.

Provides REST API endpoints for:
  - Running the decision engine
  - Serving generated outputs
  - Health check

Usage:
  uvicorn services.engine.api:app --reload --port 8000
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Dict

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .rules_db import ProjectInput, save_json
from .ocr_extract import extract_rules
from .decision_engine import run_decision
from .diagram_2d import generate_2d_diagrams
from .model_3d import generate_3d_model

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="LR Hatch Coaming Measure Engine API",
    description="Brittle fracture prevention Measures 1-5 automation",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve output files
outputs_dir = Path("outputs")
if outputs_dir.exists():
    app.mount("/outputs", StaticFiles(directory="outputs"), name="outputs")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "lr-hatch-coaming-engine"}


@app.post("/api/run")
async def run_engine(project_data: Dict[str, Any]):
    """Run the full decision engine pipeline."""
    try:
        project = ProjectInput(**project_data)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Invalid input: {e}")

    output_dir = project.visualization_inputs.output_dir
    if output_dir == "미지정":
        output_dir = "outputs/api_run"

    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    # Extract rules
    source_files = [sf.model_dump() for sf in project.sources.scanned_rule_files]
    rules = extract_rules(
        source_files=source_files,
        evidence_dir=str(out / "evidence"),
        output_path=str(out / "rules_extraction.json"),
    )

    # Run decision
    dr = run_decision(project, rules)
    save_json(dr, str(out / "decision_results.json"))

    # Generate diagrams
    try:
        paths_2d = generate_2d_diagrams(project, dr, output_dir)
    except Exception as e:
        logger.warning("2D generation failed: %s", e)
        paths_2d = {}

    try:
        paths_3d = generate_3d_model(project, dr, output_dir)
    except Exception as e:
        logger.warning("3D generation failed: %s", e)
        paths_3d = {}

    return JSONResponse({
        "project_id": dr.project_id,
        "output_dir": output_dir,
        "decision_results": json.loads(dr.model_dump_json()),
        "files": {
            "decision_results": f"{output_dir}/decision_results.json",
            "rules_extraction": f"{output_dir}/rules_extraction.json",
            **paths_2d,
            **paths_3d,
        },
    })


@app.get("/api/results/{project_id}")
async def get_results(project_id: str):
    """Get existing decision results for a project."""
    # Search common output locations
    for search_dir in ["outputs/demo", "outputs/api_run", "outputs"]:
        path = Path(search_dir) / "decision_results.json"
        if path.exists():
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            if data.get("project_id") == project_id:
                return JSONResponse(data)

    raise HTTPException(status_code=404, detail=f"Results not found for project {project_id}")


@app.get("/api/file/{path:path}")
async def get_file(path: str):
    """Serve a generated file."""
    file_path = Path(path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(file_path)
