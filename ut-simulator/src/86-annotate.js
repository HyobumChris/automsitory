/* 86-annotate.js — the instructor annotation toolkit: the SHIFT+F12 / Ctrl+Shift+D drawing overlay,
 * the pencil / line / eraser palette, red and blue strokes over the whole screen and the highlight pointer.
 *
 * SPEC-v3 §6.4 F51 (instructor annotation toolkit).   owner: ui-8
 * Surfaces: the overlay `div#annot` (not a win) and the `draw` palette window (Tools ▸ Draw palette…).
 * Test API: UT.test.annot = {toggle, stroke, clear, torch, state, setTool, open} — this module CREATES that
 * nested namespace; others may only Object.assign onto it (SPEC-v3 §1).
 *
 * Reference frames: shear_wave_and_compression_wave f010 (the first-use dialog, verbatim wording),
 * tky_variable_configuration_welds f038–f043 (red freehand sketch over the joint, the yellow pointer torch
 * following the cursor, the sketched plate with two holes drawn beside the T-joint).
 *
 * House rules honoured here: one IIFE, no import/export, NO DOM at load time (UT.dom.injectCss runs inside
 * mount()/open(), never at load), Pointer Events with setPointerCapture and `touch-action: none`, positions
 * taken through UT.dom.localPos so the design-box transform (SPEC-v2 §5.4) is compensated, the stroke being
 * drawn lives in a module-level buffer (never in state), state.annot.strokes is capped and never persisted,
 * and every user-visible string goes through UT.i18n.t.
 *
 * // SPEC NOTES (choices SPEC-v3 §6.4 leaves open — recorded per the working agreement)
 *  1. Overlay z-index is 90: above the views, the menu bar (60/70/80) and the toolbar, below `.win` (100) —
 *     so the first-use dialog, the Tools palette and any other window stay clickable while the mode is armed,
 *     exactly as §6.4 requires ("above the views and below .win"). The torch sits at 200000 with
 *     `pointer-events: none`: its whole job is to spotlight LCD readouts and keys, which live inside windows.
 *  2. The overlay `div#annot` holds a `<canvas>` child sized to the design box (1280 × 760 unscaled px). The
 *     canvas is the drawing surface; `#annot` is the hit area §9's V3-51 looks for and the element that
 *     suppresses `contextmenu`.
 *  3. Colour rule: the RIGHT button is always blue and the LEFT button draws the palette's current colour
 *     (red until the user picks blue). A right button is therefore never required — touch and pen users pick
 *     blue in the palette — which is lead decision 10 ("nothing depends on a right mouse button existing").
 *  4. Stroke caps: at most 200 strokes AND at most 4000 stored points; the oldest strokes are dropped first
 *     (§6.4 "Cap 200 strokes / 4000 points; oldest dropped").
 *  5. Arming the mode from the palette does NOT raise the first-use dialog and does not set `annot.shown`:
 *     the palette is self-explanatory, and a later SHIFT+F12 still explains the chord it is teaching. The
 *     dialog is shown once per session-record by `toggle()` / the keyboard chords only.
 *  6. Closing the palette (✕ or `UT.annotate.close()`) disarms the mode, because leaving a full-screen
 *     transparent overlay armed with no visible control is a trap. SHIFT+F12 remains the documented exit and
 *     both routes clear the strokes, as the original's dialog promises ("SHIFT F12 again to turn this off").
 *  7. `UT.test.annot.stroke()` arms the mode silently when it is called while disarmed, so a scripted stroke
 *     never depends on the dialog having been dismissed first.
 *  8. Keyboard pen (§6.4 a11y clause): arrows move 4 px, Space starts/ends a stroke, C clears. The pen draws
 *     in the palette's current colour; with the eraser selected Space arms rubbing instead, so the arrows
 *     then rub out what they pass over. Only those keys are consumed while the mode is armed — every other
 *     shortcut still reaches 90-app.
 *  9. `prefers-reduced-motion`: the torch never animates its position (it is set directly every pointermove);
 *     only a 120 ms opacity fade is offered, and only under `no-preference`.
 * 10. The mode never touches physics: stroke/erase commits use `UT.setIn(..., {noRender: true})` and repaint
 *     only this canvas, so drawing over the screen cannot re-run the ray tracer.
 * 11. Exits (QA v3 round 1). A full-screen overlay must never be a trap, so besides SHIFT+F12 / Ctrl+Shift+D
 *     there are two more ways out, both of which SPEC-v3 §6.4 leaves open:
 *      - a small always-visible banner pinned to the top-right of the overlay (the menu bar's empty strip)
 *        carrying the original's own wording `press SHIFT F12 again to turn this feature off.` and a `Close`
 *        button — the mouse-only affordance, since the first-use dialog is suppressed after the first time;
 *      - `Escape`, per SPEC-v2 §5.7's Esc rule. 86's capture-phase handler takes Escape ONLY when nothing
 *        else owns it: an open menu or any open `.win` (the palette included) keeps its own Esc behaviour and
 *        90-app's `closeMenus()` / `closeTopWindow()` still runs — closing the palette disarms the mode
 *        anyway (SPEC NOTE 6). While a stroke is in progress Escape cancels that stroke first, then exits.
 *     The banner is inside `#annot` but never draws: pointer events whose target sits in `.an-bar` are ignored
 *     by the canvas handlers, and while its button has the focus the keyboard pen's keys are left alone, so it
 *     stays clickable with a mouse and activatable with Space/Enter.
 * 12. Caps are enforced per stroke as well as across strokes (QA v3 round 1). `capStrokes` trims the last
 *     surviving stroke to its newest 4000 points, and the live buffer of a stroke still being drawn drops its
 *     oldest points at the same ceiling — one very long freehand drag or a held keyboard pen therefore cannot
 *     grow `annot.strokes` (or the per-move repaint) without bound.
 * 13. What a commit reports back (QA v3 round 2). `pushStroke()` — and therefore `UT.annotate.stroke()` /
 *     `UT.test.annot.stroke()` — returns the stroke AS STORED, read back out of `annot.strokes` after
 *     `capStrokes` has run, not the candidate handed in. A caller that hands in 100 000 points gets back the
 *     4000 that were actually drawn (and that `Clear` / the eraser can actually remove), so the return value
 *     can never describe ink that does not exist. `capStrokes` keeps the newest stroke in every branch, so
 *     the newest element of the list is always the one just committed.
 */
(function (UT) {
  'use strict';

  // ------------------------------------------------------------------ constants (SPEC-v3 §6.4 F51)
  const RED = '#e00000';            // LEFT mouse
  const BLUE = '#0000e0';           // RIGHT mouse
  const MAX_STROKES = 200;          // cap: strokes
  const MAX_POINTS = 4000;          // cap: stored points across all strokes
  const TOOLS = ['pencil', 'line', 'eraser'];
  const LINE_W = 3;                 // stroke width in design px
  const MIN_SEG = 2;                // freehand: minimum pointer travel (design px) before a new point
  const ERASE_R = 10;              // eraser hit radius (design px)
  const PEN_STEP = 4;               // keyboard pen step (design px, §6.4 a11y clause)
  const TORCH_R = 44;               // highlight-pointer radius (design px)

  const css = [
    /* the overlay: full design box, above the views and the bars, below .win (SPEC NOTE 1) */
    '#annot { position: absolute; left: 0; top: 0; right: 0; bottom: 0; z-index: 90; touch-action: none; cursor: crosshair; }',
    '#annot.off { display: none; }',
    '#annot.erase { cursor: cell; }',
    '#annot > canvas { position: absolute; left: 0; top: 0; width: 100%; height: 100%; }',
    /* the always-visible way out (SPEC NOTE 11) — pinned over the menu bar's empty right-hand strip */
    /* top: 28px = just below the 26 px title bar, inside the menu bar band, right of the last menu (§8) */
    '#annot .an-bar { position: absolute; right: 6px; top: 28px; display: flex; align-items: center; gap: 6px;',
    '  padding: 1px 3px 1px 7px; border: 1px solid #808080; border-radius: 3px; background: rgba(255,255,255,0.88);',
    '  color: #111; font-size: 11px; line-height: 16px; cursor: default; }',
    '#annot .an-bar-x { min-width: 0; height: 16px; padding: 0 6px; font-size: 11px; line-height: 14px; }',
    /* the highlight pointer (Options ▸ Highlight pointer) — never captures the pointer */
    '#annot-torch { position: absolute; left: 0; top: 0; width: ' + (TORCH_R * 2) + 'px; height: ' + (TORCH_R * 2) + 'px;',
    '  margin: ' + (-TORCH_R) + 'px 0 0 ' + (-TORCH_R) + 'px; border-radius: 50%; pointer-events: none; z-index: 200000;',
    '  background: radial-gradient(circle, rgba(255,255,120,0.55), rgba(255,255,120,0.30) 55%, rgba(255,255,120,0) 72%); }',
    '@media (prefers-reduced-motion: no-preference) { #annot-torch { transition: opacity 120ms linear; } }',
    /* the Tools palette (window `draw`) */
    '.win[data-win=draw] .win-body { min-width: 196px; }',
    '.win[data-win=draw] .an-tools { display: flex; gap: 4px; flex-wrap: wrap; }',
    '.win[data-win=draw] .an-cols { display: flex; gap: 4px; align-items: center; margin-top: 6px; }',
    '.win[data-win=draw] .an-btn { min-width: 56px; }',
    '.win[data-win=draw] .an-btn[aria-pressed=true] { border-color: #404040 #fff #fff #404040; background: #dcdcdc; font-weight: bold; }',
    '.win[data-win=draw] .an-col { min-width: 0; width: 30px; height: 20px; padding: 0; border: 1px solid #404040; }',
    '.win[data-win=draw] .an-col[aria-pressed=true] { outline: 2px solid #111; outline-offset: 1px; }',
    '.win[data-win=draw] .an-col-red { background: ' + RED + '; }',
    '.win[data-win=draw] .an-col-blue { background: ' + BLUE + '; }',
    '.win[data-win=draw] .an-hint { margin-top: 6px; max-width: 190px; color: #333; font-size: 11px; line-height: 1.35; }',
    /* the first-use notification (shear_wave f010) */
    '.an-intro { max-width: 340px; line-height: 1.4; }',
    '.an-intro .an-intro-h { font-weight: bold; margin-bottom: 6px; }',
    '.an-intro .an-intro-alt { margin-top: 6px; color: #333; font-size: 11px; }',
  ].join('\n');

  // ------------------------------------------------------------------ module buffers (never state)
  const ui = {
    mounted: false,       // document listeners installed
    overlay: null,        // div#annot
    canvas: null,         // its drawing canvas
    torchEl: null,        // div#annot-torch
    torchMove: null,      // its pointermove listener
    torchXY: null,        // last torch position (design px)
    win: null,            // the `draw` palette window api
    dirty: true,          // the canvas needs a repaint
    live: null,           // the stroke being drawn — module buffer, never state (SPEC-v3 §1)
    erasing: false,
    colour: RED,          // the palette's current colour (LEFT button / keyboard pen)
    pen: { x: 0, y: 0, drawing: false, active: false },
  };

  // ------------------------------------------------------------------ pure helpers (safe for __selftest)
  /**
   * Colour of a stroke drawn with a pointer button (SPEC NOTE 3).
   * @param {number} button pointer button (0 = left/primary, 2 = right/secondary)
   * @param {string} [base] colour of the left button (the palette's current colour); default red
   * @returns {string} '#e00000' (red) or '#0000e0' (blue)
   */
  function colourOf(button, base) { return button === 2 ? BLUE : (base || RED); }

  /**
   * Normalise a tool name to one of 'pencil' | 'line' | 'eraser'.
   * @param {string} name candidate tool name
   * @returns {string} a valid tool name ('pencil' for anything unknown)
   */
  function normTool(name) { return TOOLS.indexOf(name) >= 0 ? name : 'pencil'; }

  /**
   * Apply the F51 caps to a stroke list: at most 200 strokes and 4000 points, oldest dropped first.
   * Once a single stroke is all that is left it is itself trimmed to its newest 4000 points, so one
   * unbroken drag can never carry the list over the budget (SPEC NOTE 12).
   * @param {Array<{colour: string, tool: string, pts: Array<{x: number, y: number}>}>} list stroke list
   * @returns {Array<object>} a new list within both caps (never mutates the input)
   */
  function capStrokes(list) {
    const out = (list || []).slice();
    while (out.length > MAX_STROKES) out.shift();
    let n = 0;
    for (let i = 0; i < out.length; i++) n += (out[i].pts ? out[i].pts.length : 0);
    while (out.length > 1 && n > MAX_POINTS) { n -= (out[0].pts ? out[0].pts.length : 0); out.shift(); }
    if (out.length === 1 && n > MAX_POINTS) {
      const pts = out[0].pts || [];
      out[0] = Object.assign({}, out[0], { pts: pts.slice(pts.length - MAX_POINTS) });
    }
    return out;
  }

  /**
   * Append a point to the stroke being drawn, dropping the oldest once it hits the point cap (SPEC NOTE 12).
   * @param {Array<{x: number, y: number}>} pts the live stroke's point list (mutated in place)
   * @param {number} x design px
   * @param {number} y design px
   * @returns {Array<{x: number, y: number}>} the same list, within the cap
   */
  function pushPt(pts, x, y) {
    pts.push({ x: +x.toFixed(2), y: +y.toFixed(2) });
    while (pts.length > MAX_POINTS) pts.shift();
    return pts;
  }

  /**
   * Does a stroke pass within `r` of (x, y)? (eraser hit test, design px)
   * @param {{pts: Array<{x: number, y: number}>}} stroke the stroke to test
   * @param {number} x pointer x in design px
   * @param {number} y pointer y in design px
   * @param {number} r hit radius in design px
   * @returns {boolean} true when the stroke touches the eraser disc
   */
  function hitStroke(stroke, x, y, r) {
    const pts = stroke && stroke.pts;
    if (!pts || !pts.length) return false;
    if (pts.length === 1) return Math.hypot(pts[0].x - x, pts[0].y - y) <= r;
    for (let i = 1; i < pts.length; i++) {
      const d = UT.math.pointSegment(x, y, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y).d;
      if (d <= r) return true;
    }
    return false;
  }

  /**
   * Sanitise a caller-supplied point list into finite design-px points.
   * @param {Array<{x: number, y: number}>} pts raw points
   * @returns {Array<{x: number, y: number}>} finite points only
   */
  function cleanPts(pts) {
    const out = [];
    const list = Array.isArray(pts) ? pts : [];
    for (let i = 0; i < list.length; i++) {
      const p = list[i] || {};
      const x = Number(p.x), y = Number(p.y);
      if (Number.isFinite(x) && Number.isFinite(y)) out.push({ x: +x.toFixed(2), y: +y.toFixed(2) });
    }
    return out;
  }

  // ------------------------------------------------------------------ state access
  /** @returns {object|null} the `annot` state slice (null before UT.defaultState ran) */
  function slice() { return (UT.state && UT.state.annot) || null; }
  /** @returns {boolean} true while the annotation overlay is armed */
  function on() { const a = slice(); return !!(a && a.on); }
  /** @returns {string} the active tool ('pencil' | 'line' | 'eraser') */
  function tool() { const a = slice(); return normTool(a && a.tool); }
  /** @returns {Array<object>} the stored strokes (never null) */
  function strokes() { const a = slice(); return (a && Array.isArray(a.strokes)) ? a.strokes : []; }
  /** @param {string} key i18n key (plain English sentence) @param {object} [p] params @returns {string} */
  function t(key, p) { return UT.i18n && UT.i18n.t ? UT.i18n.t(key, p) : key; }

  // ------------------------------------------------------------------ DOM (never touched at load time)
  /** @returns {Element|null} the design box #app (or the body as a fallback) */
  function appEl() {
    if (typeof document === 'undefined') return null;
    return document.getElementById('app') || document.body || null;
  }

  /** Inject this module's CSS (idempotent; called from mount()/open(), never at load time). */
  function injectCss() { if (UT.dom && UT.dom.injectCss) UT.dom.injectCss('annotate', css); }

  /**
   * The overlay's always-visible way out (SPEC NOTE 11): the original's own 'press SHIFT F12 again…' line
   * plus a `Close` button, so a mouse-only user is never trapped once the first-use dialog is suppressed.
   * @returns {Element} the banner element (a child of `#annot`, excluded from drawing)
   */
  function exitBar() {
    const h = UT.dom.h;
    const btn = UT.dom.button('Close', function () { setOn(false); }, { class: 'btn an-bar-x' });
    btn.title = t('press SHIFT F12 again to turn this feature off.');
    return h('div', { class: 'an-bar' }, [h('span', { i18n: 'press SHIFT F12 again to turn this feature off.' }), btn]);
  }

  /**
   * Did a pointer event start on the exit banner rather than the drawing surface?
   * @param {PointerEvent|Event} ev the event
   * @returns {boolean} true when the banner (not the canvas) owns it
   */
  function fromBar(ev) {
    const el = ev && ev.target;
    return !!(el && el.closest && el.closest('.an-bar'));
  }

  /** Create `div#annot` (+ its canvas) and bind the pointer handlers. Idempotent. @returns {Element|null} */
  function ensureOverlay() {
    if (ui.overlay) return ui.overlay;
    const app = appEl();
    if (!app || !UT.dom) return null;
    injectCss();
    const canvas = UT.dom.h('canvas', { class: 'an-canvas' });
    const box = UT.dom.h('div', { id: 'annot', role: 'application', 'aria-label': 'Teaching aid drawing mode' }, [canvas, exitBar()]);
    box.addEventListener('pointerdown', onDown);
    box.addEventListener('pointermove', onMove);
    box.addEventListener('pointerup', onUp);
    box.addEventListener('pointercancel', onUp);
    box.addEventListener('contextmenu', onContextMenu);
    app.appendChild(box);
    ui.overlay = box;
    ui.canvas = canvas;
    ui.dirty = true;
    updateCursor();
    return box;
  }

  /** Remove the overlay and drop the live stroke. */
  function removeOverlay() {
    if (ui.overlay && ui.overlay.parentNode) ui.overlay.parentNode.removeChild(ui.overlay);
    ui.overlay = null;
    ui.canvas = null;
    ui.live = null;
    ui.erasing = false;
  }

  /** Mirror the active tool onto the overlay's cursor class. */
  function updateCursor() {
    if (!ui.overlay) return;
    ui.overlay.classList.toggle('erase', tool() === 'eraser');
  }

  // ------------------------------------------------------------------ painting
  /**
   * Paint one stroke.
   * @param {CanvasRenderingContext2D} ctx canvas context in design px
   * @param {{colour: string, pts: Array<{x: number, y: number}>}} stroke the stroke to paint
   */
  function drawStroke(ctx, stroke) {
    const pts = stroke && stroke.pts;
    if (!pts || !pts.length) return;
    const colour = stroke.colour || RED;
    if (pts.length === 1) {
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, LINE_W / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.strokeStyle = colour;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }

  /**
   * Paint the keyboard pen marker (only after a key has moved it).
   * @param {CanvasRenderingContext2D} ctx canvas context in design px
   */
  function drawPen(ctx) {
    ctx.save();
    ctx.strokeStyle = ui.pen.drawing ? ui.colour : '#404040';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ui.pen.x - 7, ui.pen.y); ctx.lineTo(ui.pen.x + 7, ui.pen.y);
    ctx.moveTo(ui.pen.x, ui.pen.y - 7); ctx.lineTo(ui.pen.x, ui.pen.y + 7);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(ui.pen.x, ui.pen.y, 3.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /** Repaint the whole overlay from state + the live buffer (no state writes). */
  function redraw() {
    if (!ui.canvas || !ui.overlay || !UT.dom) return;
    const w = ui.overlay.clientWidth || (appEl() && appEl().clientWidth) || 1280;
    const h = ui.overlay.clientHeight || (appEl() && appEl().clientHeight) || 760;
    const ctx = UT.dom.fitCanvas(ui.canvas, w, h);
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = LINE_W;
    const list = strokes();
    for (let i = 0; i < list.length; i++) drawStroke(ctx, list[i]);
    if (ui.live) drawStroke(ctx, ui.live);
    if (ui.pen.active) drawPen(ctx);
    ui.dirty = false;
  }

  // ------------------------------------------------------------------ stroke store
  /**
   * Commit a stroke into `annot.strokes` (capped, never persisted, no recompute — SPEC NOTE 10).
   * The value returned is the stroke AS STORED — i.e. after `capStrokes` has trimmed it to the point
   * budget — never the caller's uncapped candidate (SPEC NOTE 13).
   * @param {{colour: string, tool: string, pts: Array<{x: number, y: number}>}} stroke the finished stroke
   * @returns {object|null} the stored stroke (the newest element of `annot.strokes`), or null when nothing was stored
   */
  function pushStroke(stroke) {
    if (!stroke || !stroke.pts || !stroke.pts.length || !slice()) return null;
    UT.setIn('annot', { strokes: capStrokes(strokes().concat([stroke])) }, { noRender: true });
    ui.dirty = true;
    redraw();
    const kept = strokes();                       // capStrokes never drops the newest stroke, only trims it
    return kept.length ? kept[kept.length - 1] : null;
  }

  /**
   * Erase every stroke passing within the eraser radius of a point.
   * @param {number} x design px
   * @param {number} y design px
   * @returns {number} how many strokes were removed
   */
  function eraseAt(x, y) {
    const list = strokes();
    if (!list.length) return 0;
    const keep = list.filter(function (s) { return !hitStroke(s, x, y, ERASE_R); });
    const n = list.length - keep.length;
    if (n) {
      UT.setIn('annot', { strokes: keep }, { noRender: true });
      ui.dirty = true;
      redraw();
    }
    return n;
  }

  // ------------------------------------------------------------------ pointer input (Pointer Events)
  /**
   * Pointer position in design px (compensates the #app transform of SPEC-v2 §5.4).
   * @param {PointerEvent} ev the pointer event
   * @returns {{x: number, y: number}} local position in design px
   */
  function posOf(ev) { return UT.dom.localPos(ev, ui.canvas || ui.overlay); }

  /** @param {PointerEvent} ev pointerdown on #annot */
  function onDown(ev) {
    if (!on() || !ui.canvas || fromBar(ev)) return;      // the exit banner is a control, not a drawing surface
    const p = posOf(ev);
    try { ui.overlay.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
    if (tool() === 'eraser' || ev.button === 1) {
      ui.erasing = true;
      eraseAt(p.x, p.y);
    } else {
      ui.live = { colour: colourOf(ev.button, ui.colour), tool: tool(), pts: [{ x: +p.x.toFixed(2), y: +p.y.toFixed(2) }] };
      ui.dirty = true;
      redraw();
    }
    ev.preventDefault();
  }

  /** @param {PointerEvent} ev pointermove on #annot */
  function onMove(ev) {
    if (!on() || !ui.canvas) return;
    if (!ui.live && !ui.erasing) return;
    const p = posOf(ev);
    if (ui.erasing) { eraseAt(p.x, p.y); ev.preventDefault(); return; }
    const pts = ui.live.pts;
    if (ui.live.tool === 'line') {
      if (pts.length < 2) pts.push({ x: +p.x.toFixed(2), y: +p.y.toFixed(2) });
      else { pts[1].x = +p.x.toFixed(2); pts[1].y = +p.y.toFixed(2); }
    } else {
      const last = pts[pts.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) >= MIN_SEG) pushPt(pts, p.x, p.y);
    }
    ui.dirty = true;
    redraw();
    ev.preventDefault();
  }

  /** @param {PointerEvent} ev pointerup / pointercancel on #annot */
  function onUp(ev) {
    if (ui.overlay) { try { ui.overlay.releasePointerCapture(ev.pointerId); } catch (e) { /* ignore */ } }
    ui.erasing = false;
    const live = ui.live;
    ui.live = null;
    if (live) pushStroke(live); else { ui.dirty = true; redraw(); }
  }

  /** Suppress the browser menu so the RIGHT button can draw blue — on #annot only, while armed (F51). */
  function onContextMenu(ev) {
    if (!on()) return;
    ev.preventDefault();
    ev.stopPropagation();
  }

  // ------------------------------------------------------------------ keyboard
  /** Put the keyboard pen in the middle of the design box the first time it is used. */
  function initPen() {
    if (ui.pen.active) return;
    const app = appEl();
    ui.pen.x = ((app && app.clientWidth) || 1280) / 2;
    ui.pen.y = ((app && app.clientHeight) || 760) / 2;
    ui.pen.active = true;
  }

  /**
   * Move the keyboard pen (and extend the stroke it is drawing).
   * @param {number} dx design px
   * @param {number} dy design px
   */
  function movePen(dx, dy) {
    initPen();
    const app = appEl();
    const w = (app && app.clientWidth) || 1280;
    const h = (app && app.clientHeight) || 760;
    ui.pen.x = Math.max(0, Math.min(w, ui.pen.x + dx));
    ui.pen.y = Math.max(0, Math.min(h, ui.pen.y + dy));
    if (ui.pen.drawing && ui.live) pushPt(ui.live.pts, ui.pen.x, ui.pen.y);
    else if (ui.pen.drawing && tool() === 'eraser') eraseAt(ui.pen.x, ui.pen.y);   // rubbing out as the pen travels
    ui.dirty = true;
    redraw();
  }

  /** Space: start a keyboard stroke (or a rub with the eraser), or finish the one in progress. */
  function togglePen() {
    initPen();
    if (tool() === 'eraser') {          // Space arms/disarms rubbing; the arrows then rub along the way
      ui.pen.drawing = !ui.pen.drawing;
      if (ui.pen.drawing) eraseAt(ui.pen.x, ui.pen.y);
      ui.dirty = true;
      redraw();
      return;
    }
    if (ui.pen.drawing) {
      ui.pen.drawing = false;
      const live = ui.live;
      ui.live = null;
      if (live) pushStroke(live);
    } else {
      ui.pen.drawing = true;
      ui.live = { colour: ui.colour, tool: tool() === 'line' ? 'line' : 'pencil', pts: [{ x: +ui.pen.x.toFixed(2), y: +ui.pen.y.toFixed(2) }] };
    }
    ui.dirty = true;
    redraw();
  }

  /**
   * Is Escape already spoken for by an open menu or an open window? (SPEC NOTE 11)
   * @returns {boolean} true when 90-app's `closeMenus()` / `UT.dom.closeTopWindow()` must keep Escape
   */
  function escapeTaken() {
    if (typeof document === 'undefined') return false;
    if (document.querySelector('#menubar .menu-item.open')) return true;
    const wins = (UT.dom && UT.dom.wins) || null;
    if (wins) { for (const k of Object.keys(wins)) { const w = wins[k]; if (w && w.isOpen && w.isOpen()) return true; } }
    return false;
  }

  /** Drop the stroke / rub in progress without committing it (Escape, SPEC NOTE 11). */
  function cancelLive() {
    ui.live = null;
    ui.erasing = false;
    ui.pen.drawing = false;
    ui.dirty = true;
    redraw();
  }

  /**
   * Document keydown (capture phase, so the chords never reach 90-app's shortcuts).
   * @param {KeyboardEvent} ev the key event
   */
  function onKeyCapture(ev) {
    if (!ev || ev.defaultPrevented) return;
    const k = ev.key;
    const shiftF12 = k === 'F12' && ev.shiftKey && !ev.ctrlKey && !ev.altKey && !ev.metaKey;
    const ctrlShiftD = (k === 'd' || k === 'D') && ev.ctrlKey && ev.shiftKey && !ev.altKey && !ev.metaKey;
    if (shiftF12 || ctrlShiftD) {           // lead decision 2: BOTH chords are bound
      ev.preventDefault();
      ev.stopPropagation();
      toggle();
      return;
    }
    if (!on()) return;
    const tag = ev.target && ev.target.tagName ? String(ev.target.tagName).toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || (ev.target && ev.target.isContentEditable)) return;
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    // the exit banner keeps its own keys (Space/Enter activate `Close`); only Escape is still ours there
    if (k !== 'Escape' && ev.target && ev.target.closest && ev.target.closest('.an-bar')) return;
    let used = true;
    switch (k) {
      case 'ArrowLeft': movePen(-PEN_STEP, 0); break;
      case 'ArrowRight': movePen(PEN_STEP, 0); break;
      case 'ArrowUp': movePen(0, -PEN_STEP); break;
      case 'ArrowDown': movePen(0, PEN_STEP); break;
      case ' ': case 'Spacebar': togglePen(); break;
      case 'c': case 'C': clear(); break;
      // Esc leaves the mode (SPEC-v2 §5.7), but only when nothing else owns it: an open menu or window keeps
      // Escape for 90-app, and a stroke in progress is cancelled first (SPEC NOTE 11).
      case 'Escape':
        if (escapeTaken()) { used = false; break; }
        if (ui.live || ui.erasing || ui.pen.drawing) cancelLive(); else setOn(false);
        break;
      default: used = false;
    }
    if (used) { ev.preventDefault(); ev.stopPropagation(); }
  }

  // ------------------------------------------------------------------ the highlight pointer (torch)
  /**
   * Move the torch to a design-px position.
   * @param {{x: number, y: number}} p position in design px
   */
  function moveTorch(p) {
    ui.torchXY = p;
    if (!ui.torchEl) return;
    ui.torchEl.style.left = p.x + 'px';
    ui.torchEl.style.top = p.y + 'px';
  }

  /** Create or remove the torch element and its pointer listener to match `annot.torch`. */
  function syncTorch() {
    if (typeof document === 'undefined' || !UT.dom) return;
    const app = appEl();
    const want = !!(slice() && slice().torch) && !!app;
    if (want) {
      injectCss();
      if (!ui.torchEl) {
        ui.torchEl = UT.dom.h('div', { id: 'annot-torch', 'aria-hidden': 'true' });
        app.appendChild(ui.torchEl);
        moveTorch(ui.torchXY || { x: (app.clientWidth || 1280) / 2, y: (app.clientHeight || 760) / 2 });
      }
      if (!ui.torchMove) {
        ui.torchMove = function (ev) { moveTorch(UT.dom.localPos(ev, app)); };
        app.addEventListener('pointermove', ui.torchMove, true);
      }
    } else {
      if (ui.torchMove && app) app.removeEventListener('pointermove', ui.torchMove, true);
      ui.torchMove = null;
      if (ui.torchEl && ui.torchEl.parentNode) ui.torchEl.parentNode.removeChild(ui.torchEl);
      ui.torchEl = null;
    }
  }

  // ------------------------------------------------------------------ the first-use notification
  /**
   * Show the original's first-use dialog (shear_wave f010) and remember that it has been shown.
   * @returns {object|null} the dialog window api, or null when it is suppressed / there is no DOM
   */
  function showIntro() {
    if (typeof document === 'undefined' || !UT.dom || !UT.dom.alert) return null;
    injectCss();
    const h = UT.dom.h;
    const body = h('div', { class: 'an-intro' }, [
      h('div', { class: 'an-intro-h', i18n: 'TEACHING AID DRAWING MODE — LEFT mouse draws red, RIGHT mouse draws blue. SHIFT+F12 again to clear and exit.' }),
      h('div', { i18n: '... you used SHIFT F12 secret control to DRAW on screen....' }),
      h('div', { i18n: 'press SHIFT F12 again to turn this feature off.' }),
      h('div', { i18n: 'Right Mouse Blue,  Left mouse Red.' }),
      h('div', { class: 'an-intro-alt', i18n: 'Ctrl+Shift+D does the same, and Tools ▸ Draw palette opens the pencil, line and eraser tools.' }),
    ]);
    const win = UT.dom.alert(body, 'UTsim');
    UT.setIn('annot', { shown: true });
    return win;
  }

  // ------------------------------------------------------------------ the Tools palette (window `draw`)
  /**
   * Palette tool button.
   * @param {string} name tool name
   * @param {string} label i18n key
   * @returns {Element} the button
   */
  function toolBtn(name, label) {
    return UT.dom.button(label, function () { setTool(name); }, { class: 'btn an-btn', dataset: { tool: name }, 'aria-pressed': 'false' });
  }

  /**
   * Palette colour button.
   * @param {string} colour '#e00000' or '#0000e0'
   * @param {string} label i18n key (used as the accessible name)
   * @returns {Element} the button
   */
  function colBtn(colour, label) {
    const b = UT.dom.button('', function () { setColour(colour); }, { class: 'btn an-col an-col-' + (colour === BLUE ? 'blue' : 'red'), dataset: { colour }, 'aria-pressed': 'false' });
    b.title = t(label);
    b.setAttribute('aria-label', t(label));
    return b;
  }

  /** Create the palette window once. @returns {object|null} the window api */
  function buildWin() {
    if (ui.win) return ui.win;
    if (typeof document === 'undefined' || !UT.dom) return null;
    injectCss();
    const h = UT.dom.h;
    const content = h('div', { class: 'an-pal' }, [
      h('div', { class: 'an-tools' }, [
        toolBtn('pencil', 'Pencil'),
        toolBtn('line', 'Line'),
        toolBtn('eraser', 'Eraser'),
        UT.dom.button('Clear', function () { clear(); }, { class: 'btn an-btn an-clear' }),
      ]),
      h('div', { class: 'an-cols' }, [colBtn(RED, 'Red'), colBtn(BLUE, 'Blue')]),
      h('div', { class: 'an-hint', i18n: 'Left button draws red, right button draws blue. Arrow keys move the pen, Space draws, C clears.' }),
    ]);
    ui.win = UT.dom.win({
      name: 'draw', title: 'Tools', x: 1010, y: 520, w: 212, content,
      onClose: function () { setOn(false); },      // SPEC NOTE 6
    });
    return ui.win;
  }

  /** Mirror the active tool / colour onto the palette buttons. */
  function syncPalette() {
    if (!ui.win || !ui.win.el) return;
    const tl = tool();
    const btns = ui.win.el.querySelectorAll('.an-btn[data-tool]');
    for (let i = 0; i < btns.length; i++) btns[i].setAttribute('aria-pressed', btns[i].dataset.tool === tl ? 'true' : 'false');
    const cols = ui.win.el.querySelectorAll('.an-col[data-colour]');
    for (let i = 0; i < cols.length; i++) cols[i].setAttribute('aria-pressed', cols[i].dataset.colour === ui.colour ? 'true' : 'false');
  }

  // ------------------------------------------------------------------ lifecycle
  /** Bring the DOM in line with `annot` (never writes state — safe from a 'state'/'render' listener). */
  function syncDom() {
    if (typeof document === 'undefined') return;
    if (on()) {
      ensureOverlay();
      updateCursor();
      ui.dirty = true;
      redraw();
    } else if (ui.overlay) {
      removeOverlay();
      ui.pen.drawing = false;
      ui.pen.active = false;
    }
    if (!on() && ui.win && ui.win.isOpen()) ui.win.hide();
    syncTorch();
    syncPalette();
  }

  /**
   * Install the document-level listeners (chords, resize) once the page exists.
   * @returns {boolean} true the first time it really mounted
   */
  function mount() {
    if (ui.mounted || typeof document === 'undefined' || !UT.dom) return false;
    ui.mounted = true;
    injectCss();
    document.addEventListener('keydown', onKeyCapture, true);
    UT.bus.on('resize', function () { if (ui.overlay) { ui.dirty = true; redraw(); } });
    syncDom();
    return true;
  }

  /**
   * Arm or disarm the overlay.
   * @param {boolean} want true to arm
   * @param {{quiet?: boolean}} [opts] `quiet` suppresses the first-use dialog (palette / test API)
   * @returns {boolean} the new `annot.on`
   */
  function setOn(want, opts) {
    const a = slice();
    if (!a) return false;
    const v = !!want;
    if (a.on !== v) {
      const patch = { on: v };
      if (!v) patch.strokes = [];                 // F51: toggling off clears the strokes
      UT.setIn('annot', patch);
      if (v && !a.shown && !(opts && opts.quiet)) showIntro();
    }
    mount();
    syncDom();
    return v;
  }

  /**
   * Toggle (or force) the teaching-aid drawing mode — SHIFT+F12 / Ctrl+Shift+D (F51).
   * @param {boolean} [force] true/false to set it explicitly; omitted to toggle
   * @returns {boolean} the new `annot.on`
   */
  function toggle(force) { return setOn(force === undefined ? !on() : !!force, null); }

  /**
   * Select the drawing tool.
   * @param {string} name 'pencil' | 'line' | 'eraser'
   * @returns {string} the tool actually selected
   */
  function setTool(name) {
    const n = normTool(name);
    if (slice()) UT.setIn('annot', { tool: n });
    updateCursor();
    syncPalette();
    return n;
  }

  /**
   * Select the colour drawn by the LEFT button and the keyboard pen (SPEC NOTE 3).
   * @param {string} colour '#e00000' (red) or '#0000e0' (blue)
   * @returns {string} the colour actually selected
   */
  function setColour(colour) {
    ui.colour = colour === BLUE ? BLUE : RED;
    syncPalette();
    return ui.colour;
  }

  /**
   * Erase every stroke (the palette's `Clear`, and `C` while the mode is armed).
   * @returns {number} how many strokes were removed
   */
  function clear() {
    const n = strokes().length;
    if (slice() && n) UT.setIn('annot', { strokes: [] }, { noRender: true });
    ui.live = null;
    ui.pen.drawing = false;
    ui.dirty = true;
    redraw();
    return n;
  }

  /**
   * Toggle / set the highlight pointer (Options ▸ Highlight pointer).
   * @param {boolean} [v] true to switch it on, false off; omitted to toggle
   * @returns {boolean} the new `annot.torch`
   */
  function torch(v) {
    const want = v === undefined ? !(slice() && slice().torch) : !!v;
    if (slice()) UT.setIn('annot', { torch: want });
    mount();
    syncTorch();
    return want;
  }

  /**
   * Open the Tools palette (Tools ▸ Draw palette…); arming the mode with it (SPEC NOTE 5).
   * @returns {object|null} the `draw` window api
   */
  function open() {
    if (typeof document === 'undefined') return null;
    mount();
    const win = buildWin();
    if (!win) return null;
    setOn(true, { quiet: true });
    win.show();
    syncPalette();
    return win;
  }

  /**
   * Close the Tools palette and disarm the overlay (SPEC NOTE 6).
   * @returns {object|null} the `draw` window api
   */
  function close() {
    if (ui.win && ui.win.isOpen()) ui.win.hide();
    setOn(false);
    return ui.win;
  }

  /** @returns {boolean} true while the Tools palette window is open */
  function paletteOpen() { return !!(ui.win && ui.win.isOpen()); }

  /**
   * Add a stroke programmatically (test API / scripted teaching aids).
   * @param {Array<{x: number, y: number}>} pts polyline in design px
   * @param {number} [button] 0 = left (palette colour, red by default), 2 = right (blue)
   * @returns {object|null} the committed stroke {colour, tool, pts} exactly as stored (its `pts` are the
   *   capped points that were really drawn, never more), or null when nothing was drawn
   */
  function stroke(pts, button) {
    const clean = cleanPts(pts);
    if (!clean.length) return null;
    if (!on()) setOn(true, { quiet: true });      // SPEC NOTE 7
    if (tool() === 'eraser') {                    // the eraser rubs along the given path instead of drawing
      for (let i = 0; i < clean.length; i++) eraseAt(clean[i].x, clean[i].y);
      return null;
    }
    const kept = pushStroke({ colour: colourOf(button, ui.colour), tool: tool(), pts: clean });
    return kept ? { colour: kept.colour, tool: kept.tool, pts: kept.pts.slice() } : null;
  }

  /**
   * Snapshot for the acceptance checks (`annot.strokes` is excluded from UT.test.state(), §2).
   * @returns {object} {on, tool, colour, torch, shown, count, points, strokes, overlay, palette}
   */
  function testState() {
    const list = strokes();
    let points = 0;
    const out = [];
    for (let i = 0; i < list.length; i++) {
      points += (list[i].pts || []).length;
      out.push({ colour: list[i].colour, tool: list[i].tool, pts: (list[i].pts || []).map(function (p) { return { x: p.x, y: p.y }; }) });
    }
    const a = slice() || {};
    return {
      on: !!a.on, tool: tool(), colour: ui.colour, torch: !!a.torch, shown: !!a.shown,
      count: list.length, points, strokes: out,
      overlay: !!ui.overlay, palette: paletteOpen(),
    };
  }

  // ------------------------------------------------------------------ wiring (no DOM at load time)
  UT.bus.on('render', function () {
    if (!ui.mounted) { mount(); return; }
    if (ui.overlay && ui.dirty) redraw();
  });
  UT.bus.on('state', function (ev) {
    if (!ui.mounted || !ev || !ev.keys || ev.keys.indexOf('annot') < 0) return;
    syncDom();                                    // 90-app may flip annot.on / annot.torch from a menu
  });
  UT.bus.on('lang', function () { if (ui.win && ui.win.isOpen()) syncPalette(); });

  UT.annotate = {
    css,
    window: 'draw',
    overlayId: 'annot',
    colours: { red: RED, blue: BLUE },
    maxStrokes: MAX_STROKES,
    maxPoints: MAX_POINTS,
    on,
    /** Arm / disarm the annotation overlay (F51). @param {boolean} [force] @returns {boolean} annot.on */
    toggle,
    /** Open the Tools palette (Tools ▸ Draw palette…), arming the overlay. @returns {object|null} window api */
    open,
    /** Close the Tools palette and disarm the overlay. @returns {object|null} window api */
    close,
    /** Erase every stroke. @returns {number} strokes removed */
    clear,
    /** Select 'pencil' | 'line' | 'eraser'. @param {string} name @returns {string} the tool */
    setTool,
    /** Select the LEFT-button / pen colour. @param {string} colour @returns {string} the colour */
    setColour,
    /** Toggle / set the highlight pointer. @param {boolean} [v] @returns {boolean} annot.torch */
    torch,
    /** Add a stroke programmatically. @param {Array<{x,y}>} pts @param {number} [button] @returns {object|null} */
    stroke,
    /** Install the document listeners (called on the first render; safe to call again). @returns {boolean} */
    mount,
    /** The Tools palette as a window-like object, for 90-app's toggleWindowOf('annotate.palette'). */
    palette: {
      /** @returns {object|null} the `draw` window api (opens it) */
      open,
      /** @returns {object|null} the `draw` window api (closed, mode disarmed) */
      close,
      /** @returns {boolean} true while the palette is open */
      isOpen: paletteOpen,
      /** Open or close the palette. @returns {object|null} the `draw` window api */
      toggle() { return paletteOpen() ? close() : open(); },
    },
    /**
     * Module self-test (pure helpers only — never touches the DOM).
     * @returns {string[]} failure strings, empty when the module is healthy
     */
    __selftest() {
      const f = [];
      if (typeof UT.annotate.css !== 'string' || !UT.annotate.css.length) f.push('css string');
      if (UT.annotate.css.indexOf('</st' + 'yle>') >= 0) f.push('css closes a style tag');
      if (UT.annotate.window !== 'draw' || UT.annotate.overlayId !== 'annot') f.push('surface names');
      if (typeof UT.annotate.on !== 'function') f.push('on()');
      // colours (F51: left red, right blue; the palette colour only moves the left button)
      if (colourOf(0) !== '#e00000' || colourOf(2) !== '#0000e0' || colourOf(0, BLUE) !== BLUE) f.push('colourOf');
      if (normTool('line') !== 'line' || normTool('nope') !== 'pencil') f.push('normTool');
      // caps: 250 single-point strokes → the newest 200 survive
      const many = [];
      for (let i = 0; i < 250; i++) many.push({ colour: RED, tool: 'pencil', pts: [{ x: i, y: 0 }] });
      const capped = capStrokes(many);
      if (capped.length !== MAX_STROKES || capped[0].pts[0].x !== 50 || capped[199].pts[0].x !== 249) f.push('capStrokes strokes');
      // caps: point budget drops the oldest strokes first, and never the last one
      const fat = [];
      for (let i = 0; i < 3; i++) { const pts = []; for (let j = 0; j < 3000; j++) pts.push({ x: j, y: i }); fat.push({ colour: RED, tool: 'pencil', pts }); }
      const fatCap = capStrokes(fat);
      let pts = 0;
      for (const s of fatCap) pts += s.pts.length;
      if (fatCap.length !== 1 || pts !== 3000) f.push('capStrokes points');
      // caps: ONE over-budget stroke is trimmed to its newest 4000 points (QA v3 round 1 / SPEC NOTE 12)
      const long = [];
      for (let j = 0; j < 20000; j++) long.push({ x: j, y: 1 });
      const longCap = capStrokes([{ colour: RED, tool: 'pencil', pts: long }]);
      if (longCap.length !== 1 || longCap[0].pts.length !== MAX_POINTS ||
          longCap[0].pts[0].x !== 20000 - MAX_POINTS || longCap[0].pts[MAX_POINTS - 1].x !== 19999) f.push('capStrokes single stroke');
      if (long.length !== 20000) f.push('capStrokes mutated its input');
      // caps: the live buffer of a stroke still being drawn drops its oldest points at the same ceiling
      const livePts = [];
      for (let j = 0; j < MAX_POINTS + 5; j++) pushPt(livePts, j, 0);
      if (livePts.length !== MAX_POINTS || livePts[0].x !== 5 || livePts[MAX_POINTS - 1].x !== MAX_POINTS + 4) f.push('pushPt cap');
      if (capStrokes([]).length !== 0) f.push('capStrokes empty');
      // the always-visible exit affordance (SPEC NOTE 11)
      if (UT.annotate.css.indexOf('#annot .an-bar') < 0) f.push('exit banner css');
      // eraser hit test
      const line = { colour: RED, tool: 'pencil', pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }] };
      if (!hitStroke(line, 50, 5, ERASE_R) || hitStroke(line, 50, 40, ERASE_R)) f.push('hitStroke');
      if (!hitStroke({ pts: [{ x: 10, y: 10 }] }, 12, 12, ERASE_R) || hitStroke({ pts: [] }, 0, 0, ERASE_R)) f.push('hitStroke dot');
      // point sanitising
      if (cleanPts([{ x: 1, y: 2 }, { x: NaN, y: 3 }, null]).length !== 1) f.push('cleanPts');
      // the state slice the lead wrote must carry every field this module owns
      const d = UT.defaultState ? UT.defaultState().annot : null;
      if (!d || d.on !== false || d.tool !== 'pencil' || d.torch !== false || d.shown !== false || !Array.isArray(d.strokes)) f.push('annot defaults');
      return f;
    },
  };

  Object.assign(UT.test, {
    annot: {
      /** Toggle the drawing mode. @param {boolean} [force] @returns {boolean} annot.on */
      toggle,
      /** Add a stroke. @param {Array<{x,y}>} pts @param {number} [button] @returns {object|null} the stroke */
      stroke,
      /** Erase every stroke. @returns {number} strokes removed */
      clear,
      /** Toggle / set the highlight pointer. @param {boolean} [v] @returns {boolean} annot.torch */
      torch,
      /** Select a tool. @param {string} name @returns {string} the tool */
      setTool,
      /** Open the Tools palette. @returns {object|null} the `draw` window api */
      open,
      /** Snapshot including the strokes (which UT.test.state() omits). @returns {object} */
      state: testState,
    },
  });
})(window.UT = window.UT || {});
