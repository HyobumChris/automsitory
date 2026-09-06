/* 60-view-cross.js — cross-section canvas (cv-cross) + X ruler (cv-ruler): specimen, weld outlines,
 * holes/Perspex, defects, beam fan, probe shoe(s), depth ruler, labels; probe drag, defect brush,
 * hover cursor, wheel gain; V1/V2 oblique block screens (SPEC §7.5, §14.1, §14.8, §15.6).
 * v2 (SPEC-v2 §3.13, §5.1, §5.4, F1/P2/P3/P6/P8/P9/P10): weld preparations (backing bar, web + fillets,
 * nozzle), FBH block, converted-ray / surface-wave / focus styles, finger dampers + finger tool, TOFD dead
 * zones, PA sector + wedge, probe on the web face, Pointer Events, 'ui' probe-drag event, dragTo() helper.
 */
(function (UT) {
  'use strict';

  // SPEC NOTES (decisions where the spec is silent or ambiguous)
  // - Horizontal centring: the specimen is centred on x = 0 whenever its extents start left of 0
  //   (welds, TKY, lamination plate), otherwise on the extents centre (blocks 0…300). Ruler labels are
  //   unsigned |x| for those centred specimens and the raw block x otherwise.
  // - Vertical placement: y = 0 (scan surface) is placed 20–24 mm (× scale) below the canvas top so the
  //   shoe fits above the plate; no refit, clipping applies. v2: a tall structure above the plate (the
  //   60 mm web of fillet-t / nozzle) only gets as much room as the canvas has left after the plate,
  //   so the base plate always stays visible and the web is clipped at the top (v1 specimens unchanged).
  // - Beam legs of fan/edge polylines are counted by testing each vertex against the outline/arcs
  //   (a vertex on an outline edge or arc starts a new leg); vertices carrying `.leg` are honoured.
  //   Only the first display.skips legs are drawn, as in §14.1.
  // - 0° ladder: parallel dotted lines every ~1 mm across the crystal size, each cast straight
  //   down to the first outline edge or planar defect below it (so laminations shadow the backwall);
  //   on the web face the ladder runs across the web thickness.
  // - TOFD with no tracer rays: a synthetic centre + ±20 dB fan is drawn from each index point to
  //   the backwall (leg 1). TOFD probe positions come from UT.tofd.probePositions(state) when present
  //   (array [tx, rx] or {tx, rx}, each {x, side}); fallback tx = probe.x + pcs/2 (side +1), rx mirrored.
  //   Dead zones (tofd.deadZones): frame.tofd.deadZones, else UT.tofd.deadZones(state) when exported;
  //   drawn as hatched red bands (lateral: 0…dL, backwall: T−dB…T) between the two index points.
  // - Brush: left-drag collects mm points; on pointerup emits 'defect:brush' {pts, erase:false, brushMm}.
  //   For volumetric brush types (state.editing.brush not planar) the stroke is dilated by the brush
  //   radius and its convex hull is sent as pts, so the resulting polygon is a filled blob like UTman's
  //   dabs. Planar strokes send the raw (decimated) polyline. Right-drag emits {pts, erase:true}.
  //   Brush size (px) comes from setBrush(on, px) or state.editing.brushPx / brushSize; default 26.
  // - Probe drag (Pointer Events, setPointerCapture, primary pointer only): pointerdown anywhere on the
  //   canvas (not editing) jumps the probe x to the pointer and drags it (clamped to the scan surface);
  //   Shift-drag changes z by vertical movement (1 mm per mm of scale). Double-click on a defect sets
  //   selectedDefect = n − 1. One 'ui' {kind:'probe-drag', id:'cv-cross'|'cv-ruler'} is emitted at the END of
  //   every probe / oblique / ruler drag gesture (a plain click counts as a gesture: it moved the probe).
  // - Web face (fillet-t / nozzle): pressing on the web (|x| ≤ webT/2 + tol, above the fillet) puts the
  //   probe on that web face (probe.surface 'web', side = sign(x), x = distance up the web from the
  //   fillet toe); pressing on the base plate returns it to the plate (surface 'chord'). The surface is
  //   decided once per gesture at pointerdown.
  // - Finger tool (state.damping.tool): a press within the surface band (y −15…+6 mm around the scan
  //   surface, inside the scan-surface x range) toggles a damper: within 4 mm (≥ 14 mm on coarse pointers)
  //   of an existing damper removes it, otherwise adds one (max 3; a 4th press is ignored). Presses outside
  //   the band still drag the probe. Dampers are written with UT.setIn('damping', {points}).
  // - Converted rays (frame.rays.converted): the 40 heaviest entries; L orange dashed, S white dotted;
  //   vertices carrying `leg` beyond display.skips are dropped. Surface wave (frame.rays.surface.pts):
  //   1 px wavy cyan line (2 px amplitude, 8 px wavelength) plus small reflector markers.
  // - Focus (frame.rays.focus): fan polylines start at fan[i].pts[0] (the aperture point) as they come;
  //   the focal point is marked with a small circle + 'F <mm>'.
  // - PA (probe.method 'pa'): translucent orange sector from the index point over paFrom…paTo down to the
  //   backwall, a sub-fan of rays, an orange wedge (wedge angle of the mid angle) and element ticks from
  //   frame.pa.aperture {x0, x1} (pa.elements ticks) when 56-pa provides it.
  // - dragTo(x, {z}): one synthetic pointerdown/pointermove/pointerup gesture on #cv-cross through the
  //   real handlers (scale-aware via UT.dom.scale()); `z` (optional) is applied with UT.setIn('probe')
  //   after the gesture because a real drag changes x OR z (Shift), never both; exactly one 'ui'
  //   probe-drag event. Without a laid-out canvas (headless) it moves the probe directly and emits once.
  // - Oblique V1/V2 screen: the wide-face specimen is rebuilt for drawing (cached); the top band is the
  //   narrow face sheared by (depth·cos30°, −depth·sin30°). Probe on the band when spec.face === 'wide'
  //   (x along the band, z = depth fraction), on the front face when 'narrow' (x, y = z). Dropping on the
  //   other face calls UT.modes.setFace(face) then sets probe x/z.
  // - toPx/toMm in oblique mode map the front (wide) face.

  UT.views = UT.views || {};
  const M = UT.math;
  const C = UT.consts;
  const COL = C.COLOURS;
  const MM_SPAN = 320;               // canvas width covers 320 mm (§14.1)
  const FONT = '12px "Segoe UI", Arial, sans-serif';
  const FONT_SMALL = '11px "Segoe UI", Arial, sans-serif';
  const MAX_CONVERTED = 40;          // converted rays drawn per frame (SPEC-v2 §3.13)
  const MAX_DAMPERS = 3;             // finger dampers (SPEC-v2 §3.3)
  const DAMPER_TOL_MM = 4;           // click within this of a damper removes it
  const COARSE_HIT_PX = 53;          // ≈ 14 mm at 96 dpi (SPEC-v2 §5.4 hit targets on coarse pointers)
  const FINE_HIT_PX = 12;
  const BACKING_COLOUR = (C.SURFACE_COLOURS && C.SURFACE_COLOURS.backing) || '#0040ff';

  const S = {
    canvas: null, ruler: null,
    xf: null,                        // {scale, ox, oy, W, H, cx}
    ob: null,                        // oblique layout cache {sc, ox, oy, sh, band, spec, depth, W, H}
    obSpecs: {},                     // cached wide specimens for the oblique drawing
    lastFrame: null,
    drag: null,                      // probe drag {kind, ...}
    pointerId: null,                 // captured pointer of the running gesture
    stroke: null,                    // brush stroke {pts:[{x,y}], erase}
    brush: { on: false, px: 26 },
    ghost: null,                     // oblique drag ghost {face, x, z}
    hoverMm: null,
    uiEvents: 0,                     // 'ui' probe-drag events emitted (diagnostics / selftest)
  };

  // ------------------------------------------------------------------ helpers
  function state() { return UT.state; }
  function t(key, params) { return UT.i18n && UT.i18n.t ? UT.i18n.t(key, params) : key; }
  function isPlanarType(tp) { return UT.specimens && UT.specimens.isPlanar ? UT.specimens.isPlanar(tp) : (tp === 'planar' || tp === 'crack' || tp === 'lof' || tp === 'lamination' || tp === 'root'); }
  function isOblique(st) {
    return !!(st && (st.mode === 'v1' || st.mode === 'v2') && st.specimen && (st.specimen.id === 'v1' || st.specimen.id === 'v2'));
  }
  function derivedOf(frame, st) {
    if (frame && frame.derived) return frame.derived;
    try { return UT.probe.derive(st.probe, st.specimen); } catch (e) { return null; }
  }
  function cssW(cv) { return cv.clientWidth || cv.width || 300; }
  function cssH(cv) { return cv.clientHeight || cv.height || 150; }
  /** True on touch-like devices (pointer: coarse); false headless. */
  function coarsePointer() {
    try { return typeof matchMedia === 'function' && !!matchMedia('(pointer: coarse)').matches; } catch (e) { return false; }
  }
  /** Hit tolerance in mm for the current pointer type and scale (≥ 14 mm on coarse pointers). */
  function hitTolMm(minMm) {
    const sc = (S.xf && S.xf.scale) || 4;
    const px = coarsePointer() ? COARSE_HIT_PX : FINE_HIT_PX;
    return Math.max(minMm || 0, px / sc);
  }
  function presetOf(angle) { return UT.probe && UT.probe.presetFor ? UT.probe.presetFor(angle) : (UT.probe && UT.probe.presets ? UT.probe.presets[angle] : null); }

  /**
   * Pure transform for the normal cross-section: fixed W/320 px per mm (§14.1).
   * `bottomMm` (optional) = room to keep below the specimen (through-transmission receiver shoe).
   */
  function computeTransform(sp, W, H, bottomMm) {
    if (sp && sp.tky && sp.extents) {
      // TKY screen (§14.9): refit per angle from the outline bbox so the whole joint fits — the chord
      // spans the width, the brace end stays inside the canvas and the probe on the chord right of the
      // toe is never pushed off the right edge.
      const ex = sp.extents;
      const spanX = (ex.xMax - ex.xMin) + 8, spanY = (ex.yMax - ex.yMin) + 8;
      const sc = Math.min(W / spanX, H / spanY);
      const c = (ex.xMin + ex.xMax) / 2;
      return { scale: sc, ox: W / 2 - c * sc, oy: (-ex.yMin + 4) * sc, W, H, cx: c };
    }
    const scale = W / MM_SPAN;
    let cx = 0, yMin = 0, yMax = 20;
    if (sp && sp.extents) {
      cx = sp.extents.xMin < 0 ? 0 : (sp.extents.xMin + sp.extents.xMax) / 2;
      yMin = sp.extents.yMin; yMax = sp.extents.yMax;
    }
    // mm above the scan surface for the shoe; in TT mode the receiver hangs below the backwall, so
    // reserve `bottomMm` there and let the specimen sit higher (the transmitter keeps priority).
    const bottom = bottomMm > 4 ? bottomMm : 4;
    const minAbove = bottomMm > 4 ? Math.min(16, bottomMm - 2) : 16;   // shoe (14 mm) + 2 mm: keeps a 20 mm plate + ruler label inside a 180 px row
    const roomAbove = M.clamp(H / scale - yMax - bottom, minAbove, 24);
    // structure above the surface (cap bead, web of a T-joint): show it whole only while the plate
    // still fits — a 60 mm web takes what the canvas has left and is clipped at the top (v2)
    const wanted = -yMin + 6;
    const affordable = Math.max(roomAbove, H / scale - yMax - bottom);
    const above = Math.max(roomAbove, Math.min(wanted, affordable));
    const oy = above * scale;
    return { scale, ox: W / 2 - cx * scale, oy, W, H, cx };
  }

  function ensureTransform(st) {
    const cv = S.canvas;
    const W = cv ? cssW(cv) : (S.ruler ? cssW(S.ruler) : 1280);
    const H = cv ? cssH(cv) : 200;
    S.xf = computeTransform(st && st.specimen, W, H, ttBottomMm(st));
    return S.xf;
  }
  /** Room (mm) needed under the backwall for the hollow TT receiver shoe (+ index line), else 0. */
  function ttBottomMm(st) {
    if (!st || !st.probe || st.probe.method !== 'tt' || st.mode === 'tofd') return 0;
    const pre = presetOf(st.probe.angle);
    return ((pre && pre.shoeHeight) || 14) + 4;
  }

  /** mm → CSS px in the cross-section canvas. */
  function toPx(x, y) {
    if (S.ob && isOblique(state())) return { x: S.ob.ox + x * S.ob.sc, y: S.ob.oy + y * S.ob.sc };
    const xf = S.xf || ensureTransform(state());
    return { x: xf.ox + x * xf.scale, y: xf.oy + y * xf.scale };
  }
  /** CSS px → mm in the cross-section canvas. */
  function toMm(px, py) {
    if (S.ob && isOblique(state())) return { x: (px - S.ob.ox) / S.ob.sc, y: (py - S.ob.oy) / S.ob.sc };
    const xf = S.xf || ensureTransform(state());
    return { x: (px - xf.ox) / xf.scale, y: (py - xf.oy) / xf.scale };
  }
  /** Recompute the mm→px transform from the canvas size and the current specimen. */
  function fit() { S.ob = null; return ensureTransform(state()); }

  function polyPath(ctx, pts, close) {
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) { const p = toPx(pts[i].x, pts[i].y); if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }
    if (close) ctx.closePath();
  }
  function line(ctx, a, b) { const pa = toPx(a.x, a.y), pb = toPx(b.x, b.y); ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke(); }

  /** Tag of the outline edge/arc a point lies on (within tol mm), or null. */
  function surfaceTagAt(sp, x, y, tol) {
    const tl = tol === undefined ? 0.05 : tol;
    for (const e of sp.edges || []) {
      if (x < Math.min(e.a.x, e.b.x) - tl || x > Math.max(e.a.x, e.b.x) + tl || y < Math.min(e.a.y, e.b.y) - tl || y > Math.max(e.a.y, e.b.y) + tl) continue;
      if (M.pointSegment(x, y, e.a.x, e.a.y, e.b.x, e.b.y).d < tl) return e.tag || 'end';
    }
    for (const a of sp.arcs || []) if (Math.abs(M.dist(x, y, a.cx, a.cy) - a.r) < tl) return a.tag || 'radius';
    return null;
  }

  function polylinePts(r) {
    if (!r) return null;
    if (Array.isArray(r)) return r.length && r[0] && Array.isArray(r[0].pts) ? null : r;
    if (Array.isArray(r.pts)) return r.pts;
    return null;
  }

  // ------------------------------------------------------------------ pure geometry helpers (v2)
  /** The `n` heaviest entries of a converted-ray list (weight desc; entries without weight count as 0). */
  function topByWeight(list, n) {
    if (!Array.isArray(list)) return [];
    const arr = list.filter(function (c) { return c && Array.isArray(c.pts) && c.pts.length >= 2; });
    arr.sort(function (a, b) { return (b.weight || 0) - (a.weight || 0); });
    return arr.slice(0, n);
  }
  /**
   * Wavy polyline (px): a sinusoidal offset of amplitude `amp` and wavelength `wl` along the normal of
   * each segment of `pts`, sampled every ~wl/6 px. Returns [] for < 2 points.
   */
  function wavyPts(pts, amp, wl) {
    const out = [];
    if (!pts || pts.length < 2) return out;
    let s = 0;
    const step = Math.max(1, wl / 6);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const len = M.dist(a.x, a.y, b.x, b.y);
      if (len < 1e-6) continue;
      const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
      const nx = -uy, ny = ux;
      const n = Math.max(1, Math.ceil(len / step));
      for (let k = (i === 0 ? 0 : 1); k <= n; k++) {
        const d = len * k / n;
        const off = amp * Math.sin(2 * Math.PI * (s + d) / wl);
        out.push({ x: a.x + ux * d + nx * off, y: a.y + uy * d + ny * off });
      }
      s += len;
    }
    return out;
  }
  /** Index of the damper within tol (mm) of x, or −1. */
  function damperIndexAt(points, x, tol) {
    let best = -1, bd = tol;
    (points || []).forEach(function (p, i) {
      const px = typeof p === 'number' ? p : (p && p.x);
      if (typeof px !== 'number') return;
      const d = Math.abs(px - x);
      if (d <= bd) { bd = d; best = i; }
    });
    return best;
  }
  /** New damper list after a press at x: removes a damper within tol, else adds x (max `max`; unchanged when full). */
  function toggleDamperList(points, x, tol, max) {
    const list = (points || []).map(function (p) { return typeof p === 'number' ? p : p.x; }).filter(function (v) { return typeof v === 'number' && Number.isFinite(v); });
    const i = damperIndexAt(list, x, tol);
    if (i >= 0) { list.splice(i, 1); return { points: list, action: 'remove' }; }
    if (list.length >= (max || MAX_DAMPERS)) return { points: list, action: 'full' };
    list.push(+x.toFixed(1));
    return { points: list, action: 'add' };
  }
  /** True when a press at (mm) is on the scanning-surface band where dampers may be placed. */
  function onSurfaceBand(sp, mm) {
    if (!sp || !sp.scanSurface) return false;
    const ss = sp.scanSurface;
    return mm.y >= -15 && mm.y <= 6 && mm.x >= ss.xMin - 2 && mm.x <= ss.xMax + 2;
  }
  /**
   * Which scanning surface a press selects on a set-on T-joint / nozzle: {surface:'web', side, x} on a web face
   * (|x| ≤ webT/2 + tol above the fillet), {surface:'chord'} on the plate, null for other specimens.
   */
  function webPick(sp, mm, tol) {
    const w = sp && sp.weld;
    if (!w || !w.web) return null;
    const hw = w.webT / 2, leg = w.leg || 0;
    const top = -(sp.extents ? sp.extents.yMin : 60);
    const tl = tol || 3;
    if (mm.y < -leg - 1 && Math.abs(mm.x) <= hw + tl) {
      const side = mm.x >= 0 ? 1 : -1;
      const x = M.clamp(-mm.y - leg, 0, Math.max(5, top - leg - 8));
      return { surface: 'web', side, x: +x.toFixed(1) };
    }
    return { surface: 'chord' };
  }
  /** PA sector polygon (mm) from the emission point over angles a0…a1 (deg) down to depth T; `n` boundary points. */
  function paSectorPts(E, side, a0, a1, T, n) {
    const pts = [{ x: E.x, y: E.y }];
    const k = Math.max(2, n || 12);
    for (let i = 0; i <= k; i++) {
      const a = a0 + (a1 - a0) * i / k;
      const r = M.deg2rad(M.clamp(a, 0, 85));
      const d = Math.min(T / Math.max(Math.cos(r), 0.1), 4 * T);
      pts.push({ x: E.x - side * d * Math.sin(r), y: E.y + d * Math.cos(r) });
    }
    return pts;
  }

  // ------------------------------------------------------------------ brush geometry (pure)
  /** Convex hull (Andrew monotone chain) of {x,y} points. */
  function hull(points) {
    const pts = points.slice().sort(function (a, b) { return a.x === b.x ? a.y - b.y : a.x - b.x; });
    if (pts.length < 3) return pts;
    const cross = function (o, a, b) { return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x); };
    const lower = [];
    for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
    const upper = [];
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
    lower.pop(); upper.pop();
    return lower.concat(upper);
  }
  /** Dilate a stroke by radius r (mm) and return its closed convex outline (≤ ~40 points). */
  function dilate(pts, r) {
    const samples = [];
    let last = null;
    for (const p of pts) {
      if (last && M.dist(last.x, last.y, p.x, p.y) < 0.5) continue;
      last = p;
      for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; samples.push({ x: p.x + r * Math.cos(a), y: p.y + r * Math.sin(a) }); }
    }
    let h = hull(samples);
    const step = Math.max(1, Math.ceil(h.length / 36));
    if (step > 1) h = h.filter(function (_, i) { return i % step === 0; });
    const out = h.map(function (p) { return { x: +p.x.toFixed(2), y: +p.y.toFixed(2) }; });
    if (out.length) out.push({ x: out[0].x, y: out[0].y });
    return out;
  }

  // ------------------------------------------------------------------ drawing: specimen
  function drawSpecimen(ctx, sp) {
    if (!sp || !sp.outline || sp.outline.length < 3) return;
    ctx.save();
    polyPath(ctx, sp.outline, true);
    ctx.fillStyle = COL.steel;
    ctx.fill();
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 1;
    ctx.stroke();
    // weld: outlines only — fusion faces + cap/root bulges in light grey (§14.1)
    if (sp.weld) {
      ctx.strokeStyle = '#d0d0d0';
      ctx.lineWidth = 1;
      for (const f of sp.weld.fusionFaces || []) {
        if (!f || !f.a || !f.b) continue;
        if (f.tag === 'root' && sp.weld.web) continue;   // unfused web/plate interface: drawn from spec.reflectors below
        line(ctx, f.a, f.b);
      }
      const bulge = function (pts) {
        if (!pts || pts.length < 2) return;
        ctx.beginPath();
        for (let i = 0; i < pts.length; i++) { const p = toPx(pts[i].x, pts[i].y); if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }
        ctx.stroke();
      };
      bulge(sp.weld.cap); bulge(sp.weld.root);
      // root gap / root face lines from the region (single-v / double-v / K / J)
      if (!sp.weld.web && sp.weld.region && sp.weld.region.length >= 4) {
        const rg = sp.weld.region;
        ctx.setLineDash([]);
        for (let i = 0; i < rg.length; i++) {
          const a = rg[i], b = rg[(i + 1) % rg.length];
          if (Math.abs(a.y - b.y) < 1e-9 && (Math.abs(a.y) < 1e-9 || Math.abs(a.y - sp.T) < 1e-9)) continue;   // skip top/bottom closing edges
          line(ctx, a, b);
        }
      }
      drawBacking(ctx, sp);
      drawWebFillets(ctx, sp);
    }
    drawReflectors(ctx, sp);
    ctx.restore();
  }

  /** Backing bar (F1): bar outline in dark grey, its unfused faces/ends ('backing' edges) in SURFACE_COLOURS.backing. */
  function drawBacking(ctx, sp) {
    const bar = sp.weld && sp.weld.backing;
    if (!bar || bar.length < 4) return;
    ctx.save();
    polyPath(ctx, bar, true);
    ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fill();
    ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 1; ctx.setLineDash([]); ctx.stroke();
    ctx.strokeStyle = BACKING_COLOUR; ctx.lineWidth = 1.5;
    for (const e of sp.edges || []) if (e.tag === 'backing') line(ctx, e.a, e.b);
    ctx.restore();
  }

  /** Web + fillet welds (F1 fillet-t / nozzle): fillet region outlines and the web faces in light grey. */
  function drawWebFillets(ctx, sp) {
    const w = sp.weld;
    if (!w || !w.web) return;
    ctx.save();
    ctx.strokeStyle = '#d0d0d0'; ctx.lineWidth = 1; ctx.setLineDash([]);
    for (const r of w.regions || []) { if (r && r.length >= 3) { polyPath(ctx, r, true); ctx.stroke(); } }
    // web faces above the fillets (already outline edges; re-stroke lightly so the web reads as a plate)
    for (const e of sp.edges || []) if (e.tag === 'web') { ctx.strokeStyle = '#4a4a4a'; line(ctx, e.a, e.b); }
    ctx.restore();
  }

  /** Planar reflector segments outside the outline (v2 spec.reflectors): unfused interface (dark), FBH handled separately. */
  function drawReflectors(ctx, sp) {
    const list = sp.reflectors || [];
    if (!list.length) return;
    ctx.save();
    for (const r of list) {
      if (!r || !r.a || !r.b || r.tag === 'fbh') continue;
      ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1.5; ctx.setLineDash([]);
      line(ctx, r.a, r.b);
    }
    ctx.restore();
  }

  /** FBH block (P8): drill shaft from the bottom face up to the flat bottom (bar of width d) for each spec.fbhs entry. */
  function drawFbhs(ctx, sp) {
    const list = sp && sp.fbhs;
    if (!list || !list.length) return;
    const T = sp.T || 60;
    ctx.save();
    for (const f of list) {
      const a = toPx(f.x - f.d / 2, f.y), b = toPx(f.x + f.d / 2, T);
      const w = Math.max(b.x - a.x, 3);
      ctx.fillStyle = COL.cream; ctx.fillRect(a.x, a.y, w, b.y - a.y);
      ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 1; ctx.setLineDash([2, 2]);
      ctx.beginPath(); ctx.moveTo(a.x, b.y); ctx.lineTo(a.x, a.y); ctx.moveTo(a.x + w, b.y); ctx.lineTo(a.x + w, a.y); ctx.stroke();
      ctx.setLineDash([]); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(a.x - 1, a.y); ctx.lineTo(a.x + w + 1, a.y); ctx.stroke();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(a.x - 1, a.y + 1.5); ctx.lineTo(a.x + w + 1, a.y + 1.5); ctx.stroke();
    }
    ctx.restore();
  }

  function drawHoles(ctx, sp) {
    if (!sp || !sp.holes) return;
    const xf = S.xf;
    ctx.save();
    for (const h of sp.holes) {
      const p = toPx(h.x, h.y);
      const r = Math.max(h.r * xf.scale, 3);
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = COL.hole; ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.restore();
  }

  function drawPerspex(ctx, sp) {
    if (!sp || !sp.perspex) return;
    const p = toPx(sp.perspex.x, sp.perspex.y);
    ctx.save();
    ctx.beginPath(); ctx.arc(p.x, p.y, sp.perspex.r * S.xf.scale, 0, Math.PI * 2);
    ctx.fillStyle = COL.perspex; ctx.fill();
    ctx.strokeStyle = '#3a6a90'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
  }

  function drawSlot(ctx, sp) {
    if (!sp || !sp.retroSlot) return;
    const sl = sp.slot || { x: 100, w: 2, d: 5 };
    const a = toPx(sl.x - sl.w / 2, 0), b = toPx(sl.x + sl.w / 2, sl.d);
    ctx.save();
    ctx.fillStyle = COL.cream; ctx.fillRect(a.x, a.y - 1, b.x - a.x, b.y - a.y + 1);
    ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a.x, b.y); ctx.lineTo(b.x, b.y); ctx.lineTo(b.x, a.y); ctx.stroke();
    ctx.restore();
  }

  function drawIowGuides(ctx, sp) {
    if (!sp || sp.id !== 'iow') return;
    ctx.save();
    ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.fillStyle = '#000'; ctx.font = FONT_SMALL; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    for (const h of sp.holes || []) {
      if (h.ladder) continue;
      const a = toPx(h.x, 0), b = toPx(h.x, h.y);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.fillText(h.label || (h.y + 'mm'), a.x + 4, a.y + 3);
    }
    ctx.restore();
  }

  /** TOFD dead zones (P9): hatched red bands under the lateral wave and above the backwall between the probes. */
  function drawDeadZones(ctx, frame, st, sp) {
    if (st.mode !== 'tofd' || !st.tofd || !st.tofd.deadZones) return;
    let dz = frame && frame.tofd && frame.tofd.deadZones;
    if (!dz && UT.tofd && typeof UT.tofd.deadZones === 'function') { try { dz = UT.tofd.deadZones(st); } catch (e) { dz = null; } }
    if (!dz || !(dz.lateral > 0 || dz.backwall > 0)) return;
    const pp = tofdProbes(st, null);
    const x0 = Math.min(pp.tx.x, pp.rx.x), x1 = Math.max(pp.tx.x, pp.rx.x);
    const T = sp.T || 20;
    const band = function (yA, yB, label) {
      const a = toPx(x0, yA), b = toPx(x1, yB);
      if (b.y - a.y < 0.5) return;
      ctx.fillStyle = 'rgba(224,0,0,0.18)'; ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
      ctx.save();
      ctx.beginPath(); ctx.rect(a.x, a.y, b.x - a.x, b.y - a.y); ctx.clip();
      ctx.strokeStyle = 'rgba(224,0,0,0.45)'; ctx.lineWidth = 1;
      for (let x = a.x - (b.y - a.y); x < b.x; x += 6) { ctx.beginPath(); ctx.moveTo(x, b.y); ctx.lineTo(x + (b.y - a.y), a.y); ctx.stroke(); }
      ctx.restore();
      ctx.fillStyle = '#a00000'; ctx.font = FONT_SMALL; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(label, b.x + 4, (a.y + b.y) / 2);
    };
    ctx.save();
    if (dz.lateral > 0) band(0, Math.min(dz.lateral, T), t('dead zone {mm} mm', { mm: dz.lateral.toFixed(1) }));
    if (dz.backwall > 0) band(Math.max(0, T - dz.backwall), T, t('dead zone {mm} mm', { mm: dz.backwall.toFixed(1) }));
    ctx.restore();
  }

  // ------------------------------------------------------------------ drawing: defects
  function drawDefects(ctx, st) {
    const defects = st.defects || [];
    if (!defects.length) return;
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const d of defects) {
      if (!d || !d.pts || d.pts.length < 2 || d.visible === false) continue;
      if (isPlanarType(d.type)) {
        polyPath(ctx, d.pts, false);
        ctx.strokeStyle = COL.defect; ctx.lineWidth = 3; ctx.stroke();
      } else {
        polyPath(ctx, d.pts, true);
        ctx.fillStyle = COL.defect; ctx.fill();
        ctx.strokeStyle = COL.defect; ctx.lineWidth = 3; ctx.stroke();
      }
    }
    // selected defect: blue bounding rectangle while the editor is open
    if (st.editing && st.editing.defect) {
      const sel = defects.find(function (d) { return d && (d.n - 1) === (st.selectedDefect || 0); });
      if (sel && sel.pts && sel.pts.length) {
        const b = UT.specimens.bbox(sel.pts);
        const pad = 3;
        const a = toPx(b.xMin - pad, b.yMin - pad), c = toPx(b.xMax + pad, b.yMax + pad);
        ctx.strokeStyle = '#0000ff'; ctx.lineWidth = 1.5; ctx.setLineDash([]);
        ctx.strokeRect(a.x, a.y, c.x - a.x, c.y - a.y);
      }
    }
    ctx.restore();
  }

  function drawStroke(ctx) {
    const s = S.stroke;
    if (!s || s.pts.length < 1) return;
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = s.erase ? 'rgba(120,120,120,0.55)' : 'rgba(224,0,0,0.85)';
    ctx.lineWidth = s.planar && !s.erase ? 3 : Math.max(3, S.brush.px);
    ctx.beginPath();
    for (let i = 0; i < s.pts.length; i++) { const p = toPx(s.pts[i].x, s.pts[i].y); if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }
    if (s.pts.length === 1) { const p = toPx(s.pts[0].x, s.pts[0].y); ctx.lineTo(p.x + 0.1, p.y); }
    ctx.stroke();
    ctx.restore();
  }

  // ------------------------------------------------------------------ drawing: beam
  function rayColour(mode, leg, lastTag, base) {
    if (mode === 'propagation') return C.LEG_COLOURS[Math.min(leg, C.LEG_COLOURS.length) - 1] || base;
    if (mode === 'geometry') return (lastTag && C.SURFACE_COLOURS[lastTag]) || (leg === 1 ? '#ffffff' : base);
    return base;
  }

  /** Stroke a ray polyline, splitting into legs at outline reflections; only legs ≤ skips are drawn. */
  function strokeRay(ctx, sp, pts, skips, mode, base) {
    if (!pts || pts.length < 2) return;
    let leg = pts[0].leg || 1, lastTag = null;
    let colour = rayColour(mode, leg, lastTag, base);
    ctx.strokeStyle = colour;
    let p0 = toPx(pts[0].x, pts[0].y);
    ctx.beginPath(); ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < pts.length; i++) {
      const p = toPx(pts[i].x, pts[i].y);
      ctx.lineTo(p.x, p.y);
      if (i === pts.length - 1) break;
      let tag = null, newLeg = leg;
      if (pts[i].leg !== undefined) { if (pts[i].leg > leg) { newLeg = pts[i].leg; tag = pts[i].tag || pts[i].surfaceTag || 'bottom'; } }
      else { tag = surfaceTagAt(sp, pts[i].x, pts[i].y); if (tag) newLeg = leg + 1; }
      if (newLeg !== leg) {
        leg = newLeg; lastTag = tag;
        if (leg > skips) break;
        const nc = rayColour(mode, leg, lastTag, base);
        if (nc !== colour) { ctx.stroke(); colour = nc; ctx.strokeStyle = colour; ctx.beginPath(); ctx.moveTo(p.x, p.y); }
      }
    }
    ctx.stroke();
  }

  /** Cast a vertical line from (x, 0) down to the first outline edge or planar defect below it. */
  function castDown(sp, x, defects) {
    let best = sp.T || 20;
    for (const e of sp.edges || []) {
      if (e.tag === 'top' || e.tag === 'cap') continue;
      const h = M.raySegment(x, 0.01, 0, 1, e.a.x, e.a.y, e.b.x, e.b.y, 0.02);
      if (h && h.t < best) best = h.t;
    }
    for (const d of defects || []) {
      if (!d || !isPlanarType(d.type) || !d.pts) continue;
      for (let i = 0; i < d.pts.length - 1; i++) {
        const h = M.raySegment(x, 0.01, 0, 1, d.pts[i].x, d.pts[i].y, d.pts[i + 1].x, d.pts[i + 1].y, 0.02);
        if (h && h.t < best) best = h.t;
      }
    }
    // v2 planar reflectors outside the outline (FBH flat bottoms, unfused interfaces) shadow the backwall too
    for (const r of sp.reflectors || []) {
      if (!r || !r.a || !r.b) continue;
      const h = M.raySegment(x, 0.01, 0, 1, r.a.x, r.a.y, r.b.x, r.b.y, 0.02);
      if (h && h.t < best) best = h.t;
    }
    return best;
  }

  function drawZeroLadder(ctx, st, sp, der, E) {
    const D = der.crystalA || der.diameter || 10;
    const mode = st.display.colourCode || 'none';
    const defects = st.display.hide ? [] : st.defects;
    const step = Math.max(1, 4 / S.xf.scale);
    const onWeb = st.probe.surface === 'web' && sp.weld && sp.weld.web;
    ctx.save();
    ctx.lineWidth = 1;
    ctx.setLineDash([1, 2]);
    ctx.strokeStyle = mode === 'none' ? 'rgba(255,255,255,0.55)' : rayColour(mode, 1, null, '#ffffff');
    const tg = E.tangent || { x: 1, y: 0 }, nm = E.normal || { x: 0, y: 1 };
    const castLine = function (u) {
      if (onWeb) {
        const w = sp.weld.webT || 12;
        const a = { x: E.x + u * tg.x, y: E.y + u * tg.y };
        return [a, { x: a.x + nm.x * w, y: a.y + nm.y * w }];
      }
      const x = E.x + u;
      return [{ x, y: 0 }, { x, y: castDown(sp, x, defects) }];
    };
    if (st.display.singleLine) {
      const ab = castLine(0);
      ctx.setLineDash([]); ctx.lineWidth = 1.5;
      line(ctx, ab[0], ab[1]);
    } else {
      for (let u = -D / 2; u <= D / 2 + 1e-6; u += step) { const ab = castLine(u); line(ctx, ab[0], ab[1]); }
    }
    ctx.restore();
  }

  /** Synthetic fan (index → backwall, leg 1) used for TOFD probes and phased-array sectors. */
  function drawSimpleFan(ctx, sp, E, side, angles, dashed) {
    const T = sp.T || 20;
    ctx.save();
    ctx.lineWidth = 1;
    ctx.setLineDash(dashed ? [4, 3] : [1, 2]);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    for (const a of angles) {
      const tn = Math.tan(M.deg2rad(a));
      const p0 = toPx(E.x, E.y), p1 = toPx(E.x - side * T * tn, T);
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
    }
    ctx.restore();
  }

  /** Phased-array sector (P10): translucent orange sector over paFrom…paTo plus a sub-fan of rays. */
  function drawPaSector(ctx, frame, st, sp, E) {
    const probe = st.probe;
    const side = probe.side || 1;
    const T = sp.T || 20;
    let a0 = probe.paFrom, a1 = probe.paTo;
    const ss = frame && frame.sscan;
    if (ss && Array.isArray(ss.angles) && ss.angles.length >= 2) { a0 = ss.angles[0]; a1 = ss.angles[ss.angles.length - 1]; }
    if (!(a1 > a0)) { a0 = Math.min(a0, a1); a1 = a0 + 1; }
    const pts = paSectorPts(E, side, a0, a1, T, 16);
    ctx.save();
    polyPath(ctx, pts, true);
    ctx.fillStyle = 'rgba(255,136,0,0.16)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,136,0,0.8)'; ctx.lineWidth = 1; ctx.setLineDash([]); ctx.stroke();
    ctx.restore();
    const angles = UT.probe.paAngles(probe);
    const every = Math.max(1, Math.round(angles.length / 8));
    const sub = angles.filter(function (_, i) { return i % every === 0; });
    drawSimpleFan(ctx, sp, E, side, sub, false);
    // steering angle of the E-scan / selected view as a solid orange line
    const esc = st.pa && typeof st.pa.escanAngle === 'number' ? st.pa.escanAngle : null;
    if (esc !== null && st.pa && st.pa.view === 'E') {
      const tn = Math.tan(M.deg2rad(esc));
      ctx.save(); ctx.strokeStyle = '#ff8800'; ctx.lineWidth = 1.5; line(ctx, E, { x: E.x - side * T * tn, y: T }); ctx.restore();
    }
  }

  function drawBeam(ctx, frame, st, sp, der, E) {
    const disp = st.display;
    if (!disp.beam || disp.hide) return;
    const probe = st.probe;
    const skips = Math.max(1, disp.skips || 1);
    const mode = disp.colourCode || 'none';
    if (st.mode === 'tofd') {
      const pp = tofdProbes(st, der);
      const a = st.tofd && st.tofd.txAngle ? st.tofd.txAngle : 60;
      const h20 = der.halfAngle20dB || 4;
      drawSimpleFan(ctx, sp, { x: pp.tx.x, y: 0 }, pp.tx.side, [a - h20, a, a + h20], false);
      drawSimpleFan(ctx, sp, { x: pp.rx.x, y: 0 }, pp.rx.side, [a - h20, a, a + h20], false);
      return;   // the PE tracer fan (if any) is meaningless for the TOFD pair
    }
    if (probe.method === 'pa') { drawPaSector(ctx, frame, st, sp, E); return; }
    if ((probe.angle || 0) === 0) { drawZeroLadder(ctx, st, sp, der, E); drawSurfaceWave(ctx, frame, st); return; }
    const rays = frame && frame.rays;
    if (!rays) return;
    drawTracerRays(ctx, rays, sp, skips, mode, der, disp.singleLine);
    drawConverted(ctx, rays, sp, skips, st);
    drawSurfaceWave(ctx, frame, st);
    drawFocus(ctx, rays, der);
  }

  function drawTracerRays(ctx, rays, sp, skips, mode, der, singleLine) {
    ctx.save();
    ctx.lineCap = 'butt';
    const base = mode === 'none' ? 'rgba(255,255,255,0.55)' : (der && der.colour) || '#ffffff';
    if (!singleLine) {
      ctx.lineWidth = 1;
      ctx.setLineDash([1, 2]);
      for (const f of rays.fan || []) {
        const pts = polylinePts(f);
        if (pts) strokeRay(ctx, sp, pts, skips, mode, base);
      }
      ctx.setLineDash([4, 3]);
      for (const e of rays.edge20 || []) {
        const pts = polylinePts(e);
        if (pts) strokeRay(ctx, sp, pts, skips, mode, base);
      }
    }
    const cpts = rays.centre ? (polylinePts(rays.centre) || (rays.centre.legs ? legsToPts(rays.centre.legs) : null)) : null;
    if (cpts) {
      if (singleLine) { ctx.setLineDash([]); ctx.lineWidth = 1.5; strokeRay(ctx, sp, cpts, skips, mode, mode === 'none' ? ((der && der.colour) || '#ffffff') : base); }
      else if (mode === 'none') { ctx.setLineDash([1, 2]); ctx.lineWidth = 1; strokeRay(ctx, sp, cpts, skips, mode, base); }
      else { ctx.setLineDash([]); ctx.lineWidth = 1.5; strokeRay(ctx, sp, cpts, skips, mode, base); }
    }
    ctx.restore();
  }

  /** Mode-converted rays (P2): orange dashed L / white dotted S, ≤ 40 by weight, when display.convRays. */
  function drawConverted(ctx, rays, sp, skips, st) {
    if (!st.display || st.display.convRays === false) return;
    const list = topByWeight(rays.converted, MAX_CONVERTED);
    if (!list.length) return;
    ctx.save();
    ctx.lineWidth = 1; ctx.lineCap = 'butt';
    for (const c of list) {
      const pts = c.pts.filter(function (p) { return p && typeof p.x === 'number' && (p.leg === undefined || p.leg <= skips); });
      if (pts.length < 2) continue;
      const isL = c.mode === 'L';
      ctx.strokeStyle = isL ? '#ff8800' : 'rgba(255,255,255,0.85)';
      ctx.setLineDash(isL ? [5, 3] : [2, 2]);
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) { const p = toPx(pts[i].x, pts[i].y); if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Surface (Rayleigh) wave (P3): 1 px wavy line along frame.rays.surface.pts + reflector markers. */
  function drawSurfaceWave(ctx, frame, st) {
    if (!st.physics || !st.physics.surfaceWave) return;
    const sw = frame && frame.rays && frame.rays.surface;
    if (!sw || !Array.isArray(sw.pts) || sw.pts.length < 2) return;
    const px = sw.pts.map(function (p) { return toPx(p.x, p.y); });
    const wav = wavyPts(px, 2, 8);
    if (wav.length < 2) return;
    ctx.save();
    ctx.strokeStyle = '#40e0ff'; ctx.lineWidth = 1; ctx.setLineDash([]); ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < wav.length; i++) { if (i === 0) ctx.moveTo(wav[i].x, wav[i].y); else ctx.lineTo(wav[i].x, wav[i].y); }
    ctx.stroke();
    for (const r of sw.reflectors || []) {
      if (!r || typeof r.x !== 'number') continue;
      const p = toPx(r.x, r.y || 0);
      ctx.fillStyle = 'rgba(64,224,255,' + M.clamp(0.4 + 0.6 * (r.refl || 0), 0.4, 1) + ')';
      ctx.beginPath(); ctx.moveTo(p.x, p.y - 1); ctx.lineTo(p.x - 4, p.y - 8); ctx.lineTo(p.x + 4, p.y - 8); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  /** Focal point marker (P6): small circle + 'F <mm>' in the probe colour. */
  function drawFocus(ctx, rays, der) {
    const f = rays && rays.focus;
    if (!f || typeof f.x !== 'number' || typeof f.y !== 'number') return;
    const p = toPx(f.x, f.y);
    ctx.save();
    ctx.strokeStyle = (der && der.colour) || '#00c000'; ctx.lineWidth = 1.5; ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(p.x - 7, p.y); ctx.lineTo(p.x + 7, p.y); ctx.moveTo(p.x, p.y - 7); ctx.lineTo(p.x, p.y + 7); ctx.stroke();
    ctx.fillStyle = '#000'; ctx.font = FONT_SMALL; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('F ' + (typeof f.F === 'number' ? f.F.toFixed(0) : '') , p.x + 8, p.y - 8);
    ctx.restore();
  }

  function legsToPts(legs) {
    const out = [];
    legs.forEach(function (l, i) { if (i === 0) out.push({ x: l.a.x, y: l.a.y, leg: l.leg || 1 }); out.push({ x: l.b.x, y: l.b.y, leg: (l.leg || i + 1) + 1, tag: l.surfaceTag }); });
    return out;
  }

  function drawHits(ctx, frame, st) {
    const rays = frame && frame.rays;
    if (!rays || !rays.hits || st.display.hide || st.mode === 'tofd') return;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 0.5;
    let n = 0;
    for (const h of rays.hits) {
      if (!h || typeof h.x !== 'number') continue;
      if (n++ > 60) break;
      const p = toPx(h.x, h.y);
      ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  // ------------------------------------------------------------------ drawing: finger dampers (P3)
  /** Small grey fingertips on the scanning surface at state.damping.points; a caption while the tool is on. */
  function drawDampers(ctx, st, W) {
    const pts = (st.damping && st.damping.points) || [];
    const sc = Math.min(S.xf ? S.xf.scale : 4, 5);
    ctx.save();
    for (const p of pts) {
      const x = typeof p === 'number' ? p : (p && p.x);
      if (typeof x !== 'number') continue;
      const c = toPx(x, 0);
      const w = 7 * sc, h = 9 * sc;
      ctx.fillStyle = '#c4c4c4'; ctx.strokeStyle = '#606060'; ctx.lineWidth = 1; ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(c.x - w / 2, c.y);
      ctx.lineTo(c.x - w / 2, c.y - h * 0.55);
      ctx.quadraticCurveTo(c.x - w / 2, c.y - h, c.x, c.y - h);
      ctx.quadraticCurveTo(c.x + w / 2, c.y - h, c.x + w / 2, c.y - h * 0.55);
      ctx.lineTo(c.x + w / 2, c.y);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // nail
      ctx.fillStyle = '#e8e8e8';
      ctx.beginPath(); ctx.ellipse(c.x, c.y - h * 0.72, w * 0.28, h * 0.16, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      // contact line
      ctx.strokeStyle = '#404040'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(c.x - w / 2, c.y); ctx.lineTo(c.x + w / 2, c.y); ctx.stroke();
    }
    if (st.damping && st.damping.tool) {
      ctx.fillStyle = '#404040'; ctx.font = FONT_SMALL; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(t('Finger damping: click on the scanning surface to add or remove a damper ({n}/{max})', { n: pts.length, max: MAX_DAMPERS }), 8, 4);
    }
    ctx.restore();
    void W;
  }

  // ------------------------------------------------------------------ drawing: probes
  /** Emission frame for the probe: {x, y, tangent, normal}. */
  function emissionAt(sp, probe) {
    try { return UT.specimens.scanSurfaceAt(sp, probe); } catch (e) { return { x: probe.x, y: 0, tangent: { x: 1, y: 0 }, normal: { x: 0, y: 1 } }; }
  }

  /**
   * Draw a probe shoe at emission point E (mm) with local frame (tangent t, normal n into the metal).
   * Angle probes: "house" pentagon 24×14 mm (vertical front face, front-top corner sloped at the
   * wedge angle — any custom angle); 0°: square 20×18 mm. Twin crystals get a dashed divider.
   */
  function drawShoe(ctx, E, tg, n, side, der, colour, hollow, opts) {
    const o = opts || {};
    const map = function (u, v) { return toPx(E.x + u * tg.x + v * n.x, E.y + u * tg.y + v * n.y); };
    const isZero = !der.refracted || der.refracted === 0 || o.zero;
    ctx.save();
    ctx.lineJoin = 'miter';
    if (isZero) {
      const w = der.shoeWidth || 20, h = der.shoeHeight || 18;
      const pts = [map(-w / 2, 0), map(w / 2, 0), map(w / 2, -h), map(-w / 2, -h)];
      ctx.beginPath(); pts.forEach(function (p, i) { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }); ctx.closePath();
      if (!hollow) { ctx.fillStyle = colour; ctx.fill(); }
      ctx.strokeStyle = hollow ? colour : '#202020'; ctx.lineWidth = hollow ? 2 : 1; ctx.stroke();
      // centre tick + twin divider
      ctx.strokeStyle = hollow ? colour : '#202020'; ctx.lineWidth = 1;
      const c0 = map(0, -h), c1 = map(0, -h + 4);
      ctx.beginPath(); ctx.moveTo(c0.x, c0.y); ctx.lineTo(c1.x, c1.y); ctx.stroke();
      if (der.crystal === 'twin') { const d0 = map(0, 0), d1 = map(0, -h); ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.moveTo(d0.x, d0.y); ctx.lineTo(d1.x, d1.y); ctx.stroke(); ctx.setLineDash([]); }
      // cyan contact line
      const l0 = map(-w / 2, 0), l1 = map(w / 2, 0);
      ctx.strokeStyle = '#00e0ff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(l0.x, l0.y); ctx.lineTo(l1.x, l1.y); ctx.stroke();
    } else {
      const w = o.width || der.shoeWidth || 24, h = der.shoeHeight || 14;
      const half = w / 2;
      // "house" pentagon (§14.1): rectangular body with a vertical front face; only the front-TOP
      // corner is cut by a roof sloped at the wedge angle (the crystal sits on that face). The roof
      // drops at most h/2 so the front face stays ≥ half the height, and runs at most w/2 back.
      const tw = Math.tan(M.deg2rad(M.clamp(der.wedgeAngle || 45, 10, 80)));
      const rise = Math.min(h / 2, half * tw);
      const run = M.clamp(rise / tw, 3, half);
      const front = -side * half, back = side * half;
      const pts = [map(front, 0), map(back, 0), map(back, -h), map(front + side * run, -h), map(front, -h + rise)];
      ctx.beginPath(); pts.forEach(function (p, i) { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }); ctx.closePath();
      if (!hollow) { ctx.fillStyle = colour; ctx.fill(); }
      ctx.strokeStyle = hollow ? colour : '#202020'; ctx.lineWidth = hollow ? 2 : 1; ctx.stroke();
      if (der.crystal === 'twin' && !hollow) {
        const d0 = map(side * 2, 0), d1 = map(side * 2, -h);
        ctx.strokeStyle = '#202020'; ctx.lineWidth = 1; ctx.setLineDash([2, 2]);
        ctx.beginPath(); ctx.moveTo(d0.x, d0.y); ctx.lineTo(d1.x, d1.y); ctx.stroke(); ctx.setLineDash([]);
      }
      // short green index line beneath the index point
      const i0 = map(0, 0), i1 = map(0, 2.5);
      ctx.strokeStyle = '#00c000'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(i0.x, i0.y); ctx.lineTo(i1.x, i1.y); ctx.stroke();
    }
    ctx.restore();
  }

  function tofdProbes(st, der) {
    const pcs = (st.tofd && st.tofd.pcs) || 60;
    const px = st.probe.x || 0;
    let tx = { x: px + pcs / 2, side: 1 }, rx = { x: px - pcs / 2, side: -1 };
    try {
      const pp = UT.tofd && UT.tofd.probePositions ? UT.tofd.probePositions(st) : null;
      const norm = function (v, dflt) { if (v === null || v === undefined) return dflt; if (typeof v === 'number') return { x: v, side: dflt.side }; return { x: typeof v.x === 'number' ? v.x : dflt.x, side: v.side || dflt.side }; };
      if (Array.isArray(pp) && pp.length >= 2) { tx = norm(pp[0], tx); rx = norm(pp[1], rx); }
      else if (pp && typeof pp === 'object') { tx = norm(pp.tx, tx); rx = norm(pp.rx, rx); }
    } catch (e) { /* fallback */ }
    if (tx.x < rx.x) { tx.side = -1; rx.side = 1; } else { tx.side = 1; rx.side = -1; }
    void der;
    return { tx, rx };
  }

  /** PA wedge (P10): orange shoe with the mid-angle wedge slope + element ticks along the aperture. */
  function drawPaProbe(ctx, frame, st, sp, der, E, tg, n) {
    const probe = st.probe;
    const side = probe.side || 1;
    const mid = ((probe.paFrom || 40) + (probe.paTo || 70)) / 2;
    let wa = der.wedgeAngle;
    try { if (UT.probe.wedgeAngleFor) wa = UT.probe.wedgeAngleFor(mid, 'shear', der.vWedge || 2.74, sp.material); } catch (e) { /* keep */ }
    const el = (st.pa && st.pa.elements) || 16, pitch = (st.pa && st.pa.pitch) || 1;
    const width = M.clamp(el * pitch + 12, 24, 40);
    const d2 = Object.assign({}, der, { refracted: mid, wedgeAngle: wa, shoeWidth: width, shoeHeight: 14 });
    drawShoe(ctx, E, tg, n, side, d2, C.PROBE_COLOURS.pa || '#ff8800', false, { width });
    // element ticks on the wedge roof line
    const ap = frame && frame.pa && frame.pa.aperture;
    const x0 = ap && typeof ap.x0 === 'number' ? ap.x0 : E.x - el * pitch / 2;
    const x1 = ap && typeof ap.x1 === 'number' ? ap.x1 : E.x + el * pitch / 2;
    const yOff = -10;
    ctx.save();
    ctx.strokeStyle = '#402000'; ctx.lineWidth = 1; ctx.setLineDash([]);
    const a = toPx(x0, yOff), b = toPx(x1, yOff);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    const nEl = M.clamp(Math.round(el), 2, 64);
    for (let i = 0; i <= nEl; i++) { const x = a.x + (b.x - a.x) * i / nEl; ctx.beginPath(); ctx.moveTo(x, a.y - 2); ctx.lineTo(x, a.y + 2); ctx.stroke(); }
    ctx.restore();
  }

  function drawProbes(ctx, frame, st, sp, der, E) {
    const probe = st.probe;
    const colour = der.colour || '#00c000';
    const tg = E.tangent || { x: 1, y: 0 }, n = E.normal || { x: 0, y: 1 };
    if (st.mode === 'tofd') {
      const pp = tofdProbes(st, der);
      const a = (st.tofd && st.tofd.txAngle) || 60;
      const wa = UT.probe.wedgeAngleFor ? UT.probe.wedgeAngleFor(a, 'comp', der.vWedge || 2.74, sp.material) : 24;
      const d2 = Object.assign({}, der, { refracted: a, wedgeAngle: wa, shoeWidth: 24, shoeHeight: 14 });
      const col = C.PROBE_COLOURS[a] || colour;
      // lateral wave: 2 px yellow line along the surface between the two index points
      const l0 = toPx(pp.tx.x, 0), l1 = toPx(pp.rx.x, 0);
      ctx.save(); ctx.strokeStyle = '#ffe000'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(l0.x, l0.y); ctx.lineTo(l1.x, l1.y); ctx.stroke(); ctx.restore();
      drawShoe(ctx, { x: pp.tx.x, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, pp.tx.side, d2, col, false);
      drawShoe(ctx, { x: pp.rx.x, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, pp.rx.side, d2, col, true);
      return;
    }
    if (probe.method === 'pa') { drawPaProbe(ctx, frame, st, sp, der, E, tg, n); return; }
    const side = probe.side || 1;
    const theta = der.refracted || 0;
    const T = sp.T || 20;
    const onWeb = probe.surface === 'web' && sp.weld && sp.weld.web;
    if (probe.method === 'tt' && !onWeb) {
      // receiver on the opposite surface where the centre ray exits (hollow, mirrored)
      const xr = E.x - side * T * Math.tan(M.deg2rad(theta));
      drawShoe(ctx, { x: xr, y: T }, { x: 1, y: 0 }, { x: 0, y: -1 }, -side, der, colour, true);
    } else if (probe.method === 'tandem' && !onWeb) {
      const xr = E.x - side * T * Math.tan(M.deg2rad(theta));
      drawShoe(ctx, { x: xr, y: 0 }, tg, n, side, der, colour, true);
    }
    drawShoe(ctx, E, tg, n, side, der, colour, false);
  }

  // ------------------------------------------------------------------ drawing: ruler, labels, caption
  function drawDepthRuler(ctx, sp) {
    if (!sp || !sp.extents) return;
    const xf = S.xf;
    const yMax = sp.extents.yMax;
    const x0 = Math.max(xf.ox + sp.extents.xMin * xf.scale, 0) + 16;
    ctx.save();
    ctx.strokeStyle = COL.ruler; ctx.fillStyle = COL.ruler; ctx.lineWidth = 1;
    ctx.font = FONT_SMALL; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const top = toPx(0, 0).y, bot = toPx(0, yMax).y;
    ctx.beginPath(); ctx.moveTo(x0 + 0.5, top); ctx.lineTo(x0 + 0.5, bot); ctx.stroke();
    // Tick/label steps come from the pixel scale (5/10 mm at the normal scale; coarser when the mm
    // are tiny on screen) and the loop covers only the visible canvas rows, so the cost is bounded by
    // canvas pixels rather than by the specimen thickness (the plate is clipped by the canvas anyway).
    const step = rulerStep(5, xf.scale, 3);
    const labelStep = rulerStep(10, xf.scale, 12, step);
    const dLo = Math.max(0, Math.floor(toMm(0, 0).y / step) * step);
    const dHi = Math.min(yMax, toMm(0, xf.H).y + step);
    if (!((dHi - dLo) / step <= 5000)) { ctx.restore(); return; }
    for (let d = dLo; d <= dHi + 1e-6; d += step) {
      const y = Math.round(toPx(0, d).y) + 0.5;
      const label = d % labelStep === 0;
      const len = label ? 10 : 6;
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + len, y); ctx.stroke();
      if (label) ctx.fillText(String(d), x0 + 14, d === 0 ? y - 6 : y);
    }
    ctx.restore();
  }

  // Smallest "nice" tick spacing (base × 1, 5, 10, 50, 100 … mm) that is at least minPx apart on
  // screen and (optionally) a multiple of `coarse`. Returns `base` unchanged at the normal scale.
  function rulerStep(base, scale, minPx, coarse) {
    let s = base;
    const mul = coarse || 1;
    for (let i = 0; i < 40 && (s * scale < minPx || s % mul !== 0); i++) s *= (i % 2 === 0) ? 5 : 2;
    return s;
  }

  function drawLabels(ctx, sp, skipCaption) {
    if (!sp || !sp.labels) return;
    ctx.save();
    ctx.fillStyle = '#000'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const l of sp.labels) {
      if (!l || !l.text) continue;
      if (skipCaption && l.text === 'CROSS SECTION') continue;
      if (sp.id === 'iow' && /mm$/.test(l.text)) continue;      // iow depth labels are drawn on the guide lines
      ctx.font = l.big ? 'bold 26px "Segoe UI", Arial, sans-serif' : (l.small ? FONT_SMALL : 'bold 13px "Segoe UI", Arial, sans-serif');
      const p = toPx(l.x, l.y);
      ctx.fillText(l.text, p.x, p.y);
    }
    ctx.restore();
  }

  function drawCaption(ctx, sp, W) {
    ctx.save();
    ctx.fillStyle = '#000'; ctx.font = FONT; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    let right = sp && sp.extents ? Math.min(W - 8, toPx(sp.extents.xMax, 0).x - 12) : W - 12;
    let baseline = toPx(0, 0).y - 6;
    if (baseline < 14) baseline = 14;   // tall structures above the plate (web): keep the caption inside the canvas
    // The 3-D window (PIPE on) sits over the right end of the cross band at every viewport size:
    // slide the caption left of it when their boxes intersect (§14.11).
    try {
      const w = UT.dom && UT.dom.wins && UT.dom.wins.pipe3d;
      if (w && w.isOpen() && w.el && S.canvas && typeof w.el.getBoundingClientRect === 'function') {
        const k = UT.dom.scale ? UT.dom.scale() : 1;
        const wr = w.el.getBoundingClientRect(), cr = S.canvas.getBoundingClientRect();
        const wl = (wr.left - cr.left) / k, wt = (wr.top - cr.top) / k, wb = (wr.bottom - cr.top) / k;
        const tw = ctx.measureText('CROSS SECTION').width;
        if (right > wl && right - tw < (wr.right - cr.left) / k && baseline > wt && baseline - 12 < wb) right = Math.min(right, wl - 8);
      }
    } catch (e) { /* headless / no layout: keep the default position */ }
    ctx.fillText('CROSS SECTION', right, baseline);
    ctx.restore();
  }

  // ------------------------------------------------------------------ normal cross-section frame
  function drawNormal(ctx, frame, st, W, H) {
    const sp = st.specimen;
    ctx.fillStyle = COL.cream; ctx.fillRect(0, 0, W, H);
    if (!sp) return;
    const der = derivedOf(frame, st);
    drawSpecimen(ctx, sp);
    drawFbhs(ctx, sp);
    drawHoles(ctx, sp);
    drawPerspex(ctx, sp);
    drawSlot(ctx, sp);
    drawIowGuides(ctx, sp);
    drawDeadZones(ctx, frame, st, sp);
    if (!st.display.hide) drawDefects(ctx, st);
    drawStroke(ctx);
    const E = emissionAt(sp, st.probe);
    if (der) {
      drawBeam(ctx, frame, st, sp, der, E);
      drawHits(ctx, frame, st);
      drawProbes(ctx, frame, st, sp, der, E);
    }
    drawDampers(ctx, st, W);
    drawDepthRuler(ctx, sp);
    drawLabels(ctx, sp, true);
    drawCaption(ctx, sp, W);
  }

  // ------------------------------------------------------------------ oblique V1/V2 block screen (§14.8)
  function wideSpecFor(st) {
    const id = st.specimen.id;
    if (!S.obSpecs[id]) S.obSpecs[id] = id === 'v2' ? UT.specimens.v2({ face: 'wide' }) : UT.specimens.v1({ face: 'wide' });
    return S.obSpecs[id];
  }
  function narrowDepthFor(st) { return st.specimen.id === 'v2' ? 12.5 : 25; }

  /** Pure oblique layout: front face = wide view, top band sheared 30° up-right by `depth`. */
  function computeOblique(wide, depth, W, H) {
    const ex = wide.extents;
    const cos30 = Math.cos(Math.PI / 6), sin30 = 0.5;
    const xSpan = (ex.xMax - ex.xMin) + depth * cos30;
    const ySpan = (ex.yMax - ex.yMin) + depth * sin30;
    const sc = Math.min((W - 80) / xSpan, (H - 90) / ySpan, 8);
    const ox = 40 - ex.xMin * sc;
    const oy = 70 + depth * sin30 * sc - ex.yMin * sc;
    const sh = { x: depth * cos30 * sc, y: -depth * sin30 * sc };
    const top = wide.edges.filter(function (e) { return e.tag === 'top'; });
    let tx0 = ex.xMin, tx1 = ex.xMax;
    if (top.length) { tx0 = Math.min.apply(null, top.map(function (e) { return Math.min(e.a.x, e.b.x); })); tx1 = Math.max.apply(null, top.map(function (e) { return Math.max(e.a.x, e.b.x); })); }
    const A = { x: ox + tx0 * sc, y: oy }, B = { x: ox + tx1 * sc, y: oy };
    const band = [A, B, { x: B.x + sh.x, y: B.y + sh.y }, { x: A.x + sh.x, y: A.y + sh.y }];
    const front = wide.outline.map(function (p) { return { x: ox + p.x * sc, y: oy + p.y * sc }; });
    return { sc, ox, oy, sh, band, front, tx0, tx1, depth, W, H, id: wide.id, T: ex.yMax - ex.yMin, yMax: ex.yMax };
  }

  function bandPoint(ob, x, frac) { return { x: ob.ox + x * ob.sc + ob.sh.x * frac, y: ob.oy + ob.sh.y * frac }; }

  /** Which face / position (mm) is under a canvas point in oblique mode. */
  function obliquePick(ob, px, py) {
    const zWide = ob.depth;
    if (M.pointInPolygon(px, py, ob.band)) {
      const frac = M.clamp((py - ob.oy) / ob.sh.y, 0, 1);
      const x = M.clamp((px - ob.ox - ob.sh.x * frac) / ob.sc, ob.tx0, ob.tx1);
      return { face: 'wide', x, z: frac * zWide };
    }
    if (M.pointInPolygon(px, py, ob.front)) {
      return { face: 'narrow', x: M.clamp((px - ob.ox) / ob.sc, ob.tx0, ob.tx1), z: M.clamp((py - ob.oy) / ob.sc, 0, ob.T) };
    }
    if (py < ob.oy) {
      const frac = M.clamp((py - ob.oy) / ob.sh.y, 0, 1);
      return { face: 'wide', x: M.clamp((px - ob.ox - ob.sh.x * frac) / ob.sc, ob.tx0, ob.tx1), z: frac * zWide };
    }
    return { face: 'narrow', x: M.clamp((px - ob.ox) / ob.sc, ob.tx0, ob.tx1), z: M.clamp((py - ob.oy) / ob.sc, 0, ob.T) };
  }

  function drawCable(ctx, from, dx, dy) {
    ctx.save();
    ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(from.x, from.y);
    ctx.bezierCurveTo(from.x + dx * 0.2, from.y + dy * 0.9, from.x + dx * 0.6, from.y + dy * 0.6, from.x + dx, from.y + dy);
    ctx.stroke();
    ctx.restore();
  }

  function drawObliqueProbe(ctx, ob, st, pos) {
    const isZero = (st.probe.angle || 0) === 0;
    // probe dimensions follow the block scale but are capped so a 24 mm shoe on the small V2 block
    // (scale up to 8 px/mm) stays a compact box like the original screens
    const sc = Math.min(ob.sc, 3);
    if (pos.face === 'wide') {
      const B = bandPoint(ob, pos.x, M.clamp(pos.z / ob.depth, 0.05, 0.95));
      if (isZero) {
        const r = 10 * sc, h = 14 * sc, ry = r * 0.45;
        ctx.save();
        ctx.fillStyle = '#d000d0'; ctx.strokeStyle = '#500050'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(B.x - r, B.y); ctx.lineTo(B.x - r, B.y - h); ctx.lineTo(B.x + r, B.y - h); ctx.lineTo(B.x + r, B.y); ctx.ellipse(B.x, B.y, r, ry, 0, 0, Math.PI); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ff40ff';
        ctx.beginPath(); ctx.ellipse(B.x, B.y - h, r, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.restore();
        drawCable(ctx, { x: B.x, y: B.y - h }, 140, -50);
      } else {
        const w = 24 * sc, h = 14 * sc;
        const dv = { x: ob.sh.x * (10 / ob.depth), y: ob.sh.y * (10 / ob.depth) };
        const fr = [{ x: B.x - w / 2, y: B.y }, { x: B.x + w / 2, y: B.y }, { x: B.x + w / 2, y: B.y - h }, { x: B.x - w / 2, y: B.y - h }];
        const poly = function (pts, fill) { ctx.beginPath(); pts.forEach(function (p, i) { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.stroke(); };
        ctx.save();
        ctx.strokeStyle = '#0a1a60'; ctx.lineWidth = 1;
        poly([fr[1], fr[2], { x: fr[2].x + dv.x, y: fr[2].y + dv.y }, { x: fr[1].x + dv.x, y: fr[1].y + dv.y }], '#0d2a99');
        poly([fr[3], fr[2], { x: fr[2].x + dv.x, y: fr[2].y + dv.y }, { x: fr[3].x + dv.x, y: fr[3].y + dv.y }], '#4a6fff');
        poly(fr, '#1a3fd6');
        ctx.restore();
        drawCable(ctx, { x: B.x + dv.x * 0.5, y: B.y - h + dv.y * 0.5 }, 150, -48);
      }
    } else {
      const c = { x: ob.ox + pos.x * sc, y: ob.oy + pos.z * sc };
      if (isZero) {
        const r = 10 * sc;
        const off = { x: 0.45 * r, y: -0.3 * r };
        ctx.save();
        ctx.strokeStyle = '#500050'; ctx.lineWidth = 1;
        ctx.fillStyle = '#b000b0';
        ctx.beginPath(); ctx.arc(c.x + off.x, c.y + off.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        // body between the two discs
        const a = Math.atan2(off.y, off.x) + Math.PI / 2;
        ctx.fillStyle = '#c800c8';
        ctx.beginPath();
        ctx.moveTo(c.x + r * Math.cos(a), c.y + r * Math.sin(a));
        ctx.lineTo(c.x + off.x + r * Math.cos(a), c.y + off.y + r * Math.sin(a));
        ctx.lineTo(c.x + off.x - r * Math.cos(a), c.y + off.y - r * Math.sin(a));
        ctx.lineTo(c.x - r * Math.cos(a), c.y - r * Math.sin(a));
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ff00ff';
        ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.restore();
        drawCable(ctx, { x: c.x + off.x, y: c.y + off.y - r }, -60, -90);
      } else {
        const w = 24 * sc, h = 14 * sc;
        ctx.save();
        ctx.fillStyle = '#1a3fd6'; ctx.strokeStyle = '#0a1a60'; ctx.lineWidth = 1;
        ctx.fillRect(c.x - w / 2, c.y - h / 2, w, h); ctx.strokeRect(c.x - w / 2, c.y - h / 2, w, h);
        ctx.fillStyle = '#4a6fff'; ctx.fillRect(c.x - w / 2, c.y - h / 2, w, h * 0.28);
        ctx.restore();
        drawCable(ctx, { x: c.x + w * 0.3, y: c.y - h / 2 }, 90, -80);
      }
    }
  }

  function drawOblique(ctx, frame, st, W, H) {
    const sp = st.specimen;
    ctx.fillStyle = COL.cream; ctx.fillRect(0, 0, W, H);
    const wide = wideSpecFor(st);
    const depth = narrowDepthFor(st);
    const ob = computeOblique(wide, depth, W, H);
    S.ob = ob;
    const sc = ob.sc;
    const F = function (x, y) { return { x: ob.ox + x * sc, y: ob.oy + y * sc }; };
    ctx.save();
    ctx.lineJoin = 'round';
    // right side face (vertical right end edge, if any)
    const ex = wide.extents;
    const rightEdge = wide.edges.find(function (e) { return Math.abs(e.a.x - ex.xMax) < 1e-6 && Math.abs(e.b.x - ex.xMax) < 1e-6; });
    if (rightEdge) {
      const a = F(rightEdge.a.x, rightEdge.a.y), b = F(rightEdge.b.x, rightEdge.b.y);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(b.x + ob.sh.x, b.y + ob.sh.y); ctx.lineTo(a.x + ob.sh.x, a.y + ob.sh.y); ctx.closePath();
      ctx.fillStyle = '#6a6a6a'; ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    // top band
    ctx.beginPath(); ob.band.forEach(function (p, i) { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }); ctx.closePath();
    ctx.fillStyle = '#a9a9a9'; ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke();
    // front face
    ctx.beginPath(); ob.front.forEach(function (p, i) { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }); ctx.closePath();
    ctx.fillStyle = COL.steel; ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke();
    // Perspex insert + hole
    if (wide.perspex) { const p = F(wide.perspex.x, wide.perspex.y); ctx.beginPath(); ctx.arc(p.x, p.y, wide.perspex.r * sc, 0, Math.PI * 2); ctx.fillStyle = '#d8d8d8'; ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke(); }
    for (const h of wide.holes || []) { const p = F(h.x, h.y); ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(h.r * sc, 3), 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke(); }
    // narrow-face hole (V2 5 mm hole) shown on the front face when the physics face is narrow
    if (sp.face === 'narrow') for (const h of sp.holes || []) { const p = F(h.x, h.y); ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(h.r * sc, 3), 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke(); }
    // V1 slot notch on the front face at the arc centre
    if (wide.retroSlot) {
      const sl = wide.slot || { x: 100, w: 2, d: 5 };
      const a = F(sl.x - sl.w / 2, 0), b = F(sl.x + sl.w / 2, sl.d);
      ctx.fillStyle = COL.cream; ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a.x, b.y); ctx.lineTo(b.x, b.y); ctx.lineTo(b.x, a.y); ctx.stroke();
      // index tick + '0' on the top band
      const t0 = bandPoint(ob, sl.x, 0), t1 = bandPoint(ob, sl.x, 1);
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(t0.x, t0.y); ctx.lineTo(t1.x, t1.y); ctx.stroke();
      ctx.fillStyle = '#000'; ctx.font = 'bold 13px "Segoe UI", Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText('0', t1.x, t1.y - 3);
    } else {
      const ix = wide.id === 'v2' ? 60 : 100;
      const t0 = bandPoint(ob, ix, 0), t1 = bandPoint(ob, ix, 1);
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(t0.x, t0.y); ctx.lineTo(t1.x, t1.y); ctx.stroke();
      ctx.fillStyle = '#000'; ctx.font = 'bold 13px "Segoe UI", Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText('0', t1.x, t1.y - 3);
    }
    // labels on the front face
    ctx.fillStyle = '#000'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const l of wide.labels || []) {
      if (!l || !l.text || l.text === '0') continue;
      ctx.font = l.big ? 'bold 28px "Segoe UI", Arial, sans-serif' : (l.small ? FONT_SMALL : FONT);
      const p = F(l.x, l.y); ctx.fillText(l.text, p.x, p.y);
    }
    // caption
    ctx.font = '20px "Segoe UI", Arial, sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    const cap = 'Carbon Steel Block';
    const tw = ctx.measureText(cap).width;
    ctx.fillStyle = '#dcdcdc'; ctx.fillRect(W - 24 - tw - 8, 10, tw + 16, 28);
    ctx.fillStyle = '#000'; ctx.fillText(cap, W - 24, 14);
    ctx.restore();
    // probe (ghost position while dragging across faces)
    const pos = S.ghost || { face: sp.face === 'narrow' ? 'narrow' : 'wide', x: st.probe.x, z: st.probe.z };
    drawObliqueProbe(ctx, ob, st, pos);
  }

  // ------------------------------------------------------------------ public draw
  /**
   * Draw the cross-section from a frame and the state. Tolerates null frame parts / specimen.
   * @param {object} frame UT.frame
   * @param {object} st UT.state
   */
  function draw(frame, st) {
    const cv = S.canvas;
    if (!cv) return;
    S.lastFrame = frame;
    const ctx = UT.dom.fitCanvas(cv);
    const W = cssW(cv), H = cssH(cv);
    ctx.save();
    try {
      if (isOblique(st)) { drawOblique(ctx, frame, st, W, H); }
      else { S.ob = null; ensureTransform(st); drawNormal(ctx, frame, st, W, H); }
    } finally { ctx.restore(); }
    try { cv.classList.toggle('finger', !!(st.damping && st.damping.tool) && !brushActive(st) && !isOblique(st)); } catch (e) { /* headless */ }
  }

  /** Draw the X ruler (cv-ruler) with the shared scale; unsigned labels for centred specimens. */
  function drawRuler(st) {
    const cv = S.ruler;
    if (!cv) return;
    const ctx = UT.dom.fitCanvas(cv);
    const W = cssW(cv), H = cssH(cv);
    ctx.save();
    ctx.fillStyle = COL.cream; ctx.fillRect(0, 0, W, H);
    const sp = st && st.specimen;
    if (!sp || isOblique(st)) { ctx.restore(); return; }
    const xf = S.canvas ? (S.xf || ensureTransform(st)) : computeTransform(sp, W, H, ttBottomMm(st));
    const unsigned = sp.extents.xMin < 0;
    const mmAt = function (px) { return (px - xf.ox) / xf.scale; };
    // Tick every 2 mm / label every 10 mm at the normal scale; coarser steps when the mm are tiny
    // on screen so the loop count stays bounded by the canvas width (§14.1, §15.11).
    const step = rulerStep(2, xf.scale, 3);
    const labelStep = rulerStep(10, xf.scale, 16, step);
    const x0 = Math.ceil(mmAt(0) / step) * step, x1 = Math.floor(mmAt(W) / step) * step;
    ctx.strokeStyle = COL.ruler; ctx.fillStyle = COL.ruler; ctx.lineWidth = 1;
    ctx.font = FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    const base = 1;
    ctx.beginPath(); ctx.moveTo(0, base + 0.5); ctx.lineTo(W, base + 0.5); ctx.stroke();
    if (!((x1 - x0) / step <= 5000)) { ctx.restore(); return; }
    for (let x = x0; x <= x1; x += step) {
      const px = Math.round(xf.ox + x * xf.scale) + 0.5;
      const ten = Math.abs(x) % labelStep === 0;
      const len = ten ? 11 : 5;
      ctx.beginPath(); ctx.moveTo(px, base); ctx.lineTo(px, base + len); ctx.stroke();
      if (ten) ctx.fillText(String(unsigned ? Math.abs(x) : x), px, H - 4);
    }
    // blue probe marker (on the web face: the web centre)
    const onWeb = st.probe.surface === 'web' && sp.weld && sp.weld.web;
    const markX = onWeb ? (st.probe.side === -1 ? -1 : 1) * sp.weld.webT / 2 : (st.probe.x || 0);
    const pxp = xf.ox + markX * xf.scale;
    ctx.fillStyle = '#0000ff';
    ctx.fillRect(pxp - 1.5, 0, 3, 12);
    ctx.restore();
  }

  // ------------------------------------------------------------------ interaction
  function clampX(sp, x) {
    const ss = sp && sp.scanSurface ? sp.scanSurface : { xMin: -150, xMax: 150 };
    return M.clamp(x, ss.xMin, ss.xMax);
  }
  function clampZ(sp, z) {
    const L = (sp && sp.L) || 300;
    if (sp && sp.pipe) { let w = z % L; if (w < 0) w += L; return w; }
    return M.clamp(z, 0, L);
  }
  function brushActive(st) { return !!((st.editing && st.editing.defect) || S.brush.on); }
  function brushPx(st) {
    const e = st.editing || {};
    return e.brushPx || e.brushSize || S.brush.px || 26;
  }

  function setCursorMm(mm, view) {
    const cur = state().cursor || {};
    if (mm === null) { if (cur.view === 'cross' || cur.x !== null) UT.set({ cursor: Object.assign({}, cur, { x: null, y: null, view: null }) }, { noRender: true }); S.hoverMm = null; return; }
    if (S.hoverMm && Math.abs(S.hoverMm.x - mm.x) < 0.05 && Math.abs(S.hoverMm.y - mm.y) < 0.05) return;
    S.hoverMm = mm;
    UT.set({ cursor: Object.assign({}, cur, { x: +mm.x.toFixed(1), y: +mm.y.toFixed(1), view: view || 'cross' }) }, { noRender: true });
  }

  function defectAt(st, mm, tol) {
    const tl = tol || 3;
    let best = null, bestD = tl;
    for (const d of st.defects || []) {
      if (!d || !d.pts || d.pts.length < 2) continue;
      if (!isPlanarType(d.type) && M.pointInPolygon(mm.x, mm.y, d.pts)) return d;
      for (let i = 0; i < d.pts.length - 1; i++) {
        const r = M.pointSegment(mm.x, mm.y, d.pts[i].x, d.pts[i].y, d.pts[i + 1].x, d.pts[i + 1].y);
        if (r.d < bestD) { bestD = r.d; best = d; }
      }
    }
    return best;
  }

  function moveProbeTo(st, mm, shiftZ, dragRef) {
    const sp = st.specimen;
    if (!sp) return;
    const probe = st.probe;
    if (shiftZ && dragRef) {
      const z = clampZ(sp, dragRef.z0 + (mm.y - dragRef.y0));
      if (Math.abs(z - probe.z) > 1e-6) UT.setIn('probe', { z: +z.toFixed(1) });
      return;
    }
    let x;
    if (sp.tky && probe.surface === 'brace') {
      const ss = emissionAt(sp, { x: 0, surface: 'brace' });
      x = M.clamp((mm.x - ss.x) * ss.tangent.x + (mm.y - ss.y) * ss.tangent.y, 0, Math.max(10, (sp.tky.braceLen || 90) - 30));
    } else if (probe.surface === 'web' && sp.weld && sp.weld.web) {
      const pk = webPick(sp, { x: (probe.side === -1 ? -1 : 1) * sp.weld.webT / 2, y: mm.y }, 0);
      x = pk && pk.surface === 'web' ? pk.x : 0;
    } else {
      x = clampX(sp, mm.x);
    }
    x = +x.toFixed(1);
    if (Math.abs(x - probe.x) > 1e-6) UT.setIn('probe', { x });
  }

  function endStroke(st) {
    const s = S.stroke;
    S.stroke = null;
    if (!s || !s.pts.length) { UT.requestRender(); return; }
    let pts = s.pts;
    if (pts.length === 1) pts = [pts[0], { x: pts[0].x + 0.5, y: pts[0].y }];
    const brushMm = brushPx(st) / 2 / (S.xf ? S.xf.scale : 4);
    if (!s.erase && !s.planar) pts = dilate(pts, brushMm);
    else pts = UT.specimens.decimate(pts, 1);
    UT.bus.emit('defect:brush', { pts, erase: !!s.erase, brushMm: +brushMm.toFixed(2) });
    UT.requestRender();
  }

  /** Emit the 'ui' probe-drag event (once per gesture; SPEC-v2 §4.1). */
  function emitProbeDrag(id) {
    S.uiEvents++;
    try { UT.bus.emit('ui', { kind: 'probe-drag', id: id || 'cv-cross' }); } catch (e) { /* bus logs */ }
  }

  /** Finger tool press: toggle a damper at mm.x (returns true when handled). */
  function fingerPress(st, mm) {
    const sp = st.specimen;
    if (!sp || !onSurfaceBand(sp, mm)) return false;
    const tol = hitTolMm(DAMPER_TOL_MM);
    const r = toggleDamperList(st.damping && st.damping.points, mm.x, tol, MAX_DAMPERS);
    if (r.action === 'full') { UT.requestRender(); return true; }
    UT.setIn('damping', { points: r.points });
    return true;
  }

  function capture(cv, ev) {
    S.pointerId = ev.pointerId === undefined ? null : ev.pointerId;
    try { if (cv.setPointerCapture && ev.pointerId !== undefined) cv.setPointerCapture(ev.pointerId); } catch (e) { /* synthetic / unsupported */ }
  }
  function release(cv) {
    try { if (cv && cv.releasePointerCapture && S.pointerId !== null) cv.releasePointerCapture(S.pointerId); } catch (e) { /* ignore */ }
    S.pointerId = null;
  }
  function samePointer(ev) { return S.pointerId === null || ev.pointerId === undefined || ev.pointerId === S.pointerId; }

  function onPointerDown(ev) {
    if (ev.isPrimary === false) return;
    const st = state();
    const cv = S.canvas;
    const p = UT.dom.localPos(ev, cv);
    const button = ev.button === undefined ? 0 : ev.button;
    if (button !== 0 && button !== 2) return;
    if (S.drag) return;   // a gesture is already running (second pointer)
    if (brushActive(st)) {
      if (!st.specimen) return;
      const mm = toMm(p.x, p.y);
      const type = (st.editing && st.editing.brush) || 'planar';
      S.stroke = { pts: [mm], erase: button === 2, planar: isPlanarType(type) };
      S.drag = { kind: 'brush' };
      capture(cv, ev);
      ev.preventDefault();
      UT.requestRender();
      return;
    }
    if (button !== 0) return;
    if (!st.specimen) return;
    if (isOblique(st) && S.ob) {
      const pick = obliquePick(S.ob, p.x, p.y);
      S.drag = { kind: 'oblique', face: st.specimen.face === 'narrow' ? 'narrow' : 'wide' };
      capture(cv, ev);
      applyObliquePick(st, pick);
      ev.preventDefault();
      return;
    }
    const mm = toMm(p.x, p.y);
    // finger damping tool (P3)
    if (st.damping && st.damping.tool && fingerPress(st, mm)) {
      S.drag = { kind: 'damper' };
      capture(cv, ev);
      ev.preventDefault();
      return;
    }
    // web face of a set-on T-joint / nozzle: decide the scanning surface for this gesture (F1)
    const wp = webPick(st.specimen, mm, hitTolMm(3));
    if (wp && !ev.shiftKey) {
      const probe = st.probe;
      if (wp.surface === 'web' && (probe.surface !== 'web' || probe.side !== wp.side)) UT.setIn('probe', { surface: 'web', side: wp.side, x: wp.x });
      else if (wp.surface === 'chord' && probe.surface === 'web') UT.setIn('probe', { surface: 'chord', x: +clampX(st.specimen, mm.x).toFixed(1) });
    }
    S.drag = { kind: 'probe', x0: mm.x, y0: mm.y, z0: st.probe.z, shift: !!ev.shiftKey };
    capture(cv, ev);
    if (!ev.shiftKey) moveProbeTo(state(), mm, false, null);
    cv.classList.add('probe-drag');
    ev.preventDefault();
  }

  function applyObliquePick(st, pick) {
    const cur = st.specimen.face === 'narrow' ? 'narrow' : 'wide';
    S.ghost = pick;
    if (pick.face === cur) {
      const x = +pick.x.toFixed(1), z = +pick.z.toFixed(1);
      if (Math.abs(x - st.probe.x) > 1e-6 || Math.abs(z - st.probe.z) > 1e-6) UT.setIn('probe', { x, z });
      else UT.requestRender();
    } else UT.requestRender();
  }

  function onPointerMove(ev) {
    const st = state();
    const cv = S.canvas;
    if (!cv) return;
    const d = S.drag;
    if (d && !samePointer(ev)) return;
    if (!d && ev.isPrimary === false) return;
    const p = UT.dom.localPos(ev, cv);
    if (d && d.kind === 'brush') {
      if (!S.stroke) return;
      const mm = toMm(p.x, p.y);
      const last = S.stroke.pts[S.stroke.pts.length - 1];
      if (M.dist(last.x, last.y, mm.x, mm.y) >= 0.3) { S.stroke.pts.push(mm); UT.requestRender(); }
      setCursorMm(mm);
      return;
    }
    if (d && d.kind === 'oblique') {
      if (!S.ob || !st.specimen) return;
      applyObliquePick(st, obliquePick(S.ob, p.x, p.y));
      return;
    }
    if (d && d.kind === 'damper') return;
    const mm = toMm(p.x, p.y);
    if (d && d.kind === 'probe') {
      moveProbeTo(st, mm, d.shift || ev.shiftKey, d);
    }
    setCursorMm(mm);
  }

  function onPointerUp(ev) {
    const st = state();
    const d = S.drag;
    if (!d) return;
    if (ev && !samePointer(ev)) return;
    S.drag = null;
    release(S.canvas);
    if (S.canvas) S.canvas.classList.remove('probe-drag');
    if (d.kind === 'brush') { endStroke(st); return; }
    if (d.kind === 'damper') return;
    if (d.kind === 'oblique') {
      const g = S.ghost;
      S.ghost = null;
      if (g && st.specimen && g.face !== (st.specimen.face === 'narrow' ? 'narrow' : 'wide')) {
        if (UT.modes && typeof UT.modes.setFace === 'function') {
          try { UT.modes.setFace(g.face); } catch (e) { console.error('[cross] setFace', e); }
        }
        UT.setIn('probe', { x: +g.x.toFixed(1), z: +g.z.toFixed(1) });
      } else UT.requestRender();
    }
    emitProbeDrag('cv-cross');
  }

  function onWheel(ev) {
    const st = state();
    const g = st.instrument.gain;
    const ng = M.clamp(g + (ev.deltaY < 0 ? 1 : -1), 0, 110);
    if (ng !== g) UT.setIn('instrument', { gain: ng });
    ev.preventDefault();
  }

  function onDblClick(ev) {
    const st = state();
    if (!st.specimen || isOblique(st)) return;
    const p = UT.dom.localPos(ev, S.canvas);
    const d = defectAt(st, toMm(p.x, p.y), hitTolMm(3));
    if (d) UT.set({ selectedDefect: Math.max(0, (d.n || 1) - 1) });
  }

  /**
   * Initialise the cross-section canvas: pointer handlers + 'render' subscription.
   * @param {HTMLCanvasElement} canvas the #cv-cross canvas
   */
  function init(canvas) {
    S.canvas = canvas;
    UT.dom.injectCss('view-cross', cross.css);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('pointerleave', function (ev) { if (!S.drag && ev.isPrimary !== false) setCursorMm(null); });
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('dblclick', onDblClick);
    canvas.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });
    // safety net when capture is unavailable (synthetic pointers): finish the gesture on a window-level up
    window.addEventListener('pointerup', function (ev) { if (S.drag) onPointerUp(ev); });
    window.addEventListener('pointercancel', function (ev) { if (S.drag) onPointerUp(ev); });
    UT.bus.on('render', function (frame) { draw(frame, UT.state); });
    UT.bus.on('state', function (e) { if (e && e.keys && e.keys.indexOf('specimen') >= 0) { S.ob = null; S.xf = null; } });
  }

  /**
   * Initialise the X ruler canvas (#cv-ruler): press/drag moves the probe (Pointer Events); drawn on every 'render'.
   * @param {HTMLCanvasElement} canvas
   */
  function initRuler(canvas) {
    S.ruler = canvas;
    UT.dom.injectCss('view-cross', cross.css);
    let down = null;
    const move = function (ev) {
      const st = state();
      if (!st.specimen || isOblique(st)) return;
      const p = UT.dom.localPos(ev, canvas);
      const xf = S.xf || ensureTransform(st);
      if (st.probe.surface === 'web') UT.setIn('probe', { surface: 'chord' });
      moveProbeTo(state(), { x: (p.x - xf.ox) / xf.scale, y: 0 }, false, null);
    };
    const end = function (ev) {
      if (down === null || (ev && ev.pointerId !== undefined && ev.pointerId !== down)) return;
      down = null;
      try { canvas.releasePointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
      emitProbeDrag('cv-ruler');
    };
    canvas.addEventListener('pointerdown', function (ev) {
      if (ev.isPrimary === false || (ev.button !== undefined && ev.button !== 0)) return;
      if (brushActive(state()) || down !== null) return;
      down = ev.pointerId === undefined ? -1 : ev.pointerId;
      try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
      move(ev); ev.preventDefault();
    });
    canvas.addEventListener('pointermove', function (ev) { if (down !== null && (ev.pointerId === undefined || ev.pointerId === down || down === -1)) move(ev); });
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    window.addEventListener('pointerup', function (ev) { if (down !== null) end(ev); });
    UT.bus.on('render', function () { drawRuler(UT.state); });
  }

  /**
   * Enable/disable the defect brush explicitly (the editor state `editing.defect` also enables it).
   * @param {boolean} on
   * @param {number} [px] brush diameter in CSS px (10–60)
   */
  function setBrush(on, px) {
    S.brush.on = !!on;
    if (typeof px === 'number' && px > 0) S.brush.px = M.clamp(px, 4, 120);
    if (!on) S.stroke = null;
    if (S.canvas) S.canvas.classList.toggle('brush', !!on);
    UT.requestRender();
  }

  /**
   * Move the probe to x (mm from the weld centre / block datum) with ONE synthetic pointer gesture
   * (pointerdown → pointermove → pointerup on #cv-cross, scale-aware) through the real handlers, so
   * exactly one 'ui' {kind:'probe-drag'} event is emitted. `z` (optional) is applied afterwards.
   * Headless / not laid out: moves the probe directly and still emits once.
   * @param {number} x target probe x (mm)
   * @param {{z?: number}} [opts]
   * @returns {number} the resulting state.probe.x
   */
  function dragTo(x, opts) {
    const o = opts || {};
    const st = state();
    const sp = st.specimen;
    const cv = S.canvas;
    const target = Number.isFinite(+x) ? +x : st.probe.x;
    const zTarget = Number.isFinite(+o.z) ? +o.z : null;
    let done = false;
    if (cv && sp && typeof PointerEvent === 'function' && typeof cv.dispatchEvent === 'function' && !brushActive(st)) {
      try {
        const rect = cv.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const k = UT.dom.scale ? UT.dom.scale() : 1;
          const y = isOblique(st) ? null : -4;
          let p0, p1;
          if (isOblique(st) && S.ob) {
            const face = sp.face === 'narrow' ? 'narrow' : 'wide';
            const zz = zTarget === null ? st.probe.z : zTarget;
            p0 = face === 'wide' ? bandPoint(S.ob, st.probe.x, M.clamp(st.probe.z / S.ob.depth, 0.05, 0.95)) : { x: S.ob.ox + st.probe.x * S.ob.sc, y: S.ob.oy + st.probe.z * S.ob.sc };
            p1 = face === 'wide' ? bandPoint(S.ob, target, M.clamp(zz / S.ob.depth, 0.05, 0.95)) : { x: S.ob.ox + target * S.ob.sc, y: S.ob.oy + zz * S.ob.sc };
          } else {
            const surfY = st.probe.surface === 'web' ? emissionAt(sp, st.probe).y : y;
            p0 = toPx(st.probe.surface === 'web' ? st.probe.x : st.probe.x, surfY);
            if (st.probe.surface === 'web') { const E0 = emissionAt(sp, st.probe); p0 = toPx(E0.x, E0.y); }
            p1 = toPx(target, y);
          }
          const mk = function (type, p) {
            return new PointerEvent(type, { bubbles: true, cancelable: true, clientX: rect.left + p.x * k, clientY: rect.top + p.y * k, button: 0, buttons: type === 'pointerup' ? 0 : 1, pointerId: 9001, pointerType: 'mouse', isPrimary: true });
          };
          cv.dispatchEvent(mk('pointerdown', p0));
          const steps = 4;
          for (let i = 1; i <= steps; i++) cv.dispatchEvent(mk('pointermove', { x: p0.x + (p1.x - p0.x) * i / steps, y: p0.y + (p1.y - p0.y) * i / steps }));
          cv.dispatchEvent(mk('pointerup', p1));
          done = !S.drag;
        }
      } catch (e) { console.error('[cross] dragTo', e); done = false; }
    }
    if (!done) {
      S.drag = null; release(cv);
      if (sp) {
        if (isOblique(st)) UT.setIn('probe', { x: +M.clamp(target, sp.scanSurface.xMin, sp.scanSurface.xMax).toFixed(1) });
        else moveProbeTo(st, { x: target, y: 0 }, false, null);
      }
      emitProbeDrag('cv-cross');
    }
    if (zTarget !== null && !isOblique(st)) { const z = +clampZ(sp, zTarget).toFixed(1); if (Math.abs(z - state().probe.z) > 1e-6) UT.setIn('probe', { z }); }
    if (typeof UT.renderNow === 'function') { try { UT.renderNow(); } catch (e) { /* physics missing */ } }
    return state().probe.x;
  }

  // ------------------------------------------------------------------ namespace
  const cross = {
    init, initRuler, draw, drawRuler, toPx, toMm, fit, setBrush, dragTo,
    transform() { return S.xf; },
    computeTransform, computeOblique, obliquePick, hull, dilate, surfaceTagAt, castDown,
    topByWeight, wavyPts, damperIndexAt, toggleDamperList, onSurfaceBand, webPick, paSectorPts,
    /** 'ui' probe-drag events emitted so far (diagnostics). */
    uiEventCount() { return S.uiEvents; },
    css: [
      '#cv-cross{display:block;cursor:crosshair;background:#fdfbd8;user-select:none;-webkit-user-select:none;touch-action:none}',
      '#cv-cross.probe-drag{cursor:ew-resize}',
      '#cv-cross.brush{cursor:cell}',
      '#cv-cross.finger{cursor:pointer}',
      '#cv-ruler{display:block;cursor:pointer;background:#fdfbd8;user-select:none;-webkit-user-select:none;touch-action:none}',
    ].join('\n'),
    __selftest() {
      const f = [];
      const sp = UT.specimens.plateWeld({ T: 20 });
      const xf = computeTransform(sp, 1280, 200);
      if (Math.abs(xf.scale - 4) > 1e-9) f.push('scale ' + xf.scale);
      if (Math.abs(xf.ox - 640) > 1e-9) f.push('weld centred on x=0: ox ' + xf.ox);
      if (Math.abs(xf.oy - 96) > 1e-9) f.push('v1 plate placement unchanged (24 mm above): oy ' + xf.oy);
      const px = { x: xf.ox + 40 * xf.scale, y: xf.oy + 10 * xf.scale };
      const mm = { x: (px.x - xf.ox) / xf.scale, y: (px.y - xf.oy) / xf.scale };
      if (Math.abs(mm.x - 40) > 1e-9 || Math.abs(mm.y - 10) > 1e-9) f.push('toPx/toMm roundtrip');
      const blk = UT.specimens.iow();
      const xb = computeTransform(blk, 1280, 200);
      if (Math.abs(xb.cx - 150) > 1e-9) f.push('block centred on extents centre: ' + xb.cx);
      if (surfaceTagAt(sp, 0, 20.0) !== 'root' && surfaceTagAt(sp, 100, 20) !== 'bottom') f.push('surfaceTagAt bottom');
      if (surfaceTagAt(sp, 50, 10) !== null) f.push('surfaceTagAt interior should be null');
      const v1 = UT.specimens.v1({ face: 'wide' });
      if (surfaceTagAt(v1, 100 + 100 * Math.cos(M.deg2rad(135)), 100 * Math.sin(M.deg2rad(135))) !== 'radius') f.push('surfaceTagAt arc');
      const h = hull([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }, { x: 2, y: 2 }]);
      if (h.length !== 4) f.push('hull ' + h.length);
      const blob = dilate([{ x: 0, y: 10 }, { x: 5, y: 12 }], 2);
      if (blob.length < 8 || blob.length > 40) f.push('dilate size ' + blob.length);
      const bb = UT.specimens.bbox(blob);
      if (bb.xMin > -1.9 || bb.xMax < 6.9) f.push('dilate extent');
      const lam = { type: 'lamination', pts: [{ x: 30, y: 8 }, { x: 60, y: 8 }] };
      if (Math.abs(castDown(sp, 40, [lam]) - 8) > 0.05) f.push('castDown lamination');
      if (Math.abs(castDown(sp, 100, [lam]) - 20) > 0.05) f.push('castDown backwall');
      const ob = computeOblique(v1, 25, 1280, 500);
      if (!(ob.sc > 3 && ob.sc < 4)) f.push('oblique scale ' + ob.sc);
      const pk = obliquePick(ob, ob.ox + 100 * ob.sc + ob.sh.x * 0.5, ob.oy + ob.sh.y * 0.5);
      if (pk.face !== 'wide' || Math.abs(pk.x - 100) > 0.01 || Math.abs(pk.z - 12.5) > 0.01) f.push('obliquePick band ' + JSON.stringify(pk));
      const pk2 = obliquePick(ob, ob.ox + 200 * ob.sc, ob.oy + 50 * ob.sc);
      if (pk2.face !== 'narrow' || Math.abs(pk2.x - 200) > 0.01 || Math.abs(pk2.z - 50) > 0.01) f.push('obliquePick front ' + JSON.stringify(pk2));
      // --- v2: fillet T-joint keeps the base plate inside a 200 px canvas (web clipped at the top)
      if (UT.specimens.plateWeld && UT.specimens.prepNames) {
        const ft = UT.specimens.plateWeld({ T: 20, prep: 'fillet-t' });
        const xt = computeTransform(ft, 1280, 200);
        if (!(xt.oy + 20 * xt.scale <= 200 - 4 * xt.scale + 1e-6)) f.push('fillet-t plate clipped: oy ' + xt.oy);
        if (!(xt.oy >= 16 * xt.scale)) f.push('fillet-t shoe room ' + xt.oy);
        const wp = webPick(ft, { x: 4, y: -30 }, 3);
        if (!wp || wp.surface !== 'web' || wp.side !== 1 || Math.abs(wp.x - (30 - ft.weld.leg)) > 0.11) f.push('webPick web ' + JSON.stringify(wp));
        const wl = webPick(ft, { x: -5, y: -20 }, 3);
        if (!wl || wl.side !== -1) f.push('webPick left face');
        if (!webPick(ft, { x: 40, y: 5 }, 3) || webPick(ft, { x: 40, y: 5 }, 3).surface !== 'chord') f.push('webPick plate');
        if (webPick(sp, { x: 0, y: -30 }, 3) !== null) f.push('webPick without web');
        const sw = UT.specimens.scanSurfaceAt(ft, { x: wp.x, surface: 'web', side: 1 });
        if (Math.abs(sw.y + 30) > 0.11) f.push('web emission roundtrip ' + sw.y);
        // backing bar / FBH specs build and expose what the drawing reads
        const bk = UT.specimens.plateWeld({ T: 20, prep: 'single-v-backing' });
        if (!bk.weld.backing || !bk.edges.some(function (e) { return e.tag === 'backing'; })) f.push('backing spec fields');
        if (UT.specimens.fbhBlock) { const fb = UT.specimens.fbhBlock(); if (!fb.fbhs || fb.fbhs.length !== 5 || computeTransform(fb, 1280, 200).scale !== 4) f.push('fbh spec'); if (Math.abs(castDown(fb, 110, []) - 30) > 0.05 || Math.abs(castDown(fb, 130, []) - 60) > 0.05) f.push('castDown fbh ' + castDown(fb, 110, [])); }
      }
      // --- v2: pure helpers
      const top = topByWeight([{ mode: 'L', weight: 0.1, pts: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }, { mode: 'S', weight: 0.5, pts: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }, { mode: 'S', pts: [{ x: 0, y: 0 }] }, null], 1);
      if (top.length !== 1 || top[0].mode !== 'S') f.push('topByWeight');
      if (topByWeight(new Array(60).fill({ weight: 1, pts: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }), MAX_CONVERTED).length !== 40) f.push('topByWeight cap');
      const wv = wavyPts([{ x: 0, y: 0 }, { x: 80, y: 0 }], 2, 8);
      if (wv.length < 40 || wv.some(function (p) { return Math.abs(p.y) > 2.001; }) || !wv.some(function (p) { return Math.abs(p.y) > 1.5; })) f.push('wavyPts ' + wv.length);
      if (wavyPts([{ x: 0, y: 0 }], 2, 8).length !== 0) f.push('wavyPts single point');
      let dl = toggleDamperList([], 20, 4, 3);
      if (dl.action !== 'add' || dl.points[0] !== 20) f.push('damper add');
      dl = toggleDamperList(dl.points, 22, 4, 3);
      if (dl.action !== 'remove' || dl.points.length !== 0) f.push('damper remove within tol');
      dl = toggleDamperList([10, 20, 30], 50, 4, 3);
      if (dl.action !== 'full' || dl.points.length !== 3) f.push('damper max 3');
      if (damperIndexAt([{ x: 5 }, 9], 8.5, 4) !== 1) f.push('damperIndexAt objects');
      if (!onSurfaceBand(sp, { x: 40, y: -5 }) || onSurfaceBand(sp, { x: 40, y: 12 }) || onSurfaceBand(sp, { x: 400, y: 0 })) f.push('onSurfaceBand');
      const sec = paSectorPts({ x: 40, y: 0 }, 1, 40, 70, 20, 6);
      if (sec.length !== 8 || sec[0].x !== 40 || !(sec[1].x < 40) || Math.abs(sec[1].y - 20) > 1e-9 || !(sec[7].x < sec[1].x)) f.push('paSectorPts ' + JSON.stringify(sec[1]));
      if (typeof dragTo !== 'function' || typeof cross.uiEventCount !== 'function') f.push('dragTo export');
      return f;
    },
  };
  UT.views.cross = cross;
})(window.UT = window.UT || {});
