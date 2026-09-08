/* 85-scalemode.js — Scale Mode: the white sheet with mm rulers, the ADJUST SCALE window, picture import,
 * boundary tracing into a `polygon` specimen, the protractor overlay and the magnified skip graduations.
 *
 * SPEC-v3 §6.2 F41 (Scale Mode) and F42 (magnified skip graduations).   owner: ui-7
 * Windows: `scale` (ADJUST SCALE); the protractor is an overlay drawn on #cv-cross by 60 (not a win).
 * Test API: UT.test.scale = {enter, exit, setMmPerPx, loadPicture, trace, protractor, state} — this module
 * CREATES that nested namespace; others may only Object.assign onto it (SPEC-v3 §1).
 *
 * Division of labour with 60-view-cross (§1, and 60's own header): 85 owns the STATE and the PANEL,
 * 60 owns every pixel on #cv-cross. 85 therefore never exports drawProtractor() — 60 draws the protractor
 * only while 85 does not, so the two can never double-draw it — and never draws the F42 graduations.
 *
 * // SPEC NOTES (choices SPEC-v3 leaves open; §1 requires them to be recorded here)
 *  1. `UT.scalemode.window` is an OBJECT, not the string 'scale'. §1 binds 90-app to the
 *     `has('scalemode.window')` / `toggleWindowOf('scalemode.window')` pattern, and toggleWindowOf needs a
 *     `.toggle()` on what it finds; §6.2's `window` comment names the dom.win REGISTRY KEY 'scale'. Both are
 *     honoured: `UT.scalemode.window` is a stable proxy with {name:'scale', toggle, open, close, isOpen}
 *     that creates the real dom.win lazily inside its methods (so mere property access touches no DOM),
 *     `UT.scalemode.windowName === 'scale'`, and `UT.scalemode.toggle/open/close` work too, so
 *     `toggleWindowOf('scalemode')` is equally good.
 *  2. Window layout follows utman_software_utsim f024/f028/f032 exactly for the three original rows
 *     (mm/px scrollbar; a 9-cell icon strip = 8 canned outlines + `OK`; the four green buttons
 *     `Capture | Load Pic | Pipe | Protractor`). Our v3-only controls — the numeric mm/px field, `Trace`,
 *     and the F42 `Skip graduations` checkbox + step field — sit in a fourth, visually secondary row, so
 *     the original's three rows read exactly as they do in the frames.
 *  3. Canned outlines are all flat-topped at y = 0. `polygon()` derives the scanning surface from the run
 *     of `top`-tagged edges and T from the outline height unless T is given, so a flat top makes both
 *     unambiguous; shapes whose bbox height is not the plate thickness (tee, ring, butt) pass an explicit T.
 *  4. F41's `Pipe` offsets by "T". A traced outline's own T is its bbox height, and offsetting a 60 mm tall
 *     shape inward by 60 mm collapses it, so the wall comes from `pipe(mm)` when given, else `weldOpts.T`
 *     (the app's single thickness setting), clamped to 40 % of the shape's smaller bbox side. The miter
 *     offset refuses (status message, no rebuild) rather than emit a self-intersecting ring.
 *  5. `state.scaleMode` has no field for the inner loop of a ring, and 80's buildSpecimen('scale') reads
 *     only `scaleMode.outline`, so ring loops cannot travel through 80 (its clampOpts sanitises
 *     specimenOpts down to numbers, booleans and short strings) and are cached in the module-level
 *     `lastLoops` / `lastOpts` instead. Every 80-driven rebuild inside Scale Mode therefore lands a SOLID
 *     block over the ring — an exit/re-enter, `Adjust Scale…` again, or a material change (80's
 *     scheduleRebuildCheck, which passes no specimenOpts). QA r2 #1: `restoreRing()` puts the cached ring
 *     straight back on top of any such rebuild (`enter()` does it inline; a rebuild somebody else starts is
 *     caught by the deferred `syncMode()` of NOTE 11), and `pruneRing()` drops the cache the moment
 *     `scaleMode.outline` stops describing it, so the specimen, `state().ring` and the panel can never
 *     disagree. Only rings built through the `polygon` path are restored: the `ok-demo` splash rebuilds
 *     with its own loops from its own id, so restoring it as a `polygon` would only lose that id.
 *  6. Refusals (`Picture too large — use one under 4 MB`, a non-`data:image/` URL, a degenerate outline)
 *     are reported on the status line, never through a modal — a modal would block the headless runner and
 *     the original shows no dialog here.
 *  7. `exit()` clears `scaleMode.protractor` (a Scale Mode overlay 60 would otherwise keep drawing on the
 *     weld screen) but NOT `magnify`, because F42 is specified to work in `weld` mode too, nor `picture` /
 *     `outline`, which 60 draws only under the sheet transform and which a later `enter()` should restore.
 *  8. Pointer work on #cv-cross (trace vertices, protractor drag/rotate) is a capture-phase listener on
 *     `document` filtered to `#cv-cross`, with stopPropagation, so 60's probe drag never also fires; 60
 *     needs no change and a build without 85 behaves exactly as before.
 *  9. EVERY public entry point routes through `ensureOn()` (QA round 1 #2/#3): F41 says entering sets
 *     `scaleMode.on` AND calls `UT.modes.enter('scale', {silentUI:true})`, so opening ADJUST SCALE from the
 *     menu, `Capture`, `Load Pic…`, `Pipe`, `Trace boundary` and showing the protractor all enter the mode
 *     first — the flag, `state.mode`, the DISABLED.scale matrix and the white sheet can never disagree.
 *     `enter()` itself uses the internal `openWin()`, so the two can never recurse. `Capture` composes the
 *     screen BEFORE entering (entering blanks the client area to the sheet — capturing after it would
 *     photograph a blank sheet).
 * 10. `magnify()` is the one Scale Mode item that does NOT force the mode on: F42 states the magnified skip
 *     graduations work "in `scale` mode and in `weld` mode (where the original demonstrates it)", and 60
 *     draws them in both, so forcing `scale` would make the demonstrated weld-screen use unreachable from
 *     the menu. It enters only when the current mode is neither, where nothing would be drawn at all.
 * 11. A deferred `syncMode()` (a `setTimeout(0)` off the 'state' bus, never a nested `UT.set`) keeps
 *     `scaleMode.on` in step with modes entered by somebody else — `UT.test.loadSpecimen('ok-demo')` and
 *     `modes.enter('scale')` (§8's `MODE_OF`) turn the flag on, leaving `scale` for any other mode turns it
 *     off and drops the protractor overlay — and satisfies F53's "with the probe on the K and the
 *     protractor shown" for the `ok-demo` specimen however it was loaded (Help ▸ Demo, the icon, or the
 *     test API). (v3 integration: an earlier revision of this note said the 'O' of that demo was still
 *     off-canvas. It is not — 60-view-cross fits the sheet to the specimen extents, so the demo's
 *     x -98…82 mm land at 28…388 px inside a 798 px #cv-cross. The note is kept only to retire the claim.)
 * 12. QA r3 #2: `scaleMode.outline` is the point list the whole mode is built from, so it is sanitised the
 *     way every other point list in the build is — vertices clamped to ±`COORD_MAX` (2000 mm, the limit
 *     10-specimens clamps defect points to) and thinned to `MAX_OUTLINE_PTS` (400, its MAX_DEFECT_PTS).
 *     `normaliseOutline()` DECIMATES rather than truncates (a 5000-point programmatic ring stays a ring),
 *     and an interactive trace simply stops accepting vertices at the cap with a status hint. 400 vertices
 *     keep Scale Mode inside V3-63's "≤ 15 ms" compute budget; 5000 did not (16.8 ms), 20 000 gave 8 fps.
 * 13. QA r3 #1: the ADJUST SCALE window is docked to the BOTTOM-left corner of #cv-cross, not the top-left
 *     one of utman_software f024. The original can afford the top-left corner because its drawings sit
 *     further down the sheet; 60 puts our sheet's 0,0 in the canvas's top-left corner and every canned
 *     outline, the F53 ok-demo letters and a protractor dropped on a probe near x = 0 land there, so a
 *     panel in that corner hides exactly what the mode exists to show. The corner-docked LOOK of the frame
 *     is kept, the occlusion is not. `placeWin()` re-parks it once the real window height is known and
 *     leaves it alone afterwards, so dragging it still works.
 */
(function (UT) {
  'use strict';

  const M = UT.math;

  const MM_PER_PX_MIN = 0.05;              // §2: scaleMode.mmPerPx range
  const MM_PER_PX_MAX = 5;
  const GRAD_STEP_MIN = 1;                 // F42 scaleMode.gradStepMm
  const GRAD_STEP_MAX = 50;
  const PROTRACTOR_SNAP_MM = 8;            // F41: snaps to the probe index when dropped within 8 mm
  const PROTRACTOR_R_MM = 60;              // F41: 60 mm-radius semicircle (60 draws it at this radius)
  const MAX_PICTURE_PIXELS = 8e6;          // F41: 8 MP cap
  const MAX_DATA_URL_BYTES = 4 * 1024 * 1024;   // F41: 4 MB of data URL
  const MAX_CAPTURE_PX = 4000;
  const RIM_BAND_PX = 14;                  // rotate when the grab lands within this of the rim
  const CLOSE_HIT_PX = 8;                  // clicking the first vertex again closes a trace
  // QA r3 #2: the traced outline is sanitised exactly the way every other point list in the build is —
  // 10-specimens clamps defect vertices to ±COORD_MAX (2000 mm) and caps them at MAX_DEFECT_PTS (400),
  // 86-annotate caps strokes at 4000 points. Same two numbers here (SPEC NOTE 12).
  const COORD_MAX = 2000;                  // mm: |x|,|y| of an outline vertex (10-specimens.js:1048)
  const MAX_OUTLINE_PTS = 400;             // vertices kept in an outline (10-specimens.js:1049)
  const WIN_H_EST = 214;                   // px: assumed ADJUST SCALE height before it has been laid out
  const WIN_GAP_PX = 6;                    // px: gap between the window and the client-area corner

  const css = [
    '.win[data-win=scale] .win-body { min-width: 272px; padding: 6px; background: #d4d0c8; }',
    '.win[data-win=scale] .sm-scroll { display: flex; align-items: stretch; height: 18px;',
    '  border: 1px solid; border-color: #808080 #ffffff #ffffff #808080; background: #ffffff; }',
    '.win[data-win=scale] .sm-arrow { flex: 0 0 17px; min-width: 0; padding: 0; font-size: 9px; line-height: 1; }',
    '.win[data-win=scale] .sm-range { flex: 1 1 auto; width: 10px; margin: 0 2px; padding: 0;',
    '  border: none; background: transparent; }',
    '.win[data-win=scale] .sm-icons { display: grid; grid-template-columns: repeat(9, 1fr); gap: 0;',
    '  margin-top: 4px; border: 1px solid #808080; background: #ffffff; }',
    '.win[data-win=scale] .sm-icon { display: flex; align-items: center; justify-content: center;',
    '  height: 30px; min-width: 0; padding: 0; border: 1px solid #c8c8c8; background: #ffffff;',
    '  border-radius: 0; font-size: 12px; }',
    '.win[data-win=scale] .sm-icon:hover { background: #eef4ff; }',
    '.win[data-win=scale] .sm-icon.on { background: #d8e8ff; border-color: #40609f; }',
    '.win[data-win=scale] .sm-icon svg { display: block; }',
    '.win[data-win=scale] .sm-ok { font-weight: bold; letter-spacing: 0.5px; }',
    '.win[data-win=scale] .sm-btns { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3px; margin-top: 5px; }',
    '.win[data-win=scale] .sm-btns .btn { min-width: 0; padding: 3px 2px; background: #a8e8a8;',
    '  border-color: #ffffff #707070 #707070 #ffffff; }',
    '.win[data-win=scale] .sm-btns .btn:hover { background: #bdf0bd; }',
    '.win[data-win=scale] .sm-btns .btn.on { background: #6fd06f; border-color: #404040 #ffffff #ffffff #404040; }',
    '.win[data-win=scale] .sm-extra { margin-top: 6px; padding-top: 5px; border-top: 1px solid #a0a0a0;',
    '  display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; font-size: 11px; color: #202020; }',
    '.win[data-win=scale] .sm-extra .btn { min-width: 0; padding: 1px 7px; font-size: 11px; }',
    '.win[data-win=scale] .sm-num { width: 54px; padding: 1px 3px; font-size: 11px; }',
    '.win[data-win=scale] .sm-chk { display: flex; align-items: center; gap: 4px; }',
    '.win[data-win=scale] .sm-hint { flex: 1 1 100%; color: #404040; font-size: 10px; }',
  ].join('\n');

  // ------------------------------------------------------------------ module-level buffers (never state)
  let winApi = null;          // the real UT.dom.win api, created lazily on the first open()
  let ui = null;              // {range, num, grad, magChk, traceBtn, protBtn, pipeBtn, icons, hint}
  let tracing = null;         // [{x, y}] mm collected by an in-progress boundary trace
  let lastLoops = null;       // SPEC NOTE 5: the ring loops the last Pipe / ring icon produced
  let lastOpts = null;        // SPEC NOTE 5: the specimenOpts those loops were built with (null = not restorable)
  let lastShape = null;       // key of the canned outline last applied (icon highlight)
  let drag = null;            // {kind: 'move'|'rotate', id, dx, dy, a0, rot0}
  let boundDoc = false;       // document-level pointer listeners attached
  let entering = false;       // inside enter(): the deferred mode sync must not fight it
  let syncToken = 0;          // cancels a scheduled syncMode() (exit / enter supersede it)
  let syncPending = false;    // a syncMode() is already queued
  let autoSpec = null;        // the 'ok-demo' specimen already considered for F53's auto-protractor
  let winPlaced = false;      // QA r3 #1: the window has been parked on the sheet's bottom-left corner

  function st() { return UT.state || {}; }
  function sm() { const s = st(); return s.scaleMode || {}; }
  function t(key, params) { return UT.i18n && UT.i18n.t ? UT.i18n.t(key, params) : key; }
  /** Status hints are English KEYS — 90 translates them at render time (SPEC-v2 §5.3.2). */
  function say(key) { if (typeof UT.status === 'function') UT.status({ right: key }); }
  function clamp(v, lo, hi) { return M && M.clamp ? M.clamp(v, lo, hi) : (v < lo ? lo : v > hi ? hi : v); }
  function num(v, dflt) { const n = Number(v); return Number.isFinite(n) ? n : dflt; }

  // ------------------------------------------------------------------ pure geometry helpers
  /** Round to 3 significant figures (the ADJUST SCALE field's precision, F41). */
  function sig3(v) {
    const n = Number(v);
    if (!Number.isFinite(n) || n === 0) return 0;
    return +n.toPrecision(3);
  }
  /** Shoelace signed area; > 0 and < 0 are the two windings (y points down here, the sign is algebraic). */
  function signedArea(pts) {
    let a = 0;
    for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p.x * q.y - q.x * p.y; }
    return a / 2;
  }
  /** Axis-aligned bounding box of a point list. */
  function bbox(pts) {
    let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity;
    for (const p of pts) { xMin = Math.min(xMin, p.x); xMax = Math.max(xMax, p.x); yMin = Math.min(yMin, p.y); yMax = Math.max(yMax, p.y); }
    return { xMin, yMin, xMax, yMax, w: xMax - xMin, h: yMax - yMin };
  }
  /**
   * QA r3 #2: thin a point list down to `max` vertices by keeping every k-th one (10-specimens'
   * sanitisePts does exactly this to a defect polyline) — a 5000-point ring stays a usable ring instead of
   * being truncated into an arc.
   * @param {Array<{x:number,y:number}>} pts
   * @param {number} max
   * @returns {Array<{x:number,y:number}>} `pts` itself when it is already short enough
   */
  function decimate(pts, max) {
    if (!Array.isArray(pts) || pts.length <= max) return pts;
    const k = Math.ceil(pts.length / max), out = [];
    for (let i = 0; i < pts.length; i += k) out.push(pts[i]);
    const last = pts[pts.length - 1];
    if (out[out.length - 1] !== last) out.push(last);
    return out;
  }
  /**
   * Clean a traced/loaded boundary: finite points only, each clamped to ±COORD_MAX mm, consecutive
   * duplicates and a repeated closing vertex dropped, thinned to MAX_OUTLINE_PTS vertices (QA r3 #2), at
   * least 3 points left.
   * @param {Array<{x:number,y:number}>} pts
   * @returns {Array<{x:number,y:number}>|null} the closed polygon (implicitly closed), or null
   */
  function normaliseOutline(pts) {
    if (!Array.isArray(pts)) return null;
    let out = [];
    for (const p of pts) {
      const x = num(p && p.x, NaN), y = num(p && p.y, NaN);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const cx = clamp(x, -COORD_MAX, COORD_MAX), cy = clamp(y, -COORD_MAX, COORD_MAX);
      const last = out[out.length - 1];
      if (last && Math.abs(last.x - cx) < 1e-6 && Math.abs(last.y - cy) < 1e-6) continue;
      out.push({ x: +cx.toFixed(3), y: +cy.toFixed(3) });
    }
    out = decimate(out, MAX_OUTLINE_PTS);
    while (out.length > 3 && Math.abs(out[0].x - out[out.length - 1].x) < 1e-6 && Math.abs(out[0].y - out[out.length - 1].y) < 1e-6) out.pop();
    if (out.length < 3 || Math.abs(signedArea(out)) < 1e-6) return null;
    return out;
  }
  /** Unit normal of edge a→b pointing INTO a polygon of the given signed area. */
  function inwardNormal(a, b, area) {
    const dx = b.x - a.x, dy = b.y - a.y, l = Math.sqrt(dx * dx + dy * dy);
    if (!(l > 1e-9)) return null;
    return area > 0 ? { x: -dy / l, y: dx / l } : { x: dy / l, y: -dx / l };
  }
  /**
   * F41 Pipe: miter-offset a closed polygon inward by d mm.
   * @param {Array<{x:number,y:number}>} pts closed polygon (implicitly closed)
   * @param {number} d wall thickness in mm
   * @returns {Array<{x:number,y:number}>|null} the inner loop, or null when the shape is too thin / spiky
   */
  function offsetInward(pts, d) {
    const n = pts && pts.length;
    if (!n || n < 3 || !(d > 0)) return null;
    const area = signedArea(pts);
    if (!(Math.abs(area) > 1e-9)) return null;
    const out = [];
    for (let i = 0; i < n; i++) {
      const p = pts[i], a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
      const n1 = inwardNormal(a, p, area), n2 = inwardNormal(p, b, area);
      if (!n1 || !n2) return null;
      let bx = n1.x + n2.x, by = n1.y + n2.y;
      const bl = Math.sqrt(bx * bx + by * by);
      if (!(bl > 1e-9)) return null;                       // a 180° reversal has no bisector
      bx /= bl; by /= bl;
      const cosHalf = bx * n1.x + by * n1.y;
      if (cosHalf < 0.15) return null;                     // a spike: the miter would explode
      const k = d / cosHalf;
      out.push({ x: +(p.x + bx * k).toFixed(3), y: +(p.y + by * k).toFixed(3) });
    }
    const a2 = signedArea(out);
    if (!(Math.abs(a2) > 1e-6) || (a2 > 0) !== (area > 0) || Math.abs(a2) >= Math.abs(area)) return null;
    return out;
  }
  /**
   * The mm loops a built specimen carries, stripped to plain {x, y} (10-specimens tags every vertex).
   * @param {object} spec a specimen from UT.specimens.build
   * @returns {Array<{pts:Array<{x:number,y:number}>,hole:boolean}>|null}
   */
  function specLoops(spec) {
    if (!spec) return null;
    const raw = Array.isArray(spec.loops) && spec.loops.length ? spec.loops
      : (Array.isArray(spec.outline) && spec.outline.length >= 3 ? [{ pts: spec.outline, hole: false }] : null);
    if (!raw) return null;
    const out = [];
    for (const l of raw) {
      const pts = [];
      for (const q of (l && l.pts) || []) { const x = num(q && q.x, NaN), y = num(q && q.y, NaN); if (Number.isFinite(x) && Number.isFinite(y)) pts.push({ x: x, y: y }); }
      if (pts.length >= 3) out.push({ pts: pts, hole: !!(l && l.hole) });
    }
    return out.length ? out : null;
  }
  /**
   * True when two mm point lists describe the same boundary (same order, 0.01 mm tolerance).
   * @param {Array<{x:number,y:number}>} a
   * @param {Array<{x:number,y:number}>} b
   * @returns {boolean}
   */
  function sameLoop(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return false;
    for (let i = 0; i < a.length; i++) {
      const p = a[i] || {}, q = b[i] || {};
      if (!(Math.abs(Number(p.x) - Number(q.x)) <= 0.01)) return false;   // NaN fails this, as it should
      if (!(Math.abs(Number(p.y) - Number(q.y)) <= 0.01)) return false;
    }
    return true;
  }
  /** n points around a circle, first at angle 0, in the same winding okDemo's outer loops use. */
  function circlePts(cx, cy, r, n) {
    const pts = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pts.push({ x: +(cx + r * Math.cos(a)).toFixed(3), y: +(cy + r * Math.sin(a)).toFixed(3) }); }
    return pts;
  }
  /** F41: snap a protractor centre to the probe index when it is dropped within 8 mm of it. */
  function snapCentre(p, index) {
    if (!p || !index) return p;
    const dx = p.x - index.x, dy = p.y - index.y;
    if (dx * dx + dy * dy > PROTRACTOR_SNAP_MM * PROTRACTOR_SNAP_MM) return p;
    return { x: index.x, y: index.y, rotDeg: p.rotDeg || 0 };
  }
  /** ADJUST SCALE scrollbar ↔ mm/px: logarithmic over 0.05…5, so the middle of the bar is 0.5 mm/px. */
  function sliderToMm(u) { return sig3(MM_PER_PX_MIN * Math.pow(MM_PER_PX_MAX / MM_PER_PX_MIN, clamp(num(u, 0.5), 0, 1))); }
  function mmToSlider(mm) {
    const v = clamp(num(mm, 0.5), MM_PER_PX_MIN, MM_PER_PX_MAX);
    return +(Math.log(v / MM_PER_PX_MIN) / Math.log(MM_PER_PX_MAX / MM_PER_PX_MIN)).toFixed(4);
  }

  // ------------------------------------------------------------------ canned outlines (the 8 icon buttons)
  // Canned shapes start 150 mm along the sheet so that at the default 0.5 mm/px they clear the ADJUST
  // SCALE window, which opens over the sheet's top-left ruler corner (utman_software f024).
  const SHAPE_X0 = 150;
  const SHAPES = {
    // butt weld: 160 × 22 plate with a root reinforcement hanging below the joint
    butt: { label: 'Butt weld', T: 22, pts() { const o = SHAPE_X0; return [{ x: o, y: 0 }, { x: o + 160, y: 0 }, { x: o + 160, y: 22 }, { x: o + 92, y: 22 }, { x: o + 88, y: 27 }, { x: o + 72, y: 27 }, { x: o + 68, y: 22 }, { x: o, y: 22 }]; } },
    // single-bevel prep: one vertical face, one 30° bevelled face
    bevel: { label: 'Single-bevel prep', T: 22, pts() { const o = SHAPE_X0; return [{ x: o, y: 0 }, { x: o + 140, y: 0 }, { x: o + 160, y: 22 }, { x: o, y: 22 }]; } },
    // T-joint: 180 × 20 flange with a 12 mm web below the centre
    tee: { label: 'T-joint', T: 20, pts() { const o = SHAPE_X0; return [{ x: o, y: 0 }, { x: o + 180, y: 0 }, { x: o + 180, y: 20 }, { x: o + 96, y: 20 }, { x: o + 96, y: 60 }, { x: o + 84, y: 60 }, { x: o + 84, y: 20 }, { x: o, y: 20 }]; } },
    // pipe ring: an annulus, outer r 35 / inner r 20 → 15 mm wall
    ring: {
      label: 'Pipe ring', T: 15,
      loops() { const cx = SHAPE_X0 + 70; return [{ pts: circlePts(cx, 35, 35, 48), hole: false }, { pts: circlePts(cx, 35, 20, 40).slice().reverse(), hole: true }]; },
    },
    // ellipse 160 × 64
    ellipse: {
      label: 'Ellipse',
      pts() { const p = [], cx = SHAPE_X0 + 80; for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; p.push({ x: +(cx + 80 * Math.cos(a)).toFixed(3), y: +(32 + 32 * Math.sin(a)).toFixed(3) }); } return p; },
    },
    // plain plate 200 × 25
    plate: { label: 'Plate', T: 25, pts() { const o = SHAPE_X0; return [{ x: o, y: 0 }, { x: o + 200, y: 0 }, { x: o + 200, y: 25 }, { x: o, y: 25 }]; } },
    // step wedge 10 / 20 / 30 / 40 mm, 40 mm per step
    step: { label: 'Step wedge', pts() { const o = SHAPE_X0; return [{ x: o, y: 0 }, { x: o + 160, y: 0 }, { x: o + 160, y: 40 }, { x: o + 120, y: 40 }, { x: o + 120, y: 30 }, { x: o + 80, y: 30 }, { x: o + 80, y: 20 }, { x: o + 40, y: 20 }, { x: o + 40, y: 10 }, { x: o, y: 10 }]; } },
    // the original's 'OK' splash letters (F53's specimen, built through this same polygon path)
    okletters: { label: 'OK letters', spec: 'ok-demo' },
  };
  const SHAPE_KEYS = ['butt', 'bevel', 'tee', 'ring', 'ellipse', 'plate', 'step', 'okletters'];

  const ICON_SVG = {
    butt: '<svg viewBox="0 0 24 18" width="22" height="16"><path d="M1 6h8l3-4 3 4h8M1 6v6h22V6M9 12l1 3h4l1-3" fill="none" stroke="#101010" stroke-width="1.2"/></svg>',
    bevel: '<svg viewBox="0 0 24 18" width="22" height="16"><path d="M1 5h11l6 7M1 5v7h22" fill="none" stroke="#101010" stroke-width="1.2"/><path d="M12 5v7" stroke="#101010" stroke-width="1.2"/></svg>',
    tee: '<svg viewBox="0 0 24 18" width="22" height="16"><path d="M1 5h22v5H1zM10 10v7M14 10v7" fill="none" stroke="#101010" stroke-width="1.2"/></svg>',
    ring: '<svg viewBox="0 0 24 18" width="22" height="16"><circle cx="12" cy="9" r="7.5" fill="none" stroke="#101010" stroke-width="1.2"/><circle cx="12" cy="9" r="3.6" fill="none" stroke="#101010" stroke-width="1.2"/></svg>',
    ellipse: '<svg viewBox="0 0 24 18" width="22" height="16"><ellipse cx="12" cy="9" rx="10" ry="6" fill="none" stroke="#101010" stroke-width="1.2"/></svg>',
    plate: '<svg viewBox="0 0 24 18" width="22" height="16"><rect x="1.5" y="5.5" width="21" height="7" fill="none" stroke="#101010" stroke-width="1.2"/></svg>',
    step: '<svg viewBox="0 0 24 18" width="22" height="16"><path d="M1 4h22v10h-5V11h-5V8H7V6H1z" fill="none" stroke="#101010" stroke-width="1.2"/></svg>',
    okletters: '<svg viewBox="0 0 24 18" width="22" height="16"><ellipse cx="7" cy="9" rx="5" ry="6.5" fill="none" stroke="#101010" stroke-width="1.4"/><path d="M15 2.5v13M22 2.5 15.5 9 22 15.5" fill="none" stroke="#101010" stroke-width="1.4"/></svg>',
  };

  // ------------------------------------------------------------------ cross-view bridges (all guarded)
  /** Current px-per-mm of #cv-cross (falls back to the 0.5 mm/px default when 60 is absent). */
  function pxPerMm() {
    const V = UT.views && UT.views.cross;
    if (!V || typeof V.toPx !== 'function') return 2;
    try { const k = Math.abs(V.toPx(10, 0).x - V.toPx(0, 0).x) / 10; return k > 1e-6 ? k : 2; } catch (e) { return 2; }
  }
  function toPx(x, y) {
    const V = UT.views && UT.views.cross;
    if (!V || typeof V.toPx !== 'function') return null;
    try { return V.toPx(x, y); } catch (e) { return null; }
  }
  function toMm(px, py) {
    const V = UT.views && UT.views.cross;
    if (!V || typeof V.toMm !== 'function') return null;
    try { return V.toMm(px, py); } catch (e) { return null; }
  }
  /** The probe index (beam emission) point in mm — where the protractor snaps (F41). */
  function probeIndex() {
    const s = st(), p = s.probe || { x: 0 };
    if (s.specimen && UT.specimens && typeof UT.specimens.scanSurfaceAt === 'function') {
      try { const e = UT.specimens.scanSurfaceAt(s.specimen, p); if (e && Number.isFinite(e.x)) return { x: e.x, y: num(e.y, 0) }; } catch (err) { /* fall through */ }
    }
    return { x: num(p.x, 0), y: 0 };
  }

  // ------------------------------------------------------------------ state writers
  function patch(p, opts) { UT.setIn('scaleMode', p, opts); }
  /** Rebuild the Scale Mode specimen through 80's mode machinery (the normal finish() path, F41). */
  function applyShape(specimenOpts) {
    if (!UT.modes || typeof UT.modes.enter !== 'function') return null;
    try { return UT.modes.enter('scale', { specimenOpts: specimenOpts, silentUI: true }); }
    catch (e) { console.error('[UT.scalemode] build', e); return null; }
  }
  /**
   * Build a Scale Mode polygon that needs LOOPS (a ring: outer + hole). 80's clampOpts sanitises
   * specimenOpts down to finite numbers, booleans and short strings, so an array of loops cannot travel
   * through UT.modes.enter (SPEC NOTE 5). The mode is entered on the outer outline first — that is what
   * settles the probe, the defect stash, the enable matrix and the hint — and the ringed specimen, built
   * through the very same UT.specimens.build('polygon') path, is then installed over it.
   * @param {object} so specimenOpts for the outer outline (clampOpts-safe keys only)
   * @param {Array<{pts:Array<{x:number,y:number}>,hole:boolean}>} loops
   * @returns {object|null} the ringed specimen (or the outer-outline one when the ring cannot be built)
   */
  function applyPolygon(so, loops) {
    const base = applyShape(so);
    if (!loops || !base) return base;
    lastOpts = Object.assign({}, so);              // QA r2 #1: what restoreRing() rebuilds the ring from
    const spec = installLoops(so, loops);
    return spec || base;
  }
  /**
   * Build `polygon` with explicit loops and install it over whatever 80 last built. Shared by
   * applyPolygon() (a fresh ring) and restoreRing() (a ring an 80 rebuild has just flattened).
   * @param {object} so specimenOpts of the outer outline (clampOpts-safe keys only)
   * @param {Array<{pts:Array<{x:number,y:number}>,hole:boolean}>} loops
   * @returns {object|null} the ringed specimen, or null when it could not be built
   */
  function installLoops(so, loops) {
    if (!loops || !UT.specimens || typeof UT.specimens.build !== 'function') return null;
    let spec;
    try {
      spec = UT.specimens.build('polygon', Object.assign({}, so, { loops: loops, material: st().material || 'carbon' }));
    } catch (e) { console.error('[UT.scalemode] ring', e); return null; }
    const s = st();
    const probe = Object.assign({}, s.probe);
    const ss = spec.scanSurface;
    if (ss && Number.isFinite(ss.xMin) && Number.isFinite(ss.xMax)) probe.x = clamp(num(probe.x, 0), ss.xMin, ss.xMax);
    if (spec.L) probe.z = clamp(num(probe.z, spec.L / 2), 0, spec.L);
    UT.set({ specimen: spec, probe: probe });
    return spec;
  }
  /**
   * QA r2 #1: drop the cached ring as soon as `scaleMode.outline` stops describing it, so `state().ring`,
   * the panel's icon highlight and the specimen can never disagree.
   * @returns {boolean} true when a stale cache was cleared
   */
  function pruneRing() {
    if (!lastLoops) return false;
    const outline = sm().outline;
    if (Array.isArray(outline) && outline.length >= 3 && sameLoop(outline, lastLoops[0] && lastLoops[0].pts)) return false;
    lastLoops = null; lastOpts = null;
    const def = lastShape && SHAPES[lastShape];
    if (def && (def.loops || def.spec)) lastShape = null;
    return true;
  }
  /**
   * True when the cached ring is restorable AND the live Scale Mode specimen has lost it — i.e. 80 has just
   * rebuilt the mode from `scaleMode.outline` alone (exit → re-enter, or a material change).
   * @returns {boolean}
   */
  function ringLost() {
    if (!lastLoops || !lastOpts || st().mode !== 'scale') return false;
    const outline = sm().outline;
    if (!(Array.isArray(outline) && outline.length >= 3 && sameLoop(outline, lastLoops[0] && lastLoops[0].pts))) return false;
    const cur = specLoops(st().specimen);
    return !cur || cur.length < lastLoops.length;
  }
  /**
   * Put the cached ring back on top of an 80 rebuild that flattened it (SPEC NOTE 5). Never called from a
   * 'render' listener: `enter()` calls it inline, everybody else through the deferred `syncMode()`.
   * @returns {object|null} the re-installed ringed specimen, or null when nothing needed doing
   */
  function restoreRing() {
    if (pruneRing() || !ringLost()) return null;
    return installLoops(lastOpts, lastLoops);
  }

  /**
   * Set the sheet scale (F41). Clamped to 0.05…5 mm per CSS pixel and rounded to 3 significant figures.
   * @param {number} v mm per pixel
   * @returns {number} the value actually stored
   */
  function setMmPerPx(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return num(sm().mmPerPx, 0.5);
    const mm = sig3(clamp(n, MM_PER_PX_MIN, MM_PER_PX_MAX));
    if (mm !== sm().mmPerPx) patch({ mmPerPx: mm });
    syncUi();
    return mm;
  }

  /**
   * F42 panel half: turn the magnified skip graduations on or off (60 draws them).
   * @param {boolean} [on] omit to toggle
   * @returns {boolean} the new flag
   */
  function magnify(on) {
    const next = on === undefined ? !sm().magnify : !!on;
    // F42 draws them in `scale` AND in `weld` (SPEC NOTE 10) — only a third mode needs the sheet.
    if (next && st().mode !== 'scale' && st().mode !== 'weld') ensureOn();
    if (next !== !!sm().magnify) patch({ magnify: next });
    syncUi();
    return next;
  }
  /**
   * F42 panel half: the graduation pitch in mm of surface distance along each drawn beam leg.
   * @param {number} mm 1…50
   * @returns {number} the value actually stored
   */
  function setGradStep(mm) {
    const n = Number(mm);
    if (!Number.isFinite(n)) return num(sm().gradStepMm, 5);
    const v = +clamp(n, GRAD_STEP_MIN, GRAD_STEP_MAX).toFixed(1);
    if (v !== sm().gradStepMm) patch({ gradStepMm: v });
    syncUi();
    return v;
  }

  // ------------------------------------------------------------------ picture import (F41)
  /** Natural size of a data: URL through an <img>. Resolves {w,h}, or null when it cannot be decoded. */
  function measure(url) {
    return new Promise(function (resolve) {
      if (typeof Image !== 'function') { resolve({ w: 0, h: 0 }); return; }
      let img;
      try { img = new Image(); } catch (e) { resolve({ w: 0, h: 0 }); return; }
      img.onload = function () { resolve({ w: img.naturalWidth || img.width || 0, h: img.naturalHeight || img.height || 0 }); };
      img.onerror = function () { resolve(null); };
      img.src = url;
    });
  }
  /** Validate, size and store a picture. Only `data:image/…` is ever accepted (§11.9: no network). */
  function applyPicture(dataUrl, name) {
    const url = String(dataUrl === undefined || dataUrl === null ? '' : dataUrl);
    if (!/^data:image\//i.test(url)) { say('Only a picture file from this computer can be loaded'); return Promise.resolve(null); }
    if (url.length > MAX_DATA_URL_BYTES) { say('Picture too large — use one under 4 MB'); return Promise.resolve(null); }
    return measure(url).then(function (d) {
      if (!d) { say('That file could not be read as a picture'); return null; }
      if (d.w * d.h > MAX_PICTURE_PIXELS) { say('Picture too large — use one under 4 MB'); return null; }
      const pic = { name: String(name || 'picture'), dataUrl: url, w: d.w, h: d.h, x: 0, y: 0 };
      ensureOn();                                  // QA r1 #3: a loaded picture belongs on the sheet
      patch({ picture: pic, on: true });
      say('Picture loaded — set mm per pixel, then trace the boundary');
      return pic;
    });
  }
  /**
   * F41 Load Pic: import a picture. With no argument it opens the user-initiated file picker
   * (`UT.dom.fileOpen('image/*')`); a string is treated as a `data:image/…` URL; a File/Blob is read with
   * FileReader. Nothing is fetched, nothing is persisted (§2: `scaleMode.picture` never leaves the page).
   * @param {(string|File|Blob|{dataUrl:string,name?:string})} [src]
   * @param {{name?:string}} [opts]
   * @returns {Promise<{name:string,dataUrl:string,w:number,h:number,x:number,y:number}|null>}
   */
  function loadPicture(src, opts) {
    const o = opts || {};
    ensureOn();                                    // F41: `Load Pic…` is a way into Scale Mode
    if (src === undefined || src === null) {
      if (!UT.dom || typeof UT.dom.fileOpen !== 'function') return Promise.resolve(null);
      return UT.dom.fileOpen('image/*', { text: false }).then(function (f) {
        if (!f || !f.dataUrl) return null;
        return applyPicture(f.dataUrl, f.name);
      }, function () { say('That file could not be read as a picture'); return null; });
    }
    if (typeof src === 'string') return applyPicture(src, o.name || 'picture');
    if (typeof src === 'object' && typeof src.dataUrl === 'string') return applyPicture(src.dataUrl, src.name || o.name || 'picture');
    if (typeof Blob === 'function' && typeof FileReader === 'function' && src instanceof Blob) {
      return new Promise(function (resolve) {
        const fr = new FileReader();
        fr.onerror = function () { say('That file could not be read as a picture'); resolve(null); };
        fr.onload = function () { resolve(applyPicture(String(fr.result || ''), src.name || o.name || 'picture')); };
        try { fr.readAsDataURL(src); } catch (e) { resolve(null); }
      });
    }
    return Promise.resolve(null);
  }
  /** Drop the imported picture (it is never persisted, so this only clears the live overlay). */
  function clearPicture() { if (sm().picture) patch({ picture: null }); return null; }

  /**
   * F41 Capture: compose the visible #cv-plan and #cv-cross into an offscreen canvas and use its PNG data
   * URL as the picture — the browser-safe reading of the original's screen capture.
   * @returns {string|null} the data URL, or null when there is nothing to capture
   */
  function capture() {
    if (typeof document === 'undefined') return null;
    const list = [];
    for (const id of ['cv-plan', 'cv-cross']) {
      const c = document.getElementById(id);
      if (c && c.width > 0 && c.height > 0) list.push(c);
    }
    if (!list.length) { say('There is nothing on screen to capture'); return null; }
    const k = (UT.dom && typeof UT.dom.scale === 'function' && UT.dom.scale()) || 1;
    const rects = list.map(function (c) { return c.getBoundingClientRect(); });
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const r of rects) { left = Math.min(left, r.left); top = Math.min(top, r.top); right = Math.max(right, r.right); bottom = Math.max(bottom, r.bottom); }
    const W = Math.min(MAX_CAPTURE_PX, Math.max(1, Math.round((right - left) / k)));
    const H = Math.min(MAX_CAPTURE_PX, Math.max(1, Math.round((bottom - top) / k)));
    let url = null;
    try {
      const off = document.createElement('canvas');
      off.width = W; off.height = H;
      const ctx = off.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
      list.forEach(function (c, i) {
        const r = rects[i];
        ctx.drawImage(c, (r.left - left) / k, (r.top - top) / k, Math.max(1, r.width / k), Math.max(1, r.height / k));
      });
      url = off.toDataURL('image/png');
    } catch (e) { say('That screen could not be captured'); return null; }
    ensureOn();                                    // QA r1 #2: Capture is a way INTO Scale Mode (F41)
    patch({ picture: { name: 'capture.png', dataUrl: url, w: W, h: H, x: 0, y: 0 }, on: true });
    say('Screen captured — set mm per pixel, then trace the boundary');
    return url;
  }

  // ------------------------------------------------------------------ tracing (F41)
  /**
   * Turn a traced boundary into the Scale Mode specimen: `UT.specimens.build('polygon')` through 80, so the
   * tracer, the A-scan and every view work on it unchanged.
   * @param {Array<{x:number,y:number}>} pts the mm polygon (≥ 3 points, open or closed)
   * @returns {object|null} the specimen, or null when the outline is degenerate
   */
  function trace(pts) {
    const outline = normaliseOutline(pts);
    if (!outline) { say('A traced boundary needs at least 3 points'); return null; }
    tracing = null; lastLoops = null; lastOpts = null; lastShape = null;
    patch({ outline: outline, on: true }, { noRender: true });
    const spec = applyShape({ id: 'polygon' });     // this IS UT.modes.enter('scale', …)
    armUi();
    syncUi();
    if (spec) say('Boundary traced — LEFT mouse button/drag to move the UT Probe');
    return spec;
  }
  /** Start collecting trace vertices from clicks on #cv-cross (F41: double-click or `OK` closes). */
  function startTrace() {
    ensureOn();                                    // QA r1 #3: `Trace boundary` enters the mode first
    tracing = [];
    syncUi();
    say('Click the boundary corners, then double-click or press OK to close it');
    return true;
  }
  /**
   * Add one vertex (mm) to the trace in progress. Coordinates are clamped to ±COORD_MAX and the trace stops
   * growing at MAX_OUTLINE_PTS vertices (QA r3 #2), so an outline can never outrun V3-63's compute budget.
   * @param {number} x mm
   * @param {number} y mm
   * @returns {number} the number of vertices collected so far
   */
  function addTracePoint(x, y) {
    if (!tracing) startTrace();
    if (tracing.length >= MAX_OUTLINE_PTS) { say('That boundary already has as many points as it can hold — press OK to close it'); return tracing.length; }
    tracing.push({ x: +clamp(num(x, 0), -COORD_MAX, COORD_MAX).toFixed(3), y: +clamp(num(y, 0), -COORD_MAX, COORD_MAX).toFixed(3) });
    patch({ outline: tracing.slice() }, { noRender: false });
    return tracing.length;
  }
  /** Close the trace in progress and build the polygon specimen. */
  function finishTrace() {
    const pts = tracing;
    tracing = null;
    syncUi();
    if (!pts || pts.length < 3) { say('A traced boundary needs at least 3 points'); return null; }
    return trace(pts);
  }
  /** Discard the traced boundary (and any trace in progress). */
  function clearTrace() {
    tracing = null; lastLoops = null; lastOpts = null; lastShape = null;
    patch({ outline: [] });
    syncUi();
    return true;
  }

  /**
   * Load one of the eight canned outlines so Scale Mode is usable without a picture (F41).
   * @param {'butt'|'bevel'|'tee'|'ring'|'ellipse'|'plate'|'step'|'okletters'} key
   * @returns {object|null} the specimen
   */
  function shape(key) {
    const def = SHAPES[key];
    if (!def) return null;
    tracing = null;
    if (def.spec) {
      lastLoops = null; lastOpts = null; lastShape = key;
      patch({ outline: [], on: true }, { noRender: true });
      const s0 = applyShape({ id: def.spec });
      // QA r1 #4: the canned 'OK letters' must record its boundary in scaleMode.outline like the other
      // seven icons, and keep its extra loops in `lastLoops` (SPEC NOTE 5) so Pipe / state still work.
      const loops = specLoops(s0);
      if (loops) {
        lastLoops = loops.length > 1 ? loops : null;
        patch({ outline: loops[0].pts.slice() }, { noRender: true });
      }
      armUi();
      syncUi();
      if (s0) say('LEFT mouse button/drag to move the UT Probe');
      return s0;
    }
    const loops = def.loops ? def.loops() : null;
    const outline = loops ? loops[0].pts.slice() : def.pts();
    lastLoops = loops; lastOpts = null; lastShape = key;
    patch({ outline: outline, on: true }, { noRender: true });
    const so = { id: 'polygon' };
    if (def.T) so.T = def.T;
    const spec = applyPolygon(so, loops);
    armUi();
    syncUi();
    if (spec) say('LEFT mouse button/drag to move the UT Probe');
    return spec;
  }

  /**
   * F41 Pipe: turn the current outline into a closed ring of the given wall thickness — the outline offset
   * inward by the wall, both loops kept (SPEC NOTE 4 for where the wall comes from).
   * @param {number} [wallMm] defaults to weldOpts.T, clamped to 40 % of the shape's smaller bbox side
   * @returns {object|null} the specimen, or null when the outline is too thin to carry that wall
   */
  function pipe(wallMm) {
    ensureOn();                                    // QA r1 #3: `Pipe` is a Scale Mode operation
    const s = st();
    const src = (sm().outline && sm().outline.length >= 3) ? sm().outline : (s.specimen && s.specimen.outline);
    const outer = normaliseOutline(src);
    if (!outer) { say('Trace or choose a boundary first, then press Pipe'); return null; }
    const b = bbox(outer);
    const maxWall = Math.max(1, Math.min(b.w, b.h) * 0.4);
    const wall = clamp(num(wallMm, 0) > 0 ? num(wallMm, 0) : num(s.weldOpts && s.weldOpts.T, 20), 1, maxWall);
    const inner = offsetInward(outer, wall);
    if (!inner) { say('This outline is too thin to carry a pipe wall'); return null; }
    const loops = [{ pts: outer, hole: false }, { pts: inner.slice().reverse(), hole: true }];
    tracing = null; lastLoops = loops; lastOpts = null; lastShape = null;
    patch({ outline: outer, on: true }, { noRender: true });
    const spec = applyPolygon({ id: 'polygon', T: +wall.toFixed(2) }, loops);
    syncUi();
    if (spec) say('LEFT mouse button/drag to move the UT Probe');
    return spec;
  }

  // ------------------------------------------------------------------ protractor (F41)
  /**
   * Show, hide or toggle the protractor overlay. When shown it is dropped on the probe index point;
   * dragging it re-snaps there whenever it is released within 8 mm.
   * @param {boolean} [show] true = show, false = hide, omitted = toggle
   * @returns {{x:number,y:number,rotDeg:number}|null} the protractor, or null when hidden
   */
  function protractor(show) {
    const cur = sm().protractor;
    const want = show === undefined ? !cur : !!show;
    if (!want) { if (cur) patch({ protractor: null }); syncUi(); return null; }
    ensureOn();                                    // QA r1 #3: the protractor lives on the Scale Mode sheet
    const i = probeIndex();
    const p = cur ? snapCentre({ x: cur.x, y: cur.y, rotDeg: num(cur.rotDeg, 0) }, i) : { x: +i.x.toFixed(2), y: +i.y.toFixed(2), rotDeg: 0 };
    patch({ protractor: p });
    bindDoc();
    syncUi();
    say('Drag the protractor by its face to move it, by its rim to turn it (Shift = 1° steps)');
    return p;
  }
  /** Move / rotate the protractor. Values are merged into `scaleMode.protractor`. */
  function setProtractor(p) {
    const cur = sm().protractor;
    if (!cur || !p) return cur || null;
    const next = { x: num(p.x, cur.x), y: num(p.y, cur.y), rotDeg: num(p.rotDeg, cur.rotDeg) };
    patch({ protractor: next });
    return next;
  }

  // ------------------------------------------------------------------ pointer work on #cv-cross
  function crossCanvas(target) {
    if (!target || target.id !== 'cv-cross') return null;
    return target;
  }
  function localMm(ev, cv) {
    const q = (UT.dom && typeof UT.dom.localPos === 'function') ? UT.dom.localPos(ev, cv) : { x: ev.offsetX, y: ev.offsetY };
    const mm = toMm(q.x, q.y);
    return mm ? { mm: mm, px: q } : null;
  }
  function onDown(ev) {
    if (ev.button !== undefined && ev.button !== 0) return;
    const cv = crossCanvas(ev.target);
    if (!cv) return;
    const s = st();
    const p = localMm(ev, cv);
    if (!p) return;
    if (tracing) {
      const first = tracing[0];
      if (first && tracing.length >= 3) {
        const f = toPx(first.x, first.y);
        if (f && Math.abs(f.x - p.px.x) <= CLOSE_HIT_PX && Math.abs(f.y - p.px.y) <= CLOSE_HIT_PX) {
          ev.preventDefault(); ev.stopPropagation();
          finishTrace();
          return;
        }
      }
      ev.preventDefault(); ev.stopPropagation();
      addTracePoint(p.mm.x, p.mm.y);
      return;
    }
    const pr = s.scaleMode && s.scaleMode.protractor;
    if (!pr) return;
    const c = toPx(pr.x, pr.y);
    if (!c) return;
    const dx = p.px.x - c.x, dy = p.px.y - c.y;
    const r = Math.sqrt(dx * dx + dy * dy);
    const rimPx = PROTRACTOR_R_MM * pxPerMm();
    if (r > rimPx + RIM_BAND_PX) return;                       // outside the protractor: 60 keeps the probe drag
    ev.preventDefault(); ev.stopPropagation();
    const kind = r >= rimPx - RIM_BAND_PX ? 'rotate' : 'move';
    drag = { kind: kind, id: ev.pointerId, dx: pr.x - p.mm.x, dy: pr.y - p.mm.y, a0: Math.atan2(dy, dx), rot0: num(pr.rotDeg, 0) };
    try { if (cv.setPointerCapture) cv.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
  }
  function onMove(ev) {
    if (!drag) return;
    if (drag.id !== undefined && ev.pointerId !== undefined && ev.pointerId !== drag.id) return;
    const cv = (typeof document !== 'undefined') && document.getElementById('cv-cross');
    if (!cv) { drag = null; return; }
    const p = localMm(ev, cv);
    if (!p) return;
    ev.preventDefault(); ev.stopPropagation();
    const pr = sm().protractor;
    if (!pr) { drag = null; return; }
    if (drag.kind === 'move') {
      setProtractor({ x: +(p.mm.x + drag.dx).toFixed(2), y: +(p.mm.y + drag.dy).toFixed(2) });
    } else {
      const c = toPx(pr.x, pr.y);
      if (!c) return;
      const a = Math.atan2(p.px.y - c.y, p.px.x - c.x);
      let deg = drag.rot0 + (a - drag.a0) * 180 / Math.PI;
      if (ev.shiftKey) deg = Math.round(deg);                   // F41: Shift = 1° steps
      deg = ((deg % 360) + 360) % 360;
      setProtractor({ rotDeg: +deg.toFixed(2) });
    }
  }
  function onUp(ev) {
    if (!drag) return;
    drag = null;
    if (ev) { ev.stopPropagation(); }
    const pr = sm().protractor;
    if (pr) {
      const snapped = snapCentre({ x: pr.x, y: pr.y, rotDeg: num(pr.rotDeg, 0) }, probeIndex());
      if (snapped.x !== pr.x || snapped.y !== pr.y) setProtractor(snapped);
    }
  }
  function onDbl(ev) {
    if (!tracing || !crossCanvas(ev.target)) return;
    ev.preventDefault(); ev.stopPropagation();
    finishTrace();
  }
  /** Attach the capture-phase document listeners once (never at load time — SPEC-v3 §1). */
  function bindDoc() {
    if (boundDoc || typeof document === 'undefined') return;
    boundDoc = true;
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('pointercancel', onUp, true);
    document.addEventListener('dblclick', onDbl, true);
  }

  // ------------------------------------------------------------------ the ADJUST SCALE window (F41 + F42)
  function iconButton(key) {
    const def = SHAPES[key];
    const b = UT.dom.h('button', {
      class: 'btn sm-icon', type: 'button', title: t(def.label), 'aria-label': t(def.label),
      dataset: { shape: key }, html: ICON_SVG[key] || '',
      onclick: function () { shape(key); },
    });
    return b;
  }
  function buildBody() {
    const dom = UT.dom;
    // 1 — the mm/px scrollbar (utman_software f024: ◀ [thumb] ▶)
    const range = dom.h('input', {
      class: 'sm-range', type: 'range', min: '0', max: '1', step: '0.001',
      value: String(mmToSlider(sm().mmPerPx)), 'aria-label': t('mm per pixel'),
      oninput: function () { setMmPerPx(sliderToMm(range.value)); },
    });
    const nudge = function (d) { setMmPerPx(sliderToMm(clamp(num(range.value, 0.5) + d, 0, 1))); };
    const scroll = dom.h('div', { class: 'sm-scroll' }, [
      dom.h('button', { class: 'btn sm-arrow', type: 'button', title: t('Finer scale'), 'aria-label': t('Finer scale'), onclick: function () { nudge(-0.02); } }, '◀'),
      range,
      dom.h('button', { class: 'btn sm-arrow', type: 'button', title: t('Coarser scale'), 'aria-label': t('Coarser scale'), onclick: function () { nudge(0.02); } }, '▶'),
    ]);
    // 2 — the icon strip: eight canned outlines + OK
    const icons = SHAPE_KEYS.map(iconButton);
    const okBtn = dom.h('button', {
      class: 'btn sm-icon sm-ok', type: 'button', title: t('Close the traced boundary'), i18n: 'OK',
      onclick: function () { if (tracing) finishTrace(); else say('LEFT mouse button/drag to move the UT Probe'); },
    });
    const iconRow = dom.h('div', { class: 'sm-icons' }, icons.concat([okBtn]));
    // 3 — the four green buttons (f024/f028/f032)
    const capBtn = dom.button('Capture', function () { capture(); });
    const picBtn = dom.button('Load Pic', function () { loadPicture(); });
    const pipeBtn = dom.button('Pipe', function () { pipe(); });
    const protBtn = dom.button('Protractor', function () { protractor(); });
    const btnRow = dom.h('div', { class: 'sm-btns' }, [capBtn, picBtn, pipeBtn, protBtn]);
    // 4 — v3-only controls (SPEC NOTE 2): the numeric mm/px field, Trace, and the F42 graduations
    const numFld = dom.h('input', {
      class: 'fld-input sm-num', type: 'number', min: String(MM_PER_PX_MIN), max: String(MM_PER_PX_MAX), step: '0.01',
      value: String(sig3(num(sm().mmPerPx, 0.5))), 'aria-label': t('mm per pixel'),
      onchange: function () { setMmPerPx(numFld.value); },
    });
    const traceBtn = dom.button('Trace', function () { if (tracing) finishTrace(); else startTrace(); });
    const magChk = dom.h('input', { class: 'fld-input', type: 'checkbox', 'aria-label': t('Skip graduations'), onchange: function () { magnify(magChk.checked); } });
    magChk.checked = !!sm().magnify;
    const gradFld = dom.h('input', {
      class: 'fld-input sm-num', type: 'number', min: String(GRAD_STEP_MIN), max: String(GRAD_STEP_MAX), step: '1',
      value: String(num(sm().gradStepMm, 5)), 'aria-label': t('Graduation step in mm'),
      onchange: function () { setGradStep(gradFld.value); },
    });
    const hint = dom.h('div', { class: 'sm-hint' });
    const extra = dom.h('div', { class: 'sm-extra' }, [
      dom.h('span', { i18n: 'mm/px' }), numFld,
      traceBtn,
      dom.h('label', { class: 'sm-chk' }, [magChk, dom.h('span', { i18n: 'Skip graduations' })]),
      gradFld, dom.h('span', { i18n: 'mm' }),
      hint,
    ]);
    ui = { range: range, num: numFld, grad: gradFld, magChk: magChk, traceBtn: traceBtn, protBtn: protBtn, pipeBtn: pipeBtn, icons: icons, hint: hint };
    return dom.h('div', { class: 'sm-panel' }, [scroll, iconRow, btnRow, extra]);
  }
  /** Mirror the authoritative state onto the panel controls (never writes state). */
  function syncUi() {
    if (!ui || typeof document === 'undefined') return;
    const s = sm();
    const mm = sig3(num(s.mmPerPx, 0.5));
    if (ui.range && document.activeElement !== ui.range) ui.range.value = String(mmToSlider(mm));
    if (ui.num && document.activeElement !== ui.num) ui.num.value = String(mm);
    if (ui.grad && document.activeElement !== ui.grad) ui.grad.value = String(num(s.gradStepMm, 5));
    if (ui.magChk) ui.magChk.checked = !!s.magnify;
    if (ui.traceBtn) { ui.traceBtn.classList.toggle('on', !!tracing); ui.traceBtn.textContent = t(tracing ? 'Close' : 'Trace'); ui.traceBtn.dataset.i18n = tracing ? 'Close' : 'Trace'; }
    if (ui.protBtn) ui.protBtn.classList.toggle('on', !!s.protractor);
    if (ui.icons) for (const b of ui.icons) { b.classList.toggle('on', b.dataset.shape === lastShape); const lab = SHAPES[b.dataset.shape] && SHAPES[b.dataset.shape].label; if (lab) { b.title = t(lab); b.setAttribute('aria-label', t(lab)); } }
    if (ui.hint) {
      const n = (s.outline || []).length;
      ui.hint.textContent = tracing
        ? t('{n} points — double-click or OK to close', { n: (tracing || []).length })
        : (n >= 3 ? t('Boundary: {n} points', { n: n }) : t('Load a picture or pick a shape, then Trace'));
    }
  }
  /**
   * Where the window opens: docked to a CORNER of the sheet, as in utman_software f024 — but the BOTTOM
   * left one (QA r3 #1, SPEC NOTE 13). The original's panel sits at the top-left because its drawings are
   * placed further down the sheet; ours grow down and to the right from the sheet's 0,0, which 60 puts in
   * the top-left corner of #cv-cross, so a panel there buries exactly what the mode is for — the ok-demo
   * letters, a protractor dropped on a probe near x = 0, the first canned outline.
   * Our EPOCH panel docks to the left of #cv-cross, so the frame's screen coordinates would bury the
   * window under it — the RELATIVE position (just inside the sheet's corner) is what is reproduced.
   * @param {number} [h] the window's real height in px, when it has already been laid out
   * @returns {{x:number, y:number}} position in unscaled #app coordinates
   */
  function firstPos(h) {
    const winH = num(h, 0) > 0 ? num(h, 0) : WIN_H_EST;
    const fallback = { x: 12, y: 116 };
    if (typeof document === 'undefined') return fallback;
    const cv = document.getElementById('cv-cross');
    const app = document.getElementById('app');
    if (!cv || !app || !cv.getClientRects().length) return fallback;
    const k = (UT.dom && typeof UT.dom.scale === 'function' && UT.dom.scale()) || 1;
    const a = app.getBoundingClientRect(), r = cv.getBoundingClientRect();
    const top = (r.top - a.top) / k, bottom = (r.bottom - a.top) / k;
    return {
      x: Math.max(WIN_GAP_PX, Math.round((r.left - a.left) / k) + WIN_GAP_PX),
      y: Math.max(WIN_GAP_PX, Math.round(Math.max(top + WIN_GAP_PX, bottom - winH - WIN_GAP_PX))),
    };
  }
  /**
   * Park the window on the sheet's bottom-left corner once its real height is known (QA r3 #1). Runs on
   * every show until it has managed it with a laid-out canvas, and never fights a window the user has
   * dragged somewhere else.
   * @returns {boolean} true when the window was (re)positioned
   */
  function placeWin() {
    if (winPlaced || !winApi || typeof document === 'undefined') return false;
    const el = winApi.el;
    if (!el || !el.getClientRects || !el.getClientRects().length) return false;
    const cv = document.getElementById('cv-cross');
    if (!cv || !cv.getClientRects().length) return false;      // no layout yet: try again on the next show
    const at = firstPos(el.offsetHeight);
    el.style.left = at.x + 'px';
    el.style.top = at.y + 'px';
    winPlaced = true;
    return true;
  }
  /** Create the ADJUST SCALE window on first use (never at load time — SPEC-v3 §1). */
  function ensureWin() {
    if (winApi) return winApi;
    if (typeof document === 'undefined' || !UT.dom || typeof UT.dom.win !== 'function') return null;
    UT.dom.injectCss('scalemode', css);
    const at = firstPos();
    winApi = UT.dom.win({
      name: 'scale', title: 'ADJUST SCALE', x: at.x, y: at.y, w: 286,
      content: function () { return buildBody(); },
    });
    syncUi();
    return winApi;
  }
  /** Show the panel WITHOUT touching the mode — the path enter() uses, so the two never recurse. */
  function openWin() { const w = ensureWin(); if (w) { w.show(); placeWin(); syncUi(); } return w; }
  /**
   * Open the ADJUST SCALE window, entering Scale Mode first (F41: opening it from the Scale Mode menu is
   * the documented way in, so the sheet, the rulers and DISABLED.scale come with it — QA r1 #3).
   * @returns {object|null} the dom.win api
   */
  function open() { ensureOn(); return openWin(); }
  /** Close (hide) the ADJUST SCALE window. @returns {object|null} the dom.win api */
  function close() { if (winApi) winApi.hide(); return winApi; }
  /** True while the ADJUST SCALE window is on screen. */
  function isOpen() { return !!(winApi && winApi.isOpen()); }
  /** Open or close the ADJUST SCALE window. @returns {object|null} the dom.win api */
  function toggle() { return isOpen() ? close() : open(); }

  // 90-app reaches this module through has('scalemode.window') / toggleWindowOf('scalemode.window')
  // (SPEC-v3 §1) — a stable proxy, so property access alone never touches the DOM (SPEC NOTE 1).
  const windowProxy = {
    name: 'scale',
    open: open, close: close, toggle: toggle, isOpen: isOpen,
    show() { return open(); },
    hide() { return close(); },
    /** The live dom.win element once the window exists, else null. */
    get el() { return winApi ? winApi.el : null; },
  };

  // ------------------------------------------------------------------ mode lifecycle (F41)
  /** True while Scale Mode is active. */
  function on() { return !!sm().on; }
  /**
   * Enter Scale Mode: the white sheet with mm rulers plus the ADJUST SCALE window (F41).
   * @param {{specimenOpts?:object}} [opts] forwarded to UT.modes.enter('scale', …)
   * @returns {boolean} true when the mode was entered
   */
  function enter(opts) {
    const o = opts || {};
    if (!UT.modes || typeof UT.modes.enter !== 'function') return false;
    const was = !!sm().on;
    entering = true;
    patch({ on: true }, { noRender: true });
    try {
      UT.modes.enter('scale', Object.assign({ silentUI: true }, o));
    } catch (e) {
      if (!was) patch({ on: false }, { noRender: true });
      console.error('[UT.scalemode] enter', e);
      return false;
    } finally { entering = false; cancelSync(); }
    // QA r2 #1: 80 rebuilt the mode from `scaleMode.outline` alone, which has no room for a ring's inner
    // loop — put the cached ring straight back, so a traced pipe survives exit → re-enter (SPEC NOTE 5).
    restoreRing();
    // Entering by hand is not the F53 demo: mark whatever 80 built (mode 'scale' defaults to the OK
    // letters) as already seen, so the protractor is shown only for a demo somebody else loaded.
    autoSpec = st().specimen || null;
    bindDoc();
    openWin();
    return true;
  }
  /**
   * The single way in (SPEC NOTE 9): every menu item, panel control and test-API call that turns Scale Mode
   * on goes through here, so `scaleMode.on`, `state.mode === 'scale'`, the DISABLED.scale enable matrix and
   * the ADJUST SCALE panel can never disagree.
   * @returns {boolean} true when Scale Mode is on afterwards
   */
  function ensureOn() {
    if (sm().on && st().mode === 'scale') { bindDoc(); openWin(); return true; }
    return enter();
  }
  /** Arm the panel for a call that has ALREADY entered the mode through applyShape()/applyPolygon(). */
  function armUi() { bindDoc(); openWin(); }
  /**
   * Leave Scale Mode and return to the weld screen (F41). The protractor overlay goes with it;
   * the picture, the outline and the F42 magnify flag stay (SPEC NOTE 7).
   * @returns {boolean} true when Scale Mode had been active
   */
  function exit() {
    const was = !!sm().on;
    tracing = null; drag = null; autoSpec = null;
    patch({ on: false, protractor: null }, { noRender: true });
    close();
    syncUi();
    if (UT.modes && typeof UT.modes.exit === 'function' && st().mode === 'scale') {
      try { UT.modes.exit(); } catch (e) { console.error('[UT.scalemode] exit', e); }
    } else if (typeof UT.requestRender === 'function') { UT.requestRender(); }
    cancelSync();
    return was;
  }

  // ------------------------------------------------------------------ mode ↔ flag sync (SPEC NOTE 11)
  /**
   * Reconcile `scaleMode.on` with the mode controller, and show F53's protractor on the `ok-demo` splash.
   * Deferred off the 'state' bus with setTimeout(0), so no listener ever sees a nested UT.set.
   */
  function syncMode() {
    syncPending = false;
    if (entering) return;
    const s = st();
    if (s.mode === 'scale') {
      if (!sm().on) patch({ on: true }, { noRender: true });
      bindDoc();
      restoreRing();                 // QA r2 #1: a material change rebuilt the mode and dropped the ring
      const spec = s.specimen;
      // F53: 'with the probe on the "K" and the protractor shown' — however the demo was loaded
      if (spec && spec.id === 'ok-demo' && spec !== autoSpec) {
        autoSpec = spec;
        openWin();
        if (!sm().protractor) protractor(true);
      }
      syncUi();
    } else if (sm().on) {
      autoSpec = null;
      patch({ on: false, protractor: null }, { noRender: true });
      close();
      syncUi();
    } else if (autoSpec) { autoSpec = null; }
  }
  /** Queue one syncMode() when the mode and the flag have drifted apart. */
  function scheduleSync() {
    if (syncPending || entering || typeof setTimeout !== 'function') return;
    const s = st();
    const need = s.mode === 'scale'
      ? (!sm().on || ringLost() || !!(s.specimen && s.specimen.id === 'ok-demo' && s.specimen !== autoSpec))
      : (!!sm().on || !!autoSpec);
    if (!need) return;
    syncPending = true;
    const my = ++syncToken;
    setTimeout(function () { if (my === syncToken) syncMode(); }, 0);
  }
  /** Drop any queued syncMode() — enter() and exit() have just settled the mode themselves. */
  function cancelSync() { syncToken++; syncPending = false; }

  // panel mirror: state can change from menus, scenarios and the test API, never the other way round here
  if (UT.bus && typeof UT.bus.on === 'function') {
    UT.bus.on('state', function () { scheduleSync(); if (isOpen()) syncUi(); });
    UT.bus.on('lang', function () { if (isOpen()) syncUi(); });
  }

  UT.scalemode = {
    css,
    windowName: 'scale',
    get window() { return windowProxy; },
    shapes: SHAPE_KEYS.slice(),
    on, enter, ensureOn, exit,
    open, close, toggle, isOpen,
    loadPicture, clearPicture, capture,
    setMmPerPx, trace, startTrace, addTracePoint, finishTrace, clearTrace,
    shape, pipe, protractor, setProtractor,
    magnify, setGradStep,
    // pure helpers (also exercised by __selftest)
    sig3, signedArea, normaliseOutline, offsetInward, snapCentre, sliderToMm, mmToSlider, bbox, sameLoop,
    /**
     * Module self-test — pure helpers only, never touches the DOM (SPEC-v3 §1).
     * @returns {string[]} failure strings, empty when the module is healthy
     */
    __selftest() {
      const f = [];
      const near = function (a, b, tol) { return Math.abs(a - b) <= (tol === undefined ? 1e-6 : tol); };
      if (typeof css !== 'string' || !css.length || css.indexOf('</') >= 0) f.push('css string');
      if (UT.scalemode.windowName !== 'scale') f.push('window name');
      if (!UT.scalemode.window || UT.scalemode.window.name !== 'scale' || typeof UT.scalemode.window.toggle !== 'function') f.push('window proxy');
      if (typeof UT.scalemode.on !== 'function') f.push('on()');
      // 3 significant figures
      if (sig3(0.123456) !== 0.123 || sig3(1.23456) !== 1.23 || sig3(0) !== 0) f.push('sig3 ' + sig3(0.123456));
      // slider ↔ mm/px round trip over the full 0.05…5 range
      for (const mm of [0.05, 0.1, 0.5, 1, 5]) { if (!near(sliderToMm(mmToSlider(mm)), mm, Math.max(0.001, mm * 0.005))) f.push('slider ' + mm + '→' + sliderToMm(mmToSlider(mm))); }
      if (sliderToMm(-1) !== MM_PER_PX_MIN || sliderToMm(9) !== MM_PER_PX_MAX) f.push('slider clamp');
      // outline cleaning
      const sq = [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 20 }, { x: 0, y: 20 }];
      const cleaned = normaliseOutline(sq.concat([{ x: 0, y: 20 }, { x: 0, y: 0 }]));
      if (!cleaned || cleaned.length !== 4) f.push('normaliseOutline ' + (cleaned ? cleaned.length : 'null'));
      if (normaliseOutline([{ x: 0, y: 0 }, { x: 1, y: 0 }]) !== null) f.push('normaliseOutline short');
      if (normaliseOutline([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }]) !== null) f.push('normaliseOutline collinear');
      // QA r3 #2: outlines are clamped to ±COORD_MAX and thinned to MAX_OUTLINE_PTS, never truncated
      const huge = normaliseOutline([{ x: -1e9, y: -1e9 }, { x: 1e9, y: -1e9 }, { x: 1e9, y: 1e9 }, { x: -1e9, y: 1e9 }]);
      if (!huge || huge.length !== 4) f.push('normaliseOutline clamp length');
      else { const hb = bbox(huge); if (hb.xMin !== -COORD_MAX || hb.xMax !== COORD_MAX || hb.yMin !== -COORD_MAX || hb.yMax !== COORD_MAX) f.push('normaliseOutline clamp ' + JSON.stringify(hb)); }
      const ring = [];
      for (let i = 0; i < 5000; i++) { const a = (i / 5000) * Math.PI * 2; ring.push({ x: +(60 + 55 * Math.cos(a)).toFixed(3), y: +(30 + 25 * Math.sin(a)).toFixed(3) }); }
      const thin = normaliseOutline(ring);
      if (!thin || thin.length > MAX_OUTLINE_PTS + 1 || thin.length < MAX_OUTLINE_PTS / 2) f.push('normaliseOutline cap ' + (thin ? thin.length : 'null'));
      else { const tb = bbox(thin); if (!near(tb.xMin, 5, 0.5) || !near(tb.xMax, 115, 0.5) || !near(tb.yMax, 55, 0.5)) f.push('normaliseOutline decimate ' + JSON.stringify(tb)); }
      if (decimate([1, 2, 3], 5).length !== 3) f.push('decimate short');
      if (decimate([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 4).length > 5) f.push('decimate long');
      // inward offset (F41 Pipe)
      const inner = offsetInward(sq, 5);
      if (!inner || inner.length !== 4) f.push('offsetInward');
      else {
        const b = bbox(inner);
        if (!near(b.xMin, 5, 1e-3) || !near(b.xMax, 55, 1e-3) || !near(b.yMin, 5, 1e-3) || !near(b.yMax, 15, 1e-3)) f.push('offsetInward box ' + JSON.stringify(b));
        if ((signedArea(inner) > 0) !== (signedArea(sq) > 0)) f.push('offsetInward winding');
      }
      if (offsetInward(sq, 12) !== null) f.push('offsetInward too thick');   // 20 mm tall, 12 mm wall collapses
      // reversed winding must offset inward just the same
      const rev = sq.slice().reverse();
      const innerRev = offsetInward(rev, 5);
      if (!innerRev || !near(bbox(innerRev).xMin, 5, 1e-3) || !near(bbox(innerRev).yMax, 15, 1e-3)) f.push('offsetInward reversed');
      // protractor snap (8 mm)
      if (snapCentre({ x: 104, y: 3, rotDeg: 7 }, { x: 100, y: 0 }).x !== 100) f.push('snap inside 8 mm');
      if (snapCentre({ x: 112, y: 0, rotDeg: 0 }, { x: 100, y: 0 }).x !== 112) f.push('snap outside 8 mm');
      if (snapCentre({ x: 104, y: 3, rotDeg: 7 }, { x: 100, y: 0 }).rotDeg !== 7) f.push('snap keeps rotation');
      // QA r2 #1: the ring cache is matched to scaleMode.outline through sameLoop()
      if (!sameLoop(sq, sq.map(function (p) { return { x: p.x + 0.005, y: p.y }; }))) f.push('sameLoop tolerance');
      if (sameLoop(sq, sq.map(function (p) { return { x: p.x + 0.5, y: p.y }; }))) f.push('sameLoop moved');
      if (sameLoop(sq, sq.slice(0, 3)) || sameLoop(sq, null) || sameLoop([], [])) f.push('sameLoop length');
      if (sameLoop(sq, [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 20 }, { x: NaN, y: 20 }])) f.push('sameLoop NaN');
      // canned outlines all build a legal polygon with a flat top at y = 0 (SPEC NOTE 3)
      if (SHAPE_KEYS.length !== 8) f.push('shape count ' + SHAPE_KEYS.length);
      for (const k of SHAPE_KEYS) {
        const def = SHAPES[k];
        if (!def) { f.push('shape ' + k); continue; }
        if (def.spec) { if (def.spec !== 'ok-demo') f.push('shape spec ' + k); continue; }
        const pts = def.loops ? def.loops()[0].pts : def.pts();
        const norm = normaliseOutline(pts);
        if (!norm) { f.push('shape outline ' + k); continue; }
        if (!ICON_SVG[k]) f.push('shape icon ' + k);
        const bb = bbox(norm);
        if (!near(bb.yMin, 0, 1e-6) || !(bb.h > 0) || !(bb.w > 0)) f.push('shape box ' + k + ' ' + JSON.stringify(bb));
        if (def.loops) {
          const ls = def.loops();
          if (ls.length !== 2 || !ls[1].hole || !offsetInward(ls[0].pts, 1)) f.push('shape loops ' + k);
        }
      }
      return f;
    },
  };

  // ------------------------------------------------------------------ test API (§7; this module CREATES it)
  Object.assign(UT.test, {
    scale: {
      /** V3-41: enter Scale Mode and open ADJUST SCALE. @returns {boolean} */
      enter: function (opts) { return enter(opts); },
      /** Leave Scale Mode. @returns {boolean} */
      exit: function () { return exit(); },
      /** Set the sheet scale in mm per CSS pixel. @returns {number} */
      setMmPerPx: function (v) { return setMmPerPx(v); },
      /** Import a picture from a data: URL (or open the picker with no argument). @returns {Promise} */
      loadPicture: function (src) { return loadPicture(src); },
      /** Build the polygon specimen from a traced boundary. @returns {object|null} */
      trace: function (pts) { return trace(pts); },
      /** Show / hide / toggle the protractor. @returns {object|null} */
      protractor: function (show) { return protractor(show); },
      /** Load a canned outline by key. @returns {object|null} */
      shape: function (key) { return shape(key); },
      /** F41 Pipe: ring the current outline. @returns {object|null} */
      pipe: function (wallMm) { return pipe(wallMm); },
      /** F42: toggle the magnified skip graduations. @returns {boolean} */
      magnify: function (v) { return magnify(v); },
      /** F42: set the graduation pitch in mm. @returns {number} */
      gradStep: function (mm) { return setGradStep(mm); },
      /**
       * Diagnostic snapshot — never carries the picture data URL (§2). `ring` is the cached ring of
       * SPEC NOTE 5: inside Scale Mode `restoreRing()` guarantees the specimen really carries it, and it is
       * dropped the moment `scaleMode.outline` stops describing it.
       * @returns {{on:boolean, mmPerPx:number, gradStepMm:number, magnify:boolean, outline:number,
       *   picture:({name:string,w:number,h:number}|null), protractor:(object|null), tracing:(number|null),
       *   winOpen:boolean, shape:(string|null), ring:boolean}}
       */
      state: function () {
        pruneRing();                 // QA r2 #1: `ring` never outlives the outline it belongs to
        const s = sm();
        return {
          on: !!s.on,
          mmPerPx: num(s.mmPerPx, 0.5),
          gradStepMm: num(s.gradStepMm, 5),
          magnify: !!s.magnify,
          outline: (s.outline || []).length,
          picture: s.picture ? { name: s.picture.name, w: s.picture.w, h: s.picture.h } : null,
          protractor: s.protractor ? { x: s.protractor.x, y: s.protractor.y, rotDeg: num(s.protractor.rotDeg, 0) } : null,
          tracing: tracing ? tracing.length : null,
          winOpen: isOpen(),
          shape: lastShape,
          ring: !!lastLoops,
        };
      },
    },
  });
})(window.UT = window.UT || {});
