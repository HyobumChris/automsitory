/* 40-ascan.js — A-scan synthesis, time base / calibration, gain, gates, DAC/TCG, pulser/receiver,
 * material grass, peak memory, readouts, phased-array S-scan columns and the frame pipeline (UT.compute).
 * Pure functions of their arguments except compute() (the ONLY reader of UT.state here), the test API
 * and the convenience defaults of autoGain()/snapshot()/tcgGainAt() (which fall back to UT.frame/UT.state
 * when no frame/instrument is passed).
 */
// SPEC NOTES (decisions where the spec is silent or ambiguous)
// v1 (still binding)
// - K_REF: lazily calibrated on first use from UT.rays.trace on UT.specimens.dacBlock({T: 50}) (the
//   frozen dacBlock puts the T/2 hole at x = 150, depth 25 → 60° path = 50 mm). The probe x is scanned
//   ±1.5 mm around 150 + 25·tan60 and the strongest 'sdh' echo near 50 mm is used so that 80 % FSH is
//   read at 34 dB. When UT.rays is missing (or gives no usable echo) a provisional constant is used
//   (2.64, derived analytically from §6.1 rule 4: S 1, D = (38.6/50)^1.5, M = 10^(−1/20)).
//   UT.ascan.K_REF is an accessor property (settable for tuning); UT.ascan.calibrateK() forces a redo.
//   v2: the calibration trace uses the DEFAULT v2 physics (traceOpts of UT.defaultState(): 41 rays,
//   modeConv/surfaceWave/sideLobes on) and — as §3.7 requires — energy 200 V / broadband / damping off,
//   so the 80 %-at-34 dB reference holds in the running app, not only for the v1 tracer options.
// - Pulse width: sigma = 0.5·lambda·cycles, but never narrower than 1.5 sample spacings so an echo is
//   always resolved on long ranges (the peak sample is then ≥ 0.9 of the true amplitude).
// - Envelope is Gaussian per §6.2; a small exponential tail (×0.25 of the peak decaying over 2·sigma)
//   is added on the far side to mimic the sloping decay seen in the reference screenshots.
// - Initial pulse: saturated (120 %) for the first 35 % of the dead zone then linearly decaying to 0 at
//   the end of the dead zone dz = 3·lambda + 1.5; independent of gain; positioned at true time
//   t = wedgeDelayUs (0 for the 0° probe) mapped through the cal. Only single-crystal 0° pulse-echo.
// - rectify: 'full' → samples = summed envelopes, rf = null; 'rf' → rf = signed carrier sum, samples =
//   |rf|; 'half+' / 'half−' → samples = max(±rf, 0), rf = null.
// - Gates are in DISPLAYED path mm (they are drawn on the screen). The readout peak is the maximum
//   UNCLIPPED sample (`ascan.raw`, reject applied but no 120 % clip) inside the gate (EPOCH "Peak"),
//   attributed to the on-screen echo whose displayed path is within max(2·sigma, 1 mm) of the peak sample
//   (the strongest such echo) so peakPct is the UNCLIPPED echo amplitude and `path` its TRUE path.
//   Grass/initial-pulse peaks report echoKind 'noise' / 'initial' with the sample value and the inverse-cal true path.
// - GateReadout.pathDisp is the DISPLAYED path of the same peak (the cal mapping of §15.5, i.e. where the
//   echo is drawn: xDiv = (pathDisp − delay)/range·10). The EPOCH readouts SP/SD/DP are derived from
//   pathDisp — with the wrong step-wedge cal {vel 5.60, zero 0.4} the 10 mm step reads ≈ 8.37 until Auto
//   Cal is run (lesson 12). `path` stays TRUE (test API, auto-cal time capture, DAC record, AUT tof).
// - SD = pathDisp·sin(trig.angle) − trig.xValue; DP/leg fold d = pathDisp·cos(trig.angle) into 0..trig.thick
//   for angle beams; v2: with trig.angle 0 (straight beam) DP = pathDisp and leg = 1 — no fold, as on a real
//   set, so the austenitic backwall seen through a carbon calibration reads 26.1 (V2-4) instead of 2T − 26.1.
// - dacCurve() returns the recorded points sorted by path, each CLIPPED to 100 % at the reference gain
//   and then scaled to the CURRENT gain, each with xDiv; dacCurves() adds the −6 / −14 dB curves;
//   dacAt(instrument, path) interpolates the same clipped points with end-value hold (TRUE path).
//   dacRecord(instrument, primary) returns the new `dac` object (or null when the normalised value
//   would exceed 120 %) — the workflow itself belongs to 80-modes.
// - Peak memory is only updated by compute() (synth() never touches the buffer); the buffer is cleared
//   when peakMem turns off/on, when range/delay/nSamples change and by clearPeak().
// - In 'tofd' mode rays/echoes/ascan/readouts are null (UT.tofd.compute owns frame.tofd).
//   In 'aut' mode the live A-scan is at probe.z and frame.aut.readouts evaluates aut.gates.
// - Trace failures are caught (logged once) so the UI keeps rendering with an empty frame.
// - setInstrument() clamps gain 0…110, range 10…1000, delay −50…1000, reject 0…80; gates given as an
//   array are merged per index into clones of the existing gates, capped at GATE_SLOTS = 2 (G1/G2).
//   Test API validation (setProbe / setInstrument): numeric fields are applied only when they coerce to
//   a finite number (then clamped), otherwise the previous value is kept; enums are checked against
//   their lists (an unknown receiver.filter id falls back to 'broadband', not the previous value);
//   state never receives NaN / strings for numeric fields.
// - traceOpts(): for angle 0 maxLegs is derived from the range, max(12, ceil(2·maxPath/T) + 2) capped
//   at 60 (T = local step thickness on the step wedge), so the multiples continue to the end of the screen.
// v2 (SPEC-v2 §3.2, §3.4, §3.7, §3.10, §6.4, §7)
// - Time-based placement: when an echo carries `tUs` (two-way metal time, no wedge delay) its screen
//   position is dispPathOfTime(tUs + derived.wedgeDelayUs); otherwise dispPath(path). For pure-mode
//   echoes tUs = 2·path/vel so both agree exactly (v1 numbers unchanged). Gates, DAC/TCG and readouts
//   keep using Echo.path (= tUs·vel/2 for converted echoes, set by 30).
// - Grass: level = material.grass·(f/5)²·100 % at 40 dB, scaled by 10^((gain−40)/20) — NOT scaled by
//   TCG, energy, damping or the receiver filter (electronic gain only). Uniform 0…level per sample
//   (v1 seed). Carbon 5 MHz at 40 dB = 2 % = v1 GRASS_PCT. `inst.grassScale` (AUT coarse option) still
//   multiplies. The material comes from synth({material}) or synth({specimen}).material, default carbon.
// - Austenitic weld metal (`weldOpts.weldMaterial === 'austenitic'`): compute() samples the centre ray
//   (1 mm steps, UT.specimens.pointInWeld) into TRUE-path windows where the beam is inside a weld region;
//   synth multiplies the grass by 3 inside those windows (mapped to displayed path). Exposed as
//   UT.ascan.weldWindowsOf(spec, rays) and AscanResult.weldWindows.
// - AscanResult.grassPct = mean of the (rejected, clipped) samples beyond the last echo (and beyond the
//   initial pulse); when fewer than 20 samples remain, the mean of the pure grass contribution is used
//   instead. AscanResult.grassLevel = nominal grass maximum (%).
// - TCG (P7): ampPctOf(amp, instrument, derived, path) multiplies by 10^(g/20) with
//   g = clamp(20·log10(80/dacPct_ref(path)), −12, +40) when tcg.on and ≥ 2 DAC points; dacPct_ref is the
//   recorded curve at refDb (clipped to 100 like the drawn curve, interpolated, end values held).
//   tcgGainAt(path, instrument) returns g (0 when TCG inactive). With TCG active dacAt()/dacCurve()/
//   dacCurves() return the FLAT 80 %·10^((gain−refDb)/20) curve so the drawn DAC, DAC % and dB-to-DAC
//   readouts agree with the compensated echoes. TCG does not require dac.on.
// - Pulser/receiver (P7): energy 100/200/300/400 V → −6/0/+3/+6 dB, width ×1.2/1/0.95/0.9; damping Ω
//   50/100/150/200/400 → −2/−1/0/0/+1 dB, width ×0.75/0.9/1/1/1.3; filter mismatch (probe centre frequency
//   outside the band, 'broadband' never) → −6 dB, width ×1.3. instrument.damping (boolean) is the single
//   source: damping:true ⇒ 50 Ω regardless of pulser.damping; damping:false ⇒ pulser.damping, except that
//   50 Ω without the boolean counts as 150 Ω (dampingOhms()). All offsets are applied inside ampPctOf so
//   trace, frame.echoes and readouts agree; widths via sigmaOf(derived, instrument) (cycles = 1.5·factor).
//   Labels 'low'/'med'/'high' map to 100/200/400 V (setInstrument accepts them, stores the voltage).
//   PRF is display only (list PRF_LIST). The v1 DAMP_DB (−2) now lives in DAMPING_DB[50].
// - Test API: setInstrument({pulser:{damping: Ω}}) also sets damping = (Ω === 50) unless `damping` is given;
//   setInstrument({damping}) mirrors pulser.damping = damping ? 50 : 150 (the 70 toggle rule) unless
//   pulser.damping is given. setInstrument({compare: true}) stores a Float32Array snapshot of the current
//   A-scan (UT.ascan.snapshot()), compare: false|null clears it; the returned clone never contains `compare`.
// - autoGain(pct, {frame, instrument}) → gain that makes the gated peak read pct (null without a primary
//   readout). Exact (not rounded): 70's UT.instruments.auto() decides the display rounding.
// - traceOpts(state, spec, probe) → {maxPath, fanCount (= physics.fanRays 21|41, other → 41), maxLegs,
//   physics:{modeConv, surfaceWave, sideLobes, fanRays}, damping:{tool, points}, weldMaterial,
//   transferLossDb (0…8)} — missing state parts fall back to the v2 defaults (so v1-style minimal states work).
// - PA dispatch: frame.pa = UT.pa.compute(state) when 56 is present (null otherwise), frame.sscan =
//   frame.pa.sscan || computeSscan(state). The column whose angle is nearest to state.pa.angle (if 56 defines
//   it) else probe.angle is the "selected" column: its echoes become frame.echoes, a synth of them
//   frame.ascan (peak memory applied) and frame.readouts (trig angle = the column angle), and
//   frame.paSelected = {angle, index, derived}. frame.rays stays null in PA (60 draws the sector from sscan).
//   UT.pa columns whose echoes lack ampPct are mapped here; computeSscan() passes the v2 physics opts too.
// - setProbe(): angle → mode = angle === 0 ? 'comp' : 'shear' unless `mode` is given (custom angles are
//   shear); for a standard angle (0/45/60/70) libId is re-pointed to the same-series entry (maker, freq,
//   crystal, family) with that angle, else UT.probe.libForAngle (the toolbar rule); the generic 0°/45°/60°/70°
//   entries therefore stay generic (wedgePath 12 as v1). crystalDims/freq/diameter are only changed when
//   given (diameter d → crystalDims {a:d, b:d, shape:'round'}; crystalDims → diameter = a); libId given →
//   UT.probe.select(libId) patch applied first; focus {on, F} coerced (F 10…150, clamped to the near field
//   like setFocus); surface enum gains 'web'; x is clamped to the scan surface only for surface 'chord'.
//   No procedure lock here (80/45 enforce allowedProbes in exams).
// - selectProbe(libId) → UT.probe.select patch via UT.setIn('probe') + renderNow, returns derived (null for
//   an unknown id). setFocus({on, F}) clamps F to [10, max(10, derived.nearField)]. setPhysics coerces
//   booleans and fanRays ∈ {21, 41} (else 41). setDampers(xs) keeps the first 3 finite x values.
// - Twin-crystal angle-probe near-surface boost (§3.5, ×1.5 for path < 15 mm) is an amplitude law and is
//   left to 30-raytrace (not applied here, to avoid double application).
// - UT.test.echoes() rows carry tUs, mode and lenMm (null when the tracer does not provide them).
(function (UT) {
  'use strict';
  const M = UT.math;
  const C = UT.consts;

  const N_SAMPLES = 1000;
  const CLIP_PCT = 120;
  const GRASS_PCT = 2;              // carbon steel, 5 MHz, 40 dB (v1 constant, now the material law's reference)
  const GRASS_REF_GAIN = 40;
  const GRASS_DEFAULT = 0.02;       // material.grass of carbon steel
  const WELD_GRASS_FACTOR = 3;      // austenitic weld metal window (§3.4)
  const PROVISIONAL_K = 2.64;
  const GATE_SLOTS = 2;   // G1 / G2 — the instrument model never carries more gates than the skins show

  // ------------------------------------------------------------------ pulser / receiver tables (§3.7)
  const ENERGIES = [100, 200, 300, 400];                 // V
  const ENERGY_DB = { 100: -6, 200: 0, 300: 3, 400: 6 };
  const ENERGY_WIDTH = { 100: 1.2, 200: 1, 300: 0.95, 400: 0.9 };
  const ENERGY_LABELS = { low: 100, med: 200, medium: 200, high: 400 };
  const DAMPING_OHMS = [50, 100, 150, 200, 400];         // Ω
  const DAMPING_DB = { 50: -2, 100: -1, 150: 0, 200: 0, 400: 1 };
  const DAMPING_WIDTH = { 50: 0.75, 100: 0.9, 150: 1, 200: 1, 400: 1.3 };
  const DAMP_DB = DAMPING_DB[50];                        // v1 name (−2 dB for damping:true)
  const PRF_LIST = [30, 60, 120, 240, 480, 1000];        // Hz, display only
  const FILTERS = ['broadband', '0.2-10', '1.5-8.5', '5-15'];
  const FILTER_BANDS = { '0.2-10': [0.2, 10], '1.5-8.5': [1.5, 8.5], '5-15': [5, 15] };
  const FILTER_MISMATCH_DB = -6;
  const FILTER_MISMATCH_WIDTH = 1.3;
  const TCG_TARGET_PCT = 80;
  const TCG_MIN_DB = -12;
  const TCG_MAX_DB = 40;

  /** Pulser energy (V) of an instrument; accepts the v1 labels low/med/high. */
  function normEnergy(v) {
    let x = v;
    if (typeof x === 'string') { const l = ENERGY_LABELS[x.trim().toLowerCase()]; if (l) return l; x = +x; }
    if (!Number.isFinite(x)) return null;
    let best = ENERGIES[0];
    for (const e of ENERGIES) if (Math.abs(e - x) < Math.abs(best - x)) best = e;
    return best;
  }
  function nearestOhms(v) {
    const x = +v;
    if (!Number.isFinite(x)) return null;
    let best = DAMPING_OHMS[0];
    for (const o of DAMPING_OHMS) if (Math.abs(o - x) < Math.abs(best - x)) best = o;
    return best;
  }
  /** Effective pulser energy (V) of an instrument (200 when unset). */
  function energyV(inst) { const p = inst && inst.pulser; return (p && normEnergy(p.energy)) || 200; }
  /**
   * Effective damping (Ω): instrument.damping (boolean) is the single source — true ⇒ 50 Ω; false ⇒
   * pulser.damping from the option list, where 50 Ω without the boolean counts as 150 Ω.
   */
  function dampingOhms(inst) {
    if (inst && inst.damping) return 50;
    const p = inst && inst.pulser;
    const o = p && DAMPING_OHMS.indexOf(p.damping) >= 0 ? p.damping : 150;
    return o === 50 ? 150 : o;
  }
  /** Receiver filter id ('broadband' when unset/unknown). */
  function filterOf(inst) { const r = inst && inst.receiver; return r && FILTERS.indexOf(r.filter) >= 0 ? r.filter : 'broadband'; }
  /** True when the probe centre frequency lies outside the receiver band ('broadband' never mismatches). */
  function filterMismatch(inst, derived) {
    const f = filterOf(inst);
    if (f === 'broadband') return false;
    const band = FILTER_BANDS[f];
    const freq = derived && Number.isFinite(derived.freq) ? derived.freq : 5;
    return freq < band[0] - 1e-9 || freq > band[1] + 1e-9;
  }
  /** Pulser gain offset (dB): energy + damping Ω. */
  function pulserDb(inst) { return ENERGY_DB[energyV(inst)] + DAMPING_DB[dampingOhms(inst)]; }
  /** Receiver gain offset (dB): −6 on a band mismatch. */
  function receiverDb(inst, derived) { return filterMismatch(inst, derived) ? FILTER_MISMATCH_DB : 0; }
  /** Total pulser + receiver amplitude offset (dB) applied inside ampPctOf. */
  function offsetDb(inst, derived) { return inst ? pulserDb(inst) + receiverDb(inst, derived) : 0; }
  /** Pulse-width factor (energy × damping × filter). */
  function widthFactor(inst, derived) {
    if (!inst) return 1;
    return ENERGY_WIDTH[energyV(inst)] * DAMPING_WIDTH[dampingOhms(inst)] * (filterMismatch(inst, derived) ? FILTER_MISMATCH_WIDTH : 1);
  }

  // ------------------------------------------------------------------ K_REF (lazy calibration)
  let _kRef = null;
  let _kSource = 'unset';

  function refProbe(x) {
    return { angle: 60, mode: 'shear', crystal: 'single', freq: 5, diameter: 10, crystalDims: { a: 10, b: 10, shape: 'round' }, libId: 'gen-60-5-10',
      focus: { on: false, F: 30 }, wedgeVel: 2.74, method: 'pe', x, z: 50, side: 1, skew: 0, surface: 'chord', paFrom: 40, paTo: 70, paStep: 1 };
  }

  /**
   * Calibrate K_REF so that a 3 mm SDH at 50 mm sound path (60°, 5 MHz, 10 mm) reads 80 % FSH at 34 dB
   * (energy 200 V, broadband, damping off, default v2 physics). Uses UT.rays.trace when available;
   * otherwise the provisional constant.
   * @returns {number} the calibrated K
   */
  function calibrateK() {
    _kRef = PROVISIONAL_K;
    _kSource = 'provisional';
    if (!(UT.rays && typeof UT.rays.trace === 'function' && UT.specimens && UT.specimens.dacBlock)) return _kRef;
    try {
      const spec = UT.specimens.dacBlock({ T: 50 });
      const hole = spec.holes.find(function (h) { return Math.abs(h.y - 25) < 1e-6; }) || spec.holes[1];
      const x0 = hole.x + hole.y * Math.tan(M.deg2rad(60));
      const display = { beam: true, skips: 3, colourCode: 'none', singleLine: false, focus: false, hide: false };
      const def = typeof UT.defaultState === 'function' ? UT.defaultState() : {};
      const calState = { instrument: { range: 100, delay: 0 }, display, physics: def.physics, damping: { tool: false, points: [] }, weldOpts: { weldMaterial: 'same', transferLossDb: 0 } };
      let best = 0;
      for (let dx = -1.5; dx <= 1.5 + 1e-9; dx += 0.5) {
        const probe = refProbe(x0 + dx);
        const derived = UT.probe.derive(probe, spec);
        const res = UT.rays.trace({ specimen: spec, probe, derived, display, defects: [], opts: traceOpts(calState, spec, probe) });
        for (const e of (res && res.echoes) || []) {
          if (e.kind === 'sdh' && Math.abs(e.path - 50) < 1 && e.amp > best) best = e.amp;
        }
      }
      if (best > 0) {
        const k = 80 / (best * M.dB2lin(34));
        if (k > 0.05 && k < 200) { _kRef = k; _kSource = 'traced'; }
      }
    } catch (e) { console.error('[UT.ascan] K_REF calibration failed, using provisional', e); }
    return _kRef;
  }

  function kRef() { return _kRef === null ? calibrateK() : _kRef; }

  // ------------------------------------------------------------------ DAC / TCG
  const DAC_CURVE_MAX_PCT = 100;

  /** Recorded points sorted by path with ampPct clipped to 100 % at the reference gain (§6.2). */
  function sortedDacPoints(instrument) {
    const dac = (instrument && instrument.dac) || {};
    const pts = (dac.points || []).filter(function (p) { return p && Number.isFinite(p.path) && Number.isFinite(p.ampPct); });
    return pts.map(function (p) { return { path: p.path, ampPct: Math.min(DAC_CURVE_MAX_PCT, p.ampPct) }; })
      .sort(function (a, b) { return a.path - b.path; });
  }

  function dacRefDb(instrument) {
    const dac = (instrument && instrument.dac) || {};
    if (Number.isFinite(dac.refDb)) return dac.refDb;
    if (Number.isFinite(instrument.refGain)) return instrument.refGain;
    return instrument.gain || 0;
  }

  /** Curve scale from the recording reference gain to the current gain. */
  function dacScale(instrument) { return M.dB2lin((instrument.gain || 0) - dacRefDb(instrument)); }

  /** Interpolated (end values held) DAC amplitude at the REFERENCE gain (% FSH); null when < 1 point. */
  function dacAtRef(instrument, path) {
    const pts = sortedDacPoints(instrument);
    if (!pts.length) return null;
    if (path <= pts[0].path) return pts[0].ampPct;
    const last = pts[pts.length - 1];
    if (path >= last.path) return last.ampPct;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (path >= a.path && path <= b.path) {
        const t = b.path > a.path ? (path - a.path) / (b.path - a.path) : 0;
        return a.ampPct + (b.ampPct - a.ampPct) * t;
      }
    }
    return last.ampPct;
  }

  /** True when TCG acts on the signal: instrument.tcg.on and ≥ 2 recorded DAC points. */
  function tcgActive(instrument) {
    return !!(instrument && instrument.tcg && instrument.tcg.on && sortedDacPoints(instrument).length >= 2);
  }

  /**
   * TCG gain (dB) at a TRUE path: clamp(20·log10(80 / DAC_ref(path)), −12, +40); 0 when TCG is inactive.
   * @param {number} path  true sound path (mm)
   * @param {object} [instrument]  defaults to UT.state.instrument
   */
  function tcgGainAt(path, instrument) {
    const inst = instrument || (UT.state && UT.state.instrument);
    if (!tcgActive(inst) || !Number.isFinite(path)) return 0;
    const ref = dacAtRef(inst, path);
    if (ref === null) return 0;
    return M.clamp(M.lin2dB(TCG_TARGET_PCT / Math.max(ref, 0.01)), TCG_MIN_DB, TCG_MAX_DB);
  }

  /**
   * DAC curve amplitude (% FSH at the CURRENT gain) at a TRUE path: linear interpolation between the
   * recorded points, holding the end values outside the recorded span; flat 80 %·scale when TCG is on.
   * null when < 1 point.
   */
  function dacAt(instrument, path) {
    if (tcgActive(instrument)) return TCG_TARGET_PCT * dacScale(instrument);
    const ref = dacAtRef(instrument, path);
    return ref === null ? null : ref * dacScale(instrument);
  }

  /**
   * DAC curve polyline at the current gain: [{path, pct, xDiv}] sorted by TRUE path; each point is
   * clipped to 100 % at the reference gain before the gain scale (so the curve still follows gain).
   * With TCG active the curve is flat at 80 %·scale (drawn flat, §3.7).
   * @param {object} instrument
   * @param {object} derived  UT.probe.derive result (for the time base)
   * @param {number} [dbOffset]  e.g. −6 or −14 for the ASME 50 % / 20 % curves
   */
  function dacCurve(instrument, derived, dbOffset) {
    const pts = sortedDacPoints(instrument);
    if (!pts.length) return [];
    const s = dacScale(instrument) * M.dB2lin(dbOffset || 0);
    const flat = tcgActive(instrument);
    return pts.map(function (p) {
      return { path: p.path, pct: (flat ? TCG_TARGET_PCT : p.ampPct) * s, xDiv: derived ? xDivOf(p.path, instrument, derived) : xDivOfDisp(p.path, instrument) };
    });
  }

  /** Reference, −6 dB and −14 dB curves: {ref, m6, m14} (each a dacCurve array). */
  function dacCurves(instrument, derived) {
    return { ref: dacCurve(instrument, derived, 0), m6: dacCurve(instrument, derived, -6), m14: dacCurve(instrument, derived, -14) };
  }

  /**
   * Build the `dac` object after recording the gated peak `primary` ({path, peakPct}) at the current gain.
   * The point is normalised to the reference gain (the gain of the first recording). Returns null when
   * the normalised amplitude would exceed 120 % (record refused) or when there is nothing to record.
   */
  function dacRecord(instrument, primary) {
    if (!primary || !Number.isFinite(primary.path) || !Number.isFinite(primary.peakPct)) return null;
    const dac = Object.assign({ points: [], on: false, refDb: null, curves: true }, instrument.dac || {});
    const refDb = Number.isFinite(dac.refDb) ? dac.refDb : (instrument.gain || 0);
    const norm = primary.peakPct * M.dB2lin(refDb - (instrument.gain || 0));
    if (norm > CLIP_PCT) return null;
    const points = (dac.points || []).filter(function (p) { return Math.abs(p.path - primary.path) > 0.75; });
    points.push({ path: +primary.path.toFixed(2), ampPct: +norm.toFixed(2) });
    points.sort(function (a, b) { return a.path - b.path; });
    return Object.assign({}, dac, { points, refDb, on: true });
  }

  // ------------------------------------------------------------------ amplitude / time base helpers
  /**
   * Screen amplitude (% FSH, unclipped) of a dimensionless tracer amplitude at the instrument gain,
   * including the pulser/receiver offsets and — when TCG is active and a path is given — the TCG gain.
   * @param {number} amp  tracer amplitude
   * @param {object} instrument  {gain, damping, pulser, receiver, tcg, dac}
   * @param {object} [derived]  probe derivation (receiver band check)
   * @param {number} [path]  TRUE sound path of the echo (TCG)
   */
  function ampPctOf(amp, instrument, derived, path) {
    const gain = instrument && Number.isFinite(instrument.gain) ? instrument.gain : 0;
    let pct = amp * kRef() * M.dB2lin(gain);
    if (instrument) {
      const off = offsetDb(instrument, derived);
      if (off) pct *= M.dB2lin(off);
      if (Number.isFinite(path) && tcgActive(instrument)) pct *= M.dB2lin(tcgGainAt(path, instrument));
    }
    return pct;
  }

  function calOf(instrument) {
    const cal = (instrument && instrument.cal) || {};
    return { vel: Number.isFinite(cal.vel) && cal.vel > 0 ? cal.vel : null, zero: Number.isFinite(cal.zero) ? cal.zero : 0 };
  }

  /** True two-way arrival time (µs) of an echo at a true metal path. */
  function trueTime(path, derived) { return 2 * path / derived.vel + (derived.wedgeDelayUs || 0); }

  /**
   * Displayed path of an ABSOLUTE two-way time (µs, wedge delay included) through the calibration:
   * pDisp = (t − wedgeDelayUs − cal.zero) · (cal.vel ?? vTrue) / 2.
   */
  function dispPathOfTime(tUsAbs, instrument, derived) {
    const cal = calOf(instrument);
    const vel = cal.vel === null ? derived.vel : cal.vel;
    return (tUsAbs - (derived.wedgeDelayUs || 0) - cal.zero) * vel / 2;
  }

  /**
   * Displayed path of a TRUE path through the instrument calibration (§15.5).
   * pDisp = (t − wedgeDelayUs − cal.zero) · (cal.vel ?? vTrue) / 2
   */
  function dispPath(pathTrue, instrument, derived) { return dispPathOfTime(trueTime(pathTrue, derived), instrument, derived); }

  /** Displayed path of an echo: time-based when it carries tUs (§3.2), else from its true path. */
  function dispPathOfEcho(e, instrument, derived) {
    return Number.isFinite(e.tUs) ? dispPathOfTime(e.tUs + (derived.wedgeDelayUs || 0), instrument, derived) : dispPath(e.path, instrument, derived);
  }

  /** Inverse of dispPath: TRUE path shown at a displayed path. */
  function truePath(pDisp, instrument, derived) {
    const cal = calOf(instrument);
    const vTrue = derived.vel;
    const vel = cal.vel === null ? vTrue : cal.vel;
    return (2 * pDisp / vel + cal.zero) * vTrue / 2;
  }

  /** Screen division (0..10) of a displayed path. */
  function xDivOfDisp(pDisp, instrument) {
    const range = instrument.range > 0 ? instrument.range : 100;
    return (pDisp - (instrument.delay || 0)) / range * 10;
  }

  /** Screen division (0..10) of a TRUE path. */
  function xDivOf(pathTrue, instrument, derived) { return xDivOfDisp(dispPath(pathTrue, instrument, derived), instrument); }

  /** Pulse envelope sigma (mm of path): 0.5·λ·1.5·widthFactor (energy, damping Ω, receiver band). */
  function sigmaOf(derived, instrument) {
    const lambda = derived.lambda || (derived.vel / (derived.freq || 5));
    const cycles = 1.5 * widthFactor(instrument, derived);
    return 0.5 * lambda * cycles;
  }

  /** Nominal grass maximum (% FSH) of a material at a probe frequency and gain (§3.4; not TCG-scaled). */
  function grassLevelPct(material, freqMHz, gain) {
    const g = material && Number.isFinite(material.grass) ? material.grass : GRASS_DEFAULT;
    const f = Number.isFinite(freqMHz) && freqMHz > 0 ? freqMHz : 5;
    return g * (f / 5) * (f / 5) * 100 * M.dB2lin((Number.isFinite(gain) ? gain : 0) - GRASS_REF_GAIN);
  }

  function materialOfOpt(o) {
    if (o.material && typeof o.material === 'object') return o.material;
    const mats = UT.specimens && UT.specimens.materials;
    if (typeof o.material === 'string' && mats && mats[o.material]) return mats[o.material];
    if (o.specimen && o.specimen.material && typeof o.specimen.material === 'object') return o.specimen.material;
    return (mats && mats.carbon) || { grass: GRASS_DEFAULT };
  }

  /**
   * Beam geometry readouts for a sound path with the instrument trig settings.
   * @param {number} path  true sound path (mm)
   * @param {number} angleDeg  refracted angle used by the instrument (trig.angle)
   * @param {number} T  thickness used by the instrument (trig.thick)
   * @param {number} [xValue]  X value subtracted from the surface distance
   * @returns {{sd:number, dp:number, leg:number}}
   */
  function geometry(path, angleDeg, T, xValue) {
    const a = M.deg2rad(angleDeg || 0);
    const sd = path * Math.sin(a) - (xValue || 0);
    const d = path * Math.cos(a);
    if (!(T > 0) || !(angleDeg > 0)) return { sd, dp: d, leg: 1 };   // straight beam: depth = sound path, no leg fold (V2-4)
    const leg = Math.max(1, Math.floor((d - 1e-9) / T) + 1);
    const r = d - (leg - 1) * T;
    const dp = (leg % 2 === 1) ? r : T - r;
    return { sd, dp: Math.max(0, dp), leg };
  }

  // ------------------------------------------------------------------ A-scan synthesis
  /**
   * Synthesise the A-scan samples from tracer echoes.
   * @param {object} o  {echoes, probe, derived, instrument, nSamples=1000, specimen?, material?, weldGrass?:{windows:[{from,to}], factor}}
   * @returns {AscanResult}
   */
  function synth(o) {
    const echoes = o.echoes || [];
    const probe = o.probe || {};
    const derived = o.derived || UT.probe.derive(probe, null);
    const inst = o.instrument || {};
    const n = Math.max(16, o.nSamples || N_SAMPLES);
    const range = inst.range > 0 ? inst.range : 100;
    const delay = inst.delay || 0;
    const rectify = inst.rectify || 'full';
    const wantRf = rectify !== 'full';
    const spacing = range / (n - 1);
    const sigma = Math.max(sigmaOf(derived, inst), 1.5 * spacing);
    const lambda = derived.lambda || 1;
    const samples = new Float32Array(n);
    const raw = new Float32Array(n);      // unclipped (reject applied, no 120 % clip) — gate peak search
    const rf = wantRf ? new Float32Array(n) : null;
    const env = wantRf ? rf : samples;
    const pathAt = function (i) { return delay + i / (n - 1) * range; };
    const idxOf = function (p) { return (p - delay) / range * (n - 1); };
    let lastEchoIdx = -1;

    // echoes
    const onScreen = [];
    const reach = 4 * sigma + 2 * sigma;   // main lobe + tail
    for (const e of echoes) {
      if (!e || !Number.isFinite(e.path)) continue;
      const ampPct = Number.isFinite(e.amp) ? ampPctOf(e.amp, inst, derived, e.path) : (Number.isFinite(e.ampPct) ? e.ampPct : 0);
      const pDisp = dispPathOfEcho(e, inst, derived);
      const xDiv = xDivOfDisp(pDisp, inst);
      onScreen.push({ echo: e, xDiv, ampPct, pDisp });
      if (ampPct <= 0) continue;
      const i0 = Math.max(0, Math.floor(idxOf(pDisp - reach)));
      const i1 = Math.min(n - 1, Math.ceil(idxOf(pDisp + reach)));
      if (i1 >= i0 && i1 > lastEchoIdx) lastEchoIdx = i1;
      for (let i = i0; i <= i1; i++) {
        const p = pathAt(i);
        const u = (p - pDisp) / sigma;
        let a = ampPct * Math.exp(-u * u);
        if (u > 0) a = Math.max(a, 0.25 * ampPct * Math.exp(-u / 2) * (u < 1 ? u : 1));
        if (wantRf) a *= Math.cos(2 * Math.PI * 2 * (p - pDisp) / lambda);
        env[i] += a;
      }
    }

    // initial pulse (single-crystal 0° pulse-echo only)
    const isZero = (probe.angle || 0) === 0 && probe.method !== 'pa';
    const initialPulse = isZero && (probe.crystal || 'single') === 'single' && (probe.method || 'pe') === 'pe';
    if (initialPulse) {
      const dz = 3 * lambda + 1.5;
      const p0 = dispPath(0, inst, derived);
      const i0 = Math.max(0, Math.floor(idxOf(p0)));
      const i1 = Math.min(n - 1, Math.ceil(idxOf(p0 + dz)));
      if (i1 >= i0 && i1 > lastEchoIdx) lastEchoIdx = i1;
      for (let i = i0; i <= i1; i++) {
        const u = (pathAt(i) - p0) / dz;
        if (u < 0 || u > 1) continue;
        let a = u < 0.35 ? CLIP_PCT : CLIP_PCT * (1 - u) / 0.65;
        if (wantRf) a *= Math.cos(2 * Math.PI * 2 * (pathAt(i) - p0) / lambda);
        env[i] += a;
      }
    }

    // grass (deterministic; material law §3.4, ×3 inside austenitic weld-metal windows)
    const noiseSeed = Math.round((probe.x || 0) * 7 + (probe.z || 0) * 13);
    const rnd = M.rng(noiseSeed);
    const material = materialOfOpt(o);
    const grassLevel = grassLevelPct(material, derived.freq, inst.gain) * (inst.grassScale || 1);
    const wg = o.weldGrass && Array.isArray(o.weldGrass.windows) && o.weldGrass.windows.length ? o.weldGrass : null;
    const wgWin = wg ? wg.windows.map(function (w) { return { from: dispPath(w.from, inst, derived), to: dispPath(w.to, inst, derived) }; }) : null;
    const wgFactor = wg && Number.isFinite(wg.factor) ? wg.factor : WELD_GRASS_FACTOR;
    const grassArr = new Float32Array(n);
    let grassSum = 0;
    for (let i = 0; i < n; i++) {
      let g = grassLevel * rnd();
      if (wgWin) {
        const p = pathAt(i);
        for (let k = 0; k < wgWin.length; k++) { if (p >= wgWin[k].from && p <= wgWin[k].to) { g *= wgFactor; break; } }
      }
      grassArr[i] = g; grassSum += g;
      if (wantRf) rf[i] += g * (rnd() < 0.5 ? -1 : 1); else samples[i] += g;
    }

    // rectification, reject, clip
    const reject = inst.reject || 0;
    for (let i = 0; i < n; i++) {
      let v;
      if (wantRf) {
        const r = rf[i];
        v = rectify === 'half+' ? Math.max(0, r) : rectify === 'half-' ? Math.max(0, -r) : Math.abs(r);
        rf[i] = M.clamp(r, -CLIP_PCT, CLIP_PCT);
        if (Math.abs(r) < reject) rf[i] = 0;
      } else v = samples[i];
      if (v < reject) v = 0;
      raw[i] = v;
      samples[i] = v > CLIP_PCT ? CLIP_PCT : v;
    }

    // grass readout: mean of the samples beyond the last echo (fallback: mean of the pure grass)
    let grassPct;
    const iStart = lastEchoIdx + 1;
    if (n - iStart >= 20) { let s = 0; for (let i = iStart; i < n; i++) s += samples[i]; grassPct = s / (n - iStart); }
    else grassPct = grassSum / n;

    onScreen.sort(function (a, b) { return a.pDisp - b.pDisp; });
    return {
      samples, raw, rf: rectify === 'rf' ? rf : null, peak: null, range, delay, n, pathAt, sigma,
      echoesOnScreen: onScreen, noiseSeed, initialPulse, reject,
      grassPct, grassLevel, weldWindows: wg ? wg.windows : null,
      tcg: tcgActive(inst),
      initialZone: initialPulse ? { from: dispPath(0, inst, derived), to: dispPath(0, inst, derived) + 3 * lambda + 1.5 } : null,
    };
  }

  // ------------------------------------------------------------------ gates / readouts
  /**
   * Evaluate all gates of `instrumentLike` on an A-scan (EPOCH "Peak" mode).
   * @param {AscanResult} ascan
   * @param {object} instrumentLike  {gates, activeGate, trig, dac, gain, range, delay, ...}
   * @param {object} derived
   * @param {object} specimen  (may be null; fallback for thickness)
   * @param {object} probe  (may be null; fallback for angle)
   * @returns {Readouts}
   */
  function evalGates(ascan, instrumentLike, derived, specimen, probe) {
    const inst = instrumentLike || {};
    const gates = inst.gates || [];
    const trig = inst.trig || {};
    const angle = Number.isFinite(trig.angle) ? trig.angle : (derived ? derived.refracted : ((probe && probe.angle) || 0));
    const thick = Number.isFinite(trig.thick) && trig.thick > 0 ? trig.thick : ((specimen && specimen.T) || 0);
    const xValue = Number.isFinite(trig.xValue) ? trig.xValue : 0;
    const out = [];
    const n = ascan ? ascan.samples.length : 0;
    for (const g of gates) {
      if (!g || !g.on || !ascan || !(g.width > 0)) { out.push(null); continue; }
      const s0 = g.start, s1 = g.start + g.width;
      const range = ascan.range, delay = ascan.delay;
      const i0 = Math.max(0, Math.ceil((s0 - delay) / range * (n - 1)));
      const i1 = Math.min(n - 1, Math.floor((s1 - delay) / range * (n - 1)));
      // peak search on the UNCLIPPED envelope (ascan.raw) so a saturated echo is still located at its
      // true centre and its unclipped amplitude is reported (§14.4 / §15.5); samples is the clipped fallback
      const src = ascan.raw && ascan.raw.length === n ? ascan.raw : ascan.samples;
      let peak = -1, iPeak = -1;
      for (let i = i0; i <= i1; i++) { if (src[i] > peak) { peak = src[i]; iPeak = i; } }
      if (iPeak < 0 || peak < (g.level || 0) || peak <= 0) { out.push(null); continue; }
      const pPeak = ascan.pathAt(iPeak);
      const win = Math.max(2 * (ascan.sigma || 1), 1);
      let best = null;
      for (const es of ascan.echoesOnScreen) {
        if (Math.abs(es.pDisp - pPeak) <= win && es.pDisp >= s0 - win && es.pDisp <= s1 + win && (!best || es.ampPct > best.ampPct)) best = es;
      }
      let peakPct, path, pathDisp, xDiv, echoKind;
      if (best) { peakPct = best.ampPct; path = best.echo.path; pathDisp = best.pDisp; xDiv = best.xDiv; echoKind = best.echo.kind || 'echo'; }
      else {
        peakPct = peak; xDiv = (pPeak - delay) / range * 10; pathDisp = pPeak; path = derived ? truePath(pPeak, inst, derived) : pPeak;
        echoKind = ascan.initialZone && pPeak >= ascan.initialZone.from && pPeak <= ascan.initialZone.to ? 'initial' : 'noise';
      }
      if (!Number.isFinite(pathDisp)) pathDisp = path;
      // SD/DP/leg are what the instrument computes from ITS displayed sound path (cal-mapped, §5.3/§15.5)
      const geo = geometry(pathDisp, angle, thick, xValue);
      let dacPct = null, dBToDac = null;
      if (inst.dac && inst.dac.on) {
        const curve = dacAt(inst, path);
        if (curve !== null && curve > 0) { dacPct = peakPct / curve * 100; dBToDac = M.lin2dB(peakPct / curve); }
      }
      out.push({ peakPct, path, pathDisp, xDiv, sd: geo.sd, dp: geo.dp, leg: geo.leg, dacPct, dBToDac, echoKind });
    }
    const ai = Number.isFinite(inst.activeGate) ? inst.activeGate : 0;
    const primary = out[ai] || null;
    return {
      gate: out, primary,
      textSP: primary ? M.fmt2(primary.pathDisp) : '--.--',
      textSD: primary ? M.fmt2(primary.sd) : '--.--',
      textDP: primary ? M.fmt2(primary.dp) : '--.--',
      textAmp: primary ? Math.round(Math.min(999, primary.peakPct)) + '%' : '0%',
    };
  }

  /**
   * Gain (dB) that makes the gated peak read `pct` % FSH; null without a primary readout.
   * @param {number} pct  target amplitude (% FSH)
   * @param {{frame?:object, instrument?:object}} [o]  defaults: UT.frame / UT.state.instrument
   */
  function autoGain(pct, o) {
    const frame = (o && o.frame) || UT.frame;
    const inst = (o && o.instrument) || (UT.state && UT.state.instrument) || {};
    const R = frame && frame.readouts && frame.readouts.primary;
    if (!R || !(R.peakPct > 0) || !(pct > 0)) return null;
    const gain = Number.isFinite(inst.gain) ? inst.gain : 0;
    return M.clamp(gain + M.lin2dB(pct / R.peakPct), 0, 110);
  }

  /** Float32Array copy of the current (or given frame's) A-scan samples for the compare overlay; null when none. */
  function snapshot(frame) {
    const a = (frame || UT.frame) && (frame || UT.frame).ascan;
    return a && a.samples ? new Float32Array(a.samples) : null;
  }

  // ------------------------------------------------------------------ peak memory
  let peakBuf = null;
  let peakKey = '';
  let peakWasOn = false;

  /** Clear the peak-memory buffer (tb-clear, PEAK MEM toggle, range/delay change). */
  function clearPeak() { if (peakBuf) peakBuf.fill(0); }

  function applyPeak(ascan, inst) {
    const on = !!inst.peakMem;
    const key = ascan.range + '/' + ascan.delay + '/' + ascan.samples.length;
    if (!peakBuf || peakBuf.length !== ascan.samples.length) { peakBuf = new Float32Array(ascan.samples.length); peakKey = key; }
    if (key !== peakKey || on !== peakWasOn) { clearPeak(); peakKey = key; }
    peakWasOn = on;
    if (!on) { ascan.peak = null; return; }
    const s = ascan.samples;
    for (let i = 0; i < s.length; i++) if (s[i] > peakBuf[i]) peakBuf[i] = s[i];
    ascan.peak = peakBuf;
  }

  // ------------------------------------------------------------------ frame pipeline
  let traceErrorLogged = false;

  function now() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }

  const MAX_LEGS_0DEG = 60;

  /**
   * Tracer options for UT.rays.trace from a state-like object (§15.4 + SPEC-v2 §6.4):
   * {maxPath, fanCount, maxLegs, physics, damping, weldMaterial, transferLossDb}.
   * @param {object} state  {instrument, display, physics?, damping?, weldOpts?}
   * @param {object} spec  specimen (may be null)
   * @param {object} probe
   */
  function traceOpts(state, spec, probe) {
    const inst = (state && state.instrument) || {};
    const display = (state && state.display) || {};
    const maxPath = (inst.delay || 0) + (inst.range || 100);
    const zero = (probe.angle || 0) === 0;
    let maxLegs = (zero || (spec && spec.kind === 'block')) ? 12 : (display.skips || 3);
    if (zero && spec) {
      // 0°: let the backwall multiples run to the end of the range (bottom + top = 2 legs per echo)
      let T = spec.T;
      if (typeof spec.thicknessAt === 'function' && Number.isFinite(probe.x)) T = spec.thicknessAt(probe.x);
      if (Number.isFinite(T) && T > 0) maxLegs = Math.max(12, Math.min(MAX_LEGS_0DEG, Math.ceil(2 * maxPath / T) + 2));
    }
    const ph = (state && state.physics) || {};
    const fanRays = ph.fanRays === 21 ? 21 : 41;
    const dm = (state && state.damping) || {};
    const wo = (state && state.weldOpts) || {};
    const tl = +wo.transferLossDb;
    return {
      maxPath, fanCount: fanRays, maxLegs,
      physics: { modeConv: ph.modeConv !== false, surfaceWave: ph.surfaceWave !== false, sideLobes: ph.sideLobes !== false, fanRays },
      damping: { tool: !!dm.tool, points: Array.isArray(dm.points) ? dm.points.slice(0, 3) : [] },
      weldMaterial: wo.weldMaterial || 'same',
      transferLossDb: Number.isFinite(tl) ? M.clamp(tl, 0, 8) : 0,
    };
  }

  function safeTrace(args) {
    if (!(UT.rays && typeof UT.rays.trace === 'function')) return null;
    try { return UT.rays.trace(args); } catch (e) {
      if (!traceErrorLogged) { traceErrorLogged = true; console.error('[UT.ascan] rays.trace failed', e); }
      return null;
    }
  }

  function visibleDefects(state) { return (state.defects || []).filter(function (d) { return d && d.visible !== false; }); }

  /** Map tracer echoes to on-screen amplitudes (before reject/clip), sorted by path. */
  function mapEchoes(rays, inst, derived) {
    const list = ((rays && rays.echoes) || []).map(function (e) { return Object.assign({}, e, { ampPct: ampPctOf(e.amp, inst, derived, e.path) }); });
    list.sort(function (a, b) { return a.path - b.path; });
    return list;
  }

  /**
   * TRUE-path windows [{from, to}] along the centre ray where the beam is inside a weld region
   * (austenitic weld-metal grass, §3.4); null when the specimen has no weld regions or no centre ray.
   * @param {object} spec
   * @param {object} rays  UT.rays.trace result
   */
  function weldWindowsOf(spec, rays) {
    const S = UT.specimens;
    if (!spec || !rays || !rays.centre || !Array.isArray(rays.centre.pts) || rays.centre.pts.length < 2) return null;
    if (!(S && typeof S.pointInWeld === 'function' && typeof S.weldRegions === 'function')) return null;
    let regions;
    try { regions = S.weldRegions(spec); } catch (e) { return null; }
    if (!regions || !regions.length) return null;
    const pts = rays.centre.pts;
    const out = [];
    let s = 0, open = null;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const L = M.dist(a.x, a.y, b.x, b.y);
      if (!(L > 0)) continue;
      const steps = Math.max(1, Math.ceil(L));
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        const inside = S.pointInWeld(spec, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
        const sp = s + t * L;
        if (inside && !open) open = { from: sp };
        else if (!inside && open) { open.to = sp; out.push(open); open = null; }
      }
      s += L;
    }
    if (open) { open.to = s; out.push(open); }
    return out;
  }

  function weldGrassOf(state, spec, rays) {
    if (!(state.weldOpts && state.weldOpts.weldMaterial === 'austenitic')) return null;
    const windows = weldWindowsOf(spec, rays);
    return windows && windows.length ? { windows, factor: WELD_GRASS_FACTOR } : null;
  }

  /**
   * Phased-array sector data: one echo column per sweep angle.
   * @returns {{angles:number[], columns:{angle:number, echoes:object[]}[], maxPath:number, T:number}}
   */
  function computeSscan(state) {
    const spec = state.specimen;
    const probe = state.probe;
    const inst = state.instrument;
    const angles = UT.probe.paAngles(probe);
    const columns = [];
    const display = Object.assign({}, state.display, { skips: Math.min(2, state.display.skips || 2) });
    const defects = visibleDefects(state);
    const base = traceOpts(state, spec, probe);
    for (const a of angles) {
      const p = Object.assign({}, probe, { angle: a, method: 'pe', mode: 'shear' });
      const d = UT.probe.derive(p, spec);
      const opts = Object.assign({}, base, { maxPath: (inst.delay || 0) + (inst.range || 100), fanCount: 5, maxLegs: Math.min(2, state.display.skips || 2) });
      const rays = spec ? safeTrace({ specimen: spec, probe: p, derived: d, display, defects, opts }) : null;
      columns.push({ angle: a, echoes: mapEchoes(rays, inst, d) });
    }
    return { angles, columns, maxPath: (inst.delay || 0) + (inst.range || 100), T: spec ? spec.T : 0 };
  }

  /** Selected S-scan column (nearest to state.pa.angle, else probe.angle): {index, column} or null. */
  function selectColumn(sscan, state) {
    if (!sscan || !Array.isArray(sscan.columns) || !sscan.columns.length) return null;
    const want = state.pa && Number.isFinite(state.pa.angle) ? state.pa.angle : (state.probe.angle || 0);
    let bi = 0;
    for (let i = 1; i < sscan.columns.length; i++) {
      if (Math.abs((sscan.columns[i].angle || 0) - want) < Math.abs((sscan.columns[bi].angle || 0) - want)) bi = i;
    }
    return { index: bi, column: sscan.columns[bi] };
  }

  /**
   * The frame pipeline: reads UT.state, runs probe → rays → synth → gates (or TOFD / PA by mode)
   * and stores the result in UT.frame. Aliased as UT.compute.
   * @returns {object} UT.frame
   */
  function compute() {
    const state = UT.state;
    const spec = state.specimen;
    const probe = state.probe;
    const inst = state.instrument;
    const derived = UT.probe.derive(probe, spec);
    const frame = { ts: now(), mode: state.mode, derived, rays: null, echoes: [], ascan: null, readouts: null, tofd: null, aut: null, sscan: null, pa: null, paSelected: null };
    if (spec) {
      if (state.mode === 'tofd') {
        if (UT.tofd && typeof UT.tofd.compute === 'function') {
          try { frame.tofd = UT.tofd.compute(state); } catch (e) { if (!traceErrorLogged) { traceErrorLogged = true; console.error('[UT.ascan] tofd.compute failed', e); } }
        }
      } else if (probe.method === 'pa') {
        if (UT.pa && typeof UT.pa.compute === 'function') {
          try { frame.pa = UT.pa.compute(state) || null; } catch (e) { if (!traceErrorLogged) { traceErrorLogged = true; console.error('[UT.ascan] pa.compute failed', e); } frame.pa = null; }
        }
        frame.sscan = frame.pa && frame.pa.sscan ? frame.pa.sscan : computeSscan(state);
        const sel = selectColumn(frame.sscan, state);
        if (sel) {
          const p = Object.assign({}, probe, { angle: sel.column.angle, method: 'pe', mode: 'shear' });
          const d = UT.probe.derive(p, spec);
          const echoes = (sel.column.echoes || []).map(function (e) { return e.ampPct !== undefined ? e : Object.assign({}, e, { ampPct: ampPctOf(e.amp, inst, d, e.path) }); });
          echoes.sort(function (a, b) { return a.path - b.path; });
          frame.echoes = echoes;
          frame.paSelected = { angle: sel.column.angle, index: sel.index, derived: d };
          const ascan = synth({ echoes, probe: p, derived: d, instrument: inst, nSamples: N_SAMPLES, specimen: spec });
          applyPeak(ascan, inst);
          frame.ascan = ascan;
          const instPa = Object.assign({}, inst, { trig: Object.assign({}, inst.trig, { angle: sel.column.angle }) });
          frame.readouts = evalGates(ascan, instPa, d, spec, p);
        }
      } else {
        const rays = safeTrace({ specimen: spec, probe, derived, display: state.display, defects: visibleDefects(state), opts: traceOpts(state, spec, probe) });
        frame.rays = rays;
        frame.echoes = mapEchoes(rays, inst, derived);
        const ascan = synth({ echoes: rays ? rays.echoes : [], probe, derived, instrument: inst, nSamples: N_SAMPLES, specimen: spec, weldGrass: weldGrassOf(state, spec, rays) });
        applyPeak(ascan, inst);
        frame.ascan = ascan;
        frame.readouts = evalGates(ascan, inst, derived, spec, probe);
        if (state.mode === 'aut' && state.aut) {
          frame.aut = { readouts: evalGates(ascan, Object.assign({}, inst, { gates: state.aut.gates, activeGate: state.aut.activeGate }), derived, spec, probe) };
        }
      }
    }
    UT.frame = frame;
    return frame;
  }

  // ------------------------------------------------------------------ test API
  /** Finite-number coercion: numbers / numeric strings are clamped to [lo, hi]; anything else keeps prev. */
  function num(v, prev, lo, hi) {
    const n = (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) ? +v : NaN;
    return Number.isFinite(n) ? M.clamp(n, lo, hi) : prev;
  }
  function oneOf(v, list, prev) { return list.indexOf(v) >= 0 ? v : prev; }
  /** Receiver filter coercion: omitted → prev; unknown id → 'broadband' (the documented fallback, as 90's patchFromRecord). */
  function filterId(v, prev) { return v === undefined ? prev : (FILTERS.indexOf(v) >= 0 ? v : 'broadband'); }
  function bool(v, prev) { return v === undefined ? prev : !!v; }
  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

  const PROBE_ENUMS = { crystal: ['single', 'twin'], method: ['pe', 'tt', 'tandem', 'pa'], surface: ['chord', 'brace', 'web'], mode: ['comp', 'shear'] };
  const RECTIFY_ENUM = ['full', 'half+', 'half-', 'rf'];
  const STANDARD_ANGLES = [0, 45, 60, 70];

  function coerceFocus(q, cur, probe, spec) {
    const base = Object.assign({ on: false, F: 30 }, cur || {});
    const f = { on: bool(q.on, base.on), F: num(q.F, base.F, 10, 150) };
    let N = null;
    try { N = UT.probe.derive(Object.assign({}, probe, { focus: { on: false, F: f.F } }), spec).nearField; } catch (e) { N = null; }
    if (Number.isFinite(N)) f.F = Math.min(f.F, Math.max(10, N));
    return f;
  }

  /**
   * Library id for a standard angle: the entry of the same series (maker, freq, crystal, family) with that
   * angle when one exists, else UT.probe.libForAngle (the toolbar rule), else the current id.
   */
  function libIdForAngle(next) {
    const P = UT.probe;
    if (!(P && Array.isArray(P.library))) return next.libId;
    const lib = P.libEntry ? P.libEntry(next.libId) : null;
    if (lib && lib.angle === next.angle) return lib.id;
    const fam = next.angle === 0 ? 'straight' : (lib && lib.family && lib.family !== 'straight' ? lib.family : 'angle');
    if (lib) {
      const same = P.library.find(function (e) {
        return e.angle === next.angle && e.family === fam && e.maker === lib.maker && e.freq === lib.freq && e.crystalType === lib.crystalType &&
          e.crystal.a === lib.crystal.a && e.crystal.b === lib.crystal.b;
      });
      if (same) return same.id;
    }
    const e = typeof P.libForAngle === 'function' ? P.libForAngle(next.angle, fam, next.freq) : null;
    return e ? e.id : next.libId;
  }

  /**
   * UT.test.setProbe (SPEC §11): patch the probe (libId, angle, mode, x/z, skew, side, freq, diameter/crystalDims,
   * wedgeVel, PA sweep, focus, enums) with coercion/clamping, then re-render.
   * @param {object} p partial probe patch
   * @returns {object} clone of the re-derived probe (frame.derived)
   */
  function testSetProbe(p) {
    const cur = UT.state.probe;
    const q = isObj(p) ? p : {};
    let next = Object.assign({}, cur);
    if (q.libId !== undefined && UT.probe.select) {
      const sel = UT.probe.select(q.libId);
      if (sel) next = Object.assign(next, sel);
    }
    if (q.angle !== undefined) {
      next.angle = num(q.angle, next.angle, 0, 89);
      if (q.mode === undefined) next.mode = next.angle === 0 ? 'comp' : 'shear';
      if (STANDARD_ANGLES.indexOf(next.angle) >= 0 && q.libId === undefined) next.libId = libIdForAngle(next);
    }
    for (const k in PROBE_ENUMS) if (q[k] !== undefined) next[k] = oneOf(q[k], PROBE_ENUMS[k], next[k]);
    if (q.x !== undefined) next.x = num(q.x, next.x, -1e4, 1e4);
    if (q.z !== undefined) next.z = num(q.z, next.z, -1e4, 1e4);
    if (q.skew !== undefined) { const sk = num(q.skew, NaN, -1e6, 1e6); if (Number.isFinite(sk)) next.skew = ((sk % 360) + 360) % 360; }
    if (q.side !== undefined) { const sd = num(q.side, 0, -1e6, 1e6); if (sd !== 0) next.side = sd < 0 ? -1 : 1; }
    if (q.freq !== undefined) next.freq = num(q.freq, next.freq, 0.5, 25);
    if (q.diameter !== undefined) {
      next.diameter = num(q.diameter, next.diameter, 1, 50);
      next.crystalDims = { a: next.diameter, b: next.diameter, shape: 'round' };
    }
    if (isObj(q.crystalDims)) {
      const cd = Object.assign({ a: 10, b: 10, shape: 'round' }, next.crystalDims || {});
      const a = num(q.crystalDims.a, cd.a, 1, 50);
      const dims = { a, b: num(q.crystalDims.b, q.crystalDims.b === undefined && q.crystalDims.a !== undefined ? a : cd.b, 1, 50), shape: oneOf(q.crystalDims.shape, ['round', 'rect'], cd.shape) };
      next.crystalDims = dims;
      next.diameter = dims.a;
    }
    if (q.wedgeVel !== undefined) next.wedgeVel = num(q.wedgeVel, next.wedgeVel, 1, 6);
    if (q.paFrom !== undefined) next.paFrom = num(q.paFrom, next.paFrom, 0, 89);
    if (q.paTo !== undefined) next.paTo = num(q.paTo, next.paTo, 0, 89);
    if (q.paStep !== undefined) next.paStep = num(q.paStep, next.paStep, 0.25, 10);
    const spec = UT.state.specimen;
    if (isObj(q.focus)) next.focus = coerceFocus(q.focus, next.focus, next, spec);
    if (spec && spec.scanSurface && next.surface !== 'brace' && next.surface !== 'web') next.x = M.clamp(next.x, spec.scanSurface.xMin, spec.scanSurface.xMax);
    if (spec && Number.isFinite(next.z)) next.z = M.clamp(next.z, 0, spec.L || next.z);
    UT.set({ probe: next });
    const frame = UT.renderNow();
    return UT.clone(frame.derived);
  }

  function coerceGate(g, base) {
    return Object.assign({}, base, {
      on: bool(g.on, base.on), alarm: bool(g.alarm, base.alarm),
      start: num(g.start, base.start, -50, 2000), width: num(g.width, base.width, 0.1, 2000), level: num(g.level, base.level, 0, 100),
    });
  }

  /**
   * UT.test.setInstrument (SPEC §11 / SPEC-v2 §7): patch the instrument (gain, range, delay, reject, rectify, gates,
   * cal, trig, DAC, TCG, pulser, receiver, AUTO %, compare snapshot, page/readout) with coercion, then re-render.
   * @param {object} p partial instrument patch
   * @returns {object} clone of the instrument state (compare snapshot omitted)
   */
  function testSetInstrument(p) {
    const cur = UT.state.instrument;
    const patch = {};
    const q = isObj(p) ? p : {};
    if (q.gain !== undefined) patch.gain = num(q.gain, cur.gain, 0, 110);
    if (q.refGain !== undefined) patch.refGain = num(q.refGain, cur.refGain, 0, 110);
    if (q.range !== undefined) patch.range = num(q.range, cur.range, 10, 1000);
    if (q.delay !== undefined) patch.delay = num(q.delay, cur.delay, -50, 1000);
    if (q.reject !== undefined) patch.reject = num(q.reject, cur.reject, 0, 80);
    if (q.rectify !== undefined) patch.rectify = oneOf(q.rectify, RECTIFY_ENUM, cur.rectify);
    if (q.peakMem !== undefined) patch.peakMem = !!q.peakMem;
    if (q.freeze !== undefined) patch.freeze = !!q.freeze;
    if (q.activeGate !== undefined) patch.activeGate = Math.round(num(q.activeGate, cur.activeGate || 0, 0, 7));
    if (Array.isArray(q.gates)) {
      // exactly GATE_SLOTS gates (G1/G2): entries beyond the slots and non-object entries are ignored
      const gates = cur.gates.slice(0, GATE_SLOTS).map(function (g) { return Object.assign({}, g); });
      q.gates.slice(0, GATE_SLOTS).forEach(function (g, i) {
        if (!isObj(g)) return;
        gates[i] = coerceGate(g, gates[i] || { on: true, start: 10, width: 60, level: 20, alarm: false });
      });
      patch.gates = gates;
    }
    if (isObj(q.cal)) {
      const c = Object.assign({}, cur.cal);
      if (q.cal.vel !== undefined) { const v = q.cal.vel === null ? null : num(q.cal.vel, NaN, 0.5, 20); if (v === null || Number.isFinite(v)) c.vel = v; }
      if (q.cal.zero !== undefined) c.zero = num(q.cal.zero, c.zero, -100, 100);
      patch.cal = c;
    }
    if (isObj(q.trig)) {
      const t = Object.assign({}, cur.trig);
      if (q.trig.angle !== undefined) t.angle = num(q.trig.angle, t.angle, 0, 89);
      if (q.trig.thick !== undefined) t.thick = num(q.trig.thick, t.thick, 0.1, 1000);
      if (q.trig.xValue !== undefined) t.xValue = num(q.trig.xValue, t.xValue, -100, 100);
      patch.trig = t;
    }
    if (isObj(q.dac)) {
      const d = Object.assign({}, cur.dac);
      if (q.dac.on !== undefined) d.on = !!q.dac.on;
      if (q.dac.curves !== undefined) d.curves = !!q.dac.curves;
      if (q.dac.refDb !== undefined) { const r = q.dac.refDb === null ? null : num(q.dac.refDb, NaN, 0, 110); if (r === null || Number.isFinite(r)) d.refDb = r; }
      if (Array.isArray(q.dac.points)) {
        d.points = q.dac.points.filter(function (pt) { return isObj(pt) && Number.isFinite(+pt.path) && Number.isFinite(+pt.ampPct); })
          .map(function (pt) { return { path: M.clamp(+pt.path, 0, 2000), ampPct: M.clamp(+pt.ampPct, 0, CLIP_PCT) }; })
          .sort(function (a, b) { return a.path - b.path; });
      }
      patch.dac = d;
    }
    // v2: TCG, pulser, receiver, AUTO %, compare snapshot
    if (isObj(q.tcg)) patch.tcg = Object.assign({}, cur.tcg || { on: false }, { on: bool(q.tcg.on, !!(cur.tcg && cur.tcg.on)) });
    const pulser = Object.assign({ energy: 200, damping: 150, prf: 60 }, cur.pulser || {});
    let pulserTouched = false;
    if (isObj(q.pulser)) {
      if (q.pulser.energy !== undefined) { const e = normEnergy(q.pulser.energy); if (e) { pulser.energy = e; pulserTouched = true; } }
      if (q.pulser.damping !== undefined) {
        const o = nearestOhms(q.pulser.damping);
        if (o) { pulser.damping = o; pulserTouched = true; if (q.damping === undefined) patch.damping = (o === 50); }
      }
      if (q.pulser.prf !== undefined) { const f = num(q.pulser.prf, NaN, 10, 5000); if (Number.isFinite(f)) { pulser.prf = f; pulserTouched = true; } }
    }
    if (q.damping !== undefined) {
      patch.damping = !!q.damping;
      if (!(isObj(q.pulser) && q.pulser.damping !== undefined)) { pulser.damping = patch.damping ? 50 : 150; pulserTouched = true; }
    }
    if (pulserTouched) patch.pulser = pulser;
    if (isObj(q.receiver)) patch.receiver = Object.assign({}, cur.receiver || { filter: 'broadband' }, { filter: filterId(q.receiver.filter, (cur.receiver && cur.receiver.filter) || 'broadband') });
    if (q.autoPct !== undefined) patch.autoPct = num(q.autoPct, cur.autoPct === undefined ? 80 : cur.autoPct, 1, 120);
    if (q.compare !== undefined) patch.compare = q.compare ? snapshot() : null;
    for (const k of ['page', 'readout', 'selectedParam']) if (q[k] !== undefined && (typeof q[k] === 'string' || typeof q[k] === 'number')) patch[k] = q[k];
    UT.setIn('instrument', patch);
    UT.renderNow();
    return UT.clone(Object.assign({}, UT.state.instrument, { compare: undefined }));
  }

  /**
   * UT.test.setDampers: set the damper x positions (≤ 3 finite numbers) and re-render.
   * @param {number[]} xs damper positions (mm)
   * @returns {number[]} the accepted positions
   */
  function testSetDampers(xs) {
    const pts = (Array.isArray(xs) ? xs : []).map(function (v) { return +v; }).filter(Number.isFinite).slice(0, 3);
    UT.setIn('damping', { points: pts });
    UT.renderNow();
    return pts.slice();
  }

  /**
   * UT.test.setPhysics: patch the physics toggles (modeConv, surfaceWave, sideLobes, fanRays 21|41) and re-render.
   * @param {object} p partial physics patch
   * @returns {object} clone of state.physics
   */
  function testSetPhysics(p) {
    const cur = UT.state.physics || { modeConv: true, surfaceWave: true, sideLobes: true, fanRays: 41 };
    const q = isObj(p) ? p : {};
    const patch = {};
    for (const k of ['modeConv', 'surfaceWave', 'sideLobes']) if (q[k] !== undefined) patch[k] = !!q[k];
    if (q.fanRays !== undefined) patch.fanRays = +q.fanRays === 21 ? 21 : 41;
    UT.set({ physics: Object.assign({}, cur, patch) });
    UT.renderNow();
    return UT.clone(UT.state.physics);
  }

  /**
   * UT.test.setFocus: coerce a focus patch against the current probe/specimen and re-render.
   * @param {object} p focus patch ({on, F} — F in mm, clamped to 10…150 and to the near field)
   * @returns {object} clone of probe.focus
   */
  function testSetFocus(p) {
    const probe = UT.state.probe;
    const q = isObj(p) ? p : {};
    const focus = coerceFocus(q, probe.focus, probe, UT.state.specimen);
    UT.setIn('probe', { focus });
    UT.renderNow();
    return UT.clone(UT.state.probe.focus);
  }

  /**
   * UT.test.selectProbe: select a probe-library entry by id and re-render.
   * @param {string} libId library entry id
   * @returns {object|null} clone of the re-derived probe, or null when the id is unknown
   */
  function testSelectProbe(libId) {
    if (!(UT.probe && typeof UT.probe.select === 'function')) return null;
    const sel = UT.probe.select(libId);
    if (!sel) return null;
    UT.setIn('probe', sel);
    const frame = UT.renderNow();
    return UT.clone(frame.derived);
  }

  /**
   * UT.test.echoes: plain-object copies of the current frame's echo list (path, ampPct, kind, leg, x/y, defectId, tag, tUs, mode, lenMm).
   * @returns {object[]} echoes of UT.frame
   */
  function testEchoes() {
    return (UT.frame.echoes || []).map(function (e) {
      return { path: e.path, ampPct: e.ampPct, amp: e.amp, kind: e.kind, leg: e.leg, x: e.x, y: e.y, defectId: e.defectId === undefined ? null : e.defectId, tag: e.tag || null, angleDev: e.angleDev === undefined ? null : e.angleDev,
        tUs: Number.isFinite(e.tUs) ? e.tUs : null, mode: e.mode || null, lenMm: Number.isFinite(e.lenMm) ? e.lenMm : null };
    });
  }

  /**
   * UT.test.ascan: plain copy of the current A-scan trace (samples, range, delay, rf, peak, grassPct, initialPulse).
   * @returns {object} A-scan snapshot (empty samples when no frame has been rendered)
   */
  function testAscan() {
    const a = UT.frame.ascan;
    if (!a) return { samples: [], range: UT.state.instrument.range, delay: UT.state.instrument.delay };
    return { samples: Array.from(a.samples), range: a.range, delay: a.delay, rf: a.rf ? Array.from(a.rf) : null, peak: a.peak ? Array.from(a.peak) : null, grassPct: a.grassPct, initialPulse: a.initialPulse };
  }

  // ------------------------------------------------------------------ self test (headless)
  /** Headless self test of the A-scan synthesiser (time base, gain law, gates, DAC/TCG, pulser/receiver); returns a list of failures. */
  function __selftest() {
    const f = [];
    const derived = UT.probe.derive({ angle: 60, freq: 5, diameter: 10, wedgeVel: 2.74, side: 1, mode: 'shear' }, null);
    const inst = { gain: 30, refGain: 30, range: 100, delay: 0, reject: 0, damping: false, rectify: 'full', gates: [{ on: true, start: 10, width: 80, level: 10 }], activeGate: 0, cal: { vel: null, zero: 0 }, trig: { angle: 60, thick: 20, xValue: 0 }, dac: { points: [], on: false, refDb: null } };
    const probe = { angle: 60, x: 40, z: 150, crystal: 'single', method: 'pe' };
    // time base
    const a1 = synth({ echoes: [{ path: 50, amp: 0.3, kind: 'sdh' }], probe, derived, instrument: inst });
    const es = a1.echoesOnScreen[0];
    if (Math.abs(es.xDiv - 5) > 1e-6) f.push('xDiv range100 path50 = ' + es.xDiv);
    const a2 = synth({ echoes: [{ path: 50, amp: 0.3, kind: 'sdh' }], probe, derived, instrument: Object.assign({}, inst, { delay: 20 }) });
    if (Math.abs(a2.echoesOnScreen[0].xDiv - 3) > 1e-6) f.push('xDiv delay20 = ' + a2.echoesOnScreen[0].xDiv);
    // v2: time-based placement — an echo with tUs = 2·path/vel lands exactly where the path does
    const aT = synth({ echoes: [{ path: 50, tUs: 2 * 50 / derived.vel, mode: 'S', amp: 0.3, kind: 'sdh' }], probe, derived, instrument: inst });
    if (Math.abs(aT.echoesOnScreen[0].xDiv - 5) > 1e-9) f.push('tUs placement ' + aT.echoesOnScreen[0].xDiv);
    const aC = synth({ echoes: [{ path: 61.7, tUs: 38.1, mode: 'S', amp: 0.3, kind: 'modeconv' }], probe, derived, instrument: inst });
    if (Math.abs(aC.echoesOnScreen[0].pDisp - 38.1 * derived.vel / 2) > 1e-9) f.push('converted echo placed by time');
    if (Math.abs(dispPathOfTime(trueTime(26, derived), inst, derived) - 26) > 1e-9) f.push('dispPathOfTime');
    // gain +6 dB doubles
    const p0 = ampPctOf(0.1, { gain: 20 }), p6 = ampPctOf(0.1, { gain: 26 });
    if (Math.abs(p6 / p0 - 1.995) > 0.01) f.push('+6 dB ratio ' + (p6 / p0));
    // readouts 60°, path 26 → SD 22.5, DP 13.0, leg 1
    const g1 = geometry(26, 60, 20, 0);
    if (Math.abs(g1.sd - 22.52) > 0.05 || Math.abs(g1.dp - 13) > 0.05 || g1.leg !== 1) f.push('geometry 26: ' + JSON.stringify(g1));
    const g2 = geometry(50, 60, 20, 0);
    if (Math.abs(g2.dp - 15) > 0.05 || g2.leg !== 2) f.push('geometry 50: ' + JSON.stringify(g2));
    const g3 = geometry(90, 60, 20, 0);
    if (Math.abs(g3.dp - 5) > 0.05 || g3.leg !== 3) f.push('geometry 90: ' + JSON.stringify(g3));
    const g0 = geometry(26.06, 0, 25, 0);   // 0°: no leg fold (austenitic backwall through a carbon cal reads 26.1, V2-4)
    if (Math.abs(g0.dp - 26.06) > 1e-9 || g0.leg !== 1) f.push('geometry 0° fold: ' + JSON.stringify(g0));
    // evalGates on a synthetic echo (amp chosen so the peak is well above level, below clip)
    const k = kRef();
    const amp = 60 / (k * M.dB2lin(30));
    const a3 = synth({ echoes: [{ path: 26, amp, kind: 'sdh' }], probe, derived, instrument: inst });
    const r = evalGates(a3, inst, derived, { T: 20 }, probe);
    if (!r.primary) f.push('no primary readout');
    else {
      if (Math.abs(r.primary.path - 26) > 1e-6) f.push('readout path ' + r.primary.path);
      if (Math.abs(r.primary.peakPct - 60) > 0.5) f.push('readout peakPct ' + r.primary.peakPct);
      if (Math.abs(r.primary.sd - 22.5) > 0.1 || Math.abs(r.primary.dp - 13) > 0.1) f.push('readout sd/dp ' + r.primary.sd + '/' + r.primary.dp);
      if (r.textDP !== '13.00' || r.textAmp !== '60%') f.push('readout text ' + r.textDP + ' ' + r.textAmp);
      if (Math.abs(r.primary.pathDisp - 26) > 1e-6) f.push('readout pathDisp default cal ' + r.primary.pathDisp);
      // autoGain: 60 % at 30 dB → 80 % needs +2.5 dB
      const ag = autoGain(80, { frame: { readouts: r }, instrument: inst });
      if (Math.abs(ag - (30 + M.lin2dB(80 / 60))) > 1e-6) f.push('autoGain ' + ag);
    }
    // wrong cal (lesson 12): path stays TRUE, pathDisp / SP / SD / DP follow the cal mapping and the trace
    {
      const badInst = Object.assign({}, inst, { cal: { vel: 5.6, zero: 0.4 }, trig: { angle: 0, thick: 10, xValue: 0 }, gates: [{ on: true, start: 5, width: 40, level: 10 }] });
      const d0c = UT.probe.derive({ angle: 0, freq: 5, diameter: 10 }, null);
      const amp0 = 60 / (k * M.dB2lin(30));
      const a8 = synth({ echoes: [{ path: 10, amp: amp0, kind: 'backwall' }], probe: { angle: 0, crystal: 'twin', method: 'pe', x: 0, z: 0 }, derived: d0c, instrument: badInst });
      const r8 = evalGates(a8, badInst, d0c, { T: 10 }, { angle: 0 });
      const pd = dispPath(10, badInst, d0c);
      if (!r8.primary) f.push('no primary readout (wrong cal)');
      else {
        if (Math.abs(r8.primary.path - 10) > 1e-6) f.push('wrong-cal path not true ' + r8.primary.path);
        if (Math.abs(r8.primary.pathDisp - pd) > 1e-6 || Math.abs(pd - 8.37) > 0.02) f.push('wrong-cal pathDisp ' + r8.primary.pathDisp + ' vs ' + pd);
        if (Math.abs(r8.primary.xDiv - xDivOfDisp(pd, badInst)) > 1e-6) f.push('wrong-cal xDiv/pathDisp disagree');
        if (r8.textSP !== M.fmt2(pd) || Math.abs(r8.primary.dp - pd) > 1e-6) f.push('wrong-cal textSP/dp ' + r8.textSP + ' ' + r8.primary.dp);
      }
    }
    const sMax = Math.max.apply(null, Array.from(a3.samples));
    if (Math.abs(sMax - 60) > 1) f.push('sample peak ' + sMax);
    // reject & clip
    const a4 = synth({ echoes: [{ path: 26, amp: amp * 10, kind: 'sdh' }], probe, derived, instrument: Object.assign({}, inst, { reject: 30 }) });
    const m4 = Math.max.apply(null, Array.from(a4.samples));
    if (m4 !== CLIP_PCT) f.push('clip ' + m4);
    if (a4.samples[0] !== 0) f.push('reject grass');
    // rf carrier present
    const a5 = synth({ echoes: [{ path: 26, amp, kind: 'sdh' }], probe, derived, instrument: Object.assign({}, inst, { rectify: 'rf' }) });
    if (!a5.rf || Math.min.apply(null, Array.from(a5.rf)) > -10) f.push('rf negative half-cycles missing');
    // initial pulse
    const d0 = UT.probe.derive({ angle: 0, freq: 5, diameter: 10 }, null);
    const a6 = synth({ echoes: [], probe: { angle: 0, crystal: 'single', method: 'pe', x: 0, z: 0 }, derived: d0, instrument: inst });
    if (!a6.initialPulse || a6.samples[0] !== CLIP_PCT) f.push('initial pulse single');
    const a7 = synth({ echoes: [], probe: { angle: 0, crystal: 'twin', method: 'pe', x: 0, z: 0 }, derived: d0, instrument: inst });
    if (a7.initialPulse || a7.samples[0] > GRASS_PCT + 0.01) f.push('initial pulse twin');
    // grass law (§3.4): carbon 5 MHz at 40 dB = 2 % max (mean ≈ 1 %); austenitic ≥ 3× carbon; ×3 in weld windows
    {
      const i40 = Object.assign({}, inst, { gain: 40 });
      const gc = synth({ echoes: [], probe, derived, instrument: i40, material: 'carbon' });
      const ga = synth({ echoes: [], probe, derived, instrument: i40, material: 'austenitic' });
      if (Math.abs(gc.grassLevel - GRASS_PCT) > 1e-9) f.push('carbon grass level ' + gc.grassLevel);
      const gmax = Math.max.apply(null, Array.from(gc.samples));
      if (gmax > GRASS_PCT + 1e-6 || Math.abs(gc.grassPct - 1) > 0.15) f.push('carbon grass ' + gmax + ' mean ' + gc.grassPct);
      if (!(ga.grassPct >= 3 * gc.grassPct)) f.push('austenitic grass ratio ' + (ga.grassPct / gc.grassPct));
      const g30 = synth({ echoes: [], probe, derived, instrument: inst, material: 'carbon' });
      if (Math.abs(g30.grassLevel - GRASS_PCT * M.dB2lin(-10)) > 1e-9) f.push('grass gain scaling');
      const g2 = synth({ echoes: [], probe, derived: UT.probe.derive({ angle: 60, freq: 2.5, diameter: 10, wedgeVel: 2.74, side: 1 }, null), instrument: i40, material: 'carbon' });
      if (Math.abs(g2.grassLevel - GRASS_PCT * 0.25) > 1e-9) f.push('grass frequency scaling');
      const gw = synth({ echoes: [], probe, derived, instrument: i40, material: 'carbon', weldGrass: { windows: [{ from: 40, to: 60 }], factor: 3 } });
      let inW = 0, nW = 0, outW = 0, nO = 0;
      for (let i = 0; i < gw.n; i++) { const p = gw.pathAt(i); if (p >= 40 && p <= 60) { inW += gw.samples[i]; nW++; } else { outW += gw.samples[i]; nO++; } }
      if (!(inW / nW > 2.5 * (outW / nO))) f.push('weld grass window ×3: ' + (inW / nW) / (outW / nO));
      if (!gw.weldWindows || gw.weldWindows.length !== 1) f.push('weldWindows echoed');
    }
    // DAC
    const dInst = Object.assign({}, inst, { gain: 40, dac: { points: [{ path: 20, ampPct: 80 }, { path: 60, ampPct: 40 }], on: true, refDb: 34 } });
    const c = dacAt(dInst, 40);
    if (Math.abs(c - 60 * M.dB2lin(6)) > 0.05) f.push('dacAt interp ' + c);
    if (Math.abs(dacAt(dInst, 100) - 40 * M.dB2lin(6)) > 0.05) f.push('dacAt hold');
    const cv = dacCurves(dInst, derived);
    if (cv.ref.length !== 2 || Math.abs(cv.m6[0].pct / cv.ref[0].pct - 0.501) > 0.01 || Math.abs(cv.m14[0].pct / cv.ref[0].pct - 0.1995) > 0.005) f.push('dac curves');
    const rec = dacRecord(Object.assign({}, inst, { gain: 40, dac: { points: [], on: false, refDb: null } }), { path: 30, peakPct: 80 });
    if (!rec || rec.refDb !== 40 || rec.points.length !== 1 || rec.points[0].ampPct !== 80) f.push('dacRecord first');
    const rec2 = dacRecord(Object.assign({}, inst, { gain: 46, dac: rec }), { path: 50, peakPct: 80 });
    if (!rec2 || Math.abs(rec2.points[1].ampPct - 40.09) > 0.1) f.push('dacRecord normalise');
    if (dacRecord(Object.assign({}, inst, { gain: 20, dac: rec }), { path: 50, peakPct: 80 }) !== null) f.push('dacRecord refuse >120');
    const hot = Object.assign({}, inst, { gain: 40, dac: { points: [{ path: 25, ampPct: 119 }, { path: 50, ampPct: 76 }], on: true, refDb: 34 } });
    if (Math.abs(dacCurve(hot, derived)[0].pct - 100 * M.dB2lin(6)) > 0.05) f.push('dacCurve clip 100 @ refGain');
    if (Math.abs(dacAt(hot, 25) - 100 * M.dB2lin(6)) > 0.05 || Math.abs(dacAt(hot, 50) - 76 * M.dB2lin(6)) > 0.05) f.push('dacAt clip');
    // TCG (§3.7): per-echo gain from the DAC at refGain; echoes on the curve read 80 % at gain = refDb
    {
      const tInst = Object.assign({}, inst, { gain: 34, refGain: 34, tcg: { on: true }, dac: { points: [{ path: 20, ampPct: 80 }, { path: 60, ampPct: 40 }], on: true, refDb: 34 }, gates: [{ on: true, start: 10, width: 80, level: 5 }] });
      if (Math.abs(tcgGainAt(60, tInst) - 6.02) > 0.02 || Math.abs(tcgGainAt(20, tInst)) > 1e-9 || Math.abs(tcgGainAt(40, tInst) - M.lin2dB(80 / 60)) > 1e-9) f.push('tcgGainAt');
      if (tcgGainAt(60, Object.assign({}, tInst, { tcg: { on: false } })) !== 0) f.push('tcg off → 0');
      const ampOn = 40 / (k * M.dB2lin(34));   // 40 % at 34 dB without TCG
      if (Math.abs(ampPctOf(ampOn, tInst, derived, 60) - 80) > 1e-6) f.push('TCG ampPctOf ' + ampPctOf(ampOn, tInst, derived, 60));
      if (Math.abs(ampPctOf(ampOn, Object.assign({}, tInst, { gain: 40 }), derived, 60) - 80 * M.dB2lin(6)) > 1e-6) f.push('TCG +6 dB → 160');
      const aTcg = synth({ echoes: [{ path: 60, amp: ampOn, kind: 'sdh' }], probe, derived, instrument: tInst });
      const rTcg = evalGates(aTcg, tInst, derived, { T: 20 }, probe);
      if (!rTcg.primary || Math.abs(rTcg.primary.peakPct - 80) > 1e-6 || Math.abs(rTcg.primary.dacPct - 100) > 1e-6) f.push('TCG readout ' + JSON.stringify(rTcg.primary));
      if (Math.abs(aTcg.echoesOnScreen[0].ampPct - 80) > 1e-6 || !aTcg.tcg) f.push('TCG onScreen ampPct');
      const flat = dacCurve(tInst, derived);
      if (flat.length !== 2 || Math.abs(flat[0].pct - 80) > 1e-9 || Math.abs(flat[1].pct - 80) > 1e-9) f.push('TCG flat DAC curve');
      if (Math.abs(dacAt(Object.assign({}, tInst, { gain: 40 }), 60) - 80 * M.dB2lin(6)) > 1e-6) f.push('TCG flat dacAt follows gain');
      // clip −12 / +40
      const tLo = Object.assign({}, tInst, { dac: { points: [{ path: 10, ampPct: 100 }, { path: 60, ampPct: 0.5 }], on: true, refDb: 34 } });
      if (Math.abs(tcgGainAt(60, tLo) - 40) > 1e-9) f.push('tcg clip +40');
      const tHi = Object.assign({}, tInst, { dac: { points: [{ path: 10, ampPct: 120 }, { path: 60, ampPct: 119 }], on: true, refDb: 34 } });
      if (!(tcgGainAt(10, tHi) >= -12) || Math.abs(tcgGainAt(10, tHi) - M.lin2dB(0.8)) > 1e-9) f.push('tcg clipped curve ' + tcgGainAt(10, tHi));
      // grass is not TCG-scaled
      const gT = synth({ echoes: [], probe, derived, instrument: tInst, material: 'carbon' });
      const gN = synth({ echoes: [], probe, derived, instrument: Object.assign({}, tInst, { tcg: { on: false } }), material: 'carbon' });
      if (Math.abs(gT.grassLevel - gN.grassLevel) > 1e-9) f.push('grass TCG-scaled');
    }
    // pulser / receiver (§3.7)
    {
      const base = { gain: 30, damping: false, pulser: { energy: 200, damping: 150, prf: 60 }, receiver: { filter: 'broadband' } };
      const at = function (o) { return ampPctOf(0.1, Object.assign({}, base, o), derived, 30); };
      const dB = function (a, b) { return M.lin2dB(a / b); };
      if (Math.abs(dB(at({ pulser: { energy: 400 } }), at({ pulser: { energy: 100 } })) - 12) > 1e-6) f.push('energy 400 vs 100 ≠ +12 dB');
      if (Math.abs(dB(at({ pulser: { energy: 'high' } }), at({ pulser: { energy: 'low' } })) - 12) > 1e-6) f.push('energy labels');
      if (Math.abs(dB(at({ pulser: { energy: 300 } }), at({})) - 3) > 1e-6 || Math.abs(at({}) - ampPctOf(0.1, { gain: 30 })) > 1e-9) f.push('energy 300 / default');
      if (Math.abs(dB(at({ damping: true }), at({})) + 2) > 1e-6) f.push('damping:true ≠ −2 dB');
      if (Math.abs(dB(at({ pulser: { damping: 50 }, damping: true }), at({ pulser: { damping: 150 } })) + 2) > 1e-6) f.push('50 Ω vs 150 Ω');
      if (dampingOhms({ damping: false, pulser: { damping: 50 } }) !== 150 || dampingOhms({ damping: true, pulser: { damping: 400 } }) !== 50 || dampingOhms({}) !== 150) f.push('dampingOhms single source');
      if (Math.abs(dB(at({ pulser: { damping: 400 } }), at({})) - 1) > 1e-6 || Math.abs(dB(at({ pulser: { damping: 100 } }), at({})) + 1) > 1e-6) f.push('damping Ω dB');
      const w = function (o) { return sigmaOf(derived, Object.assign({}, base, o)); };
      if (Math.abs(w({}) - 0.5 * derived.lambda * 1.5) > 1e-9) f.push('sigma default');
      if (Math.abs(w({ damping: true }) / w({}) - 0.75) > 1e-9 || Math.abs(w({ pulser: { damping: 400 } }) / w({}) - 1.3) > 1e-9) f.push('damping width');
      if (Math.abs(w({ pulser: { energy: 100 } }) / w({}) - 1.2) > 1e-9 || Math.abs(w({ pulser: { energy: 400 } }) / w({}) - 0.9) > 1e-9) f.push('energy width');
      const d2 = UT.probe.derive(Object.assign({ wedgeVel: 2.74, side: 1 }, UT.probe.select('mwb60-2')), null);
      const at2 = function (o) { return ampPctOf(0.1, Object.assign({}, base, o), d2, 30); };
      if (Math.abs(dB(at2({ receiver: { filter: '5-15' } }), at2({})) + 6) > 1e-6) f.push('filter mismatch 2 MHz / 5-15');
      if (Math.abs(sigmaOf(d2, Object.assign({}, base, { receiver: { filter: '5-15' } })) / sigmaOf(d2, base) - 1.3) > 1e-9) f.push('filter mismatch width');
      if (Math.abs(at({ receiver: { filter: '5-15' } }) - at({})) > 1e-9 || Math.abs(at({ receiver: { filter: '1.5-8.5' } }) - at({})) > 1e-9) f.push('5 MHz in band changed amplitude');
      if (Math.abs(at2({ receiver: { filter: 'broadband' } }) - at2({})) > 1e-9 || Math.abs(at2({ receiver: { filter: '0.2-10' } }) - at2({})) > 1e-9) f.push('broadband / 0.2-10 changed the 2 MHz probe');
      if (filterMismatch({ receiver: { filter: 'nonsense' } }, d2)) f.push('unknown filter should be broadband');
      if (filterId('nonsense', '5-15') !== 'broadband' || filterId(undefined, '5-15') !== '5-15' || filterId('0.2-10', '5-15') !== '0.2-10') f.push('setInstrument filter coercion');
    }
    const tOpts = traceOpts({ instrument: { range: 100, delay: 0 }, display: { skips: 3 } }, { kind: 'weld', T: 10 }, { angle: 0, x: 60 });
    if (tOpts.maxLegs !== 22) f.push('traceOpts 0deg maxLegs ' + tOpts.maxLegs);
    if (traceOpts({ instrument: { range: 1000, delay: 0 }, display: { skips: 3 } }, { kind: 'weld', T: 5 }, { angle: 0, x: 60 }).maxLegs !== MAX_LEGS_0DEG) f.push('traceOpts cap');
    if (traceOpts({ instrument: { range: 100, delay: 0 }, display: { skips: 3 } }, { kind: 'weld', T: 10 }, { angle: 60, x: 60 }).maxLegs !== 3) f.push('traceOpts angle');
    // v2 trace options from state
    {
      if (tOpts.fanCount !== 41 || tOpts.physics.modeConv !== true || tOpts.physics.sideLobes !== true || tOpts.physics.surfaceWave !== true || tOpts.physics.fanRays !== 41) f.push('traceOpts v2 defaults ' + JSON.stringify(tOpts));
      if (tOpts.weldMaterial !== 'same' || tOpts.transferLossDb !== 0 || !Array.isArray(tOpts.damping.points)) f.push('traceOpts v2 fallbacks');
      const s2 = { instrument: { range: 100, delay: 0 }, display: { skips: 2 }, physics: { modeConv: false, surfaceWave: true, sideLobes: false, fanRays: 21 }, damping: { tool: true, points: [10, 20, 30, 40] }, weldOpts: { weldMaterial: 'austenitic', transferLossDb: 12 } };
      const o2 = traceOpts(s2, { kind: 'weld', T: 20 }, { angle: 60, x: 40 });
      if (o2.fanCount !== 21 || o2.physics.modeConv !== false || o2.physics.sideLobes !== false || o2.damping.points.length !== 3 || o2.weldMaterial !== 'austenitic' || o2.transferLossDb !== 8 || o2.maxLegs !== 2 || o2.maxPath !== 100) f.push('traceOpts v2 values ' + JSON.stringify(o2));
      if (traceOpts(Object.assign({}, s2, { physics: { fanRays: 33 } }), null, { angle: 60 }).fanCount !== 41) f.push('fanRays clamp');
    }
    if (num('abc', 7, 0, 10) !== 7 || num(NaN, 7, 0, 10) !== 7 || num('12', 7, 0, 10) !== 10 || num(null, 7, 0, 10) !== 7 || num(true, 7, 0, 10) !== 7 || num(-3, 7, 0, 10) !== 0) f.push('num()');
    if (normEnergy('HIGH') !== 400 || normEnergy('low') !== 100 || normEnergy('med') !== 200 || normEnergy(250) !== 200 || normEnergy(360) !== 400 || normEnergy('x') !== null) f.push('normEnergy');
    if (nearestOhms(60) !== 50 || nearestOhms(300) !== 200 || nearestOhms('foo') !== null) f.push('nearestOhms');
    // cal round-trip (auto-cal numbers per §15.5)
    const dz = UT.probe.derive({ angle: 0, freq: 5, diameter: 10 }, null);
    const wrong = Object.assign({}, inst, { cal: { vel: 5.6, zero: 0.4 } });
    if (Math.abs(dispPath(10, wrong, dz) - 8.37) > 0.02) f.push('wrong cal disp ' + dispPath(10, wrong, dz));
    const t1 = trueTime(10, dz), t2 = trueTime(25, dz);
    const vel = 2 * (25 - 10) / (t2 - t1), zero = t1 - dz.wedgeDelayUs - 2 * 10 / vel;
    const good = Object.assign({}, inst, { cal: { vel, zero } });
    if (Math.abs(dispPath(10, good, dz) - 10) > 1e-6 || Math.abs(dispPath(25, good, dz) - 25) > 1e-6) f.push('cal round trip');
    if (Math.abs(truePath(dispPath(17, wrong, dz), wrong, dz) - 17) > 1e-6) f.push('truePath inverse');
    // peak memory
    peakWasOn = false; clearPeak();
    applyPeak(a3, Object.assign({}, inst, { peakMem: true }));
    if (!a3.peak || Math.abs(Math.max.apply(null, Array.from(a3.peak)) - sMax) > 1e-3) f.push('peak mem');
    applyPeak(a1, Object.assign({}, inst, { peakMem: false }));
    if (a1.peak !== null) f.push('peak mem off');
    // snapshot is a copy
    const snap = snapshot({ ascan: a3 });
    if (!(snap instanceof Float32Array) || snap === a3.samples || snap.length !== a3.samples.length || Math.abs(Math.max.apply(null, Array.from(snap)) - sMax) > 1e-3) f.push('snapshot');
    // weld windows from a centre ray through the default weld (60° at x 40 crosses the weld in leg 1/2)
    if (UT.specimens && UT.specimens.plateWeld && UT.rays && UT.rays.trace) {
      const spec = UT.specimens.plateWeld({ T: 20 });
      const pr = Object.assign({}, refProbe(40), { z: 150 });
      const dv = UT.probe.derive(pr, spec);
      const rays = UT.rays.trace({ specimen: spec, probe: pr, derived: dv, display: { skips: 3 }, defects: [], opts: traceOpts({ instrument: { range: 100, delay: 0 }, display: { skips: 3 } }, spec, pr) });
      const ww = weldWindowsOf(spec, rays);
      if (!ww || !ww.length || !(ww[0].from > 20 && ww[0].to <= 60 && ww[0].to > ww[0].from)) f.push('weldWindowsOf ' + JSON.stringify(ww));
      if (weldWindowsOf(UT.specimens.dacBlock ? UT.specimens.dacBlock({ T: 50 }) : null, rays) !== null && UT.specimens.dacBlock) f.push('weldWindowsOf block should be null');
    }
    return f;
  }

  // ------------------------------------------------------------------ exports
  const ascan = {
    /** Defects with visible !== false (shared by 55-aut / 56-pa). */
    visibleDefects,
    N_SAMPLES, CLIP_PCT, GRASS_PCT, DAMP_DB, TCG_TARGET_PCT, TCG_MIN_DB, TCG_MAX_DB,
    ENERGIES, DAMPING_OHMS, PRF_LIST, FILTERS, ENERGY_DB, DAMPING_DB, ENERGY_WIDTH, DAMPING_WIDTH, FILTER_BANDS, ENERGY_LABELS,
    synth, evalGates, geometry, dacCurve, dacCurves, dacAt, dacAtRef, dacRecord, computeSscan, compute,
    ampPctOf, dispPath, dispPathOfTime, dispPathOfEcho, truePath, trueTime, xDivOf, xDivOfDisp, sigmaOf, clearPeak, calibrateK,
    tcgGainAt, tcgActive, pulserDb, receiverDb, offsetDb, widthFactor, filterMismatch, dampingOhms, energyV, normEnergy, nearestOhms, filterOf,
    grassLevelPct, weldWindowsOf, traceOpts, autoGain, snapshot, selectColumn,
    /** Where K_REF came from: 'unset' | 'provisional' | 'traced'. */
    get kSource() { return _kSource; },
    __selftest,
  };
  Object.defineProperty(ascan, 'K_REF', {
    enumerable: true,
    get: function () { return kRef(); },
    set: function (v) { if (Number.isFinite(v) && v > 0) { _kRef = v; _kSource = 'manual'; } },
  });
  UT.ascan = ascan;
  UT.compute = compute;

  Object.assign(UT.test, {
    setProbe: testSetProbe,
    setInstrument: testSetInstrument,
    setDampers: testSetDampers,
    setPhysics: testSetPhysics,
    setFocus: testSetFocus,
    selectProbe: testSelectProbe,
    compute: function () { return UT.renderNow(); },
    echoes: testEchoes,
    ascan: testAscan,
    readouts: function () { return UT.frame.readouts; },
  });
})(window.UT = window.UT || {});
