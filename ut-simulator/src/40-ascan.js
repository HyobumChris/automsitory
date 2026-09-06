/* 40-ascan.js — A-scan synthesis, time base / calibration, gain, gates, DAC, peak memory,
 * readouts, phased-array S-scan columns and the frame pipeline (UT.compute).
 * Pure functions of their arguments except compute(), which is the ONLY reader of UT.state here.
 */
// SPEC NOTES (decisions where the spec is silent or ambiguous)
// - K_REF: lazily calibrated on first use from UT.rays.trace on UT.specimens.dacBlock({T: 50}) (the
//   frozen dacBlock puts the T/2 hole at x = 150, depth 25 → 60° path = 50 mm). The probe x is scanned
//   ±1.5 mm around 150 + 25·tan60 and the strongest 'sdh' echo near 50 mm is used so that 80 % FSH is
//   read at 34 dB. When UT.rays is missing (or gives no usable echo) a provisional constant is used
//   (2.64, derived analytically from §6.1 rule 4: S 1, D = (38.6/50)^1.5, M = 10^(−1/20)).
//   UT.ascan.K_REF is an accessor property (settable for tuning); UT.ascan.calibrateK() forces a redo.
// - Damping (−2 dB) is applied inside ampPctOf() so frame.echoes, echoesOnScreen and readouts agree.
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
//   so a saturated echo is still found at its centre rather than at the first clipped sample; it is attributed to the on-screen echo whose displayed path
//   is within max(2·sigma, 1 mm) of the peak sample (the strongest such echo) so peakPct is the
//   UNCLIPPED echo amplitude and `path` its TRUE path. Grass/initial-pulse peaks report echoKind 'noise'
//   / 'initial' with the sample value and the inverse-cal true path.
// - SD = path·sin(trig.angle) − trig.xValue (X Value = wedge front offset, default 0); DP/leg fold
//   d = path·cos(trig.angle) into 0..trig.thick: leg = floor(d/T) + 1, dp = leg odd ? d mod T : T − d mod T.
// - dacCurve() returns the recorded points sorted by path, scaled to the CURRENT gain (unclipped; the
//   renderer clips at the screen top), each with xDiv; dacCurves() adds the −6 / −14 dB curves;
//   dacAt(instrument, path) interpolates with end-value hold (readouts use TRUE path).
//   dacRecord(instrument, primary) returns the new `dac` object (or null when the normalised value
//   would exceed 120 %) — the workflow itself belongs to 80-modes.
// - Peak memory is only updated by compute() (synth() never touches the buffer, so AUT/TOFD re-use is
//   side-effect free); the buffer is cleared when peakMem turns off/on, when range/delay/nSamples
//   change and by clearPeak().
// - In 'tofd' mode rays/echoes/ascan/readouts are null (UT.tofd.compute owns the frame.tofd result).
//   In 'aut' mode the live A-scan is at probe.z and frame.aut.readouts evaluates aut.gates.
// - Trace failures are caught (logged once) so the UI keeps rendering with an empty frame.
// - setInstrument() clamps gain 0…110, range 10…1000, delay −50…1000, reject 0…80; gates given as an
//   array are merged per index into clones of the existing gates. It returns a clone of the instrument.
(function (UT) {
  'use strict';
  const M = UT.math;
  const C = UT.consts;

  const N_SAMPLES = 1000;
  const CLIP_PCT = 120;
  const GRASS_PCT = 2;
  const DAMP_DB = -2;
  const PROVISIONAL_K = 2.64;

  // ------------------------------------------------------------------ K_REF (lazy calibration)
  let _kRef = null;
  let _kSource = 'unset';

  function refProbe(x) {
    return { angle: 60, mode: 'shear', crystal: 'single', freq: 5, diameter: 10, wedgeVel: 2.74, method: 'pe',
      x, z: 50, side: 1, skew: 0, surface: 'chord', paFrom: 40, paTo: 70, paStep: 1 };
  }

  /**
   * Calibrate K_REF so that a 3 mm SDH at 50 mm sound path (60°, 5 MHz, 10 mm) reads 80 % FSH at 34 dB.
   * Uses UT.rays.trace when available; otherwise the provisional constant.
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
      let best = 0;
      for (let dx = -1.5; dx <= 1.5 + 1e-9; dx += 0.5) {
        const probe = refProbe(x0 + dx);
        const derived = UT.probe.derive(probe, spec);
        const res = UT.rays.trace({ specimen: spec, probe, derived, display, defects: [], opts: { maxPath: 100, fanCount: 21, maxLegs: 12 } });
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

  // ------------------------------------------------------------------ amplitude / time base helpers
  /**
   * Screen amplitude (% FSH, unclipped) of a dimensionless tracer amplitude at the instrument gain.
   * @param {number} amp  tracer amplitude
   * @param {object} instrument  {gain, damping}
   */
  function ampPctOf(amp, instrument) {
    const gain = instrument && Number.isFinite(instrument.gain) ? instrument.gain : 0;
    let pct = amp * kRef() * M.dB2lin(gain);
    if (instrument && instrument.damping) pct *= M.dB2lin(DAMP_DB);
    return pct;
  }

  function calOf(instrument) {
    const cal = (instrument && instrument.cal) || {};
    return { vel: Number.isFinite(cal.vel) && cal.vel > 0 ? cal.vel : null, zero: Number.isFinite(cal.zero) ? cal.zero : 0 };
  }

  /** True two-way arrival time (µs) of an echo at a true metal path. */
  function trueTime(path, derived) { return 2 * path / derived.vel + (derived.wedgeDelayUs || 0); }

  /**
   * Displayed path of a TRUE path through the instrument calibration (§15.5).
   * pDisp = (t − wedgeDelayUs − cal.zero) · (cal.vel ?? vTrue) / 2
   */
  function dispPath(pathTrue, instrument, derived) {
    const cal = calOf(instrument);
    const vTrue = derived.vel;
    const vel = cal.vel === null ? vTrue : cal.vel;
    return (2 * pathTrue / vTrue - cal.zero) * vel / 2;
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

  /** Pulse envelope sigma (mm of path). */
  function sigmaOf(derived, instrument) {
    const lambda = derived.lambda || (derived.vel / (derived.freq || 5));
    const cycles = instrument && instrument.damping ? 0.9 : 1.5;
    return 0.5 * lambda * cycles;
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
    if (!(T > 0)) return { sd, dp: d, leg: 1 };
    const leg = Math.max(1, Math.floor((d - 1e-9) / T) + 1);
    const r = d - (leg - 1) * T;
    const dp = (leg % 2 === 1) ? r : T - r;
    return { sd, dp: Math.max(0, dp), leg };
  }

  // ------------------------------------------------------------------ DAC
  function sortedDacPoints(instrument) {
    const dac = (instrument && instrument.dac) || {};
    const pts = (dac.points || []).filter(function (p) { return p && Number.isFinite(p.path) && Number.isFinite(p.ampPct); });
    return pts.slice().sort(function (a, b) { return a.path - b.path; });
  }

  function dacRefDb(instrument) {
    const dac = (instrument && instrument.dac) || {};
    if (Number.isFinite(dac.refDb)) return dac.refDb;
    if (Number.isFinite(instrument.refGain)) return instrument.refGain;
    return instrument.gain || 0;
  }

  /** Curve scale from the recording reference gain to the current gain. */
  function dacScale(instrument) { return M.dB2lin((instrument.gain || 0) - dacRefDb(instrument)); }

  /**
   * DAC curve amplitude (% FSH at the CURRENT gain) at a TRUE path: linear interpolation between the
   * recorded points, holding the end values outside the recorded span. null when < 1 point.
   */
  function dacAt(instrument, path) {
    const pts = sortedDacPoints(instrument);
    if (!pts.length) return null;
    const s = dacScale(instrument);
    if (path <= pts[0].path) return pts[0].ampPct * s;
    const last = pts[pts.length - 1];
    if (path >= last.path) return last.ampPct * s;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (path >= a.path && path <= b.path) {
        const t = b.path > a.path ? (path - a.path) / (b.path - a.path) : 0;
        return (a.ampPct + (b.ampPct - a.ampPct) * t) * s;
      }
    }
    return last.ampPct * s;
  }

  /**
   * DAC curve polyline at the current gain: [{path, pct, xDiv}] sorted by TRUE path (unclipped).
   * @param {object} instrument
   * @param {object} derived  UT.probe.derive result (for the time base)
   * @param {number} [dbOffset]  e.g. −6 or −14 for the ASME 50 % / 20 % curves
   */
  function dacCurve(instrument, derived, dbOffset) {
    const pts = sortedDacPoints(instrument);
    if (!pts.length) return [];
    const s = dacScale(instrument) * M.dB2lin(dbOffset || 0);
    return pts.map(function (p) {
      return { path: p.path, pct: p.ampPct * s, xDiv: derived ? xDivOf(p.path, instrument, derived) : xDivOfDisp(p.path, instrument) };
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

  // ------------------------------------------------------------------ A-scan synthesis
  /**
   * Synthesise the A-scan samples from tracer echoes.
   * @param {object} o  {echoes, probe, derived, instrument, nSamples=1000}
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

    // echoes
    const onScreen = [];
    const reach = 4 * sigma + 2 * sigma;   // main lobe + tail
    for (const e of echoes) {
      if (!e || !Number.isFinite(e.path)) continue;
      const ampPct = Number.isFinite(e.amp) ? ampPctOf(e.amp, inst) : (Number.isFinite(e.ampPct) ? e.ampPct : 0);
      const pDisp = dispPath(e.path, inst, derived);
      const xDiv = xDivOfDisp(pDisp, inst);
      onScreen.push({ echo: e, xDiv, ampPct, pDisp });
      if (ampPct <= 0) continue;
      const i0 = Math.max(0, Math.floor(idxOf(pDisp - reach)));
      const i1 = Math.min(n - 1, Math.ceil(idxOf(pDisp + reach)));
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
      for (let i = i0; i <= i1; i++) {
        const u = (pathAt(i) - p0) / dz;
        if (u < 0 || u > 1) continue;
        let a = u < 0.35 ? CLIP_PCT : CLIP_PCT * (1 - u) / 0.65;
        if (wantRf) a *= Math.cos(2 * Math.PI * 2 * (pathAt(i) - p0) / lambda);
        env[i] += a;
      }
    }

    // grass (deterministic)
    const noiseSeed = Math.round((probe.x || 0) * 7 + (probe.z || 0) * 13);
    const rnd = M.rng(noiseSeed);
    const grass = GRASS_PCT * (inst.grassScale || 1);
    for (let i = 0; i < n; i++) {
      const g = grass * rnd();
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

    onScreen.sort(function (a, b) { return a.pDisp - b.pDisp; });
    return {
      samples, raw, rf: rectify === 'rf' ? rf : null, peak: null, range, delay, n, pathAt, sigma,
      echoesOnScreen: onScreen, noiseSeed, initialPulse, reject,
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
      let peakPct, path, xDiv, echoKind;
      if (best) { peakPct = best.ampPct; path = best.echo.path; xDiv = best.xDiv; echoKind = best.echo.kind || 'echo'; }
      else {
        peakPct = peak; xDiv = (pPeak - delay) / range * 10; path = derived ? truePath(pPeak, inst, derived) : pPeak;
        echoKind = ascan.initialZone && pPeak >= ascan.initialZone.from && pPeak <= ascan.initialZone.to ? 'initial' : 'noise';
      }
      const geo = geometry(path, angle, thick, xValue);
      let dacPct = null, dBToDac = null;
      if (inst.dac && inst.dac.on) {
        const curve = dacAt(inst, path);
        if (curve !== null && curve > 0) { dacPct = peakPct / curve * 100; dBToDac = M.lin2dB(peakPct / curve); }
      }
      out.push({ peakPct, path, xDiv, sd: geo.sd, dp: geo.dp, leg: geo.leg, dacPct, dBToDac, echoKind });
    }
    const ai = Number.isFinite(inst.activeGate) ? inst.activeGate : 0;
    const primary = out[ai] || null;
    return {
      gate: out, primary,
      textSP: primary ? M.fmt2(primary.path) : '--.--',
      textSD: primary ? M.fmt2(primary.sd) : '--.--',
      textDP: primary ? M.fmt2(primary.dp) : '--.--',
      textAmp: primary ? Math.round(Math.min(999, primary.peakPct)) + '%' : '0%',
    };
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

  function traceOpts(state, spec, probe) {
    const inst = state.instrument;
    return {
      maxPath: (inst.delay || 0) + (inst.range || 100),
      fanCount: 21,
      maxLegs: ((probe.angle || 0) === 0 || (spec && spec.kind === 'block')) ? 12 : (state.display.skips || 3),
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
  function mapEchoes(rays, inst) {
    const list = ((rays && rays.echoes) || []).map(function (e) { return Object.assign({}, e, { ampPct: ampPctOf(e.amp, inst) }); });
    list.sort(function (a, b) { return a.path - b.path; });
    return list;
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
    for (const a of angles) {
      const p = Object.assign({}, probe, { angle: a, method: 'pe', mode: 'shear' });
      const d = UT.probe.derive(p, spec);
      const rays = spec ? safeTrace({ specimen: spec, probe: p, derived: d, display, defects, opts: { maxPath: (inst.delay || 0) + (inst.range || 100), fanCount: 5, maxLegs: Math.min(2, state.display.skips || 2) } }) : null;
      columns.push({ angle: a, echoes: mapEchoes(rays, inst) });
    }
    return { angles, columns, maxPath: (inst.delay || 0) + (inst.range || 100), T: spec ? spec.T : 0 };
  }

  /**
   * The frame pipeline: reads UT.state, runs probe → rays → synth → gates (or TOFD / S-scan by mode)
   * and stores the result in UT.frame. Aliased as UT.compute.
   * @returns {object} UT.frame
   */
  function compute() {
    const state = UT.state;
    const spec = state.specimen;
    const probe = state.probe;
    const inst = state.instrument;
    const derived = UT.probe.derive(probe, spec);
    const frame = { ts: now(), mode: state.mode, derived, rays: null, echoes: [], ascan: null, readouts: null, tofd: null, aut: null, sscan: null };
    if (spec) {
      if (state.mode === 'tofd') {
        if (UT.tofd && typeof UT.tofd.compute === 'function') {
          try { frame.tofd = UT.tofd.compute(state); } catch (e) { if (!traceErrorLogged) { traceErrorLogged = true; console.error('[UT.ascan] tofd.compute failed', e); } }
        }
      } else if (probe.method === 'pa') {
        frame.sscan = computeSscan(state);
      } else {
        const rays = safeTrace({ specimen: spec, probe, derived, display: state.display, defects: visibleDefects(state), opts: traceOpts(state, spec, probe) });
        frame.rays = rays;
        frame.echoes = mapEchoes(rays, inst);
        const ascan = synth({ echoes: rays ? rays.echoes : [], probe, derived, instrument: inst, nSamples: N_SAMPLES });
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
  function testSetProbe(p) {
    const cur = UT.state.probe;
    const next = Object.assign({}, cur, p || {});
    if (p && p.angle !== undefined) {
      const preset = UT.probe.presets[p.angle];
      if (preset && p.mode === undefined) next.mode = preset.mode;
    }
    const spec = UT.state.specimen;
    if (spec && spec.scanSurface && next.surface !== 'brace') next.x = M.clamp(next.x, spec.scanSurface.xMin, spec.scanSurface.xMax);
    if (spec && Number.isFinite(next.z)) next.z = M.clamp(next.z, 0, spec.L || next.z);
    UT.set({ probe: next });
    const frame = UT.renderNow();
    return UT.clone(frame.derived);
  }

  function testSetInstrument(p) {
    const cur = UT.state.instrument;
    const patch = {};
    const q = p || {};
    if (q.gain !== undefined) patch.gain = M.clamp(+q.gain, 0, 110);
    if (q.refGain !== undefined) patch.refGain = M.clamp(+q.refGain, 0, 110);
    if (q.range !== undefined) patch.range = M.clamp(+q.range, 10, 1000);
    if (q.delay !== undefined) patch.delay = M.clamp(+q.delay, -50, 1000);
    if (q.reject !== undefined) patch.reject = M.clamp(+q.reject, 0, 80);
    if (q.damping !== undefined) patch.damping = !!q.damping;
    if (q.rectify !== undefined) patch.rectify = q.rectify;
    if (q.peakMem !== undefined) patch.peakMem = !!q.peakMem;
    if (q.freeze !== undefined) patch.freeze = !!q.freeze;
    if (q.activeGate !== undefined) patch.activeGate = M.clamp(Math.round(+q.activeGate), 0, 7);
    if (q.gates !== undefined && Array.isArray(q.gates)) {
      const gates = cur.gates.map(function (g) { return Object.assign({}, g); });
      q.gates.forEach(function (g, i) {
        if (!g) return;
        gates[i] = Object.assign({}, gates[i] || { on: true, start: 10, width: 60, level: 20, alarm: false }, g);
      });
      patch.gates = gates;
    }
    for (const k of ['dac', 'cal', 'trig']) if (q[k] !== undefined && q[k] !== null && typeof q[k] === 'object') patch[k] = Object.assign({}, cur[k], q[k]);
    for (const k of ['page', 'readout', 'selectedParam']) if (q[k] !== undefined) patch[k] = q[k];
    UT.setIn('instrument', patch);
    UT.renderNow();
    return UT.clone(UT.state.instrument);
  }

  function testEchoes() {
    return (UT.frame.echoes || []).map(function (e) {
      return { path: e.path, ampPct: e.ampPct, amp: e.amp, kind: e.kind, leg: e.leg, x: e.x, y: e.y, defectId: e.defectId === undefined ? null : e.defectId, tag: e.tag || null, angleDev: e.angleDev === undefined ? null : e.angleDev };
    });
  }

  function testAscan() {
    const a = UT.frame.ascan;
    if (!a) return { samples: [], range: UT.state.instrument.range, delay: UT.state.instrument.delay };
    return { samples: Array.from(a.samples), range: a.range, delay: a.delay, rf: a.rf ? Array.from(a.rf) : null, peak: a.peak ? Array.from(a.peak) : null };
  }

  // ------------------------------------------------------------------ self test (headless)
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
    return f;
  }

  // ------------------------------------------------------------------ exports
  const ascan = {
    N_SAMPLES, CLIP_PCT,
    synth, evalGates, geometry, dacCurve, dacCurves, dacAt, dacRecord, computeSscan, compute,
    ampPctOf, dispPath, truePath, trueTime, xDivOf, xDivOfDisp, sigmaOf, clearPeak, calibrateK,
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
    compute: function () { return UT.renderNow(); },
    echoes: testEchoes,
    ascan: testAscan,
    readouts: function () { return UT.frame.readouts; },
  });
})(window.UT = window.UT || {});
