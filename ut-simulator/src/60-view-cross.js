/* 60-view-cross.js — cross-section canvas (cv-cross) + X ruler (cv-ruler): specimen, weld outlines,
 * holes/Perspex, defects, beam fan, probe shoe(s), depth ruler, labels; probe drag, defect brush,
 * hover cursor, wheel gain; V1/V2 oblique block screens (SPEC §7.5, §14.1, §14.8, §15.6).
 */
(function (UT) {
  'use strict';

  // SPEC NOTES (decisions where the spec is silent or ambiguous)
  // - Horizontal centring: the specimen is centred on x = 0 whenever its extents start left of 0
  //   (welds, TKY, lamination plate), otherwise on the extents centre (blocks 0…300). Ruler labels are
  //   unsigned |x| for those centred specimens and the raw block x otherwise.
  // - Vertical placement: y = 0 (scan surface) is placed 20–24 mm (× scale) below the canvas top so the
  //   shoe fits above the plate; taller specimens (TKY brace) push it down; no refit, clipping applies.
  // - Beam legs of fan/edge polylines are counted by testing each vertex against the outline/arcs
  //   (a vertex on an outline edge or arc starts a new leg); vertices carrying `.leg` are honoured.
  //   Only the first display.skips legs are drawn, as in §14.1.
  // - 0° ladder: parallel dotted lines every ~1 mm across the crystal diameter, each cast straight
  //   down to the first outline edge or planar defect below it (so laminations shadow the backwall).
  // - TOFD with no tracer rays: a synthetic centre + ±20 dB fan is drawn from each index point to
  //   the backwall (leg 1). TOFD probe positions come from UT.tofd.probePositions(state) when present
  //   (array [tx, rx] or {tx, rx}, each {x, side}); fallback tx = probe.x + pcs/2 (side +1), rx mirrored.
  // - Brush: left-drag collects mm points; on mouseup emits 'defect:brush' {pts, erase:false, brushMm}.
  //   For volumetric brush types (state.editing.brush not planar) the stroke is dilated by the brush
  //   radius and its convex hull is sent as pts, so the resulting polygon is a filled blob like UTman's
  //   dabs. Planar strokes send the raw (decimated) polyline. Right-drag emits {pts, erase:true}.
  //   Brush size (px) comes from setBrush(on, px) or state.editing.brushPx / brushSize; default 26.
  // - Probe drag: left mousedown anywhere on the canvas (not editing) jumps the probe x to the mouse and
  //   drags it (clamped to the scan surface); Shift-drag changes z by vertical mouse movement
  //   (1 mm per mm of scale). Double-click on a defect sets selectedDefect = n − 1.
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

  const S = {
    canvas: null, ruler: null,
    xf: null,                        // {scale, ox, oy, W, H, cx}
    ob: null,                        // oblique layout cache {sc, ox, oy, sh, band, spec, depth, W, H}
    obSpecs: {},                     // cached wide specimens for the oblique drawing
    lastFrame: null,
    drag: null,                      // probe drag {kind, ...}
    stroke: null,                    // brush stroke {pts:[{x,y}], erase}
    brush: { on: false, px: 26 },
    ghost: null,                     // oblique drag ghost {face, x, z}
    hoverMm: null,
  };

  // ------------------------------------------------------------------ helpers
  function state() { return UT.state; }
  function spec() { return UT.state && UT.state.specimen; }
  function isPlanarType(t) { return UT.specimens && UT.specimens.isPlanar ? UT.specimens.isPlanar(t) : (t === 'planar' || t === 'crack' || t === 'lof' || t === 'lamination' || t === 'root'); }
  function isOblique(st) {
    return !!(st && (st.mode === 'v1' || st.mode === 'v2') && st.specimen && (st.specimen.id === 'v1' || st.specimen.id === 'v2'));
  }
  function derivedOf(frame, st) {
    if (frame && frame.derived) return frame.derived;
    try { return UT.probe.derive(st.probe, st.specimen); } catch (e) { return null; }
  }
  function cssW(cv) { return cv.clientWidth || cv.width || 300; }
  function cssH(cv) { return cv.clientHeight || cv.height || 150; }

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
    const above = Math.max(roomAbove, -yMin + 6);
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
    const pre = UT.probe && UT.probe.presets ? UT.probe.presets[st.probe.angle] : null;
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

  function P(ctx, pt) { const p = toPx(pt.x, pt.y); return p; }
  function polyPath(ctx, pts, close) {
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) { const p = toPx(pts[i].x, pts[i].y); if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }
    if (close) ctx.closePath();
  }

  /** Tag of the outline edge/arc a point lies on (within tol mm), or null. */
  function surfaceTagAt(sp, x, y, tol) {
    const t = tol === undefined ? 0.05 : tol;
    for (const e of sp.edges || []) {
      if (x < Math.min(e.a.x, e.b.x) - t || x > Math.max(e.a.x, e.b.x) + t || y < Math.min(e.a.y, e.b.y) - t || y > Math.max(e.a.y, e.b.y) + t) continue;
      if (M.pointSegment(x, y, e.a.x, e.a.y, e.b.x, e.b.y).d < t) return e.tag || 'end';
    }
    for (const a of sp.arcs || []) if (Math.abs(M.dist(x, y, a.cx, a.cy) - a.r) < t) return a.tag || 'radius';
    return null;
  }

  function polylinePts(r) {
    if (!r) return null;
    if (Array.isArray(r)) return r.length && r[0] && Array.isArray(r[0].pts) ? null : r;
    if (Array.isArray(r.pts)) return r.pts;
    return null;
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
        const a = toPx(f.a.x, f.a.y), b = toPx(f.b.x, f.b.y);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      const bulge = function (pts) {
        if (!pts || pts.length < 2) return;
        ctx.beginPath();
        for (let i = 0; i < pts.length; i++) { const p = toPx(pts[i].x, pts[i].y); if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }
        ctx.stroke();
      };
      bulge(sp.weld.cap); bulge(sp.weld.root);
      // root gap / root face lines from the region (single-v / double-v)
      if (sp.weld.region && sp.weld.region.length >= 4) {
        const rg = sp.weld.region;
        ctx.setLineDash([]);
        for (let i = 0; i < rg.length; i++) {
          const a = rg[i], b = rg[(i + 1) % rg.length];
          if (Math.abs(a.y - b.y) < 1e-9 && (Math.abs(a.y) < 1e-9 || Math.abs(a.y - sp.T) < 1e-9)) continue;   // skip top/bottom closing edges
          const pa = toPx(a.x, a.y), pb = toPx(b.x, b.y);
          ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
        }
      }
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
    return best;
  }

  function drawZeroLadder(ctx, st, sp, der, E) {
    const D = der.diameter || 10;
    const mode = st.display.colourCode || 'none';
    const defects = st.display.hide ? [] : st.defects;
    const step = Math.max(1, 4 / S.xf.scale);
    ctx.save();
    ctx.lineWidth = 1;
    ctx.setLineDash([1, 2]);
    ctx.strokeStyle = mode === 'none' ? 'rgba(255,255,255,0.55)' : rayColour(mode, 1, null, '#ffffff');
    if (st.display.singleLine) {
      const y = castDown(sp, E.x, defects);
      const a = toPx(E.x, 0), b = toPx(E.x, y);
      ctx.setLineDash([]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    } else {
      for (let u = -D / 2; u <= D / 2 + 1e-6; u += step) {
        const x = E.x + u;
        const y = castDown(sp, x, defects);
        const a = toPx(x, 0), b = toPx(x, y);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
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
      const t = Math.tan(M.deg2rad(a));
      const p0 = toPx(E.x, E.y), p1 = toPx(E.x - side * T * t, T);
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
    }
    ctx.restore();
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
    if (probe.method === 'pa') {
      const angles = UT.probe.paAngles(probe);
      const sub = angles.filter(function (_, i) { return i % 2 === 0; });
      ctx.save();
      drawSimpleFan(ctx, sp, E, probe.side || 1, sub, false);
      ctx.restore();
      return;
    }
    if ((probe.angle || 0) === 0) { drawZeroLadder(ctx, st, sp, der, E); return; }
    const rays = frame && frame.rays;
    if (!rays) return;
    drawTracerRays(ctx, rays, sp, skips, mode, der, disp.singleLine);
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

  // ------------------------------------------------------------------ drawing: probes
  /** Emission frame for the probe: {x, y, tangent, normal}. */
  function emissionAt(sp, probe) {
    try { return UT.specimens.scanSurfaceAt(sp, probe); } catch (e) { return { x: probe.x, y: 0, tangent: { x: 1, y: 0 }, normal: { x: 0, y: 1 } }; }
  }

  /**
   * Draw a probe shoe at emission point E (mm) with local frame (tangent t, normal n into the metal).
   * Angle probes: "house" pentagon 24×14 mm (vertical front face, front-top corner sloped at the
   * wedge angle); 0°: square 20×18 mm.
   */
  function drawShoe(ctx, E, t, n, side, der, colour, hollow, opts) {
    const o = opts || {};
    const map = function (u, v) { return toPx(E.x + u * t.x + v * n.x, E.y + u * t.y + v * n.y); };
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
      const w = der.shoeWidth || 24, h = der.shoeHeight || 14;
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

  function drawProbes(ctx, frame, st, sp, der, E) {
    const probe = st.probe;
    const colour = der.colour || '#00c000';
    const t = E.tangent || { x: 1, y: 0 }, n = E.normal || { x: 0, y: 1 };
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
    const side = probe.side || 1;
    const theta = der.refracted || 0;
    const T = sp.T || 20;
    if (probe.method === 'tt') {
      // receiver on the opposite surface where the centre ray exits (hollow, mirrored)
      const xr = E.x - side * T * Math.tan(M.deg2rad(theta));
      drawShoe(ctx, { x: xr, y: T }, { x: 1, y: 0 }, { x: 0, y: -1 }, -side, der, colour, true);
    } else if (probe.method === 'tandem') {
      const xr = E.x - side * T * Math.tan(M.deg2rad(theta));
      drawShoe(ctx, { x: xr, y: 0 }, t, n, side, der, colour, true);
    }
    drawShoe(ctx, E, t, n, side, der, colour, false);
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
    const baseline = toPx(0, 0).y - 6;
    // The 3-D window (PIPE on) sits over the right end of the cross band at every viewport size:
    // slide the caption left of it when their boxes intersect (§14.11).
    try {
      const w = UT.dom && UT.dom.wins && UT.dom.wins.pipe3d;
      if (w && w.isOpen() && w.el && S.canvas && typeof w.el.getBoundingClientRect === 'function') {
        const wr = w.el.getBoundingClientRect(), cr = S.canvas.getBoundingClientRect();
        const wl = wr.left - cr.left, wt = wr.top - cr.top, wb = wr.bottom - cr.top;
        const tw = ctx.measureText('CROSS SECTION').width;
        if (right > wl && right - tw < wr.right - cr.left && baseline > wt && baseline - 12 < wb) right = Math.min(right, wl - 8);
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
    drawHoles(ctx, sp);
    drawPerspex(ctx, sp);
    drawSlot(ctx, sp);
    drawIowGuides(ctx, sp);
    if (!st.display.hide) drawDefects(ctx, st);
    drawStroke(ctx);
    const E = emissionAt(sp, st.probe);
    if (der) {
      drawBeam(ctx, frame, st, sp, der, E);
      drawHits(ctx, frame, st);
      drawProbes(ctx, frame, st, sp, der, E);
    }
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
    // blue probe marker
    const pxp = xf.ox + (st.probe.x || 0) * xf.scale;
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
    if (mm === null) { if (cur.view === 'cross' || cur.x !== null) UT.set({ cursor: { x: null, y: null, view: null } }, { noRender: true }); S.hoverMm = null; return; }
    if (S.hoverMm && Math.abs(S.hoverMm.x - mm.x) < 0.05 && Math.abs(S.hoverMm.y - mm.y) < 0.05) return;
    S.hoverMm = mm;
    UT.set({ cursor: { x: +mm.x.toFixed(1), y: +mm.y.toFixed(1), view: view || 'cross' } }, { noRender: true });
  }

  function defectAt(st, mm) {
    const tol = 3;
    let best = null, bestD = tol;
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

  function onMouseDown(ev) {
    const st = state();
    const cv = S.canvas;
    const p = UT.dom.localPos(ev, cv);
    if (ev.button !== 0 && ev.button !== 2) return;
    if (brushActive(st)) {
      if (!st.specimen) return;
      const mm = toMm(p.x, p.y);
      const type = (st.editing && st.editing.brush) || 'planar';
      S.stroke = { pts: [mm], erase: ev.button === 2, planar: isPlanarType(type) };
      S.drag = { kind: 'brush' };
      ev.preventDefault();
      UT.requestRender();
      return;
    }
    if (ev.button !== 0) return;
    if (!st.specimen) return;
    if (isOblique(st) && S.ob) {
      const pick = obliquePick(S.ob, p.x, p.y);
      S.drag = { kind: 'oblique', face: st.specimen.face === 'narrow' ? 'narrow' : 'wide' };
      applyObliquePick(st, pick);
      ev.preventDefault();
      return;
    }
    const mm = toMm(p.x, p.y);
    S.drag = { kind: 'probe', x0: mm.x, y0: mm.y, z0: st.probe.z, shift: ev.shiftKey };
    if (!ev.shiftKey) moveProbeTo(st, mm, false, null);
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

  function onMouseMove(ev) {
    const st = state();
    const cv = S.canvas;
    if (!cv) return;
    const p = UT.dom.localPos(ev, cv);
    const d = S.drag;
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
    const mm = toMm(p.x, p.y);
    if (d && d.kind === 'probe') {
      moveProbeTo(st, mm, d.shift || ev.shiftKey, d);
    }
    setCursorMm(mm);
  }

  function onMouseUp(ev) {
    const st = state();
    const d = S.drag;
    if (!d) return;
    S.drag = null;
    if (S.canvas) S.canvas.classList.remove('probe-drag');
    if (d.kind === 'brush') { endStroke(st); return; }
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
    void ev;
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
    const d = defectAt(st, toMm(p.x, p.y));
    if (d) UT.set({ selectedDefect: Math.max(0, (d.n || 1) - 1) });
  }

  /**
   * Initialise the cross-section canvas: mouse handlers + 'render' subscription.
   * @param {HTMLCanvasElement} canvas the #cv-cross canvas
   */
  function init(canvas) {
    S.canvas = canvas;
    UT.dom.injectCss('view-cross', cross.css);
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseleave', function () { if (!S.drag) setCursorMm(null); });
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('dblclick', onDblClick);
    canvas.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });
    window.addEventListener('mousemove', function (ev) { if (S.drag) onMouseMove(ev); });
    window.addEventListener('mouseup', onMouseUp);
    UT.bus.on('render', function (frame) { draw(frame, UT.state); });
    UT.bus.on('state', function (e) { if (e && e.keys && e.keys.indexOf('specimen') >= 0) { S.ob = null; S.xf = null; } });
  }

  /**
   * Initialise the X ruler canvas (#cv-ruler): click/drag moves the probe; drawn on every 'render'.
   * @param {HTMLCanvasElement} canvas
   */
  function initRuler(canvas) {
    S.ruler = canvas;
    UT.dom.injectCss('view-cross', cross.css);
    let down = false;
    const move = function (ev) {
      const st = state();
      if (!st.specimen || isOblique(st)) return;
      const p = UT.dom.localPos(ev, canvas);
      const xf = S.xf || ensureTransform(st);
      moveProbeTo(st, { x: (p.x - xf.ox) / xf.scale, y: 0 }, false, null);
    };
    canvas.addEventListener('mousedown', function (ev) { if (ev.button !== 0) return; if (brushActive(state())) return; down = true; move(ev); ev.preventDefault(); });
    canvas.addEventListener('mousemove', function (ev) { if (down) move(ev); });
    window.addEventListener('mouseup', function () { down = false; });
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

  // ------------------------------------------------------------------ namespace
  const cross = {
    init, initRuler, draw, drawRuler, toPx, toMm, fit, setBrush,
    transform() { return S.xf; },
    computeTransform, computeOblique, obliquePick, hull, dilate, surfaceTagAt, castDown,
    css: [
      '#cv-cross{display:block;cursor:crosshair;background:#fdfbd8;user-select:none;-webkit-user-select:none;touch-action:none}',
      '#cv-cross.probe-drag{cursor:ew-resize}',
      '#cv-cross.brush{cursor:cell}',
      '#cv-ruler{display:block;cursor:pointer;background:#fdfbd8;user-select:none;-webkit-user-select:none}',
    ].join('\n'),
    __selftest() {
      const f = [];
      const sp = UT.specimens.plateWeld({ T: 20 });
      const xf = computeTransform(sp, 1280, 200);
      if (Math.abs(xf.scale - 4) > 1e-9) f.push('scale ' + xf.scale);
      if (Math.abs(xf.ox - 640) > 1e-9) f.push('weld centred on x=0: ox ' + xf.ox);
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
      return f;
    },
  };
  UT.views.cross = cross;
})(window.UT = window.UT || {});
