/* 62-view-plan.js — plan-view canvas (cv-plan): scrolling z window, hatched weld band, defect
 * rectangles, probe symbol (rotated by skew), beam footprint, raster trail, z ruler, compass dial
 * (skew drag), probe drag; plus the defect-editor helpers drawCircleView (pipe ring) and
 * drawLinearBar (plate bar). Spec §7.4 as amended by §14.2 / §14.3 / §15.6; v2: SPEC-v2 F4 (TOFD pair
 * box), U2 (Pointer Events, scale-aware, touch hit targets), P10/P11 (PA array footprint, C-scan hint
 * band), T2 §4.2.1 (coverage band from UT.trade.coverageMap()).
 *
 * // SPEC NOTES (decisions where the spec is silent or ambiguous)
 * - Shared X scale: when UT.views.cross.toPx exists, scale = (cross.toPx(10,0).x − cross.toPx(0,0).x)/10
 *   and the origin is shifted by the horizontal offset between #cv-cross and #cv-plan bounding
 *   rects (divided by UT.dom.scale() so the design-box scaling of U2 does not shift the origin), so the
 *   weld centre-line is at the SAME screen x in both views. Fallback: canvasWidth/320 px/mm with
 *   x = 0 at the canvas centre.
 * - The z ruler is a 44 px cream strip at the right edge of the canvas (UTman600 look): ticks every
 *   5 mm, labels every 10 mm, a blue 3 px tick at probe.z. The grey field covers the specimen's x
 *   extents only (cream elsewhere), clipped to the left of the ruler strip.
 * - Angle-probe symbol: 24 × 16 mm rectangle whose FRONT edge is 3 mm ahead of the index point
 *   (so the white index dot sits inside the lighter 4 mm front strip). 0° probe: filled circle of
 *   diameter = crystal diameter (min 8 mm so a 5 mm probe stays visible).
 * - Beam footprint length = surface projection |xEnd − probe.x| of the centre ray's last drawn
 *   leg (≤ display.skips) when frame.rays is available, else the distance to x = 0. Not drawn for
 *   0° probes (the beam goes straight down) nor in TOFD mode.
 * - F4 TOFD (state.mode === 'tofd'): ONE small green 24 × 16 mm box centred between the two index
 *   points ((tx + rx)/2, probe.z) with two white dots (Tx/Rx) at ±6 mm inside the box — the original's
 *   small box. Positions from UT.tofd.probePositions(state) when present ({tx:{x}, rx:{x}} or
 *   [{x},{x}]), else probe.x ± tofd.pcs/2. Dragging the box moves the pair (probe.x/z). Tandem rx / TT
 *   receiver: hollow rectangle at probe.x − side·T·tanθ (TT dashed, it sits on the far surface).
 * - PA (probe.method === 'pa'): orange 24 × 16 wedge box with element ticks across the active aperture
 *   (elements·pitch from state.pa, clamped to the box) and the dashed footprint; short cross ticks on the
 *   centre line mark the half-skip exit points T·tan(paFrom) and T·tan(paTo). Footprint length falls
 *   back to |probe.x| because frame.rays is null in PA mode.
 * - C-scan hint band: a 6 px colour strip just left of the ruler (x = fieldW − 9 … fieldW − 3) along z.
 *   Source priority: state.pa.scan while probe.method === 'pa'; else state.aut.map (any mode); else
 *   state.aut.scan while mode === 'aut' (v1 strip data, so the band is useful before 55 writes `map`).
 *   Map shapes accepted: {z0, z1|step, n, map: Float32Array(n × k)} (row-major), {amp: [Float32Array…]}
 *   (per channel/gate) or {columns: [[…]]}; the band shows max over channels per z; values are ALWAYS % FSH
 *   (never rescaled — pctScale is a standalone helper only). Colours from UT.aut.colourFor(pct, aut.revMap) when 55 is
 *   loaded, else the same 7-band table; NaN = unscanned = transparent.
 * - Coverage band (T2 §4.2.1): while trade.active || trade.practice and UT.trade.coverageMap() returns
 *   {zBin, sides:{1, -1}}, every covered z bin is painted faint green (rgba 0,200,0,0.22) per side over
 *   the scanning zone x ∈ [cw/2 + 0.5·T·tan45°, cw/2 + 2·T·tan70°] (union of the half- to full-skip bands
 *   of the 45–70° set), clamped to the scan surface; drawn regardless of display.hide (also in HIDE).
 * - Compass hidden when UT.modes.enabled[mode].hidden/views lists 'compass'; otherwise for modes
 *   dac / v1 / v2 / tky / iow / fbh (the TOFD, AUT and lamination screenshots all show the dial).
 * - Pointer Events (U2): pointerdown/move/up/cancel on the canvas with setPointerCapture (window
 *   fallback listeners only when capture fails); non-primary pointers and non-left buttons ignored.
 *   Legacy mouse/touch listeners are bound only when PointerEvent is unavailable. Left-drag on the
 *   probe symbol keeps the grab offset; pointerdown elsewhere on the field jumps the probe there and
 *   drags (UTman "LEFT mouse button/drag to move the UT Probe"). x is clamped to spec.scanSurface, z
 *   clamped 0…L (pipes wrap). Positions rounded to 0.5 mm. Probe drag is locked while
 *   state.editing.defect (skew dial still works).
 * - Touch hit targets: for pointerType 'touch'/'pen' the probe hit region is padded so the target is
 *   ≥ 44 CSS px (touchPadMm) and the dial accepts presses up to 24 px outside the ring (10 px mouse).
 * - 'ui' bus event: like 60, the plan view emits UT.bus.emit('ui', {kind:'probe-drag', id:'cv-plan'})
 *   ONCE per drag gesture (on the first position change) so lesson gesture tallies (L1 step 3, L17
 *   raster along z) also count drags made in the plan view. UT.views.plan.dragTo(x, {z}) dispatches
 *   synthetic pointer events on #cv-plan through the same code path (scale-aware) and returns probe.x.
 * - Weld band for fillet-t / nozzle preps (F1): hatched band of weld.capWidth (= 2·(webT/2 + leg)) with
 *   the web drawn as a darker solid strip webT wide; prep 'none' draws no band.
 * - Finger dampers (P3): state.damping.points are drawn as small grey dots at (x_d, probe.z).
 * - Raster trail: recorded in draw() while mode === 'lamination' (positions ≥ 0.5 mm apart, last
 *   200), auto-cleared when the mode is anything else; clearTrail() for tb-clear.
 * - Circle view: ring radii min(150/120 px, fit to canvas); a drag on the annulus selects the
 *   SHORTER arc between the press and the current point (so clockwise drags also work): the
 *   result is delivered as onDrag(zFrom, zTo) on every move and on release (zFrom > zTo = wrap on
 *   the pipe). A press+release without motion (< 3 px) calls onSelect(n) for the defect under the
 *   pointer (if any). The caption 'Circle-View. Position <z>' shows the pointer z while hovering.
 *   The red status line under the ring belongs to the editor (80-modes), not drawn here.
 * - Linear bar: same semantics with a horizontal bar 0…L (no wrap, zFrom ≤ zTo), tick labels every
 *   round(L/12) mm.
 * - toMm(px, py) returns {x, z, y: z} so both the §15.6 shape ({x, y}) and plan semantics work.
 * - The static 'PLAN VIEW' heading is drawn in English like the cross-section's 'CROSS SECTION'
 *   (SPEC-v2 §5.3: canvases are out of scope; both main-canvas headings follow the same rule).
 *   The parametrised editor captions ('Circle-View. Position {z}', 'Plate. Position {z}') go
 *   through UT.i18n.t() even though canvases are outside the untranslated() audit.
 */
(function (UT) {
  'use strict';
  UT.views = UT.views || {};
  const M = UT.math;
  const C = UT.consts;

  const RULER_W = 44;          // px, z ruler strip at the right
  const DIAL_R = 60;           // px, compass ring radius
  const TRAIL_MAX = 200;
  const BAND_W = 6;            // px, C-scan hint strip width
  const TOUCH_TARGET_PX = 44;  // minimum touch hit target (CSS px)
  const COMPASS_HIDDEN_MODES = { dac: 1, v1: 1, v2: 1, tky: 1, iow: 1, fbh: 1 };
  const TOFD_COLOUR = '#00c000';
  const COVERAGE_COLOUR = 'rgba(0,200,0,0.22)';
  // 7-band AUT colour map (§14.6) — used only when UT.aut.colourFor is unavailable
  const BANDS = [
    { min: 100, colour: '#ffffff' }, { min: 80, colour: '#ff0000' }, { min: 60, colour: '#ff00ff' },
    { min: 40, colour: '#ffff00' }, { min: 25, colour: '#00c000' }, { min: 10, colour: '#00ffff' }, { min: -Infinity, colour: '#0000ff' },
  ];

  function t(key, params) { return UT.i18n && typeof UT.i18n.t === 'function' ? UT.i18n.t(key, params) : key; }

  // ------------------------------------------------------------------ pure helpers (headless-safe)
  /** Top of the visible z window (mm) for a probe z on a specimen of length L. */
  function zWindowTop(probeZ, L, windowMm) {
    const maxTop = Math.max(0, (L || 0) - windowMm);
    return M.clamp((probeZ || 0) - 30, 0, maxTop);
  }

  /**
   * Snap a skew angle: 1° normally, 5° with Shift; normalised to 0..359 — the same range the
   * §11 validation contract (UT.test.setProbe / 40-ascan) stores, so every writer of probe.skew agrees.
   * Use skewLabel() for the ±180 display form.
   */
  function snapSkew(deg, shift) {
    const step = shift ? 5 : 1;
    const s = Math.round(deg / step) * step;
    const n = ((s % 360) + 360) % 360;
    return n === 0 ? 0 : n;   // avoid -0
  }

  /** Display form of a stored 0..359 skew: folded to (−180, 180] (e.g. 338 → −22). */
  function skewLabel(skew) {
    let s = ((skew % 360) + 360) % 360;
    if (s > 180) s -= 360;
    return s === 0 ? 0 : s;
  }

  /** Wrap z into [0, L). */
  function wrapZ(z, L) { if (!(L > 0)) return z; return ((z % L) + L) % L; }

  /**
   * Split a defect's z extent into non-wrapping [a, b] spans within 0…L.
   * On pipes zTo < zFrom means the defect wraps through z = 0.
   */
  function zSpans(zFrom, zTo, L, pipe) {
    if (!(L > 0)) return [[Math.min(zFrom, zTo), Math.max(zFrom, zTo)]];
    if (pipe) {
      const a = wrapZ(zFrom, L), b = wrapZ(zTo, L);
      if (Math.abs(zTo - zFrom) >= L) return [[0, L]];
      if (b >= a) return [[a, b]];
      return [[a, L], [0, b]];
    }
    const lo = M.clamp(Math.min(zFrom, zTo), 0, L), hi = M.clamp(Math.max(zFrom, zTo), 0, L);
    return [[lo, hi]];
  }

  /** Canvas angle (rad, y-down convention) of circumferential position z: anticlockwise from 12 o'clock. */
  function circleAngle(z, Cir) { return -Math.PI / 2 - (Cir > 0 ? z / Cir : 0) * 2 * Math.PI; }

  /** Inverse of circleAngle: z in [0, C) for a canvas angle (rad). */
  function zAtAngle(aRad, Cir) {
    let t0 = (-Math.PI / 2 - aRad) / (2 * Math.PI);   // turns anticlockwise from the top
    t0 = t0 - Math.floor(t0);
    return t0 * Cir;
  }

  /**
   * Drag result on a ring: the shorter arc between z0 and z1 (wrap-aware).
   * @returns {{zFrom:number, zTo:number}}
   */
  function ringDragSpan(z0, z1, Cir) {
    let d = z1 - z0;
    if (Cir > 0) { d = ((d % Cir) + Cir) % Cir; if (d > Cir / 2) d -= Cir; }
    const from = d >= 0 ? z0 : wrapZ(z0 + d, Cir);
    const to = d >= 0 ? wrapZ(z0 + d, Cir) : z0;
    return { zFrom: +from.toFixed(1), zTo: +to.toFixed(1) };
  }

  /** Does z lie within a defect's z extent (wrap-aware on pipes)? */
  function zInDefect(z, d, L, pipe) {
    return zSpans(d.zFrom, d.zTo, L, pipe).some(function (s) { return z >= s[0] - 1e-9 && z <= s[1] + 1e-9; });
  }

  /** Beam direction unit vector in the plan (x right, z down) for side ±1 and skew (deg, + clockwise). */
  function planDir(side, skewDeg) {
    const s = M.deg2rad(skewDeg || 0);
    const sd = side === -1 ? -1 : 1;
    return { x: -sd * Math.cos(s), z: -sd * Math.sin(s) };
  }

  /** Lighten a #rrggbb colour toward white by t (0..1). */
  function lighten(hex, tt) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
    if (!m) return '#e0e0e0';
    const f = function (h) { const v = parseInt(h, 16); return Math.round(v + (255 - v) * tt); };
    return 'rgb(' + f(m[1]) + ',' + f(m[2]) + ',' + f(m[3]) + ')';
  }

  function isCompassHidden(state) {
    const mode = state && state.mode;
    const en = UT.modes && UT.modes.enabled && UT.modes.enabled[mode];
    if (en) {
      const arr = en.hidden || en.views || en.hiddenViews;
      if (Array.isArray(arr)) return arr.indexOf('compass') >= 0;
    }
    return !!COMPASS_HIDDEN_MODES[mode];
  }

  function defectBox(d) {
    if (!d || !Array.isArray(d.pts) || !d.pts.length) return null;
    return UT.specimens && UT.specimens.bbox ? UT.specimens.bbox(d.pts) : null;
  }

  /** Geometry (mm) of the F4 TOFD pair box: 24 × 16 centred between the index points, dots at ±6. */
  function tofdBox(tx, rx, z) {
    const xc = (tx + rx) / 2;
    return { xc, z, x0: xc - 12, x1: xc + 12, z0: z - 8, z1: z + 8, dots: [xc - 6, xc + 6] };
  }

  /** Extra hit padding (mm) for coarse pointers so a target of sizeMm spans ≥ 44 CSS px (min 1.5 mm). */
  function touchPadMm(sizeMm, scale) {
    const need = TOUCH_TARGET_PX / Math.max(scale || 1, 1e-6);
    return Math.max(1.5, (need - (sizeMm || 0)) / 2);
  }

  /**
   * Reduce a C-scan map to one maximum per z column (NaN where nothing was scanned).
   * Accepts {n, map: Float32Array(n × k)}, {n, amp: [Float32Array…]} (per channel) or {n, columns: [[…]]}.
   * @returns {Float32Array|null}
   */
  function columnMaxima(m) {
    if (!m || !(m.n > 0)) return null;
    const n = Math.floor(m.n);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = NaN;
    const acc = function (i, v) { if (!Number.isFinite(v)) return; out[i] = Number.isNaN(out[i]) ? v : Math.max(out[i], v); };
    const flat = m.map;
    if (flat && typeof flat.length === 'number' && typeof flat !== 'function' && flat.length >= n) {
      const k = Math.max(1, Math.floor(flat.length / n));
      for (let i = 0; i < n; i++) for (let j = 0; j < k; j++) acc(i, flat[i * k + j]);
    } else if (Array.isArray(m.amp) && m.amp.length) {
      for (const ch of m.amp) { if (!ch || typeof ch.length !== 'number') continue; for (let i = 0; i < n && i < ch.length; i++) acc(i, ch[i]); }
    } else if (Array.isArray(m.columns) && m.columns.length) {
      for (let i = 0; i < n && i < m.columns.length; i++) { const col = m.columns[i]; if (!col || typeof col.length !== 'number') continue; for (let j = 0; j < col.length; j++) acc(i, col[j]); }
    } else return null;
    return out;
  }

  /** Scale fraction-valued maps (max ≤ 1.5) to % FSH; % maps are returned unchanged. */
  function pctScale(vals) {
    let mx = -Infinity;
    for (let i = 0; i < vals.length; i++) if (Number.isFinite(vals[i]) && vals[i] > mx) mx = vals[i];
    if (!(mx > 0) || mx > 1.5) return vals;
    const out = new Float32Array(vals.length);
    for (let i = 0; i < vals.length; i++) out[i] = vals[i] * 100;
    return out;
  }

  /** Colour of an amplitude (% FSH) in the 7-band map (UT.aut.colourFor when available). */
  function bandColour(pct, rev) {
    if (UT.aut && typeof UT.aut.colourFor === 'function') { try { return UT.aut.colourFor(pct, rev); } catch (e) { /* fall through */ } }
    if (!Number.isFinite(pct)) return 'rgba(0,0,0,0)';
    let idx = BANDS.length - 1;
    for (let i = 0; i < BANDS.length; i++) { if (pct >= BANDS[i].min) { idx = i; break; } }
    return BANDS[rev ? BANDS.length - 1 - idx : idx].colour;
  }

  /**
   * Merge covered z bins (value ≥ 1) into [zFrom, zTo] runs (mm).
   * @param {ArrayLike<number>} bins  coverage counts per bin
   * @param {number} zBin  bin width (mm)
   * @param {number} [L]  specimen length (runs are clipped to it)
   */
  function coverageRuns(bins, zBin, L) {
    const out = [];
    if (!bins || !(zBin > 0)) return out;
    let start = -1;
    const n = bins.length;
    for (let i = 0; i <= n; i++) {
      const on = i < n && bins[i] >= 1;
      if (on && start < 0) start = i;
      if (!on && start >= 0) {
        const a = start * zBin, b = i * zBin;
        out.push([a, L > 0 ? Math.min(b, L) : b]);
        start = -1;
      }
    }
    return out;
  }

  /** Scanning-zone x band (mm from the weld centre, side +1) painted by the coverage overlay. */
  function coverageBand(spec) {
    const T = (spec && spec.T) || 20;
    const cw = (spec && spec.weld && spec.weld.capWidth) || 16;
    return { inner: cw / 2 + 0.5 * T * Math.tan(M.deg2rad(45)), outer: cw / 2 + 2 * T * Math.tan(M.deg2rad(70)) };
  }

  /** Element tick positions (mm along the beam axis, u ≤ 0 behind the index) of a PA array inside the 24 mm box. */
  function paTicks(elements, pitch) {
    const n = M.clamp(Math.round(elements || 16), 1, 128);
    const A = Math.min(22, Math.max(2, n * (pitch || 1)));
    const p = A / n;
    const u0 = -21 + (24 - A) / 2;
    const out = [];
    for (let i = 0; i <= n; i++) out.push(u0 + i * p);
    return out;
  }

  // ------------------------------------------------------------------ plan view state
  let canvas = null;
  let tf = { scale: 4, originX: 640, zTop: 0, windowMm: 65, w: 1280, h: 260, fieldW: 1236 };
  let trail = [];
  let drag = null;              // {kind:'probe'|'dial', dx, dz, pointerId, captured, coarse, emitted}
  let dialC = { x: 0, y: 0 };
  let lastProbeSym = null;      // geometry of the drawn probe symbol for hit testing
  let hoverCursor = '';

  function cssSize(cv) {
    const w = cv.clientWidth || cv.width || 640;
    const h = cv.clientHeight || cv.height || 260;
    return { w, h };
  }

  function layoutScale() {
    if (UT.dom && typeof UT.dom.scale === 'function') { try { const k = UT.dom.scale(); if (isFinite(k) && k > 0) return k; } catch (e) { /* ignore */ } }
    return 1;
  }

  /** Recompute the mm→px transform from the canvas box, the shared cross-section scale and the probe z. */
  function computeTransform(cv, state) {
    const sz = cssSize(cv);
    let scale = 0, originX = sz.w / 2;
    const cross = UT.views.cross;
    if (cross && typeof cross.toPx === 'function') {
      try {
        const p0 = cross.toPx(0, 0), p1 = cross.toPx(10, 0);
        const s = (p1.x - p0.x) / 10;
        if (isFinite(s) && s > 0.05) {
          scale = s;
          let off = 0;
          if (typeof document !== 'undefined') {
            const cc = document.getElementById('cv-cross');
            if (cc && cc.getBoundingClientRect && cv.getBoundingClientRect) {
              const a = cc.getBoundingClientRect(), b = cv.getBoundingClientRect();
              if (a.width > 0 && b.width > 0) off = (a.left - b.left) / layoutScale();
            }
          }
          originX = p0.x + off;
        }
      } catch (e) { scale = 0; }
    }
    if (!scale) { scale = sz.w / 320; originX = sz.w / 2; }
    const windowMm = sz.h / scale;
    const spec = state && state.specimen;
    const L = spec ? spec.L : 300;
    const zTop = zWindowTop(state && state.probe ? state.probe.z : 0, L, windowMm);
    tf = { scale, originX, zTop, windowMm, w: sz.w, h: sz.h, fieldW: Math.max(0, sz.w - RULER_W), L };
    return tf;
  }

  /** mm → CSS px (x across the weld, z along the weld). */
  function toPx(x, z) { return { x: tf.originX + x * tf.scale, y: (z - tf.zTop) * tf.scale }; }
  /** CSS px → mm. Returns {x, z, y} with y === z. */
  function toMm(px, py) { const z = tf.zTop + py / tf.scale; return { x: (px - tf.originX) / tf.scale, z, y: z }; }
  /** Refit the transform (called on resize by the app; draw() does it every frame anyway). */
  function fit() { if (canvas) computeTransform(canvas, UT.state); return tf; }

  // ------------------------------------------------------------------ drawing pieces
  function drawField(ctx, spec) {
    ctx.fillStyle = C.COLOURS.cream;
    ctx.fillRect(0, 0, tf.w, tf.h);
    const ex = spec.extents || { xMin: -150, xMax: 150 };
    const x0 = M.clamp(toPx(ex.xMin, 0).x, 0, tf.fieldW), x1 = M.clamp(toPx(ex.xMax, 0).x, 0, tf.fieldW);
    ctx.fillStyle = C.COLOURS.steel;
    ctx.fillRect(x0, 0, Math.max(0, x1 - x0), tf.h);
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 + 0.5, 0.5, Math.max(0, x1 - x0) - 1, tf.h - 1);
    // side-drilled holes run along z: thin white lines
    for (const hole of spec.holes || []) {
      const hx = toPx(hole.x, 0).x;
      if (hx < 0 || hx > tf.fieldW) continue;
      ctx.strokeStyle = C.COLOURS.hole;
      ctx.lineWidth = Math.max(1, hole.r * 2 * tf.scale * 0.5);
      ctx.beginPath(); ctx.moveTo(hx, 0); ctx.lineTo(hx, tf.h); ctx.stroke();
    }
  }

  function drawWeldBand(ctx, spec) {
    const weld = spec.weld;
    if (!weld || weld.type === 'none' || weld.prep === 'none') return;
    const fillet = weld.type === 'fillet' || weld.prep === 'fillet-t' || weld.prep === 'nozzle';
    const cw = weld.capWidth || 16;
    const xl = toPx(-cw / 2, 0).x, xr = toPx(cw / 2, 0).x;
    if (xr < 0 || xl > tf.fieldW) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(Math.max(0, xl), 0, Math.min(xr, tf.fieldW) - Math.max(0, xl), tf.h); ctx.clip();
    ctx.fillStyle = '#767676';
    ctx.fillRect(xl, 0, xr - xl, tf.h);
    // diagonal hatch
    ctx.strokeStyle = 'rgba(20,20,20,0.75)';
    ctx.lineWidth = 1;
    const wpx = xr - xl;
    ctx.beginPath();
    for (let y = -wpx; y < tf.h + wpx; y += 7) { ctx.moveTo(xl, y); ctx.lineTo(xr, y + wpx); }
    ctx.stroke();
    if (fillet) {
      // set-on web seen from above: solid darker strip webT wide between the two fillets
      const wt = weld.webT || 12;
      const wl = toPx(-wt / 2, 0).x, wr = toPx(wt / 2, 0).x;
      ctx.fillStyle = '#4a4a4a';
      ctx.fillRect(wl, 0, wr - wl, tf.h);
      ctx.strokeStyle = '#111';
      ctx.beginPath();
      ctx.moveTo(Math.round(wl) + 0.5, 0); ctx.lineTo(Math.round(wl) + 0.5, tf.h);
      ctx.moveTo(Math.round(wr) + 0.5, 0); ctx.lineTo(Math.round(wr) + 0.5, tf.h);
      ctx.stroke();
    } else {
      // rippled cap: stacked scallops along z
      ctx.strokeStyle = 'rgba(232,232,232,0.7)';
      ctx.lineWidth = 1.5;
      const pitch = Math.max(8, 5 * tf.scale);
      const start = -((tf.zTop * tf.scale) % pitch);
      for (let y = start; y < tf.h + pitch; y += pitch) {
        ctx.beginPath();
        ctx.ellipse((xl + xr) / 2, y, wpx / 2, pitch * 0.55, 0, Math.PI, 0, false);
        ctx.stroke();
      }
    }
    ctx.restore();
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.round(xl) + 0.5, 0); ctx.lineTo(Math.round(xl) + 0.5, tf.h);
    ctx.moveTo(Math.round(xr) + 0.5, 0); ctx.lineTo(Math.round(xr) + 0.5, tf.h);
    ctx.stroke();
  }

  /** Coverage tracker overlay (T2 §4.2.1): faint green band per side over the covered z bins; also in HIDE. */
  function drawCoverage(ctx, state, spec) {
    const tr = state.trade;
    if (!tr || !(tr.active || tr.practice)) return;
    if (!(UT.trade && typeof UT.trade.coverageMap === 'function')) return;
    let cm = null;
    try { cm = UT.trade.coverageMap(); } catch (e) { cm = null; }
    if (!cm || !cm.sides) return;
    const zBin = cm.zBin > 0 ? cm.zBin : 5;
    const band = coverageBand(spec);
    const ss = spec.scanSurface || spec.extents || { xMin: -150, xMax: 150 };
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, tf.fieldW, tf.h); ctx.clip();
    ctx.fillStyle = COVERAGE_COLOUR;
    for (const sideKey of [1, -1]) {
      const bins = cm.sides[sideKey] || cm.sides[String(sideKey)];
      if (!bins) continue;
      const side = sideKey;
      let xa = side * band.inner, xb = side * band.outer;
      if (xa > xb) { const tmp = xa; xa = xb; xb = tmp; }
      xa = M.clamp(xa, ss.xMin, ss.xMax); xb = M.clamp(xb, ss.xMin, ss.xMax);
      if (xb - xa < 0.5) continue;
      const px0 = toPx(xa, 0).x, px1 = toPx(xb, 0).x;
      for (const run of coverageRuns(bins, zBin, spec.L)) {
        const y0 = toPx(0, run[0]).y, y1 = toPx(0, run[1]).y;
        if (y1 < 0 || y0 > tf.h) continue;
        ctx.fillRect(px0, y0, px1 - px0, Math.max(1, y1 - y0));
      }
    }
    ctx.restore();
  }

  function drawTrail(ctx) {
    if (!trail.length) return;
    ctx.fillStyle = 'rgba(255,255,255,0.38)';
    for (const p of trail) {
      const q = toPx(p.x, p.z);
      if (q.x < 0 || q.x > tf.fieldW || q.y < 0 || q.y > tf.h) continue;
      ctx.beginPath(); ctx.arc(q.x, q.y, 2, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawDefects(ctx, state, spec) {
    if (!state.defects || state.display.hide) return;
    const pipe = !!spec.pipe;
    for (const d of state.defects) {
      if (!d || d.visible === false) continue;
      const b = defectBox(d);
      if (!b) continue;
      const wMm = Math.max(3, b.w);
      const xl = toPx(b.cx - wMm / 2, 0).x, xr = toPx(b.cx + wMm / 2, 0).x;
      if (xr < 0 || xl > tf.fieldW) continue;
      for (const s of zSpans(d.zFrom, d.zTo, spec.L, pipe)) {
        const y0 = toPx(0, s[0]).y, y1 = toPx(0, s[1]).y;
        if (y1 < 0 || y0 > tf.h) continue;
        ctx.fillStyle = C.COLOURS.defect;
        ctx.fillRect(Math.max(0, xl), y0, Math.min(xr, tf.fieldW) - Math.max(0, xl), Math.max(2, y1 - y0));
      }
    }
  }

  /** Finger dampers (P3) on the scanning surface: small grey dots at (x_d, probe.z). */
  function drawDampers(ctx, state) {
    const pts = state.damping && Array.isArray(state.damping.points) ? state.damping.points : null;
    if (!pts || !pts.length) return;
    ctx.save();
    for (const xd of pts) {
      const x = typeof xd === 'number' ? xd : (xd && xd.x);
      if (!Number.isFinite(x)) continue;
      const p = toPx(x, state.probe.z);
      if (p.x < 0 || p.x > tf.fieldW) continue;
      ctx.fillStyle = 'rgba(120,120,120,0.9)';
      ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#333'; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.restore();
  }

  function footprintLength(frame, state) {
    const probe = state.probe;
    let xEnd = null;
    const rays = frame && frame.rays;
    const skips = (state.display && state.display.skips) || 3;
    if (rays && rays.centre) {
      const legs = rays.centre.legs;
      if (Array.isArray(legs) && legs.length) {
        let last = null;
        for (const lg of legs) if (!lg.leg || lg.leg <= skips) last = lg;
        if (last && last.b) xEnd = last.b.x;
      }
      if (xEnd === null && Array.isArray(rays.centre.pts) && rays.centre.pts.length) xEnd = rays.centre.pts[rays.centre.pts.length - 1].x;
    }
    const len = xEnd === null ? Math.abs(probe.x) : Math.abs(xEnd - probe.x);
    return Math.max(0, len);
  }

  function drawFootprint(ctx, frame, state, derived, spec) {
    const probe = state.probe;
    const pa = probe.method === 'pa';
    if ((!probe.angle && !pa) || state.mode === 'tofd') return;
    if (state.display && (state.display.beam === false || state.display.hide)) return;
    const len = footprintLength(frame, state);
    if (len < 2) return;
    const th = (derived && derived.halfAngle20dB) || 4;
    const o = toPx(probe.x, probe.z);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, tf.fieldW, tf.h); ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    for (const off of [0, th, -th]) {
      const d = planDir(probe.side, (probe.skew || 0) + off);
      ctx.beginPath();
      ctx.moveTo(o.x, o.y);
      ctx.lineTo(o.x + d.x * len * tf.scale, o.y + d.z * len * tf.scale);
      ctx.stroke();
    }
    if (pa) {
      // half-skip exit points of the sweep limits: short cross ticks on the centre line
      const T = (spec && spec.T) || 20;
      const d = planDir(probe.side, probe.skew || 0);
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 1.5;
      for (const a of [probe.paFrom, probe.paTo]) {
        if (!Number.isFinite(a) || a <= 0 || a >= 89) continue;
        const s = T * Math.tan(M.deg2rad(a));
        if (s > len) continue;
        const cx = o.x + d.x * s * tf.scale, cy = o.y + d.z * s * tf.scale;
        ctx.beginPath();
        ctx.moveTo(cx - d.z * 5, cy + d.x * 5); ctx.lineTo(cx + d.z * 5, cy - d.x * 5);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /** Rotated probe rectangle in plan mm: front edge 3 mm ahead of the index, 24 long, 16 wide. */
  function rectSymbol(ctx, xIdx, zIdx, side, skew, colour, opts) {
    const o = opts || {};
    const d = planDir(side, skew);
    const ang = Math.atan2(d.z, d.x);
    const p = toPx(xIdx, zIdx);
    const s = tf.scale;
    const uF = o.front === undefined ? 3 : o.front, uB = o.back === undefined ? -21 : o.back, hv = o.half === undefined ? 8 : o.half;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(ang);
    if (o.hollow) {
      ctx.strokeStyle = colour; ctx.lineWidth = 2;
      if (o.dashed) ctx.setLineDash([5, 4]);
      ctx.strokeRect(uB * s, -hv * s, (uF - uB) * s, 2 * hv * s);
    } else {
      ctx.fillStyle = colour;
      ctx.fillRect(uB * s, -hv * s, (uF - uB) * s, 2 * hv * s);
      ctx.fillStyle = lighten(colour, 0.45);
      ctx.fillRect((uF - 4) * s, -hv * s, 4 * s, 2 * hv * s);
      if (Array.isArray(o.ticks) && o.ticks.length) {
        // PA element ticks across the active aperture
        ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (const u of o.ticks) { ctx.moveTo(u * s, -hv * s * 0.6); ctx.lineTo(u * s, hv * s * 0.6); }
        ctx.stroke();
        ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.strokeRect(o.ticks[0] * s, -hv * s * 0.6, (o.ticks[o.ticks.length - 1] - o.ticks[0]) * s, hv * s * 1.2);
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1;
      ctx.strokeRect(uB * s + 0.5, -hv * s + 0.5, (uF - uB) * s - 1, 2 * hv * s - 1);
      if (o.dotU !== null) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc((o.dotU || 0) * s, 0, 2, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
    return { kind: 'rect', x: xIdx, z: zIdx, dir: d, uF, uB, hv };
  }

  function tofdPositions(state) {
    let tx = null, rx = null;
    try {
      if (UT.tofd && typeof UT.tofd.probePositions === 'function') {
        const pp = UT.tofd.probePositions(state);
        if (pp) {
          const a = pp.tx || pp[0], b = pp.rx || pp[1];
          if (a && typeof a.x === 'number') tx = a.x;
          if (b && typeof b.x === 'number') rx = b.x;
        }
      }
    } catch (e) { tx = rx = null; }
    const pcs = (state.tofd && state.tofd.pcs) || 60;
    if (tx === null) tx = state.probe.x + pcs / 2;
    if (rx === null) rx = state.probe.x - pcs / 2;
    return { tx, rx };
  }

  function drawProbe(ctx, state, spec, derived) {
    const probe = state.probe;
    const pa = probe.method === 'pa';
    const colour = pa ? C.PROBE_COLOURS.pa : ((derived && derived.colour) || C.PROBE_COLOURS[probe.angle] || '#00c000');
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, tf.fieldW, tf.h); ctx.clip();
    if (state.mode === 'tofd') {
      // F4: one small green 24 × 16 box centred between the probes with two dots (Tx / Rx)
      const pp = tofdPositions(state);
      const box = tofdBox(pp.tx, pp.rx, probe.z);
      const a = toPx(box.x0, box.z0), b = toPx(box.x1, box.z1);
      ctx.fillStyle = TOFD_COLOUR;
      ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1;
      ctx.strokeRect(a.x + 0.5, a.y + 0.5, b.x - a.x - 1, b.y - a.y - 1);
      ctx.fillStyle = '#fff';
      for (const dx of box.dots) {
        const dot = toPx(dx, probe.z);
        ctx.beginPath(); ctx.arc(dot.x, dot.y, 2.5, 0, Math.PI * 2); ctx.fill();
      }
      lastProbeSym = { kind: 'box', x0: box.x0, x1: box.x1, z0: box.z0, z1: box.z1 };
    } else if (pa) {
      const paState = state.pa || {};
      lastProbeSym = rectSymbol(ctx, probe.x, probe.z, probe.side, probe.skew, colour, { dotU: 0, ticks: paTicks(paState.elements, paState.pitch) });
    } else if (!probe.angle) {
      const D = Math.max(8, (derived && derived.diameter) || probe.diameter || 10);
      const p = toPx(probe.x, probe.z);
      ctx.fillStyle = colour;
      ctx.beginPath(); ctx.arc(p.x, p.y, D / 2 * tf.scale, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1; ctx.stroke();
      lastProbeSym = { kind: 'circle', x: probe.x, z: probe.z, r: D / 2 + 1.5 };
    } else {
      const th = M.deg2rad(probe.angle || 60);
      const T = spec.T || 20;
      if (probe.method === 'tandem') rectSymbol(ctx, probe.x - (probe.side || 1) * T * Math.tan(th), probe.z, probe.side, probe.skew, colour, { hollow: true });
      if (probe.method === 'tt') rectSymbol(ctx, probe.x - (probe.side || 1) * T * Math.tan(th), probe.z, probe.side, probe.skew, colour, { hollow: true, dashed: true });
      lastProbeSym = rectSymbol(ctx, probe.x, probe.z, probe.side, probe.skew, colour, { dotU: 0 });
    }
    ctx.restore();
  }

  /** Source of the C-scan hint band: {z0, step, n, vals, rev} or null. */
  function scanBandSource(state) {
    const probe = state.probe || {};
    const pa = state.pa, aut = state.aut;
    let m = null, rev = false;
    if (probe.method === 'pa' && pa && pa.scan) m = pa.scan;
    else if (aut && aut.map) { m = aut.map; rev = !!aut.revMap; }
    else if (aut && aut.scan && state.mode === 'aut') { m = aut.scan; rev = !!aut.revMap; }
    if (!m) return null;
    let vals = null;
    try { vals = columnMaxima(m); } catch (e) { vals = null; }
    if (!vals || !vals.length) return null;
    const n = vals.length;
    const z0 = Number.isFinite(m.z0) ? m.z0 : 0;
    const step = m.step > 0 ? m.step : (Number.isFinite(m.z1) && n > 1 ? (m.z1 - z0) / (n - 1) : 1);
    // aut.map / aut.scan.amp (55) and pa.scan.map (56) are ALWAYS % FSH — never rescale (a clean scan whose
    // maxima are ≈ 1 % must not be inflated ×100 by the fraction heuristic; pctScale stays a standalone helper).
    return { z0, step, n, vals, rev };
  }

  /** AUT / PA C-scan hint band: thin colour strip along z just left of the ruler. */
  function drawScanBand(ctx, state) {
    const src = scanBandSource(state);
    if (!src) return;
    const x0 = tf.fieldW - BAND_W - 3;
    const zEnd = tf.zTop + tf.windowMm;
    const i0 = Math.max(0, Math.floor((tf.zTop - src.z0) / src.step) - 1);
    const i1 = Math.min(src.n - 1, Math.ceil((zEnd - src.z0) / src.step) + 1);
    if (i1 < i0) return;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(x0 - 1, 0, BAND_W + 2, tf.h);
    const hpx = Math.max(1, src.step * tf.scale);
    for (let i = i0; i <= i1; i++) {
      const v = src.vals[i];
      if (!Number.isFinite(v)) continue;
      const y = toPx(0, src.z0 + i * src.step).y;
      ctx.fillStyle = bandColour(v, src.rev);
      ctx.fillRect(x0, y - hpx / 2, BAND_W, hpx + 0.5);
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 - 0.5, 0.5, BAND_W + 1, tf.h - 1);
    ctx.restore();
  }

  function drawRuler(ctx, state) {
    const x0 = tf.fieldW;
    ctx.fillStyle = C.COLOURS.cream;
    ctx.fillRect(x0, 0, RULER_W, tf.h);
    const lineX = Math.round(x0 + 9) + 0.5;
    ctx.strokeStyle = C.COLOURS.ruler;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(lineX, 0); ctx.lineTo(lineX, tf.h); ctx.stroke();
    ctx.font = '10px Segoe UI, Arial, sans-serif';
    ctx.fillStyle = C.COLOURS.ruler;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const zEnd = tf.zTop + tf.windowMm;
    const zFirst = Math.ceil(tf.zTop / 5) * 5;
    ctx.beginPath();
    for (let z = zFirst; z <= zEnd + 1e-6; z += 5) {
      const y = Math.round(toPx(0, z).y) + 0.5;
      const major = Math.round(z) % 10 === 0;
      ctx.moveTo(lineX, y); ctx.lineTo(lineX + (major ? 9 : 5), y);
      if (major) ctx.fillText(String(Math.round(z)), lineX + 12, M.clamp(y, 6, tf.h - 6));
    }
    ctx.stroke();
    // probe z marker
    const pz = state.probe.z;
    if (pz >= tf.zTop - 1e-6 && pz <= zEnd + 1e-6) {
      const y = toPx(0, pz).y;
      ctx.strokeStyle = '#0000ff';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(lineX - 8, y); ctx.lineTo(lineX, y); ctx.stroke();
    }
  }

  function drawCompass(ctx, state) {
    dialC = { x: tf.fieldW - 16 - DIAL_R, y: 16 + DIAL_R };
    const skew = state.probe.skew || 0;
    ctx.save();
    ctx.font = '11px Segoe UI, Arial, sans-serif';
    ctx.fillStyle = '#000';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('PLAN VIEW', dialC.x - DIAL_R - 8, 18); // English like 60's 'CROSS SECTION' (§5.3: canvases out of scope)
    ctx.strokeStyle = '#0000ff';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(dialC.x, dialC.y, DIAL_R, 0, Math.PI * 2); ctx.stroke();
    const a = M.deg2rad(skew);
    ctx.strokeStyle = '#ff0000';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(dialC.x, dialC.y);
    ctx.lineTo(dialC.x + Math.sin(a) * (DIAL_R - 4), dialC.y - Math.cos(a) * (DIAL_R - 4));
    ctx.stroke();
    ctx.fillStyle = '#ff0000';
    ctx.beginPath(); ctx.arc(dialC.x, dialC.y, 5, 0, Math.PI * 2); ctx.fill();
    if (skew) {
      ctx.font = '10px Segoe UI, Arial, sans-serif';
      ctx.fillStyle = '#000';
      ctx.textAlign = 'center';
      ctx.fillText(skewLabel(skew) + '°', dialC.x, dialC.y + DIAL_R + 10);
    }
    ctx.restore();
  }

  function recordTrail(state) {
    if (state.mode !== 'lamination') { if (trail.length) trail = []; return; }
    const p = state.probe;
    const last = trail[trail.length - 1];
    if (last && Math.abs(last.x - p.x) < 0.5 && Math.abs(last.z - p.z) < 0.5) return;
    trail.push({ x: p.x, z: p.z });
    if (trail.length > TRAIL_MAX) trail.splice(0, trail.length - TRAIL_MAX);
  }

  /**
   * Draw the plan view from the current frame and state.
   * @param {object} frame UT.frame (rays/derived may be null)
   * @param {object} state UT.state
   */
  function draw(frame, state) {
    if (!canvas) return;
    const ctx = UT.dom.fitCanvas(canvas);
    state = state || UT.state;
    computeTransform(canvas, state);
    ctx.save();
    ctx.fillStyle = C.COLOURS.cream;
    ctx.fillRect(0, 0, tf.w, tf.h);
    const spec = state && state.specimen;
    if (!spec || !state.probe) { ctx.restore(); lastProbeSym = null; return; }
    let derived = frame && frame.derived;
    if (!derived && UT.probe && UT.probe.derive) { try { derived = UT.probe.derive(state.probe, spec); } catch (e) { derived = null; } }
    recordTrail(state);
    drawField(ctx, spec);
    drawWeldBand(ctx, spec);
    try { drawCoverage(ctx, state, spec); } catch (e) { /* coverage tracker absent or malformed: ignore */ }
    drawDefects(ctx, state, spec);
    drawTrail(ctx); // after defects so the raster trail stays visible over lamination rectangles (§14.2)
    drawFootprint(ctx, frame, state, derived, spec);
    drawDampers(ctx, state);
    drawProbe(ctx, state, spec, derived);
    try { drawScanBand(ctx, state); } catch (e) { /* malformed map: ignore */ }
    drawRuler(ctx, state);
    if (!isCompassHidden(state)) drawCompass(ctx, state); else dialC = null;
    ctx.restore();
  }

  // ------------------------------------------------------------------ interaction
  function isCoarse(ev) { return !!ev && (ev.pointerType === 'touch' || ev.pointerType === 'pen'); }

  function hitProbe(mm, pad) {
    const s = lastProbeSym;
    if (!s) return false;
    const p = pad || 0;
    if (s.kind === 'circle') return M.dist(mm.x, mm.z, s.x, s.z) <= s.r + p;
    if (s.kind === 'box') return mm.x >= s.x0 - p && mm.x <= s.x1 + p && mm.z >= s.z0 - p && mm.z <= s.z1 + p;
    const dx = mm.x - s.x, dz = mm.z - s.z;
    const u = dx * s.dir.x + dz * s.dir.z;
    const v = -dx * s.dir.z + dz * s.dir.x;
    return u >= s.uB - 1 - p && u <= s.uF + 1 + p && Math.abs(v) <= s.hv + 1 + p;
  }

  /** Hit padding (mm) for the current probe symbol and pointer kind. */
  function probePad(coarse) {
    if (!coarse) return 0;
    const s = lastProbeSym;
    const size = !s ? 10 : s.kind === 'circle' ? 2 * s.r : s.kind === 'box' ? Math.min(s.x1 - s.x0, s.z1 - s.z0) : 2 * s.hv;
    return touchPadMm(size, tf.scale);
  }

  function hitDial(p, coarse) { return !!dialC && M.dist(p.x, p.y, dialC.x, dialC.y) <= DIAL_R + (coarse ? 24 : 10); }

  function applySkew(p, shift) {
    const deg = M.rad2deg(Math.atan2(p.x - dialC.x, -(p.y - dialC.y)));
    const skew = snapSkew(deg, shift);
    if (skew !== (UT.state.probe.skew || 0)) UT.setIn('probe', { skew });
  }

  function emitDrag(d) {
    if (!d || d.emitted) return;
    d.emitted = true;
    try { UT.bus.emit('ui', { kind: 'probe-drag', id: 'cv-plan' }); } catch (e) { /* ignore */ }
  }

  /**
   * Move the probe during a drag. x follows the pointer (plus the grab offset); z is delta-based
   * (pointer displacement since the press, d.z0 + dyPx/scale) because the z window scrolls with
   * probe.z and an absolute mapping would feed back on itself.
   */
  function moveProbe(mm, d, p) {
    const spec = UT.state.specimen;
    if (!spec) return;
    const ss = spec.scanSurface || { xMin: spec.extents.xMin, xMax: spec.extents.xMax };
    let x = M.clamp(mm.x + d.dx, ss.xMin, ss.xMax);
    let z = (p && d.py !== undefined) ? d.z0 + (p.y - d.py) / tf.scale : mm.z + d.dz;
    z = spec.pipe ? wrapZ(z, spec.L) : M.clamp(z, 0, spec.L);
    x = Math.round(x * 2) / 2; z = Math.round(z * 2) / 2;
    const cur = UT.state.probe;
    if (x !== cur.x || z !== cur.z) { emitDrag(d); UT.setIn('probe', { x, z }); }
  }

  function setCursor(c) {
    if (!canvas || hoverCursor === c) return;
    hoverCursor = c;
    canvas.style.cursor = c;
  }

  function capturePointer(el, ev) {
    if (!el || ev.pointerId === undefined || typeof el.setPointerCapture !== 'function') return false;
    try { el.setPointerCapture(ev.pointerId); return true; } catch (e) { return false; }
  }

  function releasePointer(el, ev) {
    if (!el || !ev || ev.pointerId === undefined || typeof el.releasePointerCapture !== 'function') return;
    try { if (!el.hasPointerCapture || el.hasPointerCapture(ev.pointerId)) el.releasePointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
  }

  function samePointer(d, ev) { return !d || d.pointerId === undefined || ev.pointerId === undefined || d.pointerId === ev.pointerId; }

  function onDown(ev) {
    if (ev.button !== undefined && ev.button !== 0) return;
    if (ev.isPrimary === false) return;
    if (drag) return;
    const p = UT.dom.localPos(ev, canvas);
    if (p.x < 0 || p.y < 0 || p.x > tf.w || p.y > tf.h) return;
    const coarse = isCoarse(ev);
    if (hitDial(p, coarse)) {
      drag = { kind: 'dial', pointerId: ev.pointerId, coarse };
      drag.captured = capturePointer(canvas, ev);
      applySkew(p, ev.shiftKey);
      ev.preventDefault();
      return;
    }
    if (p.x > tf.fieldW) return;                                   // ruler strip
    if (UT.state.editing && UT.state.editing.defect) return;       // editor open: probe locked
    if (!UT.state.specimen) return;
    const mm = toMm(p.x, p.y);
    const grabbed = hitProbe(mm, probePad(coarse));
    drag = { kind: 'probe', dx: grabbed ? UT.state.probe.x - mm.x : 0, dz: 0, pointerId: ev.pointerId, coarse, emitted: false };
    drag.captured = capturePointer(canvas, ev);
    if (!grabbed) moveProbe(mm, drag);                             // jump to the pointer (absolute z)
    drag.py = p.y; drag.z0 = UT.state.probe.z;                     // z is delta-based from here on
    setCursor('grabbing');
    ev.preventDefault();
  }

  function onMove(ev) {
    if (!canvas) return;
    if (drag && !samePointer(drag, ev)) return;
    const p = UT.dom.localPos(ev, canvas);
    if (drag) {
      if (drag.kind === 'dial') applySkew(p, ev.shiftKey);
      else moveProbe(toMm(p.x, p.y), drag, p);
      if (ev.cancelable) ev.preventDefault();
      return;
    }
    if (ev.target !== canvas) return;
    const coarse = isCoarse(ev);
    if (hitDial(p, coarse)) setCursor('pointer');
    else if (p.x <= tf.fieldW && hitProbe(toMm(p.x, p.y), probePad(coarse))) setCursor('grab');
    else setCursor('default');
  }

  function onUp(ev) {
    if (!drag) return;
    if (ev && !samePointer(drag, ev)) return;
    releasePointer(canvas, ev);
    drag = null;
    setCursor('default');
  }

  function onDblClick(ev) {
    const p = UT.dom.localPos(ev, canvas);
    if (hitDial(p, false)) { UT.setIn('probe', { skew: 0 }); ev.preventDefault(); }
  }

  function hasPointerEvents() { return typeof window !== 'undefined' && typeof window.PointerEvent === 'function'; }

  /**
   * Attach the plan view to its canvas (#cv-plan), bind pointer handlers and subscribe to 'render'.
   * @param {HTMLCanvasElement} cv
   */
  function init(cv) {
    canvas = cv;
    if (!canvas) return;
    UT.dom.injectCss('view-plan', plan.css);
    canvas.classList.add('plan-view-canvas');
    if (hasPointerEvents()) {
      canvas.addEventListener('pointerdown', onDown);
      canvas.addEventListener('pointermove', onMove);
      canvas.addEventListener('pointerup', onUp);
      canvas.addEventListener('pointercancel', onUp);
      canvas.addEventListener('lostpointercapture', function (ev) { if (drag && drag.captured && samePointer(drag, ev)) onUp(ev); });
      // fallback when capture was refused (synthetic pointers, exotic browsers): follow the pointer on window
      window.addEventListener('pointermove', function (ev) { if (drag && !drag.captured) onMove(ev); });
      window.addEventListener('pointerup', function (ev) { if (drag && !drag.captured) onUp(ev); });
      window.addEventListener('pointercancel', function (ev) { if (drag && !drag.captured) onUp(ev); });
    } else {
      canvas.addEventListener('mousedown', onDown);
      canvas.addEventListener('touchstart', onDown, { passive: false });
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      window.addEventListener('touchmove', onMove, { passive: false });
      window.addEventListener('touchend', onUp);
    }
    canvas.addEventListener('dblclick', onDblClick);
    canvas.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });
    UT.bus.on('render', function (frame) { draw(frame, UT.state); });
    fit();
  }

  /** Clear the lamination raster trail (tb-clear). */
  function clearTrail() { trail = []; }

  /**
   * Drag the probe in the plan view through the real pointer code path (synthetic pointerdown/move/up on
   * #cv-plan, scale-aware): the probe moves to x (mm from the weld centre / block datum) and z, emitting
   * exactly one 'ui' {kind:'probe-drag'} event. Falls back to UT.setIn when the canvas is not mounted.
   * @param {number} x  target x (mm)
   * @param {{z?: number}} [opts]
   * @returns {number} resulting probe.x
   */
  function dragTo(x, opts) {
    const o = opts || {};
    const st = UT.state;
    const zTarget = Number.isFinite(o.z) ? o.z : st.probe.z;
    if (!canvas || !hasPointerEvents() || typeof canvas.getBoundingClientRect !== 'function' || !st.specimen) {
      if (st.specimen) UT.setIn('probe', { x: Math.round(x * 2) / 2, z: Math.round(zTarget * 2) / 2 });
      return UT.state.probe.x;
    }
    fit();
    const from = toPx(st.probe.x, st.probe.z);
    const to = toPx(x, zTarget);
    const r = canvas.getBoundingClientRect();
    const k = layoutScale();
    const fire = function (type, p) {
      const ev = new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: r.left + p.x * k, clientY: r.top + p.y * k });
      canvas.dispatchEvent(ev);
    };
    fire('pointerdown', from);
    fire('pointermove', { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 });
    fire('pointermove', to);
    fire('pointerup', to);
    return UT.state.probe.x;
  }

  // ------------------------------------------------------------------ defect editor helpers (circle view / linear bar)
  const editorCtx = new WeakMap();   // canvas → {kind, opts, geom, hoverZ, press}

  function editorState(cv) {
    let st = editorCtx.get(cv);
    if (!st) {
      st = { kind: 'circle', opts: {}, geom: null, hoverZ: null, press: null, moved: false };
      editorCtx.set(cv, st);
      bindEditor(cv, st);
    }
    return st;
  }

  function specLength(spec) { return (spec && spec.L) || 300; }

  function editorZAt(st, p, coarse) {
    const g = st.geom;
    if (!g) return null;
    const tol = coarse ? 24 : 14;
    if (st.kind === 'circle') {
      const dist = M.dist(p.x, p.y, g.cx, g.cy);
      if (dist < g.r - tol || dist > g.R + tol) return null;
      return zAtAngle(Math.atan2(p.y - g.cy, p.x - g.cx), g.L);
    }
    if (p.y < g.y0 - tol || p.y > g.y1 + tol || p.x < g.x0 - 10 || p.x > g.x1 + 10) return null;
    return M.clamp((p.x - g.x0) / (g.x1 - g.x0) * g.L, 0, g.L);
  }

  function editorRedraw(cv, st) {
    if (st.kind === 'circle') drawCircleView(cv, st.opts); else drawLinearBar(cv, st.opts);
  }

  function bindEditor(cv, st) {
    const down = function (ev) {
      if (ev.button !== undefined && ev.button !== 0) return;
      if (ev.isPrimary === false) return;
      const p = UT.dom.localPos(ev, cv);
      const coarse = isCoarse(ev);
      const z = editorZAt(st, p, coarse);
      if (z === null) return;
      st.press = { z0: z, px: p.x, py: p.y, pointerId: ev.pointerId, coarse };
      st.press.captured = capturePointer(cv, ev);
      st.moved = false;
      ev.preventDefault();
    };
    const move = function (ev) {
      if (st.press && !samePointer(st.press, ev)) return;
      const p = UT.dom.localPos(ev, cv);
      if (st.press) {
        const z = editorZAt(st, p, st.press.coarse);
        if (M.dist(p.x, p.y, st.press.px, st.press.py) >= 3) st.moved = true;
        if (z !== null && st.moved) {
          const span = st.kind === 'circle' ? ringDragSpan(st.press.z0, z, st.geom.L) : { zFrom: +Math.min(st.press.z0, z).toFixed(1), zTo: +Math.max(st.press.z0, z).toFixed(1) };
          st.press.last = span;
          st.hoverZ = z;
          if (typeof st.opts.onDrag === 'function') st.opts.onDrag(span.zFrom, span.zTo);
          else editorRedraw(cv, st);
        }
        if (ev.cancelable) ev.preventDefault();
        return;
      }
      if (ev.target !== cv) return;
      const z = editorZAt(st, p, isCoarse(ev));
      if (z !== st.hoverZ) { st.hoverZ = z; editorRedraw(cv, st); }
      cv.style.cursor = z === null ? 'default' : 'crosshair';
    };
    const up = function (ev) {
      if (!st.press) return;
      if (ev && !samePointer(st.press, ev)) return;
      const pr = st.press;
      st.press = null;
      releasePointer(cv, ev);
      if (!st.moved) {
        const g = st.geom;
        const defs = (st.opts.defects || []);
        const hit = defs.find(function (d) { return d && zInDefect(pr.z0, d, g.L, st.kind === 'circle'); });
        if (hit && typeof st.opts.onSelect === 'function') st.opts.onSelect(hit.n);
        else editorRedraw(cv, st);
      } else if (pr.last && typeof st.opts.onDrag === 'function') {
        st.opts.onDrag(pr.last.zFrom, pr.last.zTo);
      }
    };
    const leave = function () { if (!st.press && st.hoverZ !== null) { st.hoverZ = null; editorRedraw(cv, st); } };
    if (hasPointerEvents()) {
      cv.addEventListener('pointerdown', down);
      cv.addEventListener('pointermove', move);
      cv.addEventListener('pointerup', up);
      cv.addEventListener('pointercancel', up);
      cv.addEventListener('pointerleave', leave);
      window.addEventListener('pointermove', function (ev) { if (st.press && !st.press.captured) move(ev); });
      window.addEventListener('pointerup', function (ev) { if (st.press && !st.press.captured) up(ev); });
    } else {
      cv.addEventListener('mousedown', down);
      cv.addEventListener('touchstart', down, { passive: false });
      window.addEventListener('mousemove', move);
      window.addEventListener('touchmove', move, { passive: false });
      window.addEventListener('mouseup', up);
      window.addEventListener('touchend', up);
      cv.addEventListener('mouseleave', leave);
    }
  }

  function isSelected(d, opts) {
    if (opts.selected === undefined || opts.selected === null) return false;
    return d.n === opts.selected;
  }

  /**
   * Pipe circle view for the defect editor: grey annulus, 12 spokes, position labels increasing
   * anticlockwise from 12 o'clock, red defect arcs (selected dark red + two radial lines).
   * @param {HTMLCanvasElement} cv
   * @param {{spec:object, defects:Array, selected:number, onDrag:function, onSelect:function}} opts
   */
  function drawCircleView(cv, opts) {
    if (!cv) return;
    opts = opts || {};
    const st = editorState(cv);
    st.kind = 'circle';
    st.opts = opts;
    const ctx = UT.dom.fitCanvas(cv);
    const sz = cssSize(cv);
    const w = sz.w, h = sz.h;
    const L = specLength(opts.spec);
    const R = Math.max(40, Math.min(150, Math.min(w, h) / 2 - 16));
    const r = R * 0.8;
    const cx = w / 2, cy = h / 2 + 6;
    st.geom = { cx, cy, R, r, L };
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    // annulus
    ctx.fillStyle = C.COLOURS.steel;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2, false);
    ctx.arc(cx, cy, r, 0, Math.PI * 2, true);
    ctx.fill();
    // spokes + labels
    const step = Math.max(1, Math.round(L / 12));
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.font = '11px Segoe UI, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let k = 0; k < 12; k++) {
      const a = circleAngle(k * step, L);
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.stroke();
      ctx.restore();
      const lr = r - 20;
      ctx.fillStyle = '#000';
      ctx.fillText((k === 0 ? '0 ' : String(k * step)) + 'mm', cx + Math.cos(a) * lr + (k === 0 ? 16 : 0), cy + Math.sin(a) * lr);
    }
    // defects
    const pipe = true;
    for (const d of opts.defects || []) {
      if (!d || d.visible === false) continue;
      const sel = isSelected(d, opts);
      for (const s of zSpans(d.zFrom, d.zTo, L, pipe)) {
        const a0 = circleAngle(s[0], L), a1 = circleAngle(s[1], L);
        ctx.fillStyle = sel ? '#a00000' : C.COLOURS.defect;
        ctx.beginPath();
        ctx.arc(cx, cy, R - 2, a0, a1, true);
        ctx.arc(cx, cy, r + 2, a1, a0, false);
        ctx.closePath();
        ctx.fill();
      }
      if (sel) {
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 1.5;
        for (const zz of [d.zFrom, d.zTo]) {
          const a = circleAngle(wrapZ(zz, L), L);
          ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * (R - 2), cy + Math.sin(a) * (R - 2)); ctx.stroke();
        }
      }
    }
    // zero line + left-pointing arrow
    ctx.strokeStyle = '#000';
    ctx.fillStyle = '#000';
    ctx.lineWidth = 1.5;
    const topY = cy - R - 5;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, topY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, topY); ctx.lineTo(cx - 58, topY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - 66, topY); ctx.lineTo(cx - 54, topY - 5); ctx.lineTo(cx - 54, topY + 5); ctx.closePath(); ctx.fill();
    // caption
    ctx.font = '11px Segoe UI, Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#000';
    ctx.fillText(t('Circle-View. Position {z}', { z: st.hoverZ === null ? '' : Math.round(st.hoverZ) }), w - 6, 4);
    ctx.restore();
  }

  /**
   * Plate linear bar for the defect editor: horizontal bar 0…L with the same semantics as the circle view.
   * @param {HTMLCanvasElement} cv
   * @param {{spec:object, defects:Array, selected:number, onDrag:function, onSelect:function}} opts
   */
  function drawLinearBar(cv, opts) {
    if (!cv) return;
    opts = opts || {};
    const st = editorState(cv);
    st.kind = 'bar';
    st.opts = opts;
    const ctx = UT.dom.fitCanvas(cv);
    const sz = cssSize(cv);
    const w = sz.w, h = sz.h;
    const L = specLength(opts.spec);
    const x0 = 30, x1 = Math.max(x0 + 40, w - 30);
    const barH = Math.min(30, Math.max(16, h * 0.25));
    const y0 = h / 2 - barH / 2, y1 = h / 2 + barH / 2;
    st.geom = { x0, x1, y0, y1, L };
    const px = function (z) { return x0 + (x1 - x0) * (z / L); };
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = C.COLOURS.steel;
    ctx.fillRect(x0, y0, x1 - x0, barH);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, barH - 1);
    // ticks / labels
    const step = Math.max(1, Math.round(L / 12));
    ctx.font = '11px Segoe UI, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const tickPx = (x1 - x0) * step / L;
    const every = tickPx >= 44 ? 1 : tickPx >= 22 ? 2 : 4;   // label density
    let k = 0;
    for (let z = 0; z <= L + 1e-6; z += step, k++) {
      const x = Math.round(px(z)) + 0.5;
      ctx.save(); ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
      ctx.restore();
      ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y1 + 6); ctx.stroke();
      if (k % every === 0) { ctx.fillStyle = '#000'; ctx.fillText(Math.round(z) + 'mm', x, y1 + 8); }
    }
    // defects
    for (const d of opts.defects || []) {
      if (!d || d.visible === false) continue;
      const sel = isSelected(d, opts);
      for (const s of zSpans(d.zFrom, d.zTo, L, false)) {
        ctx.fillStyle = sel ? '#a00000' : C.COLOURS.defect;
        ctx.fillRect(px(s[0]), y0 + 2, Math.max(2, px(s[1]) - px(s[0])), barH - 4);
      }
      if (sel) {
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 1.5;
        for (const zz of [d.zFrom, d.zTo]) {
          const x = px(M.clamp(zz, 0, L));
          ctx.beginPath(); ctx.moveTo(x, y0 - 12); ctx.lineTo(x, y1 + 4); ctx.stroke();
        }
      }
    }
    // zero marker: arrow pointing along +z
    ctx.fillStyle = '#000';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x0, y0 - 10); ctx.lineTo(x0 + 40, y0 - 10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x0 + 48, y0 - 10); ctx.lineTo(x0 + 38, y0 - 15); ctx.lineTo(x0 + 38, y0 - 5); ctx.closePath(); ctx.fill();
    ctx.font = '11px Segoe UI, Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(t('Plate. Position {z}', { z: st.hoverZ === null ? '' : Math.round(st.hoverZ) }), w - 6, 4);
    ctx.restore();
  }

  // ------------------------------------------------------------------ self test
  function __selftest() {
    const f = [];
    if (zWindowTop(150, 300, 65) !== 120) f.push('zWindowTop mid ' + zWindowTop(150, 300, 65));
    if (zWindowTop(5, 300, 65) !== 0) f.push('zWindowTop clamp low');
    if (zWindowTop(290, 300, 65) !== 235) f.push('zWindowTop clamp high ' + zWindowTop(290, 300, 65));
    if (zWindowTop(20, 50, 65) !== 0) f.push('zWindowTop short specimen');
    if (snapSkew(12.4, false) !== 12 || snapSkew(12.4, true) !== 10 || snapSkew(-181, false) !== 179) f.push('snapSkew');
    if (snapSkew(-22, false) !== 338 || snapSkew(-170, true) !== 190 || snapSkew(360, false) !== 0 || snapSkew(725, false) !== 5) f.push('snapSkew 0..360');
    if (Object.is(snapSkew(-0.2, false), -0) || Object.is(snapSkew(-360, false), -0)) f.push('snapSkew -0');
    if (skewLabel(338) !== -22 || skewLabel(190) !== -170 || skewLabel(180) !== 180 || skewLabel(45) !== 45 || Object.is(skewLabel(360), -0)) f.push('skewLabel');
    const sp = zSpans(500, 20, 528.7, true);
    if (sp.length !== 2 || sp[0][0] !== 500 || Math.abs(sp[0][1] - 528.7) > 1e-9 || sp[1][0] !== 0 || sp[1][1] !== 20) f.push('zSpans wrap ' + JSON.stringify(sp));
    if (JSON.stringify(zSpans(120, 150, 300, false)) !== '[[120,150]]') f.push('zSpans plate');
    if (JSON.stringify(zSpans(150, 120, 300, false)) !== '[[120,150]]') f.push('zSpans plate reversed');
    const Cir = 480;
    for (const z of [0, 40, 123.4, 300, 479]) {
      const back = zAtAngle(circleAngle(z, Cir), Cir);
      if (Math.abs(back - z) > 1e-6) f.push('circle angle roundtrip ' + z + ' -> ' + back);
    }
    const a40 = circleAngle(40, Cir);   // 40 of 480 = 30° anticlockwise from the top → up-left
    if (!(Math.cos(a40) < 0 && Math.sin(a40) < 0)) f.push('circleAngle direction not anticlockwise');
    const d1 = ringDragSpan(76, 143, Cir);
    if (d1.zFrom !== 76 || d1.zTo !== 143) f.push('ringDragSpan forward ' + JSON.stringify(d1));
    const d2 = ringDragSpan(143, 76, Cir);
    if (d2.zFrom !== 76 || d2.zTo !== 143) f.push('ringDragSpan backward ' + JSON.stringify(d2));
    const d3 = ringDragSpan(470, 20, Cir);
    if (d3.zFrom !== 470 || d3.zTo !== 20) f.push('ringDragSpan wrap ' + JSON.stringify(d3));
    if (!zInDefect(10, { zFrom: 470, zTo: 20 }, Cir, true) || zInDefect(100, { zFrom: 470, zTo: 20 }, Cir, true)) f.push('zInDefect wrap');
    const dir = planDir(1, 0);
    if (Math.abs(dir.x + 1) > 1e-9 || Math.abs(dir.z) > 1e-9) f.push('planDir side+1');
    const dir2 = planDir(1, 30);
    if (!(dir2.x < 0 && dir2.z < 0)) f.push('planDir clockwise skew should point up-left on screen');
    if (Math.abs(wrapZ(-10, 300) - 290) > 1e-9) f.push('wrapZ');
    if (lighten('#00c000', 0.5) !== 'rgb(128,224,128)') f.push('lighten ' + lighten('#00c000', 0.5));
    // transform arithmetic with the fallback scale
    const saved = tf;
    tf = { scale: 4, originX: 640, zTop: 120, windowMm: 65, w: 1280, h: 260, fieldW: 1236, L: 300 };
    const p = toPx(40, 150);
    if (p.x !== 800 || p.y !== 120) f.push('toPx ' + JSON.stringify(p));
    const mm = toMm(800, 120);
    if (Math.abs(mm.x - 40) > 1e-9 || Math.abs(mm.z - 150) > 1e-9 || mm.y !== mm.z) f.push('toMm ' + JSON.stringify(mm));
    if (isCompassHidden({ mode: 'dac' }) !== true || isCompassHidden({ mode: 'weld' }) !== false) f.push('compass hidden modes');
    if (isCompassHidden({ mode: 'fbh' }) !== true && !(UT.modes && UT.modes.enabled && UT.modes.enabled.fbh)) f.push('compass hidden fbh');
    // v2: F4 TOFD box geometry + hit test
    const box = tofdBox(30, -30, 150);
    if (box.xc !== 0 || box.x0 !== -12 || box.x1 !== 12 || box.z0 !== 142 || box.z1 !== 158 || box.dots[0] !== -6 || box.dots[1] !== 6) f.push('tofdBox ' + JSON.stringify(box));
    const savedSym = lastProbeSym;
    lastProbeSym = { kind: 'box', x0: box.x0, x1: box.x1, z0: box.z0, z1: box.z1 };
    if (!hitProbe({ x: 11, z: 157 }, 0) || hitProbe({ x: 13, z: 150 }, 0) || !hitProbe({ x: 13, z: 150 }, 2)) f.push('hitProbe box');
    lastProbeSym = { kind: 'rect', x: 40, z: 150, dir: planDir(1, 0), uF: 3, uB: -21, hv: 8 };
    if (!hitProbe({ x: 50, z: 150 }, 0) || hitProbe({ x: 30, z: 150 }, 0) || !hitProbe({ x: 40, z: 162 }, 4)) f.push('hitProbe rect pad');
    lastProbeSym = savedSym;
    // v2: touch hit padding: a 10 mm target at 4 px/mm (40 px) needs ≥ 44 px → pad 0.5 → min 1.5 mm; at 1 px/mm → 17 mm pad
    if (touchPadMm(10, 4) !== 1.5 || Math.abs(touchPadMm(10, 1) - 17) > 1e-9 || touchPadMm(30, 4) !== 1.5) f.push('touchPadMm ' + touchPadMm(10, 1));
    // v2: C-scan band reduction
    const cm = columnMaxima({ n: 3, map: new Float32Array([1, 5, 2, NaN, 0, 0]) });
    if (!cm || cm[0] !== 5 || cm[1] !== 2 || cm[2] !== 0) f.push('columnMaxima map ' + (cm && Array.from(cm)));
    const ca = columnMaxima({ n: 4, amp: [new Float32Array([10, NaN, 30, NaN]), new Float32Array([5, 50, NaN, NaN])] });
    if (!ca || ca[0] !== 10 || ca[1] !== 50 || ca[2] !== 30 || !Number.isNaN(ca[3])) f.push('columnMaxima amp ' + (ca && Array.from(ca)));
    const cc = columnMaxima({ n: 2, columns: [[0.1, 0.4], [0.2]] });
    if (!cc || Math.abs(cc[0] - 0.4) > 1e-6) f.push('columnMaxima columns');
    const ps = pctScale(cc);
    if (Math.abs(ps[0] - 40) > 1e-4 || Math.abs(ps[1] - 20) > 1e-4) f.push('pctScale fraction ' + Array.from(ps));
    if (pctScale(cm) !== cm) f.push('pctScale keeps % maps');
    if (columnMaxima(null) !== null || columnMaxima({ n: 0 }) !== null || columnMaxima({ n: 3 }) !== null) f.push('columnMaxima guards');
    if (typeof bandColour(90, false) !== 'string' || bandColour(NaN, false) !== 'rgba(0,0,0,0)') f.push('bandColour');
    // v2: coverage runs + band
    const runs = coverageRuns(new Uint8Array([0, 1, 1, 0, 2, 0, 1]), 5, 32);
    if (JSON.stringify(runs) !== '[[5,15],[20,25],[30,32]]') f.push('coverageRuns ' + JSON.stringify(runs));
    if (coverageRuns(null, 5).length !== 0 || coverageRuns(new Uint8Array([0, 0]), 5).length !== 0) f.push('coverageRuns empty');
    const cb = coverageBand({ T: 20, weld: { capWidth: 16 } });
    if (Math.abs(cb.inner - 18) > 1e-9 || Math.abs(cb.outer - (8 + 40 * Math.tan(M.deg2rad(70)))) > 1e-9) f.push('coverageBand ' + JSON.stringify(cb));
    // v2: PA element ticks fit inside the 24 mm box behind the index
    const ticks = paTicks(16, 1);
    if (ticks.length !== 17 || Math.abs(ticks[16] - ticks[0] - 16) > 1e-9 || ticks[0] < -21 || ticks[16] > 3) f.push('paTicks ' + JSON.stringify(ticks));
    const big = paTicks(32, 1);
    if (big.length !== 33 || big[32] - big[0] > 22 + 1e-9 || big[0] < -21) f.push('paTicks clamp');
    // v2: scan band source selection (pure, no DOM)
    const s1 = scanBandSource({ probe: { method: 'pe' }, mode: 'aut', aut: { scan: { z0: 0, z1: 2, step: 1, n: 3, amp: [new Float32Array([10, 20, 30])] }, revMap: true } });
    if (!s1 || s1.n !== 3 || s1.step !== 1 || !s1.rev || s1.vals[2] !== 30) f.push('scanBandSource aut.scan');
    if (scanBandSource({ probe: { method: 'pe' }, mode: 'weld', aut: { scan: { n: 3, amp: [[1, 2, 3]] } } }) !== null) f.push('scanBandSource aut.scan only in aut mode');
    const s2 = scanBandSource({ probe: { method: 'pa' }, mode: 'weld', pa: { scan: { z0: 10, z1: 20, n: 3, xBins: 2, map: new Float32Array([10, 20, 30, 5, 0, 0]) } }, aut: { map: { n: 1, map: [1] } } });
    if (!s2 || s2.z0 !== 10 || Math.abs(s2.step - 5) > 1e-9 || Math.abs(s2.vals[0] - 20) > 1e-4 || Math.abs(s2.vals[1] - 30) > 1e-4) f.push('scanBandSource pa.scan ' + JSON.stringify(s2 && Array.from(s2.vals)));
    const s3 = scanBandSource({ probe: { method: 'pe' }, mode: 'weld', aut: { map: { z0: 0, step: 1, n: 2, k: 1, map: new Float32Array([1, 0.8]) } } });
    if (!s3 || Math.abs(s3.vals[0] - 1) > 1e-6) f.push('scanBandSource must not rescale a ≈1 % aut.map');
    if (scanBandSource({ probe: {}, mode: 'weld', aut: { scan: null, map: null } }) !== null) f.push('scanBandSource none');
    tf = saved;
    return f;
  }

  const plan = {
    init, draw, toPx, toMm, fit, drawCircleView, drawLinearBar, clearTrail, dragTo, __selftest,
    /** Pure helpers (exposed for tests). */
    helpers: { zWindowTop, snapSkew, skewLabel, wrapZ, zSpans, circleAngle, zAtAngle, ringDragSpan, zInDefect, planDir, lighten, isCompassHidden,
      tofdBox, touchPadMm, columnMaxima, pctScale, bandColour, coverageRuns, coverageBand, paTicks, scanBandSource },
    /** Current transform (read-only snapshot). */
    get transform() { return Object.assign({}, tf); },
    css: [
      '#cv-plan, .plan-view-canvas { display: block; cursor: default; touch-action: none; user-select: none; -webkit-user-select: none; }',
      '.plan-view-canvas.plan-grab { cursor: grabbing; }',
      '#cv-circle, .cv-circle { display: block; cursor: default; touch-action: none; user-select: none; -webkit-user-select: none; background: #fff; }',
    ].join('\n'),
  };
  UT.views.plan = plan;
})(window.UT = window.UT || {});
