/* 20-probe.js — probe model: Snell's law, near field, piston beam spread, wedge delay, presets, probe
 * library (v2), focus, Rayleigh velocity, PA sweep. Pure functions, no DOM.
 */
(function (UT) {
  'use strict';
  const C = UT.consts;
  const M = UT.math;

  const presets = {
    0: { angle: 0, mode: 'comp', colour: C.PROBE_COLOURS[0], wedgePath: 0, shoeWidth: 20, shoeHeight: 18, label: '0°' },
    45: { angle: 45, mode: 'shear', colour: C.PROBE_COLOURS[45], wedgePath: 12, shoeWidth: 24, shoeHeight: 14, label: '45°' },
    60: { angle: 60, mode: 'shear', colour: C.PROBE_COLOURS[60], wedgePath: 12, shoeWidth: 24, shoeHeight: 14, label: '60°' },
    70: { angle: 70, mode: 'shear', colour: C.PROBE_COLOURS[70], wedgePath: 12, shoeWidth: 26, shoeHeight: 13, label: '70°' },
  };

  // ------------------------------------------------------------------ probe library (v2, SPEC-v2 §3.5)
  // crystal: {a: size in the beam plane (mm), b: size across the beam / along the weld (mm), shape}
  const library = [
    { id: 'gen-0-5-10', name: 'Generic 0° 5 MHz ⌀10 (UTman default)', maker: 'generic', family: 'straight', angle: 0, freq: 5, crystal: { a: 10, b: 10, shape: 'round' }, wedgePath: 0, crystalType: 'single', notes: 'v1 default 0° probe' },
    { id: 'gen-45-5-10', name: 'Generic 45° 5 MHz ⌀10 (UTman default)', maker: 'generic', family: 'angle', angle: 45, freq: 5, crystal: { a: 10, b: 10, shape: 'round' }, wedgePath: 12, crystalType: 'single', notes: 'v1 default' },
    { id: 'gen-60-5-10', name: 'Generic 60° 5 MHz ⌀10 (UTman default)', maker: 'generic', family: 'angle', angle: 60, freq: 5, crystal: { a: 10, b: 10, shape: 'round' }, wedgePath: 12, crystalType: 'single', notes: 'v1 default' },
    { id: 'gen-70-5-10', name: 'Generic 70° 5 MHz ⌀10 (UTman default)', maker: 'generic', family: 'angle', angle: 70, freq: 5, crystal: { a: 10, b: 10, shape: 'round' }, wedgePath: 12, crystalType: 'single', notes: 'v1 default' },
    { id: 'mb4s', name: 'MB 4 S (0°, 4 MHz, ⌀10)', maker: 'GE/Krautkrämer', family: 'straight', angle: 0, freq: 4, crystal: { a: 10, b: 10, shape: 'round' }, wedgePath: 0, crystalType: 'single', notes: 'Single-crystal straight-beam probe' },
    { id: 'mb2s', name: 'MB 2 S (0°, 2 MHz, ⌀24)', maker: 'GE/Krautkrämer', family: 'straight', angle: 0, freq: 2, crystal: { a: 24, b: 24, shape: 'round' }, wedgePath: 0, crystalType: 'single', notes: 'Large straight-beam probe, long near field' },
    { id: 'k2n', name: 'K 2 N (0°, 2 MHz, ⌀24)', maker: 'GE/Krautkrämer', family: 'straight', angle: 0, freq: 2, crystal: { a: 24, b: 24, shape: 'round' }, wedgePath: 0, crystalType: 'single', notes: 'Straight-beam probe for thick sections' },
    { id: 'mseb4', name: 'MSEB 4 (0°, twin, 4 MHz, 8×9)', maker: 'GE/Krautkrämer', family: 'twin', angle: 0, freq: 4, crystal: { a: 8, b: 9, shape: 'rect' }, wedgePath: 0, crystalType: 'twin', notes: 'Twin-crystal (TR) probe, no dead zone' },
    { id: 'mwb45-2', name: 'MWB 45-2 (45°, 2 MHz, 8×9)', maker: 'GE/Krautkrämer', family: 'angle', angle: 45, freq: 2, crystal: { a: 9, b: 8, shape: 'rect' }, wedgePath: 10, crystalType: 'single', notes: 'Miniature angle probe' },
    { id: 'mwb60-2', name: 'MWB 60-2 (60°, 2 MHz, 8×9)', maker: 'GE/Krautkrämer', family: 'angle', angle: 60, freq: 2, crystal: { a: 9, b: 8, shape: 'rect' }, wedgePath: 10, crystalType: 'single', notes: 'Miniature angle probe' },
    { id: 'mwb70-2', name: 'MWB 70-2 (70°, 2 MHz, 8×9)', maker: 'GE/Krautkrämer', family: 'angle', angle: 70, freq: 2, crystal: { a: 9, b: 8, shape: 'rect' }, wedgePath: 10, crystalType: 'single', notes: 'Miniature angle probe' },
    { id: 'mwb45-4', name: 'MWB 45-4 (45°, 4 MHz, 8×9)', maker: 'GE/Krautkrämer', family: 'angle', angle: 45, freq: 4, crystal: { a: 9, b: 8, shape: 'rect' }, wedgePath: 10, crystalType: 'single', notes: 'Miniature angle probe' },
    { id: 'mwb60-4', name: 'MWB 60-4 (60°, 4 MHz, 8×9)', maker: 'GE/Krautkrämer', family: 'angle', angle: 60, freq: 4, crystal: { a: 9, b: 8, shape: 'rect' }, wedgePath: 10, crystalType: 'single', notes: 'Miniature angle probe' },
    { id: 'mwb70-4', name: 'MWB 70-4 (70°, 4 MHz, 8×9)', maker: 'GE/Krautkrämer', family: 'angle', angle: 70, freq: 4, crystal: { a: 9, b: 8, shape: 'rect' }, wedgePath: 10, crystalType: 'single', notes: 'Miniature angle probe' },
    { id: 'wb45-2n', name: 'WB 45-2 N (45°, 2 MHz, 20×22)', maker: 'GE/Krautkrämer', family: 'angle', angle: 45, freq: 2, crystal: { a: 22, b: 20, shape: 'rect' }, wedgePath: 16, crystalType: 'single', notes: 'Large angle probe for thick sections' },
    { id: 'wb60-2n', name: 'WB 60-2 N (60°, 2 MHz, 20×22)', maker: 'GE/Krautkrämer', family: 'angle', angle: 60, freq: 2, crystal: { a: 22, b: 20, shape: 'rect' }, wedgePath: 16, crystalType: 'single', notes: 'Large angle probe for thick sections' },
    { id: 'wb70-2n', name: 'WB 70-2 N (70°, 2 MHz, 20×22)', maker: 'GE/Krautkrämer', family: 'angle', angle: 70, freq: 2, crystal: { a: 22, b: 20, shape: 'rect' }, wedgePath: 16, crystalType: 'single', notes: 'Large angle probe for thick sections' },
    { id: 'a430s-45', name: 'A430S-SB 45° (5 MHz, 16×16)', maker: 'Olympus', family: 'angle', angle: 45, freq: 5, crystal: { a: 16, b: 16, shape: 'rect' }, wedgePath: 14, crystalType: 'single', notes: '0.625 in square element + ABWS-4 wedge' },
    { id: 'a430s-60', name: 'A430S-SB 60° (5 MHz, 16×16)', maker: 'Olympus', family: 'angle', angle: 60, freq: 5, crystal: { a: 16, b: 16, shape: 'rect' }, wedgePath: 14, crystalType: 'single', notes: '0.625 in square element + ABWS-6 wedge' },
    { id: 'a430s-70', name: 'A430S-SB 70° (5 MHz, 16×16)', maker: 'Olympus', family: 'angle', angle: 70, freq: 5, crystal: { a: 16, b: 16, shape: 'rect' }, wedgePath: 14, crystalType: 'single', notes: '0.625 in square element + ABWS-7 wedge' },
    { id: 'twin-60-4', name: 'Twin 60° 4 MHz 8×9 (TR angle)', maker: 'generic', family: 'twin', angle: 60, freq: 4, crystal: { a: 9, b: 8, shape: 'rect' }, wedgePath: 10, crystalType: 'twin', notes: 'Twin-crystal angle probe: near-surface sensitivity' },
    { id: 'tofd-60-5-6', name: 'TOFD 60° L 5 MHz ⌀6', maker: 'generic', family: 'tofd', angle: 60, freq: 5, crystal: { a: 6, b: 6, shape: 'round' }, wedgePath: 12, crystalType: 'single', notes: 'Longitudinal-wave TOFD pair' },
    { id: 'pa-16-1.0', name: 'PA 16 el. × 1.0 mm 5 MHz', maker: 'generic', family: 'pa', angle: 60, freq: 5, crystal: { a: 16, b: 10, shape: 'rect' }, wedgePath: 12, crystalType: 'array', notes: 'Linear array used by the phased-array mode' },
  ];
  const libById = {};
  library.forEach(function (p) { libById[p.id] = p; });

  /** Library entry by id (or null). */
  function libEntry(id) { return libById[id] || null; }

  /**
   * State patch that selects a library probe: {libId, angle, mode, freq, diameter, crystal, crystalDims}.
   * @param {string} id
   */
  function select(id) {
    const p = libById[id];
    if (!p) return null;
    return {
      libId: p.id, angle: p.angle, mode: p.angle === 0 ? 'comp' : (p.family === 'tofd' ? 'comp' : 'shear'),
      freq: p.freq, diameter: p.crystal.a, crystalDims: Object.assign({}, p.crystal),
      crystal: p.crystalType === 'twin' ? 'twin' : 'single',
    };
  }

  /** Library entry that matches an angle within the current family (falls back to the generic probe). */
  function libForAngle(angleDeg, family, freq) {
    const fam = family || 'angle';
    let best = null, bestScore = Infinity;
    for (const p of library) {
      if (fam === 'straight' ? p.angle !== 0 : (p.family !== fam || Math.abs(p.angle - angleDeg) > 0.5)) continue;
      const score = Math.abs((p.freq || 5) - (freq || 5)) + (p.maker === 'generic' ? 0.01 : 0);
      if (score < bestScore) { bestScore = score; best = p; }
    }
    return best || libById[angleDeg === 0 ? 'gen-0-5-10' : 'gen-60-5-10'];
  }

  /** Snell: theta1 in medium v1 → theta2 in medium v2 (deg) or null past the critical angle. */
  function snell(theta1Deg, v1, v2) { return M.snellAngle(theta1Deg, v1, v2); }

  /** Critical angles in the wedge for a given wedge velocity (deg). */
  function criticalAngles(vWedge, material) {
    const vC = (material && material.vComp) || C.V_COMP_STEEL;
    const vS = (material && material.vShear) || C.V_SHEAR_STEEL;
    const first = M.rad2deg(Math.asin(M.clamp(vWedge / vC, 0, 1)));
    const second = M.rad2deg(Math.asin(M.clamp(vWedge / vS, 0, 1)));
    return { first, second };
  }

  /** Wedge (shoe) angle that produces the requested refracted angle in the material. */
  function wedgeAngleFor(refractedDeg, mode, vWedge, material) {
    if (!refractedDeg) return 0;
    const v2 = mode === 'comp' ? ((material && material.vComp) || C.V_COMP_STEEL) : ((material && material.vShear) || C.V_SHEAR_STEEL);
    const a = snell(refractedDeg, v2, vWedge);   // reverse Snell: sin(wedge)/vWedge = sin(refracted)/v2
    return a === null ? 90 : a;
  }

  /** Near-field length (mm) for round (a = d) or rectangular crystals (Krautkrämer rectangular correction k). */
  function nearFieldOf(dims, freq, vel) {
    const a = dims.a || 10, b = dims.b || a;
    const lambda = vel / freq;
    if ((dims.shape || 'round') !== 'rect') return a * a / (4 * lambda);
    const big = Math.max(a, b), small = Math.min(a, b), r = small / big;
    const k = r >= 0.95 ? 1.37 : r >= 0.85 ? 1.30 : r >= 0.7 ? 1.15 : r >= 0.55 ? 1.04 : 1.0;
    return k * big * big / (4 * lambda);
  }

  /** Shoe drawing preset for an arbitrary angle (nearest of 45/60/70; 0° for straight probes). */
  function presetFor(angle) {
    if (!angle) return presets[0];
    if (presets[angle]) return presets[angle];
    return angle < 52.5 ? presets[45] : angle < 65 ? presets[60] : presets[70];
  }

  /**
   * Derive all physical quantities of a probe on a specimen.
   * @param {object} probe  UT.state.probe
   * @param {object} specimen  UT.state.specimen (for material velocities; may be null)
   */
  function derive(probe, specimen) {
    const mat = (specimen && specimen.material) || { vShear: C.V_SHEAR_STEEL, vComp: C.V_COMP_STEEL };
    const nominal = probe.method === 'pa' ? probe.paFrom : (probe.angle || 0);   // requested refracted angle (deg)
    const isZero = nominal === 0;
    const mode = isZero ? 'comp' : (probe.mode === 'comp' ? 'comp' : 'shear');
    const vel = mode === 'comp' ? mat.vComp : mat.vShear;
    const vWedge = probe.wedgeVel || C.V_PERSPEX;
    // Critical limit of the refracted angle (QA round 2 #1): Snell gives sin(wedge) = sin(refracted)·vWedge/vel, so when
    // the material is slower than the wedge (copper vS 2.33, perspex vS 1.43 < 2.74) no wedge angle can produce a
    // refracted angle above asin(vel/vWedge) (copper 58.3°, perspex 31.5°). The nominal angle is clamped 0.1° below that
    // limit (same physics as the PA focal-law validity in 56-pa) instead of reporting an impossible 90° wedge.
    const angleLimit = !isZero && vWedge > vel ? M.rad2deg(Math.asin(vel / vWedge)) : 90;
    const angleLimited = !isZero && nominal > angleLimit - 0.1;
    const angle = angleLimited ? angleLimit - 0.1 : nominal;
    const freq = probe.freq || 5;                 // MHz
    const dims = probe.crystalDims || { a: probe.diameter || 10, b: probe.diameter || 10, shape: 'round' };
    const a = dims.a || probe.diameter || 10;     // crystal size in the beam plane (mm)
    const b = dims.b || a;                        // across the beam (along the weld)
    const D = a;                                  // v1 compatibility: 'diameter' = size in the beam plane
    const lambda = vel / freq;                    // mm
    // near field: circular a²/(4λ); rectangular a_max²·k/(4λ) with k = 1.37 (b/a 1), 1.30 (0.9), 1.15 (0.8), 1.04 (0.6), 1.0 (≤ 0.5)
    const nearField = nearFieldOf(dims, freq, vel);
    const s6 = M.clamp(0.51 * lambda / a, 0, 0.999);
    const s20 = M.clamp(0.87 * lambda / a, 0, 0.999);   // pulse-echo −20 dB edge (piston model; was 1.08 in v1)
    const sNull = M.clamp(1.22 * lambda / a, 0, 0.999);
    const sMax = M.clamp(1.8 * lambda / a, 0, 0.99);
    const s20z = M.clamp(0.87 * lambda / b, 0, 0.999);  // −20 dB edge across the beam (z, along the weld) — SPEC-v2 §3.1
    const halfAngle6dB = M.rad2deg(Math.asin(s6));
    const halfAngle20dB = M.rad2deg(Math.asin(s20));
    const nullAngle = M.rad2deg(Math.asin(sNull));
    const fanMax = M.rad2deg(Math.asin(sMax));
    const preset = presetFor(nominal);
    const lib = libById[probe.libId] || null;
    const wedgeAngle = isZero ? 0 : wedgeAngleFor(angle, mode, vWedge, mat);
    const wedgePath = isZero ? 0 : ((lib && lib.wedgePath) || preset.wedgePath || 12);
    const wedgeDelayUs = 2 * wedgePath / vWedge;  // two-way
    const crit = criticalAngles(vWedge, mat);
    const focus = probe.focus && probe.focus.on && angle <= 70 ? { on: true, F: M.clamp(probe.focus.F || 30, 10, 150) } : { on: false, F: (probe.focus && probe.focus.F) || 30 };
    const limitNote = angleLimited
      ? '   ** ' + UT.i18n.t('{angle}° {mode} not possible in {mat} (limit {limit}°): refracted angle limited to {actual}°', {
        angle: nominal.toFixed(1), mode: mode === 'comp' ? "comp' wave" : 'shear wave', mat: mat.name || mat.key || 'this material', limit: angleLimit.toFixed(1), actual: angle.toFixed(1),
      }) + ' **'
      : '';
    return {
      refracted: angle,
      /** Requested refracted angle (probe.angle / paFrom); equals `refracted` unless `angleLimited`. */
      nominalAngle: nominal,
      /** Largest refracted angle this wedge can generate in the material (asin(vel/vWedge); 90 when unlimited). */
      angleLimit,
      /** true when the nominal angle exceeds the critical limit and `refracted` was clamped to angleLimit − 0.1°. */
      angleLimited,
      mode,
      wedgeAngle,
      vel,
      vWedge,
      vRayleigh: ((0.87 + 1.12 * (mat.poisson === undefined ? 0.29 : mat.poisson)) / (1 + (mat.poisson === undefined ? 0.29 : mat.poisson))) * mat.vShear,   // ≈ 0.92 vS for ν 0.29
      lambda,
      nearField,
      halfAngle6dB,
      halfAngle20dB,
      /** −20 dB half-angle across the beam (deg, from crystalB): hz = path·tan(halfAngle20dBz) + crystalB/2 (§3.1). */
      halfAngle20dBz: M.rad2deg(Math.asin(s20z)),
      nullAngle,
      fanMax,
      sidelobeDb: -17.6,
      wedgeDelayUs,
      wedgePath,
      indexOffset: isZero ? preset.shoeWidth / 2 : 12,
      shoeWidth: preset.shoeWidth,
      shoeHeight: preset.shoeHeight,
      colour: probe.method === 'pa' ? C.PROBE_COLOURS.pa : (C.PROBE_COLOURS[nominal] || preset.colour || '#00c000'),
      crystal: probe.crystal || 'single',
      freq,
      diameter: D,
      crystalA: a,
      crystalB: b,
      crystalShape: dims.shape || 'round',
      libId: lib ? lib.id : null,
      libName: lib ? lib.name : null,
      focus,
      firstCritical: crit.first,
      secondCritical: crit.second,
      /** Launch direction unit vector in XY (beam heads toward −x for side +1). */
      dir: { x: -(probe.side || 1) * Math.sin(M.deg2rad(angle)), y: Math.cos(M.deg2rad(angle)) },
      /** One-way piston directivity weight at an angle offset from the beam axis (deg). */
      directivity(deltaDeg) { return M.pistonDirectivity(deltaDeg, a, lambda); },
      /** Human readable physics line for the status bar. */
      statusLine: `Angle of Sound Transmission in Perspex Shoe=${wedgeAngle.toFixed(1)}°  Velocity in Wedge (Shoe) = ${Math.round(vWedge * 1000)} m/s   [ Shear Wave Angle=${(mode === 'shear' ? angle : 0).toFixed(1)}°   Velocity=${mode === 'shear' ? Math.round(vel * 1000) : 0} m/s]   [ Comp' Wave Angle=${(mode === 'comp' ? angle : 0).toFixed(1)}°   Velocity=${mode === 'comp' ? Math.round(vel * 1000) : 0} m/s]${limitNote}`,
    };
  }

  /** Angles of the phased-array sweep. */
  function paAngles(probe) {
    const out = [];
    const step = Math.max(0.5, probe.paStep || 1);
    for (let a = probe.paFrom; a <= probe.paTo + 1e-9; a += step) out.push(+a.toFixed(2));
    return out;
  }

  /** Skip geometry helpers for a refracted angle on a plate of thickness T. */
  function skip(angleDeg, T) {
    const t = Math.tan(M.deg2rad(angleDeg)), c = Math.cos(M.deg2rad(angleDeg));
    return { halfSkip: T * t, fullSkip: 2 * T * t, halfPath: T / c, fullPath: 2 * T / c };
  }

  UT.probe = {
    presets, presetFor, library, libEntry, select, libForAngle, snell, criticalAngles, wedgeAngleFor, derive, paAngles, skip,
    __selftest() {
      const f = [];
      const d60 = derive({ angle: 60, freq: 5, diameter: 10, wedgeVel: 2.74, side: 1 }, null);
      if (Math.abs(d60.wedgeAngle - 47.1) > 0.2) f.push('wedge 60 -> ' + d60.wedgeAngle);
      const d45 = derive({ angle: 45, freq: 5, diameter: 10, wedgeVel: 2.74, side: 1 }, null);
      if (Math.abs(d45.wedgeAngle - 36.7) > 0.2) f.push('wedge 45 -> ' + d45.wedgeAngle);
      const d70 = derive({ angle: 70, freq: 5, diameter: 10, wedgeVel: 2.74, side: 1 }, null);
      if (Math.abs(d70.wedgeAngle - 52.6) > 0.3) f.push('wedge 70 -> ' + d70.wedgeAngle);
      if (Math.abs(d60.nearField - 38.6) > 0.5) f.push('near field ' + d60.nearField);
      if (Math.abs(d60.lambda - 0.648) > 0.01) f.push('lambda ' + d60.lambda);
      if (Math.abs(d60.halfAngle20dB - M.rad2deg(Math.asin(0.87 * 0.648 / 10))) > 0.01) f.push('halfAngle20dB');
      if (Math.abs(d60.halfAngle20dBz - d60.halfAngle20dB) > 0.01) f.push('halfAngle20dBz (round) ' + d60.halfAngle20dBz);
      const dRect = derive({ angle: 60, freq: 2, crystalDims: { a: 9, b: 8, shape: 'rect' }, wedgeVel: 2.74, side: 1 }, null);
      if (Math.abs(dRect.halfAngle20dBz - M.rad2deg(Math.asin(0.87 * dRect.lambda / 8))) > 0.01) f.push('halfAngle20dBz (rect) ' + dRect.halfAngle20dBz);
      if (Math.abs(20 * Math.log10(d60.directivity(d60.halfAngle20dB)) + 10) > 0.6) f.push('directivity at θ20 ≠ −10 dB one-way: ' + (20 * Math.log10(d60.directivity(d60.halfAngle20dB))).toFixed(2));
      if (Math.abs(20 * Math.log10(d60.directivity(d60.halfAngle6dB)) + 3) > 0.4) f.push('directivity at θ6 ≠ −3 dB one-way');
      const d0 = derive({ angle: 0, freq: 5, diameter: 10 }, null);
      if (d0.mode !== 'comp' || Math.abs(d0.vel - 5.9) > 1e-9) f.push('0deg comp');
      const sel = select('mwb60-2');
      if (!sel || sel.freq !== 2 || sel.crystalDims.a !== 9) f.push('library select');
      const dm = derive(Object.assign({ wedgeVel: 2.74, side: 1 }, sel), null);
      if (Math.abs(dm.nearField - 1.30 * (9 * 9 * 2) / (4 * 3.24)) > 0.05) f.push('mwb60-2 near field ' + dm.nearField);
      const d55 = derive({ angle: 55, freq: 5, diameter: 10, wedgeVel: 2.74, side: 1 }, null);
      if (!(d55.wedgeAngle > 40 && d55.wedgeAngle < 47.1)) f.push('custom 55° wedge ' + d55.wedgeAngle);
      if (Math.abs(d60.vRayleigh - 0.926 * 3.24) > 0.02) f.push('vRayleigh ' + d60.vRayleigh);
      if (d60.angleLimited || d60.nominalAngle !== 60 || d60.angleLimit !== 90) f.push('steel 60° must not be limited');
      // QA round 2 #1: refracted angle above the critical limit of a slow material is clamped (never a 90° wedge)
      const cu = { key: 'copper', name: 'Copper', vComp: 4.66, vShear: 2.33 };
      const dCu = derive({ angle: 60, freq: 5, diameter: 10, wedgeVel: 2.74, side: 1 }, { material: cu });
      const cuLimit = M.rad2deg(Math.asin(2.33 / 2.74));   // 58.26°
      if (!dCu.angleLimited || Math.abs(dCu.refracted - (cuLimit - 0.1)) > 1e-6 || dCu.nominalAngle !== 60) f.push('copper 60° limit ' + dCu.refracted);
      if (!(dCu.wedgeAngle < 90) || !Number.isFinite(dCu.wedgeAngle) || Math.abs(Math.sin(M.deg2rad(dCu.wedgeAngle)) / 2.74 - Math.sin(M.deg2rad(dCu.refracted)) / 2.33) > 1e-6) f.push('copper wedge (Snell) ' + dCu.wedgeAngle);
      if (dCu.statusLine.indexOf('not possible in Copper') < 0 || dCu.statusLine.indexOf('Shear Wave Angle=' + dCu.refracted.toFixed(1)) < 0) f.push('copper statusLine ' + dCu.statusLine);
      if (Math.abs(dCu.dir.x + Math.sin(M.deg2rad(dCu.refracted))) > 1e-9) f.push('copper dir uses the limited angle');
      const dCu45 = derive({ angle: 45, freq: 5, diameter: 10, wedgeVel: 2.74, side: 1 }, { material: cu });
      if (dCu45.angleLimited || dCu45.refracted !== 45 || Math.abs(dCu45.wedgeAngle - M.rad2deg(Math.asin(Math.sin(M.deg2rad(45)) * 2.74 / 2.33))) > 1e-6) f.push('copper 45° must stay 45°');
      const dPx = derive({ angle: 60, freq: 5, diameter: 10, wedgeVel: 2.74, side: 1 }, { material: { key: 'perspex', name: 'Perspex (PMMA)', vComp: 2.74, vShear: 1.43 } });
      if (!dPx.angleLimited || Math.abs(dPx.refracted - (M.rad2deg(Math.asin(1.43 / 2.74)) - 0.1)) > 1e-6 || !(dPx.wedgeAngle < 90)) f.push('perspex 60° limit ' + dPx.refracted + ' wedge ' + dPx.wedgeAngle);
      return f;
    },
  };
})(window.UT = window.UT || {});
