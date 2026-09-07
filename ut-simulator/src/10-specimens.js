/* 10-specimens.js — specimen builders (plate/pipe weld, V1, V2, step wedge, IOW, DAC block, TKY,
 * lamination plate, FBH block), outline/edge helpers, materials, weld preparations and defect
 * helpers/presets. Pure functions, no DOM.
 * Coordinates: x = distance from weld centre-line (mm, + right), y = depth (mm, + down), z = along weld.
 *
 * v2 additions (SPEC-v2 §3.4, §3.8, §5.1):
 *  - UT.specimens.materials + opts.material on every builder → spec.material {key, name, nameKo, vComp,
 *    vShear, atten5, attenL5, attenS5, poisson, grass, anisotropic}.
 *  - weld preparations via opts.prep ('single-v' | 'double-v' | 'single-bevel' | 'j' | 'single-v-backing' |
 *    'fillet-t' | 'nozzle' | 'none'); legacy opts.type is still accepted. spec.prep, spec.weld.prep,
 *    spec.weld.backing / web polygons, fusionFaces[].tag, weld.regions (fillet welds have two polygons).
 *  - spec.reflectors (NEW): generic planar reflector segments that are NOT part of the outline:
 *    [{a:{x,y}, b:{x,y}, tag, d, label}]. The tracer treats each as a specular planar reflector with tip
 *    diffraction at its ends. Used by fbhBlock (tag 'fbh', d = hole diameter) and by the set-on T-joint /
 *    nozzle for the unfused web-to-plate interface (tag 'interface').
 *  - spec.fbhs (fbhBlock): [{x, y, d, label}] — the view draws the bar and the drill shaft down to the bottom face.
 *  - scanSurfaceAt(spec, {surface:'web', side, x}): probe on a web face of the fillet T-joint (x = distance up
 *    the web from the fillet's web toe, side ±1 selects the face; the beam always points down toward the joint).
 *  - segmentInRegion / pointInWeld region helpers; defect presets backingLof and toeCrackFillet; prepNames.
 */
(function (UT) {
  'use strict';
  const M = UT.math;
  const C = UT.consts;

  // ------------------------------------------------------------------ materials (SPEC-v2 §3.4)
  /** key → {name, nameKo, vComp, vShear (mm/µs), atten5 (legacy two-way dB/mm at 5 MHz), attenL5/attenS5 (ONE-WAY dB/mm at 5 MHz, longitudinal/shear — used by the v2 tracer as M = 10^(−atten·2·path/20)), poisson, grass (0..1), anisotropic}. */
  const materials = {
    carbon:     { key: 'carbon',     name: 'Carbon steel',        nameKo: '탄소강',                 vComp: C.V_COMP_STEEL, vShear: C.V_SHEAR_STEEL, atten5: 0.010, grass: 0.02, attenL5: 0.005, attenS5: 0.010, poisson: 0.29, anisotropic: false },
    austenitic: { key: 'austenitic', name: 'Austenitic stainless', nameKo: '오스테나이트계 스테인리스강', vComp: 5.66, vShear: 3.12, atten5: 0.045, grass: 0.12, attenL5: 0.10, attenS5: 0.14, poisson: 0.29, anisotropic: true },
    aluminium:  { key: 'aluminium',  name: 'Aluminium',           nameKo: '알루미늄',               vComp: 6.32, vShear: 3.13, atten5: 0.004, grass: 0.01, attenL5: 0.003, attenS5: 0.004, poisson: 0.33, anisotropic: false },
    copper:     { key: 'copper',     name: 'Copper',              nameKo: '구리',                   vComp: 4.66, vShear: 2.33, atten5: 0.030, grass: 0.06, attenL5: 0.05, attenS5: 0.08, poisson: 0.34, anisotropic: false },
    titanium:   { key: 'titanium',   name: 'Titanium',            nameKo: '티타늄',                 vComp: 6.10, vShear: 3.12, atten5: 0.008, grass: 0.02, attenL5: 0.006, attenS5: 0.008, poisson: 0.32, anisotropic: false },
    castiron:   { key: 'castiron',   name: 'Cast iron',           nameKo: '주철',                   vComp: 4.60, vShear: 2.60, atten5: 0.080, grass: 0.20, attenL5: 0.10, attenS5: 0.15, poisson: 0.26, anisotropic: true },
    perspex:    { key: 'perspex',    name: 'Perspex (PMMA)',      nameKo: '퍼스펙스(아크릴)',        vComp: 2.74, vShear: 1.43, atten5: 0.15,  grass: 0.0,  anisotropic: false, attenL5: 0.30, attenS5: 0.30, poisson: 0.35 },
  };
  // SPEC-v2 §3.4: spec.material = materialOf(state.material) carries the FULL record — incl. poisson (20-probe's
  // derived.vRayleigh) and the one-way attenL5/attenS5 (30 may read them directly instead of the key lookup).
  const MATERIAL_FIELDS = ['key', 'name', 'nameKo', 'vComp', 'vShear', 'atten5', 'attenL5', 'attenS5', 'poisson', 'grass', 'anisotropic'];

  /**
   * Resolve a material key or object to a fresh {key, name, nameKo, vComp, vShear, atten5, attenL5, attenS5, poisson, grass, anisotropic}.
   * Unknown keys / missing → carbon. An object is merged over the material named by its key (carbon otherwise),
   * so a partial {vShear: 3.1} still yields a complete record.
   */
  function materialOf(m) {
    let base = materials.carbon;
    let over = null;
    if (typeof m === 'string') base = materials[m] || materials.carbon;
    else if (m && typeof m === 'object') { base = (m.key && materials[m.key]) || materials.carbon; over = m; }
    const out = {};
    for (const k of MATERIAL_FIELDS) out[k] = over && over[k] !== undefined ? over[k] : base[k];
    if (!Number.isFinite(out.vComp) || out.vComp <= 0) out.vComp = base.vComp;
    if (!Number.isFinite(out.vShear) || out.vShear <= 0) out.vShear = base.vShear;
    if (!materials[out.key] && !(over && over.key)) out.key = base.key;
    return out;
  }

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
    spec.material = materialOf(spec.material);
    spec.perspex = spec.perspex || null;
    spec.weld = spec.weld || null;
    spec.pipe = spec.pipe || null;
    spec.tky = spec.tky || null;
    spec.reflectors = spec.reflectors || [];   // v2: planar reflector segments outside the outline (see header)
    spec.fbhs = spec.fbhs || [];
    spec.nozzle = spec.nozzle || null;
    if (spec.prep === undefined) spec.prep = spec.weld ? (spec.weld.prep || spec.weld.type || null) : null;
    if (!spec.scanSurface) spec.scanSurface = { y: 0, xMin: spec.extents.xMin, xMax: spec.extents.xMax };
    if (!spec.defaultProbe) spec.defaultProbe = { x: 40, z: spec.L / 2, side: 1 };
    return spec;
  }

  /**
   * Emission point / local frame of the probe on the specimen's scanning surface.
   * chord (default, all specimens): (probe.x, 0), tangent (1,0), normal (0,1) into the metal, segment = the 'top' edge under x.
   * brace (TKY only): probe.x = distance from the toe weld along the brace's toe-side face.
   * web (fillet T-joint / nozzle only): probe.side (±1) selects the web face (x = ±webT/2); probe.x = distance up
   *   the web from the fillet's web toe (y = −leg). normal points into the web; −side·tangent points down the web,
   *   so the refracted beam heads toward the joint for either side (same convention as the brace).
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
    if (spec && spec.weld && spec.weld.web && probe && probe.surface === 'web') {
      const side = probe.side === -1 ? -1 : 1;
      const w = spec.weld;
      const xf = side * w.webT / 2;
      const d = Math.max(0, probe.x || 0);
      const seg = (spec.edges || []).find(function (e) { return e.tag === 'web' && Math.abs(e.a.x - xf) < 1e-6 && Math.abs(e.b.x - xf) < 1e-6; }) || null;
      return { x: xf, y: -w.leg - d, tangent: { x: 0, y: -side }, normal: { x: -side, y: 0 }, segment: seg };
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

  // ------------------------------------------------------------------ weld region helpers (SPEC-v2 §3.4)
  /** All weld-metal polygons of a specimen ([] when there is no weld). Fillet welds carry two (regions). */
  function weldRegions(spec) {
    const w = spec && spec.weld;
    if (!w) return [];
    if (Array.isArray(w.regions) && w.regions.length) return w.regions.filter(function (r) { return r && r.length >= 3; });
    return w.region && w.region.length >= 3 ? [w.region] : [];
  }

  /** Length (mm) of segment a–b inside polygon poly (concave polygons ok; boundary crossings split the segment). */
  function segmentInPolygon(a, b, poly) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (!(len > 0)) return 0;
    const ts = [0, 1];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      const ex = q.x - p.x, ey = q.y - p.y;
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12) continue;
      const t = ((p.x - a.x) * ey - (p.y - a.y) * ex) / den;
      const u = ((p.x - a.x) * dy - (p.y - a.y) * dx) / den;
      if (t > 0 && t < 1 && u >= -1e-9 && u <= 1 + 1e-9) ts.push(t);
    }
    ts.sort(function (p, q) { return p - q; });
    let inside = 0;
    for (let i = 0; i + 1 < ts.length; i++) {
      const t0 = ts[i], t1 = ts[i + 1];
      if (t1 - t0 < 1e-12) continue;
      const tm = (t0 + t1) / 2;
      if (M.pointInPolygon(a.x + dx * tm, a.y + dy * tm, poly)) inside += (t1 - t0) * len;
    }
    return inside;
  }

  /** Length (mm) of segment a–b that lies inside the weld metal (spec.weld.region / regions); 0 without a weld. */
  function segmentInRegion(spec, a, b) {
    if (!a || !b) return 0;
    let sum = 0;
    for (const r of weldRegions(spec)) sum += segmentInPolygon(a, b, r);
    return sum;
  }

  /** True when (x, y) lies inside the weld metal of spec. */
  function pointInWeld(spec, x, y) {
    for (const r of weldRegions(spec)) if (M.pointInPolygon(x, y, r)) return true;
    return false;
  }

  // ------------------------------------------------------------------ weld profile
  const FLAT_BEAD = 0.1;   // mm: a cap/root bead lower than this is treated as the flat plate surface
  const PREPS = ['single-v', 'double-v', 'single-bevel', 'j', 'single-v-backing', 'fillet-t', 'nozzle', 'none'];
  /** Weld preparation menu entries (English label + Korean). */
  const prepNames = [
    { key: 'single-v', label: 'Single-V', ko: '단면 V형' },
    { key: 'double-v', label: 'Double-V (X)', ko: '양면 V형(X형)' },
    { key: 'single-bevel', label: 'Single-bevel (K)', ko: '단면 베벨(K형)' },
    { key: 'j', label: 'Single-J', ko: 'J형' },
    { key: 'single-v-backing', label: 'Single-V with backing bar', ko: '배킹바 단면 V형' },
    { key: 'fillet-t', label: 'Fillet T-joint (set-on)', ko: '필릿 T이음' },
    { key: 'nozzle', label: 'Nozzle / branch (set-on)', ko: '노즐/분기관' },
    { key: 'none', label: 'No weld (plain plate)', ko: '용접 없음' },
  ];
  const BACKING_W = 25, BACKING_H = 6, BACKING_SLIT = 0.5;   // backing bar (mm) and the unfused bar/plate interface gap
  const WEB_H = 60;                                          // web height above the base plate (fillet-t / nozzle)

  /**
   * Preparation key from options: opts.prep wins; the legacy opts.type is still honoured. When both are given
   * (state.weldOpts carries both) the non-default one wins, so a v1 dialog that only changes `type` and a v2 dialog
   * that only changes `prep` both work. A UI that sets `prep` should mirror it into `type` to avoid ambiguity.
   * `backing: true` (state.weldOpts flag) turns a single-V into 'single-v-backing'.
   */
  function prepOf(o) {
    const p = o && o.prep, t = o && o.type;
    let prep = 'single-v';
    if (p && PREPS.indexOf(p) >= 0 && p !== 'single-v') prep = p;
    else if (t && PREPS.indexOf(t) >= 0 && t !== 'single-v') prep = t;
    else if (p && PREPS.indexOf(p) >= 0) prep = p;
    else if (t && PREPS.indexOf(t) >= 0) prep = t;
    if (prep === 'single-v' && o && o.backing === true) prep = 'single-v-backing';   // state.weldOpts.backing flag (SPEC-v2 §2)
    return prep;
  }

  /** Sine-profile bead points (n+1 vertices) from x0 to x1 (in that order), bulging `height` away from baseY toward sign. */
  function beadPts(x0, x1, baseY, height, sign, tag, n) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push({ x: x0 + (x1 - x0) * t, y: baseY + sign * height * Math.sin(Math.PI * t), tag });
    }
    return pts;
  }

  /**
   * Weld geometry for a butt / fillet weld of plate thickness T.
   * prep: 'single-v' | 'double-v' | 'single-bevel' | 'j' | 'single-v-backing' | 'fillet-t' | 'nozzle' | 'none'
   * (legacy `type` accepted). Returns
   * { type, prep, bevel, rootGap, rootFace, capWidth, capHeight, rootHeight, rootWidth, capCentre,
   *   fusionFaces: [{a, b, side, tag}], region (weld-metal polygon for hatching), regions (all polygons),
   *   cap, root (bead polylines with vertex tags), backing (polygon | null), backingFused (fused half-width),
   *   web (polygon | null), webT, leg, fillets, hazHalfWidth }.
   * `type` stays what v1 callers expect: the prep key for butt welds, 'fillet' for fillet-t / nozzle, 'none'.
   */
  function weldGeometry(o) {
    o = o || {};
    const T = o.T;
    const prep = prepOf(o);
    const isBacking = prep === 'single-v-backing';
    const isFillet = prep === 'fillet-t' || prep === 'nozzle';
    const bevel = o.bevel === undefined ? (prep === 'single-bevel' ? 45 : 30) : o.bevel;
    const rootGap = o.rootGap === undefined ? (isBacking ? 6 : 2) : o.rootGap;
    const rootFace = o.rootFace === undefined ? (isBacking ? 0 : 2) : o.rootFace;
    const capWidth = o.capWidth === undefined ? 16 : o.capWidth;
    const capHeight = o.capHeight === undefined ? 2 : o.capHeight;
    const rootHeight = o.rootHeight === undefined ? 1.5 : o.rootHeight;
    const rootWidth = rootGap + 4;
    const tb = Math.tan(M.deg2rad(bevel));
    const fusionFaces = [];
    let region = [];
    let regions = null;
    let capCentre = 0;
    let backing = null, backingFused = 0, web = null, webT = 0, leg = 0, fillets = null;
    let type = prep;
    const g = rootGap / 2;

    if (prep === 'single-v' || isBacking) {
      const topHalf = g + (T - rootFace) * tb;
      // right fusion face: from root (g, T-rootFace) to top (topHalf, 0); left mirrored
      fusionFaces.push({ a: { x: g, y: T - rootFace }, b: { x: topHalf, y: 0 }, side: 1, tag: 'fusion' });
      fusionFaces.push({ a: { x: -g, y: T - rootFace }, b: { x: -topHalf, y: 0 }, side: -1, tag: 'fusion' });
      if (isBacking && rootFace <= 0) region = [{ x: -topHalf, y: 0 }, { x: topHalf, y: 0 }, { x: g, y: T }, { x: -g, y: T }];
      else region = [{ x: -topHalf, y: 0 }, { x: topHalf, y: 0 }, { x: g, y: T - rootFace }, { x: g, y: T }, { x: -g, y: T }, { x: -g, y: T - rootFace }];
      if (isBacking) {
        const bh = BACKING_W / 2;
        backing = [{ x: -bh, y: T }, { x: bh, y: T }, { x: bh, y: T + BACKING_H }, { x: -bh, y: T + BACKING_H }];
        backingFused = Math.min(bh - 1, Math.max(g + 1.5, bh - 2));   // root pass fuses the bar top over ±backingFused
        type = 'single-v-backing';
      }
    } else if (prep === 'double-v') {
      const half = g + (T / 2 - rootFace / 2) * tb;
      fusionFaces.push({ a: { x: g, y: T / 2 - rootFace / 2 }, b: { x: half, y: 0 }, side: 1, tag: 'fusion' });
      fusionFaces.push({ a: { x: -g, y: T / 2 - rootFace / 2 }, b: { x: -half, y: 0 }, side: -1, tag: 'fusion' });
      fusionFaces.push({ a: { x: g, y: T / 2 + rootFace / 2 }, b: { x: half, y: T }, side: 1, tag: 'fusion' });
      fusionFaces.push({ a: { x: -g, y: T / 2 + rootFace / 2 }, b: { x: -half, y: T }, side: -1, tag: 'fusion' });
      region = [{ x: -half, y: 0 }, { x: half, y: 0 }, { x: g, y: T / 2 - rootFace / 2 }, { x: g, y: T / 2 + rootFace / 2 }, { x: half, y: T }, { x: -half, y: T }, { x: -g, y: T / 2 + rootFace / 2 }, { x: -g, y: T / 2 - rootFace / 2 }];
    } else if (prep === 'single-bevel') {
      // K: left face vertical at x = −g, right face bevelled (45° default), root face rootFace
      const top = g + (T - rootFace) * tb;
      fusionFaces.push({ a: { x: g, y: T - rootFace }, b: { x: top, y: 0 }, side: 1, tag: 'fusion' });
      fusionFaces.push({ a: { x: -g, y: T - rootFace }, b: { x: -g, y: 0 }, side: -1, tag: 'fusion' });
      region = [{ x: -g, y: 0 }, { x: top, y: 0 }, { x: g, y: T - rootFace }, { x: g, y: T }, { x: -g, y: T }, { x: -g, y: T - rootFace }];
      capCentre = (top - g) / 2;
    } else if (prep === 'j') {
      // J: left face vertical at x = −g; right face = 8 mm radius (6 segments) from the flat groove bottom
      // (horizontal tangent at (g, T − rootFace)) turning into a 10° bevel that runs to the top surface.
      const alpha = M.deg2rad(10);
      const R = Math.max(0.5, Math.min(8, (T - rootFace) / (1 - Math.sin(alpha)) * 0.98));
      const cx = g, cy = T - rootFace - R;
      const N = 6;
      const facePts = [];   // bottom → top
      for (let i = 0; i <= N; i++) {
        const phi = M.deg2rad(90 - (90 - 10) * i / N);
        facePts.push({ x: cx + R * Math.cos(phi), y: cy + R * Math.sin(phi) });
      }
      facePts[0] = { x: g, y: T - rootFace };
      const arcEnd = facePts[N];
      const top = arcEnd.x + arcEnd.y * Math.tan(alpha);
      facePts.push({ x: top, y: 0 });
      for (let i = 0; i < facePts.length - 1; i++) fusionFaces.push({ a: facePts[i], b: facePts[i + 1], side: 1, tag: 'fusion' });
      fusionFaces.push({ a: { x: -g, y: T - rootFace }, b: { x: -g, y: 0 }, side: -1, tag: 'fusion' });
      region = [{ x: -g, y: 0 }];
      for (let i = facePts.length - 1; i >= 0; i--) region.push({ x: facePts[i].x, y: facePts[i].y });
      region.push({ x: g, y: T }, { x: -g, y: T }, { x: -g, y: T - rootFace });
      capCentre = (top - g) / 2;
    } else if (isFillet) {
      // set-on T-joint: web (thickness webT) centred at x = 0 rising WEB_H above the plate, fillets both sides
      webT = prep === 'nozzle' ? (o.branchWt || 8) : (o.webT || 12);
      leg = +(0.7 * webT).toFixed(3);
      const hw = webT / 2;
      web = [{ x: -hw, y: -WEB_H }, { x: hw, y: -WEB_H }, { x: hw, y: 0 }, { x: -hw, y: 0 }];
      const right = [{ x: hw, y: 0 }, { x: hw + leg, y: 0 }, { x: hw, y: -leg }];
      const left = [{ x: -hw, y: 0 }, { x: -hw, y: -leg }, { x: -hw - leg, y: 0 }];
      region = right;
      regions = [right, left];
      fillets = [
        { side: 1, toe: { x: hw + leg, y: 0 }, webToe: { x: hw, y: -leg }, face: [{ x: hw + leg, y: 0 }, { x: hw, y: -leg }] },
        { side: -1, toe: { x: -hw - leg, y: 0 }, webToe: { x: -hw, y: -leg }, face: [{ x: -hw - leg, y: 0 }, { x: -hw, y: -leg }] },
      ];
      // fusion faces: web faces inside the fillets (side ±1, 'web'), plate surface under the fillets ('plate')
      // and the unfused web/plate interface under the web ('root', side 0)
      fusionFaces.push({ a: { x: hw, y: 0 }, b: { x: hw, y: -leg }, side: 1, tag: 'web' });
      fusionFaces.push({ a: { x: -hw, y: 0 }, b: { x: -hw, y: -leg }, side: -1, tag: 'web' });
      fusionFaces.push({ a: { x: hw, y: 0 }, b: { x: hw + leg, y: 0 }, side: 1, tag: 'plate' });
      fusionFaces.push({ a: { x: -hw, y: 0 }, b: { x: -hw - leg, y: 0 }, side: -1, tag: 'plate' });
      fusionFaces.push({ a: { x: -hw, y: 0 }, b: { x: hw, y: 0 }, side: 0, tag: 'root' });
      type = 'fillet';
    }

    // cap bulge (above the surface, y < 0) and root bead (below the bottom, y > T)
    let cap = [];
    let root = [];
    if (prep !== 'none' && !isFillet) {
      const n = 8;
      // A bead lower than FLAT_BEAD is geometrically the plate surface: tag it 'top'/'bottom' so the
      // tracer's rough-bead diffuse rule (30-raytrace, SPEC §6.1 note 2) does not fire on a flat plate.
      const capTag = capHeight > FLAT_BEAD ? 'cap' : 'top';
      cap = beadPts(capCentre - capWidth / 2, capCentre + capWidth / 2, 0, capHeight, -1, capTag, n);
      if (!isBacking) {
        const bottomCapWidth = prep === 'double-v' ? capWidth : rootWidth;
        const bottomCapHeight = prep === 'double-v' ? capHeight : rootHeight;
        const rootTag = bottomCapHeight > FLAT_BEAD ? (prep === 'double-v' ? 'cap' : 'root') : 'bottom';
        root = beadPts(bottomCapWidth / 2, -bottomCapWidth / 2, T, bottomCapHeight, 1, rootTag, n);   // right → left
      }
    }
    const outCapWidth = isFillet ? 2 * (webT / 2 + leg) : capWidth;
    const out = {
      type, prep, bevel, rootGap, rootFace, capWidth: outCapWidth, capHeight, rootHeight, rootWidth, capCentre,
      fusionFaces, region, regions: regions || (region.length ? [region] : []), cap, root,
      backing, backingFused, web, webT, leg, fillets, hazHalfWidth: outCapWidth / 2 + 6,
    };
    return out;
  }

  /** Vertex list (with tags, in the bottom face's right → left order) for the backing bar and its interface slits. */
  function backingOutline(wg, T) {
    const bh = BACKING_W / 2, bd = BACKING_H, s = BACKING_SLIT, xf = wg.backingFused;
    return [
      { x: bh, y: T, tag: 'bottom' },            // plate bottom inside the right interface slit
      { x: xf, y: T, tag: 'backing' },           // fused-zone boundary (slit inner end)
      { x: xf, y: T + s, tag: 'backing' },       // bar top face, right unfused part
      { x: bh, y: T + s, tag: 'backing' },       // right end of the bar
      { x: bh, y: T + bd, tag: 'backing' },      // lower face
      { x: -bh, y: T + bd, tag: 'backing' },     // left end of the bar
      { x: -bh, y: T + s, tag: 'backing' },      // bar top face, left unfused part
      { x: -xf, y: T + s, tag: 'backing' },      // fused-zone boundary
      { x: -xf, y: T, tag: 'bottom' },           // plate bottom inside the left interface slit
      { x: -bh, y: T, tag: 'bottom' },           // plate bottom left of the bar
    ];
  }

  /** Plate butt weld specimen. Cross-section width 300 (x −150..150). Fillet preps build a set-on T-joint. */
  function plateWeld(opts) {
    const o = Object.assign({ T: 20, L: 300, type: 'single-v', W: 300 }, opts || {});
    const T = o.T, W = o.W;
    const wg = weldGeometry(o);
    const outline = [];
    const reflectors = [];
    if (wg.web) {
      const hw = wg.webT / 2, leg = wg.leg;
      outline.push({ x: -W / 2, y: 0, tag: 'top' });
      outline.push({ x: -hw - leg, y: 0, tag: 'cap' });       // left fillet face
      outline.push({ x: -hw, y: -leg, tag: 'web' });          // left web face
      outline.push({ x: -hw, y: -WEB_H, tag: 'end' });        // web top end
      outline.push({ x: hw, y: -WEB_H, tag: 'web' });         // right web face
      outline.push({ x: hw, y: -leg, tag: 'cap' });           // right fillet face
      outline.push({ x: hw + leg, y: 0, tag: 'top' });
      outline.push({ x: W / 2, y: 0, tag: 'end' });
      outline.push({ x: W / 2, y: T, tag: 'bottom' });
      outline.push({ x: -W / 2, y: T, tag: 'end' });
      // unfused web/plate interface: a planar reflector (not part of the outline — metal is continuous through the fillets)
      reflectors.push({ a: { x: -hw, y: 0 }, b: { x: hw, y: 0 }, tag: 'interface', d: wg.webT, label: 'web/plate interface' });
    } else {
      outline.push({ x: -W / 2, y: 0, tag: 'top' });
      if (wg.cap.length) { for (const p of wg.cap) outline.push({ x: p.x, y: p.y, tag: p.tag }); outline[outline.length - 1].tag = 'top'; }
      outline.push({ x: W / 2, y: 0, tag: 'end' });
      outline.push({ x: W / 2, y: T, tag: 'bottom' });
      if (wg.root.length) { for (const p of wg.root) outline.push({ x: p.x, y: p.y, tag: p.tag }); outline[outline.length - 1].tag = 'bottom'; }
      if (wg.backing) for (const p of backingOutline(wg, T)) outline.push(p);
      outline.push({ x: -W / 2, y: T, tag: 'end' });
    }
    const spec = finish({
      id: 'plate-weld', name: `Plate ${T} mm ${wg.prep === 'none' ? 'no weld' : wg.prep}`, kind: 'weld', T, L: o.L,
      prep: wg.prep, outline, holes: [], weld: wg, pipe: null, material: o.material, reflectors,
      scanSurface: wg.web ? { y: 0, xMin: wg.webT / 2 + wg.leg + 2, xMax: W / 2 } : { y: 0, xMin: -W / 2, xMax: W / 2 },
      defaultProbe: { x: Math.round(T * Math.tan(M.deg2rad(60)) + 6) + (wg.web ? Math.round(wg.webT / 2 + wg.leg) : 0), z: o.L / 2, side: 1 },
      labels: [{ x: W / 2 - 60, y: -6, text: 'CROSS SECTION' }],
    });
    if (wg.prep === 'nozzle') spec.nozzle = { branchOd: o.branchOd || 114.3, branchWt: wg.webT };
    if (wg.web) spec.labels.push({ x: wg.webT / 2 + 8, y: -WEB_H + 6, text: wg.prep === 'nozzle' ? 'BRANCH' : 'WEB', small: true });
    return spec;
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
    spec.name = `Pipe OD ${o.od} mm WT ${o.wt} mm ${spec.prep === 'none' ? 'no weld' : spec.prep}`;
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
      return finish({ id: 'v1', name: 'V1 block (25 mm face)', kind: 'block', T: 25, L: 100, outline, holes: [], material: o.material,
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
      id: 'v1', name: 'IIW V1 calibration block', kind: 'block', T: 100, L: 25, outline, material: o.material,
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
      return finish({ id: 'v2', name: 'V2 block (12.5 mm face)', kind: 'block', T: 12.5, L: 50, outline, material: o.material,
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
      id: 'v2', name: 'V2 calibration block', kind: 'block', T: 50, L: 12.5, outline, holes: [], material: o.material,
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
      id: 'step', name: 'Step wedge', kind: 'block', T: Tmax, L: 50, outline, holes: [], material: o.material,
      scanSurface: { y: 0, xMin: 0, xMax: W }, defaultProbe: { x: len / 2, z: 25, side: 1 },
      steps: o.steps.slice(), stepLen: len,
      labels: o.steps.map(function (t, i) { return { x: i * len + len / 2, y: t + 5, text: t + 'mm', small: true }; }),
    });
    spec.thicknessAt = function (x) { const i = M.clamp(Math.floor(x / len), 0, n - 1); return o.steps[i]; };
    /** Centre x of the step whose thickness is nearest to t (v2; used by lesson 12). */
    spec.stepX = function (t) {
      let best = 0;
      for (let i = 1; i < n; i++) if (Math.abs(o.steps[i] - t) < Math.abs(o.steps[best] - t)) best = i;
      return best * len + len / 2;
    };
    return spec;
  }

  /** IOW / A5 beam-profile block: 300 × 45 with 1.5 mm SDHs at 13/19/25/43 mm and a depth ladder at x=280. */
  function iow(opts) {
    const o = opts || {};
    const outline = [{ x: 0, y: 0, tag: 'top' }, { x: 300, y: 0, tag: 'end' }, { x: 300, y: 45, tag: 'bottom' }, { x: 0, y: 45, tag: 'end' }];
    // deep → shallow from the left so every hole can be reached from the right with 45–70° probes
    const holes = [
      { x: 60, y: 43, r: 0.75, tag: 'sdh', label: '43mm' }, { x: 120, y: 25, r: 0.75, tag: 'sdh', label: '25mm' },
      { x: 180, y: 19, r: 0.75, tag: 'sdh', label: '19mm' }, { x: 240, y: 13, r: 0.75, tag: 'sdh', label: '13mm' },
    ];
    [8, 14, 20, 26, 32].forEach(function (d) { holes.push({ x: 20, y: d, r: 0.75, tag: 'sdh', label: d + 'mm', ladder: true }); });
    return finish({ id: 'iow', name: 'A5 IOW beam profile block', kind: 'block', T: 45, L: 100, outline, holes, material: o.material,
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
    return finish({ id: 'dac', name: 'DAC reference block', kind: 'block', T, L: 100, outline, holes, material: o.material,
      scanSurface: { y: 0, xMin: 0, xMax: 300 }, defaultProbe: { x: 80 + Math.round((T / 4) * Math.tan(M.deg2rad(60))), z: 50, side: 1 },
      labels: holes.map(function (h) { return { x: h.x + 5, y: h.y - 3, text: h.label + ' SDH', small: true }; }) });
  }

  /**
   * FBH reference block (SPEC-v2 §3.8): 300 × T with flat-bottom holes ⌀2/3/4/6 at depth 30 (x = 60, 110, 160, 210)
   * and ⌀3 at depth 50 (x = 260). Each FBH is a horizontal planar reflector of width d at depth y: listed in
   * spec.fbhs (for drawing: bar + drill shaft to the bottom face) and in spec.reflectors (tag 'fbh', specular with
   * tip diffraction at its ends — 0° probes see it, angle probes barely). The drill shaft is NOT part of the outline.
   */
  function fbhBlock(opts) {
    const o = Object.assign({ T: 60 }, opts || {});
    const T = o.T;
    const outline = [{ x: 0, y: 0, tag: 'top' }, { x: 300, y: 0, tag: 'end' }, { x: 300, y: T, tag: 'bottom' }, { x: 0, y: T, tag: 'end' }];
    const defs = [{ x: 60, d: 2, y: 30 }, { x: 110, d: 3, y: 30 }, { x: 160, d: 4, y: 30 }, { x: 210, d: 6, y: 30 }, { x: 260, d: 3, y: 50 }];
    const fbhs = defs.map(function (f) { const y = Math.min(f.y, T - 2); return { x: f.x, y, d: f.d, label: '⌀' + f.d + ' FBH ' + y + 'mm' }; });
    const reflectors = fbhs.map(function (f) { return { a: { x: f.x - f.d / 2, y: f.y }, b: { x: f.x + f.d / 2, y: f.y }, tag: 'fbh', d: f.d, label: f.label }; });
    return finish({ id: 'fbh', name: 'FBH reference block ' + T + ' mm', kind: 'block', T, L: 100, outline, holes: [], material: o.material,
      fbhs, reflectors,
      scanSurface: { y: 0, xMin: 0, xMax: 300 }, defaultProbe: { x: 60, z: 50, side: 1 },
      labels: fbhs.map(function (f) { return { x: f.x, y: f.y - 4, text: f.label, small: true }; }) });
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
      id: 'tky', name: `TKY joint ${o.braceAngle}°`, kind: 'tky', T: o.chordT, L: 300, outline, holes: [], material: o.material,
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
    return finish({ id: 'lamination-plate', name: `Plate ${o.T} mm (lamination check)`, kind: 'block', T: o.T, L: o.L, outline, holes: [], material: o.material,
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
      case 'fbh': return fbhBlock(opts);
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

  /**
   * Fusion face for a side (±1): the longest face of that side (double-V keeps its upper face — the first
   * listed — on ties; K/J pick the straight bevel; fillet-t/nozzle pick the web face, never the plate faces).
   */
  function fusionFaceFor(spec, side) {
    const faces = ((spec.weld && spec.weld.fusionFaces) || []).filter(function (f) { return f.side === side && f.tag !== 'plate' && f.tag !== 'root'; });
    let best = null, bestLen = -1;
    for (const f of faces) {
      const len = M.dist(f.a.x, f.a.y, f.b.x, f.b.y);
      if (len > bestLen + 1e-9) { best = f; bestLen = len; }
    }
    return best;
  }

  /** Cap toe x for a side (weld cap centre + half width; TKY/fillet: the fillet toe on the chord/plate). */
  function capToeX(spec, side) {
    const w = spec.weld;
    if (w && w.fillets) { const f = w.fillets.find(function (q) { return q.side === side; }); if (f) return f.toe.x; }
    if (spec.tky) return spec.tky.toe.x + spec.tky.weldLeg;
    const cw = (w && w.capWidth) || 16;
    return ((w && w.capCentre) || 0) + side * cw / 2;
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
      const face = fusionFaceFor(spec, side) || { a: { x: 0, y: spec.T - 2 }, b: { x: spec.T * 0.58, y: 0 } };
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
      const side = (o && o.side) || 1, h = (o && o.height) || 3;
      const x0 = capToeX(spec, side);
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
    /**
     * Lack of fusion between the root pass and the backing bar: planar along the bar top (y = T) from the root-gap
     * edge outward on side o.side, up to 15 mm long but clamped to the fused bar width (the bar top beyond
     * weld.backingFused is an open interface already). Without a backing bar it falls back to a horizontal planar
     * defect just above the plate bottom at the same x.
     */
    backingLof(spec, o) {
      const side = (o && o.side) || 1, T = spec.T, w = spec.weld || {};
      const g = (w.rootGap === undefined ? 2 : w.rootGap) / 2;
      const len = (o && o.length2d) || 15;
      const xEnd = w.backing ? Math.min(g + len, w.backingFused - 0.5) : g + len;
      const y = w.backing ? T : T - 0.5;
      const pts = [{ x: +(side * g).toFixed(2), y }, { x: +(side * Math.max(g + 1, xEnd)).toFixed(2), y }];
      return makeDefect(Object.assign({ type: 'lof', label: 'Backing bar lack of fusion', pts, height: 0.5, zFrom: spec.L / 2 - 15, length: 30 }, o || {}));
    },
    /** Fillet-weld toe crack: planar, 3 mm, starting at the fillet toe on the plate and leaning under the weld. */
    toeCrackFillet(spec, o) {
      const side = (o && o.side) || 1, h = (o && o.height) || 3;
      const x0 = capToeX(spec, side);
      return makeDefect(Object.assign({ type: 'crack', label: 'Fillet toe crack', pts: [{ x: +x0.toFixed(2), y: 0 }, { x: +(x0 - side * h * 0.5).toFixed(2), y: h }], height: h, zFrom: spec.L / 2 - 10, length: 20 }, o || {}));
    },
  };
  const defectPresetNames = [
    { key: 'rootCrack', label: 'Root crack (균열)' }, { key: 'incompletePenetration', label: 'Incomplete penetration (용입 부족)' },
    { key: 'lof', label: 'Lack of side-wall fusion (융합 불량)' }, { key: 'porosity', label: 'Porosity (기공)' },
    { key: 'slag', label: 'Slag inclusion (슬래그)' }, { key: 'toeCrack', label: 'Toe crack (토우 균열)' },
    { key: 'centrelineCrack', label: 'Centreline crack (중심선 균열)' }, { key: 'lamination', label: 'Lamination (라미네이션)' },
    { key: 'backingLof', label: 'Backing bar lack of fusion (배킹바 융합불량)' }, { key: 'toeCrackFillet', label: 'Fillet toe crack (필릿 토우 균열)' },
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

  /** Distance from point p to the nearest fusion face of spec (Infinity without faces). */
  function distToFusionFace(spec, p) {
    let best = Infinity;
    for (const f of (spec.weld && spec.weld.fusionFaces) || []) best = Math.min(best, M.pointSegment(p.x, p.y, f.a.x, f.a.y, f.b.x, f.b.y).d);
    return best;
  }

  UT.specimens = {
    materials, materialOf, prepNames, preps: PREPS.slice(),
    arcPoints, deriveEdges, extentsOf, pointInside, scanSurfaceAt, weldGeometry, nominalInch,
    plateWeld, pipeWeld, v1, v2, stepWedge, iow, dacBlock, fbhBlock, tky, laminationPlate, build,
    segmentInRegion, pointInWeld, weldRegions,
    isPlanar, bbox, decimate, makeDefect, defectFromBrush, defectLength, defectSamples, circlePts,
    defectPresets, defectPresetNames, normaliseDefects,
    __selftest() {
      const f = [];
      const near = function (a, b, tol) { return Math.abs(a - b) <= (tol === undefined ? 1e-9 : tol); };
      const p = plateWeld({ T: 20 });
      if (!pointInside(p, 10, 10)) f.push('plate inside');
      if (pointInside(p, 10, 25)) f.push('plate outside');
      if (!p.edges.some(function (e) { return e.tag === 'root'; })) f.push('root edge missing');
      // --- v1 regression: single-V / double-V geometry must stay exactly as before the v2 preps (SPEC-v2 §9.0)
      const expectV = [[-150, 0, 'top'], [-8, 0, 'cap'], [-6, -0.7653668647301796, 'cap'], [-4, -1.414213562373095, 'cap'], [-2, -1.8477590650225735, 'cap'], [0, -2, 'cap'], [2, -1.8477590650225735, 'cap'], [4, -1.4142135623730951, 'cap'], [6, -0.7653668647301798, 'cap'], [8, 0, 'top'], [150, 0, 'end'], [150, 20, 'bottom'], [3, 20, 'root'], [2.25, 20.574025148547634, 'root'], [1.5, 21.060660171779823, 'root'], [0.75, 21.38581929876693, 'root'], [0, 21.5, 'root'], [-0.75, 21.38581929876693, 'root'], [-1.5, 21.060660171779823, 'root'], [-2.25, 20.574025148547634, 'root'], [-3, 20, 'bottom'], [-150, 20, 'end']];
      if (p.outline.length !== 22) f.push('single-v vertex count ' + p.outline.length);
      else expectV.forEach(function (v, i) { const q = p.outline[i]; if (!near(q.x, v[0], 1e-12) || !near(q.y, v[1], 1e-12) || q.tag !== v[2]) f.push('single-v vertex ' + i + ' ' + JSON.stringify(q)); });
      if (!near(p.weld.fusionFaces[0].b.x, 11.392304845413264, 1e-12) || p.weld.fusionFaces[0].a.y !== 18 || p.weld.fusionFaces[1].side !== -1) f.push('single-v fusion faces');
      if (p.weld.region.length !== 6 || p.weld.rootWidth !== 6 || p.weld.hazHalfWidth !== 14 || p.weld.type !== 'single-v' || p.prep !== 'single-v') f.push('single-v weld fields');
      const dv = plateWeld({ T: 20, type: 'double-v' });
      if (dv.outline.length !== 22 || dv.weld.fusionFaces.length !== 4 || !near(dv.weld.fusionFaces[0].b.x, 1 + 9 * Math.tan(M.deg2rad(30)), 1e-12) || dv.weld.region.length !== 8) f.push('double-v geometry');
      if (dv.outline[12].tag !== 'cap' || !near(dv.outline[12].x, 8) || !near(dv.outline[16].y, 22) || dv.outline[20].tag !== 'bottom') f.push('double-v bottom cap');
      if (dv.weld.type !== 'double-v' || plateWeld({ T: 20, prep: 'double-v' }).outline.length !== 22) f.push('prep/type mapping');
      if (plateWeld({ T: 20, type: 'none' }).outline.length !== 4 || plateWeld({ T: 20, prep: 'single-v', type: 'double-v' }).prep !== 'double-v') f.push('legacy type');
      if (plateWeld({ T: 20, backing: true }).prep !== 'single-v-backing' || plateWeld({ T: 20, backing: false }).prep !== 'single-v') f.push('backing flag');
      // --- materials
      if (materials.austenitic.vComp !== 5.66 || materials.castiron.anisotropic !== true || materials.perspex.atten5 !== 0.15) f.push('materials table');
      if (p.material.key !== 'carbon' || p.material.vComp !== 5.90 || p.material.vShear !== 3.24 || p.material.name !== 'Carbon steel') f.push('default material ' + JSON.stringify(p.material));
      const pa = plateWeld({ T: 25, material: 'austenitic' });
      if (pa.material.key !== 'austenitic' || pa.material.vShear !== 3.12 || pa.material.nameKo !== materials.austenitic.nameKo || !pa.material.anisotropic) f.push('austenitic material');
      if (v1({ material: { key: 'copper', vComp: 4.7 } }).material.vComp !== 4.7 || fbhBlock({ material: 'nope' }).material.key !== 'carbon') f.push('materialOf object/unknown');
      const pal = plateWeld({ T: 20, material: 'aluminium' }).material;   // QA r1 #1: poisson/attenL5/attenS5 must reach spec.material (SPEC-v2 §3.3/§3.4)
      if (pal.poisson !== 0.33 || pal.attenL5 !== 0.003 || pal.attenS5 !== 0.004 || p.material.poisson !== 0.29 || p.material.attenL5 !== 0.005 || p.material.attenS5 !== 0.010) f.push('material poisson/attenL5/attenS5 ' + JSON.stringify(pal));
      if (materialOf({ key: 'copper', poisson: 0.3 }).poisson !== 0.3 || materialOf('copper').poisson !== 0.34) f.push('materialOf poisson override');
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
      if (s.stepX(10) !== 60 || s.stepX(25) !== 180 || s.stepX(12) !== 60) f.push('stepX');
      if (s.thicknessAt(10) !== 5 || s.thicknessAt(190) !== 25) f.push('step thickness');
      const t = tky();
      if (!pointInside(t, 50, 10)) f.push('tky chord inside');
      const ss = scanSurfaceAt(p, { x: 40 });
      if (!ss.segment || ss.segment.tag !== 'top' || ss.y !== 0) f.push('scanSurfaceAt chord');
      const sb = scanSurfaceAt(t, { x: 20, surface: 'brace' });
      if (!(sb.y < -10) || Math.abs(Math.hypot(sb.normal.x, sb.normal.y) - 1) > 1e-6) f.push('scanSurfaceAt brace ' + JSON.stringify(sb));
      const lof = defectPresets.lof(p);
      if (lof.pts.length !== 2) f.push('lof preset');
      if (!near(lof.pts[0].x, 4.64, 0.01) || !near(lof.pts[0].y, 11.7, 0.01)) f.push('lof preset regression ' + JSON.stringify(lof.pts));
      const dvLof = defectPresets.lof(dv);
      if (!(dvLof.pts[0].y < 10)) f.push('double-v lof should sit on the upper face');
      // flat beads are plate surface (no 'cap'/'root' tags); a real bead keeps its tag
      const flat = plateWeld({ T: 20, rootHeight: 0, capHeight: 0 });
      if (flat.edges.some(function (e) { return e.tag === 'root' || e.tag === 'cap'; })) f.push('flat bead should be tagged top/bottom');
      if (!pointInside(flat, 0, 19.9) || pointInside(flat, 0, 20.1)) f.push('flat bead outline');
      // --- v2 preps (SPEC-v2 §5.1 / V2-23): build, ≥1 fusion face, lof lands on a fusion face, region helpers
      ['single-bevel', 'j', 'single-v-backing', 'fillet-t', 'nozzle'].forEach(function (prep) {
        let sp;
        try { sp = plateWeld({ T: 20, prep }); } catch (e) { f.push(prep + ' build threw ' + e.message); return; }
        if (sp.prep !== prep || sp.weld.prep !== prep || sp.name.indexOf(prep) < 0) f.push(prep + ' prep field');
        if (!sp.weld.fusionFaces.length) f.push(prep + ' fusion faces');
        if (!sp.weld.fusionFaces.every(function (q) { return q.tag && q.side !== undefined; })) f.push(prep + ' fusion face tags');
        if (sp.edges.length !== sp.outline.length) f.push(prep + ' degenerate outline vertices');
        [1, -1].forEach(function (side) {
          const d = defectPresets.lof(sp, { side });
          const mid = { x: (d.pts[0].x + d.pts[1].x) / 2, y: (d.pts[0].y + d.pts[1].y) / 2 };
          if (distToFusionFace(sp, mid) > 0.02) f.push(prep + ' lof side ' + side + ' not on a fusion face');
        });
        const pipe = pipeWeld({ od: 168.3, wt: 20, prep });
        if (pipe.prep !== prep || pipe.id !== 'pipe-weld') f.push(prep + ' pipe');
        if (!(segmentInRegion(sp, { x: -40, y: 5 }, { x: 40, y: 5 }) > 0) && prep !== 'fillet-t' && prep !== 'nozzle') f.push(prep + ' segmentInRegion');
      });
      const k = plateWeld({ T: 20, prep: 'single-bevel' });
      if (!near(k.weld.fusionFaces[1].a.x, -1) || !near(k.weld.fusionFaces[1].b.x, -1) || !near(k.weld.fusionFaces[0].b.x, 1 + 18, 1e-9)) f.push('K faces ' + JSON.stringify(k.weld.fusionFaces));
      if (!pointInside(k, 0, 10) || !k.edges.some(function (e) { return e.tag === 'root'; })) f.push('K outline');
      const j = plateWeld({ T: 20, prep: 'j' });
      const jRight = j.weld.fusionFaces.filter(function (q) { return q.side === 1; });
      if (jRight.length !== 7 || !near(jRight[0].a.y, 18) || !near(jRight[6].b.y, 0) || !(jRight[6].b.x > 9 && jRight[6].b.x < 12)) f.push('J faces ' + JSON.stringify(jRight.map(function (q) { return [q.a.x.toFixed(2), q.a.y.toFixed(2)]; })));
      if (j.weld.region.length !== 12 || !pointInside(j, 0, 10)) f.push('J region ' + j.weld.region.length);
      const bk = plateWeld({ T: 20, prep: 'single-v-backing' });
      if (bk.weld.rootGap !== 6 || bk.weld.root.length !== 0 || !bk.weld.backing || bk.weld.backing.length !== 4) f.push('backing weld fields ' + JSON.stringify({ g: bk.weld.rootGap, r: bk.weld.root.length }));
      const bkTags = bk.edges.filter(function (e) { return e.tag === 'backing'; });
      if (bkTags.length !== 7 || bk.edges.some(function (e) { return e.tag === 'root'; })) f.push('backing edges ' + bkTags.length);
      if (!pointInside(bk, 0, 23) || !pointInside(bk, 11.5, 23) || pointInside(bk, 11.5, 20.25) || pointInside(bk, 0, 26.5) || !pointInside(bk, 0, 20)) f.push('backing outline');
      if (!bk.edges.some(function (e) { return e.tag === 'backing' && near(e.a.y, 26) && near(e.b.y, 26); })) f.push('backing lower face');
      const bl = defectPresets.backingLof(bk);
      if (bl.pts[0].y !== 20 || !near(bl.pts[0].x, 3) || !(bl.pts[1].x > 6 && bl.pts[1].x <= 12.5) || bl.type !== 'lof') f.push('backingLof ' + JSON.stringify(bl.pts));
      if (plateWeld({ T: 20, prep: 'single-v-backing', rootGap: 2, rootFace: 2 }).weld.region.length !== 6) f.push('backing honours root opts');
      const ft = plateWeld({ T: 20, prep: 'fillet-t', webT: 12 });
      if (!ft.weld.web || ft.weld.webT !== 12 || !near(ft.weld.leg, 8.4) || ft.weld.type !== 'fillet' || ft.weld.regions.length !== 2) f.push('fillet-t weld fields');
      if (!pointInside(ft, 0, -30) || pointInside(ft, 20, -5) || !pointInside(ft, 9, -2) || pointInside(ft, 12, -6)) f.push('fillet-t outline');
      if (!ft.edges.some(function (e) { return e.tag === 'web'; }) || ft.edges.filter(function (e) { return e.tag === 'cap'; }).length !== 2) f.push('fillet-t tags');
      if (!ft.reflectors.length || ft.reflectors[0].tag !== 'interface') f.push('fillet-t interface reflector');
      const sw = scanSurfaceAt(ft, { x: 10, surface: 'web', side: 1 });
      if (!near(sw.x, 6) || !near(sw.y, -18.4) || !sw.segment || sw.segment.tag !== 'web' || sw.normal.x !== -1) f.push('scanSurfaceAt web ' + JSON.stringify(sw));
      const swl = scanSurfaceAt(ft, { x: 10, surface: 'web', side: -1 });
      if (!near(swl.x, -6) || swl.normal.x !== 1 || swl.tangent.y !== 1) f.push('scanSurfaceAt web left');
      if (!(ft.scanSurface.xMin > 14) || !(ft.defaultProbe.x > ft.scanSurface.xMin)) f.push('fillet-t scan surface');
      const tc = defectPresets.toeCrackFillet(ft);
      if (!near(tc.pts[0].x, 14.4) || tc.pts[0].y !== 0 || tc.height !== 3) f.push('toeCrackFillet ' + JSON.stringify(tc.pts));
      if (!near(defectPresets.toeCrack(p).pts[0].x, 8) || !near(defectPresets.toeCrack(k, { side: -1 }).pts[0].x, k.weld.capCentre - 8)) f.push('toeCrack uses the cap centre');
      const nz = pipeWeld({ od: 219.1, wt: 16, prep: 'nozzle', branchOd: 114.3, branchWt: 8 });
      if (!nz.nozzle || nz.nozzle.branchOd !== 114.3 || nz.weld.webT !== 8 || !nz.pipe) f.push('nozzle fields');
      if (defectPresetNames.length !== 10 || !defectPresetNames.some(function (q) { return q.key === 'backingLof'; })) f.push('preset names');
      if (prepNames.length !== 8 || prepNames.some(function (q) { return !q.key || !q.label || !q.ko; })) f.push('prepNames');
      // --- region helpers
      const w10 = 2 * (1 + 8 * Math.tan(M.deg2rad(30)));   // single-V groove width at depth 10
      if (!near(segmentInRegion(p, { x: -20, y: 10 }, { x: 20, y: 10 }), w10, 1e-6)) f.push('segmentInRegion width ' + segmentInRegion(p, { x: -20, y: 10 }, { x: 20, y: 10 }));
      if (segmentInRegion(p, { x: 30, y: 5 }, { x: 60, y: 15 }) !== 0 || segmentInRegion(b, { x: 0, y: 0 }, { x: 100, y: 50 }) !== 0) f.push('segmentInRegion outside');
      if (!near(segmentInRegion(p, { x: 0, y: 0 }, { x: 0, y: 20 }), 20, 1e-9) || !near(segmentInRegion(ft, { x: -30, y: -4 }, { x: 30, y: -4 }), 2 * (8.4 - 4), 1e-9)) f.push('segmentInRegion through / fillet regions');
      if (!pointInWeld(p, 0, 10) || pointInWeld(p, 50, 10) || pointInWeld(b, 100, 50) || !pointInWeld(ft, -7, -1)) f.push('pointInWeld');
      // --- FBH block
      const fb = fbhBlock();
      if (fb.id !== 'fbh' || fb.T !== 60 || fb.fbhs.length !== 5 || fb.reflectors.length !== 5 || fb.fbhs[1].d !== 3 || fb.fbhs[1].label !== '⌀3 FBH 30mm' || fb.fbhs[4].y !== 50) f.push('fbh block');
      if (!near(fb.reflectors[3].a.x, 207) || !near(fb.reflectors[3].b.x, 213) || fb.reflectors[3].tag !== 'fbh' || fb.reflectors[3].d !== 6) f.push('fbh reflectors');
      if (fb.outline.length !== 4 || fb.holes.length || fb.defaultProbe.x !== 60 || build('fbh', { T: 40 }).fbhs[4].y !== 38) f.push('fbh outline/build');
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
