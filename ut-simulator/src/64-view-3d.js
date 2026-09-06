/* 64-view-3d.js — "3D Pipe" / "3D Plate" floating window: software-rendered 3-D view of the
 * specimen (SPEC §7.6, §14.11, §15.6; SPEC-v2 §1 owner ui-3: F1 shapes + pointer events).
 * Painter's algorithm, flat shading, ≤ 400 faces per body, Canvas 2D only.
 *
 * World frame used by the mesh (millimetres):
 *   X = axial (= cross-section x, weld centre-line at 0), Y = up (= −cross-section y), Z = toward the viewer.
 *   Pipe: a surface point at along-weld position z sits at angle φ = 2π·z/C from 12 o'clock
 *   (Y up), i.e. (a, r·cosφ, r·sinφ). Plate: z maps to world Z = z − L/2 on the top face (Y = 0).
 *   Nozzle (set-on branch): the weld runs AROUND the branch, so z maps to the angle ψ = 2π·z/L about the
 *   vertical branch axis (X = r·sinψ, Z = r·cosψ) and the cross-section x is the radial offset from the
 *   branch mid-wall radius rm = (branchOd − branchWt)/2 (x = 0 = the web/branch wall centre line).
 * View: rotate by yaw about Y, then by pitch about X, then perspective-project onto the canvas.
 */
// SPEC NOTES
// - Window: created in init() via UT.dom.win({name:'pipe3d'}); on its FIRST show it is snapped to the
//   bottom-right corner of the viewport (8 px margin, the reference position, SPEC §7 "3D Pipe (bottom-right)")
//   using the measured window size; afterwards the user's dragged position is kept. Canvas #cv-3d 260 × 200 px.
//   Title (i18n keys via dom.win/setTitle): '3D Pipe' for spec.pipe, '3D Nozzle' for a nozzle prep (plate or pipe
//   base), '3D T-joint' for fillet-t on a plate, '3D Block' for calibration blocks (FBH), '3D Plate' otherwise.
// - Visibility model: `display.pipe3d` = "the user wants the 3-D window"; it is a PIPE feature (§1.1, §8.8:
//   PIPE "shows/hides the 3D window"; no plate reference screenshot has one). The window is shown iff
//   display.pipe3d && specimen && (specimen.pipe || specimen.nozzle || ((mode === 'weld' || specimen.id === 'fbh')
//   && plateWanted)), where `plateWanted` = the user explicitly asked for it while on a plate/block: open()
//   (lessons, app), or a lone 'display' patch that flips pipe3d false → true (Options ▸ Show 3D Window); cleared by
//   close() / ✕ / pipe3d → false. So a plate boots without the window, PIPE on shows '3D Pipe', PIPE off hides it
//   again (display.pipe3d stays true = the preference survives), a boot restore never conjures a '3D Plate' window.
//   v2: a NOZZLE prep is inherently 3-D and is treated exactly like PIPE (auto-shown while display.pipe3d);
//   the FBH block (spec.id 'fbh', SPEC-v2 §3.8) can be shown on request like a plate in weld mode.
//   The 'state' listener only calls show()/hide() when the predicate CHANGES (the app's own open()/close()
//   calls never flap). open() sets display.pipe3d = true and shows; close() (and ✕) sets it to false.
// - Mesh: cylinder of length 220 mm (axial), 40 segments; the butt-weld ring is a lighter band of capWidth
//   (centred at weld.capCentre — K / J preps show the shifted cap) raised by max(2.5 mm, 2 % of OD) so it reads
//   as a cap; both ends are open (annulus + inner bore), the near end therefore shows the wall like the original's
//   cut-away. Plate: slab 220 (x) × L (z) × T; blocks (kind 'block', e.g. the FBH block) use their full width ≤ 300.
// - F1 shapes (SPEC-v2 §5.1, §3.13): 'single-bevel' / 'j' = butt weld with the cap band offset by capCentre;
//   'single-v-backing' (or backing:true) = a thin bar 25 × 6 mm (from spec.weld.backing) under the root: a slab under
//   a plate, a ring inside the bore of a pipe (visible through the open ends); 'fillet-t' = base plate + vertical web
//   (webT × 60 mm from spec.weld.web) + two fillet prisms (leg = weld.leg) on a plate, or a radial ring web with
//   fillet frusta around a pipe; 'nozzle' = set-on branch of OD weldOpts.branchOd (spec.nozzle.branchOd) and wall
//   branchWt rising 60 mm from the plate (flat base) or from the pipe (exact cylinder/cylinder saddle
//   Y = √(R² − Z²)) with outer and inner fillet frusta. One turn of the branch = z 0…L (the 2-D model's along-weld
//   axis), so defect arcs are scaled by π·branchOd/L. 'none' = flat slab / plain cylinder.
//   FBH block (SPEC-v2 §3.8 says 64 MAY ignore it; the brief asks for it): every spec.fbhs entry is drawn as a
//   translucent drill shaft from the bottom face up to its depth with a light flat bottom and a '⌀d' tag (X-ray
//   style, after the opaque block) — reference reflectors, not defects, so display.hide does not hide them.
// - Probe on the web (probe.surface 'web', fillet-t / nozzle): drawn on the selected web / branch face at
//   height leg + probe.x above the plate (or pipe) surface, like UT.specimens.scanSurfaceAt.
// - Plan-view z window: taken from UT.views.plan.transform {zTop, windowMm} when available, otherwise
//   zTop = clamp(probe.z − 30, 0, L − 65), window 65 mm (SPEC §14.2). Drawn as a black dotted rectangle
//   on the surface: z ∈ [zTop, zTop + window], axial ∈ ±min(60, L3d/2 − 15) mm (an annular sector on a nozzle).
// - Defects: 3 px red arcs (pipe, nozzle) / patches (plate) at their z extent and bbox x centre; hidden when
//   display.hide or defect.visible === false. Probe: 16 mm green outlined square (2 px) at (x, z), rotated by skew.
// - Interaction (Pointer Events, SPEC-v2 §5.4): one pointer drags = rotate (0.5° per design px — positions come
//   from UT.dom.localPos so the responsive scale k is compensated), two pointers = pinch zoom, wheel = zoom ×1.1 per
//   notch (0.4 … 4), double-click resets to yaw −58°, pitch 26°, zoom 1. Rotation redraws the window directly
//   (no global render, no UT.set).
// - Also exports toPx(x, z) (surface point → canvas px, null when facing away) and fit() (no-op) to
//   honour the §15.6 view contract; toMm() is not invertible for a 3-D view and returns null.
(function (UT) {
  'use strict';
  const M = UT.math;
  UT.views = UT.views || {};

  const CANVAS_W = 260, CANVAS_H = 200;
  const LENGTH_3D = 220;              // mm, axial length of the drawn pipe / slab
  const BLOCK_MAX = 300;              // mm, calibration blocks are drawn at their full width up to this
  const SEGMENTS = 40;                // cylinder facets
  const SEGMENTS_2 = 24;              // facets of the secondary bodies (branch, ring web, backing ring)
  const WEB_H_DEFAULT = 60;           // mm, web / branch height when the specimen does not say
  const DEFAULT_VIEW = { yaw: -58, pitch: 26, zoom: 1 };
  const WINDOW_AXIAL_HALF = 60;       // mm, half axial extent of the plan-view window rectangle
  const PROBE_SIZE = 16;              // mm, side of the probe square
  const GRAZE_COS = 0.06;             // overlays vanish when the surface normal is nearly perpendicular to the view
  const ROT_PER_PX = 0.5;             // degrees of rotation per design pixel of drag
  const COL = {
    outer: [0.88, 0.88, 0.88],
    weld: [1.0, 1.0, 1.0],
    end: [0.62, 0.70, 0.62],
    bore: [0.34, 0.34, 0.34],
    bottom: [0.60, 0.60, 0.60],
    side: [0.72, 0.72, 0.72],
    web: [0.80, 0.80, 0.82],
    backing: [0.50, 0.56, 0.78],      // bluish like SURFACE_COLOURS.backing (#0040ff) in the cross-section
    fbh: [0.25, 0.25, 0.30],
    fbhBottom: [0.95, 0.95, 0.80],
  };
  const LIGHT = norm3([-0.45, 0.7, 0.6]);   // view-space light direction (upper-left, toward the viewer)
  const SQ2 = Math.SQRT1_2;

  let canvas = null, win = null;
  let view = Object.assign({}, DEFAULT_VIEW);
  let lastShown = null;      // last value of the visibility predicate acted upon
  let plateWanted = false;   // user explicitly asked for the window while on a plate (see header notes)
  let lastFlag = null;       // last seen display.pipe3d (to detect the explicit false → true flip)
  let placed = false;        // window snapped to the bottom-right corner on its first show
  let drag = null;           // single-pointer rotation gesture
  let pinch = null;          // two-pointer zoom gesture
  const pointers = new Map();   // active pointerId → {x, y} in design px
  let lastProj = null;       // projection of the last draw (for toPx)

  // ------------------------------------------------------------------ small vector helpers
  function norm3(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function sub3(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function add3(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function mul3(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
  function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross3(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }

  // ------------------------------------------------------------------ geometry descriptor
  /** Height of a web polygon (cross-section y ≤ 0 above the plate) → mm above the surface. */
  function webHeightOf(poly) {
    let h = 0;
    for (const p of poly || []) h = Math.max(h, -p.y);
    return h > 0 ? h : WEB_H_DEFAULT;
  }

  /**
   * Describe the 3-D body for a specimen: pipe (cylinder) or slab, plus the v2 attachments.
   * @param {object|null} spec  UT.state.specimen
   * @returns {object} {kind:'pipe'|'plate', joint:'butt'|'fillet'|'nozzle'|'block'|'none', L (along-weld length /
   *   circumference), len (axial), R, Ri, Rw, hw, bump, T, W, cx, capCentre, backing:{hw,h}|null,
   *   web:{hw,leg,H}|null, nozzle:{rm,hw,leg,H,ro,ri}|null, fbhs:[]}
   */
  function bodyOf(spec) {
    const weld = spec && spec.weld;
    const prep = weld ? (weld.prep || weld.type || 'single-v') : 'none';
    const hasWeb = !!(weld && weld.web && weld.web.length);
    const isNozzle = !!(spec && spec.nozzle) || prep === 'nozzle';
    const butt = !!(weld && weld.type !== 'none' && prep !== 'none' && !hasWeb && !isNozzle && weld.capWidth);
    const hw = butt ? weld.capWidth / 2 : 0;
    const capCentre = butt && Number.isFinite(weld.capCentre) ? weld.capCentre : 0;
    let backing = null;
    if (weld && Array.isArray(weld.backing) && weld.backing.length >= 3) {
      const b = UT.specimens.bbox(weld.backing);
      backing = { hw: Math.max(1, b.w / 2), h: Math.max(1, b.h) };
    }
    const H = hasWeb ? webHeightOf(weld.web) : WEB_H_DEFAULT;
    const webT = weld && weld.webT > 0 ? weld.webT : ((spec && spec.nozzle && spec.nozzle.branchWt) || 12);
    const leg = weld && weld.leg > 0 ? weld.leg : +(0.7 * webT).toFixed(3);
    let web = null, nozzle = null;
    if (isNozzle) {
      const od = (spec && spec.nozzle && spec.nozzle.branchOd) || 114.3;
      const rm = Math.max(webT, (od - webT) / 2);
      nozzle = { rm, hw: webT / 2, leg, H, ro: rm + webT / 2, ri: Math.max(1, rm - webT / 2), od };
    } else if (hasWeb) web = { hw: webT / 2, leg, H };
    const joint = nozzle ? 'nozzle' : web ? 'fillet' : butt ? 'butt' : (spec && spec.kind === 'block' ? 'block' : 'none');
    if (spec && spec.pipe) {
      const od = spec.pipe.od || 168.3;
      const wt = Math.min(spec.pipe.wt || spec.T || 20, od / 2 - 1);
      const R = od / 2;
      const bump = Math.max(2.5, 0.02 * od);
      return { kind: 'pipe', joint, L: spec.pipe.circumference || spec.L || Math.PI * od, len: LENGTH_3D, R, Ri: R - wt, Rw: R + bump, hw, bump, T: wt, W: LENGTH_3D, cx: 0, capCentre, backing, web, nozzle, fbhs: [] };
    }
    const T = spec && spec.T ? spec.T : 20;
    const L = spec && spec.L ? spec.L : 300;
    const ex = spec && spec.extents;
    const isBlock = !!(spec && spec.kind === 'block');
    const W = ex ? Math.min(isBlock ? BLOCK_MAX : LENGTH_3D, Math.max(60, ex.xMax - ex.xMin)) : LENGTH_3D;
    const cx = ex ? (ex.xMin + ex.xMax) / 2 : 0;
    return { kind: 'plate', joint, L, len: W, R: 0, Ri: 0, Rw: 0, hw, bump: hw ? 2.5 : 0, T, W, cx: spec && spec.kind === 'weld' ? 0 : cx, capCentre, backing, web, nozzle, fbhs: (spec && spec.fbhs) || [] };
  }

  /** Radius of the outer surface at axial position a (butt-weld band is raised). */
  function radiusAt(body, a) { return body.kind === 'pipe' ? (Math.abs(a - body.capCentre) <= body.hw ? body.Rw : body.R) : 0; }

  /** Clamp a cross-section x to the drawn extent of the body (radial offset ≥ −rm + 1 on a nozzle). */
  function clampA(body, a, margin) {
    const m = margin || 0;
    if (body.nozzle) return M.clamp(a, -body.nozzle.rm + 1 + m, body.len / 2 - m);
    return M.clamp(a, body.cx - body.len / 2 + m, body.cx + body.len / 2 - m);
  }

  /** Height of the pipe surface above the axis at lateral offset Z (cylinder along X): √(R² − Z²), clamped. */
  function pipeTopY(body, Z) { return Math.sqrt(Math.max(0, body.R * body.R - Z * Z)); }

  /**
   * World point (and outward normal) on the scanning surface at cross-section x = a and along-weld z, lifted by `lift` mm.
   * @returns {{p:number[], n:number[]}}
   */
  function surfacePoint(body, a, z, lift) {
    const l = lift || 0;
    if (body.nozzle) {
      const r = Math.max(1, body.nozzle.rm + a);
      const psi = 2 * Math.PI * z / body.L;
      const X = body.cx + r * Math.sin(psi);
      let Z = r * Math.cos(psi);
      if (body.kind === 'pipe') {
        if (Math.abs(Z) >= body.R) Z = Math.sign(Z || 1) * body.R * 0.999;
        const Y = pipeTopY(body, Z);
        const n = norm3([0, Y, Z]);
        return { p: [X, Y + n[1] * l, Z + n[2] * l], n };
      }
      return { p: [X, l, Z], n: [0, 1, 0] };
    }
    if (body.kind === 'pipe') {
      const phi = 2 * Math.PI * z / body.L;
      const r = radiusAt(body, a) + l;
      const c = Math.cos(phi), s = Math.sin(phi);
      return { p: [a, r * c, r * s], n: [0, c, s] };
    }
    const y = (body.hw > 0 && Math.abs(a - (body.cx || 0) - body.capCentre) <= body.hw ? body.bump : 0) + l;
    return { p: [a, y, z - body.L / 2], n: [0, 1, 0] };
  }

  /**
   * World point on a web / branch face for a probe with surface 'web' (UT.specimens.scanSurfaceAt semantics):
   * `side` selects the face (+1 = +x / outer branch wall), `up` = distance up the web from the fillet's web toe.
   * @returns {{p:number[], n:number[], u:number[], v:number[]}|null} u = along the web (up), v = along the weld
   */
  function webPoint(body, side, up, z) {
    const w = body.nozzle || body.web;
    if (!w) return null;
    const s = side === -1 ? -1 : 1;
    const d = Math.max(0, up || 0);
    if (body.nozzle) {
      const psi = 2 * Math.PI * z / body.L;
      const r = Math.max(1, w.rm + s * w.hw);
      const sn = Math.sin(psi), cs = Math.cos(psi);
      const X = body.cx + r * sn, Z = r * cs;
      const yb = body.kind === 'pipe' ? pipeTopY(body, Math.min(Math.abs(Z), body.R * 0.999)) : 0;
      return { p: [X, yb + w.leg + d, Z], n: [s * sn, 0, s * cs], u: [0, 1, 0], v: [cs, 0, -sn] };
    }
    if (body.kind === 'pipe') {
      const phi = 2 * Math.PI * z / body.L;
      const r = body.R + w.leg + d;
      const c = Math.cos(phi), sn = Math.sin(phi);
      return { p: [s * w.hw, r * c, r * sn], n: [s, 0, 0], u: [0, c, sn], v: [0, -sn, c] };
    }
    return { p: [body.cx + s * w.hw, w.leg + d, z - body.L / 2], n: [s, 0, 0], u: [0, 1, 0], v: [0, 0, 1] };
  }

  // ------------------------------------------------------------------ mesh builders
  function quad(p0, p1, p2, p3, col, n) {
    const normal = n || norm3(cross3(sub3(p1, p0), sub3(p3, p0)));
    return { pts: [p0, p1, p2, p3], n: normal, col };
  }
  /** n-gon face with an explicit outward normal. */
  function poly(pts, col, n) { return { pts, n: n || norm3(cross3(sub3(pts[1], pts[0]), sub3(pts[pts.length - 1], pts[0]))), col }; }

  /** Ring of N+1 points about the X axis at axial a, radius r. */
  function ringX(a, r, N) { const out = []; for (let i = 0; i <= N; i++) { const ph = 2 * Math.PI * i / N; out.push([a, r * Math.cos(ph), r * Math.sin(ph)]); } return out; }

  /**
   * Band of revolution about the X axis between (a0, r0) and (a1, r1) with a profile normal (na, nr) (N facets).
   * Used for the ring web, its fillets and the backing ring of a pipe.
   */
  function bandX(faces, a0, r0, a1, r1, col, na, nr, N) {
    const q0 = ringX(a0, r0, N), q1 = ringX(a1, r1, N);
    for (let i = 0; i < N; i++) {
      const ph = 2 * Math.PI * (i + 0.5) / N;
      faces.push(quad(q0[i], q1[i], q1[i + 1], q0[i + 1], col, norm3([na, nr * Math.cos(ph), nr * Math.sin(ph)])));
    }
  }

  /** Cylinder mesh (outer bands, weld ring steps, inner bore, end annuli) + backing ring / ring web / branch. */
  function buildPipeMesh(body) {
    const faces = [];
    const N = SEGMENTS, h = body.len / 2, c = body.capCentre;
    const ring = function (a, r) { return ringX(a, r, N); };
    const bands = body.hw > 0
      ? [[-h, c - body.hw, body.R, COL.outer], [c - body.hw, c + body.hw, body.Rw, COL.weld], [c + body.hw, h, body.R, COL.outer]]
      : [[-h, h, body.R, COL.outer]];
    for (const b of bands) {
      const r0 = ring(b[0], b[2]), r1 = ring(b[1], b[2]);
      for (let i = 0; i < N; i++) {
        const ph = 2 * Math.PI * (i + 0.5) / N;
        faces.push(quad(r0[i], r1[i], r1[i + 1], r0[i + 1], b[3], [0, Math.cos(ph), Math.sin(ph)]));
      }
    }
    if (body.hw > 0) {
      // weld ring side steps (R → Rw) at capCentre ± hw
      for (const s of [-1, 1]) {
        const a = c + s * body.hw;
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
    if (body.backing) {
      // backing ring inside the bore under the root (SPEC-v2 §5.1 single-v-backing)
      const bk = body.backing, r = Math.max(1, body.Ri - bk.h), N2 = SEGMENTS_2;
      bandX(faces, -bk.hw, r, bk.hw, r, COL.backing, 0, -1, N2);
      bandX(faces, -bk.hw, r, -bk.hw, body.Ri, COL.backing, -1, 0, N2);
      bandX(faces, bk.hw, r, bk.hw, body.Ri, COL.backing, 1, 0, N2);
    }
    if (body.web) {
      // radial ring web (set-on T-joint around a pipe) with fillet frusta both sides
      const w = body.web, R = body.R, N2 = SEGMENTS_2;
      bandX(faces, w.hw, R + w.leg, w.hw, R + w.H, COL.web, 1, 0, N2);
      bandX(faces, -w.hw, R + w.leg, -w.hw, R + w.H, COL.web, -1, 0, N2);
      bandX(faces, -w.hw, R + w.H, w.hw, R + w.H, COL.web, 0, 1, N2);
      bandX(faces, w.hw + w.leg, R, w.hw, R + w.leg, COL.weld, SQ2, SQ2, N2);
      bandX(faces, -w.hw - w.leg, R, -w.hw, R + w.leg, COL.weld, -SQ2, SQ2, N2);
    }
    if (body.nozzle) buildBranch(faces, body);
    return faces;
  }

  /**
   * Set-on branch (nozzle) about the vertical axis through (cx, ·, 0): outer wall, bore, top annulus and the two
   * fillet frusta. On a pipe base the rings follow the exact cylinder/cylinder saddle Y = √(R² − Z²).
   */
  function buildBranch(faces, body) {
    const nz = body.nozzle, N2 = SEGMENTS_2;
    const baseY = body.kind === 'pipe' ? function (Z) { return pipeTopY(body, Math.min(Math.abs(Z), body.R * 0.999)); } : function () { return 0; };
    const topY = (body.kind === 'pipe' ? body.R : 0) + nz.H;
    const ringB = function (r, off, top) {
      const out = [];
      for (let i = 0; i <= N2; i++) {
        const psi = 2 * Math.PI * i / N2;
        const X = body.cx + r * Math.sin(psi), Z = r * Math.cos(psi);
        out.push([X, top ? topY : baseY(Z) + off, Z]);
      }
      return out;
    };
    const band = function (q0, q1, col, nf) {
      for (let i = 0; i < N2; i++) {
        const psi = 2 * Math.PI * (i + 0.5) / N2;
        faces.push(quad(q0[i], q1[i], q1[i + 1], q0[i + 1], col, nf(Math.sin(psi), Math.cos(psi))));
      }
    };
    band(ringB(nz.ro, nz.leg, false), ringB(nz.ro, 0, true), COL.web, function (s, c) { return [s, 0, c]; });          // outer wall
    band(ringB(nz.ri, nz.leg, false), ringB(nz.ri, 0, true), COL.bore, function (s, c) { return [-s, 0, -c]; });       // bore
    band(ringB(nz.ri, 0, true), ringB(nz.ro, 0, true), COL.end, function () { return [0, 1, 0]; });                    // top annulus
    band(ringB(nz.ro + nz.leg, 0, false), ringB(nz.ro, nz.leg, false), COL.weld, function (s, c) { return norm3([s, 1, c]); });      // outer fillet
    band(ringB(Math.max(0.5, nz.ri - nz.leg), 0, false), ringB(nz.ri, nz.leg, false), COL.weld, function (s, c) { return norm3([-s, 1, -c]); });   // inner fillet
  }

  /** Slab mesh: top (3 bands when welded), cap steps, bottom and 4 sides + backing bar / web + fillets / branch. */
  function buildPlateMesh(body) {
    const faces = [];
    const cx = body.cx || 0;
    const x0 = cx - body.len / 2, x1 = cx + body.len / 2;
    const z0 = -body.L / 2, z1 = body.L / 2;
    const T = body.T;
    const P = function (x, y, z) { return [x, y, z]; };
    const top = function (xa, xb, y, col) { if (xb > xa) faces.push(quad(P(xa, y, z0), P(xa, y, z1), P(xb, y, z1), P(xb, y, z0), col, [0, 1, 0])); };
    if (body.hw > 0) {
      const c = cx + body.capCentre;
      top(x0, c - body.hw, 0, COL.outer);
      top(c - body.hw, c + body.hw, body.bump, COL.weld);
      top(c + body.hw, x1, 0, COL.outer);
      faces.push(quad(P(c - body.hw, 0, z0), P(c - body.hw, 0, z1), P(c - body.hw, body.bump, z1), P(c - body.hw, body.bump, z0), COL.weld, [-1, 0, 0]));
      faces.push(quad(P(c + body.hw, 0, z0), P(c + body.hw, body.bump, z0), P(c + body.hw, body.bump, z1), P(c + body.hw, 0, z1), COL.weld, [1, 0, 0]));
    } else if (body.web) {
      // the plate top under the joint is covered by the web and the fillets
      top(x0, cx - body.web.hw - body.web.leg, 0, COL.outer);
      top(cx + body.web.hw + body.web.leg, x1, 0, COL.outer);
    } else top(x0, x1, 0, COL.outer);
    faces.push(quad(P(x0, -T, z0), P(x1, -T, z0), P(x1, -T, z1), P(x0, -T, z1), COL.bottom, [0, -1, 0]));
    faces.push(quad(P(x0, 0, z1), P(x0, -T, z1), P(x1, -T, z1), P(x1, 0, z1), COL.end, [0, 0, 1]));      // near end (z = L)
    faces.push(quad(P(x0, 0, z0), P(x1, 0, z0), P(x1, -T, z0), P(x0, -T, z0), COL.end, [0, 0, -1]));     // far end (z = 0)
    faces.push(quad(P(x1, 0, z0), P(x1, 0, z1), P(x1, -T, z1), P(x1, -T, z0), COL.side, [1, 0, 0]));
    faces.push(quad(P(x0, 0, z0), P(x0, -T, z0), P(x0, -T, z1), P(x0, 0, z1), COL.side, [-1, 0, 0]));
    if (body.backing) {
      // thin backing bar under the root: bottom, two long sides and two ends
      const bk = body.backing, bx0 = cx - bk.hw, bx1 = cx + bk.hw, yt = -T, yb = -T - bk.h;
      faces.push(quad(P(bx0, yb, z0), P(bx1, yb, z0), P(bx1, yb, z1), P(bx0, yb, z1), COL.backing, [0, -1, 0]));
      faces.push(quad(P(bx1, yt, z0), P(bx1, yt, z1), P(bx1, yb, z1), P(bx1, yb, z0), COL.backing, [1, 0, 0]));
      faces.push(quad(P(bx0, yt, z0), P(bx0, yb, z0), P(bx0, yb, z1), P(bx0, yt, z1), COL.backing, [-1, 0, 0]));
      faces.push(quad(P(bx0, yt, z1), P(bx0, yb, z1), P(bx1, yb, z1), P(bx1, yt, z1), COL.backing, [0, 0, 1]));
      faces.push(quad(P(bx0, yt, z0), P(bx1, yt, z0), P(bx1, yb, z0), P(bx0, yb, z0), COL.backing, [0, 0, -1]));
    }
    if (body.web) {
      // vertical web (webT × H) with a fillet prism each side; the end faces are one 6-gon (web + fillets)
      const w = body.web, hw = w.hw, leg = w.leg, H = w.H;
      faces.push(quad(P(cx + hw, leg, z0), P(cx + hw, leg, z1), P(cx + hw, H, z1), P(cx + hw, H, z0), COL.web, [1, 0, 0]));
      faces.push(quad(P(cx - hw, leg, z0), P(cx - hw, H, z0), P(cx - hw, H, z1), P(cx - hw, leg, z1), COL.web, [-1, 0, 0]));
      faces.push(quad(P(cx - hw, H, z0), P(cx - hw, H, z1), P(cx + hw, H, z1), P(cx + hw, H, z0), COL.side, [0, 1, 0]));
      faces.push(quad(P(cx + hw + leg, 0, z0), P(cx + hw + leg, 0, z1), P(cx + hw, leg, z1), P(cx + hw, leg, z0), COL.weld, [SQ2, SQ2, 0]));
      faces.push(quad(P(cx - hw - leg, 0, z0), P(cx - hw, leg, z0), P(cx - hw, leg, z1), P(cx - hw - leg, 0, z1), COL.weld, [-SQ2, SQ2, 0]));
      for (const s of [-1, 1]) {
        const z = s > 0 ? z1 : z0;
        faces.push(poly([P(cx - hw - leg, 0, z), P(cx + hw + leg, 0, z), P(cx + hw, leg, z), P(cx + hw, H, z), P(cx - hw, H, z), P(cx - hw, leg, z)], COL.end, [0, 0, s]));
      }
    }
    if (body.nozzle) buildBranch(faces, body);
    return faces;
  }

  function buildMesh(body) { return body.kind === 'pipe' ? buildPipeMesh(body) : buildPlateMesh(body); }

  /**
   * Translucent drill shafts of the FBH block: a short cylinder from the bottom face up to the hole depth with a
   * light flat bottom (the reflector). Drawn after the opaque block (X-ray style).
   */
  function buildFbhMesh(body) {
    const faces = [];
    const N = 10, cx = body.cx || 0, x0 = cx - body.len / 2, x1 = cx + body.len / 2;
    for (const f of body.fbhs || []) {
      if (!f || !Number.isFinite(f.x) || !Number.isFinite(f.y)) continue;
      const r = Math.max(1.2, (f.d || 2) / 2);
      const X = M.clamp(f.x, x0 + r, x1 - r), Z = 0;
      const yTop = -M.clamp(f.y, 1, body.T - 0.5), yBot = -body.T;
      const ring = function (y) { const out = []; for (let i = 0; i <= N; i++) { const ph = 2 * Math.PI * i / N; out.push([X + r * Math.sin(ph), y, Z + r * Math.cos(ph)]); } return out; };
      const rb = ring(yBot), rt = ring(yTop);
      for (let i = 0; i < N; i++) {
        const ph = 2 * Math.PI * (i + 0.5) / N;
        faces.push(Object.assign(quad(rb[i], rt[i], rt[i + 1], rb[i + 1], COL.fbh, [Math.sin(ph), 0, Math.cos(ph)]), { alpha: 0.45 }));
      }
      faces.push(Object.assign(poly(rt.slice(0, N), COL.fbhBottom, [0, 1, 0]), { alpha: 0.95, tag: 'fbh-bottom', fbh: f }));
    }
    return faces;
  }

  /** Bounding radius of the body about its centre (for the camera distance / fit). */
  function boundingRadius(body) {
    const H = body.nozzle ? body.nozzle.H : body.web ? body.web.H : 0;
    if (body.kind === 'pipe') return Math.hypot(body.len / 2, body.Rw + (body.web ? H : body.nozzle ? H / 2 : 0));
    const halfH = H ? (H + body.T) / 2 : body.T;
    return Math.hypot(body.len / 2, body.L / 2, halfH);
  }

  /** World centre the camera orbits (pipes: the axis; plates: mid-thickness; raised by half the web/branch height). */
  function centreOf(body) {
    const H = body.nozzle ? body.nozzle.H : body.web ? body.web.H : 0;
    if (body.kind === 'pipe') return [0, body.nozzle ? H / 2 : 0, 0];
    return [body.cx || 0, H ? (H - body.T) / 2 : -body.T / 2, 0];
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
   * @param {object} [opts] {noCull: paint back faces too (translucent tubes), alpha: default face alpha}
   * @returns {number} faces painted
   */
  function paintMesh(ctx, faces, P, opts) {
    const o = opts || {};
    const items = [];
    for (const f of faces) {
      const q = f.pts.map(P.rot);
      const cen = [0, 0, 0];
      for (const p of q) { cen[0] += p[0] / q.length; cen[1] += p[1] / q.length; cen[2] += p[2] / q.length; }
      let n = P.rotN(f.n);
      const facing = dot3(n, sub3(P.cam, cen)) > 0;
      if (!facing) { if (!o.noCull) continue; n = mul3(n, -1); }   // back face
      items.push({ depth: cen[2], px: q.map(P.proj), colour: shade(f.col, n), alpha: f.alpha !== undefined ? f.alpha : (o.alpha === undefined ? 1 : o.alpha) });
    }
    items.sort(function (a, b) { return a.depth - b.depth; });
    ctx.save();
    for (const it of items) {
      ctx.globalAlpha = it.alpha;
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
    ctx.restore();
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

  /** Stroke a closed 4-corner outline given world points; culled by the surface normal at the centre. */
  function strokeQuadOutline(ctx, P, corners, centre, style, fill) {
    const c = projectSurface(P, centre);
    if (!c) return false;
    const q = corners.map(function (p) { return P.proj(P.rot(p)); });
    ctx.save();
    ctx.strokeStyle = style.colour;
    ctx.lineWidth = style.width;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(q[0].x, q[0].y);
    for (let i = 1; i < q.length; i++) ctx.lineTo(q[i].x, q[i].y);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    ctx.stroke();
    ctx.restore();
    return true;
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
    const aL = clampA(body, cx - ah), aR = clampA(body, cx + ah);
    const style = { colour: '#000', width: 1.5, dash: [2, 3] };
    strokeSurfaceLine(ctx, P, surfaceSamples(body, aL, z0, aL, z1, 0.6), style);
    strokeSurfaceLine(ctx, P, surfaceSamples(body, aR, z0, aR, z1, 0.6), style);
    strokeSurfaceLine(ctx, P, surfaceSamples(body, aL, z0, aR, z0, 0.6), style);
    strokeSurfaceLine(ctx, P, surfaceSamples(body, aL, z1, aR, z1, 0.6), style);
  }

  /** Along-weld span of a defect, unwrapped so zTo ≥ zFrom (pipe / nozzle wrap). */
  function defectSpan(d, body) {
    let z0 = d.zFrom, z1 = d.zTo;
    if (z1 < z0) { if (body.kind === 'pipe' || body.nozzle) z1 += body.L; else { const t = z0; z0 = z1; z1 = t; } }
    return { z0, z1 };
  }

  function drawDefects(ctx, P, body, state) {
    if (!state || !state.defects || (state.display && state.display.hide)) return;
    for (const d of state.defects) {
      if (!d || d.visible === false || !d.pts || !d.pts.length) continue;
      const b = UT.specimens.bbox(d.pts);
      const span = defectSpan(d, body);
      const a = clampA(body, b.cx, 2);
      if (body.kind === 'pipe' || body.nozzle) {
        strokeSurfaceLine(ctx, P, surfaceSamples(body, a, span.z0, a, span.z1, 0.8), { colour: '#e00000', width: 3 });
      } else {
        const wx = Math.max(4, b.w);
        const a0 = clampA(body, a - wx / 2), a1 = clampA(body, a + wx / 2);
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
    const half = PROBE_SIZE / 2;
    const sk = M.deg2rad(probe.skew || 0);
    const cs = Math.cos(sk), sn = Math.sin(sk);
    const offs = [[-half, -half], [half, -half], [half, half], [-half, half]];
    const style = { colour: '#00ff00', width: 2 };
    if (probe.surface === 'web' && (body.web || body.nozzle)) {
      const wp = webPoint(body, probe.side, probe.x, probe.z || 0);
      if (!wp) return;
      const lift = mul3(wp.n, 0.8);
      const centre = { p: add3(wp.p, lift), n: wp.n };
      const corners = offs.map(function (o) {
        const du = o[0] * cs - o[1] * sn, dv = o[0] * sn + o[1] * cs;
        return add3(add3(add3(wp.p, mul3(wp.u, du)), mul3(wp.v, dv)), lift);
      });
      strokeQuadOutline(ctx, P, corners, centre, style, null);
      return;
    }
    const a = clampA(body, probe.x);
    const z = body.kind === 'pipe' || body.nozzle ? (probe.z || 0) : M.clamp(probe.z || 0, 0, body.L);   // plates: keep the symbol on the slab
    const corners = offs.map(function (o) {
      const da = o[0] * cs - o[1] * sn, dz = o[0] * sn + o[1] * cs;
      return surfacePoint(body, a + da, z + dz, 0.8).p;
    });
    strokeQuadOutline(ctx, P, corners, surfacePoint(body, a, z, 0.8), style, null);
  }

  /** FBH block: translucent drill shafts with a '⌀d' tag at the flat bottom. */
  function drawFbhs(ctx, P, body) {
    if (!body.fbhs || !body.fbhs.length) return;
    const faces = buildFbhMesh(body);
    paintMesh(ctx, faces, P, { noCull: true, alpha: 0.45 });
    ctx.save();
    ctx.fillStyle = '#202020';
    ctx.font = 'bold 9px Segoe UI, Arial, sans-serif';
    ctx.textBaseline = 'bottom';
    for (const f of faces) {
      if (f.tag !== 'fbh-bottom') continue;
      const c = [0, 0, 0];
      for (const p of f.pts) { c[0] += p[0] / f.pts.length; c[1] += p[1] / f.pts.length; c[2] += p[2] / f.pts.length; }
      const q = P.proj(P.rot(c));
      ctx.fillText('⌀' + (f.fbh.d || ''), q.x + 3, q.y - 2);
    }
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
      const P = makeProjection(view, sz.w, sz.h, boundingRadius(body), centreOf(body));
      lastProj = { P, body };
      paintMesh(ctx, buildMesh(body), P);
      drawFbhs(ctx, P, body);
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
   * Visibility predicate (pure): pipes and nozzles whenever display.pipe3d; plates only in weld mode (or the FBH
   * block) AND when the user explicitly asked (`wantPlate`, defaults to the module flag `plateWanted`).
   * @param {object} [state]
   * @param {boolean} [wantPlate]
   */
  function shouldShow(state, wantPlate) {
    const s = state || UT.state;
    const wp = wantPlate === undefined ? plateWanted : !!wantPlate;
    if (!(s && s.display && s.display.pipe3d && s.specimen)) return false;
    const sp = s.specimen;
    return !!(sp.pipe || sp.nozzle || ((s.mode === 'weld' || sp.id === 'fbh') && wp));
  }

  /** Window title key for the specimen ('3D Pipe' | '3D Nozzle' | '3D T-joint' | '3D Block' | '3D Plate'). */
  function titleFor(state) {
    const sp = state && state.specimen;
    if (!sp) return '3D Plate';
    if (sp.nozzle || (sp.weld && sp.weld.prep === 'nozzle')) return '3D Nozzle';
    if (sp.pipe) return '3D Pipe';
    if (sp.weld && sp.weld.web) return '3D T-joint';
    if (sp.kind === 'block') return '3D Block';
    return '3D Plate';
  }

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

  /** First show: snap the window to the bottom-right corner of the app box (reference position; design px). */
  function placeDefault(api) {
    if (placed || !api || !api.el || typeof window === 'undefined') return;
    placed = true;
    const box = api.el.offsetParent || (typeof document !== 'undefined' && document.getElementById('app')) || null;
    const bw = (box && box.clientWidth) || window.innerWidth, bh = (box && box.clientHeight) || window.innerHeight;
    api.el.style.left = Math.max(0, bw - api.el.offsetWidth - 8) + 'px';
    api.el.style.top = Math.max(0, bh - api.el.offsetHeight - 8) + 'px';
  }

  // ------------------------------------------------------------------ pointer interaction (rotate / pinch / wheel)
  /** Pointer position in design px (UT.dom.localPos compensates the responsive scale of #app). */
  function localPos(e, cv) {
    if (UT.dom && typeof UT.dom.localPos === 'function') { try { return UT.dom.localPos(e, cv); } catch (err) { /* fall through */ } }
    return { x: e.clientX, y: e.clientY };
  }
  function pinchDistance() {
    const it = pointers.values();
    const a = it.next().value, b = it.next().value;
    return a && b ? Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)) : 1;
  }
  function startDrag(p) { drag = { x: p.x, y: p.y, yaw: view.yaw, pitch: view.pitch }; }

  function attachPointer(cv) {
    cv.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const p = localPos(e, cv);
      pointers.set(e.pointerId, p);
      if (cv.setPointerCapture) { try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } }
      if (pointers.size === 1) { pinch = null; startDrag(p); }
      else if (pointers.size === 2) { drag = null; pinch = { d0: pinchDistance(), zoom0: view.zoom }; }
      cv.classList.add('grabbing');
      e.preventDefault();
    });
    cv.addEventListener('pointermove', function (e) {
      if (!pointers.has(e.pointerId)) return;
      const p = localPos(e, cv);
      pointers.set(e.pointerId, p);
      if (pinch && pointers.size >= 2) {
        view.zoom = M.clamp(pinch.zoom0 * pinchDistance() / pinch.d0, 0.4, 4);
        redraw();
      } else if (drag) {
        view.yaw = drag.yaw + (p.x - drag.x) * ROT_PER_PX;
        view.pitch = M.clamp(drag.pitch + (p.y - drag.y) * ROT_PER_PX, -89, 89);
        redraw();
      }
      e.preventDefault();
    });
    const end = function (e) {
      if (e && e.pointerId !== undefined) pointers.delete(e.pointerId); else pointers.clear();
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 0) { drag = null; cv.classList.remove('grabbing'); }
      else if (pointers.size === 1) startDrag(pointers.values().next().value);
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('lostpointercapture', function (e) { if (pointers.has(e.pointerId)) end(e); });
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
      canvas = UT.dom.h('canvas', { id: 'cv-3d', width: CANVAS_W, height: CANVAS_H, 'aria-label': '3D view of the specimen', style: { width: CANVAS_W + 'px', height: CANVAS_H + 'px', display: 'block', background: '#000' } });
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
    attachPointer(canvas);
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
    const S = UT.specimens;
    const spec = S.pipeWeld({ od: 168.3, wt: 20 });
    const body = bodyOf(spec);
    if (body.kind !== 'pipe' || Math.abs(body.R - 84.15) > 1e-6 || Math.abs(body.Ri - 64.15) > 1e-6) f.push('pipe body ' + JSON.stringify(body));
    if (Math.abs(body.L - Math.PI * 168.3) > 1e-6) f.push('pipe circumference');
    if (body.joint !== 'butt' || body.hw !== 8 || body.backing || body.web || body.nozzle) f.push('pipe butt joint flags');
    const mesh = buildPipeMesh(body);
    if (mesh.length > 400) f.push('pipe faces ' + mesh.length + ' > 400');
    const plateSpec = S.plateWeld({ T: 20 });
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
    if (titleFor({ specimen: spec }) !== '3D Pipe' || titleFor({ specimen: plateSpec }) !== '3D Plate') f.push('titles v1');

    // ---- v2: F1 shapes (SPEC-v2 §5.1) — every prep builds, stays ≤ 400 faces and carries its attachment
    const vertexWhere = function (faces, pred) { return faces.some(function (fc) { return fc.pts.some(pred); }); };
    const preps = ['single-v', 'double-v', 'single-bevel', 'j', 'single-v-backing', 'fillet-t', 'nozzle', 'none'];
    for (const pipe of [false, true]) {
      for (const prep of preps) {
        let sp;
        try { sp = pipe ? S.pipeWeld({ od: 168.3, wt: 20, prep }) : S.plateWeld({ T: 20, prep }); } catch (e) { f.push('build ' + prep + ' ' + e.message); continue; }
        const b = bodyOf(sp);
        let faces;
        try { faces = buildMesh(b); } catch (e) { f.push('mesh ' + prep + (pipe ? ' pipe ' : ' plate ') + e.message); continue; }
        if (faces.length > 400) f.push('faces ' + prep + (pipe ? ' pipe ' : ' plate ') + faces.length);
        if (faces.some(function (fc) { return fc.pts.some(function (p) { return !p.every(Number.isFinite); }) || !fc.n.every(Number.isFinite); })) f.push('NaN in mesh ' + prep);
        const expectJoint = prep === 'nozzle' ? 'nozzle' : prep === 'fillet-t' ? 'fillet' : prep === 'none' ? 'none' : 'butt';
        if (b.joint !== expectJoint) f.push('joint ' + prep + ' → ' + b.joint);
        if (prep === 'single-v-backing' && !(b.backing && Math.abs(b.backing.hw - 12.5) < 1e-6 && Math.abs(b.backing.h - 6) < 1e-6)) f.push('backing dims ' + JSON.stringify(b.backing));
        if (prep === 'single-v-backing' && !pipe && !vertexWhere(faces, function (p) { return Math.abs(p[1] + 26) < 1e-6; })) f.push('backing bar bottom at −T−6');
        if (prep === 'single-v-backing' && pipe && !vertexWhere(faces, function (p) { return Math.abs(Math.hypot(p[1], p[2]) - (b.Ri - 6)) < 1e-6; })) f.push('backing ring radius');
        if (prep === 'fillet-t' && !(b.web && b.web.hw === 6 && Math.abs(b.web.leg - 8.4) < 1e-6 && b.web.H === 60)) f.push('web dims ' + JSON.stringify(b.web));
        if (prep === 'fillet-t' && !pipe && !vertexWhere(faces, function (p) { return Math.abs(p[1] - 60) < 1e-6; })) f.push('web top at 60');
        if (prep === 'fillet-t' && pipe && !vertexWhere(faces, function (p) { return Math.abs(Math.hypot(p[1], p[2]) - (b.R + 60)) < 1e-6; })) f.push('ring web rim');
        if (prep === 'nozzle' && !(b.nozzle && Math.abs(b.nozzle.rm - 53.15) < 1e-6 && b.nozzle.hw === 4 && Math.abs(b.nozzle.leg - 5.6) < 1e-6)) f.push('nozzle dims ' + JSON.stringify(b.nozzle));
        if (prep === 'nozzle' && !vertexWhere(faces, function (p) { return Math.abs(p[1] - ((pipe ? b.R : 0) + 60)) < 1e-6; })) f.push('branch top');
        if ((prep === 'single-bevel' || prep === 'j') && !(b.capCentre > 0)) f.push('cap centre offset ' + prep);
        if (prep === 'nozzle' && !(shouldShow({ display: { pipe3d: true }, specimen: sp, mode: 'weld' }, false))) f.push('nozzle auto-shown');
        if (prep === 'nozzle' && titleFor({ specimen: sp }) !== '3D Nozzle') f.push('nozzle title');
        if (prep === 'fillet-t' && !pipe && titleFor({ specimen: sp }) !== '3D T-joint') f.push('t-joint title');
      }
    }
    // nozzle mapping: x = 0 / z = 0 lies on the branch mid-wall at ψ = 0 (Z = rm); on a pipe it sits on the saddle
    const nzPlate = bodyOf(S.plateWeld({ T: 20, prep: 'nozzle' }));
    const n0 = surfacePoint(nzPlate, 0, 0, 0);
    if (!(Math.abs(n0.p[0]) < 1e-9 && Math.abs(n0.p[1]) < 1e-9 && Math.abs(n0.p[2] - nzPlate.nozzle.rm) < 1e-9)) f.push('nozzle surface point ' + JSON.stringify(n0.p));
    const n1 = surfacePoint(nzPlate, 10, nzPlate.L / 4, 0);
    if (!(Math.abs(n1.p[0] - (nzPlate.nozzle.rm + 10)) < 1e-9 && Math.abs(n1.p[2]) < 1e-9)) f.push('nozzle quarter turn ' + JSON.stringify(n1.p));
    const nzPipe = bodyOf(S.pipeWeld({ od: 168.3, wt: 20, prep: 'nozzle' }));
    const n2 = surfacePoint(nzPipe, 0, 0, 0);
    if (Math.abs(n2.p[1] - Math.sqrt(nzPipe.R * nzPipe.R - nzPipe.nozzle.rm * nzPipe.nozzle.rm)) > 1e-9) f.push('nozzle on pipe saddle ' + JSON.stringify(n2.p));
    if (Math.abs(clampA(nzPlate, -500) - (-nzPlate.nozzle.rm + 1)) > 1e-9) f.push('clampA nozzle');
    // web probe point: fillet-t plate, side +1, 20 mm up the web at z = L/2 → (hw, leg + 20, 0), normal +X
    const tb = bodyOf(S.plateWeld({ T: 20, prep: 'fillet-t' }));
    const wp = webPoint(tb, 1, 20, tb.L / 2);
    if (!(wp && Math.abs(wp.p[0] - 6) < 1e-9 && Math.abs(wp.p[1] - 28.4) < 1e-9 && Math.abs(wp.p[2]) < 1e-9 && wp.n[0] === 1)) f.push('web point ' + JSON.stringify(wp));
    const wpn = webPoint(nzPlate, -1, 0, 0);
    if (!(wpn && Math.abs(wpn.p[2] - (nzPlate.nozzle.rm - 4)) < 1e-9 && wpn.n[2] === -1)) f.push('nozzle web point ' + JSON.stringify(wpn));
    if (webPoint(pb, 1, 0, 0) !== null) f.push('web point on a butt weld');
    // FBH block: full width, five translucent shafts, shown on request, titled '3D Block'
    if (typeof S.fbhBlock === 'function') {
      const fb = S.fbhBlock({ T: 60 });
      const bb = bodyOf(fb);
      if (!(bb.kind === 'plate' && bb.joint === 'block' && bb.len === 300 && bb.cx === 150 && bb.fbhs.length === 5)) f.push('fbh body ' + JSON.stringify([bb.len, bb.cx, bb.fbhs.length, bb.joint]));
      const fm = buildFbhMesh(bb);
      if (fm.filter(function (fc) { return fc.tag === 'fbh-bottom'; }).length !== 5 || fm.length !== 55) f.push('fbh mesh ' + fm.length);
      if (!vertexWhere(fm, function (p) { return Math.abs(p[1] + 30) < 1e-6; }) || !vertexWhere(fm, function (p) { return Math.abs(p[1] + 60) < 1e-6; })) f.push('fbh shaft extent');
      if (!shouldShow({ display: { pipe3d: true }, specimen: fb, mode: 'fbh' }, true)) f.push('shouldShow fbh requested');
      if (shouldShow({ display: { pipe3d: true }, specimen: fb, mode: 'fbh' }, false)) f.push('shouldShow fbh not requested');
      if (titleFor({ specimen: fb }) !== '3D Block') f.push('fbh title');
    }
    // translucent painting keeps back faces when asked, culls them otherwise (a closed tube: 10 sides)
    const tube = buildFbhMesh({ cx: 0, len: 100, T: 20, fbhs: [{ x: 0, y: 10, d: 4 }] });
    const ctxStub = { save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, stroke() {} };
    const nAll = paintMesh(ctxStub, tube, D, { noCull: true }), nCull = paintMesh(ctxStub, tube, D);
    if (!(nAll === 11 && nCull < nAll)) f.push('paintMesh noCull ' + nAll + '/' + nCull);
    return f;
  }

  const pipe3d = {
    init, draw, open, close, toggle, setView, toPx, toMm, fit, __selftest,
    window: null,
    /** Current camera (read-only copy). */
    get view() { return Object.assign({}, view); },
    /** Pure helpers (exposed for tests). */
    helpers: { bodyOf, surfacePoint, webPoint, clampA, buildMesh, buildFbhMesh, makeProjection, projectSurface, zWindow, defectSpan, shouldShow, titleFor, boundingRadius, centreOf },
    css: [
      '.win[data-win=pipe3d] .win-body { padding: 0; background: #000; line-height: 0; }',
      '#cv-3d { display: block; width: 260px; height: 200px; background: #000; cursor: grab; touch-action: none; user-select: none; -webkit-user-select: none; }',
      '#cv-3d.grabbing { cursor: grabbing; }',
    ].join('\n'),
  };
  UT.views.pipe3d = pipe3d;
})(window.UT = window.UT || {});
