# LR Hatch Coaming Brittle Fracture Prevention – Measure 1-5 Engine

Automated determination of LR Rules (Container Ship Pt 4 Ch 8 2.3, Table 8.2.1/8.2.2)
for hatch coaming / upper deck thick plate brittle fracture prevention measures,
with cumulative 2D/3D visualization and audit-ready evidence output.

## Features

- **Measure 1-5 Auto-Determination**: Table 8.2.1 lookup based on yield strength and thickness
- **Cumulative (Append-Only) Application**: Measures stack; never removed once applied
- **Member/Joint Separation**: Distinct targets for plates (member) vs welds (joint)
- **2D SVG Diagrams**: Plan view and section view with color-coded measure overlays
- **3D GLB Model + Viewer**: Interactive Three.js viewer with layer toggle and click-to-inspect
- **Audit Trail**: JSON results with rule references, evidence snippets, and review flags
- **OCR Extraction**: Scan-based rule extraction with fallback to manual input mode

## Quick Start

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Run the Engine (CLI)

```bash
python3 -m services.engine.cli --input inputs/project.json --out outputs/demo
```

This produces:
- `outputs/demo/decision_results.json` – Full decision audit trail
- `outputs/demo/rules_extraction.json` – Extracted rules database
- `outputs/demo/hatch_plan.svg` – 2D Plan view
- `outputs/demo/hatch_section.svg` – 2D Section view
- `outputs/demo/hatch_coaming.glb` – 3D model
- `outputs/demo/viewer.html` – Interactive 3D viewer

### 3. Run Tests

```bash
python3 -m pytest tests/test_e2e.py -v
```

### 4. Web App (Next.js)

```bash
cd apps/web
npm install
# Copy engine outputs to public/data
cp ../../outputs/demo/* public/data/
npm run build
npm start
```

### 5. API Server (FastAPI)

```bash
uvicorn services.engine.api:app --reload --port 8000
```

## Project Structure

```
├── services/engine/          # Python engine package
│   ├── rules_db.py           # Pydantic schemas (input/output/rules)
│   ├── ocr_extract.py        # OCR extraction + evidence
│   ├── decision_engine.py    # Measure 1-5 logic
│   ├── diagram_2d.py         # SVG generation
│   ├── model_3d.py           # GLB + viewer HTML
│   ├── cli.py                # CLI entry point
│   └── api.py                # FastAPI server
├── configs/
│   ├── colors.json           # Measure color configuration
│   └── mapping_rules.json    # Role/zone mapping rules
├── inputs/                   # Input files
│   ├── rules/                # LR rule scans (PDF/images)
│   ├── diagrams/             # User diagrams
│   ├── shipright/            # ShipRight documents
│   └── project.json          # Default project input
├── outputs/                  # Generated outputs
├── evidence/                 # OCR evidence snippets
├── tests/                    # E2E tests (3 cases)
├── diagrams/                 # Mermaid flow diagram
│   └── decision_flow.mmd
└── apps/web/                 # Next.js web app
```

## Test Cases

| Case | Description | Expected |
|------|-------------|----------|
| TC-001 | YS355, t=60mm (low) | Measure 1 only |
| TC-002 | YS460, t=95mm (high) | M1, M3, M4, M5 + conditional M2 |
| TC-003 | YS460, t=110mm (>100) | Special consideration flags, no table match |

## Key Rules Implemented

- **Table 8.2.1**: "3+4" column expanded to separate M3 and M4
- **Note 2 (Measure 2)**: Only conditional when `enhanced_NDE` selected
- **Measure 3**: Always includes BCA steel for coaming side plate + option-specific measures
- **Block shift**: Minimum 300mm offset verification
- **Enhanced NDE**: CTOD ≥ 0.18mm, EGW not permitted, ShipRight criteria
- **PJP**: Always required for coaming-to-deck connections
- **Special consideration**: Flagged for thickness > 100mm
