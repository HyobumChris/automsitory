# Lloyd's Register — Hatch Coaming Crack Arrest Visualization

Interactive React web application visualizing Lloyd's Register rules for **Containership Hatch Coaming Thick Plate Crack Propagation Prevention Measures** (Part 3, Chapter 8, Section 8.2).

## Features

- **Interactive Decision Flowchart** — Step-by-step wizard for steel grades EH36, EH40, EH47
- **2D Cross-Section View** — Professional SVG showing hatch coaming structural detail (Fig 8.2.1)
- **3D Isometric Block Joint View** — CAD-style visualization of hull block assembly with transverse/longitudinal welds
- **Dynamic Visual Sync** — Automatic view switching and highlighting based on active flowchart step
- **Animated Transitions** — Smooth Framer Motion animations between views and states

## Tech Stack

- React 19 (Vite)
- Tailwind CSS v4
- Framer Motion
- Lucide React icons
- Inline SVG (no external images)

## Getting Started

```bash
cd app
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

## Build

```bash
npm run build
```

Output in `app/dist/`.
