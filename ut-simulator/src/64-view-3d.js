/* 64-view-3d.js — "3D Pipe" / "3D Plate" floating window: software-rendered 3-D view of the
 * specimen (SPEC §7.6, §14.11, §15.6). Painter's algorithm, flat shading, ≤ 400 faces, Canvas 2D only.
 *
 * World frame used by the mesh (millimetres):
 *   X = axial (= cross-section x, weld centre-line at 0), Y = up, Z = toward the viewer (before rotation).
 *   Pipe: a surface point at along-weld position z sits at angle φ = 2π·z/C from 12 o'clock
 *   (Y up), i.e. (a, r·cosφ, r·sinφ). Plate: z maps to world Z = z − L/2 on the top face (Y = 0).
 * View: rotate by yaw about Y, then by pitch about X, then perspective-project onto the canvas.
 */
// SPEC NOTES
// - Window: created in init() via UT.dom.win({name:'pipe3d'}); on its FIRST show it is snapped to the
//   bottom-right corner of the viewport (8 px margin, the reference position, SPEC §7 "3D Pipe (bottom-right)")
//   using the measured window size; afterwards the user's dragged position is kept. Canvas #cv-3d 260 × 200 px.
//   Title '3D Pipe' for spec.pipe, '3D Plate' otherwise (updated on 'state').
// - Visibility model: `display.pipe3d` = "the user wants the 3-D window"; it is a PIPE feature (§1.1, §8.8:
//   PIPE "shows/hides the 3D window"; no plate reference screenshot has one). The window is shown iff
//   display.pipe3d && specimen && (specimen.pipe || (mode === 'weld' && plateWanted)), where `plateWanted`
//   = the user explicitly asked for it while on a plate: open() (lessons, app), or a lone 'display' patch
//   that flips pipe3d false → true (Options ▸ Show 3D Window); cleared by close() / ✕ / pipe3d → false.
//   So a plate boots without the window, PIPE on shows '3D Pipe', PIPE off hides it again (display.pipe3d
//   stays true = the preference survives), and a boot restore never conjures a '3D Plate' window.
//   The 'state' listener only calls show()/hide() when the predicate CHANGES (the app's own open()/close()
//   calls never flap). open() sets display.pipe3d = true and shows; close() (and ✕) sets it to false.
// - Mesh: cylinder of length 220 mm (axial), 40 segments; the weld ring is a lighter band of capWidth
//   raised by max(2.5 mm, 2 % of OD) so it reads as a cap; both ends are open (annulus + inner bore),
//   the near end therefore shows the wall like the original's cut-away. Plate: slab 220 (x) × L (z) × T.
// - Plan-view z window: taken from UT.views.plan.transform {zTop, windowMm} when available, otherwise
//   zTop = clamp(probe.z − 30, 0, L − 65), window 65 mm (SPEC §14.2). Drawn as a black dotted rectangle
//   on the surface: z ∈ [zTop, zTop + window], axial ∈ ±min(60, L3d/2 − 15) mm.
// - Defects: 3 px red arcs (pipe) / patches (plate) at their z extent and bbox x centre; hidden when
//   display.hide or defect.visible === false. Probe: 16 mm green outlined square (2 px) at (x, z), rotated by skew.
// - Interaction: left-drag rotates (0.5° per px), wheel zooms ×1.1 per notch (0.4 … 4), double-click resets
//   to yaw −58°, pitch 26°, zoom 1. Rotation redraws the window directly (no global render).
// - Also exports toPx(x, z) (surface point → canvas px, null when facing away) and fit() (no-op) to
//   honour the §15.6 view contract; toMm() is not invertible for a 3-D view and returns null.
(function (UT) {
  'use strict';
  const M = UT.math;
  UT.views = UT.views || {};

  const CANVAS_W = 260, CANVAS_H = 200;
  const LENGTH_3D = 220;              // mm, axial length of the drawn pipe / slab
  const SEGMENTS = 40;                // cylinder facets
  const DEFAULT_VIEW = { yaw: -58, pitch: 26, zoom: 1 };
  const WINDOW_AXIAL_HALF = 60;       // mm, half axial extent of the plan-view window rectangle
  const PROBE_SIZE = 16;              // mm, side of the probe square
  const GRAZE_COS = 0.06;             // overlays vanish when the surface normal is nearly perpendicular to the view
  const COL = {
    outer: [0.88, 0.88, 0.88],
    weld: [1.0, 1.0, 1.0],
    end: [0.62, 0.70, 0.62],
    bore: [0.34, 0.34, 0.34],
    bottom: [0.60, 0.60, 0.60],
    side: [0.72, 0.72, 0.72],
  };
  const LIGHT = norm3([-0.45, 0.7, 0.6]);   // view-space light direction (upper-left, toward the viewer)

  let canvas = null, win = null;
  let view = Object.assign({}, DEFAULT_VIEW);
  let lastShown = null;      // last value of the visibility predicate acted upon
  let plateWanted = false;   // user explicitly asked for the window while on a plate (see header notes)
  let lastFlag = null;       // last seen display.pipe3d (to detect the explicit false → true flip)
  let placed = false;        // window snapped to the bottom-right corner on its first show
  let drag = null;
  let lastProj = null;       // projection of the last draw (for toPx)

  // ------------------------------------------------------------------ small vector helpers
  function norm3(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function sub3(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross3(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }

  // ------------------------------------------------------------------ geometry descriptor
  /**
   * Describe the 3-D body for a specimen: pipe (cylinder) or slab.
   * @param {object|null} spec  UT.state.specimen
   * @returns {object} {kind:'pipe'|'plate', L (along-weld length / circumference), len (axial), R, Ri, Rw, hw, bump, T, W}
   */
  function bodyOf(spec) {
    const weld = spec && spec.weld;
    const hw = weld && weld.type !== 'none' && weld.capWidth ? weld.capWidth / 2 : 0;
    if (spec && spec.pipe) {
      const od = spec.pipe.od || 168.3;
      const wt = Math.min(spec.pipe.wt || spec.T || 20, od / 2 - 1);
      const R = od / 2;
      const bump = Math.max(2.5, 0.02 * od);
      return { kind: 'pipe', L: spec.pipe.circumference || spec.L || Math.PI * od, len: LENGTH_3D, R, Ri: R - wt, Rw: R + bump, hw, bump, T: wt, W: LENGTH_3D };
    }
    const T = spec && spec.T ? spec.T : 20;
    const L = spec && spec.L ? spec.L : 300;
    const ex = spec && spec.extents;
    const W = ex ? Math.min(LENGTH_3D, Math.max(60, ex.xMax - ex.xMin)) : LENGTH_3D;
    const cx = ex ? (ex.xMin + ex.xMax) / 2 : 0;
    return { kind: 'plate', L, len: W, R: 0, Ri: 0, Rw: 0, hw, bump: hw ? 2.5 : 0, T, W, cx: spec && spec.kind === 'weld' ? 0 : cx };
  }

  /** Radius of the outer surface at axial position a (weld band is raised). */
  function radiusAt(body, a) { return body.kind === 'pipe' ? (Math.abs(a) <= body.hw ? body.Rw : body.R) : 0; }

  /**
   * World point (and outward normal) on the scanning surface at axial a and along-weld z, lifted by `lift` mm.
   * @returns {{p:number[], n:number[]}}
   */
  function surfacePoint(body, a, z, lift) {
    const l = lift || 0;
    if (body.kind === 'pipe') {
      const phi = 2 * Math.PI * z / body.L;
      const r = radiusAt(body, a) + l;
      const c = Math.cos(phi), s = Math.sin(phi);
      return { p: [a, r * c, r * s], n: [0, c, s] };
    }
    const y = (Math.abs(a - (body.cx || 0)) <= body.hw ? body.bump : 0) + l;
    return { p: [a, y, z - body.L / 2], n: [0, 1, 0] };
  }

  // ------------------------------------------------------------------ mesh builders
  function quad(p0, p1, p2, p3, col, n) {
    const normal = n || norm3(cross3(sub3(p1, p0), sub3(p3, p0)));
    return { pts: [p0, p1, p2, p3], n: normal, col };
  }

  /** Cylinder mesh (outer bands, weld ring steps, inner bore, end annuli). ≤ 8·SEGMENTS faces. */
  function buildPipeMesh(body) {
    const faces = [];
    const N = SEGMENTS, h = body.len / 2;
    const ring = function (a, r) { const out = []; for (let i = 0; i <= N; i++) { const ph = 2 * Math.PI * i / N; out.push([a, r * Math.cos(ph), r * Math.sin(ph)]); } return out; };
    const bands = body.hw > 0
      ? [[-h, -body.hw, body.R, COL.outer], [-body.hw, body.hw, body.Rw, COL.weld], [body.hw, h, body.R, COL.outer]]
      : [[-h, h, body.R, COL.outer]];
    for (const b of bands) {
      const r0 = ring(b[0], b[2]), r1 = ring(b[1], b[2]);
      for (let i = 0; i < N; i++) {
        const ph = 2 * Math.PI * (i + 0.5) / N;
        faces.push(quad(r0[i], r1[i], r1[i + 1], r0[i + 1], b[3], [0, Math.cos(ph), Math.sin(ph)]));
      }
    }
    if (body.hw > 0) {
      // weld ring side steps (R → Rw) at ±hw
      for (const s of [-1, 1]) {
        const a = s * body.hw;
        const ri = ring(a, body.R), ro = ring(a, body.Rw);
        for (let i = 0; i < N; i++) faces.push(quad(ri[i], ro[i], ro[i + 1], ri[i + 1], COL.weld, [s, 0, 0]));
      }
    }
    // inner bore (normals toward the axis)
    const b0 = ring(-h, body.Ri), b1 = ring(h, body.Ri);
    for (let i = 0; i < N; i++) {
      const ph = 2 * Math.PI * (i + 0.5) / N;
      faces.push(quad(b0[i], b1[i], b1[i + 1], b0[i + 1], COL.bore, [0, -Math.cos(ph), -Math.sin(ph)]));
    }
    // end annuli
    for (const s of [-1, 1]) {
      const a = s * h;
      const ri = ring(a, body.Ri), ro = ring(a, body.R);
      for (let i = 0; i < N; i++) faces.push(quad(ri[i], ro[i], ro[i + 1], ri[i + 1], COL.end, [s, 0, 0]));
    }
    return faces;
  }

  /** Slab mesh: top (3 bands when welded), cap steps, bottom and 4 sides. */
  function buildPlateMesh(body) {
    const faces = [];
    const cx = body.cx || 0;
    const x0 = cx - body.len / 2, x1 = cx + body.len / 2;
    const z0 = -body.L / 2, z1 = body.L / 2;
    const T = body.T;
    const P = function (x, y, z) { return [x, y, z]; };
    const top = function (xa, xb, y, col) { faces.push(quad(P(xa, y, z0), P(xa, y, z1), P(xb, y, z1), P(xb, y, z0), col, [0, 1, 0])); };
    if (body.hw > 0) {
      top(x0, cx - body.hw, 0, COL.outer);
      top(cx - body.hw, cx + body.hw, body.bump, COL.weld);
      top(cx + body.hw, x1, 0, COL.outer);
      faces.push(quad(P(cx - body.hw, 0, z0), P(cx - body.hw, 0, z1), P(cx - body.hw, body.bump, z1), P(cx - body.hw, body.bump, z0), COL.weld, [-1, 0, 0]));
      faces.push(quad(P(cx + body.hw, 0, z0), P(cx + body.hw, body.bump, z0), P(cx + body.hw, body.bump, z1), P(cx + body.hw, 0, z1), COL.weld, [1, 0, 0]));
    } else top(x0, x1, 0, COL.outer);
    faces.push(quad(P(x0, -T, z0), P(x1, -T, z0), P(x1, -T, z1), P(x0, -T, z1), COL.bottom, [0, -1, 0]));
    faces.push(quad(P(x0, 0, z1), P(x0, -T, z1), P(x1, -T, z1), P(x1, 0, z1), COL.end, [0, 0, 1]));      // near end (z = L)
    faces.push(quad(P(x0, 0, z0), P(x1, 0, z0), P(x1, -T, z0), P(x0, -T, z0), COL.end, [0, 0, -1]));     // far end (z = 0)
    faces.push(quad(P(x1, 0, z0), P(x1, 0, z1), P(x1, -T, z1), P(x1, -T, z0), COL.side, [1, 0, 0]));
    faces.push(quad(P(x0, 0, z0), P(x0, -T, z0), P(x0, -T, z1), P(x0, 0, z1), COL.side, [-1, 0, 0]));
    return faces;
  }

  function buildMesh(body) { return body.kind === 'pipe' ? buildPipeMesh(body) : buildPlateMesh(body); }

  /** Bounding radius of the body about its centre (for the camera distance / fit). */
  function boundingRadius(body) {
    if (body.kind === 'pipe') return Math.hypot(body.len / 2, body.Rw);
    return Math.hypot(body.len / 2, body.L / 2, body.T);
  }

  // ------------------------------------------------------------------ projection
  /**
   * Build a projection for the current view: rotate (yaw about Y, pitch about X) then perspective.
   * @param {{yaw:number,pitch:number,zoom:number}} v
   * @param {number} w canvas width (px)  @param {number} h canvas height (px)  @param {number} rb bounding radius (mm)
   * @param {number[]} [centre] world centre offset subtracted before rotation
   */
  function makeProjection(v, w, h, rb, centre) {
    const cy = Math.cos(M.deg2rad(v.yaw)), sy = Math.sin(M.deg2rad(v.yaw));
    const cp = Math.cos(M.deg2rad(v.pitch)), sp = Math.sin(M.deg2rad(v.pitch));
    const dCam = rb * 3.6;
    const f = 0.56 * Math.min(w, h) * (v.zoom || 1) * dCam / rb;
    const c = centre || [0, 0, 0];
    const rot = function (p) {
      const x = p[0] - c[0], y = p[1] - c[1], z = p[2] - c[2];
      const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
      return [x1, y * cp - z1 * sp, y * sp + z1 * cp];
    };
    const rotN = function (n) {
      const x1 = n[0] * cy + n[2] * sy, z1 = -n[0] * sy + n[2] * cy;
      return [x1, n[1] * cp - z1 * sp, n[1] * sp + z1 * cp];
    };
    const proj = function (q) { const s = f / Math.max(1e-3, dCam - q[2]); return { x: w / 2 + q[0] * s, y: h / 2 - q[1] * s, z: q[2] }; };
    return { rot, rotN, proj, dCam, cam: [0, 0, dCam], f, w, h };
  }

  /** Shade a base colour [r,g,b] (0..1) by a view-space normal → css colour. */
  function shade(col, nView) {
    const k = 0.42 + 0.62 * Math.max(0, dot3(nView, LIGHT));
    const r = Math.round(255 * Math.min(1, col[0] * k)), g = Math.round(255 * Math.min(1, col[1] * k)), b = Math.round(255 * Math.min(1, col[2] * k));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  /**
   * Transform, cull, sort and paint a mesh (painter's algorithm).
   * @returns {number} faces painted
   */
  function paintMesh(ctx, faces, P) {
    const items = [];
    for (const f of faces) {
      const q = f.pts.map(P.rot);
      const cen = [0, 0, 0];
      for (const p of q) { cen[0] += p[0] / q.length; cen[1] += p[1] / q.length; cen[2] += p[2] / q.length; }
      const n = P.rotN(f.n);
      if (dot3(n, sub3(P.cam, cen)) <= 0) continue;   // back face
      items.push({ depth: cen[2], px: q.map(P.proj), colour: shade(f.col, n) });
    }
    items.sort(function (a, b) { return a.depth - b.depth; });
    for (const it of items) {
      ctx.beginPath();
      ctx.moveTo(it.px[0].x, it.px[0].y);
      for (let i = 1; i < it.px.length; i++) ctx.lineTo(it.px[i].x, it.px[i].y);
      ctx.closePath();
      ctx.fillStyle = it.colour;
      ctx.strokeStyle = it.colour;
      ctx.lineWidth = 0.8;
      ctx.fill();
      ctx.stroke();
    }
    return items.length;
  }

  /** Project a surface point; null when it faces away from the camera. */
  function projectSurface(P, sp) {
    const q = P.rot(sp.p);
    const n = P.rotN(sp.n);
    if (dot3(n, norm3(sub3(P.cam, q))) <= GRAZE_COS) return null;   // facing away or grazing the silhouette
    return P.proj(q);
  }

  /** Stroke a polyline of surface points, splitting it into visible runs. */
  function strokeSurfaceLine(ctx, P, pts, style) {
    ctx.save();
    ctx.strokeStyle = style.colour;
    ctx.lineWidth = style.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (style.dash) ctx.setLineDash(style.dash);
    let open = false;
    ctx.beginPath();
    for (const sp of pts) {
      const q = projectSurface(P, sp);
      if (!q) { open = false; continue; }
      if (!open) { ctx.moveTo(q.x, q.y); open = true; } else ctx.lineTo(q.x, q.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // ------------------------------------------------------------------ z window / overlays
  /** Plan-view z window {zTop, windowMm} (from UT.views.plan when available, else SPEC §14.2). */
  function zWindow(state, L) {
    const plan = UT.views.plan;
    const tf = plan && plan.transform;
    if (tf && typeof tf.zTop === 'number' && tf.windowMm > 0 && typeof tf.L === 'number' && Math.abs(tf.L - L) < 1e-6) {
      return { zTop: tf.zTop, windowMm: tf.windowMm };
    }
    const windowMm = Math.min(65, L);
    const pz = state && state.probe ? state.probe.z : 0;
    return { zTop: M.clamp(pz - 30, 0, Math.max(0, L - windowMm)), windowMm };
  }

  /** Sample points along the surface from (a0,z0) to (a1,z1) (straight in the (a, z) chart), every ≤ 2 mm. */
  function surfaceSamples(body, a0, z0, a1, z1, lift) {
    const n = Math.max(1, Math.ceil(Math.hypot(a1 - a0, z1 - z0) / 2));
    const out = [];
    for (let i = 0; i <= n; i++) out.push(surfacePoint(body, a0 + (a1 - a0) * i / n, z0 + (z1 - z0) * i / n, lift));
    return out;
  }

  function drawZWindow(ctx, P, body, state) {
    const zw = zWindow(state, body.L);
    const z0 = zw.zTop, z1 = zw.zTop + zw.windowMm;
    const ah = Math.min(WINDOW_AXIAL_HALF, body.len / 2 - 15);
    const cx = body.cx || 0;
    const style = { colour: '#000', width: 1.5, dash: [2, 3] };
    strokeSurfaceLine(ctx, P, surfaceSamples(body, cx - ah, z0, cx - ah, z1, 0.6), style);
    strokeSurfaceLine(ctx, P, surfaceSamples(body, cx + ah, z0, cx + ah, z1, 0.6), style);
    strokeSurfaceLine(ctx, P, surfaceSamples(body, cx - ah, z0, cx + ah, z0, 0.6), style);
    strokeSurfaceLine(ctx, P, surfaceSamples(body, cx - ah, z1, cx + ah, z1, 0.6), style);
  }

  /** Along-weld span of a defect, unwrapped so zTo ≥ zFrom (pipe wrap). */
  function defectSpan(d, body) {
    let z0 = d.zFrom, z1 = d.zTo;
    if (z1 < z0) { if (body.kind === 'pipe') z1 += body.L; else { const t = z0; z0 = z1; z1 = t; } }
    return { z0, z1 };
  }

  function drawDefects(ctx, P, body, state) {
    if (!state || !state.defects || (state.display && state.display.hide)) return;
    const cx = body.cx || 0;
    for (const d of state.defects) {
      if (!d || d.visible === false || !d.pts || !d.pts.length) continue;
      const b = UT.specimens.bbox(d.pts);
      const span = defectSpan(d, body);
      const a = M.clamp(b.cx, cx - body.len / 2 + 2, cx + body.len / 2 - 2);
      if (body.kind === 'pipe') {
        strokeSurfaceLine(ctx, P, surfaceSamples(body, a, span.z0, a, span.z1, 0.8), { colour: '#e00000', width: 3 });
      } else {
        const wx = Math.max(4, b.w);
        const a0 = M.clamp(a - wx / 2, cx - body.len / 2, cx + body.len / 2), a1 = M.clamp(a + wx / 2, cx - body.len / 2, cx + body.len / 2);
        const corners = [surfacePoint(body, a0, span.z0, 0.5), surfacePoint(body, a1, span.z0, 0.5), surfacePoint(body, a1, span.z1, 0.5), surfacePoint(body, a0, span.z1, 0.5)];
        const q = corners.map(function (sp) { return projectSurface(P, sp); });
        if (q.some(function (p) { return !p; })) continue;
        ctx.save();
        ctx.fillStyle = '#e00000';
        ctx.strokeStyle = '#e00000';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(q[0].x, q[0].y);
        for (let i = 1; i < 4; i++) ctx.lineTo(q[i].x, q[i].y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  function drawProbe(ctx, P, body, state) {
    const probe = state && state.probe;
    if (!probe) return;
    const cx = body.cx || 0;
    const a = M.clamp(probe.x, cx - body.len / 2, cx + body.len / 2);
    const z = probe.z || 0;
    const half = PROBE_SIZE / 2;
    const sk = M.deg2rad(probe.skew || 0);
    const cs = Math.cos(sk), sn = Math.sin(sk);
    const corners = [[-half, -half], [half, -half], [half, half], [-half, half]].map(function (o) {
      const da = o[0] * cs - o[1] * sn, dz = o[0] * sn + o[1] * cs;
      return surfacePoint(body, a + da, z + dz, 0.8);
    });
    const centre = projectSurface(P, surfacePoint(body, a, z, 0.8));
    if (!centre) return;
    const q = corners.map(function (sp) { return P.proj(P.rot(sp.p)); });
    ctx.save();
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(q[0].x, q[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(q[i].x, q[i].y);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  // ------------------------------------------------------------------ drawing entry point
  /**
   * Draw the 3-D view of state.specimen into the window canvas.
   * @param {object} frame  UT.frame (unused except for liveness; tolerated null)
   * @param {object} state  UT.state
   */
  function draw(frame, state) {
    if (!canvas) return;
    const ctx = UT.dom.fitCanvas(canvas, CANVAS_W, CANVAS_H);
    const sz = { w: CANVAS_W, h: CANVAS_H };
    ctx.save();
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, sz.w, sz.h);
    const spec = state && state.specimen;
    if (spec) {
      const body = bodyOf(spec);
      const centre = body.kind === 'pipe' ? [0, 0, 0] : [body.cx || 0, -body.T / 2, 0];
      const P = makeProjection(view, sz.w, sz.h, boundingRadius(body), centre);
      lastProj = { P, body };
      paintMesh(ctx, buildMesh(body), P);
      drawZWindow(ctx, P, body, state);
      drawDefects(ctx, P, body, state);
      drawProbe(ctx, P, body, state);
    } else lastProj = null;
    ctx.fillStyle = '#ffff00';
    ctx.font = 'bold 13px Segoe UI, Arial, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText('UTsim', 6, 4);
    ctx.restore();
  }

  function redraw() { draw(UT.frame, UT.state); }

  // ------------------------------------------------------------------ window / visibility
  /**
   * Visibility predicate (pure): pipes whenever display.pipe3d; plates only in weld mode AND when the
   * user explicitly asked (`wantPlate`, defaults to the module flag `plateWanted`).
   * @param {object} [state]
   * @param {boolean} [wantPlate]
   */
  function shouldShow(state, wantPlate) {
    const s = state || UT.state;
    const wp = wantPlate === undefined ? plateWanted : !!wantPlate;
    return !!(s && s.display && s.display.pipe3d && s.specimen && (s.specimen.pipe || (s.mode === 'weld' && wp)));
  }

  function titleFor(state) { return state && state.specimen && state.specimen.pipe ? '3D Pipe' : '3D Plate'; }

  function syncVisibility(force) {
    if (!win) return;
    const want = shouldShow(UT.state);
    win.setTitle(titleFor(UT.state));
    if (want === lastShown && !force) return;
    lastShown = want;
    if (want && !win.isOpen()) win.show();
    else if (!want && win.isOpen()) win.hide();
  }

  function onState(ev) {
    const keys = (ev && ev.keys) || [];
    if (keys.indexOf('display') >= 0) {
      const flag = !!(UT.state.display && UT.state.display.pipe3d);
      if (flag !== lastFlag) {
        // a lone display patch flipping pipe3d on = Options ▸ Show 3D Window (explicit); bulk patches
        // (File ▸ New, restores) are not a request for a '3D Plate' window
        if (flag && keys.length === 1) plateWanted = true;
        if (!flag) plateWanted = false;
        lastFlag = flag;
      }
    }
    if (keys.indexOf('display') >= 0 || keys.indexOf('mode') >= 0 || keys.indexOf('specimen') >= 0 || keys.indexOf('weldOpts') >= 0) syncVisibility(false);
  }

  /** First show: snap the window to the bottom-right corner of the viewport (reference position). */
  function placeDefault(api) {
    if (placed || !api || !api.el || typeof window === 'undefined') return;
    placed = true;
    const r = api.el.getBoundingClientRect();
    api.el.style.left = Math.max(0, window.innerWidth - r.width - 8) + 'px';
    api.el.style.top = Math.max(0, window.innerHeight - r.height - 8) + 'px';
  }

  function attachMouse(cv) {
    cv.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      drag = { x: e.clientX, y: e.clientY, yaw: view.yaw, pitch: view.pitch };
      if (cv.setPointerCapture) { try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } }
      cv.classList.add('grabbing');
      e.preventDefault();
    });
    cv.addEventListener('pointermove', function (e) {
      if (!drag) return;
      view.yaw = drag.yaw + (e.clientX - drag.x) * 0.5;
      view.pitch = M.clamp(drag.pitch + (e.clientY - drag.y) * 0.5, -89, 89);
      redraw();
    });
    const end = function () { drag = null; cv.classList.remove('grabbing'); };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('wheel', function (e) {
      e.preventDefault();
      const k = Math.pow(1.1, -(e.deltaY || 0) / 100);
      view.zoom = M.clamp(view.zoom * k, 0.4, 4);
      redraw();
    }, { passive: false });
    cv.addEventListener('dblclick', function (e) { e.preventDefault(); setView(DEFAULT_VIEW); });
  }

  /**
   * Create the floating window and canvas, subscribe to 'render' / 'state'.
   * @param {HTMLCanvasElement} [existingCanvas]  optional canvas to draw into instead of the window's own
   */
  function init(existingCanvas) {
    UT.dom.injectCss('pipe3d', pipe3d.css);
    if (existingCanvas) {
      canvas = existingCanvas;
    } else {
      canvas = UT.dom.h('canvas', { id: 'cv-3d', width: CANVAS_W, height: CANVAS_H, style: { width: CANVAS_W + 'px', height: CANVAS_H + 'px', display: 'block', background: '#000' } });
      const iw = (typeof window !== 'undefined' && window.innerWidth) || 1280;
      const ih = (typeof window !== 'undefined' && window.innerHeight) || 720;
      win = UT.dom.win({
        name: 'pipe3d', title: titleFor(UT.state), x: Math.max(0, iw - CANVAS_W - 10), y: Math.max(0, ih - CANVAS_H - 31),
        content: canvas,
        onShow: function (api) { placeDefault(api); redraw(); },
        onClose: function () {
          lastShown = false;
          plateWanted = false;
          if (UT.state.display && UT.state.display.pipe3d) UT.setIn('display', { pipe3d: false }, { noRender: true });
        },
      });
      pipe3d.window = win;
      // §11 / §15.6: #cv-3d must resolve by id right after boot (hidden is fine). core's dom.win only
      // appends the element on first show(), so attach it now while it keeps its display:none —
      // without show()/hide(), which would run onShow and emit win:show/win:hide.
      if (typeof document !== 'undefined' && win.el && !win.el.parentNode) {
        (document.getElementById('app') || document.body).appendChild(win.el);
      }
    }
    attachMouse(canvas);
    UT.bus.on('render', function (f) { if (!win || win.isOpen()) draw(f, UT.state); });
    UT.bus.on('state', onState);
    lastFlag = !!(UT.state.display && UT.state.display.pipe3d);   // boot value is not an explicit request
    syncVisibility(false);
    return pipe3d;
  }

  /** Show the window (marks display.pipe3d = true). */
  function open() {
    if (!win) init();
    lastShown = true;
    plateWanted = true;
    if (!(UT.state.display && UT.state.display.pipe3d)) UT.setIn('display', { pipe3d: true }, { noRender: true });
    win.setTitle(titleFor(UT.state));
    if (!win.isOpen()) win.show(); else redraw();
    return win;
  }

  /** Hide the window (marks display.pipe3d = false). */
  function close() {
    if (!win) return null;
    lastShown = false;
    plateWanted = false;
    if (win.isOpen()) win.hide();
    if (UT.state.display && UT.state.display.pipe3d) UT.setIn('display', { pipe3d: false }, { noRender: true });
    return win;
  }

  function toggle() { return win && win.isOpen() ? close() : open(); }

  /**
   * Set the camera: partial {yaw, pitch, zoom} (degrees / factor) and redraw.
   * @returns {{yaw:number,pitch:number,zoom:number}} the current view
   */
  function setView(v) {
    const o = v || {};
    if (typeof o.yaw === 'number') view.yaw = o.yaw;
    if (typeof o.pitch === 'number') view.pitch = M.clamp(o.pitch, -89, 89);
    if (typeof o.zoom === 'number') view.zoom = M.clamp(o.zoom, 0.4, 4);
    if (canvas) redraw();
    return Object.assign({}, view);
  }

  /** Canvas px of the scanning-surface point (x, z) in the last drawn projection; null if not drawn / facing away. */
  function toPx(x, z) {
    if (!lastProj) return null;
    return projectSurface(lastProj.P, surfacePoint(lastProj.body, x, z, 0));
  }
  /** Not invertible for a 3-D view. */
  function toMm() { return null; }
  /** Nothing to refit: the canvas has a fixed 260 × 200 CSS size; a redraw suffices. */
  function fit() { if (canvas) redraw(); }

  // ------------------------------------------------------------------ self test (headless-safe)
  function __selftest() {
    const f = [];
    const spec = UT.specimens.pipeWeld({ od: 168.3, wt: 20 });
    const body = bodyOf(spec);
    if (body.kind !== 'pipe' || Math.abs(body.R - 84.15) > 1e-6 || Math.abs(body.Ri - 64.15) > 1e-6) f.push('pipe body ' + JSON.stringify(body));
    if (Math.abs(body.L - Math.PI * 168.3) > 1e-6) f.push('pipe circumference');
    const mesh = buildPipeMesh(body);
    if (mesh.length > 400) f.push('pipe faces ' + mesh.length + ' > 400');
    const plateSpec = UT.specimens.plateWeld({ T: 20 });
    const pb = bodyOf(plateSpec);
    if (pb.kind !== 'plate' || pb.T !== 20 || pb.L !== 300 || pb.len !== 220) f.push('plate body ' + JSON.stringify(pb));
    if (buildPlateMesh(pb).length > 400) f.push('plate faces');
    // surface point at z = 0 is 12 o'clock (top), z = C/4 is at the side
    const top = surfacePoint(body, 0, 0, 0);
    if (Math.abs(top.p[1] - body.Rw) > 1e-9 || Math.abs(top.p[2]) > 1e-9) f.push('12 o clock ' + JSON.stringify(top.p));
    const side = surfacePoint(body, 100, body.L / 4, 0);
    if (Math.abs(side.p[2] - body.R) > 1e-9 || Math.abs(side.p[1]) > 1e-6) f.push('3 o clock ' + JSON.stringify(side.p));
    // projection: identity view puts the axis along screen x, +Y up; the near side (Z>0) is closer to the camera
    const P = makeProjection({ yaw: 0, pitch: 0, zoom: 1 }, CANVAS_W, CANVAS_H, boundingRadius(body), [0, 0, 0]);
    const q = P.proj(P.rot([50, 0, 0]));
    if (!(q.x > CANVAS_W / 2 && Math.abs(q.y - CANVAS_H / 2) < 1e-9)) f.push('projection axis ' + JSON.stringify(q));
    const up = P.proj(P.rot([0, 50, 0]));
    if (!(up.y < CANVAS_H / 2)) f.push('projection up');
    // default view: the +X (near) end is closer to the camera and lower on screen than the −X end
    const D = makeProjection(DEFAULT_VIEW, CANVAS_W, CANVAS_H, boundingRadius(body), [0, 0, 0]);
    const near = D.rot([110, 0, 0]), far = D.rot([-110, 0, 0]);
    if (!(near[2] > far[2] && near[1] < far[1])) f.push('default view orientation');
    // culling: the surface point facing the camera is visible, the one on the back is not
    const front = projectSurface(D, surfacePoint(body, 0, body.L / 4, 0));
    const back = projectSurface(D, surfacePoint(body, 0, 3 * body.L / 4, 0));
    if (!front || back) f.push('culling front/back');
    // z window fallback formula
    const zw = zWindow({ probe: { z: 150 } }, 300);
    if (UT.views.plan && UT.views.plan.transform) { if (!(zw.windowMm > 0)) f.push('zWindow plan'); } else if (zw.zTop !== 120 || zw.windowMm !== 65) f.push('zWindow ' + JSON.stringify(zw));
    const zw2 = zWindow({ probe: { z: 5 } }, 300);
    if (zw2.zTop < 0) f.push('zWindow clamp');
    const span = defectSpan({ zFrom: 500, zTo: 20 }, body);
    if (Math.abs(span.z1 - (20 + body.L)) > 1e-9) f.push('defect wrap');
    if (shade([1, 1, 1], [0, 0, 1]).indexOf('rgb(') !== 0) f.push('shade');
    if (shouldShow({ display: { pipe3d: true }, specimen: plateSpec, mode: 'v1' }, true)) f.push('shouldShow v1 plate');
    if (!shouldShow({ display: { pipe3d: true }, specimen: spec, mode: 'aut' })) f.push('shouldShow pipe aut');
    if (shouldShow({ display: { pipe3d: true }, specimen: plateSpec, mode: 'weld' }, false)) f.push('shouldShow weld plate not requested');
    if (!shouldShow({ display: { pipe3d: true }, specimen: plateSpec, mode: 'weld' }, true)) f.push('shouldShow weld plate requested');
    if (shouldShow({ display: { pipe3d: false }, specimen: spec, mode: 'weld' })) f.push('shouldShow pipe display off');
    return f;
  }

  const pipe3d = {
    init, draw, open, close, toggle, setView, toPx, toMm, fit, __selftest,
    window: null,
    /** Current camera (read-only copy). */
    get view() { return Object.assign({}, view); },
    /** Pure helpers (exposed for tests). */
    helpers: { bodyOf, surfacePoint, buildMesh, makeProjection, projectSurface, zWindow, defectSpan, shouldShow, boundingRadius },
    css: [
      '.win[data-win=pipe3d] .win-body { padding: 0; background: #000; line-height: 0; }',
      '#cv-3d { display: block; width: 260px; height: 200px; background: #000; cursor: grab; touch-action: none; }',
      '#cv-3d.grabbing { cursor: grabbing; }',
    ].join('\n'),
  };
  UT.views.pipe3d = pipe3d;
})(window.UT = window.UT || {});
