/* 66-view-plotter.js — beam-plotting card (PLOT / IOW mode), radiograph film strip (RAD), the sizing
 * window (SIZE, v2 methods) and the v2 B-scan / echo-dynamic windows. SPEC §7.7 as amended by §14.5 and
 * §15.6; SPEC-v2 §3.12 (P12), §4.4 (T6), §7 (test API rows owned by 66).
 *
 * UT.views.plotter    { init(canvas), draw(frame, state), toPx, toMm, fit, markEdge, erase, toggleMirror, open, close, toggle, css }
 * UT.views.radiograph { window, open, close, toggle, draw(frame, state), css }
 * UT.views.sizing     { window, open, close, toggle, draw(frame, state), markL, markR, clear, setMethod, measureTips, autoMarks,
 *                       autoTips, compute, recommended, methods, css }
 * UT.views.bscan      { window, open, close, toggle, clear, columns(), draw(frame, state), css }
 * UT.views.echodyn    { window, open, close, toggle, clear, samples(), classify(), draw(frame, state), css }
 * UT.test             { bscan() → {n, axis, columns}, echodyn() → {samples, pattern}, sizing({method, marks}) → result }
 */
(function (UT) {
  'use strict';

  // SPEC NOTES (decisions where the spec is silent or ambiguous)
  // v1 (unchanged behaviour):
  // - Card transform: x shares the X-ruler scale through UT.views.cross.toPx (scale = px per mm, the
  //   index at the SAME screen x as the probe on the ruler; the offset between #cv-cross and
  //   #cv-plotter bounding rects is subtracted — v2: divided by UT.dom.scale() for the design-box scaling).
  //   When the aligned index would leave no room for the beam (index left of 45 % of the card width) or
  //   would fall off the right edge, the card places the index 20 mm from its right edge. The scanning
  //   surface is 4 px below the card top; depth uses the same px/mm scale. Fallback scale: 4 px/mm.
  // - toPx(x, y) takes ABSOLUTE specimen coordinates; toMm(px, py) returns {x, y, standoff, depth} where
  //   standoff = side·(probe.x − x). plot.points are {standoff, depth, x}; edge marks accept `standoff`
  //   and `standOff` (80-modes writes `standOff`).
  // - Mirror image: the plate reflected about its bottom face (grey region, real depths labelled in grey,
  //   mirrored SDH lines pink). With the mirror hidden the second leg is drawn reflected (dashed blue).
  // - Cursor readouts HALF SKIP / FULL SKIP pairs (whole mm). Left-click plots a cross, right-click
  //   removes the nearest point (8 px). The bottom 80 mm ruler strip is draggable horizontally.
  // - Buttons overlay: 'Hide/Show Mirror Image' bottom-left, 'Mark 10% Edge' + 'Erase Plotting' bottom-right.
  // - markEdge(): the hole nearest the leg-1 centre ray at the current probe position; marks are red
  //   crosses joined per depth plus envelope polylines from the index (front/back edge).
  // - cardStyle 'weld' (UTman II): hatched plate halves, red beam-path scale every 5 mm.
  // - open()/close(): the card canvas is placed by 90-app; a fallback floating window 'plotter' is
  //   created when open() is called before init(). Draws whenever its canvas is visible.
  // - Radiograph: film 600 × 140, defects darker, wire IQI, film id, z ticks, green probe marker;
  //   indications hidden only during an unrevealed trade test.
  // v2:
  // - Plotter: Pointer Events (pointerdown/move/up/cancel + setPointerCapture, touch-action:none). The card
  //   draws the ±halfAngle20dB edge rays (thin dashed blue, both legs) around the centre line so plotted
  //   edge marks can be compared with the piston-model beam; through-wall (x) 20 dB projection helper
  //   `UT.views.sizing.helpers.edgeX(probe, derived, depth) → {near, far}` per §4.4.
  // - Sizing v2 writes `state.sizing` itself (marks {side, z, x, depth, ampPct, path}; result
  //   {method, length, height, warning, zFrom, zTo, depth, corr}) — it no longer delegates to
  //   UT.modes.sizing because 80's `method()` only knows 6dB/20dB. Mark shape is a superset of v1/80's.
  //   Methods: '6dB' L = zR − zL (warning when L < 2·wz6); '20dB' L = (zR − zL) − 2·wz20 (wz20 = crystalB/2
  //   inside the near field; path = mean of the marks' gated SP, else the current readout, else 30 mm);
  //   'max' L = zR − zL (marks = last positions ≥ 80 % of the running maximum, shown as the threshold);
  //   'eval' L = zR − zL with the threshold refPct·10^(evaluationDb/20), refPct = 80·10^((gain − refGain)/20)
  //   (an echo at the reference/DAC level reads 80 % at refGain); 'tip' h = |Δpath|·cosθ from the two
  //   strongest 'tip' echoes of the same defect inside the active gate — a surface-breaking crack has one
  //   tip and a 'corner' echo, so a single tip is paired with the nearest 'corner' echo (warning text says so).
  //   Switching the method recomputes the result from the existing marks. Length results are never
  //   negative (clamped to 0 with a warning).
  // - evaluationDb / recommended method come from UT.standards.rules (rulesOverride first) when 45 is
  //   loaded, else from a small local fallback table (iso11666 AL2 −10 / AL3 −6, iso17640 −10, asme8 −6
  //   ('50pct' → 'eval'), awsd11 '6dB'). Pre-selection happens on open() until the user/test chose a
  //   method explicitly (setMethod) — so lesson 5's setMethod('6dB') sticks.
  // - autoMarks({zFrom, zTo, step}) (also UT.test.sizing({auto:true})) scans probe.z synchronously with
  //   UT.setIn(...,{noRender:true}) + UT.renderNow(), finds the gated maximum, walks outward to the
  //   method's threshold (linear interpolation of the crossing; 'max' uses the last sample ≥ 80 %) and
  //   restores probe.z. Default span: the nearest defect ± 40 mm (or probe.z ± 40), step 1 mm.
  // - B-scan / echo-dynamic buffers are module-level; recording happens inside the module's single
  //   'render' listener, only when state.bscan.on / state.echodyn.on (the echo-dynamic buffer also records
  //   while the sizing window is open — its hint uses it) and only when probe.x/z changed since the last
  //   sample. Nothing is written to state from the listener. Buffers clear on specimen swap ('state' with
  //   key specimen), on Clear, and the B-scan buffer when range/delay/angle change its depth scale.
  // - B-scan column = 160 depth bins (max of the A-scan samples covering each bin), depth = path·cosθ,
  //   depthMax = min((delay + range)·cosθ, max(2.2·T, 40)); cap 600 columns; window `bscan` (axis x|z,
  //   Record checkbox = bscan.on, Clear). open() sets bscan.on = true (outside any render), closing sets
  //   it false. UT.test.bscan() adds positions[], depthMax, nBins, firstDepth[] to {n, axis, columns}.
  // - Echo-dynamic: samples {x, z, pct, path, kind}, cap 200; the plot axis is the dominant movement axis;
  //   ISO 23279 pattern: 1 when width6 ≤ 2·w6 (point-like), else 2 (smooth plateau) or 3 (≥ 1 dip ≥ 3 dB inside the −6 dB
  //   region, or coefficient of variation of the plateau core (≥ −3 dB) > 0.12 → rough); pattern 0 = insufficient data (< 5 samples or max < 5 %).
  //   UT.test.echodyn() → {samples, pattern (number), patternInfo}.
  // - 'lang' rebuilds the three windows' DOM; canvases stay English.

  UT.views = UT.views || {};
  const M = UT.math;
  const FONT = '11px "Segoe UI", Arial, sans-serif';
  const FONT_BOLD = 'bold 11px "Segoe UI", Arial, sans-serif';
  const FONT_SMALL = '10px "Segoe UI", Arial, sans-serif';
  const RULER_LEN = 80;              // bottom stand-off ruler length (mm)
  const SURFACE_Y = 4;               // px from the card top to the scanning surface line

  // ------------------------------------------------------------------ shared helpers
  function st() { return UT.state; }
  function t(key, params) { return UT.i18n && UT.i18n.t ? UT.i18n.t(key, params) : key; }
  function hasDoc() { return typeof document !== 'undefined' && !!document; }
  function derivedOf(frame, state) {
    if (frame && frame.derived) return frame.derived;
    try { return UT.probe.derive(state.probe, state.specimen); } catch (e) { return null; }
  }
  function visibleCanvas(cv) { return !!cv && (cv.clientWidth || 0) > 0 && (cv.clientHeight || 0) > 0; }
  function cssSize(cv) { return { w: cv.clientWidth || cv.width || 640, h: cv.clientHeight || cv.height || 260 }; }
  function dashed(ctx, seg) { if (ctx.setLineDash) ctx.setLineDash(seg || []); }
  function cross(ctx, x, y, r, colour, lw) {
    ctx.save();
    ctx.strokeStyle = colour; ctx.lineWidth = lw || 1.5; dashed(ctx, []);
    ctx.beginPath(); ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r); ctx.moveTo(x - r, y + r); ctx.lineTo(x + r, y - r); ctx.stroke();
    ctx.restore();
  }
  function capture(el, ev) { try { if (el.setPointerCapture && ev.pointerId !== undefined) el.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ } }
  /** Shared X scale from the cross-section view: {scale, x0} (x0 = px of specimen x = 0 in `cv`) or null. */
  function sharedScale(cv) {
    const cr = UT.views.cross;
    if (!cr || typeof cr.toPx !== 'function') return null;
    try {
      const p0 = cr.toPx(0, 0), p1 = cr.toPx(10, 0);
      const s = (p1.x - p0.x) / 10;
      if (!isFinite(s) || s < 0.05) return null;
      let off = 0;
      if (hasDoc() && cv && cv.getBoundingClientRect) {
        const cc = document.getElementById('cv-cross') || document.getElementById('cv-ruler');
        if (cc && cc.getBoundingClientRect) {
          const a = cc.getBoundingClientRect(), b = cv.getBoundingClientRect();
          const k = (UT.dom && UT.dom.scale ? UT.dom.scale() : 1) || 1;
          if (a.width > 0 && b.width > 0) off = (a.left - b.left) / k;
        }
      }
      return { scale: s, x0: p0.x + off };
    } catch (e) { return null; }
  }
  /** Piece(s) of a z interval on a specimen of length L (pipes wrap). */
  function zPieces(zFrom, zTo, L, wrap) {
    if (wrap && zTo < zFrom) return [[zFrom, L], [0, zTo]];
    return [[Math.min(zFrom, zTo), Math.max(zFrom, zTo)]];
  }
  function bboxOf(d) {
    if (UT.specimens && UT.specimens.bbox) return UT.specimens.bbox(d.pts);
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    for (const p of d.pts) { xMin = Math.min(xMin, p.x); xMax = Math.max(xMax, p.x); yMin = Math.min(yMin, p.y); yMax = Math.max(yMax, p.y); }
    return { xMin, xMax, yMin, yMax, w: xMax - xMin, h: yMax - yMin, cx: (xMin + xMax) / 2, cy: (yMin + yMax) / 2 };
  }
  function isPlanarType(tp) { return UT.specimens && UT.specimens.isPlanar ? UT.specimens.isPlanar(tp) : (tp === 'planar' || tp === 'crack' || tp === 'lof' || tp === 'lamination' || tp === 'root'); }
  function defectLen(d, sp) { return UT.specimens && UT.specimens.defectLength ? UT.specimens.defectLength(d, sp) : (d.zTo - d.zFrom); }
  /** Amplitude (% FSH) → colour map (black → blue → green → yellow → red → white). */
  function ampColour(pct) {
    const v = M.clamp(pct / 100, 0, 1.2);
    let r, g, b;
    if (v < 0.2) { const u = v / 0.2; r = 0; g = 0; b = Math.round(40 + 180 * u); }
    else if (v < 0.4) { const u = (v - 0.2) / 0.2; r = 0; g = Math.round(200 * u); b = Math.round(220 - 160 * u); }
    else if (v < 0.6) { const u = (v - 0.4) / 0.2; r = Math.round(240 * u); g = Math.round(200 + 40 * u); b = Math.round(60 - 60 * u); }
    else if (v < 0.85) { const u = (v - 0.6) / 0.25; r = 240; g = Math.round(240 - 200 * u); b = 0; }
    else { const u = M.clamp((v - 0.85) / 0.35, 0, 1); r = 240 + Math.round(15 * u); g = Math.round(40 + 215 * u); b = Math.round(255 * u); }
    return [r, g, b];
  }

  // ==================================================================== PLOTTER CARD
  const P = {
    canvas: null, overlay: null, btnMirror: null, win: null, open: false,
    tf: null, cursor: null, drag: null, ruler: { so0: 70 }, lastFrame: null, parentFixed: false,
  };

  /**
   * Pure card transform. scale = px/mm, indexAligned = px of the index from the shared ruler scale (or null).
   * @returns {{W,H,scale,indexPx,y0,T,side,bottomPx,mirrorPx,aligned,angle}}
   */
  function cardTransform(W, H, sp, probe, derived, scale, indexAligned) {
    const s = scale > 0.05 ? scale : 4;
    let indexPx = indexAligned, aligned = true;
    if (!(typeof indexPx === 'number' && isFinite(indexPx)) || indexPx < 0.45 * W || indexPx > W - 8 * s) { indexPx = W - 20 * s; aligned = false; }
    const T = sp && sp.T > 0 ? sp.T : 20;
    const y0 = SURFACE_Y;
    const bottomPx = y0 + T * s;
    const mirrorPx = Math.min(H, bottomPx + T * s);
    return { W, H, scale: s, indexPx, y0, T, side: (probe && probe.side) || 1, bottomPx, mirrorPx, aligned, angle: derived ? derived.refracted : ((probe && probe.angle) || 0), th20: derived && derived.halfAngle20dB ? derived.halfAngle20dB : 0 };
  }
  /** standoff/depth (mm) → px in the card. */
  function soPx(tf, so, depth) { return { x: tf.indexPx - tf.side * so * tf.scale, y: tf.y0 + depth * tf.scale }; }
  /** px → {standoff, depth}. */
  function pxSo(tf, px, py) { return { standoff: tf.side * (tf.indexPx - px) / tf.scale, depth: (py - tf.y0) / tf.scale }; }

  function ensureTransform(state, frame) {
    const cv = P.canvas;
    const sz = cv ? cssSize(cv) : { w: 820, h: 270 };
    const sp = state && state.specimen, probe = state && state.probe;
    const sh = cv ? sharedScale(cv) : null;
    const derived = derivedOf(frame, state || st());
    const idx = sh && probe ? sh.x0 + probe.x * sh.scale : null;
    P.tf = cardTransform(sz.w, sz.h, sp, probe, derived, sh ? sh.scale : 4, idx);
    return P.tf;
  }
  /** Absolute specimen (x, depth) mm → card px. */
  function toPx(x, y) {
    const tf = P.tf || ensureTransform(st(), UT.frame);
    const probe = st().probe || { x: 0 };
    return soPx(tf, tf.side * (probe.x - x), y);
  }
  /** Card px → {x, y, standoff, depth} (x absolute across the specimen, y = depth). */
  function toMm(px, py) {
    const tf = P.tf || ensureTransform(st(), UT.frame);
    const probe = st().probe || { x: 0 };
    const r = pxSo(tf, px, py);
    return { x: probe.x - tf.side * r.standoff, y: r.depth, standoff: r.standoff, depth: r.depth };
  }
  /** Recompute the transform from the canvas box. */
  function fit() { return ensureTransform(st(), UT.frame); }

  /** Hole (non-ladder) nearest the leg-1 centre ray: {hole, standoff, depth, dist} or null. */
  function nearestHoleOnRay(sp, probe, derived) {
    if (!sp || !sp.holes || !sp.holes.length || !probe) return null;
    const side = probe.side || 1;
    const a = M.deg2rad(derived ? derived.refracted : (probe.angle || 0));
    const dx = -side * Math.sin(a), dy = Math.cos(a);
    let best = null;
    for (const h of sp.holes) {
      if (h.ladder) continue;
      const rx = h.x - probe.x, ry = h.y;
      const tt = rx * dx + ry * dy;
      const perp = Math.abs(rx * dy - ry * dx);
      const dist = tt > 0 ? perp : Math.hypot(rx, ry);
      if (!best || dist < best.dist) best = { hole: h, standoff: +(side * (probe.x - h.x)).toFixed(1), depth: h.y, dist };
    }
    return best;
  }

  /** Drop a 20 dB (10 %) edge mark for the hole nearest the centre ray at the current probe stand-off. */
  function markEdge() {
    const s = st();
    const derived = derivedOf(UT.frame, s);
    const pick = nearestHoleOnRay(s.specimen, s.probe, derived);
    if (!pick) return null;
    const r = UT.frame && UT.frame.readouts && UT.frame.readouts.primary;
    const mark = {
      standoff: pick.standoff, standOff: Math.abs(pick.standoff), depth: pick.depth, x: s.probe.x, z: s.probe.z,
      hole: pick.hole.label || (pick.depth + 'mm'), side: s.probe.side, gain: s.instrument.gain, ampPct: r ? +r.peakPct.toFixed(1) : null,
    };
    UT.setIn('plot', { edgeMarks: (s.plot.edgeMarks || []).concat([mark]) });
    UT.status({ right: t('Edge mark {n}: stand-off {so} mm at {hole} SDH', { n: (s.plot.edgeMarks || []).length + 1, so: mark.standOff, hole: mark.hole }) });
    return mark;
  }
  /** Erase all plotted points and edge marks. */
  function erase() { UT.setIn('plot', { points: [], edgeMarks: [] }); }
  /** Toggle the mirror image (state.plot.mirror). */
  function toggleMirror() { UT.setIn('plot', { mirror: !(st().plot && st().plot.mirror) }); }

  function addPoint(mm) {
    const s = st();
    const pts = (s.plot.points || []).concat([{ standoff: +mm.standoff.toFixed(1), depth: +mm.depth.toFixed(1), x: +mm.x.toFixed(1) }]);
    UT.setIn('plot', { points: pts });
  }
  function removePointNear(px, py) {
    const s = st(), tf = P.tf;
    if (!tf) return false;
    let bi = -1, bd = 8;
    (s.plot.points || []).forEach(function (p, i) { const q = soPx(tf, p.standoff, p.depth); const d = Math.hypot(q.x - px, q.y - py); if (d < bd) { bd = d; bi = i; } });
    if (bi < 0) return false;
    const pts = s.plot.points.slice(); pts.splice(bi, 1);
    UT.setIn('plot', { points: pts });
    return true;
  }

  // ---------------------------------------------------------------- drawing pieces
  function drawTopRuler(ctx, tf) {
    const soMax = tf.indexPx / tf.scale + 2, soMin = -(tf.W - tf.indexPx) / tf.scale - 2;
    ctx.save();
    ctx.strokeStyle = '#111'; ctx.fillStyle = '#111'; ctx.lineWidth = 1; ctx.font = FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.beginPath(); ctx.moveTo(0, tf.y0 + 0.5); ctx.lineTo(tf.W, tf.y0 + 0.5); ctx.stroke();
    const lo = Math.ceil(Math.min(soMin, soMax) / 2) * 2, hi = Math.floor(Math.max(soMin, soMax) / 2) * 2;
    for (let so = lo; so <= hi; so += 2) {
      const x = Math.round(soPx(tf, so, 0).x) + 0.5;
      if (x < 0 || x > tf.W) continue;
      const big = so % 10 === 0;
      ctx.beginPath(); ctx.moveTo(x, tf.y0); ctx.lineTo(x, tf.y0 + (big ? 8 : 4)); ctx.stroke();
      if (big) ctx.fillText(String(Math.abs(so)), x, tf.y0 + 9);
    }
    ctx.restore();
  }

  function drawArcs(ctx, tf, mirror) {
    const maxR = Math.hypot(Math.max(tf.indexPx, tf.W - tf.indexPx), tf.H) / tf.scale;
    const region = function (y1, y2, colour) {
      ctx.save();
      ctx.beginPath(); ctx.rect(0, y1, tf.W, Math.max(0, y2 - y1)); ctx.clip();
      ctx.strokeStyle = colour; ctx.lineWidth = 1;
      for (let r = 10; r <= maxR; r += 10) {
        ctx.beginPath(); ctx.arc(tf.indexPx, tf.y0, r * tf.scale, 0, Math.PI); ctx.stroke();
      }
      ctx.restore();
    };
    region(tf.y0, tf.bottomPx, 'rgba(70,130,255,0.45)');
    if (mirror) region(tf.bottomPx, tf.mirrorPx, 'rgba(120,120,120,0.45)');
  }

  function drawDepthLines(ctx, tf, mirror) {
    ctx.save();
    ctx.lineWidth = 1; ctx.font = FONT; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    for (let d = 10; d < tf.T + 1e-6; d += 10) {
      const y = Math.round(soPx(tf, 0, d).y) + 0.5;
      ctx.strokeStyle = '#2f55d4'; ctx.fillStyle = '#1a2fa0';
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(tf.W, y); ctx.stroke();
      ctx.fillText(String(d), tf.indexPx + 4, y - 1);
    }
    const yb = Math.round(tf.bottomPx) + 0.5;
    ctx.strokeStyle = '#333'; ctx.beginPath(); ctx.moveTo(0, yb); ctx.lineTo(tf.W, yb); ctx.stroke();
    if (mirror) {
      for (let d = 10; d < tf.T - 1e-6; d += 10) {
        const y = Math.round(soPx(tf, 0, 2 * tf.T - d).y) + 0.5;
        if (y > tf.mirrorPx) continue;
        ctx.strokeStyle = '#a0a0a0'; ctx.fillStyle = '#777';
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(tf.W, y); ctx.stroke();
        ctx.fillText(String(d), tf.indexPx + 4, y - 1);
      }
    }
    ctx.restore();
  }

  function drawSdhLines(ctx, tf, sp, mirror) {
    if (!sp || !sp.holes) return;
    const prefix = sp.id === 'iow' ? 'A5 IOW Block ' : ((sp.name || 'Block') + ' ');
    ctx.save();
    ctx.font = FONT_BOLD; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    const xEnd = Math.min(tf.W, tf.indexPx + 18 * tf.scale);
    for (const h of sp.holes) {
      if (h.ladder) continue;
      const y = Math.round(soPx(tf, 0, h.y).y) + 0.5;
      ctx.strokeStyle = '#e00000'; ctx.lineWidth = 1.5; ctx.fillStyle = '#111';
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(xEnd, y); ctx.stroke();
      ctx.fillText(prefix + (h.label || (h.y + 'mm')) + ' SDH', tf.indexPx - 6, y - 1);
      if (mirror) {
        const ym = Math.round(soPx(tf, 0, 2 * tf.T - h.y).y) + 0.5;
        if (ym <= tf.mirrorPx) {
          ctx.strokeStyle = '#f0a0a0'; ctx.lineWidth = 1; ctx.fillStyle = '#888';
          ctx.beginPath(); ctx.moveTo(0, ym); ctx.lineTo(xEnd, ym); ctx.stroke();
          if (ym - y >= 14) ctx.fillText(prefix + (h.label || (h.y + 'mm')) + ' SDH', tf.indexPx - 6, ym - 1);
        }
      }
    }
    ctx.restore();
  }

  function drawAxis(ctx, tf) {
    ctx.save();
    ctx.strokeStyle = '#333'; ctx.lineWidth = 1; dashed(ctx, [3, 3]);
    const x = Math.round(tf.indexPx) + 0.5;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, tf.H); ctx.stroke();
    ctx.restore();
  }

  /** Thin dashed ±halfAngle20dB edge rays (leg 1 and, when the mirror is shown, leg 2). */
  function drawEdgeRays(ctx, tf, mirror) {
    if (!(tf.th20 > 0) || !(tf.angle > 0)) return;
    ctx.save();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(26,47,224,0.45)'; dashed(ctx, [2, 3]);
    [tf.angle - tf.th20, tf.angle + tf.th20].forEach(function (deg) {
      const a = M.deg2rad(deg), c = Math.max(Math.cos(a), 1e-6);
      const leg = tf.T / c;
      const p0 = soPx(tf, 0, 0), p1 = soPx(tf, leg * Math.sin(a), tf.T);
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y);
      if (mirror) { const p2 = soPx(tf, 2 * leg * Math.sin(a), Math.min(2 * tf.T, (tf.mirrorPx - tf.y0) / tf.scale)); ctx.lineTo(p2.x, p2.y); }
      ctx.stroke();
    });
    ctx.restore();
  }

  function drawCentreLine(ctx, tf, mirror) {
    const a = M.deg2rad(tf.angle);
    const c = Math.max(Math.cos(a), 1e-6);
    const leg = tf.T / c;                              // mm of beam path per leg
    const p0 = soPx(tf, 0, 0), p1 = soPx(tf, leg * Math.sin(a), tf.T);
    ctx.save();
    ctx.lineWidth = 1.5; ctx.strokeStyle = '#1a2fe0'; dashed(ctx, []);
    ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
    if (mirror) {
      const p2 = soPx(tf, 2 * leg * Math.sin(a), 2 * tf.T);
      ctx.save(); ctx.beginPath(); ctx.rect(0, tf.bottomPx, tf.W, Math.max(0, tf.mirrorPx - tf.bottomPx)); ctx.clip();
      ctx.strokeStyle = '#7a7a7a'; ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
      ctx.restore();
    } else {
      const p2 = soPx(tf, 2 * leg * Math.sin(a), 0);
      dashed(ctx, [5, 4]); ctx.strokeStyle = 'rgba(26,47,224,0.6)';
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    }
    ctx.restore();
    drawEdgeRays(ctx, tf, mirror);
  }

  /** UTman II weld card: hatched plate halves + red beam-path scale along the centre line. */
  function drawWeldCard(ctx, tf, sp, mirror) {
    const capW = sp && sp.weld ? (sp.weld.capWidth || 16) : 16;
    const gapL = toPx(-capW / 2, 0).x, gapR = toPx(capW / 2, 0).x;
    const ex = sp && sp.extents ? sp.extents : { xMin: -150, xMax: 150 };
    const xl = toPx(ex.xMin, 0).x, xr = toPx(ex.xMax, 0).x;
    const hatch = function (x0, x1, y0, y1, fill, line) {
      if (x1 <= x0 || y1 <= y0) return;
      ctx.save();
      ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
      ctx.fillStyle = fill; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      ctx.strokeStyle = line; ctx.lineWidth = 1;
      const span = (x1 - x0) + (y1 - y0);
      ctx.beginPath();
      for (let k = -span; k < span; k += 7) { ctx.moveTo(x0 + k, y0); ctx.lineTo(x0 + k + (y1 - y0), y1); ctx.moveTo(x0 + k, y1); ctx.lineTo(x0 + k + (y1 - y0), y0); }
      ctx.stroke();
      ctx.restore();
    };
    const L = Math.max(0, Math.min(xl, gapL)), R = Math.min(tf.W, Math.max(xr, gapR));
    hatch(Math.max(0, xl), Math.min(gapL, tf.W), tf.y0, tf.bottomPx, '#9a9a9a', 'rgba(255,255,255,0.55)');
    hatch(Math.max(0, gapR), Math.min(xr, tf.W), tf.y0, tf.bottomPx, '#9a9a9a', 'rgba(255,255,255,0.55)');
    if (mirror) {
      hatch(Math.max(0, xl), Math.min(gapL, tf.W), tf.bottomPx, tf.mirrorPx, '#cfcfcf', 'rgba(255,255,255,0.6)');
      hatch(Math.max(0, gapR), Math.min(xr, tf.W), tf.bottomPx, tf.mirrorPx, '#cfcfcf', 'rgba(255,255,255,0.6)');
    }
    ctx.save();
    ctx.strokeStyle = '#555'; ctx.lineWidth = 1;
    ctx.strokeRect(gapL + 0.5, tf.y0, gapR - gapL, (mirror ? tf.mirrorPx : tf.bottomPx) - tf.y0);
    ctx.strokeStyle = '#333'; ctx.beginPath(); ctx.moveTo(L, Math.round(tf.bottomPx) + 0.5); ctx.lineTo(R, Math.round(tf.bottomPx) + 0.5); ctx.stroke();
    ctx.restore();
    const a = M.deg2rad(tf.angle);
    const leg = tf.T / Math.max(Math.cos(a), 1e-6);
    const maxPath = mirror ? 2 * leg : leg;
    ctx.save();
    ctx.strokeStyle = '#e00000'; ctx.fillStyle = '#e00000'; ctx.lineWidth = 1.5; ctx.font = FONT_BOLD; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const q0 = soPx(tf, 0, 0), q1 = soPx(tf, maxPath * Math.sin(a), maxPath * Math.cos(a));
    ctx.beginPath(); ctx.moveTo(q0.x, q0.y); ctx.lineTo(q1.x, q1.y); ctx.stroke();
    const nx = Math.cos(a) * tf.side, ny = Math.sin(a);
    for (let p = 5; p <= maxPath + 1e-6; p += 5) {
      const q = soPx(tf, p * Math.sin(a), p * Math.cos(a));
      const len = p % 10 === 0 ? 6 : 3;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(q.x - nx * len, q.y - ny * len); ctx.lineTo(q.x + nx * len, q.y + ny * len); ctx.stroke();
      if (p >= 10 && p % 10 === 0) ctx.fillText(String(p), q.x + nx * 9 + 2, q.y + ny * 9);
    }
    ctx.restore();
    drawEdgeRays(ctx, tf, mirror);
  }

  function drawMarks(ctx, tf, plot) {
    const pts = (plot && plot.points) || [];
    for (const p of pts) { const q = soPx(tf, p.standoff, p.depth); cross(ctx, q.x, q.y, 4, '#111', 1.5); }
    const marks = ((plot && plot.edgeMarks) || []).map(function (m) {
      const so = m.standoff !== undefined ? m.standoff : (m.standOff !== undefined ? m.standOff : 0);
      return { so, depth: m.depth || 0 };
    });
    if (!marks.length) return;
    const byDepth = new Map();
    for (const m of marks) { const k = Math.round(m.depth * 2) / 2; if (!byDepth.has(k)) byDepth.set(k, []); byDepth.get(k).push(m.so); }
    const depths = Array.from(byDepth.keys()).sort(function (a, b) { return a - b; });
    ctx.save();
    ctx.strokeStyle = '#e00000'; ctx.lineWidth = 1; dashed(ctx, []);
    const fronts = [], backs = [];
    for (const d of depths) {
      const sos = byDepth.get(d).sort(function (a, b) { return a - b; });
      const a = soPx(tf, sos[0], d), b = soPx(tf, sos[sos.length - 1], d);
      if (sos.length > 1) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
      fronts.push(a); backs.push(b);
    }
    dashed(ctx, [4, 3]);
    const p0 = soPx(tf, 0, 0);
    [fronts, backs].forEach(function (line) {
      if (line.length < 1) return;
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y);
      for (const q of line) ctx.lineTo(q.x, q.y);
      ctx.stroke();
    });
    ctx.restore();
    for (const m of marks) { const q = soPx(tf, m.so, m.depth); cross(ctx, q.x, q.y, 4, '#e00000', 1.5); }
  }

  function rulerRect(tf) { return { y0: tf.H - 24, y1: tf.H - 5 }; }
  function drawBottomRuler(ctx, tf) {
    const rr = rulerRect(tf);
    const x0 = soPx(tf, P.ruler.so0, 0).x, x1 = soPx(tf, P.ruler.so0 - RULER_LEN, 0).x;
    const left = Math.min(x0, x1), right = Math.max(x0, x1);
    ctx.save();
    ctx.fillStyle = '#e9e9e9'; ctx.strokeStyle = '#777'; ctx.lineWidth = 1;
    ctx.fillRect(left, rr.y0, right - left, rr.y1 - rr.y0); ctx.strokeRect(left + 0.5, rr.y0 + 0.5, right - left, rr.y1 - rr.y0);
    ctx.strokeStyle = '#222'; ctx.fillStyle = '#222'; ctx.font = FONT_SMALL; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    for (let v = 0; v <= RULER_LEN; v += 1) {
      const x = Math.round(soPx(tf, P.ruler.so0 - v, 0).x) + 0.5;
      const len = v % 10 === 0 ? 9 : (v % 5 === 0 ? 6 : 3);
      ctx.beginPath(); ctx.moveTo(x, rr.y0); ctx.lineTo(x, rr.y0 + len); ctx.stroke();
      if (v % 10 === 0) ctx.fillText(v + 'mm', x + 2, rr.y1 - 1);
    }
    ctx.restore();
  }

  function readoutLines(tf, cur) {
    if (!cur) return [];
    const so = Math.abs(cur.standoff);
    if (cur.depth < 0) return [];
    if (cur.depth <= tf.T) {
      return ['HALF SKIP BEAMPATH DISTANCE=' + Math.round(Math.hypot(so, cur.depth)) + 'mm', 'HALF SKIP STANDOFF=' + Math.round(so) + 'mm'];
    }
    return ['FULL SKIP BEAMPATH DISTANCE=' + Math.round(Math.hypot(so, cur.depth)) + 'mm', 'FULL SKIP STANDOFF=' + Math.round(so) + 'mm', 'FULL SKIP DEPTH=' + Math.round(2 * tf.T - cur.depth) + 'mm'];
  }
  function drawReadouts(ctx, tf) {
    const lines = readoutLines(tf, P.cursor);
    if (!lines.length) return;
    ctx.save();
    ctx.font = FONT_BOLD; ctx.fillStyle = '#222'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    const y = tf.H - 30;
    lines.forEach(function (tx, i) { ctx.fillText(tx, 150, y - (lines.length - 1 - i) * 14); });
    ctx.restore();
  }

  function drawCard(ctx, frame, state) {
    const tf = ensureTransform(state, frame);
    const sp = state.specimen, plot = state.plot || {};
    const mirror = plot.mirror !== false;
    ctx.save();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, tf.W, tf.H);
    if (mirror && tf.mirrorPx > tf.bottomPx) { ctx.fillStyle = '#f4f4f4'; ctx.fillRect(0, tf.bottomPx, tf.W, tf.mirrorPx - tf.bottomPx); }
    const weldStyle = plot.cardStyle === 'weld' || (plot.cardStyle !== 'iow' && sp && sp.kind === 'weld');
    if (sp) {
      if (weldStyle) {
        drawWeldCard(ctx, tf, sp, mirror);
      } else {
        drawArcs(ctx, tf, mirror);
        drawDepthLines(ctx, tf, mirror);
        drawSdhLines(ctx, tf, sp, mirror);
      }
      drawAxis(ctx, tf);
      if (!weldStyle) drawCentreLine(ctx, tf, mirror);
      drawMarks(ctx, tf, plot);
    }
    drawTopRuler(ctx, tf);
    drawBottomRuler(ctx, tf);
    drawReadouts(ctx, tf);
    if (P.cursor && P.cursor.depth >= 0) { const q = soPx(tf, P.cursor.standoff, P.cursor.depth); cross(ctx, q.x, q.y, 3, 'rgba(0,0,0,0.5)', 1); }
    ctx.strokeStyle = '#444'; ctx.lineWidth = 1; ctx.strokeRect(0.5, 0.5, tf.W - 1, tf.H - 1);
    ctx.restore();
  }

  // ---------------------------------------------------------------- overlay + pointer events
  function syncOverlay(visible) {
    const ov = P.overlay, cv = P.canvas;
    if (!ov || !cv) return;
    ov.style.display = visible ? '' : 'none';
    if (!visible) return;
    ov.style.left = cv.offsetLeft + 'px'; ov.style.top = cv.offsetTop + 'px';
    ov.style.width = cv.offsetWidth + 'px'; ov.style.height = cv.offsetHeight + 'px';
    const mirror = !(st().plot && st().plot.mirror === false);
    if (P.btnMirror) { const key = mirror ? 'Hide Mirror Image' : 'Show Mirror Image'; P.btnMirror.dataset.i18n = key; P.btnMirror.textContent = t(key); }
  }
  function buildOverlay(cv) {
    const h = UT.dom.h;
    P.btnMirror = UT.dom.button('Hide Mirror Image', function () { toggleMirror(); }, { class: 'btn plot-btn', title: '거울상 표시/숨기기 (full skip)' });
    const btnMark = UT.dom.button('Mark 10% Edge', function () { markEdge(); }, { class: 'btn plot-btn', title: '20 dB(10 %) 빔 에지 표시' });
    const btnErase = UT.dom.button('Erase Plotting', function () { erase(); }, { class: 'btn plot-btn', title: '플로팅 지우기' });
    const ov = h('div', { class: 'plot-overlay' }, [
      h('div', { class: 'plot-overlay-left' }, [P.btnMirror]),
      h('div', { class: 'plot-overlay-right' }, [btnMark, btnErase]),
    ]);
    const parent = cv.parentNode;
    if (parent) {
      try {
        if (typeof getComputedStyle === 'function' && getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
      } catch (e) { /* ignore */ }
      parent.appendChild(ov);
    }
    P.overlay = ov;
    return ov;
  }
  function redrawSelf() { if (P.canvas && visibleCanvas(P.canvas)) draw(P.lastFrame || UT.frame, st()); }
  function onMove(ev) {
    const cv = P.canvas; if (!cv) return;
    const p = UT.dom.localPos(ev, cv);
    const tf = P.tf || ensureTransform(st(), UT.frame);
    if (P.drag && P.drag.kind === 'ruler') {
      const so = pxSo(tf, p.x, p.y).standoff;
      P.ruler.so0 = P.drag.so0 + (so - P.drag.so);
    }
    P.cursor = pxSo(tf, p.x, p.y);
    P.cursor.x = st().probe ? st().probe.x - tf.side * P.cursor.standoff : 0;
    redrawSelf();
  }
  function onDown(ev) {
    const cv = P.canvas; if (!cv) return;
    const p = UT.dom.localPos(ev, cv);
    const tf = P.tf || ensureTransform(st(), UT.frame);
    if (ev.button === 2) { removePointNear(p.x, p.y); ev.preventDefault(); return; }
    if (ev.button !== 0 && ev.button !== undefined) return;
    const rr = rulerRect(tf);
    if (p.y >= rr.y0 && p.y <= rr.y1) {
      const x0 = soPx(tf, P.ruler.so0, 0).x, x1 = soPx(tf, P.ruler.so0 - RULER_LEN, 0).x;
      if (p.x >= Math.min(x0, x1) && p.x <= Math.max(x0, x1)) { P.drag = { kind: 'ruler', so0: P.ruler.so0, so: pxSo(tf, p.x, p.y).standoff }; capture(cv, ev); ev.preventDefault(); return; }
    }
    const mm = pxSo(tf, p.x, p.y);
    if (mm.depth < 0 || p.y > tf.H - 30) return;
    addPoint({ standoff: mm.standoff, depth: mm.depth, x: st().probe ? st().probe.x - tf.side * mm.standoff : 0 });
    ev.preventDefault();
  }
  function onUp() { P.drag = null; }
  function onLeave() { if (!P.drag) { P.cursor = null; redrawSelf(); } }

  /**
   * Attach the plotter card to a canvas (#cv-plotter placed in the plan-view area by 90-app).
   * @param {HTMLCanvasElement} canvas
   */
  function init(canvas) {
    if (!canvas) return plotter;
    UT.dom.injectCss('view-plotter', plotter.css);
    P.canvas = canvas;
    canvas.classList.add('plot-card');
    canvas.style.touchAction = 'none';
    buildOverlay(canvas);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    P.subscribed = true;
    return plotter;
  }
  /** Draw the card (no-op while the canvas is hidden). */
  function draw(frame, state) {
    const cv = P.canvas;
    if (!cv) return;
    P.lastFrame = frame || P.lastFrame;
    const vis = visibleCanvas(cv);
    syncOverlay(vis);
    if (!vis) return;
    const ctx = UT.dom.fitCanvas(cv);
    try { drawCard(ctx, frame, state || st()); } catch (e) { console.error('[UT.views.plotter]', e); }
  }
  function ensureFallbackWindow() {
    if (P.canvas || P.win) return P.win;
    const cv = UT.dom.h('canvas', { id: 'cv-plotter', width: 820, height: 280, style: { width: '820px', height: '280px', display: 'block' } });
    const wrap = UT.dom.h('div', { class: 'plot-wrap', style: { position: 'relative' } }, [cv]);
    P.win = UT.dom.win({ name: 'plotter', title: 'Plotter', x: 450, y: 100, content: wrap, onClose: function () { P.open = false; } });
    init(cv);
    return P.win;
  }
  function open() {
    P.open = true;
    UT.dom.injectCss('view-plotter', plotter.css);
    if (!P.canvas) ensureFallbackWindow();
    if (P.win) P.win.show();
    UT.requestRender();
    return plotter;
  }
  function close() { P.open = false; if (P.win) P.win.hide(); return plotter; }
  function toggle() { return P.open ? close() : open(); }

  const plotter = {
    init, draw, toPx, toMm, fit, markEdge, erase, toggleMirror, open, close, toggle,
    isOpen() { return P.open; },
    get window() { return P.win; },
    get canvas() { return P.canvas; },
    /** Pure helpers (exposed for tests). */
    helpers: { cardTransform, soPx, pxSo, nearestHoleOnRay, readoutLines, sharedScale },
    css: [
      '.plot-card{display:block;background:#fff;cursor:crosshair;user-select:none;-webkit-user-select:none;touch-action:none}',
      '.plot-overlay{position:absolute;pointer-events:none;z-index:5}',
      '.plot-overlay-left{position:absolute;left:8px;bottom:30px}',
      '.plot-overlay-right{position:absolute;right:8px;bottom:30px;display:flex;gap:6px}',
      '.plot-btn{pointer-events:auto;font:12px "Segoe UI",Arial,sans-serif;padding:3px 12px;background:#ececec;border:1px solid #888;border-radius:2px;box-shadow:1px 1px 0 #fff inset,-1px -1px 0 #999 inset;cursor:pointer;color:#111}',
      '.plot-btn:active{box-shadow:-1px -1px 0 #fff inset,1px 1px 0 #999 inset}',
      '.win[data-win=plotter] .win-body{padding:0}',
    ].join('\n'),
    __selftest() {
      const f = [];
      const tf = cardTransform(800, 270, { T: 45 }, { side: 1 }, { refracted: 60, halfAngle20dB: 3.2 }, 4, 600);
      if (!tf.aligned || tf.indexPx !== 600) f.push('aligned index ' + JSON.stringify(tf));
      if (Math.abs(tf.bottomPx - (SURFACE_Y + 180)) > 1e-9) f.push('bottomPx ' + tf.bottomPx);
      if (Math.abs(tf.th20 - 3.2) > 1e-9) f.push('th20 not carried');
      const q = soPx(tf, 22.5, 13), back = pxSo(tf, q.x, q.y);
      if (Math.abs(back.standoff - 22.5) > 1e-9 || Math.abs(back.depth - 13) > 1e-9) f.push('so/px roundtrip');
      if (q.x >= tf.indexPx) f.push('standoff should go toward the beam (−x for side +1)');
      const tf2 = cardTransform(800, 270, { T: 45 }, { side: 1 }, { refracted: 60 }, 4, 100);
      if (tf2.aligned || Math.abs(tf2.indexPx - (800 - 80)) > 1e-9) f.push('fallback index ' + tf2.indexPx);
      const tf3 = cardTransform(800, 270, { T: 45 }, { side: 1 }, null, 0, null);
      if (tf3.scale !== 4) f.push('fallback scale');
      if (UT.specimens && UT.specimens.iow) {
        const sp = UT.specimens.iow();
        const pick = nearestHoleOnRay(sp, { x: 262.5, side: 1, angle: 60 }, { refracted: 60 });
        if (!pick || pick.hole.label !== '13mm' || Math.abs(pick.standoff - 22.5) > 0.01) f.push('nearest hole ' + JSON.stringify(pick && { l: pick.hole.label, so: pick.standoff }));
        const pick2 = nearestHoleOnRay(sp, { x: 60 + 43 * Math.tan(M.deg2rad(60)), side: 1 }, { refracted: 60 });
        if (!pick2 || pick2.hole.label !== '43mm') f.push('nearest hole 43');
      }
      const r1 = readoutLines(cardTransform(800, 600, { T: 100 }, { side: 1 }, null, 4, 600), { standoff: 130, depth: 75 });
      if (!(r1.length === 2 && r1[0] === 'HALF SKIP BEAMPATH DISTANCE=150mm' && r1[1] === 'HALF SKIP STANDOFF=130mm')) f.push('readouts half ' + JSON.stringify(r1));
      const r2 = readoutLines(cardTransform(800, 400, { T: 20 }, { side: 1 }, null, 4, 600), { standoff: 30, depth: 30 });
      if (!(r2.length === 3 && r2[2] === 'FULL SKIP DEPTH=10mm')) f.push('readouts full ' + JSON.stringify(r2));
      return f;
    },
  };
  UT.views.plotter = plotter;

  // ==================================================================== RADIOGRAPH
  const R = { win: null, canvas: null, caption: null, subscribed: false };
  const RAD_W = 600, RAD_H = 140, RAD_X0 = 20, RAD_SPAN = 560, RAD_PXMM = 2;

  /** Indication darkness 0..1 from the through-thickness height. */
  function radIntensity(height) { return M.clamp(0.35 + (height || 0) / 6, 0.35, 1); }
  function radHidden(state) { return !!(state.trade && state.trade.active && !state.trade.revealed); }

  function drawIndication(ctx, d, sp, sz) {
    const b = bboxOf(d);
    const a = radIntensity(d.height);
    const wrap = !!(sp && sp.pipe);
    const yc = RAD_H / 2 + b.cx * RAD_PXMM;
    const pieces = zPieces(d.zFrom, d.zTo, sp ? sp.L : 300, wrap);
    const rnd = M.rng((d.id || 1) * 97 + 13);
    for (const pc of pieces) {
      const x0 = RAD_X0 + pc[0] * sz, x1 = RAD_X0 + pc[1] * sz;
      if (x1 - x0 < 0.5) continue;
      ctx.save();
      if (isPlanarType(d.type)) {
        if (d.type === 'lamination') {
          const h = Math.max(4, b.w * RAD_PXMM);
          ctx.fillStyle = 'rgba(0,0,0,' + (a * 0.7).toFixed(2) + ')';
          ctx.fillRect(x0, yc - h / 2, x1 - x0, h);
        } else {
          ctx.strokeStyle = 'rgba(0,0,0,' + a.toFixed(2) + ')';
          ctx.lineWidth = M.clamp((d.height || 1) * 0.4, 1, 3);
          ctx.beginPath(); ctx.moveTo(x0, yc);
          if (d.type === 'crack' || d.type === 'root') {
            const n = Math.max(2, Math.round((x1 - x0) / 6));
            for (let i = 1; i <= n; i++) ctx.lineTo(x0 + (x1 - x0) * i / n, yc + (rnd() - 0.5) * 3);
          } else ctx.lineTo(x1, yc);
          ctx.stroke();
        }
      } else {
        const ry = Math.max(3, (b.w * RAD_PXMM) / 2 + 1);
        if (d.type === 'porosity') {
          const n = M.clamp(Math.round((x1 - x0) / 5), 3, 14);
          for (let i = 0; i < n; i++) {
            const cx = x0 + (x1 - x0) * (i + 0.5) / n + (rnd() - 0.5) * 3, cy = yc + (rnd() - 0.5) * ry * 1.5, r = 1.2 + rnd() * 1.8;
            const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 1.6);
            g.addColorStop(0, 'rgba(0,0,0,' + a.toFixed(2) + ')'); g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r * 1.6, 0, Math.PI * 2); ctx.fill();
          }
        } else {
          const rx = (x1 - x0) / 2, cx = (x0 + x1) / 2;
          const g = ctx.createRadialGradient(cx, yc, 0, cx, yc, 1);
          g.addColorStop(0, 'rgba(0,0,0,' + a.toFixed(2) + ')'); g.addColorStop(0.7, 'rgba(0,0,0,' + (a * 0.6).toFixed(2) + ')'); g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.save(); ctx.translate(cx, yc); ctx.scale(rx, ry); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        }
      }
      ctx.restore();
    }
  }

  function drawRad(ctx, frame, state) {
    const sp = state.specimen;
    const L = sp ? sp.L : 300;
    const sz = RAD_SPAN / L;
    ctx.save();
    ctx.fillStyle = '#1b1b1b'; ctx.fillRect(0, 0, RAD_W, RAD_H);
    const vg = ctx.createLinearGradient(0, 0, 0, RAD_H);
    vg.addColorStop(0, 'rgba(255,255,255,0.05)'); vg.addColorStop(0.5, 'rgba(255,255,255,0)'); vg.addColorStop(1, 'rgba(255,255,255,0.05)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, RAD_W, RAD_H);
    if (sp && sp.weld && sp.weld.type !== 'none') {
      const capW = (sp.weld.capWidth || 16) * RAD_PXMM, rootW = ((sp.weld.rootGap || 2) + 3) * RAD_PXMM;
      const yc = RAD_H / 2;
      const g = ctx.createLinearGradient(0, yc - capW / 2 - 4, 0, yc + capW / 2 + 4);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.15, 'rgba(255,255,255,0.16)'); g.addColorStop(0.5, 'rgba(255,255,255,0.2)'); g.addColorStop(0.85, 'rgba(255,255,255,0.16)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(RAD_X0, yc - capW / 2 - 4, RAD_SPAN, capW + 8);
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(RAD_X0, yc - rootW / 2, RAD_SPAN, rootW);
      ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
      for (let x = RAD_X0; x < RAD_X0 + RAD_SPAN; x += 6) { ctx.beginPath(); ctx.arc(x, yc, capW / 2, -Math.PI / 2, Math.PI / 2); ctx.stroke(); }
    } else if (sp) {
      ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(RAD_X0, 10, RAD_SPAN, RAD_H - 20);
    }
    const hidden = radHidden(state);
    if (!hidden) for (const d of state.defects || []) { if (d && d.pts && d.pts.length >= 2 && d.visible !== false) drawIndication(ctx, d, sp, sz); }
    ctx.save();
    const ix = RAD_X0 + 6, iy0 = 14, iy1 = RAD_H - 40;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    for (let i = 0; i < 7; i++) { ctx.lineWidth = 3.2 - i * 0.42; const x = ix + i * 5 + 0.5; ctx.beginPath(); ctx.moveTo(x, iy0); ctx.lineTo(x, iy1); ctx.stroke(); }
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.font = '9px Arial, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('FE EN 10', ix - 2, iy1 + 3);
    ctx.textAlign = 'right'; ctx.fillText('UTsim', RAD_W - 6, 4);
    ctx.restore();
    ctx.strokeStyle = '#9a9a9a'; ctx.fillStyle = '#b0b0b0'; ctx.lineWidth = 1; ctx.font = FONT_SMALL; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.beginPath(); ctx.moveTo(RAD_X0, RAD_H - 12.5); ctx.lineTo(RAD_X0 + RAD_SPAN, RAD_H - 12.5); ctx.stroke();
    for (let z = 0; z <= L + 1e-6; z += 10) {
      const x = Math.round(RAD_X0 + z * sz) + 0.5;
      const big = z % 50 === 0;
      ctx.beginPath(); ctx.moveTo(x, RAD_H - 12); ctx.lineTo(x, RAD_H - 12 + (big ? 6 : 3)); ctx.stroke();
      if (big && z + 25 <= L + 1e-6) ctx.fillText(String(Math.round(z)), x, RAD_H - 1);
    }
    ctx.textAlign = 'right'; ctx.fillText(Math.round(L) + ' mm', RAD_X0 + RAD_SPAN, RAD_H - 1);
    if (state.probe) {
      const x = RAD_X0 + M.clamp(state.probe.z, 0, L) * sz;
      ctx.fillStyle = '#22e022'; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x - 5, -1); ctx.lineTo(x, 7); ctx.lineTo(x + 5, -1); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(34,224,34,0.35)'; dashed(ctx, [2, 3]); ctx.beginPath(); ctx.moveTo(x + 0.5, 7); ctx.lineTo(x + 0.5, RAD_H - 12); ctx.stroke(); dashed(ctx, []);
    }
    if (hidden) { ctx.fillStyle = '#ffd21e'; ctx.font = FONT_BOLD; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('Trade test — film withheld until reveal', RAD_W / 2, RAD_H / 2); }
    ctx.restore();
    if (R.caption) {
      const n = hidden ? 0 : (state.defects || []).filter(function (d) { return d && d.pts && d.pts.length >= 2 && d.visible !== false; }).length;
      const ind = hidden ? t('indications hidden') : (n === 1 ? t('1 indication') : t('{n} indications', { n }));
      R.caption.textContent = t('Radiograph of the weld along z (0…{L} mm{circ})  —  {ind}  |  probe z = {z} mm', { L: Math.round(L), circ: sp && sp.pipe ? t(', circumference') : '', ind, z: state.probe ? Math.round(state.probe.z) : 0 });
    }
  }

  function radEnsure() {
    if (R.win) return R.win;
    UT.dom.injectCss('view-plotter', plotter.css);
    UT.dom.injectCss('view-radiograph', radiograph.css);
    R.canvas = UT.dom.h('canvas', { id: 'cv-rad', width: RAD_W, height: RAD_H, style: { width: RAD_W + 'px', height: RAD_H + 'px', display: 'block' } });
    R.caption = UT.dom.h('div', { class: 'rad-caption' }, '');
    const body = UT.dom.h('div', { class: 'rad-body' }, [R.canvas, R.caption]);
    R.win = UT.dom.win({ name: 'rad', title: 'Radiograph', x: 460, y: 420, content: body, onShow: function () { UT.requestRender(); } });
    R.subscribed = true;
    return R.win;
  }
  const radiograph = {
    get window() { return R.win; },
    get canvas() { return R.canvas; },
    /** Open (create lazily) the Radiograph window. */
    open() { radEnsure().show(); return radiograph; },
    close() { if (R.win) R.win.hide(); return radiograph; },
    toggle() { return R.win && R.win.isOpen() ? radiograph.close() : radiograph.open(); },
    isOpen() { return !!(R.win && R.win.isOpen()); },
    /** Draw the film strip (no-op while the window is closed). */
    draw(frame, state) {
      if (!R.win || !R.win.isOpen() || !R.canvas) return;
      const ctx = UT.dom.fitCanvas(R.canvas, RAD_W, RAD_H);
      try { drawRad(ctx, frame, state || st()); } catch (e) { console.error('[UT.views.radiograph]', e); }
    },
    helpers: { radIntensity, radHidden, zPieces },
    css: [
      '.win[data-win=rad] .win-body{padding:6px;background:#3a3a3a}',
      '.win[data-win=rad] .rad-body{display:flex;flex-direction:column;gap:4px}',
      '.win[data-win=rad] #cv-rad{border:1px solid #000;box-shadow:0 0 0 3px #555}',
      '.win[data-win=rad] .rad-caption{color:#ddd;font:11px "Segoe UI",Arial,sans-serif;padding:2px 2px 0}',
    ].join('\n'),
    __selftest() {
      const f = [];
      if (Math.abs(radIntensity(3) - 0.85) > 1e-9) f.push('radIntensity(3) ' + radIntensity(3));
      if (radIntensity(0) !== 0.35 || radIntensity(50) !== 1) f.push('radIntensity clamp');
      const pcs = zPieces(490, 10, 500, true);
      if (!(pcs.length === 2 && pcs[0][0] === 490 && pcs[0][1] === 500 && pcs[1][1] === 10)) f.push('zPieces wrap ' + JSON.stringify(pcs));
      if (zPieces(120, 150, 300, false).length !== 1) f.push('zPieces plain');
      if (!radHidden({ trade: { active: true, revealed: false } }) || radHidden({ trade: { active: true, revealed: true } }) || radHidden({ trade: { active: false } })) f.push('radHidden');
      return f;
    },
  };
  UT.views.radiograph = radiograph;

  // ==================================================================== ECHO-DYNAMIC BUFFER (shared by sizing + window)
  const ED = { samples: [], cap: 200, lastX: null, lastZ: null, win: null, canvas: null, els: null, cursor: null };
  const BS = { cols: [], cap: 600, nBins: 160, depthMax: null, lastX: null, lastZ: null, win: null, canvas: null, els: null, off: null, cursor: null };

  /** ISO 23279 echo-dynamic beam widths at −6 dB (mm): x-scan w6x and z-scan w6z. */
  function beamWidths6(derived, path) {
    const d = derived || {};
    const lam = d.lambda || 0.648, a = d.crystalA || d.diameter || 10, b = d.crystalB || a;
    const th = M.deg2rad(d.refracted || 0), th6 = M.deg2rad(d.halfAngle6dB || M.rad2deg(Math.asin(M.clamp(0.51 * lam / a, 0, 0.999))));
    const p = Math.max(0, path || 0);
    return {
      w6x: 2 * p * Math.tan(th6) / Math.max(Math.cos(th), 1e-6) + a,
      w6z: 2 * (p * Math.tan(Math.asin(M.clamp(0.51 * lam / b, 0, 0.999))) + b / 2),
    };
  }
  /**
   * Classify a set of echo-dynamic samples ({x, z, pct, path}) → {pattern 0|1|2|3, name, axis, width6, w6, maxPct, n, posMax}.
   * Pattern 1 = single sharp peak (point-like), 2 = smooth plateau > 2·w6 (extended, smooth), 3 = ragged plateau (extended, rough).
   */
  function classify(samples, derived) {
    const out = { pattern: 0, name: 'insufficient data', axis: 'z', width6: null, w6: null, maxPct: 0, n: (samples || []).length, posMax: null };
    if (!samples || samples.length < 5) return out;
    let xMin = Infinity, xMax = -Infinity, zMin = Infinity, zMax = -Infinity;
    for (const s of samples) { xMin = Math.min(xMin, s.x); xMax = Math.max(xMax, s.x); zMin = Math.min(zMin, s.z); zMax = Math.max(zMax, s.z); }
    const axis = (zMax - zMin) > (xMax - xMin) ? 'z' : 'x';
    out.axis = axis;
    const byPos = new Map();
    for (const s of samples) { const k = Math.round((axis === 'x' ? s.x : s.z) * 4) / 4; const prev = byPos.get(k); if (!prev || s.pct > prev.pct) byPos.set(k, { pos: k, pct: s.pct, path: s.path }); }
    const pts = Array.from(byPos.values()).sort(function (a, b) { return a.pos - b.pos; });
    if (pts.length < 3) return out;
    let iMax = 0;
    for (let i = 1; i < pts.length; i++) if (pts[i].pct > pts[iMax].pct) iMax = i;
    const max = pts[iMax].pct;
    out.maxPct = max; out.posMax = pts[iMax].pos;
    if (max < 5) { out.name = 'no echo'; return out; }
    const thr = max / 2;
    const crossing = function (i, j) { const a = pts[i], b = pts[j]; if (a.pct === b.pct) return b.pos; return a.pos + (a.pct - thr) / (a.pct - b.pct) * (b.pos - a.pos); };
    let iL = iMax; while (iL > 0 && pts[iL - 1].pct >= thr) iL--;
    let iR = iMax; while (iR < pts.length - 1 && pts[iR + 1].pct >= thr) iR++;
    const posL = iL > 0 ? crossing(iL, iL - 1) : pts[iL].pos;
    const posR = iR < pts.length - 1 ? crossing(iR, iR + 1) : pts[iR].pos;
    const width6 = posR - posL;
    const bw = beamWidths6(derived, pts[iMax].path || 30);
    const w6 = axis === 'x' ? bw.w6x : bw.w6z;
    out.width6 = +width6.toFixed(1); out.w6 = +w6.toFixed(1);
    out.openEnded = iL === 0 || iR === pts.length - 1;
    if (width6 <= 2 * w6) { out.pattern = 1; out.name = width6 <= 1.5 * w6 ? 'point-like' : 'point-like (slightly extended)'; return out; }
    // raggedness inside the plateau: dips ≥ 3 dB between local maxima, or a high coefficient of variation
    let dips = 0, sum = 0, sum2 = 0, cnt = 0;
    let lastPeak = pts[iL].pct, minSince = pts[iL].pct;
    const core = max * 0.708;   // −3 dB: the plateau proper, excluding the sloped flanks
    for (let i = iL; i <= iR; i++) {
      const v = pts[i].pct;
      if (v >= core) { sum += v; sum2 += v * v; cnt++; }
      if (v < minSince) minSince = v;
      if (v > lastPeak) { lastPeak = v; minSince = v; }
      else if (v >= minSince / 0.708 && minSince <= lastPeak * 0.708 && v <= lastPeak) { dips++; lastPeak = v; minSince = v; }
    }
    const mean = cnt ? sum / cnt : 0, cv = mean > 0 ? Math.sqrt(Math.max(0, sum2 / cnt - mean * mean)) / mean : 0;
    out.dips = dips; out.cv = +cv.toFixed(3);
    if (dips >= 1 || cv > 0.12) { out.pattern = 3; out.name = 'extended, rough'; } else { out.pattern = 2; out.name = 'extended, smooth'; }
    return out;
  }
  function edRecord(frame, state) {
    const pr = state.probe; if (!pr) return;
    if (ED.lastX !== null && Math.abs(pr.x - ED.lastX) < 0.01 && Math.abs(pr.z - ED.lastZ) < 0.01) return;
    ED.lastX = pr.x; ED.lastZ = pr.z;
    const r = frame && frame.readouts && frame.readouts.primary;
    ED.samples.push({ x: +pr.x.toFixed(2), z: +pr.z.toFixed(2), pct: r ? +r.peakPct.toFixed(2) : 0, path: r ? +r.path.toFixed(2) : null, kind: r ? r.echoKind : null });
    if (ED.samples.length > ED.cap) ED.samples.splice(0, ED.samples.length - ED.cap);
  }
  function edClear() { ED.samples = []; ED.lastX = null; ED.lastZ = null; }

  // ==================================================================== SIZING (v2)
  const Z = { win: null, els: null, canvas: null, subscribed: false, userChose: false, maxPct: 0, tips: null };
  const SZ_W = 300, SZ_H = 56;
  const METHODS = ['6dB', '20dB', 'max', 'eval', 'tip'];
  const METHOD_LABELS = { '6dB': '6 dB drop', '20dB': '20 dB drop (z-plane corrected)', max: 'Max-amplitude (echo-dynamic ends)', eval: 'Evaluation-level drop (fixed level)', tip: 'Tip diffraction (height)' };
  const LENGTH_METHOD_TO_SIZING = { 'eval-level': 'eval', '6dB': '6dB', '50pct': 'eval' };
  const FALLBACK_RULES = {
    iso11666: { lengthMethod: 'eval-level', levels: { AL2: -10, AL3: -6 }, name: 'ISO 11666' },
    iso17640: { lengthMethod: 'eval-level', evalDb: -10, name: 'ISO 17640' },
    asme8: { lengthMethod: '50pct', evalDb: -6, name: 'ASME VIII App. 12' },
    awsd11: { lengthMethod: '6dB', evalDb: null, name: 'AWS D1.1' },
  };

  /** z-plane beam half-widths at a sound path (mm): wz6 (−6 dB) and wz20 (−20 dB, = hz; crystalB/2 inside the near field). */
  function zWidths(derived, path) {
    const d = derived || {};
    const lam = d.lambda || 0.648, b = d.crystalB || d.diameter || 10;
    const p = Math.max(0, path || 0);
    const wz6 = p * Math.tan(Math.asin(M.clamp(0.51 * lam / b, 0, 0.999))) + b / 2;
    const wz20 = (d.nearField && p < d.nearField) ? b / 2 : p * Math.tan(Math.asin(M.clamp(0.87 * lam / b, 0, 0.999))) + b / 2;
    return { wz6, wz20 };
  }
  /** Through-wall (x) 20 dB edge projection at a depth: {near, far} x positions of the beam edges. */
  function edgeX(probe, derived, depth) {
    const side = (probe && probe.side) || 1, th = derived ? derived.refracted : (probe ? probe.angle : 0), th20 = derived && derived.halfAngle20dB ? derived.halfAngle20dB : 0;
    return { near: probe.x - side * depth * Math.tan(M.deg2rad(th - th20)), far: probe.x - side * depth * Math.tan(M.deg2rad(th + th20)) };
  }
  /** Standards rule info for the current state: {ruleId, lengthMethod, sizingMethod, evalDb, label}. */
  function ruleInfo(state) {
    const s = state || st();
    const std = (s.standards && s.standards.standard) || 'iso11666';
    const level = (s.standards && s.standards.level) || 'AL2';
    const tech = (s.standards && s.standards.technique) || 1;
    let lengthMethod = null, evalDb = null, label = std;
    let rule = null;
    try {
      const rules = (s.standards && s.standards.rulesOverride && typeof s.standards.rulesOverride === 'object' ? s.standards.rulesOverride : null) || (UT.standards && UT.standards.rules) || null;
      rule = rules && rules[std] ? rules[std] : null;
    } catch (e) { rule = null; }
    if (rule) {
      lengthMethod = rule.lengthMethod || null;
      label = rule.reference || std;
      if (rule.levels && rule.levels[level] && Number.isFinite(rule.levels[level].evaluationDb)) evalDb = rule.levels[level].evaluationDb;
      else if (rule.techniques && rule.techniques[tech] && Number.isFinite(rule.techniques[tech].evaluationDb)) evalDb = rule.techniques[tech].evaluationDb;
      else if (rule.lengthMethod === '50pct') evalDb = -6;
    }
    const fb = FALLBACK_RULES[std];
    if (fb) {
      if (!lengthMethod) lengthMethod = fb.lengthMethod;
      if (evalDb === null) evalDb = fb.levels ? (fb.levels[level] === undefined ? fb.levels.AL2 : fb.levels[level]) : fb.evalDb;
      if (!rule) label = fb.name;
    }
    if (!lengthMethod) lengthMethod = '6dB';
    if (evalDb === null) evalDb = -10;
    const FB_NAMES = { 'eval-level': { ko: '평가 레벨 고정법', en: 'fixed evaluation level' }, '6dB': { ko: '6 dB 강하법', en: '6 dB drop' }, '50pct': { ko: '50 % 진폭법 (ASME)', en: '50 % amplitude (ASME)' } };
    let methodLabel = lengthMethod;
    try { const nm = (UT.standards && UT.standards.lengthMethodNames && UT.standards.lengthMethodNames[lengthMethod]) || FB_NAMES[lengthMethod]; if (nm) methodLabel = (UT.i18n && UT.i18n.lang === 'ko' ? nm.ko : nm.en) || lengthMethod; } catch (e) { /* ignore */ }
    return { ruleId: std, level, lengthMethod, sizingMethod: LENGTH_METHOD_TO_SIZING[lengthMethod] || '6dB', evalDb, label, methodLabel };
  }
  /** Reference echo height (% FSH) at the current gain: 80 % at refGain. */
  function refPctOf(instrument) {
    const g = instrument ? (instrument.gain || 0) : 0, rg = instrument && Number.isFinite(instrument.refGain) ? instrument.refGain : g;
    return 80 * Math.pow(10, (g - rg) / 20);
  }
  /** Marking threshold (% FSH) for a method given the running max / reference: {pct, text}. */
  function thresholdOf(method, ctx) {
    const c = ctx || {};
    if (method === '6dB') return { pct: c.maxPct ? c.maxPct * 0.5 : null, text: 'mark where the echo has dropped to 50 % of its maximum' };
    if (method === '20dB') return { pct: c.maxPct ? c.maxPct * 0.1 : null, text: 'mark where the echo has dropped to 10 % of its maximum' };
    if (method === 'max') return { pct: c.maxPct ? c.maxPct * 0.8 : null, text: 'mark the LAST position where the echo is still ≥ 80 % of its maximum' };
    if (method === 'eval') return { pct: (c.refPct || 80) * Math.pow(10, (c.evalDb === undefined ? -10 : c.evalDb) / 20), text: 'mark where the echo falls below the evaluation level' };
    return { pct: null, text: 'gate the two tip echoes of the indication and press Measure tips' };
  }
  /** Measured length from L/R marks (shorter way round on pipes) or null. */
  function sizingLength(marks, sp) {
    const L = (marks || []).find(function (m) { return m.side === 'L'; }), Rm = (marks || []).find(function (m) { return m.side === 'R'; });
    if (!L || !Rm) return null;
    let len = Math.abs(Rm.z - L.z);
    if (sp && sp.pipe && sp.L > 0) len = Math.min(len, sp.L - len);
    return +len.toFixed(1);
  }
  /** Defect whose z-centre is nearest zRef (wrapping on pipes) or null. */
  function nearestDefect(defects, sp, zRef) {
    let best = null, bd = Infinity;
    for (const d of defects || []) {
      if (!d || !d.pts || d.pts.length < 2) continue;
      const len = defectLen(d, sp);
      let zc = d.zFrom + len / 2;
      if (sp && sp.pipe && sp.L > 0) zc = ((zc % sp.L) + sp.L) % sp.L;
      let dz = Math.abs(zc - zRef);
      if (sp && sp.pipe && sp.L > 0) dz = Math.min(dz, sp.L - dz);
      if (dz < bd) { bd = dz; best = d; }
    }
    return best;
  }
  /**
   * Pair tip-like echoes for a height: two 'tip' echoes of the same defect and leg first, then a tip with the
   * same-leg 'corner' echo (surface-breaking crack), then any two tips of the defect (warning: different legs).
   * list = [{path, kind, ampPct, defectId, leg}] already filtered to the gate. → {height, tips, warning}.
   */
  function pairTips(list, thetaRad) {
    const tips = list.filter(function (e) { return e.kind === 'tip'; }).sort(function (a, b) { return (b.ampPct || 0) - (a.ampPct || 0); });
    const h = function (a, b) { return +(Math.abs(a.path - b.path) * Math.cos(thetaRad)).toFixed(1); };
    if (!tips.length) return { height: null, tips: [], warning: 'no tip echoes in the gate' };
    for (const a of tips) {   // anchors in amplitude order: a same-leg partner (tip, then corner) wins over any cross-leg pair
      const sameLeg = tips.find(function (e) { return e !== a && e.defectId === a.defectId && e.leg === a.leg; });
      if (sameLeg) return { height: h(a, sameLeg), tips: [a, sameLeg], warning: null };
      const corners = list.filter(function (e) { return e.kind === 'corner' && e.path > a.path && (e.leg === a.leg || e.leg === undefined) && (e.defectId === undefined || a.defectId === undefined || e.defectId === a.defectId); }).sort(function (p, q) { return p.path - q.path; });
      if (corners.length) return { height: h(a, corners[0]), tips: [a, corners[0]], warning: 'surface-breaking: one tip echo paired with the corner echo' };
    }
    const a = tips[0];
    const other = tips.find(function (e) { return e !== a && e.defectId === a.defectId; });
    if (other) return { height: h(a, other), tips: [a, other], warning: 'tip echoes from different legs — check the pairing' };
    return { height: null, tips: [a], warning: 'only one tip echo in the gate — move the probe to see both tips' };
  }
  /** Tip-diffraction height from the echoes in the active gate: {height, tips:[{path, kind, ampPct}], warning}. */
  function tipHeight(frame, state) {
    const s = state || st();
    const echoes = (frame && frame.echoes) || [];
    const d = derivedOf(frame, s);
    const th = M.deg2rad(d ? d.refracted : (s.probe ? s.probe.angle : 0));
    const inst = s.instrument || {}, gates = inst.gates || [], g = gates[inst.activeGate || 0] || gates[0];
    const inGate = function (e) { if (!g || !g.on) return true; return e.path >= g.start - 0.5 && e.path <= g.start + g.width + 0.5; };
    const vis = echoes.filter(function (e) { return e && Number.isFinite(e.path) && (e.kind === 'tip' || e.kind === 'corner') && (e.ampPct === undefined || e.ampPct >= 0.5) && inGate(e); })
      .map(function (e) { return { path: +e.path.toFixed(2), kind: e.kind, ampPct: e.ampPct === undefined ? null : +e.ampPct.toFixed(1), defectId: e.defectId, leg: e.leg }; });
    return pairTips(vis, th);
  }
  /**
   * Pure sizing result from marks. ctx = {sp, derived, path, refPct, evalDb, tipInfo}.
   * @returns {{method, length, height, warning, zFrom, zTo, depth, corr}|null}
   */
  function computeResult(marks, method, ctx) {
    const c = ctx || {};
    const m = METHODS.indexOf(method) >= 0 ? method : '6dB';
    const L = (marks || []).find(function (k) { return k.side === 'L'; }), Rm = (marks || []).find(function (k) { return k.side === 'R'; });
    if (m === 'tip') {
      const ti = c.tipInfo || { height: null, tips: [], warning: 'no tip echoes in the gate' };
      const len = sizingLength(marks, c.sp);
      return { method: m, length: len, height: ti.height, warning: ti.warning, tips: ti.tips, zFrom: L && Rm ? Math.min(L.z, Rm.z) : null, zTo: L && Rm ? Math.max(L.z, Rm.z) : null, depth: c.depth === undefined ? null : c.depth, corr: 0 };
    }
    const raw = sizingLength(marks, c.sp);
    if (raw === null) return null;
    const paths = [L, Rm].map(function (k) { return k && Number.isFinite(k.path) ? k.path : null; }).filter(function (p) { return p !== null; });
    const path = paths.length ? paths.reduce(function (a, b) { return a + b; }, 0) / paths.length : (Number.isFinite(c.path) ? c.path : 30);
    const w = zWidths(c.derived, path);
    let length = raw, corr = 0, warning = null;
    if (m === '20dB') { corr = 2 * w.wz20; length = raw - corr; if (length < 0) { warning = '20 dB drop: marks closer than the beam width — reflector smaller than the beam'; length = 0; } }
    else if (m === '6dB' && raw < 2 * w.wz6) warning = '6 dB drop under-sizes reflectors smaller than the beam (width here ≈ ' + (2 * w.wz6).toFixed(1) + ' mm)';
    const depth = c.depth !== undefined ? c.depth : ([L, Rm].map(function (k) { return k && Number.isFinite(k.depth) ? k.depth : null; }).filter(function (v) { return v !== null; })[0] || null);
    return { method: m, length: +length.toFixed(1), height: c.tipInfo && Number.isFinite(c.tipInfo.height) ? c.tipInfo.height : null, warning, zFrom: Math.min(L.z, Rm.z), zTo: Math.max(L.z, Rm.z), depth, corr: +corr.toFixed(2), path: +path.toFixed(1), wz6: +w.wz6.toFixed(2), wz20: +w.wz20.toFixed(2) };
  }
  function resultCtx(frame, s) {
    const r = frame && frame.readouts && frame.readouts.primary;
    return { sp: s.specimen, derived: derivedOf(frame, s), path: r ? r.path : undefined, depth: r ? +r.dp.toFixed(1) : undefined, refPct: refPctOf(s.instrument), evalDb: ruleInfo(s).evalDb, tipInfo: s.sizing && s.sizing.method === 'tip' ? tipHeight(frame, s) : null };
  }
  function writeSizing(marks, method, statusText) {
    const s = st();
    const result = computeResult(marks, method, resultCtx(UT.frame, s));
    UT.setIn('sizing', { marks, method, result });
    if (statusText !== undefined) UT.status({ right: statusText });
    return result;
  }
  function normaliseMarks(marks, s) {
    const r = UT.frame && UT.frame.readouts && UT.frame.readouts.primary;
    const mk = function (side, z, extra) { return Object.assign({ side, z: +(+z).toFixed(1), x: s.probe ? s.probe.x : 0, depth: r ? +r.dp.toFixed(1) : null, ampPct: r ? +r.peakPct.toFixed(1) : null, path: r ? +r.path.toFixed(2) : null }, extra || {}); };
    if (!marks) return (s.sizing && s.sizing.marks) || [];
    if (Array.isArray(marks)) {
      if (marks.length >= 2 && typeof marks[0] === 'number' && typeof marks[1] === 'number') return [mk('L', Math.min(marks[0], marks[1])), mk('R', Math.max(marks[0], marks[1]))];
      const out = [];
      for (const m of marks) { if (m && (m.side === 'L' || m.side === 'R') && Number.isFinite(+m.z)) out.push(mk(m.side, m.z, m)); }
      return out.filter(function (m, i, arr) { return arr.findIndex(function (k) { return k.side === m.side; }) === i; });
    }
    if (typeof marks === 'object') { const out = []; if (Number.isFinite(+marks.L)) out.push(mk('L', marks.L)); if (Number.isFinite(+marks.R)) out.push(mk('R', marks.R)); return out; }
    return [];
  }
  function localMark(side) {
    const s = st();
    const method = (s.sizing && s.sizing.method) || '6dB';
    if (method === 'tip') return measureTips();
    const r = UT.frame && UT.frame.readouts && UT.frame.readouts.primary;
    const mark = { side, z: +s.probe.z.toFixed(1), x: s.probe.x, depth: r ? +r.dp.toFixed(1) : null, ampPct: r ? +r.peakPct.toFixed(1) : null, path: r ? +r.path.toFixed(2) : null };
    const marks = ((s.sizing && s.sizing.marks) || []).filter(function (m) { return m.side !== side; }).concat([mark]);
    const result = writeSizing(marks, method);
    UT.status({ right: result ? t('Sizing ({method}): length {len} mm', { method: t(METHOD_LABELS[method] || method), len: result.length }) : t('Mark {side} at z = {z} mm — now mark the other end', { side, z: mark.z }) });
    return mark;
  }
  /** Mark the left (low-z) drop point at the current probe z (tip method: measures the tips instead). */
  function markL() { return localMark('L'); }
  /** Mark the right (high-z) drop point at the current probe z (tip method: measures the tips instead). */
  function markR() { return localMark('R'); }
  /** Clear the sizing marks and result. */
  function clearMarks() { Z.maxPct = 0; Z.tips = null; UT.setIn('sizing', { marks: [], result: null }); }
  /** Set the sizing method ('6dB' | '20dB' | 'max' | 'eval' | 'tip'); recomputes the result from the existing marks. */
  function setMethod(m) {
    const method = METHODS.indexOf(m) >= 0 ? m : '6dB';
    Z.userChose = true;
    const s = st();
    const marks = (s.sizing && s.sizing.marks) || [];
    return writeSizing(marks, method);
  }
  /** Tip-diffraction height measurement from the current frame; writes sizing.result (method 'tip'). */
  function measureTips() {
    const s = st();
    const ti = tipHeight(UT.frame, s);
    Z.tips = ti;
    const result = computeResult((s.sizing && s.sizing.marks) || [], 'tip', Object.assign(resultCtx(UT.frame, s), { tipInfo: ti }));
    UT.setIn('sizing', { method: 'tip', result });
    UT.status({ right: ti.height === null ? t(ti.warning || 'no tip echoes in the gate') : t('Tip diffraction: height {h} mm ({p1} → {p2} mm)', { h: ti.height, p1: ti.tips[0].path, p2: ti.tips[1].path }) });
    return result;
  }
  /**
   * Tip-diffraction auto measurement: scans probe.x over ±span (default 15 mm, step 0.5) and maximises each
   * tip / corner echo separately (the real technique), then h = |Δpath|·cosθ of the two best maximised echoes.
   * Restores probe.x; writes sizing.result (method 'tip').
   */
  function autoTips(opts) {
    const o = opts || {};
    const s = st();
    if (!s.probe) return null;
    const x0 = s.probe.x, span = Math.max(2, o.span || 15), step = Math.max(0.25, o.step || 0.5);
    const inst = s.instrument || {}, gates = inst.gates || [], g = gates[inst.activeGate || 0] || gates[0];
    const inGate = function (e) { if (!g || !g.on) return true; return e.path >= g.start - 0.5 && e.path <= g.start + g.width + 0.5; };
    const groups = new Map();
    for (let x = x0 - span; x <= x0 + span + 1e-9; x += step) {
      UT.setIn('probe', { x: +x.toFixed(3) }, { noRender: true });
      const fr = UT.renderNow();
      for (const e of (fr && fr.echoes) || []) {
        if (!e || (e.kind !== 'tip' && e.kind !== 'corner') || !inGate(e) || !(e.ampPct >= 0.5)) continue;
        const key = e.kind + ':' + (e.defectId === undefined ? '?' : e.defectId) + ':' + (e.leg || 1);
        const prev = groups.get(key);
        if (!prev || e.ampPct > prev.ampPct) groups.set(key, { path: +e.path.toFixed(2), kind: e.kind, ampPct: +e.ampPct.toFixed(1), defectId: e.defectId, leg: e.leg, x: +x.toFixed(2) });
      }
    }
    UT.setIn('probe', { x: x0 }, { noRender: true });
    UT.renderNow();
    const d = derivedOf(UT.frame, s);
    const th = M.deg2rad(d ? d.refracted : (s.probe.angle || 0));
    const ti = pairTips(Array.from(groups.values()), th);
    Z.tips = ti;
    const result = computeResult((s.sizing && s.sizing.marks) || [], 'tip', Object.assign(resultCtx(UT.frame, st()), { tipInfo: ti }));
    result.auto = true;
    UT.setIn('sizing', { method: 'tip', result });
    UT.status({ right: ti.height === null ? t(ti.warning || 'no tip echoes in the gate') : t('Tip diffraction: height {h} mm ({p1} → {p2} mm)', { h: ti.height, p1: ti.tips[0].path, p2: ti.tips[1].path }) });
    return result;
  }
  /** Method recommended by the active standard: {ruleId, lengthMethod, sizingMethod, evalDb, label}. */
  function recommended(state) { return ruleInfo(state || st()); }
  /**
   * Synchronous helper scan along z: finds the gated maximum and the method's drop points, sets the marks,
   * restores probe.z. opts = {zFrom, zTo, step, method}. Returns sizing.result (null when nothing found).
   */
  function autoMarks(opts) {
    const o = opts || {};
    const s = st();
    if (!s.probe || !s.specimen) return null;
    const method = METHODS.indexOf(o.method) >= 0 ? o.method : ((s.sizing && s.sizing.method) || '6dB');
    if (method !== (s.sizing && s.sizing.method)) { UT.setIn('sizing', { method }, { noRender: true }); Z.userChose = true; }
    if (method === 'tip') return autoTips(o);
    const sp = s.specimen, Lmm = sp.L || 300;
    const z0 = s.probe.z;
    let zFrom = o.zFrom, zTo = o.zTo;
    if (!Number.isFinite(zFrom) || !Number.isFinite(zTo)) {
      const d = nearestDefect(s.defects, sp, z0);
      const c = d ? d.zFrom + defectLen(d, sp) / 2 : z0, half = d ? defectLen(d, sp) / 2 + 40 : 40;
      zFrom = Number.isFinite(zFrom) ? zFrom : c - half; zTo = Number.isFinite(zTo) ? zTo : c + half;
    }
    if (!(sp.pipe)) { zFrom = M.clamp(zFrom, 0, Lmm); zTo = M.clamp(zTo, 0, Lmm); }
    const step = Math.max(0.25, o.step || 1);
    const samples = [];
    for (let z = zFrom; z <= zTo + 1e-9; z += step) {
      UT.setIn('probe', { z: +z.toFixed(3) }, { noRender: true });
      const fr = UT.renderNow();
      const r = fr && fr.readouts && fr.readouts.primary;
      samples.push({ z: +z.toFixed(3), pct: r ? r.peakPct : 0, path: r ? r.path : null, dp: r ? r.dp : null });
    }
    UT.setIn('probe', { z: z0 }, { noRender: true });
    UT.renderNow();
    let iMax = 0;
    for (let i = 1; i < samples.length; i++) if (samples[i].pct > samples[iMax].pct) iMax = i;
    const max = samples[iMax].pct;
    if (!(max > 1)) { UT.status({ right: t('Auto sizing: no echo found along z') }); return null; }
    const ctx = { maxPct: max, refPct: refPctOf(s.instrument), evalDb: ruleInfo(s).evalDb };
    const thr = thresholdOf(method, ctx).pct;
    const mkMark = function (side, z, smp) { return { side, z: +z.toFixed(1), x: s.probe.x, depth: smp && Number.isFinite(smp.dp) ? +smp.dp.toFixed(1) : null, ampPct: smp ? +smp.pct.toFixed(1) : null, path: smp && Number.isFinite(smp.path) ? +smp.path.toFixed(2) : (samples[iMax].path === null ? null : +samples[iMax].path.toFixed(2)) }; };
    let mL, mR;
    if (method === 'max') {
      let iL = iMax; while (iL > 0 && samples[iL - 1].pct >= thr) iL--;
      let iR = iMax; while (iR < samples.length - 1 && samples[iR + 1].pct >= thr) iR++;
      mL = mkMark('L', samples[iL].z, samples[iL]); mR = mkMark('R', samples[iR].z, samples[iR]);
    } else {
      const walk = function (dir) {
        let i = iMax;
        while (i + dir >= 0 && i + dir < samples.length && samples[i + dir].pct >= thr) i += dir;
        const a = samples[i], b = samples[i + dir];
        if (!b) return { z: a.z, smp: a };
        const z = a.pct === b.pct ? b.z : a.z + (a.pct - thr) / (a.pct - b.pct) * (b.z - a.z);
        return { z, smp: a };
      };
      const l = walk(-1), r = walk(1);
      mL = mkMark('L', l.z, l.smp); mR = mkMark('R', r.z, r.smp);
    }
    mL.path = mR.path = samples[iMax].path === null ? null : +samples[iMax].path.toFixed(2);
    Z.maxPct = max;
    const result = writeSizing([mL, mR], method, t('Auto sizing ({method}): max {max} % at z {z}, length {len} mm', { method: t(METHOD_LABELS[method] || method), max: Math.round(max), z: samples[iMax].z.toFixed(1), len: '?' }));
    if (result) UT.status({ right: t('Auto sizing ({method}): max {max} % at z {z}, length {len} mm', { method: t(METHOD_LABELS[method] || method), max: Math.round(max), z: samples[iMax].z.toFixed(1), len: result.length }) });
    return result;
  }

  function sizingInfo(frame, state) {
    const s = state, sp = s.specimen;
    const marks = (s.sizing && s.sizing.marks) || [];
    const L = marks.find(function (m) { return m.side === 'L'; }), Rm = marks.find(function (m) { return m.side === 'R'; });
    const len = sizingLength(marks, sp);
    const r = frame && frame.readouts && frame.readouts.primary;
    const zRef = L && Rm ? (L.z + Rm.z) / 2 : (s.probe ? s.probe.z : 0);
    const reveal = !!((s.trade && s.trade.revealed) || !(s.display && s.display.hide));
    const d = reveal ? nearestDefect(s.defects, sp, zRef) : null;
    const method = (s.sizing && s.sizing.method) || '6dB';
    const b = d ? bboxOf(d) : null;
    return {
      L, R: Rm, len, r, reveal, d, method, result: (s.sizing && s.sizing.result) || null,
      trueLen: d ? +defectLen(d, sp).toFixed(1) : null,
      trueHeight: d ? +(Number.isFinite(d.height) ? d.height : b.h).toFixed(1) : null,
      trueDepth: b ? +b.yMin.toFixed(1) : null,
    };
  }

  function drawSizingBar(ctx, info, state) {
    const sp = state.specimen, Lmm = sp ? sp.L : 300;
    const x0 = 10, span = SZ_W - 20, sz = span / Lmm, yAxis = SZ_H - 14;
    ctx.save();
    ctx.fillStyle = '#fdfbd8'; ctx.fillRect(0, 0, SZ_W, SZ_H);
    ctx.strokeStyle = '#111'; ctx.lineWidth = 1; ctx.font = FONT_SMALL; ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.beginPath(); ctx.moveTo(x0, yAxis + 0.5); ctx.lineTo(x0 + span, yAxis + 0.5); ctx.stroke();
    const step = Lmm > 400 ? 100 : 50;
    for (let z = 0; z <= Lmm + 1e-6; z += 10) {
      const x = Math.round(x0 + z * sz) + 0.5, big = z % step === 0;
      ctx.beginPath(); ctx.moveTo(x, yAxis); ctx.lineTo(x, yAxis + (big ? 5 : 2)); ctx.stroke();
      if (big) ctx.fillText(String(Math.round(z)), x, yAxis + 5);
    }
    if (info.d) {
      const pcs = zPieces(info.d.zFrom, info.d.zTo, Lmm, !!(sp && sp.pipe));
      ctx.fillStyle = '#e00000';
      for (const pc of pcs) ctx.fillRect(x0 + pc[0] * sz, yAxis - 9, Math.max(1, (pc[1] - pc[0]) * sz), 5);
    }
    if (info.L && info.R) {
      ctx.fillStyle = 'rgba(40,80,220,0.35)';
      const a = Math.min(info.L.z, info.R.z), b = Math.max(info.L.z, info.R.z);
      ctx.fillRect(x0 + a * sz, yAxis - 20, Math.max(1, (b - a) * sz), 8);
      if (info.result && info.result.corr > 0) {
        ctx.fillStyle = 'rgba(0,140,0,0.5)';
        const c = info.result.corr / 2;
        ctx.fillRect(x0 + (a + c) * sz, yAxis - 20, Math.max(1, (b - a - 2 * c) * sz), 8);
      }
    }
    ctx.strokeStyle = '#1a2fe0'; ctx.fillStyle = '#1a2fe0'; ctx.lineWidth = 2; ctx.textBaseline = 'bottom';
    [info.L, info.R].forEach(function (m) {
      if (!m) return;
      const x = Math.round(x0 + M.clamp(m.z, 0, Lmm) * sz) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, yAxis - 22); ctx.lineTo(x, yAxis); ctx.stroke();
      ctx.fillText(m.side, x, yAxis - 23);
    });
    if (state.probe) {
      const x = Math.round(x0 + M.clamp(state.probe.z, 0, Lmm) * sz) + 0.5;
      ctx.strokeStyle = '#00a000'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, yAxis - 12); ctx.lineTo(x, yAxis + 1); ctx.stroke();
    }
    ctx.restore();
  }

  function buildSizing() {
    const h = UT.dom.h;
    const els = {};
    const s = st();
    const rec = ruleInfo(s);
    const method = UT.dom.field('Method', { tag: 'select', type: 'text', value: (s.sizing && s.sizing.method) || '6dB', options: METHODS.map(function (m) { return { value: m, label: t(METHOD_LABELS[m]) }; }), onchange: function (v) { setMethod(v); } });
    els.method = method.input;
    els.rec = h('div', { class: 'sz-rec' }, t('Recommended by {std}: {method}', { std: rec.label, method: rec.methodLabel }));
    els.useRec = UT.dom.button('Use', function () { setMethod(ruleInfo(st()).sizingMethod); }, { class: 'btn sz-mini', title: 'apply the recommended method' });
    els.amp = h('span', { class: 'sz-val' }, '--');
    els.thr = h('span', { class: 'sz-val' }, '--');
    els.L = h('span', { class: 'sz-val' }, '--');
    els.R = h('span', { class: 'sz-val' }, '--');
    els.len = h('span', { class: 'sz-val sz-big' }, '--');
    els.height = h('span', { class: 'sz-val sz-big' }, '--');
    els.depth = h('span', { class: 'sz-val' }, '--');
    els.beam = h('span', { class: 'sz-val' }, '--');
    els.warn = h('div', { class: 'sz-warn' }, '');
    els.tips = h('div', { class: 'sz-tips' }, '');
    els.ed = h('div', { class: 'sz-ed' }, '');
    els.trueLen = h('td', { class: 'sz-true' }, '--'); els.trueHeight = h('td', { class: 'sz-true' }, '--'); els.trueDepth = h('td', { class: 'sz-true' }, '--');
    els.mLen = h('td', {}, '--'); els.mHeight = h('td', {}, '--'); els.mDepth = h('td', {}, '--');
    els.table = h('table', { class: 'sz-table' }, [
      h('tr', {}, [h('th', {}, ''), h('th', { i18n: 'measured' }), h('th', { i18n: 'true' })]),
      h('tr', {}, [h('td', { i18n: 'Length' }), els.mLen, els.trueLen]),
      h('tr', {}, [h('td', { i18n: 'Height' }), els.mHeight, els.trueHeight]),
      h('tr', {}, [h('td', { i18n: 'Depth (top)' }), els.mDepth, els.trueDepth]),
    ]);
    els.hint = h('div', { class: 'sz-hint' }, '');
    Z.canvas = h('canvas', { id: 'cv-size', width: SZ_W, height: SZ_H, style: { width: SZ_W + 'px', height: SZ_H + 'px', display: 'block' } });
    const row = function (label, val, cls) { return h('div', { class: 'sz-row' + (cls ? ' ' + cls : '') }, [h('span', { class: 'sz-label', i18n: label }), val]); };
    els.btnL = UT.dom.button('Mark L', function () { markL(); }, { title: '왼쪽(낮은 z) 드롭 지점 표시' });
    els.btnR = UT.dom.button('Mark R', function () { markR(); }, { title: '오른쪽(높은 z) 드롭 지점 표시' });
    els.btnTips = UT.dom.button('Measure tips', function () { measureTips(); }, { title: '게이트 안의 두 팁 회절 에코로 높이 측정' });
    els.rowHeight = row('Height', els.height);
    const body = h('div', { class: 'sz-body' }, [
      method,
      h('div', { class: 'sz-recrow' }, [els.rec, els.useRec]),
      h('div', { class: 'btn-row sz-btns' }, [els.btnL, els.btnR, els.btnTips, UT.dom.button('Clear', function () { clearMarks(); })]),
      row('Amplitude', els.amp),
      row('Mark threshold', els.thr),
      row('Mark L (z)', els.L),
      row('Mark R (z)', els.R),
      row('Length', els.len),
      els.rowHeight,
      row('Depth', els.depth),
      row('Beam width (z) at path', els.beam),
      els.warn,
      els.tips,
      els.table,
      els.ed,
      Z.canvas,
      els.hint,
    ]);
    Z.els = els;
    return body;
  }
  function sizingEnsure() {
    if (Z.win) return Z.win;
    UT.dom.injectCss('view-plotter', plotter.css);
    UT.dom.injectCss('view-sizing', sizing.css);
    Z.win = UT.dom.win({ name: 'size', title: 'Sizing', x: 900, y: 120, w: 340, content: buildSizing(), onShow: function () { UT.requestRender(); } });
    Z.subscribed = true;
    return Z.win;
  }

  const sizing = {
    get window() { return Z.win; },
    methods: METHODS.slice(),
    /** Open (create lazily) the Sizing window; pre-selects the standard's method until the user chose one. */
    open() {
      const w = sizingEnsure();
      if (!Z.userChose) {
        const rec = ruleInfo(st()).sizingMethod;
        if (rec !== ((st().sizing && st().sizing.method) || '6dB')) { const s = st(); UT.setIn('sizing', { method: rec, result: computeResult((s.sizing && s.sizing.marks) || [], rec, resultCtx(UT.frame, s)) }); }
      }
      w.show();
      return sizing;
    },
    close() { if (Z.win) Z.win.hide(); return sizing; },
    toggle() { return Z.win && Z.win.isOpen() ? sizing.close() : sizing.open(); },
    isOpen() { return !!(Z.win && Z.win.isOpen()); },
    markL, markR, clear: clearMarks, setMethod, measureTips, autoMarks, autoTips, recommended,
    /** Pure result computation (marks, method, ctx). */
    compute: computeResult,
    /** Refresh the readouts (no-op while the window is closed). */
    draw(frame, state) {
      if (!Z.win || !Z.win.isOpen() || !Z.els) return;
      const s = state || st();
      try {
        const info = sizingInfo(frame, s);
        const e = Z.els;
        if (e.method.value !== info.method) e.method.value = info.method;
        const rec = ruleInfo(s);
        e.rec.textContent = t('Recommended by {std}: {method}', { std: rec.label, method: rec.methodLabel }) + (rec.sizingMethod === 'eval' ? ' (' + rec.evalDb + ' dB)' : '');
        const pct = info.r ? info.r.peakPct : 0;
        if (pct > Z.maxPct) Z.maxPct = pct;
        const ctx = { maxPct: Z.maxPct, refPct: refPctOf(s.instrument), evalDb: rec.evalDb };
        const thr = thresholdOf(info.method, ctx);
        e.amp.textContent = info.r ? Math.round(pct) + ' %' + (Z.maxPct > 0 ? '  (' + t('max') + ' ' + Math.round(Z.maxPct) + ' %)' : '') : '--';
        e.thr.textContent = thr.pct === null ? '--' : (info.method === 'eval' ? t('< {p} % (ref {r} % {db} dB)', { p: thr.pct.toFixed(0), r: Math.round(ctx.refPct), db: rec.evalDb }) : (info.method === 'max' ? '≥ ' : '≤ ') + thr.pct.toFixed(0) + ' %');
        const tipMode = info.method === 'tip';
        e.btnL.hidden = tipMode; e.btnR.hidden = tipMode; e.btnTips.hidden = !tipMode; e.rowHeight.hidden = !tipMode && !(info.result && Number.isFinite(info.result.height));
        e.L.textContent = info.L ? UT.fmtLen(info.L.z, 1) + (info.L.ampPct !== null && info.L.ampPct !== undefined ? '  (' + Math.round(info.L.ampPct) + ' %)' : '') : '--';
        e.R.textContent = info.R ? UT.fmtLen(info.R.z, 1) + (info.R.ampPct !== null && info.R.ampPct !== undefined ? '  (' + Math.round(info.R.ampPct) + ' %)' : '') : '--';
        const res = info.result;
        e.len.textContent = res && Number.isFinite(res.length) ? UT.fmtLen(res.length, 1) + '  (' + t(METHOD_LABELS[res.method] || res.method) + (res.corr ? ', −' + res.corr.toFixed(1) + ' mm' : '') + ')' : (info.len !== null ? UT.fmtLen(info.len, 1) : '--');
        const live = tipMode ? tipHeight(frame, s) : null;
        e.height.textContent = live && live.height !== null ? UT.fmtLen(live.height, 1) : (res && Number.isFinite(res.height) ? UT.fmtLen(res.height, 1) : '--');
        e.depth.textContent = info.r ? UT.fmtLen(info.r.dp, 1) : '--';
        const path = info.r ? info.r.path : (res && res.path) || 30;
        const w = zWidths(derivedOf(frame, s), path);
        e.beam.textContent = t('wz6 {a} / wz20 {b} mm @ {p} mm', { a: w.wz6.toFixed(1), b: w.wz20.toFixed(1), p: path.toFixed(0) });
        const warn = (live && live.warning) || (res && res.warning) || '';
        e.warn.textContent = warn ? t(warn) : ''; e.warn.hidden = !warn;
        if (tipMode && live) { e.tips.textContent = live.tips.length ? t('Tip echoes: ') + live.tips.map(function (k) { return k.path.toFixed(1) + ' mm (' + k.kind + (k.ampPct !== null ? ', ' + Math.round(k.ampPct) + ' %' : '') + ')'; }).join(' · ') : ''; e.tips.hidden = !live.tips.length; }
        else e.tips.hidden = true;
        e.mLen.textContent = res && Number.isFinite(res.length) ? res.length.toFixed(1) : '--';
        e.mHeight.textContent = live && live.height !== null ? live.height.toFixed(1) : (res && Number.isFinite(res.height) ? res.height.toFixed(1) : '--');
        e.mDepth.textContent = info.r ? info.r.dp.toFixed(1) : (res && Number.isFinite(res.depth) ? res.depth.toFixed(1) : '--');
        e.trueLen.textContent = info.reveal ? (info.d ? info.trueLen.toFixed(1) : t('no defect')) : t('(reveal)');
        e.trueHeight.textContent = info.reveal && info.d ? info.trueHeight.toFixed(1) : (info.reveal ? '--' : t('(reveal)'));
        e.trueDepth.textContent = info.reveal && info.d ? info.trueDepth.toFixed(1) : (info.reveal ? '--' : t('(reveal)'));
        e.table.title = info.d ? (info.d.label || ('Defect ' + info.d.n)) + ', z ' + Math.round(info.d.zFrom) + '…' + Math.round(info.d.zTo) : '';
        const cls = classify(ED.samples, derivedOf(frame, s));
        e.ed.textContent = cls.pattern ? t('Echo-dynamic: pattern {p} ({name}), −6 dB width {w} mm vs beam {b} mm', { p: cls.pattern, name: t(cls.name), w: cls.width6, b: cls.w6 }) : t('Echo-dynamic: move the probe across the indication to classify the pattern');
        e.hint.textContent = t(thr.text) + (tipMode ? '' : '. ' + t('Peak the echo first, then move along z and press Mark L / Mark R at the drop points.'));
        const ctx2 = UT.dom.fitCanvas(Z.canvas, SZ_W, SZ_H);
        drawSizingBar(ctx2, info, s);
      } catch (err) { console.error('[UT.views.sizing]', err); }
    },
    helpers: { sizingLength, nearestDefect, sizingInfo, zWidths, edgeX, computeResult, tipHeight, pairTips, thresholdOf, ruleInfo, refPctOf, normaliseMarks },
    css: [
      '.win[data-win=size] .sz-body{display:flex;flex-direction:column;gap:3px;font:12px "Segoe UI",Arial,sans-serif;min-width:300px}',
      '.win[data-win=size] .sz-row{display:flex;justify-content:space-between;gap:8px;padding:1px 2px;border-bottom:1px dotted #bbb}',
      '.win[data-win=size] .sz-label{color:#333}',
      '.win[data-win=size] .sz-val{font-weight:bold;color:#0a246a;text-align:right}',
      '.win[data-win=size] .sz-big{font-size:14px;color:#006000}',
      '.win[data-win=size] .sz-true{color:#c00000}',
      '.win[data-win=size] .sz-btns{display:flex;gap:6px;justify-content:flex-start;flex-wrap:wrap}',
      '.win[data-win=size] .sz-hint{color:#555;font-size:11px;line-height:1.3}',
      '.win[data-win=size] .sz-recrow{display:flex;gap:6px;align-items:center;font-size:11px;color:#123}',
      '.win[data-win=size] .sz-rec{flex:1}',
      '.win[data-win=size] .sz-mini{padding:0 6px;font-size:11px}',
      '.win[data-win=size] .sz-warn{color:#b00000;font-size:11px;background:#fff3f3;border:1px solid #e8b0b0;padding:2px 4px}',
      '.win[data-win=size] .sz-tips{color:#123;font-size:11px}',
      '.win[data-win=size] .sz-ed{color:#0a4a0a;font-size:11px;background:#eef8ee;padding:2px 4px}',
      '.win[data-win=size] .sz-table{border-collapse:collapse;font-size:11px;width:100%}',
      '.win[data-win=size] .sz-table th,.win[data-win=size] .sz-table td{border:1px solid #bbb;padding:1px 5px;text-align:right}',
      '.win[data-win=size] .sz-table td:first-child{text-align:left;color:#333}',
      '.win[data-win=size] #cv-size{border:1px solid #444;margin-top:4px}',
    ].join('\n'),
    __selftest() {
      const f = [];
      if (sizingLength([{ side: 'L', z: 120 }, { side: 'R', z: 150 }], { pipe: null, L: 300 }) !== 30) f.push('length plate');
      if (sizingLength([{ side: 'L', z: 490 }, { side: 'R', z: 10 }], { pipe: { od: 1 }, L: 500 }) !== 20) f.push('length pipe wrap');
      if (sizingLength([{ side: 'L', z: 10 }], null) !== null) f.push('length needs both marks');
      const defs = [{ n: 1, pts: [{ x: 0, y: 1 }, { x: 0, y: 3 }], zFrom: 100, zTo: 130, height: 2 }, { n: 2, pts: [{ x: 0, y: 1 }, { x: 0, y: 3 }], zFrom: 200, zTo: 260 }];
      const nd = nearestDefect(defs, { L: 300 }, 240);
      if (!nd || nd.n !== 2) f.push('nearestDefect');
      const nw = nearestDefect([{ n: 3, pts: defs[0].pts, zFrom: 480, zTo: 20 }], { L: 500, pipe: { od: 1 } }, 5);
      if (!nw || nw.n !== 3) f.push('nearestDefect wrap');
      const info = sizingInfo({ readouts: { primary: { dp: 7.2, peakPct: 55 } } }, { specimen: { L: 300 }, sizing: { marks: [{ side: 'L', z: 100 }, { side: 'R', z: 130 }], method: '6dB' }, probe: { z: 115 }, display: { hide: false }, trade: { revealed: false }, defects: defs });
      if (info.len !== 30 || !info.d || info.d.n !== 1 || info.trueLen !== 30 || info.trueHeight !== 2 || info.trueDepth !== 1) f.push('sizingInfo ' + JSON.stringify({ len: info.len, d: info.d && info.d.n }));
      const hid = sizingInfo(null, { specimen: { L: 300 }, sizing: { marks: [] }, probe: { z: 115 }, display: { hide: true }, trade: { revealed: false }, defects: defs });
      if (hid.reveal || hid.d) f.push('hidden should not reveal');
      // v2: z-plane widths for 5 MHz ⌀10 (λ 0.648, b 10) at path 40: wz20 = 40·tan(asin(0.0564)) + 5 ≈ 7.26, wz6 ≈ 6.32
      const d60 = { lambda: 0.648, crystalA: 10, crystalB: 10, nearField: 38.6, refracted: 60, halfAngle6dB: 1.89, halfAngle20dB: 3.23 };
      const w = zWidths(d60, 40);
      if (Math.abs(w.wz20 - 7.26) > 0.03 || Math.abs(w.wz6 - 6.32) > 0.03) f.push('zWidths ' + JSON.stringify(w));
      if (Math.abs(zWidths(d60, 20).wz20 - 5) > 1e-9) f.push('wz20 inside the near field = b/2');
      const marks = [{ side: 'L', z: 100, path: 40 }, { side: 'R', z: 144.5, path: 40 }];
      const r6 = computeResult(marks, '6dB', { sp: { L: 300 }, derived: d60 });
      if (!r6 || r6.length !== 44.5 || r6.warning) f.push('6dB result ' + JSON.stringify(r6));
      const r20 = computeResult(marks, '20dB', { sp: { L: 300 }, derived: d60 });
      if (!r20 || Math.abs(r20.length - (44.5 - 2 * 7.257)) > 0.1 || Math.abs(r20.corr - 14.51) > 0.05) f.push('20dB result ' + JSON.stringify(r20));
      const rs = computeResult([{ side: 'L', z: 100, path: 40 }, { side: 'R', z: 108, path: 40 }], '6dB', { sp: { L: 300 }, derived: d60 });
      if (!rs || !rs.warning) f.push('6dB small-reflector warning missing');
      const rneg = computeResult([{ side: 'L', z: 100, path: 40 }, { side: 'R', z: 108, path: 40 }], '20dB', { sp: { L: 300 }, derived: d60 });
      if (!rneg || rneg.length !== 0 || !rneg.warning) f.push('20dB negative clamp ' + JSON.stringify(rneg));
      const rmax = computeResult(marks, 'max', { sp: { L: 300 }, derived: d60 });
      if (!rmax || rmax.length !== 44.5 || rmax.corr !== 0) f.push('max result');
      const rev = computeResult(marks, 'eval', { sp: { L: 300 }, derived: d60 });
      if (!rev || rev.length !== 44.5) f.push('eval result');
      if (computeResult([marks[0]], '6dB', {}) !== null) f.push('needs both marks');
      // tip height: tip 34 + corner 40 at 60° → 3.0; two tips 30/36 → 3.0
      const stTip = { probe: { angle: 60, x: 38, z: 150 }, instrument: { gates: [{ on: true, start: 10, width: 60 }], activeGate: 0 }, specimen: null };
      const th1 = tipHeight({ derived: d60, echoes: [{ path: 34, kind: 'tip', ampPct: 12, defectId: 1, leg: 1 }, { path: 40, kind: 'corner', ampPct: 60, defectId: 1, leg: 1 }, { path: 48, kind: 'geometry', ampPct: 20 }] }, stTip);
      if (th1.height !== 3 || th1.tips.length !== 2 || !th1.warning) f.push('tip+corner height ' + JSON.stringify(th1));
      const th2 = tipHeight({ derived: d60, echoes: [{ path: 30, kind: 'tip', ampPct: 8, defectId: 2, leg: 1 }, { path: 36, kind: 'tip', ampPct: 6, defectId: 2, leg: 1 }] }, stTip);
      if (th2.height !== 3 || th2.warning) f.push('two-tip height ' + JSON.stringify(th2));
      const th4 = tipHeight({ derived: d60, echoes: [{ path: 34, kind: 'tip', ampPct: 12, defectId: 1, leg: 1 }, { path: 40, kind: 'corner', ampPct: 60, defectId: 1, leg: 1 }, { path: 46, kind: 'tip', ampPct: 20, defectId: 1, leg: 2 }] }, stTip);
      if (th4.height !== 3 || th4.tips[1].kind !== 'corner') f.push('pairing must prefer the same-leg corner over a leg-2 tip ' + JSON.stringify(th4));
      const th3 = tipHeight({ derived: d60, echoes: [{ path: 90, kind: 'tip', ampPct: 8 }] }, stTip);
      if (th3.height !== null || th3.tips.length !== 0) f.push('tip outside the gate should be ignored');
      const rt = computeResult([], 'tip', { tipInfo: th2 });
      if (!rt || rt.method !== 'tip' || rt.height !== 3 || rt.length !== null) f.push('tip result ' + JSON.stringify(rt));
      // thresholds / rule fallback
      const te = thresholdOf('eval', { refPct: 80, evalDb: -10 });
      if (Math.abs(te.pct - 25.3) > 0.1) f.push('eval threshold ' + te.pct);
      if (thresholdOf('6dB', { maxPct: 90 }).pct !== 45 || thresholdOf('20dB', { maxPct: 90 }).pct !== 9 || thresholdOf('max', { maxPct: 90 }).pct !== 72) f.push('drop thresholds');
      if (Math.abs(refPctOf({ gain: 40, refGain: 34 }) - 159.6) > 0.1 || refPctOf({ gain: 34, refGain: 34 }) !== 80) f.push('refPctOf');
      const ri = ruleInfo({ standards: { standard: 'iso11666', level: 'AL2' } });
      if (ri.sizingMethod !== 'eval' || ri.evalDb !== -10) f.push('rule iso11666 ' + JSON.stringify(ri));
      const ra = ruleInfo({ standards: { standard: 'asme8' } });
      if (ra.sizingMethod !== 'eval' || ra.evalDb !== -6) f.push('rule asme8 ' + JSON.stringify(ra));
      if (ruleInfo({ standards: { standard: 'awsd11' } }).sizingMethod !== '6dB') f.push('rule awsd11');
      const ex = edgeX({ x: 40, side: 1 }, { refracted: 60, halfAngle20dB: 3.23 }, 10);
      if (!(ex.near > ex.far && Math.abs((ex.near + ex.far) / 2 - (40 - 10 * Math.tan(M.deg2rad(60)))) < 0.5)) f.push('edgeX ' + JSON.stringify(ex));
      const nm = normaliseMarks([120, 100], { probe: { x: 1, z: 2 }, sizing: { marks: [] } });
      if (!(nm.length === 2 && nm[0].side === 'L' && nm[0].z === 100 && nm[1].z === 120)) f.push('normaliseMarks numbers');
      return f;
    },
  };
  UT.views.sizing = sizing;

  // ==================================================================== B-SCAN (v2)
  function bsDepthMax(state, derived) {
    const inst = state.instrument || { range: 100, delay: 0 };
    const cosT = Math.cos(M.deg2rad(derived ? derived.refracted : 0));
    const T = state.specimen && state.specimen.T > 0 ? state.specimen.T : 20;
    return Math.max(5, Math.min(((inst.delay || 0) + (inst.range || 100)) * cosT, Math.max(2.2 * T, 40)));
  }
  /** Bin an A-scan into nBins depth bins (max of the covered samples). depth = path·cosθ. */
  function bscanColumn(ascan, derived, nBins, depthMax) {
    const out = new Float32Array(nBins);
    if (!ascan || !ascan.samples || !ascan.samples.length) return out;
    const smp = ascan.samples, n = smp.length;
    const cosT = Math.max(Math.cos(M.deg2rad(derived ? derived.refracted : 0)), 1e-6);
    const range = ascan.range || 100, delay = ascan.delay || 0;
    const binPath = depthMax / nBins / cosT;
    for (let i = 0; i < nBins; i++) {
      const p0 = (i * depthMax / nBins) / cosT, p1 = p0 + binPath;
      let j0 = Math.floor((p0 - delay) / range * (n - 1)), j1 = Math.ceil((p1 - delay) / range * (n - 1));
      if (j1 < 0 || j0 > n - 1) continue;
      j0 = Math.max(0, j0); j1 = Math.min(n - 1, Math.max(j1, j0));
      let mx = 0;
      for (let j = j0; j <= j1; j++) if (smp[j] > mx) mx = smp[j];
      out[i] = mx;
    }
    return out;
  }
  function bsRecord(frame, state) {
    const pr = state.probe, asc = frame && frame.ascan;
    if (!pr || !asc || !asc.samples) return;
    const axis = (state.bscan && state.bscan.axis) === 'z' ? 'z' : 'x';
    const pos = axis === 'x' ? pr.x : pr.z;
    if (BS.lastX !== null && Math.abs(pr.x - BS.lastX) < 0.01 && Math.abs(pr.z - BS.lastZ) < 0.01 && BS.cols.length) return;
    BS.lastX = pr.x; BS.lastZ = pr.z;
    const derived = derivedOf(frame, state);
    const dm = bsDepthMax(state, derived);
    if (BS.depthMax === null || Math.abs(dm - BS.depthMax) > 0.01 * BS.depthMax || BS.axis !== axis) { BS.cols = []; BS.depthMax = dm; BS.axis = axis; }
    BS.cols.push({ pos: +pos.toFixed(2), x: +pr.x.toFixed(2), z: +pr.z.toFixed(2), samples: bscanColumn(asc, derived, BS.nBins, dm) });
    if (BS.cols.length > BS.cap) BS.cols.splice(0, BS.cols.length - BS.cap);
  }
  function bsClear() { BS.cols = []; BS.lastX = null; BS.lastZ = null; BS.depthMax = null; }
  /** First depth (mm) at which a column exceeds `thr` %, skipping the initial-pulse zone (leading contiguous bins ≥ thr from depth 0) and minDepth (default 1 mm); null when none. */
  function firstDepthOf(col, depthMax, nBins, thr, minDepth) {
    const md = minDepth === undefined ? 1 : minDepth;
    let i = 0;
    while (i < nBins && col.samples[i] >= thr) i++;   // initial pulse (0° single crystal) starts at depth 0
    for (; i < nBins; i++) { const d = (i + 0.5) / nBins * depthMax; if (d >= md && col.samples[i] >= thr) return +d.toFixed(2); }
    return null;
  }
  const BS_W = 440, BS_H = 260, BS_ML = 40, BS_MT = 8, BS_MR = 12, BS_MB = 26;
  function bsPlotRect() { return { x0: BS_ML, y0: BS_MT, w: BS_W - BS_ML - BS_MR, h: BS_H - BS_MT - BS_MB }; }
  function bsPosRange(state) {
    const cur = BS.axis === 'z' ? state.probe.z : state.probe.x;
    let lo = Infinity, hi = -Infinity;
    for (const c of BS.cols) { if (c.pos < lo) lo = c.pos; if (c.pos > hi) hi = c.pos; }
    if (!BS.cols.length) { lo = cur; hi = cur; }
    const mid = (lo + hi) / 2, span = Math.max(hi - lo, 60);
    return { lo: mid - span / 2, hi: mid + span / 2 };
  }
  function drawBscan(ctx, frame, state) {
    const pr = bsPlotRect();
    const depthMax = BS.depthMax || bsDepthMax(state, derivedOf(frame, state));
    ctx.save();
    ctx.fillStyle = '#101418'; ctx.fillRect(0, 0, BS_W, BS_H);
    ctx.fillStyle = '#000'; ctx.fillRect(pr.x0, pr.y0, pr.w, pr.h);
    const rng = bsPosRange(state);
    const pxPerMm = pr.w / (rng.hi - rng.lo);
    if (BS.cols.length && hasDoc()) {
      const xb = Math.max(1, Math.round(pr.w)), nB = BS.nBins;
      if (!BS.off || BS.off.width !== xb || BS.off.height !== nB) { BS.off = document.createElement('canvas'); BS.off.width = xb; BS.off.height = nB; }
      const octx = BS.off.getContext('2d');
      const img = octx.createImageData(xb, nB);
      const data = img.data;
      // typical step between recorded positions → column width in px
      let step = Infinity;
      const sorted = BS.cols.slice().sort(function (a, b) { return a.pos - b.pos; });
      for (let i = 1; i < sorted.length; i++) { const d = sorted[i].pos - sorted[i - 1].pos; if (d > 0.05 && d < step) step = d; }
      const wpx = Math.max(1, Math.min(12, Math.ceil((isFinite(step) ? step : 1) * pxPerMm)));
      for (const c of BS.cols) {
        const px = Math.round((c.pos - rng.lo) * pxPerMm);
        for (let k = 0; k < wpx; k++) {
          const xx = px + k - Math.floor(wpx / 2);
          if (xx < 0 || xx >= xb) continue;
          for (let i = 0; i < nB; i++) {
            const idx = (i * xb + xx) * 4;
            const col = ampColour(c.samples[i]);
            if (data[idx + 3] && data[idx] + data[idx + 1] + data[idx + 2] > col[0] + col[1] + col[2]) continue;
            data[idx] = col[0]; data[idx + 1] = col[1]; data[idx + 2] = col[2]; data[idx + 3] = 255;
          }
        }
      }
      octx.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(BS.off, pr.x0, pr.y0, pr.w, pr.h);
    }
    // depth axis
    ctx.strokeStyle = '#888'; ctx.fillStyle = '#ccc'; ctx.lineWidth = 1; ctx.font = FONT_SMALL; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    const dStep = depthMax > 120 ? 50 : depthMax > 60 ? 20 : depthMax > 25 ? 10 : 5;
    for (let d = 0; d <= depthMax + 1e-6; d += dStep) {
      const y = Math.round(pr.y0 + d / depthMax * pr.h) + 0.5;
      ctx.beginPath(); ctx.moveTo(pr.x0 - 4, y); ctx.lineTo(pr.x0, y); ctx.stroke();
      ctx.fillText(String(Math.round(d)), pr.x0 - 6, y);
    }
    ctx.save(); ctx.translate(10, pr.y0 + pr.h / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText('depth (mm)', 0, 0); ctx.restore();
    // position axis
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const pStep = (rng.hi - rng.lo) > 300 ? 50 : (rng.hi - rng.lo) > 120 ? 20 : 10;
    for (let p = Math.ceil(rng.lo / pStep) * pStep; p <= rng.hi + 1e-6; p += pStep) {
      const x = Math.round(pr.x0 + (p - rng.lo) * pxPerMm) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, pr.y0 + pr.h); ctx.lineTo(x, pr.y0 + pr.h + 4); ctx.stroke();
      ctx.fillText(String(Math.round(p)), x, pr.y0 + pr.h + 6);
    }
    ctx.fillText((BS.axis || 'x') + ' (mm)', pr.x0 + pr.w / 2, pr.y0 + pr.h + 15);
    // current probe marker
    const cur = (BS.axis || 'x') === 'z' ? state.probe.z : state.probe.x;
    const cx = pr.x0 + (cur - rng.lo) * pxPerMm;
    if (cx >= pr.x0 && cx <= pr.x0 + pr.w) { ctx.strokeStyle = '#22e022'; dashed(ctx, [3, 3]); ctx.beginPath(); ctx.moveTo(Math.round(cx) + 0.5, pr.y0); ctx.lineTo(Math.round(cx) + 0.5, pr.y0 + pr.h); ctx.stroke(); dashed(ctx, []); }
    if (BS.cursor) {
      const p = rng.lo + (BS.cursor.x - pr.x0) / pxPerMm, d = (BS.cursor.y - pr.y0) / pr.h * depthMax;
      if (p >= rng.lo && p <= rng.hi && d >= 0 && d <= depthMax) {
        let amp = null;
        let best = null, bd = Infinity;
        for (const c of BS.cols) { const dd = Math.abs(c.pos - p); if (dd < bd) { bd = dd; best = c; } }
        if (best && bd * pxPerMm <= 6) amp = best.samples[Math.min(BS.nBins - 1, Math.floor(d / depthMax * BS.nBins))];
        ctx.fillStyle = '#fff'; ctx.font = FONT_BOLD; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
        ctx.fillText((BS.axis || 'x') + ' ' + p.toFixed(1) + '  depth ' + d.toFixed(1) + (amp === null ? '' : '  ' + Math.round(amp) + ' %'), pr.x0 + 4, pr.y0 + pr.h - 2);
      }
    }
    ctx.strokeStyle = '#555'; ctx.strokeRect(pr.x0 + 0.5, pr.y0 + 0.5, pr.w - 1, pr.h - 1);
    ctx.restore();
  }
  function buildBscan() {
    const h = UT.dom.h, els = {};
    const s = st();
    const axis = UT.dom.field('Axis', { tag: 'select', type: 'text', value: (s.bscan && s.bscan.axis) || 'x', options: [{ value: 'x', label: 'x (across the weld)' }, { value: 'z', label: 'z (along the weld)' }], onchange: function (v) { bsClear(); UT.setIn('bscan', { axis: v === 'z' ? 'z' : 'x' }); } });
    els.axis = axis.input;
    const rec = UT.dom.field('Record', { type: 'checkbox', value: !!(s.bscan && s.bscan.on), onchange: function (v) { UT.setIn('bscan', { on: !!v }); } });
    els.rec = rec.input;
    els.info = h('div', { class: 'bs-info' }, '');
    BS.canvas = h('canvas', { id: 'cv-bscan', width: BS_W, height: BS_H, style: { width: BS_W + 'px', height: BS_H + 'px', display: 'block', touchAction: 'none' } });
    BS.canvas.addEventListener('pointermove', function (ev) { BS.cursor = UT.dom.localPos(ev, BS.canvas); bscan.draw(UT.frame, st()); });
    BS.canvas.addEventListener('pointerleave', function () { BS.cursor = null; bscan.draw(UT.frame, st()); });
    BS.canvas.addEventListener('pointerdown', function (ev) { capture(BS.canvas, ev); BS.cursor = UT.dom.localPos(ev, BS.canvas); bscan.draw(UT.frame, st()); ev.preventDefault(); });
    const body = h('div', { class: 'bs-body' }, [
      h('div', { class: 'bs-ctl' }, [axis, rec, UT.dom.button('Clear', function () { bscan.clear(); })]),
      BS.canvas,
      els.info,
      h('div', { class: 'bs-hint', i18n: 'Move the probe along the axis with the mouse, keys or touch bar: each A-scan is stacked as a depth-coded column (amplitude colour map).' }),
    ]);
    BS.els = els;
    return body;
  }
  function bsEnsure() {
    if (BS.win) return BS.win;
    UT.dom.injectCss('view-bscan', bscan.css);
    BS.win = UT.dom.win({ name: 'bscan', title: 'B-scan', x: 420, y: 80, content: buildBscan(), onShow: function () { UT.requestRender(); }, onClose: function () { if (st().bscan && st().bscan.on) UT.setIn('bscan', { on: false }, { noRender: true }); } });
    return BS.win;
  }
  const bscan = {
    get window() { return BS.win; },
    get canvas() { return BS.canvas; },
    /** Open (create lazily) the B-scan window and start recording (bscan.on = true). */
    open() { const w = bsEnsure(); if (!(st().bscan && st().bscan.on)) UT.setIn('bscan', { on: true }); w.show(); return bscan; },
    close() { if (BS.win) BS.win.close(); return bscan; },
    toggle() { return BS.win && BS.win.isOpen() ? bscan.close() : bscan.open(); },
    isOpen() { return !!(BS.win && BS.win.isOpen()); },
    /** Clear the recorded columns. */
    clear() { bsClear(); if (BS.win && BS.win.isOpen()) bscan.draw(UT.frame, st()); return bscan; },
    /** Recorded columns (module buffer): [{pos, x, z, samples: Float32Array}]. */
    columns() { return BS.cols; },
    get depthMax() { return BS.depthMax; },
    get nBins() { return BS.nBins; },
    get axis() { return BS.axis || ((st().bscan && st().bscan.axis) || 'x'); },
    draw(frame, state) {
      if (!BS.win || !BS.win.isOpen() || !BS.canvas) return;
      const s = state || st();
      try {
        const ctx = UT.dom.fitCanvas(BS.canvas, BS_W, BS_H);
        drawBscan(ctx, frame, s);
        if (BS.els) {
          if (BS.els.rec.checked !== !!(s.bscan && s.bscan.on)) BS.els.rec.checked = !!(s.bscan && s.bscan.on);
          const ax = (s.bscan && s.bscan.axis) || 'x';
          if (BS.els.axis.value !== ax) BS.els.axis.value = ax;
          BS.els.info.textContent = t('{n} columns · depth 0…{d} mm · {state}', { n: BS.cols.length, d: (BS.depthMax || bsDepthMax(s, derivedOf(frame, s))).toFixed(0), state: s.bscan && s.bscan.on ? t('recording') : t('paused') });
        }
      } catch (e) { console.error('[UT.views.bscan]', e); }
    },
    helpers: { bscanColumn, bsDepthMax, firstDepthOf, ampColour },
    css: [
      '.win[data-win=bscan] .bs-body{display:flex;flex-direction:column;gap:4px;font:12px "Segoe UI",Arial,sans-serif}',
      '.win[data-win=bscan] .bs-ctl{display:flex;gap:10px;align-items:center;flex-wrap:wrap}',
      '.win[data-win=bscan] #cv-bscan{border:1px solid #444;cursor:crosshair;touch-action:none}',
      '.win[data-win=bscan] .bs-info{color:#123;font-size:11px}',
      '.win[data-win=bscan] .bs-hint{color:#555;font-size:11px;max-width:440px}',
    ].join('\n'),
    __selftest() {
      const f = [];
      const n = 1000, smp = new Float32Array(n);
      // echo at path 10 (60 %) and 25 (80 %), range 100
      for (let i = 0; i < n; i++) { const p = i / (n - 1) * 100; smp[i] = 60 * Math.exp(-((p - 10) / 0.5) * ((p - 10) / 0.5)) + 80 * Math.exp(-((p - 25) / 0.5) * ((p - 25) / 0.5)); }
      const col = bscanColumn({ samples: smp, range: 100, delay: 0 }, { refracted: 0 }, 160, 50);
      const fd = firstDepthOf({ samples: col }, 50, 160, 20);
      if (!(fd !== null && Math.abs(fd - 10) < 0.5)) f.push('bscanColumn first depth ' + fd);
      const withIp = new Float32Array(160); withIp.set(col); for (let i = 0; i < 14; i++) withIp[i] = 100;   // initial pulse to ≈ 4.4 mm
      const fd2 = firstDepthOf({ samples: withIp }, 50, 160, 20);
      if (!(fd2 !== null && Math.abs(fd2 - 10) < 0.5)) f.push('firstDepthOf must skip the initial pulse ' + fd2);
      let iMax = 0; for (let i = 1; i < 160; i++) if (col[i] > col[iMax]) iMax = i;
      if (Math.abs((iMax + 0.5) / 160 * 50 - 25) > 0.5) f.push('bscanColumn max bin ' + iMax);
      const col60 = bscanColumn({ samples: smp, range: 100, delay: 0 }, { refracted: 60 }, 160, 50);
      let i60 = 0; for (let i = 1; i < 160; i++) if (col60[i] > col60[i60]) i60 = i;
      if (Math.abs((i60 + 0.5) / 160 * 50 - 12.5) > 0.5) f.push('bscanColumn 60° depth = path·cosθ ' + i60);
      if (Math.abs(bsDepthMax({ instrument: { range: 100, delay: 0 }, specimen: { T: 25 } }, { refracted: 0 }) - 55) > 1e-9) f.push('bsDepthMax clamp 2.2T');
      if (bsDepthMax({ instrument: { range: 30, delay: 0 }, specimen: { T: 25 } }, { refracted: 0 }) !== 30) f.push('bsDepthMax range');
      const c = ampColour(0); if (!(c[0] === 0 && c[2] > 0)) f.push('ampColour 0');
      if (ampColour(100)[0] < 200) f.push('ampColour 100 not red');
      if (UT.state && UT.state.bscan && UT.state.bscan.columns !== null) f.push('state.bscan.columns must stay null');
      return f;
    },
  };
  UT.views.bscan = bscan;

  // ==================================================================== ECHO-DYNAMIC WINDOW (v2)
  const ED_W = 440, ED_H = 170, ED_ML = 34, ED_MT = 8, ED_MR = 10, ED_MB = 24;
  function drawEchodyn(ctx, frame, state) {
    const pr = { x0: ED_ML, y0: ED_MT, w: ED_W - ED_ML - ED_MR, h: ED_H - ED_MT - ED_MB };
    const derived = derivedOf(frame, state);
    const cls = classify(ED.samples, derived);
    const axis = cls.axis;
    const pts = ED.samples.map(function (s) { return { pos: axis === 'x' ? s.x : s.z, pct: s.pct }; });
    const cur = axis === 'x' ? state.probe.x : state.probe.z;
    let lo = Infinity, hi = -Infinity;
    for (const p of pts) { if (p.pos < lo) lo = p.pos; if (p.pos > hi) hi = p.pos; }
    if (!pts.length) { lo = cur; hi = cur; }
    const mid = (lo + hi) / 2, span = Math.max(hi - lo, 40);
    lo = mid - span / 2; hi = mid + span / 2;
    const xOf = function (p) { return pr.x0 + (p - lo) / (hi - lo) * pr.w; };
    const yOf = function (v) { return pr.y0 + pr.h - M.clamp(v, 0, 120) / 120 * pr.h; };
    ctx.save();
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, ED_W, ED_H);
    ctx.strokeStyle = '#1f5f1f'; ctx.lineWidth = 1;
    for (let v = 0; v <= 120; v += 20) { const y = Math.round(yOf(v)) + 0.5; ctx.beginPath(); ctx.moveTo(pr.x0, y); ctx.lineTo(pr.x0 + pr.w, y); ctx.stroke(); }
    ctx.fillStyle = '#9c9'; ctx.font = FONT_SMALL; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let v = 0; v <= 100; v += 50) ctx.fillText(String(v), pr.x0 - 3, yOf(v));
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const pStep = span > 150 ? 50 : span > 60 ? 20 : 10;
    for (let p = Math.ceil(lo / pStep) * pStep; p <= hi + 1e-6; p += pStep) { const x = Math.round(xOf(p)) + 0.5; ctx.strokeStyle = '#1f5f1f'; ctx.beginPath(); ctx.moveTo(x, pr.y0); ctx.lineTo(x, pr.y0 + pr.h); ctx.stroke(); ctx.fillText(String(Math.round(p)), x, pr.y0 + pr.h + 4); }
    ctx.fillText(axis + ' (mm)', pr.x0 + pr.w / 2, pr.y0 + pr.h + 13);
    if (cls.maxPct > 0) {
      ctx.strokeStyle = 'rgba(255,210,30,0.7)'; dashed(ctx, [4, 3]);
      const y6 = Math.round(yOf(cls.maxPct / 2)) + 0.5; ctx.beginPath(); ctx.moveTo(pr.x0, y6); ctx.lineTo(pr.x0 + pr.w, y6); ctx.stroke(); dashed(ctx, []);
      ctx.fillStyle = '#ffd21e'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText('−6 dB', pr.x0 + 2, y6 - 1);
    }
    const sorted = pts.slice().sort(function (a, b) { return a.pos - b.pos; });
    if (sorted.length) {
      ctx.strokeStyle = '#22e022'; ctx.lineWidth = 1.5; ctx.beginPath();
      sorted.forEach(function (p, i) { const x = xOf(p.pos), y = yOf(p.pct); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.stroke();
      ctx.fillStyle = '#22e022';
      for (const p of sorted) { ctx.fillRect(xOf(p.pos) - 1, yOf(p.pct) - 1, 2, 2); }
    }
    const cx = Math.round(xOf(cur)) + 0.5;
    if (cx >= pr.x0 && cx <= pr.x0 + pr.w) { ctx.strokeStyle = '#ff5050'; ctx.beginPath(); ctx.moveTo(cx, pr.y0); ctx.lineTo(cx, pr.y0 + pr.h); ctx.stroke(); }
    if (ED.cursor) {
      const p = lo + (ED.cursor.x - pr.x0) / pr.w * (hi - lo);
      if (p >= lo && p <= hi) { ctx.fillStyle = '#fff'; ctx.font = FONT_BOLD; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(axis + ' ' + p.toFixed(1) + ' mm', pr.x0 + 4, pr.y0 + 2); }
    }
    ctx.strokeStyle = '#555'; ctx.strokeRect(pr.x0 + 0.5, pr.y0 + 0.5, pr.w - 1, pr.h - 1);
    ctx.restore();
    return cls;
  }
  function buildEchodyn() {
    const h = UT.dom.h, els = {};
    const s = st();
    const rec = UT.dom.field('Record', { type: 'checkbox', value: !!(s.echodyn && s.echodyn.on), onchange: function (v) { UT.setIn('echodyn', { on: !!v }); } });
    els.rec = rec.input;
    els.info = h('div', { class: 'ed-info' }, '');
    els.pattern = h('div', { class: 'ed-pattern' }, '');
    ED.canvas = h('canvas', { id: 'cv-echodyn', width: ED_W, height: ED_H, style: { width: ED_W + 'px', height: ED_H + 'px', display: 'block', touchAction: 'none' } });
    ED.canvas.addEventListener('pointermove', function (ev) { ED.cursor = UT.dom.localPos(ev, ED.canvas); echodyn.draw(UT.frame, st()); });
    ED.canvas.addEventListener('pointerleave', function () { ED.cursor = null; echodyn.draw(UT.frame, st()); });
    ED.canvas.addEventListener('pointerdown', function (ev) { capture(ED.canvas, ev); ED.cursor = UT.dom.localPos(ev, ED.canvas); echodyn.draw(UT.frame, st()); ev.preventDefault(); });
    const body = h('div', { class: 'ed-body' }, [
      h('div', { class: 'ed-ctl' }, [rec, UT.dom.button('Clear', function () { echodyn.clear(); })]),
      ED.canvas,
      els.pattern,
      els.info,
      h('div', { class: 'ed-hint', i18n: 'ISO 23279 echo-dynamic patterns: 1 = single sharp peak (point-like), 2 = smooth plateau wider than twice the beam (extended, smooth), 3 = ragged plateau (extended, rough).' }),
    ]);
    ED.els = els;
    return body;
  }
  function edEnsure() {
    if (ED.win) return ED.win;
    UT.dom.injectCss('view-echodyn', echodyn.css);
    ED.win = UT.dom.win({ name: 'echodyn', title: 'Echo dynamic', x: 420, y: 360, content: buildEchodyn(), onShow: function () { UT.requestRender(); }, onClose: function () { if (st().echodyn && st().echodyn.on) UT.setIn('echodyn', { on: false }, { noRender: true }); } });
    return ED.win;
  }
  const echodyn = {
    get window() { return ED.win; },
    get canvas() { return ED.canvas; },
    /** Open (create lazily) the echo-dynamic window and start recording (echodyn.on = true). */
    open() { const w = edEnsure(); if (!(st().echodyn && st().echodyn.on)) UT.setIn('echodyn', { on: true }); w.show(); return echodyn; },
    close() { if (ED.win) ED.win.close(); return echodyn; },
    toggle() { return ED.win && ED.win.isOpen() ? echodyn.close() : echodyn.open(); },
    isOpen() { return !!(ED.win && ED.win.isOpen()); },
    /** Clear the recorded samples. */
    clear() { edClear(); if (ED.win && ED.win.isOpen()) echodyn.draw(UT.frame, st()); return echodyn; },
    /** Recorded samples (module buffer): [{x, z, pct, path, kind}]. */
    samples() { return ED.samples; },
    /** Classify the buffer (or the given samples) → {pattern, name, axis, width6, w6, maxPct}. */
    classify(samples, derived) { return classify(samples || ED.samples, derived || derivedOf(UT.frame, st())); },
    draw(frame, state) {
      if (!ED.win || !ED.win.isOpen() || !ED.canvas) return;
      const s = state || st();
      try {
        const ctx = UT.dom.fitCanvas(ED.canvas, ED_W, ED_H);
        const cls = drawEchodyn(ctx, frame, s);
        if (ED.els) {
          if (ED.els.rec.checked !== !!(s.echodyn && s.echodyn.on)) ED.els.rec.checked = !!(s.echodyn && s.echodyn.on);
          ED.els.pattern.textContent = cls.pattern ? t('Pattern {p}: {name} — −6 dB width {w} mm, beam −6 dB width {b} mm', { p: cls.pattern, name: t(cls.name), w: cls.width6, b: cls.w6 }) : t('Move the probe across the indication to classify the echo-dynamic pattern');
          ED.els.info.textContent = t('{n} samples · max {m} % · axis {a} · {state}', { n: ED.samples.length, m: Math.round(cls.maxPct), a: cls.axis, state: s.echodyn && s.echodyn.on ? t('recording') : t('paused') });
        }
      } catch (e) { console.error('[UT.views.echodyn]', e); }
    },
    helpers: { classify, beamWidths6 },
    css: [
      '.win[data-win=echodyn] .ed-body{display:flex;flex-direction:column;gap:4px;font:12px "Segoe UI",Arial,sans-serif}',
      '.win[data-win=echodyn] .ed-ctl{display:flex;gap:10px;align-items:center}',
      '.win[data-win=echodyn] #cv-echodyn{border:1px solid #444;cursor:crosshair;touch-action:none}',
      '.win[data-win=echodyn] .ed-pattern{color:#0a4a0a;font-weight:bold;font-size:12px;background:#eef8ee;padding:2px 4px}',
      '.win[data-win=echodyn] .ed-info{color:#123;font-size:11px}',
      '.win[data-win=echodyn] .ed-hint{color:#555;font-size:11px;max-width:440px}',
    ].join('\n'),
    __selftest() {
      const f = [];
      const d60 = { lambda: 0.648, crystalA: 10, crystalB: 10, nearField: 38.6, refracted: 60, halfAngle6dB: 1.89, halfAngle20dB: 3.23 };
      const bw = beamWidths6(d60, 40);
      if (Math.abs(bw.w6z - 12.64) > 0.05 || Math.abs(bw.w6x - (2 * 40 * Math.tan(M.deg2rad(1.89)) / 0.5 + 10)) > 0.05) f.push('beamWidths6 ' + JSON.stringify(bw));
      const gauss = function (z, c, s) { return 80 * Math.exp(-((z - c) / s) * ((z - c) / s) * 0.5); };
      const point = []; for (let z = 100; z <= 200; z += 1) point.push({ x: 40, z, pct: gauss(z, 150, 4.5), path: 40 });
      const c1 = classify(point, d60);
      if (c1.pattern !== 1 || c1.axis !== 'z' || Math.abs(c1.width6 - 10.6) > 0.5) f.push('pattern 1 ' + JSON.stringify(c1));
      const plateau = []; for (let z = 100; z <= 200; z += 1) plateau.push({ x: 40, z, pct: z >= 120 && z <= 180 ? 78 + 2 * Math.sin(z / 5) : gauss(z, z < 150 ? 120 : 180, 3), path: 40 });
      const c2 = classify(plateau, d60);
      if (c2.pattern !== 2 || c2.width6 < 55) f.push('pattern 2 ' + JSON.stringify(c2));
      const rough = []; for (let z = 100; z <= 200; z += 1) rough.push({ x: 40, z, pct: z >= 120 && z <= 180 ? 50 + 30 * Math.abs(Math.sin(z / 3)) : gauss(z, z < 150 ? 120 : 180, 3), path: 40 });
      const c3 = classify(rough, d60);
      if (c3.pattern !== 3) f.push('pattern 3 ' + JSON.stringify(c3));
      const xs = []; for (let x = 20; x <= 60; x += 0.5) xs.push({ x, z: 150, pct: gauss(x, 40, 3), path: 40 });
      if (classify(xs, d60).axis !== 'x') f.push('axis x');
      if (classify([], d60).pattern !== 0 || classify(point.slice(0, 3), d60).pattern !== 0) f.push('insufficient → 0');
      if (UT.state && UT.state.echodyn && (!Array.isArray(UT.state.echodyn.samples) || UT.state.echodyn.samples.length)) f.push('state.echodyn.samples must stay []');
      return f;
    },
  };
  UT.views.echodyn = echodyn;

  // ==================================================================== module-level subscriptions + test API
  function onRender(frame) {
    const s = st();
    try {
      if (s.bscan && s.bscan.on) bsRecord(frame, s);
      if ((s.echodyn && s.echodyn.on) || (Z.win && Z.win.isOpen())) edRecord(frame, s);
    } catch (e) { console.error('[UT.views.66 record]', e); }
    plotter.draw(frame, s);
    radiograph.draw(frame, s);
    sizing.draw(frame, s);
    bscan.draw(frame, s);
    echodyn.draw(frame, s);
  }
  UT.bus.on('render', onRender);
  UT.bus.on('state', function (ev) {
    if (ev && ev.keys && ev.keys.indexOf('specimen') >= 0) { bsClear(); edClear(); Z.maxPct = 0; }
  });
  UT.bus.on('lang', function () {
    try {
      if (Z.win) Z.win.setContent(buildSizing());
      if (BS.win) BS.win.setContent(buildBscan());
      if (ED.win) ED.win.setContent(buildEchodyn());
      if (UT.frame && UT.frame.ts) { sizing.draw(UT.frame, st()); bscan.draw(UT.frame, st()); echodyn.draw(UT.frame, st()); }
    } catch (e) { console.error('[UT.views.66 lang]', e); }
  });

  Object.assign(UT.test, {
    /** B-scan module buffer → {n, axis, columns: number[][], positions, depthMax, nBins, firstDepth}. */
    bscan() {
      const cols = BS.cols;
      return {
        n: cols.length, axis: BS.axis || ((st().bscan && st().bscan.axis) || 'x'),
        columns: cols.map(function (c) { return Array.from(c.samples); }),
        positions: cols.map(function (c) { return c.pos; }),
        depthMax: BS.depthMax, nBins: BS.nBins,
        firstDepth: cols.map(function (c) { return firstDepthOf(c, BS.depthMax || 1, BS.nBins, 20); }),
      };
    },
    /** Echo-dynamic module buffer → {samples, pattern (0|1|2|3), patternInfo}. */
    echodyn() {
      const cls = classify(ED.samples, derivedOf(UT.frame, st()));
      return { samples: ED.samples.map(function (x) { return Object.assign({}, x); }), pattern: cls.pattern, patternInfo: cls };
    },
    /**
     * Sizing: {method, marks, auto, zFrom, zTo, step} → sizing.result. marks = [{side, z}…] | [zL, zR] | {L, R};
     * auto:true scans z synchronously (autoMarks); method 'tip' measures the tips of the current frame.
     */
    sizing(args) {
      const a = args || {};
      const s = st();
      const method = METHODS.indexOf(a.method) >= 0 ? a.method : ((s.sizing && s.sizing.method) || '6dB');
      if (a.method) Z.userChose = true;
      if (a.auto) return UT.clone(autoMarks({ method, zFrom: a.zFrom, zTo: a.zTo, step: a.step }));
      if (method === 'tip') { if (!(UT.frame && UT.frame.ts)) UT.renderNow(); return UT.clone(measureTips()); }
      const marks = a.marks !== undefined ? normaliseMarks(a.marks, s) : ((s.sizing && s.sizing.marks) || []);
      return UT.clone(writeSizing(marks, method));
    },
  });
})(window.UT = window.UT || {});
