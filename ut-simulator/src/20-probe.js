/* 20-probe.js — probe model: Snell's law, near field, beam spread, wedge delay, presets, PA sweep. */
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

  /** Wedge (shoe) angle that produces the requested refracted angle in steel. */
  function wedgeAngleFor(refractedDeg, mode, vWedge, material) {
    if (!refractedDeg) return 0;
    const v2 = mode === 'comp' ? ((material && material.vComp) || C.V_COMP_STEEL) : ((material && material.vShear) || C.V_SHEAR_STEEL);
    const a = snell(refractedDeg, v2, vWedge);   // reverse Snell: sin(wedge)/vWedge = sin(refracted)/v2
    return a === null ? 90 : a;
  }

  /**
   * Derive all physical quantities of a probe on a specimen.
   * @param {object} probe  UT.state.probe
   * @param {object} specimen  UT.state.specimen (for material velocities; may be null)
   */
  function derive(probe, specimen) {
    const mat = (specimen && specimen.material) || { vShear: C.V_SHEAR_STEEL, vComp: C.V_COMP_STEEL };
    const angle = probe.method === 'pa' ? probe.paFrom : (probe.angle || 0);
    const isZero = angle === 0;
    const mode = isZero ? 'comp' : (probe.mode === 'comp' ? 'comp' : 'shear');
    const vel = mode === 'comp' ? mat.vComp : mat.vShear;
    const vWedge = probe.wedgeVel || C.V_PERSPEX;
    const freq = probe.freq || 5;                 // MHz
    const D = probe.diameter || 10;               // mm
    const lambda = vel / freq;                    // mm
    const nearField = (D * D * freq) / (4 * vel); // mm  = D²/(4λ)
    const s6 = M.clamp(0.51 * lambda / D, 0, 0.999);
    const s20 = M.clamp(1.08 * lambda / D, 0, 0.999);
    const halfAngle6dB = M.rad2deg(Math.asin(s6));
    const halfAngle20dB = M.rad2deg(Math.asin(s20));
    const preset = presets[angle] || presets[60];
    const wedgeAngle = isZero ? 0 : wedgeAngleFor(angle, mode, vWedge, mat);
    const wedgePath = isZero ? 0 : (preset.wedgePath || 12);
    const wedgeDelayUs = 2 * wedgePath / vWedge;  // two-way
    const crit = criticalAngles(vWedge, mat);
    return {
      refracted: angle,
      mode,
      wedgeAngle,
      vel,
      vWedge,
      lambda,
      nearField,
      halfAngle6dB,
      halfAngle20dB,
      wedgeDelayUs,
      wedgePath,
      indexOffset: isZero ? preset.shoeWidth / 2 : 12,
      shoeWidth: preset.shoeWidth,
      shoeHeight: preset.shoeHeight,
      colour: probe.method === 'pa' ? C.PROBE_COLOURS.pa : (C.PROBE_COLOURS[angle] || '#00c000'),
      crystal: probe.crystal || 'single',
      freq,
      diameter: D,
      firstCritical: crit.first,
      secondCritical: crit.second,
      /** Launch direction unit vector in XY (beam heads toward −x for side +1). */
      dir: { x: -(probe.side || 1) * Math.sin(M.deg2rad(angle)), y: Math.cos(M.deg2rad(angle)) },
      /** Human readable physics line for the status bar. */
      statusLine: `Angle of Sound Transmission in Perspex Shoe=${wedgeAngle.toFixed(1)}°  Velocity in Wedge (Shoe) = ${Math.round(vWedge * 1000)} m/s   [ Shear Wave Angle=${(mode === 'shear' ? angle : 0).toFixed(1)}°   Velocity=${mode === 'shear' ? Math.round(vel * 1000) : 0} m/s]   [ Comp' Wave Angle=${(mode === 'comp' ? angle : 0).toFixed(1)}°   Velocity=${mode === 'comp' ? Math.round(vel * 1000) : 0} m/s]`,
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
    presets, snell, criticalAngles, wedgeAngleFor, derive, paAngles, skip,
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
      const d0 = derive({ angle: 0, freq: 5, diameter: 10 }, null);
      if (d0.mode !== 'comp' || Math.abs(d0.vel - 5.9) > 1e-9) f.push('0deg comp');
      return f;
    },
  };
})(window.UT = window.UT || {});
