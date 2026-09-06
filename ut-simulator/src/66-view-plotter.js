/* 66-view-plotter.js — beam-plotting card (PLOT / IOW mode), radiograph film strip (RAD) and the
 * sizing overlay (SIZE). SPEC §7.7 as amended by §14.5 and §15.6.
 *
 * UT.views.plotter    { init(canvas), draw(frame, state), toPx, toMm, fit, markEdge, erase, toggleMirror, open, close, toggle, css }
 * UT.views.radiograph { window, open, close, toggle, draw(frame, state), css }
 * UT.views.sizing     { window, open, close, toggle, draw(frame, state), markL, markR, clear, setMethod, css }
 */
(function (UT) {
  'use strict';

  // SPEC NOTES (decisions where the spec is silent or ambiguous)
  // - Card transform: x shares the X-ruler scale through UT.views.cross.toPx (scale = px per mm, the
  //   index at the SAME screen x as the probe on the ruler; the offset between #cv-cross and
  //   #cv-plotter bounding rects is subtracted). When the aligned index would leave no room for the
  //   beam (index left of 45 % of the card width, e.g. probe over the 43 mm hole) or would fall off
  //   the right edge, the card falls back to placing the index 20 mm from its right edge (the
  //   original always shows '0 | 10 20' behind the index). Vertical: the scanning surface is 4 px
  //   below the card top (the top stand-off ruler's labels overlay the first 10 mm like the
  //   original); depth uses the same px/mm scale (no distortion). Fallback scale without cross: 4 px/mm.
  // - toPx(x, y) takes ABSOLUTE specimen coordinates (x mm across, y = depth) like the other views;
  //   toMm(px, py) returns {x, y, standoff, depth} where standoff = side·(probe.x − x) (positive
  //   toward the beam). plot.points are stored as {standoff, depth, x}; edge marks accept both
  //   `standoff` and `standOff` (80-modes writes `standOff`).
  // - Mirror image: the plate reflected about its bottom face — range arcs and the blue centre line
  //   continue straight into a light-grey region below the bottom line; mirrored depth lines are
  //   labelled with the REAL depth (2T − y) in grey and mirrored SDH lines drawn pink, so full-skip
  //   positions can be plotted directly. With the mirror hidden the second leg is drawn reflected
  //   (dashed blue) instead.
  // - Cursor readouts: HALF SKIP pair (BEAMPATH = √(standoff² + depth²), STANDOFF = |standoff|)
  //   while the cursor is in the direct region; FULL SKIP pair (+ FULL SKIP DEPTH = 2T − y) while it
  //   is in the mirror region. Values are rounded to whole mm like the original.
  // - Left-click inside the card plots a cross (plot.points); right-click removes the nearest plotted
  //   point within 8 px. The bottom 80 mm ruler strip ('0mm … 80mm') is draggable horizontally
  //   (local state only, default 0mm at 70 mm stand-off toward the beam like the screenshot).
  // - Buttons (DOM overlay next to the canvas, pointer-events only on the buttons): 'Hide/Show Mirror
  //   Image' bottom-left, 'Mark 10% Edge' + 'Erase Plotting' bottom-right. Overlay is positioned over
  //   the canvas box on every draw and hidden with it; the canvas parent gets position:relative when static.
  // - markEdge(): the hole (non-ladder) nearest the leg-1 centre ray (perpendicular distance) at the
  //   current probe position; mark = {standoff, standOff, depth, x, z, hole, side, gain, ampPct}.
  //   Edge marks are drawn as red crosses joined per depth (front/back edge at the same hole) with the
  //   envelope polylines from the index through the min and max stand-offs of each depth.
  // - cardStyle 'weld' (UTman II): cross-hatched plate halves either side of the weld gap (capWidth),
  //   a lighter hatched mirror image below, the red beam-path scale ticked every 5 mm along the
  //   centre line (ticks every 5 mm, labels every 10 mm of true beam path; 10…40 direct and up to
  //   80 in the mirror for T 20 / 60°).
  //   Used when state.plot.cardStyle === 'weld' or the specimen is a weld while the card is visible.
  // - open()/close(): the card canvas is placed and shown by 90-app; open() only flags the state and
  //   injects the CSS. If open() is called before init() (no #cv-plotter in the layout) a fallback
  //   floating window 'plotter' (820 × 280 canvas) is created so the PLOT workflow still works.
  //   The card draws whenever its canvas is visible (clientWidth > 0), independent of the mode.
  // - Radiograph: film 600 × 140 (z horizontal 0…L across 560 px, x across the weld vertical, 2 px/mm,
  //   ±35 mm); weld cap/root bands lighter (thicker metal); defects DARKER (less metal): planar = thin
  //   lines (width ∝ height, opacity 0.35 + height/6), cracks/root jagged, laminations wide bands,
  //   volumetric = soft blobs (porosity = a seeded cluster of dots). Wire IQI (7 wires, lighter) at the
  //   left end with the label 'FE EN 10', film id 'UTsim', z ticks every 10 mm (labels every 50),
  //   green marker at probe.z. Indications are hidden ONLY during an unrevealed trade test
  //   (display.hide alone keeps them: the radiograph is the reference for blind practice).
  // - Sizing: marks go through UT.modes.sizing.markL/markR/clear/method when present (same mark
  //   shape {side, z, x, depth, ampPct} and sizing.result), local fallback otherwise. Length =
  //   |zR − zL| (shorter way round on pipes). 'True length' = the defect whose z-centre is nearest
  //   the marks' midpoint (or probe.z) once trade.revealed || !display.hide. A 300 × 56 bar shows the
  //   marks, the probe z and the true extent. The current gated amplitude is shown to help find the
  //   −6 dB / −20 dB points.

  UT.views = UT.views || {};
  const M = UT.math;
  const FONT = '11px "Segoe UI", Arial, sans-serif';
  const FONT_BOLD = 'bold 11px "Segoe UI", Arial, sans-serif';
  const FONT_SMALL = '10px "Segoe UI", Arial, sans-serif';
  const RULER_LEN = 80;              // bottom stand-off ruler length (mm)
  const SURFACE_Y = 4;               // px from the card top to the scanning surface line

  // ------------------------------------------------------------------ shared helpers
  function st() { return UT.state; }
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
          if (a.width > 0 && b.width > 0) off = a.left - b.left;
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
  function isPlanarType(t) { return UT.specimens && UT.specimens.isPlanar ? UT.specimens.isPlanar(t) : (t === 'planar' || t === 'crack' || t === 'lof' || t === 'lamination' || t === 'root'); }
  function defectLen(d, sp) { return UT.specimens && UT.specimens.defectLength ? UT.specimens.defectLength(d, sp) : (d.zTo - d.zFrom); }

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
    return { W, H, scale: s, indexPx, y0, T, side: (probe && probe.side) || 1, bottomPx, mirrorPx, aligned, angle: derived ? derived.refracted : ((probe && probe.angle) || 0) };
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
      const t = rx * dx + ry * dy;
      const perp = Math.abs(rx * dy - ry * dx);
      const dist = t > 0 ? perp : Math.hypot(rx, ry);
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
    UT.status({ right: 'Edge mark ' + ((s.plot.edgeMarks || []).length + 1) + ': stand-off ' + mark.standOff + ' mm at ' + mark.hole + ' SDH' });
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
    // bottom (plate) line
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
  }

  /** UTman II weld card: hatched plate halves + red beam-path scale along the centre line. */
  function drawWeldCard(ctx, tf, sp, mirror, probe) {
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
    // weld gap outline
    ctx.save();
    ctx.strokeStyle = '#555'; ctx.lineWidth = 1;
    ctx.strokeRect(gapL + 0.5, tf.y0, gapR - gapL, (mirror ? tf.mirrorPx : tf.bottomPx) - tf.y0);
    ctx.strokeStyle = '#333'; ctx.beginPath(); ctx.moveTo(L, Math.round(tf.bottomPx) + 0.5); ctx.lineTo(R, Math.round(tf.bottomPx) + 0.5); ctx.stroke();
    ctx.restore();
    // red beam-path scale every 5 mm along the centre line (through the mirror when shown)
    const a = M.deg2rad(tf.angle);
    const leg = tf.T / Math.max(Math.cos(a), 1e-6);
    const maxPath = mirror ? 2 * leg : leg;
    ctx.save();
    ctx.strokeStyle = '#e00000'; ctx.fillStyle = '#e00000'; ctx.lineWidth = 1.5; ctx.font = FONT_BOLD; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const q0 = soPx(tf, 0, 0), q1 = soPx(tf, maxPath * Math.sin(a), maxPath * Math.cos(a));
    ctx.beginPath(); ctx.moveTo(q0.x, q0.y); ctx.lineTo(q1.x, q1.y); ctx.stroke();
    const nx = Math.cos(a) * tf.side, ny = Math.sin(a);          // perpendicular (screen) to the beam direction
    for (let p = 5; p <= maxPath + 1e-6; p += 5) {
      const q = soPx(tf, p * Math.sin(a), p * Math.cos(a));
      const len = p % 10 === 0 ? 6 : 3;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(q.x - nx * len, q.y - ny * len); ctx.lineTo(q.x + nx * len, q.y + ny * len); ctx.stroke();
      if (p >= 10 && p % 10 === 0) ctx.fillText(String(p), q.x + nx * 9 + 2, q.y + ny * 9);
    }
    ctx.restore();
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
    lines.forEach(function (t, i) { ctx.fillText(t, 150, y - (lines.length - 1 - i) * 14); });
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
        drawWeldCard(ctx, tf, sp, mirror, state.probe);
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

  // ---------------------------------------------------------------- overlay + events
  function syncOverlay(visible) {
    const ov = P.overlay, cv = P.canvas;
    if (!ov || !cv) return;
    ov.style.display = visible ? '' : 'none';
    if (!visible) return;
    ov.style.left = cv.offsetLeft + 'px'; ov.style.top = cv.offsetTop + 'px';
    ov.style.width = cv.offsetWidth + 'px'; ov.style.height = cv.offsetHeight + 'px';
    const mirror = !(st().plot && st().plot.mirror === false);
    if (P.btnMirror) P.btnMirror.textContent = mirror ? 'Hide Mirror Image' : 'Show Mirror Image';
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
    if (ev.button !== 0) return;
    const rr = rulerRect(tf);
    if (p.y >= rr.y0 && p.y <= rr.y1) {
      const x0 = soPx(tf, P.ruler.so0, 0).x, x1 = soPx(tf, P.ruler.so0 - RULER_LEN, 0).x;
      if (p.x >= Math.min(x0, x1) && p.x <= Math.max(x0, x1)) { P.drag = { kind: 'ruler', so0: P.ruler.so0, so: pxSo(tf, p.x, p.y).standoff }; ev.preventDefault(); return; }
    }
    const mm = pxSo(tf, p.x, p.y);
    if (mm.depth < 0 || p.y > tf.H - 30) return;
    addPoint({ standoff: mm.standoff, depth: mm.depth, x: st().probe ? st().probe.x - tf.side * mm.standoff : 0 });
    ev.preventDefault();
  }
  function onUp() { P.drag = null; }
  function onLeave() { P.cursor = null; P.drag = null; redrawSelf(); }

  /**
   * Attach the plotter card to a canvas (#cv-plotter placed in the plan-view area by 90-app).
   * @param {HTMLCanvasElement} canvas
   */
  function init(canvas) {
    if (!canvas) return plotter;
    UT.dom.injectCss('view-plotter', plotter.css);
    P.canvas = canvas;
    canvas.classList.add('plot-card');
    buildOverlay(canvas);
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('mouseup', onUp);
    canvas.addEventListener('mouseleave', onLeave);
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    if (!P.subscribed) { P.subscribed = true; UT.bus.on('render', function (f) { draw(f, st()); }); }
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
      '.plot-card{display:block;background:#fff;cursor:crosshair;user-select:none;-webkit-user-select:none}',
      '.plot-overlay{position:absolute;pointer-events:none;z-index:5}',
      '.plot-overlay-left{position:absolute;left:8px;bottom:30px}',
      '.plot-overlay-right{position:absolute;right:8px;bottom:30px;display:flex;gap:6px}',
      '.plot-btn{pointer-events:auto;font:12px "Segoe UI",Arial,sans-serif;padding:3px 12px;background:#ececec;border:1px solid #888;border-radius:2px;box-shadow:1px 1px 0 #fff inset,-1px -1px 0 #999 inset;cursor:pointer;color:#111}',
      '.plot-btn:active{box-shadow:-1px -1px 0 #fff inset,1px 1px 0 #999 inset}',
      '.win[data-win=plotter] .win-body{padding:0}',
    ].join('\n'),
    __selftest() {
      const f = [];
      const tf = cardTransform(800, 270, { T: 45 }, { side: 1 }, { refracted: 60 }, 4, 600);
      if (!tf.aligned || tf.indexPx !== 600) f.push('aligned index ' + JSON.stringify(tf));
      if (Math.abs(tf.bottomPx - (SURFACE_Y + 180)) > 1e-9) f.push('bottomPx ' + tf.bottomPx);
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
      // cap ripple texture
      ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
      for (let x = RAD_X0; x < RAD_X0 + RAD_SPAN; x += 6) { ctx.beginPath(); ctx.arc(x, yc, capW / 2, -Math.PI / 2, Math.PI / 2); ctx.stroke(); }
    } else if (sp) {
      ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(RAD_X0, 10, RAD_SPAN, RAD_H - 20);
    }
    // defects
    const hidden = radHidden(state);
    if (!hidden) for (const d of state.defects || []) { if (d && d.pts && d.pts.length >= 2 && d.visible !== false) drawIndication(ctx, d, sp, sz); }
    // wire IQI (lighter: wires absorb)
    ctx.save();
    const ix = RAD_X0 + 6, iy0 = 14, iy1 = RAD_H - 40;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    for (let i = 0; i < 7; i++) { ctx.lineWidth = 3.2 - i * 0.42; const x = ix + i * 5 + 0.5; ctx.beginPath(); ctx.moveTo(x, iy0); ctx.lineTo(x, iy1); ctx.stroke(); }
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.font = '9px Arial, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('FE EN 10', ix - 2, iy1 + 3);
    ctx.textAlign = 'right'; ctx.fillText('UTsim', RAD_W - 6, 4);
    ctx.restore();
    // z scale
    ctx.strokeStyle = '#9a9a9a'; ctx.fillStyle = '#b0b0b0'; ctx.lineWidth = 1; ctx.font = FONT_SMALL; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.beginPath(); ctx.moveTo(RAD_X0, RAD_H - 12.5); ctx.lineTo(RAD_X0 + RAD_SPAN, RAD_H - 12.5); ctx.stroke();
    for (let z = 0; z <= L + 1e-6; z += 10) {
      const x = Math.round(RAD_X0 + z * sz) + 0.5;
      const big = z % 50 === 0;
      ctx.beginPath(); ctx.moveTo(x, RAD_H - 12); ctx.lineTo(x, RAD_H - 12 + (big ? 6 : 3)); ctx.stroke();
      if (big && z + 25 <= L + 1e-6) ctx.fillText(String(Math.round(z)), x, RAD_H - 1);
    }
    ctx.textAlign = 'right'; ctx.fillText(Math.round(L) + ' mm', RAD_X0 + RAD_SPAN, RAD_H - 1);
    // probe marker
    if (state.probe) {
      const x = RAD_X0 + M.clamp(state.probe.z, 0, L) * sz;
      ctx.fillStyle = '#22e022'; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x - 5, -1); ctx.lineTo(x, 7); ctx.lineTo(x + 5, -1); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(34,224,34,0.35)'; dashed(ctx, [2, 3]); ctx.beginPath(); ctx.moveTo(x + 0.5, 7); ctx.lineTo(x + 0.5, RAD_H - 12); ctx.stroke(); dashed(ctx, []);
    }
    if (hidden) { ctx.fillStyle = '#ffd21e'; ctx.font = FONT_BOLD; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('Trade test — film withheld until reveal', RAD_W / 2, RAD_H / 2); }
    ctx.restore();
    if (R.caption) {
      const n = hidden ? 0 : (state.defects || []).filter(function (d) { return d && d.pts && d.pts.length >= 2 && d.visible !== false; }).length;
      R.caption.textContent = 'Radiograph of the weld along z (0…' + Math.round(L) + ' mm' + (sp && sp.pipe ? ', circumference' : '') + ')  —  ' + (hidden ? 'indications hidden' : n + ' indication' + (n === 1 ? '' : 's')) + '  |  probe z = ' + (state.probe ? Math.round(state.probe.z) : 0) + ' mm';
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
    if (!R.subscribed) { R.subscribed = true; UT.bus.on('render', function (f) { radiograph.draw(f, st()); }); }
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

  // ==================================================================== SIZING
  const Z = { win: null, els: null, canvas: null, subscribed: false };
  const SZ_W = 300, SZ_H = 56;

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
  function modesSizing() { return UT.modes && UT.modes.sizing ? UT.modes.sizing : null; }
  function localMark(side) {
    const s = st();
    const r = UT.frame && UT.frame.readouts && UT.frame.readouts.primary;
    const mark = { side, z: +s.probe.z.toFixed(1), x: s.probe.x, depth: r ? +r.dp.toFixed(1) : null, ampPct: r ? +r.peakPct.toFixed(1) : null };
    const marks = (s.sizing.marks || []).filter(function (m) { return m.side !== side; }).concat([mark]);
    const len = sizingLength(marks, s.specimen);
    const result = len === null ? null : { length: len, zFrom: Math.min.apply(null, marks.map(function (m) { return m.z; })), zTo: Math.max.apply(null, marks.map(function (m) { return m.z; })), depth: r ? +r.dp.toFixed(1) : null, method: s.sizing.method };
    UT.setIn('sizing', { marks, result });
    return mark;
  }
  /** Mark the left (low-z) drop point at the current probe z. */
  function markL() { const ms = modesSizing(); return ms && ms.markL ? ms.markL() : localMark('L'); }
  /** Mark the right (high-z) drop point at the current probe z. */
  function markR() { const ms = modesSizing(); return ms && ms.markR ? ms.markR() : localMark('R'); }
  /** Clear the sizing marks. */
  function clearMarks() { const ms = modesSizing(); if (ms && ms.clear) ms.clear(); else UT.setIn('sizing', { marks: [], result: null }); }
  /** Set the drop method ('6dB' | '20dB'). */
  function setMethod(m) { const ms = modesSizing(); if (ms && ms.method) ms.method(m); else UT.setIn('sizing', { method: m === '20dB' ? '20dB' : '6dB' }); }

  function sizingInfo(frame, state) {
    const s = state, sp = s.specimen;
    const marks = (s.sizing && s.sizing.marks) || [];
    const L = marks.find(function (m) { return m.side === 'L'; }), Rm = marks.find(function (m) { return m.side === 'R'; });
    const len = sizingLength(marks, sp);
    const r = frame && frame.readouts && frame.readouts.primary;
    const zRef = L && Rm ? (L.z + Rm.z) / 2 : (s.probe ? s.probe.z : 0);
    const reveal = !!((s.trade && s.trade.revealed) || !(s.display && s.display.hide));
    const d = reveal ? nearestDefect(s.defects, sp, zRef) : null;
    return { L, R: Rm, len, r, reveal, d, trueLen: d ? +defectLen(d, sp).toFixed(1) : null, method: (s.sizing && s.sizing.method) || '6dB' };
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

  function sizingEnsure() {
    if (Z.win) return Z.win;
    UT.dom.injectCss('view-plotter', plotter.css);
    UT.dom.injectCss('view-sizing', sizing.css);
    const h = UT.dom.h;
    const els = {};
    const method = UT.dom.field('Method', { tag: 'select', type: 'text', value: (st().sizing && st().sizing.method) || '6dB', options: [{ value: '6dB', label: '6 dB drop' }, { value: '20dB', label: '20 dB drop' }], onchange: function (v) { setMethod(v); } });
    els.method = method.input;
    els.amp = h('span', { class: 'sz-val' }, '--');
    els.L = h('span', { class: 'sz-val' }, '--');
    els.R = h('span', { class: 'sz-val' }, '--');
    els.len = h('span', { class: 'sz-val sz-big' }, '--');
    els.depth = h('span', { class: 'sz-val' }, '--');
    els.truth = h('span', { class: 'sz-val sz-true' }, '--');
    els.truthRow = h('div', { class: 'sz-row' }, [h('span', { class: 'sz-label' }, 'True length'), els.truth]);
    els.hint = h('div', { class: 'sz-hint' }, 'Peak the echo, move along z until the amplitude drops by the method (50 % / 10 %), press Mark L, repeat the other way, press Mark R.');
    Z.canvas = h('canvas', { id: 'cv-size', width: SZ_W, height: SZ_H, style: { width: SZ_W + 'px', height: SZ_H + 'px', display: 'block' } });
    const row = function (label, val) { return h('div', { class: 'sz-row' }, [h('span', { class: 'sz-label' }, label), val]); };
    const body = h('div', { class: 'sz-body' }, [
      method,
      h('div', { class: 'btn-row sz-btns' }, [
        UT.dom.button('Mark L', function () { markL(); }, { title: '왼쪽(낮은 z) 드롭 지점 표시' }),
        UT.dom.button('Mark R', function () { markR(); }, { title: '오른쪽(높은 z) 드롭 지점 표시' }),
        UT.dom.button('Clear', function () { clearMarks(); }),
      ]),
      row('Amplitude', els.amp),
      row('Mark L (z)', els.L),
      row('Mark R (z)', els.R),
      row('Length', els.len),
      row('Depth', els.depth),
      els.truthRow,
      Z.canvas,
      els.hint,
    ]);
    Z.els = els;
    Z.win = UT.dom.win({ name: 'size', title: 'Sizing', x: 900, y: 120, w: 330, content: body, onShow: function () { UT.requestRender(); } });
    if (!Z.subscribed) { Z.subscribed = true; UT.bus.on('render', function (f) { sizing.draw(f, st()); }); }
    return Z.win;
  }

  const sizing = {
    get window() { return Z.win; },
    /** Open (create lazily) the Sizing window. */
    open() { sizingEnsure().show(); return sizing; },
    close() { if (Z.win) Z.win.hide(); return sizing; },
    toggle() { return Z.win && Z.win.isOpen() ? sizing.close() : sizing.open(); },
    isOpen() { return !!(Z.win && Z.win.isOpen()); },
    markL, markR, clear: clearMarks, setMethod,
    /** Refresh the readouts (no-op while the window is closed). */
    draw(frame, state) {
      if (!Z.win || !Z.win.isOpen() || !Z.els) return;
      const s = state || st();
      try {
        const info = sizingInfo(frame, s);
        const e = Z.els;
        if (e.method.value !== info.method) e.method.value = info.method;
        e.amp.textContent = info.r ? Math.round(info.r.peakPct) + ' %' : '--';
        e.L.textContent = info.L ? UT.fmtLen(info.L.z, 1) + (info.L.ampPct !== null && info.L.ampPct !== undefined ? '  (' + Math.round(info.L.ampPct) + ' %)' : '') : '--';
        e.R.textContent = info.R ? UT.fmtLen(info.R.z, 1) + (info.R.ampPct !== null && info.R.ampPct !== undefined ? '  (' + Math.round(info.R.ampPct) + ' %)' : '') : '--';
        e.len.textContent = info.len === null ? '--' : UT.fmtLen(info.len, 1) + '  (' + info.method + ' drop)';
        e.depth.textContent = info.r ? UT.fmtLen(info.r.dp, 1) : '--';
        e.truthRow.style.display = info.reveal ? '' : 'none';
        e.truth.textContent = info.d ? UT.fmtLen(info.trueLen, 1) + '  (' + (info.d.label || ('Defect ' + info.d.n)) + ', z ' + Math.round(info.d.zFrom) + '…' + Math.round(info.d.zTo) + ')' : (info.reveal ? 'no defect' : '--');
        const ctx = UT.dom.fitCanvas(Z.canvas, SZ_W, SZ_H);
        drawSizingBar(ctx, info, s);
      } catch (err) { console.error('[UT.views.sizing]', err); }
    },
    helpers: { sizingLength, nearestDefect, sizingInfo },
    css: [
      '.win[data-win=size] .sz-body{display:flex;flex-direction:column;gap:4px;font:12px "Segoe UI",Arial,sans-serif;min-width:300px}',
      '.win[data-win=size] .sz-row{display:flex;justify-content:space-between;gap:8px;padding:1px 2px;border-bottom:1px dotted #bbb}',
      '.win[data-win=size] .sz-label{color:#333}',
      '.win[data-win=size] .sz-val{font-weight:bold;color:#0a246a;text-align:right}',
      '.win[data-win=size] .sz-big{font-size:14px;color:#006000}',
      '.win[data-win=size] .sz-true{color:#c00000}',
      '.win[data-win=size] .sz-btns{display:flex;gap:6px;justify-content:flex-start}',
      '.win[data-win=size] .sz-hint{color:#555;font-size:11px;line-height:1.3}',
      '.win[data-win=size] #cv-size{border:1px solid #444;margin-top:4px}',
    ].join('\n'),
    __selftest() {
      const f = [];
      if (sizingLength([{ side: 'L', z: 120 }, { side: 'R', z: 150 }], { pipe: null, L: 300 }) !== 30) f.push('length plate');
      if (sizingLength([{ side: 'L', z: 490 }, { side: 'R', z: 10 }], { pipe: { od: 1 }, L: 500 }) !== 20) f.push('length pipe wrap');
      if (sizingLength([{ side: 'L', z: 10 }], null) !== null) f.push('length needs both marks');
      const defs = [{ n: 1, pts: [{ x: 0, y: 1 }, { x: 0, y: 3 }], zFrom: 100, zTo: 130 }, { n: 2, pts: [{ x: 0, y: 1 }, { x: 0, y: 3 }], zFrom: 200, zTo: 260 }];
      const nd = nearestDefect(defs, { L: 300 }, 240);
      if (!nd || nd.n !== 2) f.push('nearestDefect');
      const nw = nearestDefect([{ n: 3, pts: defs[0].pts, zFrom: 480, zTo: 20 }], { L: 500, pipe: { od: 1 } }, 5);
      if (!nw || nw.n !== 3) f.push('nearestDefect wrap');
      const info = sizingInfo({ readouts: { primary: { dp: 7.2, peakPct: 55 } } }, { specimen: { L: 300 }, sizing: { marks: [{ side: 'L', z: 100 }, { side: 'R', z: 130 }], method: '6dB' }, probe: { z: 115 }, display: { hide: false }, trade: { revealed: false }, defects: defs });
      if (info.len !== 30 || !info.d || info.d.n !== 1 || info.trueLen !== 30) f.push('sizingInfo ' + JSON.stringify({ len: info.len, d: info.d && info.d.n }));
      const hid = sizingInfo(null, { specimen: { L: 300 }, sizing: { marks: [] }, probe: { z: 115 }, display: { hide: true }, trade: { revealed: false }, defects: defs });
      if (hid.reveal || hid.d) f.push('hidden should not reveal');
      return f;
    },
  };
  UT.views.sizing = sizing;
})(window.UT = window.UT || {});
