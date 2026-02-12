# Surveyor Measure Guide (MVP)

A lightweight web app to help surveyors decide which preventative measures apply based on hatch coaming grade, yield strength, and thickness.

## What it does

- Captures core survey inputs (grade, yield strength, thickness, crack-arrest design, enhanced NDE usage).
- Applies rule logic derived from the supplied Table 8.2.1 and grade flowcharts (EH36/EH40/EH47).
- Returns:
  - required measures,
  - conditional measures,
  - rule trace,
  - special warning for thickness above 100 mm.

## Run locally

From this folder, start a static server:

```bash
python3 -m http.server 4173
```

Open: `http://localhost:4173`

## Notes

- This MVP is intended as a guided decision helper; it should still be reviewed against class rules and project-specific requirements.
- For production use, add persisted survey records, authentication, and report export.
