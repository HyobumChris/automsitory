# CLAUDE.md

This file provides guidance for AI assistants working with the **automsitory** repository.

## Repository Overview

This is a monorepo of interactive visualization tools for **Lloyd's Register (LR) classification rules** related to containership hatch coaming crack arrest and brittle fracture prevention. The project targets marine/structural engineers, ship surveyors, and classification society inspectors.

The domain focus is **LR Rules for Ships, Part 3/4, Chapter 8, Section 8.2** — preventative measures against crack propagation in hatch coaming thick plates for container ships.

## Repository Structure

```
automsitory/
├── app/                          # React 19 + Vite — primary interactive flowchart app
├── containership-app/            # React 19 + Vite — earlier standalone containership flowchart
├── hatch-coaming-3d/             # React 19 + Vite + Three.js — 3D visualization app (TypeScript)
├── lr-hatch-coaming-measures/    # Python 3.10+ — decision engine, OCR, pipeline, tests
├── docs/                         # GitHub Pages deployment (compiled single-file HTML)
├── .github/workflows/            # CI/CD — GitHub Pages deployment workflow
├── LloydsRulesVibeCodingApp.jsx  # Original monolithic React component (reference/archive)
├── hatch_coaming_visualization.html  # Standalone vanilla HTML/CSS/JS visualization
├── lloyd_rules_app.html          # Compiled single-file React app (standalone build)
├── README.md                     # Project-level documentation (Korean/English)
└── subautository                 # Empty placeholder file
```

## Sub-Projects

### `app/` — Primary Flowchart Visualization (React)

**Tech stack:** React 19, Vite 7, Tailwind CSS 4, Framer Motion, Lucide React, ES Modules (JSX)

**Purpose:** Interactive decision-tree wizard guiding engineers through LR rules for EH36/EH40/EH47 steel grades. Features 2D cross-section (SVG) and 3D isometric (SVG) views with synchronized highlighting.

**Key files:**
- `src/App.jsx` — Root component, grade selector, layout orchestration
- `src/hooks/useFlowEngine.js` — Custom hook: flow state machine with undo/redo, path history
- `src/data/flowNodes.js` — Decision tree definitions (~40 nodes across 3 grades)
- `src/components/FlowchartPanel.jsx` — Left sidebar wizard UI
- `src/components/CrossSectionView.jsx` — 2D SVG cross-section diagram
- `src/components/IsometricView.jsx` — 3D SVG isometric projection

**Commands:**
```bash
cd app
npm install
npm run dev       # Vite dev server with HMR
npm run build     # Production build (single-file via vite-plugin-singlefile)
npm run lint      # ESLint (flat config, React hooks + refresh plugins)
npm run preview   # Preview production build
```

### `containership-app/` — Earlier Standalone Flowchart (React)

**Tech stack:** React 19, Vite 7, Tailwind CSS 4, Framer Motion, Lucide React (JSX)

**Purpose:** Earlier iteration of the flowchart app. All logic lives in a single `src/App.jsx` (~1,174 lines) including isometric math helpers, SVG views, step state machine, and flow navigation.

**Commands:** Same as `app/` (`npm run dev/build/lint/preview`)

### `hatch-coaming-3d/` — 3D Visualization (React + Three.js + TypeScript)

**Tech stack:** React 19, Vite 7, TypeScript ~5.9, Three.js, @react-three/fiber, @react-three/drei, Zustand, Tailwind CSS 4, Framer Motion

**Purpose:** Interactive 3D WebGL scene showing hatch coaming structure. Users select steel grade and plate thickness; the rules engine determines required measures (1–5) and the 3D scene updates in real time (weld colors, stagger offsets, BCA material highlights).

**Key files:**
- `src/App.tsx` — Root layout composing InfoBar, SceneSetup, ControlPanel
- `src/store/useAppStore.ts` — Zustand store managing grade, thickness, computed measures
- `src/store/rulesEngine.ts` — LR Pt 4, Ch 8, §2.3 implementation
- `src/components/scene/` — Three.js mesh components (DeckPlate, CoamingPlate, WeldStrip, Annotations, SceneSetup)
- `src/components/ui/` — ControlPanel.tsx, InfoBar.tsx

**Commands:**
```bash
cd hatch-coaming-3d
npm install
npm run dev       # Vite dev server
npm run build     # tsc -b && vite build (TypeScript check + bundle)
npm run lint      # ESLint with typescript-eslint
npm run preview
```

### `lr-hatch-coaming-measures/` — Python Decision Engine

**Tech stack:** Python 3.10+, Pydantic >= 2.0, pytest, optional OCR (pytesseract/easyocr), optional viz (Pillow)

**Purpose:** Full pipeline: OCR extraction from scanned rule PDFs → rule table lookup → decision engine → cumulative measure application → 2D/3D visualization generation → audit evidence JSON.

**Key files:**
- `lr_hatch_coaming/models.py` — Pydantic models, enums (roles, zones, weld processes, measures)
- `lr_hatch_coaming/pipeline.py` — End-to-end orchestration
- `lr_hatch_coaming/decision_engine.py` — Core Table 8.2.1 lookup and Measure 1–5 determination
- `lr_hatch_coaming/measure_applicator.py` — Cumulative measure application (append-only)
- `lr_hatch_coaming/rule_tables.py` — Built-in Table 8.2.1/8.2.2 defaults, merge with OCR
- `lr_hatch_coaming/ocr_extractor.py` — PDF/image OCR extraction
- `lr_hatch_coaming/viz_2d.py` — SVG/PNG diagram generation
- `lr_hatch_coaming/viz_3d.py` — glTF (.glb) 3D model and three.js viewer generation
- `lr_hatch_coaming/evidence.py` — Audit-ready JSON output
- `tests/` — pytest tests for decision engine and E2E pipeline

**Commands:**
```bash
cd lr-hatch-coaming-measures
pip install -e ".[all]"           # Install with all optional deps
pip install -e ".[dev]"           # Install with dev/test deps only
python run_e2e.py                 # Run full pipeline with sample_input.json
pytest tests/                     # Run test suite
pytest --cov=lr_hatch_coaming tests/  # With coverage
```

## CI/CD

**GitHub Pages deployment** (`.github/workflows/deploy-pages.yml`):
- Triggers on push to branch `cursor/lloyd-s-rules-visualization-dd6e`
- Uploads `docs/` folder and deploys to GitHub Pages
- Auto-enables Pages via `enablement: true`

There are no other CI workflows (no automated test runners, no lint checks in CI).

## Development Conventions

### JavaScript/React Sub-Projects (app/, containership-app/, hatch-coaming-3d/)

- **React 19** with functional components and hooks only (no class components)
- **JSX** for `app/` and `containership-app/`; **TypeScript** for `hatch-coaming-3d/`
- **Vite** as the build tool across all JS projects
- **Tailwind CSS 4** for styling (utility-first, JIT compilation, `@import "tailwindcss"` syntax)
- **Framer Motion** for animations (AnimatePresence, motion components)
- **Lucide React** for icons
- **ESLint flat config** format (`eslint.config.js`); no Prettier configured
- **ES Modules** (`"type": "module"` in package.json)
- Single-file builds via `vite-plugin-singlefile` (all CSS/JS inlined into one HTML)
- No test frameworks configured for JS projects

### Python Sub-Project (lr-hatch-coaming-measures/)

- **Pydantic v2** for all data models — strict typing throughout
- **pytest** for testing with `pytest-cov` for coverage
- Enum-driven design for categorical values (roles, zones, weld processes)
- Physical units included in field names (e.g., `thickness_mm_as_built`, `yield_strength_nmm2`)
- Korean sentinel string `"미지정"` used for unspecified/unknown values
- Cumulative (append-only) measure application — measures are never removed once applied
- No linting/formatting tools configured (no black, ruff, flake8)

### General Patterns

- **Dark theme** UI with marine/engineering aesthetic (navy blues, cyan/amber neon accents)
- **SVG-based engineering diagrams** with interactive highlighting and annotations
- **Decision tree / state machine** pattern for rule navigation
- **Domain-specific terminology** from Lloyd's Register classification rules (BCA steel grades, CTOD tests, NDE measures, block-to-block joints, sheer strake, etc.)
- **Bilingual** content: Korean primary language in README and some code comments, English in code identifiers and technical terminology

## Key Domain Concepts

When working in this codebase, understand these LR rule concepts:

- **Steel grades**: EH36 (355 MPa), EH40 (390 MPa), EH47 (460 MPa) — higher-strength hull structural steel
- **Hatch coaming**: Vertical plate surrounding cargo hold openings on container ships
- **BCA steel**: Brittle Crack Arrest steel — BCA1 (standard) and BCA2 (high performance, higher Kca fracture toughness)
- **Measures 1–5**: Preventative measures based on plate thickness and steel grade:
  - Measure 1: 100% NDE (ultrasonic testing) during construction
  - Measure 2: Periodic in-service NDE
  - Measure 3: Brittle crack arrest design (staggered block joints)
  - Measure 4: BCA1 steel grade required
  - Measure 5: BCA2 steel grade required
- **Thickness thresholds**: t <= 50mm (basic), 50mm < t <= 80mm (BCA1), 80mm < t <= 100mm (BCA2)
- **CTOD test**: Crack Tip Opening Displacement — fracture toughness test for welded joints
- **Table 8.2.1**: Thickness/yield-strength matrix determining which measures apply
- **Table 8.2.2**: BCA steel grade specifications and yield stress requirements

## Tips for AI Assistants

1. **Each sub-project is independent** — they have separate `node_modules`/`venv`, separate configs, and can be built/run independently. Always `cd` into the correct sub-project directory before running commands.
2. **No global package manager** — there is no root-level package.json or workspace config. Each JS project manages its own dependencies.
3. **The `app/` directory is the most actively developed** React project with the cleanest architecture (extracted hooks, separate data files, component decomposition).
4. **`containership-app/` is an earlier monolithic version** — `App.jsx` contains everything in ~1,174 lines. Prefer working in `app/` for new React features.
5. **`hatch-coaming-3d/` is the only TypeScript project** — run `tsc -b` before `vite build` (the `build` script handles this).
6. **The Python project has tests** — always run `pytest tests/` after modifying `lr-hatch-coaming-measures/` code.
7. **Single-file HTML builds** are important for this project — the visualization tools are often distributed as standalone HTML files that engineers can open directly in a browser.
8. **Domain accuracy matters** — LR rule references (table numbers, measure definitions, thickness thresholds) must be precise. Cross-check against the decision engine logic in `lr-hatch-coaming-measures/lr_hatch_coaming/decision_engine.py` and `rule_tables.py`.
