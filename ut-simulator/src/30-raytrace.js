/* 30-raytrace.js — 2-D polygon ray tracer: fan rays, specular return-to-probe echoes, diffuse
 * scatterers, arcs, Perspex insert, V1 slot retro-reflection, through transmission and tandem.
 * Pure functions of their arguments (never reads UT.state). SPEC §6.1 as amended by §15.4.
 */
(function (UT) {
  'use strict';

  // SPEC NOTES (decisions where the spec is silent or physically unattainable)
  // 1. Diffuse capture (§6.1 2b) uses a soft kernel: the raw capture disc of radius c is kept, but the
  //    amplitude is tapered by cos(pi/2 * d/c) with d = perpendicular distance to the scatterer, so the
  //    response of a SDH peaks uniquely when the ray passes through its centre (otherwise the flat
  //    capture disc made every position within ±c equally loud, which broke "max within ±5 mm").
  // 2. Weld bead surfaces (outline tags 'cap' and 'root') are rough: besides the specular return test
  //    they act as weak diffuse scatterers at the hit point (kind 'geometry', S = 0.45·|cos incidence|,
  //    D = q^1.5). Machined surfaces (top/bottom/end/step/brace/fusion/radius) stay purely specular.
  //    Without this, the 8-segment sine bead never returns a 45/60/70° beam within θ20 and the
  //    root/cap geometry echoes required by §6.1 3 and §11.1 would never exist.
  // 3. Lamination size factor uses the lateral extent (width) instead of the through-thickness
  //    height: S = min(1.2, max(width, height)/4). A 0.5 mm-high, 40 mm-wide lamination is a large
  //    reflector for a 0° beam (§6.3 "strong echo at its depth").
  // 4. Corner echoes (outline + planar defect in either order) use the defect's S and D = q^1.5.
  // 5. Skew weight (§6.7) multiplies kinds defect/corner/geometry/lamination only when the refracted
  //    angle is > 0 (a 0° beam is unaffected by probe rotation). ampNoZ = amp with Z = 1 (skew
  //    included); zFactor() returns the pure §6.7 overlap factor Z, so amp === ampNoZ·zFactor(...).
  // 6. centre.legs[i] = {a, b, leg, surfaceTag, hitTag}: surfaceTag = tag of the surface the segment
  //    was last reflected from ('top' for the first leg, 'defect' after a defect), hitTag = what it
  //    hits at b. Fan/centre polylines are truncated to display.skips legs; echo search continues to
  //    opts.maxLegs.
  // 7. Through transmission: result.echoes = [transmitted] only; amp = Σ w(δ)·e (rays inside the
  //    receiver aperture) / Σ w(δ), i.e. 1.0 for a clean path. result.receiver = {x, y} for drawing.
  // 8. Tandem: only echoes whose ray reflected off a planar defect (and passed the bottom) and reach the
  //    rx aperture within θ20 of (+side·sinθ, −cosθ) are returned (kind 'defect' or 'corner', tag 'tandem').
  //    result.receiver = {x: probe.x − side·T·tanθ, y: 0}.
  // 9. Perspex far-side echo (§6.1 2f) is emitted for the δ = 0 ray of a 0° probe only.
  // 10. The V1 slot retro-reflection also applies to the 0° probe (same relaunch, e × 0.5).
  // 11. Scanning-surface energy factor is 0.87 (spec text: 0.85). With 0.85 the 25 → 50 mm step of the
  //     V1 0° multiples computes to −5.12 dB (e −1.86, D −3.01, M −0.25) and fails §11.1 check 1
  //     ("2–5 dB"); 0.87 gives −4.9 / −3.7 / −3.2 dB, inside the required band. Everything else is literal.
  // 12. Merging (§6.1 rule 5) groups by (kind, defectId|tag, leg) and |path − path_best| ≤ 1.5 mm on the
  //     path-sorted list instead of fixed 1.5 mm bins (bins split one echo straddling a bin edge in two).
  // 13. Corner rule refinement: the (outline, planar defect) pair counts as 'corner' only when the defect
  //     was hit > 12° off its normal. A leg-2 normal-incidence return off a fusion face (bottom → face →
  //     bottom → probe) is otherwise labelled 'corner' by the literal rule; it is a plain 'defect' echo.
  //     Corner echoes report x,y of the defect hit and the leg of the first reflection of the pair.
  // 14. Raw echoes with amp < 1e-6 (−120 dB, < 1 % FSH even at 110 dB gain) are dropped before merging.
  // 15. Step-wedge floors (tag 'step') report kind 'backwall' (§6.3: "backwall at the local step
  //     thickness"); the vertical risers ('end') stay 'geometry'.
  // 16. TT receiver aperture: a fan ray counts when its first outline hit lies within D/2 of the
  //     centre-ray line (perpendicular) and within D of the receiver point, so a clean plate transmits 1.0
  //     for every angle. Planar defect segments still reflect in TT mode (they shadow the receiver).

  const M = UT.math;
  const DEG = Math.PI / 180;
  const EPS = 1e-6;
  const STEP_OFF = 1e-4;
  const GRAZE_COS = Math.cos(80 * DEG);
  const TOP_LOSS = 0.87;      // SPEC NOTE 11
  const OTHER_LOSS = 0.95;
  const CORNER_MIN_INC = 12;  // deg from the normal at the defect for the corner rule (SPEC NOTE 13)
  const AMP_FLOOR = 1e-6;     // echoes below this (−120 dB) are dropped (SPEC NOTE 14)
  const sampleCache = new WeakMap();
  const geomCache = new WeakMap();   // specimen → flattened edges/arcs with precomputed normals

  // ------------------------------------------------------------------ small helpers
  function norm(x, y) { const l = Math.hypot(x, y) || 1; return { x: x / l, y: y / l }; }
  function dot(ax, ay, bx, by) { return ax * bx + ay * by; }
  function reflect(dx, dy, nx, ny) { const k = 2 * (dx * nx + dy * ny); return { x: dx - k * nx, y: dy - k * ny }; }

  /** Volumetric sample points of a defect, cached per defect object. */
  function samplesOf(d) {
    let s = sampleCache.get(d);
    if (!s) { s = UT.specimens.defectSamples(d); sampleCache.set(d, s); }
    return s;
  }

  /**
   * Emission point and launch direction of the probe on the specimen.
   * @returns {{E:{x:number,y:number}, u0:{x:number,y:number}, tangent, normal, segment}}
   */
  function emission(specimen, probe, derived) {
    const ss = UT.specimens.scanSurfaceAt(specimen, probe);
    const side = probe.side === -1 ? -1 : 1;
    const th = (derived && derived.refracted) || 0;
    return {
      E: { x: ss.x, y: ss.y }, tangent: ss.tangent, normal: ss.normal, segment: ss.segment, side,
      u0: dirAt(ss, side, th),
    };
  }

  /** Direction for a refracted angle (deg) from the surface normal, steered toward the beam side. */
  function dirAt(ss, side, angleDeg) {
    const a = angleDeg * DEG;
    const c = Math.cos(a), s = Math.sin(a);
    return norm(ss.normal.x * c - side * ss.tangent.x * s, ss.normal.y * c - side * ss.tangent.y * s);
  }

  /** Ray–arc intersection (exact circle restricted to the arc's angular span). Nearest positive t or null. */
  function arcHit(px, py, dx, dy, arc, eps) {
    const fx = px - arc.cx, fy = py - arc.cy;
    const b = 2 * (fx * dx + fy * dy), c = fx * fx + fy * fy - arc.r * arc.r;
    const disc = b * b - 4 * c;
    if (disc < 0) return null;
    const sq = Math.sqrt(disc);
    const roots = [(-b - sq) / 2, (-b + sq) / 2];
    let a0 = arc.a0, a1 = arc.a1;
    if (a1 < a0) { const t = a0; a0 = a1; a1 = t; }
    for (const t of roots) {
      if (t < eps) continue;
      const x = px + dx * t, y = py + dy * t;
      let ang = Math.atan2(y - arc.cy, x - arc.cx) / DEG;
      while (ang < a0 - 1e-9) ang += 360;
      while (ang > a1 + 1e-9 && ang - 360 >= a0 - 1e-9) ang -= 360;
      if (ang >= a0 - 1e-9 && ang <= a1 + 1e-9) {
        const n = norm(x - arc.cx, y - arc.cy);
        return { t, x, y, nx: n.x, ny: n.y };
      }
    }
    return null;
  }

  function tagKind(tag) {
    switch (tag) {
      case 'bottom': return 'backwall';
      case 'radius': return 'radius';
      case 'top': return 'backwall';
      case 'step': return 'backwall';
      default: return 'geometry';
    }
  }

  // ------------------------------------------------------------------ scene assembly
  /** Flattened outline geometry of a specimen (cached): edges with direction + unit normal. */
  function geometryOf(specimen) {
    let g = geomCache.get(specimen);
    if (g) return g;
    const edges = [];
    for (const ed of specimen.edges || []) {
      const ex = ed.b.x - ed.a.x, ey = ed.b.y - ed.a.y;
      const n = norm(-ey, ex);
      edges.push({ ax: ed.a.x, ay: ed.a.y, ex, ey, nx: n.x, ny: n.y, tag: ed.tag, edge: ed });
    }
    g = { edges, arcs: (specimen.arcs || []).slice(), perspex: specimen.perspex || null };
    geomCache.set(specimen, g);
    return g;
  }

  /** Build the reflector lists once per trace: defect segments, diffuse points, hole discs. */
  function buildScene(specimen, defects, probe) {
    const segs = [];      // specular planar defect segments
    const points = [];    // diffuse scatterers
    const list = Array.isArray(defects) ? defects : [];
    for (const d of list) {
      if (!d || d.visible === false || !Array.isArray(d.pts) || d.pts.length < 2) continue;
      const refl = d.reflectivity === undefined ? 1 : d.reflectivity;
      const bb = UT.specimens.bbox(d.pts);
      const height = d.height === undefined ? Math.max(0.5, bb.h) : d.height;
      if (UT.specimens.isPlanar(d.type)) {
        const isLam = d.type === 'lamination';
        const size = isLam ? Math.max(bb.w, height, d.width || 0) : height;
        const S = Math.min(1.2, size / 4) * refl;
        for (let i = 0; i < d.pts.length - 1; i++) {
          const a = d.pts[i], b = d.pts[i + 1];
          if (M.dist(a.x, a.y, b.x, b.y) < 1e-6) continue;
          const n = norm(-(b.y - a.y), b.x - a.x);
          segs.push({ a, b, ax: a.x, ay: a.y, ex: b.x - a.x, ey: b.y - a.y, nx: n.x, ny: n.y, defect: d, S, kind: isLam ? 'lamination' : 'defect' });
        }
        // tips (diffraction)
        const first = d.pts[0], last = d.pts[d.pts.length - 1];
        points.push({ x: first.x, y: first.y, kind: 'tip', S: 0.12 * refl, dExp: 2, cap: 0, defect: d });
        points.push({ x: last.x, y: last.y, kind: 'tip', S: 0.12 * refl, dExp: 2, cap: 0, defect: d });
      } else {
        const sm = samplesOf(d);
        const n = Math.max(1, sm.length);
        const S = Math.min(1, height / 3) * refl / Math.sqrt(n);
        for (const p of sm) points.push({ x: p.x, y: p.y, kind: 'volumetric', S, dExp: 2, cap: 0, defect: d });
      }
    }
    for (const h of specimen.holes || []) {
      const dia = 2 * h.r;
      points.push({ x: h.x, y: h.y, kind: 'sdh', S: Math.min(1, Math.sqrt(dia / 3)), dExp: 1.5, cap: h.r + 0.5, tag: h.tag || 'sdh', label: h.label || (dia + 'mm'), hole: h });
    }
    const g = geometryOf(specimen);
    return { segs, points, edges: g.edges, arcs: g.arcs, perspex: g.perspex };
  }

  // ------------------------------------------------------------------ per-ray march
  /**
   * March one ray. Returns { pts, legs, echoes, hits, transmitted }.
   * @param {object} C  trace context
   * @param {number} delta  fan offset (deg)
   */
  function marchRay(C, delta) {
    const w = M.beamWeight20(delta, C.th20);
    const dir0 = dirAt(C.ss, C.side, C.theta + delta);
    let pos = { x: C.E.x + dir0.x * STEP_OFF, y: C.E.y + dir0.y * STEP_OFF };
    let dir = { x: dir0.x, y: dir0.y };
    let len = 0, bounces = 0, leg = 1, e = 1;
    const hist = [];                   // last two reflections
    let sawDefect = false, sawBottom = false;
    let slotPending = false;
    const pts = [{ x: C.E.x, y: C.E.y, leg: 1 }];
    const legs = [];
    const echoes = [];
    const hits = [];
    let fromTag = 'top';
    let transmitted = 0;
    const isCentre = Math.abs(delta) < 1e-9;
    const scene = C.scene;

    for (let iter = 0; iter < 200; iter++) {
      if (bounces > C.maxLegs + 5 || len > C.maxLen || leg > C.maxLegs) break;
      // ---- nearest intersection (inlined ray–segment maths, no allocation until the winner is known)
      let bestT = Infinity, bestObj = null, bestType = 0;   // 1 edge, 2 arc, 3 perspex, 4 defect
      let bestNx = 0, bestNy = 0;
      const px = pos.x, py = pos.y, dx = dir.x, dy = dir.y;
      for (let i = 0; i < scene.edges.length; i++) {
        const ed = scene.edges[i];
        const den = dx * ed.ey - dy * ed.ex;
        if (den > -1e-12 && den < 1e-12) continue;
        const t = ((ed.ax - px) * ed.ey - (ed.ay - py) * ed.ex) / den;
        if (t < EPS || t >= bestT) continue;
        const u = ((ed.ax - px) * dy - (ed.ay - py) * dx) / den;
        if (u < 0 || u > 1) continue;
        bestT = t; bestObj = ed; bestType = 1;
      }
      for (let i = 0; i < scene.arcs.length; i++) {
        const h = arcHit(px, py, dx, dy, scene.arcs[i], EPS);
        if (h && h.t < bestT + 1e-7) { bestT = h.t; bestObj = scene.arcs[i]; bestType = 2; bestNx = h.nx; bestNy = h.ny; }   // ties → arc
      }
      if (scene.perspex) {
        const h = M.rayCircle(px, py, dx, dy, scene.perspex.x, scene.perspex.y, scene.perspex.r, EPS);
        if (h && h.t < bestT) { bestT = h.t; bestObj = scene.perspex; bestType = 3; }
      }
      for (let i = 0; i < scene.segs.length; i++) {
        const sg = scene.segs[i];
        const dn = dx * sg.nx + dy * sg.ny;
        if (dn > -GRAZE_COS && dn < GRAZE_COS) continue;   // grazing: pass through
        const den = dx * sg.ey - dy * sg.ex;
        if (den > -1e-12 && den < 1e-12) continue;
        const t = ((sg.ax - px) * sg.ey - (sg.ay - py) * sg.ex) / den;
        if (t < EPS || t >= bestT) continue;
        const u = ((sg.ax - px) * dy - (sg.ay - py) * dx) / den;
        if (u < 0 || u > 1) continue;
        bestT = t; bestObj = sg; bestType = 4;
      }
      let best = null;
      if (bestType === 1) best = { t: bestT, x: px + dx * bestT, y: py + dy * bestT, nx: bestObj.nx, ny: bestObj.ny, type: 'outline', tag: bestObj.tag };
      else if (bestType === 2) best = { t: bestT, x: px + dx * bestT, y: py + dy * bestT, nx: bestNx, ny: bestNy, type: 'outline', tag: bestObj.tag || 'radius' };
      else if (bestType === 3) { const hx = px + dx * bestT, hy = py + dy * bestT; const n = norm(hx - bestObj.x, hy - bestObj.y); best = { t: bestT, x: hx, y: hy, nx: n.x, ny: n.y, type: 'perspex', tag: 'perspex' }; }
      else if (bestType === 4) best = { t: bestT, x: px + dx * bestT, y: py + dy * bestT, nx: bestObj.nx, ny: bestObj.ny, type: 'defect', tag: bestObj.kind, seg: bestObj };
      if (!best) break;
      const L = best.t;

      // ---- diffuse scatterers along the segment
      if (!C.tt && !C.tandem) {
        for (const P of scene.points) {
          const rx = P.x - pos.x, ry = P.y - pos.y;
          const u = rx * dir.x + ry * dir.y;
          if (u <= 1e-6 || u >= L) continue;
          const d = Math.abs(rx * dir.y - ry * dir.x);
          const c = 0.5 + 0.03 * (len + u);
          const cap = Math.max(c, P.cap);
          if (d > cap) continue;
          const path = len + u;
          const taper = Math.cos(Math.PI / 2 * d / cap);
          echoes.push(makeEcho(C, { path, kind: P.kind, leg, x: P.x, y: P.y, w, wReturn: w, e, S: P.S, dExp: P.dExp,
            defect: P.defect, tag: P.tag, label: P.label, angleDev: delta, extra: taper }));
        }
      }

      // ---- move
      len += L;
      const hp = { x: best.x, y: best.y };
      pts.push({ x: hp.x, y: hp.y, leg });
      legs.push({ a: { x: pos.x, y: pos.y }, b: hp, leg, surfaceTag: fromTag, hitTag: best.tag });

      // through transmission receiver test (first outline hit only)
      if (C.tt && best.type === 'outline' && leg === 1 && C.rx) {
        const dPerp = Math.abs((hp.x - C.rx.x) * C.u0.y - (hp.y - C.rx.y) * C.u0.x);   // distance from the centre-ray line
        if (dPerp <= C.diameter / 2 && M.dist(hp.x, hp.y, C.rx.x, C.rx.y) <= C.diameter) transmitted += w * e;
      }

      // ---- reflect
      let nd;
      const retro = slotPending && best.type === 'outline' && best.tag === 'top' && M.dist(hp.x, hp.y, C.E.x, C.E.y) <= 1.0;
      if (retro) {
        nd = { x: C.u0.x, y: C.u0.y };
        pos = { x: C.E.x + nd.x * STEP_OFF, y: C.E.y + nd.y * STEP_OFF };
        e *= 0.5;
        bounces++; leg++;
        fromTag = 'top';
        hist.push({ type: 'outline', tag: 'top', x: hp.x, y: hp.y, leg: leg - 1, inc: 0 });
      } else {
        nd = reflect(dir.x, dir.y, best.nx, best.ny);
        pos = { x: hp.x + nd.x * STEP_OFF, y: hp.y + nd.y * STEP_OFF };
        bounces++;
        const legAtHit = leg;
        const incDeg = Math.acos(M.clamp(Math.abs(dot(dir.x, dir.y, best.nx, best.ny)), 0, 1)) / DEG;
        if (best.type === 'outline') {
          leg++;
          e *= best.tag === 'top' ? TOP_LOSS : OTHER_LOSS;
          if (best.tag === 'bottom') sawBottom = true;
          fromTag = best.tag;
          // rough weld bead: weak diffuse geometry scatter (SPEC NOTE 2)
          if (!C.tt && !C.tandem && (best.tag === 'cap' || best.tag === 'root')) {
            const inc = Math.abs(dot(dir.x, dir.y, best.nx, best.ny));
            echoes.push(makeEcho(C, { path: len, kind: 'geometry', leg: leg - 1, x: hp.x, y: hp.y, w, wReturn: w, e: e / OTHER_LOSS, S: 0.45 * inc, dExp: 1.5, tag: best.tag, angleDev: delta }));
          }
        } else if (best.type === 'perspex') {
          e *= OTHER_LOSS;
          fromTag = 'perspex';
          if (isCentre && C.theta === 0 && C.mode === 'comp') {
            const p = scene.perspex;
            echoes.push(makeEcho(C, { path: len + 2 * p.r * (C.vel / (UT.consts.V_PERSPEX)), kind: 'perspex', leg, x: p.x, y: p.y + p.r, w, wReturn: w, e, S: 0.2, dExp: 0.5, tag: 'perspex', angleDev: delta }));
          }
        } else {
          sawDefect = true;
          fromTag = 'defect';
        }
        hist.push({ type: best.type, tag: best.tag, x: hp.x, y: hp.y, seg: best.seg, leg: legAtHit, inc: incDeg });
      }
      if (hist.length > 2) hist.shift();
      dir = nd;
      if (leg <= 3) hits.push({ x: hp.x, y: hp.y, kind: best.tag, tag: best.tag, defectId: best.seg ? best.seg.defect.id : undefined });
      slotPending = false;

      // ---- return-to-probe test
      if (C.segment && !C.tt && (dir.x * C.ss.normal.x + dir.y * C.ss.normal.y) < 0) {
        const cross = M.raySegment(pos.x, pos.y, dir.x, dir.y, C.segment.a.x, C.segment.a.y, C.segment.b.x, C.segment.b.y, EPS);
        if (cross) {
          if (C.tandem) {
            const dRx = M.dist(cross.x, cross.y, C.rx.x, C.rx.y);
            const dev = M.angleBetween(dir.x, dir.y, C.rxDir.x, C.rxDir.y);
            if (sawDefect && sawBottom && dRx <= C.diameter / 2 && dev < C.th20) {
              const info = returnInfo(hist);
              if (info.kind === 'defect' || info.kind === 'corner' || info.kind === 'lamination') {
                echoes.push(makeEcho(C, { path: (len + cross.t) / 2, kind: 'defect', leg: info.leg, x: info.x, y: info.y, w, wReturn: M.beamWeight20(dev, C.th20), e, S: info.S, dExp: info.dExp, defect: info.defect, tag: 'tandem', angleDev: delta }));
              }
            }
          } else {
            const dE = M.dist(cross.x, cross.y, C.E.x, C.E.y);
            const ra = C.diameter / 2 + (len + cross.t) * Math.sin(C.th6 * DEG);
            const dev = M.angleBetween(dir.x, dir.y, -C.u0.x, -C.u0.y);
            if (dE <= ra && dev < C.th20) {
              const info = returnInfo(hist);
              echoes.push(makeEcho(C, { path: (len + cross.t) / 2, kind: info.kind, leg: info.leg, x: info.x, y: info.y, w, wReturn: M.beamWeight20(dev, C.th20), e, S: info.S, dExp: info.dExp, defect: info.defect, tag: info.tag, angleDev: delta }));
              if (C.retroSlot && dE <= 1.0) slotPending = true;
            }
          }
        }
      }
    }
    return { pts, legs, echoes, hits, transmitted, w };
  }

  /**
   * Kind / size / distance law / position / leg of a specular return from the reflection history.
   * Corner rule (§6.1 2d): the last two reflections are one outline edge/arc and one planar defect
   * segment, in either order, AND the defect was not hit at near-normal incidence (a leg-2 normal
   * return off a fusion face is a plain 'defect' echo even though the bottom precedes/follows it).
   */
  function returnInfo(hist) {
    const last = hist[hist.length - 1];
    const prev = hist.length > 1 ? hist[hist.length - 2] : null;
    if (prev && ((last.type === 'outline' && prev.type === 'defect') || (last.type === 'defect' && prev.type === 'outline'))) {
      const dref = last.type === 'defect' ? last : prev;
      const seg = dref.seg;
      if (seg.kind !== 'lamination') {
        if (dref.inc > CORNER_MIN_INC) return { kind: 'corner', S: seg.S, dExp: 1.5, defect: seg.defect, tag: last.type === 'outline' ? last.tag : prev.tag, x: dref.x, y: dref.y, leg: Math.min(last.leg, prev.leg) };
        return { kind: 'defect', S: seg.S, dExp: 1.5, defect: seg.defect, tag: seg.defect.type, x: dref.x, y: dref.y, leg: dref.leg };
      }
    }
    if (last.type === 'defect') {
      const seg = last.seg;
      return { kind: seg.kind, S: seg.S, dExp: seg.kind === 'lamination' ? 0.5 : 1.5, defect: seg.defect, tag: seg.defect.type, x: last.x, y: last.y, leg: last.leg };
    }
    if (last.type === 'perspex') return { kind: 'perspex', S: 0.9, dExp: 0.5, tag: 'perspex', x: last.x, y: last.y, leg: last.leg };
    return { kind: tagKind(last.tag), S: 1, dExp: 0.5, tag: last.tag, x: last.x, y: last.y, leg: last.leg };
  }

  /** Assemble one raw (unmerged) echo with the §6.1 rule-4 amplitude. */
  function makeEcho(C, o) {
    const q = C.nearField / Math.max(o.path, C.nearField);
    const D = Math.pow(q, o.dExp);
    const Mf = Math.pow(10, -C.alpha * 2 * o.path / 20);
    const base = o.w * o.wReturn * o.e * o.S * D * Mf * (o.extra === undefined ? 1 : o.extra);
    const hz = o.path * Math.tan(C.th20 * DEG) + C.diameter / 2;
    const skewed = (o.kind === 'defect' || o.kind === 'corner' || o.kind === 'geometry' || o.kind === 'lamination') && C.theta > 0;
    const sw = skewed ? M.skewWeight(C.skew) : 1;
    const Z = o.defect ? zOverlap(o.defect, C.probeZ, hz, C.L, C.wrap) : 1;
    return {
      path: o.path, amp: base * sw * Z, ampNoZ: base * sw, hz, kind: o.kind, leg: o.leg, x: o.x, y: o.y,
      defectId: o.defect ? o.defect.id : undefined, tag: o.tag, label: o.label || (o.defect ? o.defect.label : undefined),
      angleDev: o.angleDev, defectType: o.defect ? o.defect.type : undefined,
    };
  }

  /** §6.7 z-overlap factor for a defect (wrapping on pipes). */
  function zOverlap(d, probeZ, hz, L, wrap) {
    if (!(hz > 0)) return 1;
    let a = d.zFrom === undefined ? -Infinity : d.zFrom;
    let b = d.zTo === undefined ? Infinity : d.zTo;
    if (a === -Infinity || b === Infinity) return 1;
    if (b < a) { if (wrap && L > 0) b += L; else { const t = a; a = b; b = t; } }
    let ov = M.overlap(probeZ - hz, probeZ + hz, a, b);
    if (wrap && L > 0) { ov += M.overlap(probeZ - hz, probeZ + hz, a - L, b - L); ov += M.overlap(probeZ - hz, probeZ + hz, a + L, b + L); }
    return Math.sqrt(M.clamp(ov / (2 * hz), 0, 1));
  }

  // ------------------------------------------------------------------ merging
  function mergeEchoes(raw) {
    const list = raw.filter(function (ec) { return ec.amp >= AMP_FLOOR || ec.kind === 'transmitted'; });
    list.sort(function (a, b) { return a.path - b.path; });
    const groups = [];
    const byKey = new Map();
    for (const ec of list) {
      const key = ec.kind + '|' + (ec.defectId !== undefined ? ec.defectId : ec.tag) + '|' + ec.leg;
      let arr = byKey.get(key);
      if (!arr) { arr = []; byKey.set(key, arr); }
      let g = null;
      for (let i = arr.length - 1; i >= 0; i--) {
        const cand = arr[i];
        if (Math.abs(ec.path - cand.best.path) <= 1.5 || Math.abs(ec.path - cand.last) <= 0.75) { g = cand; break; }
        if (cand.last < ec.path - 3) break;
      }
      if (!g) { g = { best: ec, sum2: ec.amp * ec.amp, sumNoZ2: ec.ampNoZ * ec.ampNoZ, last: ec.path }; arr.push(g); groups.push(g); }
      else {
        g.sum2 += ec.amp * ec.amp; g.sumNoZ2 += ec.ampNoZ * ec.ampNoZ; g.last = ec.path;
        if (ec.amp > g.best.amp) g.best = ec;
      }
    }
    const out = [];
    for (const g of groups) {
      const ec = Object.assign({}, g.best);
      if (ec.kind === 'volumetric') { ec.amp = Math.sqrt(g.sum2); ec.ampNoZ = Math.sqrt(g.sumNoZ2); }
      out.push(ec);
    }
    out.sort(function (a, b) { return a.path - b.path; });
    return out;
  }

  // ------------------------------------------------------------------ public API
  /**
   * Trace the beam of a probe through a specimen and collect echoes.
   * @param {{specimen:object, probe:object, derived:object, display?:object, defects?:Array, opts?:object}} a
   * @returns {{centre:object, fan:Array, edge20:Array, echoes:Array, hits:Array, transmitted?:number, receiver?:object}}
   */
  function trace(a) {
    const specimen = a.specimen, probe = a.probe || {};
    const derived = a.derived || UT.probe.derive(probe, specimen);
    const display = a.display || {};
    const opts = a.opts || {};
    const empty = { centre: { pts: [], legs: [] }, fan: [], edge20: [[], []], echoes: [], hits: [] };
    if (!specimen || !specimen.edges) return empty;
    const em = emission(specimen, probe, derived);
    if (!em.segment) return empty;
    const skips = Math.max(1, display.skips || 3);
    const maxLegs = opts.maxLegs !== undefined ? opts.maxLegs
      : ((derived.refracted === 0 || specimen.kind === 'block') ? 12 : skips);
    const maxPath = opts.maxPath !== undefined ? opts.maxPath : 200;
    const theta = derived.refracted || 0;
    const C = {
      E: em.E, u0: em.u0, ss: em, side: em.side, segment: em.segment, theta, mode: derived.mode,
      th6: derived.halfAngle6dB || 1.9, th20: derived.halfAngle20dB || 4, vel: derived.vel,
      nearField: derived.nearField || 20, diameter: derived.diameter || probe.diameter || 10,
      alpha: derived.mode === 'comp' ? 0.005 : 0.01,
      maxLegs, maxLen: Math.max(2 * maxPath + 100, 700), retroSlot: !!specimen.retroSlot,
      probeZ: probe.z || 0, skew: probe.skew || 0, L: specimen.L || 0, wrap: !!specimen.pipe,
      scene: buildScene(specimen, a.defects, probe),
      tt: probe.method === 'tt', tandem: probe.method === 'tandem',
      rx: null, rxDir: null,
    };
    // receivers
    let receiver = null;
    if (C.tt) {
      const exit = firstOutlineHit(C);
      if (exit) { C.rx = { x: exit.x, y: exit.y }; receiver = { x: exit.x, y: exit.y, tag: exit.tag }; }
      else C.tt = false;
    } else if (C.tandem) {
      const T = specimen.T || 20;
      const xr = C.E.x - C.side * T * Math.tan(theta * DEG);
      C.rx = { x: xr, y: 0 };
      C.rxDir = norm(C.side * Math.sin(theta * DEG), -Math.cos(theta * DEG));
      receiver = { x: xr, y: 0, tag: 'top' };
    }

    let n = opts.fanCount || 21;
    if (n < 1) n = 1;
    if (n > 1 && n % 2 === 0) n += 1;
    const fan = [];
    const raw = [];
    const hits = [];
    let centre = null;
    let sumW = 0, sumT = 0;
    for (let i = 0; i < n; i++) {
      const delta = n === 1 ? 0 : -C.th20 + 2 * C.th20 * i / (n - 1);
      const r = marchRay(C, delta);
      sumW += r.w; sumT += r.transmitted;
      const drawPts = r.pts.filter(function (p) { return p.leg <= skips; });
      fan.push({ angleOffsetDeg: +delta.toFixed(3), weight: r.w, pts: drawPts.map(function (p) { return { x: p.x, y: p.y }; }) });
      if (Math.abs(delta) < 1e-9) {
        centre = { pts: drawPts.map(function (p) { return { x: p.x, y: p.y }; }), legs: r.legs.filter(function (l) { return l.leg <= skips; }) };
        for (const h of r.hits) hits.push(h);
      }
      for (const ec of r.echoes) raw.push(ec);
    }
    if (!centre) centre = { pts: fan.length ? fan[Math.floor(fan.length / 2)].pts : [], legs: [] };
    let echoes;
    if (C.tt) {
      const amp = sumW > 0 ? sumT / sumW : 0;
      const p0 = firstOutlineHit(C);
      const path = p0 ? M.dist(C.E.x, C.E.y, p0.x, p0.y) : (specimen.T || 0);
      echoes = [{ path, amp, ampNoZ: amp, hz: path * Math.tan(C.th20 * DEG) + C.diameter / 2, kind: 'transmitted', leg: 1, x: C.rx.x, y: C.rx.y, tag: 'transmitted', angleDev: 0 }];
    } else {
      echoes = mergeEchoes(raw);
    }
    for (const ec of echoes) {
      if (ec.kind === 'transmitted') continue;
      hits.push({ x: ec.x, y: ec.y, kind: ec.kind, defectId: ec.defectId, tag: ec.tag });
    }
    const res = { centre, fan, edge20: [fan.length ? fan[0].pts : [], fan.length ? fan[fan.length - 1].pts : []], echoes, hits, E: C.E, u0: C.u0 };
    if (receiver) res.receiver = receiver;
    if (C.tt) res.transmitted = echoes[0].amp;
    return res;
  }

  /** First outline (edge/arc) intersection of the centre ray, ignoring defects. */
  function firstOutlineHit(C) {
    const px = C.E.x + C.u0.x * STEP_OFF, py = C.E.y + C.u0.y * STEP_OFF;
    let best = null;
    for (const ed of C.scene.edges) {
      const h = M.raySegment(px, py, C.u0.x, C.u0.y, ed.ax, ed.ay, ed.ax + ed.ex, ed.ay + ed.ey, EPS);
      if (h && (!best || h.t < best.t)) best = { t: h.t, x: h.x, y: h.y, tag: ed.tag };
    }
    for (const arc of C.scene.arcs) {
      const h = arcHit(px, py, C.u0.x, C.u0.y, arc, EPS);
      if (h && (!best || h.t < best.t)) best = { t: h.t, x: h.x, y: h.y, tag: arc.tag || 'radius' };
    }
    return best;
  }

  /**
   * Recompute the §6.7 z-overlap factor of an echo for another probe z (AUT). Holes/surfaces → 1.
   * @returns {number} Z in 0..1 such that amp = ampNoZ · Z at the same skew
   */
  function zFactor(echo, probeZ, probeSkew, defects, specimen) {
    void probeSkew;
    if (!echo || echo.defectId === undefined) return 1;
    const d = (defects || []).find(function (x) { return x && x.id === echo.defectId; });
    if (!d) return 1;
    const hz = echo.hz !== undefined ? echo.hz : 10;
    return zOverlap(d, probeZ || 0, hz, (specimen && specimen.L) || 0, !!(specimen && specimen.pipe));
  }

  const KIND_NAMES = {
    backwall: 'Backwall', radius: 'Radius', corner: 'Corner (defect + surface)', geometry: 'Geometry', lamination: 'Lamination',
    perspex: 'Perspex insert', tip: 'Tip diffraction', transmitted: 'Transmitted pulse', sdh: 'SDH', volumetric: 'Volumetric defect', defect: 'Defect',
  };

  /**
   * Human readable label for an echo, e.g. 'Backwall 25.0 mm (leg 1)'.
   * @param {object} echo
   * @returns {string}
   */
  function describe(echo) {
    if (!echo) return '';
    let name = KIND_NAMES[echo.kind] || echo.kind;
    if (echo.kind === 'sdh' && echo.label) name = 'SDH ' + echo.label;
    else if ((echo.kind === 'defect' || echo.kind === 'volumetric' || echo.kind === 'lamination' || echo.kind === 'corner' || echo.kind === 'tip') && echo.label) name = echo.label + (echo.kind === 'corner' ? ' (corner)' : echo.kind === 'tip' ? ' (tip)' : '');
    else if (echo.kind === 'geometry' && echo.tag) name = 'Geometry (' + echo.tag + ')';
    if (echo.tag === 'tandem') name = 'Tandem: ' + name;
    const p = echo.path === undefined ? '' : ' ' + M.fmt(echo.path, 1) + ' mm';
    const leg = echo.leg ? ' (leg ' + echo.leg + ')' : '';
    return name + p + leg;
  }

  // ------------------------------------------------------------------ self test
  function dB(a, b) { return 20 * Math.log10(a / b); }
  function run(spec, probe, display, defects, maxPath) {
    const p = Object.assign({ mode: probe.angle === 0 ? 'comp' : 'shear', freq: 5, diameter: 10, wedgeVel: 2.74, method: 'pe', z: spec.L / 2, side: 1, skew: 0 }, probe);
    const d = UT.probe.derive(p, spec);
    return trace({ specimen: spec, probe: p, derived: d, display: display || { skips: 3 }, defects: defects || [], opts: { maxPath: maxPath || 100, fanCount: 21 } });
  }
  function near(echoes, kind, path, tol) {
    let best = null;
    for (const e of echoes) if ((!kind || e.kind === kind) && Math.abs(e.path - path) <= tol && (!best || e.amp > best.amp)) best = e;
    return best;
  }

  function __selftest() {
    const f = [];
    const S = UT.specimens;
    // (a) V1 narrow, 0° single: 25/50/75/100 decreasing 2–5 dB
    const v1n = run(S.v1({ face: 'narrow' }), { angle: 0, x: 150 }, { skips: 3 }, [], 125);
    let prev = null;
    for (const p of [25, 50, 75, 100]) {
      const e = near(v1n.echoes, 'backwall', p, 0.5);
      if (!e) { f.push('v1 narrow backwall ' + p + ' missing'); continue; }
      if (prev) { const drop = dB(prev.amp, e.amp); if (drop < 2 || drop > 5) f.push('v1 narrow drop ' + p + ' = ' + drop.toFixed(2) + ' dB'); }
      prev = e;
    }
    // (b) V1 wide: 45° and 0° at x = 100 → 100/200/300
    for (const ang of [0, 45, 60]) {
      const r = run(S.v1(), { angle: ang, x: 100 }, { skips: 3 }, [], 400);
      let last = null;
      for (const p of [100, 200, 300]) {
        const e = ang === 0 ? (near(r.echoes, 'radius', p, 1) || near(r.echoes, 'backwall', p, 1)) : near(r.echoes, 'radius', p, 1);
        if (!e) { f.push('v1 wide ' + ang + ' radius ' + p + ' missing'); continue; }
        if (last && !(e.amp < last.amp)) f.push('v1 wide ' + ang + ' radius ' + p + ' not decreasing');
        last = e;
      }
    }
    // (c) V2 sequences
    const seqs = [[1, [25, 100, 175]], [-1, [50, 125, 200]]];
    for (const s of seqs) {
      const r = run(S.v2(), { angle: 45, x: 60, side: s[0] }, { skips: 3 }, [], 250);
      let last = null;
      for (const p of s[1]) {
        const e = near(r.echoes, 'radius', p, 1);
        if (!e) { f.push('v2 side ' + s[0] + ' radius ' + p + ' missing'); continue; }
        if (last && !(e.amp < last.amp)) f.push('v2 side ' + s[0] + ' radius ' + p + ' not decreasing');
        last = e;
      }
    }
    // (d) root crack corner echo at 40 with a flat-root plate
    const pw = S.plateWeld({ T: 20, rootHeight: 0, capHeight: 0 });
    const crack = S.defectPresets.rootCrack(pw);
    const rc = run(pw, { angle: 60, x: 34.6 }, { skips: 3 }, [crack], 100);
    const corner = near(rc.echoes, 'corner', 40, 1);
    if (!corner) f.push('root crack corner echo missing');
    else {
      for (const dx of [-15, 15]) {
        const r2 = run(pw, { angle: 60, x: 34.6 + dx }, { skips: 3 }, [crack], 100);
        const c2 = near(r2.echoes, 'corner', 40, 3);
        if (c2 && dB(corner.amp, c2.amp) < 20) f.push('corner echo still present at x ' + (34.6 + dx));
      }
    }
    // (e) IOW 13 mm SDH (frozen block: hole at (240, 13)) → path 26.0
    const iow = S.iow();
    const h13 = iow.holes.find(function (h) { return h.label === '13mm'; });
    if (h13) {
      const x0 = h13.x + h13.y * Math.tan(60 * DEG);
      const r = run(iow, { angle: 60, x: x0 }, { skips: 3 }, [], 100);
      const e = near(r.echoes, 'sdh', 26, 0.5);
      if (!e) f.push('iow 13 mm SDH echo at 26 missing');
      else {
        for (const dx of [-5, -3, 3, 5]) {
          const e2 = near(run(iow, { angle: 60, x: x0 + dx }, { skips: 3 }, [], 100).echoes, 'sdh', 26, 3);
          if (e2 && e2.amp > e.amp) f.push('iow SDH louder at dx ' + dx);
        }
      }
    }
    // (f) lamination: echo + backwall ≥ 6 dB down
    const lp = S.laminationPlate({ T: 25 });
    const lam = S.defectPresets.lamination(lp);
    const clean = run(lp, { angle: 0, x: -60 }, { skips: 3 }, [lam], 100);
    const over = run(lp, { angle: 0, x: 40 }, { skips: 3 }, [lam], 100);
    const bwClean = near(clean.echoes, 'backwall', 25, 0.5);
    const bwOver = near(over.echoes, 'backwall', 25, 0.5);
    const lamEcho = near(over.echoes, 'lamination', 12.5, 0.5);
    if (!lamEcho) f.push('lamination echo missing');
    if (!bwClean) f.push('clean backwall missing');
    else if (bwOver && dB(bwClean.amp, bwOver.amp) < 6) f.push('backwall not shadowed by lamination');
    // (g) clean plate, angle probe: no backwall
    const g = run(S.plateWeld({ T: 20 }), { angle: 60, x: 40 }, { skips: 3 }, [], 100);
    if (g.echoes.some(function (e) { return e.kind === 'backwall'; })) f.push('angle probe backwall echo on a clean plate');
    if (!g.centre.pts.length || g.fan.length !== 21) f.push('centre/fan shape');
    // (h) LOF on the right fusion face: 60° (leg 2) beats 45° by ≥ 6 dB (reduced scan)
    const pl = S.plateWeld({ T: 20 });
    const lof = S.defectPresets.lof(pl);
    const bestOf = function (angle, xs) {
      let b = 0;
      for (const x of xs) for (const e of run(pl, { angle, x }, { skips: 3 }, [lof], 100).echoes) if ((e.kind === 'defect' || e.kind === 'corner' || e.kind === 'tip') && e.amp > b) b = e.amp;
      return b;
    };
    const b60 = bestOf(60, [55, 60, 65]), b45 = bestOf(45, [40, 45, 50, 55]);
    if (!(b60 > 0) || dB(b60, Math.max(b45, 1e-9)) < 6) f.push('LOF 60 vs 45: ' + b60 + ' / ' + b45);
    // through transmission: clean plate transmits 1, a lamination under the probe blocks it
    const ttc = run(pl, { angle: 0, x: 40, method: 'tt' }, { skips: 3 }, [], 100).echoes[0];
    const ttb = run(pl, { angle: 0, x: 40, method: 'tt' }, { skips: 3 }, [S.defectPresets.lamination(pl)], 100).echoes[0];
    if (!ttc || ttc.kind !== 'transmitted' || Math.abs(ttc.amp - 1) > 1e-6 || Math.abs(ttc.path - 20) > 1e-6) f.push('tt clean');
    if (!ttb || ttb.amp > 0.05) f.push('tt shadow');
    // describe
    if (typeof describe({ kind: 'backwall', path: 25, leg: 1 }) !== 'string') f.push('describe');
    return f;
  }

  UT.rays = { trace, zFactor, describe, emission, dirAt, arcHit, mergeEchoes, __selftest };
})(window.UT = window.UT || {});
