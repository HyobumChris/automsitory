/* 10-specimens.js — specimen builders (plate/pipe weld, V1, V2, step wedge, IOW, DAC block, TKY,
 * lamination plate), outline/edge helpers and defect helpers/presets. Pure functions, no DOM.
 * Coordinates: x = distance from weld centre-line (mm, + right), y = depth (mm, + down), z = along weld.
 */
(function (UT) {
  'use strict';
  const M = UT.math;
  const C = UT.consts;
  const STEEL = { vShear: C.V_SHEAR_STEEL, vComp: C.V_COMP_STEEL, name: 'Carbon steel' };

  // ------------------------------------------------------------------ geometry helpers
  /** Points on an arc: centre (cx,cy), radius r, from angle a0 to a1 (deg, math convention x=cos, y=sin), step ≤ 2°. */
  function arcPoints(cx, cy, r, a0, a1, tag, includeEnd) {
    const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 2));
    const pts = [];
    for (let i = 0; i < (includeEnd ? n + 1 : n); i++) {
      const a = M.deg2rad(a0 + (a1 - a0) * i / n);
      pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), tag });
    }
    return pts;
  }

  /** Build edges [{a,b,tag}] from an outline whose vertices carry the tag of the edge that STARTS there. */
  function deriveEdges(outline) {
    const edges = [];
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i], b = outline[(i + 1) % outline.length];
      if (Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9) continue;
      edges.push({ a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, tag: a.tag || 'end' });
    }
    return edges;
  }

  function extentsOf(outline, holes) {
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    for (const p of outline) { xMin = Math.min(xMin, p.x); xMax = Math.max(xMax, p.x); yMin = Math.min(yMin, p.y); yMax = Math.max(yMax, p.y); }
    for (const h of holes || []) { xMin = Math.min(xMin, h.x - h.r); xMax = Math.max(xMax, h.x + h.r); yMin = Math.min(yMin, h.y - h.r); yMax = Math.max(yMax, h.y + h.r); }
    return { xMin, xMax, yMin, yMax };
  }

  function finish(spec) {
    spec.arcs = spec.arcs || [];
    spec.edges = deriveEdges(spec.outline);
    // exact arcs replace the sampled 'radius' edges for ray tracing (the sampled edges stay in outline for drawing)
    if (spec.arcs.length) spec.edges = spec.edges.filter(function (e) { return e.tag !== 'radius'; });
    spec.extents = extentsOf(spec.outline, spec.holes);
    spec.holes = spec.holes || [];
    spec.labels = spec.labels || [];
    spec.material = spec.material || STEEL;
    spec.perspex = spec.perspex || null;
    spec.weld = spec.weld || null;
    spec.pipe = spec.pipe || null;
    spec.tky = spec.tky || null;
    if (!spec.scanSurface) spec.scanSurface = { y: 0, xMin: spec.extents.xMin, xMax: spec.extents.xMax };
    if (!spec.defaultProbe) spec.defaultProbe = { x: 40, z: spec.L / 2, side: 1 };
    return spec;
  }

  /**
   * Emission point / local frame of the probe on the specimen's scanning surface.
   * chord (default, all specimens): (probe.x, 0), tangent (1,0), normal (0,1) into the metal, segment = the 'top' edge under x.
   * brace (TKY only): probe.x = distance from the toe weld along the brace's toe-side face.
   * @returns {{x:number,y:number,tangent:{x:number,y:number},normal:{x:number,y:number},segment:object|null}}
   */
  function scanSurfaceAt(spec, probe) {
    if (spec && spec.tky && probe && probe.surface === 'brace') {
      const a = M.deg2rad(spec.tky.braceAngle);
      const ux = -Math.cos(a), uy = -Math.sin(a);              // up the brace along the toe-side face
      const toe = spec.outline.find(function (p) { return p.tag === 'fusion' && p.x > spec.tky.toe.x - 1; }) || { x: spec.tky.toe.x, y: 0 };
      const start = { x: spec.tky.toe.x + ux * spec.tky.weldLeg, y: uy * spec.tky.weldLeg };
      const d = Math.max(0, probe.x);
      const pt = { x: start.x + ux * d, y: start.y + uy * d };
      const normal = { x: Math.sin(a), y: -Math.cos(a) };      // into the brace (away from the toe face)
      // brace toe-side face runs from the weld toe point up to the brace end
      const seg = spec.edges.find(function (e) { return e.tag === 'brace' && Math.abs((e.a.x - e.b.x) * uy - (e.a.y - e.b.y) * ux) < 1e-6 && e.a.x > toe.x - 200; }) || null;
      return { x: pt.x, y: pt.y, tangent: { x: ux, y: uy }, normal: { x: -normal.x, y: -normal.y }, segment: seg };
    }
    const x = probe ? probe.x : 0;
    let seg = null;
    for (const e of (spec && spec.edges) || []) {
      if (e.tag !== 'top') continue;
      const lo = Math.min(e.a.x, e.b.x), hi = Math.max(e.a.x, e.b.x);
      if (x >= lo - 1e-6 && x <= hi + 1e-6) { seg = e; break; }
    }
    if (!seg) seg = ((spec && spec.edges) || []).find(function (e) { return e.tag === 'top'; }) || null;
    return { x, y: 0, tangent: { x: 1, y: 0 }, normal: { x: 0, y: 1 }, segment: seg };
  }

  function pointInside(spec, x, y) {
    if (!M.pointInPolygon(x, y, spec.outline)) return false;
    for (const h of spec.holes || []) if (M.dist(x, y, h.x, h.y) < h.r) return false;
    return true;
  }

  // ------------------------------------------------------------------ weld profile
  const FLAT_BEAD = 0.1;   // mm: a cap/root bead lower than this is treated as the flat plate surface
  /**
   * Weld geometry for a butt weld of thickness T. Returns { outlineTop, outlineBottom, region, fusionFaces, ... }.
   * type: 'single-v' | 'double-v' | 'none'
   */
  function weldGeometry(o) {
    const T = o.T, type = o.type || 'single-v';
    const bevel = o.bevel === undefined ? 30 : o.bevel;
    const rootGap = o.rootGap === undefined ? 2 : o.rootGap;
    const rootFace = o.rootFace === undefined ? 2 : o.rootFace;
    const capWidth = o.capWidth === undefined ? 16 : o.capWidth;
    const capHeight = o.capHeight === undefined ? 2 : o.capHeight;
    const rootHeight = o.rootHeight === undefined ? 1.5 : o.rootHeight;
    const rootWidth = rootGap + 4;
    const tb = Math.tan(M.deg2rad(bevel));
    const fusionFaces = [];
    let region = [];
    if (type === 'single-v') {
      const g = rootGap / 2;
      const topHalf = g + (T - rootFace) * tb;
      // right fusion face: from root (g, T-rootFace) to top (topHalf, 0); left mirrored
      fusionFaces.push({ a: { x: g, y: T - rootFace }, b: { x: topHalf, y: 0 }, side: 1 });
      fusionFaces.push({ a: { x: -g, y: T - rootFace }, b: { x: -topHalf, y: 0 }, side: -1 });
      region = [{ x: -topHalf, y: 0 }, { x: topHalf, y: 0 }, { x: g, y: T - rootFace }, { x: g, y: T }, { x: -g, y: T }, { x: -g, y: T - rootFace }];
    } else if (type === 'double-v') {
      const g = rootGap / 2;
      const half = g + (T / 2 - rootFace / 2) * tb;
      fusionFaces.push({ a: { x: g, y: T / 2 - rootFace / 2 }, b: { x: half, y: 0 }, side: 1 });
      fusionFaces.push({ a: { x: -g, y: T / 2 - rootFace / 2 }, b: { x: -half, y: 0 }, side: -1 });
      fusionFaces.push({ a: { x: g, y: T / 2 + rootFace / 2 }, b: { x: half, y: T }, side: 1 });
      fusionFaces.push({ a: { x: -g, y: T / 2 + rootFace / 2 }, b: { x: -half, y: T }, side: -1 });
      region = [{ x: -half, y: 0 }, { x: half, y: 0 }, { x: g, y: T / 2 - rootFace / 2 }, { x: g, y: T / 2 + rootFace / 2 }, { x: half, y: T }, { x: -half, y: T }, { x: -g, y: T / 2 + rootFace / 2 }, { x: -g, y: T / 2 - rootFace / 2 }];
    }
    // cap bulge (above the surface, y < 0) and root bead (below the bottom, y > T)
    const cap = [];
    const root = [];
    if (type !== 'none') {
      const n = 8;
      // A bead lower than FLAT_BEAD is geometrically the plate surface: tag it 'top'/'bottom' so the
      // tracer's rough-bead diffuse rule (30-raytrace, SPEC §6.1 note 2) does not fire on a flat plate.
      const capTag = capHeight > FLAT_BEAD ? 'cap' : 'top';
      for (let i = 0; i <= n; i++) {
        const t = i / n; // 0..1 from left to right
        const x = -capWidth / 2 + capWidth * t;
        cap.push({ x, y: -capHeight * Math.sin(Math.PI * t), tag: capTag });
      }
      const bottomCapWidth = type === 'double-v' ? capWidth : rootWidth;
      const bottomCapHeight = type === 'double-v' ? capHeight : rootHeight;
      const rootTag = bottomCapHeight > FLAT_BEAD ? (type === 'double-v' ? 'cap' : 'root') : 'bottom';
      for (let i = 0; i <= n; i++) {
        const t = i / n; // from right to left along the bottom
        const x = bottomCapWidth / 2 - bottomCapWidth * t;
        root.push({ x, y: T + bottomCapHeight * Math.sin(Math.PI * t), tag: rootTag });
      }
    }
    return { type, bevel, rootGap, rootFace, capWidth, capHeight, rootHeight, rootWidth, fusionFaces, region, cap, root, hazHalfWidth: capWidth / 2 + 6 };
  }

  /** Plate butt weld specimen. Cross-section width 300 (x −150..150). */
  function plateWeld(opts) {
    const o = Object.assign({ T: 20, L: 300, type: 'single-v', W: 300 }, opts || {});
    const T = o.T, W = o.W;
    const wg = weldGeometry(o);
    const outline = [];
    outline.push({ x: -W / 2, y: 0, tag: 'top' });
    if (wg.cap.length) { for (const p of wg.cap) outline.push({ x: p.x, y: p.y, tag: p.tag }); outline[outline.length - 1].tag = 'top'; }
    outline.push({ x: W / 2, y: 0, tag: 'end' });
    outline.push({ x: W / 2, y: T, tag: 'bottom' });
    if (wg.root.length) { for (const p of wg.root) outline.push({ x: p.x, y: p.y, tag: p.tag }); outline[outline.length - 1].tag = 'bottom'; }
    outline.push({ x: -W / 2, y: T, tag: 'end' });
    return finish({
      id: 'plate-weld', name: `Plate ${T} mm ${wg.type === 'none' ? 'no weld' : wg.type}`, kind: 'weld', T, L: o.L,
      outline, holes: [], weld: wg, pipe: null,
      scanSurface: { y: 0, xMin: -W / 2, xMax: W / 2 },
      defaultProbe: { x: Math.round(T * Math.tan(M.deg2rad(60)) + 6), z: o.L / 2, side: 1 },
      labels: [{ x: W / 2 - 60, y: -6, text: 'CROSS SECTION' }],
    });
  }

  /** Nominal pipe size (inch) for a standard OD in mm (e.g. 168.3 → 6); falls back to od/25.4 rounded to 0.1. */
  function nominalInch(od) {
    const NPS = [[21.3, 0.5], [26.7, 0.75], [33.4, 1], [42.2, 1.25], [48.3, 1.5], [60.3, 2], [73, 2.5], [88.9, 3], [101.6, 3.5], [114.3, 4], [141.3, 5], [168.3, 6], [219.1, 8], [273.1, 10], [323.9, 12], [355.6, 14], [406.4, 16], [457.2, 18], [508, 20], [610, 24]];
    for (const [mm, inch] of NPS) if (Math.abs(od - mm) < 0.6) return inch;
    return +(od / 25.4).toFixed(1);
  }

  /** Pipe circumferential butt weld: same cross-section as a plate of thickness wt; L = circumference. */
  function pipeWeld(opts) {
    const o = Object.assign({ od: 168.3, wt: 20, type: 'single-v' }, opts || {});
    const circ = Math.PI * o.od;
    const spec = plateWeld(Object.assign({}, o, { T: o.wt, L: circ }));
    spec.id = 'pipe-weld';
    spec.name = `Pipe OD ${o.od} mm WT ${o.wt} mm`;
    spec.pipe = { od: o.od, wt: o.wt, circumference: circ, odInch: nominalInch(o.od) };
    // Quarter circumference (3 o'clock, the near side of the 3-D cylinder; the reference shows Pos 124 mm on a
    // 6 inch pipe). z = 0 put the probe symbol on the top edge of the plan-view z-window (half clipped, hidden
    // under the USK7 window) and z = L/2 (6 o'clock) faces away from the 3-D camera — QA round 4.
    spec.defaultProbe.z = Math.round(circ / 4);
    return spec;
  }

  /** IIW V1 calibration block. face 'wide' = 300×100 side view with the 100 mm radius; 'narrow' = 300×25 for 0° range. */
  function v1(opts) {
    const o = Object.assign({ face: 'wide' }, opts || {});
    if (o.face === 'narrow') {
      const outline = [{ x: 0, y: 0, tag: 'top' }, { x: 300, y: 0, tag: 'end' }, { x: 300, y: 25, tag: 'bottom' }, { x: 0, y: 25, tag: 'end' }];
      return finish({ id: 'v1', name: 'V1 block (25 mm face)', kind: 'block', T: 25, L: 100, outline, holes: [],
        scanSurface: { y: 0, xMin: 0, xMax: 300 }, defaultProbe: { x: 150, z: 50, side: 1 }, face: 'narrow',
        labels: [{ x: 150, y: 14, text: 'V1' }, { x: 150, y: 20, text: '25mm thickness. Echoes 25, 50, 75, 100 etc', small: true }] });
    }
    const outline = [];
    outline.push({ x: 0, y: 0, tag: 'top' });
    outline.push({ x: 300, y: 0, tag: 'end' });
    outline.push({ x: 300, y: 100, tag: 'bottom' });
    // bottom face from (300,100) to (100,100), then the 100 mm radius arc centred (100,0) from (100,100) to (0,0)
    for (const p of arcPoints(100, 0, 100, 90, 180, 'radius', false)) outline.push(p);
    // arcPoints starts at (100,100) — that vertex begins the arc, so the bottom edge must end there:
    return finish({
      id: 'v1', name: 'IIW V1 calibration block', kind: 'block', T: 100, L: 25, outline,
      arcs: [{ cx: 100, cy: 0, r: 100, a0: 90, a1: 180, tag: 'radius' }],
      retroSlot: true, slot: { x: 100, w: 2, d: 5 },
      holes: [{ x: 135, y: 15, r: 0.75, tag: 'sdh', label: '1.5mm' }],
      perspex: { x: 240, y: 55, r: 25 },
      scanSurface: { y: 0, xMin: 0, xMax: 300 }, defaultProbe: { x: 100, z: 12.5, side: 1 }, face: 'wide',
      labels: [{ x: 150, y: 60, text: 'V1', big: true }, { x: 60, y: 30, text: '100mm Radius', small: true }, { x: 240, y: 55, text: '50mm Perspex', small: true }, { x: 100, y: -5, text: '0', small: true }],
    });
  }

  /** V2 miniature block. wide: R25 arc left + R50 arc right about the index C=(60,0). narrow: 100×12.5 with 5 mm hole. */
  function v2(opts) {
    const o = Object.assign({ face: 'wide' }, opts || {});
    if (o.face === 'narrow') {
      const outline = [{ x: 0, y: 0, tag: 'top' }, { x: 100, y: 0, tag: 'end' }, { x: 100, y: 12.5, tag: 'bottom' }, { x: 0, y: 12.5, tag: 'end' }];
      return finish({ id: 'v2', name: 'V2 block (12.5 mm face)', kind: 'block', T: 12.5, L: 50, outline,
        holes: [{ x: 60, y: 6.25, r: 2.5, tag: 'hole', label: '5mm' }], scanSurface: { y: 0, xMin: 0, xMax: 100 },
        defaultProbe: { x: 30, z: 25, side: 1 }, face: 'narrow', labels: [{ x: 20, y: 8, text: 'V2' }] });
    }
    const outline = [];
    outline.push({ x: 35, y: 0, tag: 'top' });
    outline.push({ x: 110, y: 0, tag: 'radius' });
    for (const p of arcPoints(60, 0, 50, 0, 90, 'radius', false)) { if (p.x < 110 - 1e-6) outline.push(p); }
    outline.push({ x: 60, y: 50, tag: 'end' });
    outline.push({ x: 60, y: 25, tag: 'radius' });
    for (const p of arcPoints(60, 0, 25, 90, 180, 'radius', false)) { if (p.y > 1e-6 && p.y < 25 - 1e-6) outline.push(p); }
    return finish({
      id: 'v2', name: 'V2 calibration block', kind: 'block', T: 50, L: 12.5, outline, holes: [],
      arcs: [{ cx: 60, cy: 0, r: 25, a0: 90, a1: 180, tag: 'radius' }, { cx: 60, cy: 0, r: 50, a0: 0, a1: 90, tag: 'radius' }],
      scanSurface: { y: 0, xMin: 35, xMax: 110 }, defaultProbe: { x: 60, z: 6, side: 1 }, face: 'wide',
      labels: [{ x: 70, y: 30, text: 'V2', big: true }, { x: 45, y: 16, text: 'R25', small: true }, { x: 90, y: 28, text: 'R50', small: true }, { x: 60, y: -5, text: '0', small: true }],
    });
  }

  /** Step wedge: top flat, bottom stepped. steps = thickness per step (mm), stepLen = length of each step. */
  function stepWedge(opts) {
    const o = Object.assign({ steps: [5, 10, 15, 20, 25], stepLen: 40 }, opts || {});
    const n = o.steps.length, len = o.stepLen, W = n * len;
    const outline = [{ x: 0, y: 0, tag: 'top' }, { x: W, y: 0, tag: 'end' }];
    for (let i = n - 1; i >= 0; i--) {
      const t = o.steps[i];
      outline.push({ x: (i + 1) * len, y: t, tag: 'step' });
      outline.push({ x: i * len, y: t, tag: 'end' });
    }
    const Tmax = Math.max.apply(null, o.steps);
    const spec = finish({
      id: 'step', name: 'Step wedge', kind: 'block', T: Tmax, L: 50, outline, holes: [],
      scanSurface: { y: 0, xMin: 0, xMax: W }, defaultProbe: { x: len / 2, z: 25, side: 1 },
      steps: o.steps.slice(), stepLen: len,
      labels: o.steps.map(function (t, i) { return { x: i * len + len / 2, y: t + 5, text: t + 'mm', small: true }; }),
    });
    spec.thicknessAt = function (x) { const i = M.clamp(Math.floor(x / len), 0, n - 1); return o.steps[i]; };
    return spec;
  }

  /** IOW / A5 beam-profile block: 300 × 45 with 1.5 mm SDHs at 13/19/25/43 mm and a depth ladder at x=280. */
  function iow() {
    const outline = [{ x: 0, y: 0, tag: 'top' }, { x: 300, y: 0, tag: 'end' }, { x: 300, y: 45, tag: 'bottom' }, { x: 0, y: 45, tag: 'end' }];
    // deep → shallow from the left so every hole can be reached from the right with 45–70° probes
    const holes = [
      { x: 60, y: 43, r: 0.75, tag: 'sdh', label: '43mm' }, { x: 120, y: 25, r: 0.75, tag: 'sdh', label: '25mm' },
      { x: 180, y: 19, r: 0.75, tag: 'sdh', label: '19mm' }, { x: 240, y: 13, r: 0.75, tag: 'sdh', label: '13mm' },
    ];
    [8, 14, 20, 26, 32].forEach(function (d) { holes.push({ x: 20, y: d, r: 0.75, tag: 'sdh', label: d + 'mm', ladder: true }); });
    return finish({ id: 'iow', name: 'A5 IOW beam profile block', kind: 'block', T: 45, L: 100, outline, holes,
      scanSurface: { y: 0, xMin: 0, xMax: 300 }, defaultProbe: { x: 262, z: 50, side: 1 },
      labels: holes.filter(function (h) { return !h.ladder; }).map(function (h) { return { x: h.x + 4, y: h.y - 3, text: h.label, small: true }; }) });
  }

  /** DAC block: T=40 (default) with 3 mm SDHs at T/4, T/2, 3T/4 and 2 mm notches at each bottom corner. */
  function dacBlock(opts) {
    const o = Object.assign({ T: 40, sdh: 3 }, opts || {});
    const T = o.T;
    const outline = [
      { x: 0, y: 0, tag: 'top' }, { x: 300, y: 0, tag: 'end' }, { x: 300, y: T, tag: 'bottom' },
      { x: 296, y: T, tag: 'end' }, { x: 296, y: T - 2, tag: 'bottom' }, { x: 294, y: T - 2, tag: 'end' }, { x: 294, y: T, tag: 'bottom' },
      { x: 6, y: T, tag: 'end' }, { x: 6, y: T - 2, tag: 'bottom' }, { x: 4, y: T - 2, tag: 'end' }, { x: 4, y: T, tag: 'bottom' },
      { x: 0, y: T, tag: 'end' },
    ];
    const holes = [
      { x: 80, y: T / 4, r: o.sdh / 2, tag: 'sdh', label: (T / 4) + 'mm' },
      { x: 150, y: T / 2, r: o.sdh / 2, tag: 'sdh', label: (T / 2) + 'mm' },
      { x: 220, y: 3 * T / 4, r: o.sdh / 2, tag: 'sdh', label: (3 * T / 4) + 'mm' },
    ];
    return finish({ id: 'dac', name: 'DAC reference block', kind: 'block', T, L: 100, outline, holes,
      scanSurface: { y: 0, xMin: 0, xMax: 300 }, defaultProbe: { x: 80 + Math.round((T / 4) * Math.tan(M.deg2rad(60))), z: 50, side: 1 },
      labels: holes.map(function (h) { return { x: h.x + 5, y: h.y - 3, text: h.label + ' SDH', small: true }; }) });
  }

  /**
   * TKY joint: chord plate (x −150..150, y 0..chordT) with a brace of thickness braceT rising to the
   * upper-left from the toe at x = braceOffset, at braceAngle (deg from the chord surface). Fillet welds at toe & heel.
   */
  function tky(opts) {
    const o = Object.assign({ braceAngle: 45, braceT: 12, chordT: 20, braceOffset: 0, braceLen: 90, weldLeg: 8 }, opts || {});
    const a = M.deg2rad(o.braceAngle);
    const ux = -Math.cos(a), uy = -Math.sin(a);          // up the brace (toe surface direction)
    const nx = -Math.sin(a), ny = Math.cos(a);           // perpendicular pointing from toe surface toward heel surface... (left/up)
    // toe surface starts at (xt, 0); heel surface is offset by braceT along the normal (toward −x)
    const xt = o.braceOffset;
    const xh = xt - o.braceT / Math.sin(a);              // heel intersection with the chord surface
    const leg = o.weldLeg;
    const toeWeldOnBrace = { x: xt + ux * leg, y: uy * leg };
    const heelWeldOnBrace = { x: xh - Math.cos(a) * leg, y: -Math.sin(a) * leg };
    const braceEndToe = { x: xt + ux * o.braceLen, y: uy * o.braceLen };
    const braceEndHeel = { x: xh + ux * (o.braceLen - o.braceT / Math.tan(a)), y: uy * (o.braceLen - o.braceT / Math.tan(a)) };
    const outline = [
      { x: -150, y: 0, tag: 'top' },
      { x: xh - leg, y: 0, tag: 'fusion' },            // heel weld face (chord → brace)
      { x: heelWeldOnBrace.x, y: heelWeldOnBrace.y, tag: 'brace' },
      { x: braceEndHeel.x, y: braceEndHeel.y, tag: 'end' },
      { x: braceEndToe.x, y: braceEndToe.y, tag: 'brace' },
      { x: toeWeldOnBrace.x, y: toeWeldOnBrace.y, tag: 'fusion' }, // toe weld face (brace → chord)
      { x: xt + leg, y: 0, tag: 'top' },
      { x: 150, y: 0, tag: 'end' },
      { x: 150, y: o.chordT, tag: 'bottom' },
      { x: -150, y: o.chordT, tag: 'end' },
    ];
    void nx; void ny;
    return finish({
      id: 'tky', name: `TKY joint ${o.braceAngle}°`, kind: 'tky', T: o.chordT, L: 300, outline, holes: [],
      tky: { braceAngle: o.braceAngle, braceT: o.braceT, chordT: o.chordT, braceOffset: o.braceOffset, braceLen: o.braceLen, weldLeg: leg, toe: { x: xt, y: 0 }, heel: { x: xh, y: 0 }, side: 1 },
      weld: { type: 'fillet', fusionFaces: [{ a: { x: xt, y: 0 }, b: { x: toeWeldOnBrace.x, y: toeWeldOnBrace.y }, side: 1 }], region: [{ x: xt, y: 0 }, { x: xt + leg, y: 0 }, toeWeldOnBrace], cap: [], root: [], capWidth: leg * 2, hazHalfWidth: leg + 4 },
      scanSurface: { y: 0, xMin: xt + leg + 2, xMax: 150 },
      defaultProbe: { x: xt + leg + Math.round(o.chordT * Math.tan(M.deg2rad(60))), z: 150, side: 1 },
      labels: [{ x: 90, y: -8, text: 'CHORD', small: true }, { x: braceEndToe.x + 8, y: braceEndToe.y + 4, text: 'BRACE', small: true }],
    });
  }

  /** Plain plate for lamination checks. */
  function laminationPlate(opts) {
    const o = Object.assign({ T: 25, L: 300, W: 300 }, opts || {});
    const outline = [{ x: -o.W / 2, y: 0, tag: 'top' }, { x: o.W / 2, y: 0, tag: 'end' }, { x: o.W / 2, y: o.T, tag: 'bottom' }, { x: -o.W / 2, y: o.T, tag: 'end' }];
    return finish({ id: 'lamination-plate', name: `Plate ${o.T} mm (lamination check)`, kind: 'block', T: o.T, L: o.L, outline, holes: [],
      scanSurface: { y: 0, xMin: -o.W / 2, xMax: o.W / 2 }, defaultProbe: { x: 40, z: o.L / 2, side: 1 } });
  }

  /** Build by id (used by UT.test.loadSpecimen and modes). */
  function build(id, opts) {
    switch (id) {
      case 'plate-weld': return plateWeld(opts);
      case 'pipe-weld': return pipeWeld(opts);
      case 'v1': return v1(opts);
      case 'v2': return v2(opts);
      case 'step': return stepWedge(opts);
      case 'iow': return iow(opts);
      case 'dac': return dacBlock(opts);
      case 'tky': return tky(opts);
      case 'lamination-plate': return laminationPlate(opts);
      default: throw new Error('Unknown specimen id: ' + id);
    }
  }

  // ------------------------------------------------------------------ defects
  const PLANAR_TYPES = { planar: 1, crack: 1, lof: 1, lamination: 1, root: 1 };
  function isPlanar(type) { return !!PLANAR_TYPES[type]; }
  const COORD_MAX = 2000;        // mm: |x|,|y| of defect points are clamped to this (specimens are ≤ 300 mm wide)
  const MAX_DEFECT_PTS = 400;    // polyline vertices kept per defect (brush decimation gives ≤ ~100)
  const MAX_INTERIOR_SAMPLES = 4000;   // interior grid samples per volumetric defect
  const MAX_OUTLINE_SAMPLES = 3000;    // outline samples per volumetric defect

  function finiteNum(v, dflt) { const n = typeof v === 'string' ? parseFloat(v) : v; return Number.isFinite(n) ? n : dflt; }

  /** Sanitise a points array: numeric finite {x,y} only, clamped to ±COORD_MAX, at most MAX_DEFECT_PTS vertices. */
  function sanitisePts(pts) {
    if (!Array.isArray(pts)) return [];
    const out = [];
    for (const p of pts) {
      if (!p || typeof p !== 'object') continue;
      const x = finiteNum(p.x, NaN), y = finiteNum(p.y, NaN);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      out.push({ x: M.clamp(x, -COORD_MAX, COORD_MAX), y: M.clamp(y, -COORD_MAX, COORD_MAX) });
    }
    if (out.length > MAX_DEFECT_PTS) {
      const k = Math.ceil(out.length / MAX_DEFECT_PTS), thin = [];
      for (let i = 0; i < out.length; i += k) thin.push(out[i]);
      if (thin[thin.length - 1] !== out[out.length - 1]) thin.push(out[out.length - 1]);
      return thin;
    }
    return out;
  }

  function bbox(pts) {
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    for (const p of pts) { xMin = Math.min(xMin, p.x); xMax = Math.max(xMax, p.x); yMin = Math.min(yMin, p.y); yMax = Math.max(yMax, p.y); }
    return { xMin, xMax, yMin, yMax, w: xMax - xMin, h: yMax - yMin, cx: (xMin + xMax) / 2, cy: (yMin + yMax) / 2 };
  }

  /** Decimate a brush polyline to points ≥ minStep apart (keeps first and last). */
  function decimate(pts, minStep) {
    const out = [];
    for (const p of pts) {
      if (!out.length || M.dist(out[out.length - 1].x, out[out.length - 1].y, p.x, p.y) >= (minStep || 1.5)) out.push({ x: +p.x.toFixed(2), y: +p.y.toFixed(2) });
    }
    if (pts.length > 1) { const l = pts[pts.length - 1]; const o = out[out.length - 1]; if (o.x !== l.x || o.y !== l.y) out.push({ x: +l.x.toFixed(2), y: +l.y.toFixed(2) }); }
    return out.length >= 2 ? out : (out.length === 1 ? [out[0], { x: out[0].x + 1, y: out[0].y }] : []);
  }

  function makeDefect(o) {
    o = o || {};
    const clean = sanitisePts(o.pts);
    const pts = clean.length >= 2 ? clean : [{ x: 0, y: 10 }, { x: 0, y: 13 }];
    const b = bbox(pts);
    const n = Math.max(1, Math.round(finiteNum(o.n, 1)));
    const type = typeof o.type === 'string' && o.type ? o.type : 'planar';
    const zFrom = M.clamp(finiteNum(o.zFrom, 135), -COORD_MAX, COORD_MAX);
    const zTo = M.clamp(o.zTo === undefined ? zFrom + finiteNum(o.length, 30) : finiteNum(o.zTo, zFrom + 30), -COORD_MAX, COORD_MAX);
    const autoH = Math.max(0.5, +Math.max(b.h, isPlanar(type) ? 0 : b.w).toFixed(1));
    return {
      id: o.id || UT.uid(), n, type, pts,
      height: Math.max(0, finiteNum(o.height, autoH)),
      width: +b.w.toFixed(1),
      zFrom, zTo, reflectivity: M.clamp(finiteNum(o.reflectivity, 1), 0, 10),
      label: typeof o.label === 'string' && o.label ? o.label : ('Defect ' + n), visible: o.visible !== false,
    };
  }

  /** Create a defect from cross-section brush points. */
  function defectFromBrush(pts, type, o) {
    const d = decimate(pts, 1.5);
    return makeDefect(Object.assign({ pts: d, type: type || 'planar' }, o || {}));
  }

  function defectLength(d, spec) {
    let len = d.zTo - d.zFrom;
    if (spec && spec.pipe && len < 0) len += spec.L;
    return len;
  }

  /**
   * Sample points of a volumetric defect (outline every 1 mm + interior 1.5 mm grid).
   * The sample count is bounded (MAX_OUTLINE_SAMPLES / MAX_INTERIOR_SAMPLES): for an absurdly large
   * polygon the steps grow so a frame never spends more than a few ms here.
   */
  function defectSamples(d) {
    const out = [];
    const pts = sanitisePts(d && d.pts);
    if (!pts.length) return out;
    let total = 0;
    for (let i = 0; i < pts.length - 1; i++) total += M.dist(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
    const step = Math.max(1, total / MAX_OUTLINE_SAMPLES);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const n = Math.max(1, Math.ceil(M.dist(a.x, a.y, b.x, b.y) / step));
      for (let k = 0; k < n; k++) out.push({ x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n });
    }
    out.push(pts[pts.length - 1]);
    if (!isPlanar(d.type) && pts.length >= 3) {
      const b = bbox(pts);
      const g = Math.max(1.5, Math.sqrt(Math.max(0, b.w * b.h) / MAX_INTERIOR_SAMPLES));
      for (let x = b.xMin; x <= b.xMax; x += g) for (let y = b.yMin; y <= b.yMax; y += g) if (M.pointInPolygon(x, y, pts)) out.push({ x, y });
    }
    return out;
  }

  function circlePts(cx, cy, r, n) {
    const pts = [];
    for (let i = 0; i < (n || 10); i++) { const a = 2 * Math.PI * i / (n || 10); pts.push({ x: +(cx + r * Math.cos(a)).toFixed(2), y: +(cy + r * Math.sin(a)).toFixed(2) }); }
    pts.push({ x: pts[0].x, y: pts[0].y });
    return pts;
  }

  /** Defect presets: each (spec, o) → Defect placed sensibly for the specimen's weld. */
  const defectPresets = {
    rootCrack(spec, o) {
      const T = spec.T, h = (o && o.height) || 3;
      const bead = (spec.weld && spec.weld.type === 'single-v') ? (spec.weld.rootHeight || 0) : 0;   // crack reaches the root bead crown
      return makeDefect(Object.assign({ type: 'crack', label: 'Root crack', pts: [{ x: 0, y: T - h }, { x: 0, y: T + bead }], height: h + bead, zFrom: spec.L / 2 - 15, length: 30 }, o || {}));
    },
    incompletePenetration(spec, o) {
      const T = spec.T, rf = (spec.weld && spec.weld.rootFace) || 2;
      return makeDefect(Object.assign({ type: 'root', label: 'Incomplete penetration', pts: [{ x: 0, y: T - rf - 0.5 }, { x: 0, y: T }], height: rf + 0.5, zFrom: spec.L / 2 - 20, length: 40 }, o || {}));
    },
    lof(spec, o) {
      const side = (o && o.side) || 1;
      const faces = (spec.weld && spec.weld.fusionFaces) || [];
      const face = faces.find(function (f) { return f.side === side; }) || { a: { x: 0, y: spec.T - 2 }, b: { x: spec.T * 0.58, y: 0 } };
      const t0 = (o && o.t0) || 0.35, t1 = (o && o.t1) || 0.65;
      const p = function (t) { return { x: +(face.a.x + (face.b.x - face.a.x) * t).toFixed(2), y: +(face.a.y + (face.b.y - face.a.y) * t).toFixed(2) }; };
      return makeDefect(Object.assign({ type: 'lof', label: 'Lack of side-wall fusion', pts: [p(t0), p(t1)], zFrom: spec.L / 2 - 12, length: 25 }, o || {}));
    },
    porosity(spec, o) {
      const T = spec.T, r = ((o && o.dia) || 3) / 2;
      return makeDefect(Object.assign({ type: 'porosity', label: 'Porosity', pts: circlePts((o && o.x) || 0, (o && o.y) || T / 2, r, 10), height: r * 2, zFrom: spec.L / 2 - 8, length: 16, reflectivity: 0.6 }, o || {}));
    },
    slag(spec, o) {
      const T = spec.T, cx = (o && o.x) || 2, cy = (o && o.y) || T * 0.55;
      const pts = [{ x: cx - 3, y: cy - 0.8 }, { x: cx + 3, y: cy - 0.8 }, { x: cx + 3.5, y: cy + 0.8 }, { x: cx - 3.5, y: cy + 0.8 }, { x: cx - 3, y: cy - 0.8 }];
      return makeDefect(Object.assign({ type: 'slag', label: 'Slag inclusion', pts, height: 1.6, zFrom: spec.L / 2 - 20, length: 40, reflectivity: 0.8 }, o || {}));
    },
    toeCrack(spec, o) {
      const side = (o && o.side) || 1, cw = (spec.weld && spec.weld.capWidth) || 16, h = (o && o.height) || 3;
      const x0 = side * cw / 2;
      return makeDefect(Object.assign({ type: 'crack', label: 'Toe crack', pts: [{ x: x0, y: 0 }, { x: x0 - side * h * 0.5, y: h }], height: h, zFrom: spec.L / 2 - 10, length: 20 }, o || {}));
    },
    centrelineCrack(spec, o) {
      const T = spec.T, h = (o && o.height) || 6;
      return makeDefect(Object.assign({ type: 'crack', label: 'Centreline crack', pts: [{ x: 0, y: T / 2 - h / 2 }, { x: 0, y: T / 2 + h / 2 }], height: h, zFrom: spec.L / 2 - 15, length: 30 }, o || {}));
    },
    lamination(spec, o) {
      const T = spec.T, y = (o && o.y) || +(T / 2).toFixed(1), x0 = (o && o.x0) || 20, x1 = (o && o.x1) || 60;
      return makeDefect(Object.assign({ type: 'lamination', label: 'Lamination', pts: [{ x: x0, y }, { x: x1, y }], height: 0.5, zFrom: spec.L / 2 - 30, length: 60 }, o || {}));
    },
  };
  const defectPresetNames = [
    { key: 'rootCrack', label: 'Root crack (균열)' }, { key: 'incompletePenetration', label: 'Incomplete penetration (용입 부족)' },
    { key: 'lof', label: 'Lack of side-wall fusion (융합 불량)' }, { key: 'porosity', label: 'Porosity (기공)' },
    { key: 'slag', label: 'Slag inclusion (슬래그)' }, { key: 'toeCrack', label: 'Toe crack (토우 균열)' },
    { key: 'centrelineCrack', label: 'Centreline crack' }, { key: 'lamination', label: 'Lamination (라미네이션)' },
  ];

  /** Validate/normalise a defects array (used by UT.test.setDefects and Load Def). */
  function normaliseDefects(arr) {
    const out = [];
    if (!Array.isArray(arr)) return out;
    arr.forEach(function (d, i) {
      if (!d || typeof d !== 'object') return;
      const pts = sanitisePts(d.pts);
      if (pts.length < 2) return;                       // corrupt / non-finite records are dropped
      const n = Number.isFinite(finiteNum(d.n, NaN)) ? d.n : i + 1;
      out.push(makeDefect(Object.assign({}, d, { pts, n })));
    });
    return out.slice(0, 16);
  }

  UT.specimens = {
    arcPoints, deriveEdges, extentsOf, pointInside, scanSurfaceAt, weldGeometry, nominalInch,
    plateWeld, pipeWeld, v1, v2, stepWedge, iow, dacBlock, tky, laminationPlate, build,
    isPlanar, bbox, decimate, makeDefect, defectFromBrush, defectLength, defectSamples, circlePts,
    defectPresets, defectPresetNames, normaliseDefects,
    __selftest() {
      const f = [];
      const p = plateWeld({ T: 20 });
      if (!pointInside(p, 10, 10)) f.push('plate inside');
      if (pointInside(p, 10, 25)) f.push('plate outside');
      if (!p.edges.some(function (e) { return e.tag === 'root'; })) f.push('root edge missing');
      const b = v1();
      if (!pointInside(b, 150, 50)) f.push('v1 inside');
      if (pointInside(b, 10, 90)) f.push('v1 arc region should be outside');
      if (!b.arcs || b.arcs.length !== 1 || b.arcs[0].r !== 100) f.push('v1 arcs');
      if (b.edges.some(function (e) { return e.tag === 'radius'; })) f.push('v1 radius edges should be excluded from edges');
      if (b.outline.filter(function (p) { return p.tag === 'radius'; }).length < 40) f.push('v1 arc outline samples');
      const w = v2();
      if (!pointInside(w, 60, 10)) f.push('v2 inside');
      if (pointInside(w, 40, 20)) f.push('v2 outside R25');
      const s = stepWedge();
      if (s.thicknessAt(10) !== 5 || s.thicknessAt(190) !== 25) f.push('step thickness');
      const t = tky();
      if (!pointInside(t, 50, 10)) f.push('tky chord inside');
      const ss = scanSurfaceAt(p, { x: 40 });
      if (!ss.segment || ss.segment.tag !== 'top' || ss.y !== 0) f.push('scanSurfaceAt chord');
      const sb = scanSurfaceAt(t, { x: 20, surface: 'brace' });
      if (!(sb.y < -10) || Math.abs(Math.hypot(sb.normal.x, sb.normal.y) - 1) > 1e-6) f.push('scanSurfaceAt brace ' + JSON.stringify(sb));
      const lof = defectPresets.lof(p);
      if (lof.pts.length !== 2) f.push('lof preset');
      // flat beads are plate surface (no 'cap'/'root' tags); a real bead keeps its tag
      const flat = plateWeld({ T: 20, rootHeight: 0, capHeight: 0 });
      if (flat.edges.some(function (e) { return e.tag === 'root' || e.tag === 'cap'; })) f.push('flat bead should be tagged top/bottom');
      if (!pointInside(flat, 0, 19.9) || pointInside(flat, 0, 20.1)) f.push('flat bead outline');
      // defect sanitising + bounded sampling
      const nd = normaliseDefects([{ n: 'x', type: 'crack', pts: [{ x: 'a', y: NaN }, { x: null }] }, { n: '2', type: 'porosity', pts: [{ x: 1e6, y: -1e6 }, { x: 2, y: 2 }, { x: 1e6, y: 2 }, { x: 'z' }] }]);
      if (nd.length !== 1 || nd[0].n !== 2 || nd[0].pts.length !== 3 || nd[0].pts.some(function (q) { return !Number.isFinite(q.x) || !Number.isFinite(q.y) || Math.abs(q.x) > 2000 || Math.abs(q.y) > 2000; })) f.push('normaliseDefects sanitise ' + JSON.stringify(nd));
      const t0 = Date.now(), ns = defectSamples(nd[0]).length;
      if (ns > 8000 || Date.now() - t0 > 200) f.push('defectSamples bound ' + ns);
      if (defectSamples(defectPresets.porosity(p)).length < 12) f.push('porosity samples');
      return f;
    },
  };
})(window.UT = window.UT || {});
