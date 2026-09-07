/* 45-standards.js — P8 DGS/AVG maths + window 'dgs', T3 standards evaluation (rule sets ISO 17640 /
 * ISO 11666 / ASME VIII App. 12 / AWS D1.1 as data, window 'evaluation', window 'stdnotes'), T4 procedure
 * presets (window 'procedures', applyProcedure, allowedProbes). Classic script, no DOM at load time.
 */
// SPEC NOTES (decisions where SPEC-v2 is silent or ambiguous)
// - DGS: A = s/N, G = d/a with a = derived.crystalA (round crystal: the diameter). The disc law 2π·G²/A² is
//   evaluated with max(A, 1) (far-field clamp) and ers() inverts it with the SAME clamp (G = max(A_echo,1)·
//   √(H_echo/2π)) so that a disc echo synthesised with hDisc() round-trips exactly, also inside the near field.
// - ers(): transferDb is added to the ECHO amplitude only (the reference is recorded on the block; the
//   specimen echo is weaker by the transfer loss, so the correction adds it back). gain fields default to 0.
//   ampPct ≤ 0, missing reference or N ≤ 0 → null.
// - ers() distance-law transport (§3.8 round-trip MUST, QA round 2): the tracer's 0° backwall falls with
//   D = q^0.5 = √(N/max(s, N)) times the one-way L attenuation 10^(−2·α·s/20) (α = attenL5·(f/5)^1.5, 30's
//   materialInfo/makeEcho), NOT with the diagram's 1/A — so a backwall reference at 60 mm predicted 6.0 dB
//   where the tracer gives 3.75 dB and ⌀6 at 30 mm read 5.27 mm. The reference is therefore transported to the
//   echo's path with the simulator law before the diagram is entered: H_ref' = H_ref(A_ref) ·
//   [H_bw(A_echo)/H_bw(A_ref)] · [bwLaw(s_ref)/bwLaw(s_echo)] (= 1 for equal paths or a 1/A law); the spec's
//   H_echo = H_ref·10^(ΔdB/20) is otherwise unchanged and the ERS inverts the tracer's FBH law exactly
//   (result.distCorrDb reports the transport). bwLaw() is a replica of 30's law (UT.rays.ampBwLaw(s, derived,
//   specimen) is preferred when 30 exports it) — if 30 changes its 0° distance law, update bwLaw() here.
// - The DGS reference (backwall/FBH) is a module-level record (not state; the spec defines no state field):
//   UT.standards.dgs.recordReference(kind, fbhMm) reads frame.readouts.primary; UT.test.dgs({record:'backwall'})
//   does the same headlessly. UT.test.dgs() without args returns the live computation {ref, echo, result}.
// - The FBH tracer law and the backwall distance law (D = q^0.5) live in 30-raytrace; ers() mirrors the latter
//   (bwLaw) only for the reference transport. A constant ≈ +0.45 dB of the tracer's specular FBH sum over the fan
//   (independent of d and s) remains and reads as ≈ +2.6 % ERS (⌀6 → 6.16 mm), inside the §3.8 ± 0.5 mm.
// - evaluate(): ampDbVsRef + transferDb (state.standards.transferDb unless args.transferDb) is the evaluated
//   amplitude; pct = round(100·10^(amp/20)) of that corrected amplitude. Missing lengthMm → 0 (short), missing
//   soundPath (AWS) → c = 0 (≤ 1 in assumed, said in ruleText), missing depth (AWS class C) → middle half assumed.
//   AWS d is rounded to the nearest whole dB before the class lookup (instrument gain steps); a custom probe angle
//   uses the nearest listed angle (45/60/70). AWS class D → disposition 'accept', recordable false (A–C recordable).
// - iso17640 is a testing standard: evaluate({ruleId:'iso17640'}) applies the technique's evaluation level for
//   recordability and delegates the acceptance decision to iso11666 (level from args/state, AL2 default); the
//   ruleText says so. ISO 11666 planar reject (crack/lof/ip) is applied only to recordable indications and is
//   labelled 'sim rule (ISO 23279 characterisation optional)'. Type synonyms: 'lack of fusion'/'backingLof' →
//   lof; 'incomplete penetration'/'incompletePenetration'/'root' → ip; rootCrack/toeCrack/centrelineCrack → crack.
// - rulesOverride merge: deep merge of plain objects (arrays and leaves replaced); a numeric override may replace a
//   function leaf (shortMaxMm, rejectLengthMm, sdhDiaMm, rating) and is used as a constant.
// - UT.standards.procedures is an object keyed by id holding EXACTLY the three procedures (enumerable) plus
//   NON-enumerable window methods open/close/toggle/isOpen/window (so 90's `UT.standards.procedures.toggle()`
//   works and Object.keys()/JSON show only the three). UT.standards.procedureList() returns them as an array.
// - applyProcedure(id) writes standards.{procedure, standard, level, testingLevel, transferDb}, weldOpts.T (and wt
//   for the pipe procedure — pipe/od are NOT switched: the procedure carries `specimen` for 84), instrument
//   {gain, refGain, range} in ONE UT.set. If the current specimen is a weld/DAC block of another thickness and
//   UT.modes.enter exists, the mode is re-entered (keepProbe, silentUI) so the block matches the procedure.
//   applyProcedure(null) clears the procedure. Returns true/false.
// - Evaluation window rows: module-level list = rows mirrored from state.trade.report (re-mirrored when the report
//   changes) + rows added with Add row / Add from readout. Add from readout uses dBToDac when a DAC exists, else
//   20·log10(peakPct/80) − (gain − refGain) (reference = 80 % at refGain). Evaluate all writes standards.lastEval.
//   The window's T field starts at the specimen thickness and follows specimen changes until edited.
// - Every user-visible string goes through UT.i18n.t(); rule texts carry their own ko/en (ruleText/ruleTextKo).
(function (UT) {
  'use strict';
  const M = UT.math;
  const standards = {};
  const TWO_PI = 2 * Math.PI;

  function t(key, params) { return UT.i18n.t(key, params); }
  function st() { return UT.state; }
  function finite(v) { return typeof v === 'number' && Number.isFinite(v); }
  function num(v, dflt) { const n = typeof v === 'string' ? parseFloat(v) : v; return finite(n) ? n : dflt; }
  function fmtDb(v) { return (v > 0 ? '+' : (v < 0 ? '−' : '')) + Math.abs(v).toFixed(Math.abs(v - Math.round(v)) < 1e-9 ? 0 : 1); }
  function isKo() { return UT.i18n.lang === 'ko'; }
  function has(path) {
    let o = UT;
    for (const k of path.split('.')) { if (!o || o[k] === undefined || o[k] === null) return null; o = o[k]; }
    return o;
  }
  function specimenT() {
    const s = st();
    if (s.specimen && finite(s.specimen.T)) return s.specimen.T;
    return (s.weldOpts && finite(s.weldOpts.T)) ? s.weldOpts.T : 20;
  }
  function currentDerived() {
    const f = UT.frame;
    if (f && f.derived && finite(f.derived.nearField)) return f.derived;
    if (has('probe.derive')) { try { return UT.probe.derive(st().probe, st().specimen); } catch (e) { return null; } }
    return null;
  }

  // ================================================================== P8 — DGS / AVG maths (§3.8)
  /** Normalised backwall curve H_bw(A) = A ≤ 1 ? 1 : 1/A. */
  function hBw(A) { return A <= 1 ? 1 : 1 / A; }
  /** Normalised disc (FBH) curve H_disc(A, G) = 2π·G²/max(A,1)² (lead decision, §11). */
  function hDisc(A, G) { const Ae = Math.max(A, 1); return TWO_PI * G * G / (Ae * Ae); }
  /** One-way L-wave attenuation (dB/mm) as the tracer uses it: attenL5 of spec.material (library fallback) · (f/5)^1.5. */
  function attenL(d, specimen) {
    const sm = (specimen && specimen.material) || {};
    const lib = has('specimens.materials');
    const rec = lib && sm.key ? lib[sm.key] : null;
    const a5 = finite(sm.attenL5) ? sm.attenL5 : (rec && finite(rec.attenL5) ? rec.attenL5 : 0.005);
    const freq = finite(d.freq) && d.freq > 0 ? d.freq : 5;
    return a5 * Math.pow(freq / 5, 1.5);
  }
  /**
   * Simulator backwall distance law at path s for the 0° probe (e = S = 1, relative units): the tracer's
   * D = √(N/max(s, N)) near-field blend times the two-way attenuation 10^(−2·α·s/20) (30-raytrace makeEcho).
   * Only ratios bwLaw(s1)/bwLaw(s2) are used. Prefers UT.rays.ampBwLaw(s, derived, specimen) when 30 exports one.
   */
  function bwLaw(s, d, specimen) {
    const ext = has('rays.ampBwLaw');
    if (typeof ext === 'function') { try { const v = ext(s, d, specimen); if (finite(v) && v > 0) return v; } catch (e) { /* fall through */ } }
    const N = d.nearField;
    return Math.sqrt(N / Math.max(s, N)) * Math.pow(10, -2 * attenL(d, specimen) * s / 20);
  }
  /** Normalised SDH curve H_sdh(A, d) = √(2λd)/(a·max(A,1)^1.5) (λ, a from derived). */
  function hSdh(A, d, derived) {
    const dv = derived || currentDerived() || { lambda: 0.648, crystalA: 10 };
    const a = dv.crystalA || dv.diameter || 10;
    return Math.sqrt(2 * (dv.lambda || 0.648) * d) / (a * Math.pow(Math.max(A, 1), 1.5));
  }
  const DEFAULT_GS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.7, 1.0];
  /**
   * DGS curves: {A[], bw[], discs:[{G, H[]}]} with A log-spaced 0.5…30 (61 points).
   * @param {object} [derived] UT.probe.derive() result (unused by the normalised curves, kept for the API)
   * @param {number[]} [Gs] disc sizes G = d/a
   */
  function curves(derived, Gs) {
    const gs = Array.isArray(Gs) && Gs.length ? Gs.slice() : DEFAULT_GS.slice();
    const A = [];
    const lo = Math.log10(0.5), hi = Math.log10(30), n = 60;
    for (let i = 0; i <= n; i++) A.push(Math.pow(10, lo + (hi - lo) * i / n));
    const bw = A.map(hBw);
    const discs = gs.map(function (G) { return { G, H: A.map(function (a) { return hDisc(a, G); }) }; });
    void derived;
    return { A, bw, discs };
  }
  /**
   * Equivalent reflector size from a reference echo and a gated echo (§3.8).
   * @param {{derived?:object, ref:{kind:'backwall'|'fbh', path:number, ampPct:number, gain?:number, fbhMm?:number},
   *          echo:{path:number, ampPct:number, gain?:number}, transferDb?:number}} o
   * @returns {{G:number, ersMm:number, dBvsRef:number, dBvsDisc3:number, Aref:number, Aecho:number, Href:number,
   *            Hecho:number, HdbRef:number, HdbEcho:number, a:number, N:number}|null}
   */
  function ers(o) {
    const q = o || {};
    const d = q.derived || currentDerived();
    if (!d || !finite(d.nearField) || d.nearField <= 0) return null;
    const a = d.crystalA || d.diameter || 10;
    const N = d.nearField;
    const ref = q.ref, echo = q.echo;
    if (!ref || !echo || !(ref.path > 0) || !(echo.path > 0) || !(ref.ampPct > 0) || !(echo.ampPct > 0)) return null;
    const transferDb = finite(q.transferDb) ? q.transferDb : 0;
    const spec = q.specimen || (UT.state && UT.state.specimen) || null;
    const Aref = ref.path / N, Aecho = echo.path / N;
    const Href = ref.kind === 'fbh' ? hDisc(Aref, (finite(ref.fbhMm) && ref.fbhMm > 0 ? ref.fbhMm : 3) / a) : hBw(Aref);
    const ampRefDb = 20 * Math.log10(ref.ampPct) - (finite(ref.gain) ? ref.gain : 0);
    const ampEchoDb = 20 * Math.log10(echo.ampPct) - (finite(echo.gain) ? echo.gain : 0) + transferDb;
    const dBvsRef = ampEchoDb - ampRefDb;
    // Transport the reference to the echo's path with the simulator's backwall distance law (header note):
    // = 1 for equal paths, or wherever that law coincides with the diagram's 1/A.
    const distCorr = (hBw(Aecho) / hBw(Aref)) * (bwLaw(ref.path, d, spec) / bwLaw(echo.path, d, spec));
    const Hecho = Href * distCorr * Math.pow(10, dBvsRef / 20);
    const G = Math.max(Aecho, 1) * Math.sqrt(Hecho / TWO_PI);
    const ersMm = G * a;
    const dBvsDisc3 = M.lin2dB(Hecho / hDisc(Aecho, 3 / a));
    return { G, ersMm, dBvsRef, dBvsDisc3, distCorrDb: M.lin2dB(distCorr), Aref, Aecho, Href, Hecho, HdbRef: M.lin2dB(Href), HdbEcho: M.lin2dB(Hecho), a, N };
  }

  // ================================================================== T3 — rule sets (§4.3, verbatim data)
  const NOTE = 'Illustrative transcription — verify against the current edition';
  const rules = {
    // A) ISO 17640:2017 — confidence HIGH on structure, technique/reference reflectors, quality-level mapping, transfer
    //    correction; MEDIUM on coverage per level. The evaluation level does NOT depend on the testing level (A–D define coverage).
    iso17640: { id: 'iso17640', reference: 'ISO 17640:2017', lengthMethod: 'eval-level',
      qualityToTestingLevel: { 'ISO5817-B': 'B', 'ISO5817-C': 'A' }, // Table 1; level C/D by agreement
      testingLevels: { A: { angles: 1, sides: 'both', surfaces: 1, straightBeam: false },
        B: { angles: 2 /* ≥10° apart, e.g. 45+60 or 60+70 */, sides: 'both', surfaces: 1, straightBeam: true /* 0° scan of scanning zone for laminations */ },
        C: { angles: 2, sides: 'both', surfaces: 2, straightBeam: true, tandemForVertical: true },
        D: { custom: true } },
      techniques: { 1: { ref: 'DAC, 3 mm SDH, 8≤t≤100', evaluationDb: -10 },
        2: { ref: 'DGS DSR', dsrMm: { '1.5-2.5MHz': [[8, 15, 1.5], [15, 40, 2.0], [40, 100, 3.0]], '3-5MHz': [[8, 15, 1.0], [15, 40, 1.5], [40, 100, 2.0]] }, evaluationDb: -10 },
        3: { ref: 'rectangular notch 1 mm deep (thin welds only)', evaluationDb: -6 /* LOW confidence; not needed by the sim */ },
        4: { ref: 'DSR 6 mm, tandem', evaluationDb: -10 /* LOW confidence */ } },
      transferCorrection: { ignoreBelowDb: 2, compensateUpToDb: 12, investigateAboveDb: 12 }, // HIGH confidence
      scanningGainAboveRefDb: 6 /* MEDIUM */,
      sensitivityRecheckDb: 4 /* re-scan when the reference drifted by more than this (lesson 25) — MEDIUM */,
      confidence: { structure: 'high', techniques: 'high (3/4: low)', qualityMapping: 'high', transferCorrection: 'high', coveragePerLevel: 'medium', scanningGain: 'medium', sensitivityRecheck: 'medium' },
      note: NOTE },

    // B) ISO 11666:2018 — confidence HIGH: AL2↔quality B, AL3↔quality C, no AL1; AL2 = −4 dB (short) / −10 dB (long),
    //    short = l ≤ 0.5t (min 10 mm), evaluation level −10 dB (33 % DAC). AL3: LEAD DECISION = +4 dB (short, l ≤ 1.0t, min 10) /
    //    −2 dB (long), evaluation −6 dB, confidence 'medium — verify' (alternative if disproved: 0 / −6 dB, evaluation −6 dB).
    iso11666: { id: 'iso11666', reference: 'ISO 11666:2018 Tables 2-4', tMm: [8, 100], refReflector: 'as iso17640 techniques 1/2', lengthMethod: 'eval-level',
      levels: { AL2: { quality: 'B', evaluationDb: -10, recordingDb: -10, shortMaxMm: function (t) { return Math.max(10, 0.5 * t); }, shortLimitDb: -4, longLimitDb: -10, confidence: 'high' },
        AL3: { quality: 'C', evaluationDb: -6, recordingDb: -6, shortMaxMm: function (t) { return Math.max(10, 1.0 * t); }, shortLimitDb: +4, longLimitDb: -2, confidence: 'medium — verify' } },
      planarReject: ['crack', 'lof', 'ip'] /* characterisation per ISO 23279 is optional in 11666 — sim rule, labelled */,
      confidence: { levels: 'high (AL3: medium — verify)', planarReject: 'sim rule' },
      note: NOTE },
    // Rule: amp < evaluationDb → 'not-recordable'; else L ≤ shortMax ? (amp ≤ shortLimitDb ? accept : reject)
    //       : (amp ≤ longLimitDb ? accept : reject); equality accepted. Lengths measured with the fixed-level technique at the evaluation level.

    // C) ASME VIII-1 Mandatory App. 12 §12-3 + ASME V Art. 4 — confidence HIGH
    asme8: { id: 'asme8', reference: 'ASME BPVC VIII-1 App.12 (12-3), ASME V Art.4', recordPct: 20, // 'investigate all indications > 20 % of reference'
      lengthMethod: '50pct',
      rejectAmp: '> 100 % DAC (ampDbVsRef > 0)', rejectLengthMm: function (t) { return t <= 19 ? 6 : (t <= 57 ? t / 3 : 19); }, // 1/4 in | t/3 | 3/4 in; strict '>' on both
      planarReject: ['crack', 'lof', 'ip'], tDefinition: 'weld thickness excluding reinforcement; thinner member for unequal t',
      calibration: { block: 'ASME V T-434.2.1 basic block', sdhDiaMm: function (t) { return t <= 25 ? 2.4 : (t <= 50 ? 3.0 : (t <= 100 ? 5.0 : 6.4)); }, holesAt: ['T/4', 'T/2', '3T/4'], scanningGainAboveRefDb: 6 },
      confidence: { all: 'high' },
      note: NOTE },
    // Compare in percent (pct ≥ 20) so that a −14 dB echo (19.95 %) counts as 20 %/recordable, matching the v1 '−14 dB = 20 %' curve.
    // dacBlock must be built with sdh:2.4 by the 'asme-pipe-6in' procedure.

    // D) AWS D1.1:2020 Table 8.2 (= Table 6.3 in D1.1:2010), statically loaded nontubular — confidence MEDIUM-HIGH (~75 %) on the numbers,
    //    HIGH on structure/rating/attenuation/length rules
    awsd11: { id: 'awsd11', reference: 'AWS D1.1/D1.1M Table 8.2 (6.3 in :2010) — statically loaded', refReflector: '0.06 in (1.5 mm) SDH, IIW block (sim: v1 block hole at (135,15))',
      lengthMethod: '6dB',
      rating: function (ampDbVsRef, soundPathMm) { const spIn = soundPathMm / 25.4; const c = spIn > 1 ? Math.round(2 * (spIn - 1)) : 0; /* 2 dB per inch beyond 1 in, rounded to nearest dB, .5 up */ return -ampDbVsRef - c; }, // d = a − b − c with a − b = −ampDbVsRef (louder indication ⇒ less gain ⇒ lower rating)
      bandsMm: [[8, 20], [20, 38], [38, 65], [65, 100], [100, 200]], // 5/16–3/4, >3/4–1½, >1½–2½, >2½–4, >4–8 in
      bandOf: function (t) { return t < 8 || t > 200 ? -1 : (t <= 20 ? 0 : (t <= 38 ? 1 : (t <= 65 ? 2 : (t <= 100 ? 3 : 4)))); }, // band 0 = 8 ≤ t ≤ 20; bands ≥ 1 use lo < t ≤ hi; −1 → 'n/a'
      table: { // A: d ≤ value; B/C: d in [lo,hi]; D: d ≥ value
        0: { 70: { A: 5, B: [6, 6], C: [7, 7], D: 8 } },
        1: { 70: { A: 2, B: [3, 3], C: [4, 4], D: 5 }, 60: { A: 7, B: [8, 8], C: [9, 9], D: 10 }, 45: { A: 9, B: [10, 10], C: [11, 11], D: 12 } },
        2: { 70: { A: -2, B: [-1, 0], C: [1, 2], D: 3 }, 60: { A: 3, B: [4, 5], C: [6, 7], D: 8 }, 45: { A: 5, B: [6, 7], C: [8, 9], D: 10 } },
        3: { 70: { A: -5, B: [-4, -3], C: [-2, -1], D: 0 }, 60: { A: 0, B: [1, 2], C: [3, 4], D: 5 }, 45: { A: 2, B: [3, 4], C: [5, 6], D: 7 } },
        4: { 70: { A: -7, B: [-6, -5], C: [-4, -3], D: -2 }, 60: { A: -2, B: [-1, 0], C: [1, 2], D: 3 }, 45: { A: 0, B: [1, 2], C: [3, 4], D: 5 } } },
      classRules: { A: 'reject regardless of length', B: 'reject if L > 19 mm (3/4 in)', C: 'reject if L > 50 mm (2 in) in the middle half of t, or > 19 mm in the top or bottom quarter (use dp < t/4 or dp > 3t/4)', D: 'accept regardless' },
      scanningLevelsDb: [[0, 64, 14], [64, 127, 19], [127, 254, 29], [254, 381, 39]] /* sound path mm → gain above reference (Table 8.4) */,
      confidence: { numbers: 'medium-high (~75 %)', structure: 'high', rating: 'high', attenuation: 'high', lengthRules: 'high' },
      note: NOTE },
    // For t ≤ 3/4 in only 70° is listed; evaluate() returns disposition 'n/a' (with ruleText) for 45°/60° in band 0.
    // The B/C isolation (spacing) rule is omitted — say so in ruleText.
  };
  const RULE_IDS = ['iso17640', 'iso11666', 'asme8', 'awsd11'];
  const RULE_NAMES = { iso17640: 'ISO 17640 (testing)', iso11666: 'ISO 11666 (acceptance)', asme8: 'ASME VIII App. 12', awsd11: 'AWS D1.1 Table 8.2' };

  /** Shared length-method labels (sizing window pre-selection, §4.3). */
  const lengthMethodNames = {
    'eval-level': { ko: '평가 레벨 고정법', en: 'fixed evaluation level' },
    '6dB': { ko: '6 dB 드롭법', en: '6 dB drop' },   // SPEC-v2 §5.3.6: 6 dB drop = 6 dB 드롭법
    '50pct': { ko: '50 % 진폭법 (ASME)', en: '50 % amplitude (ASME)' },
  };

  // ------------------------------------------------------------------ rulesOverride merge
  function isPlain(v) { return v && typeof v === 'object' && !Array.isArray(v); }
  function deepMerge(base, over) {
    if (!isPlain(over)) return over === undefined ? base : over;
    if (!isPlain(base)) return deepMerge({}, over);
    const out = {};
    for (const k of Object.keys(base)) out[k] = base[k];
    for (const k of Object.keys(over)) {
      const b = base[k], o = over[k];
      out[k] = isPlain(b) && isPlain(o) ? deepMerge(b, o) : (o === undefined ? b : o);
    }
    return out;
  }
  /**
   * Rule set by id merged with state.standards.rulesOverride[id] (or an explicit override object).
   * @param {string} id
   * @param {object} [override] overrides for all sets ({iso11666: {...}}); default state.standards.rulesOverride
   */
  function ruleSet(id, override) {
    const base = rules[id];
    if (!base) return null;
    const ov = override === undefined ? (st().standards && st().standards.rulesOverride) : override;
    const mine = ov && isPlain(ov) ? ov[id] : null;
    return mine && isPlain(mine) ? deepMerge(base, mine) : base;
  }
  /** Evaluate a leaf that may be a function of t or a constant. */
  function fnOrNum(v, tArg) { return typeof v === 'function' ? v(tArg) : num(v, NaN); }

  // ------------------------------------------------------------------ evaluate()
  const TYPE_SYNONYMS = {
    'lack of fusion': 'lof', lackoffusion: 'lof', fusion: 'lof', backinglof: 'lof', 'backing bar lack of fusion': 'lof',
    'incomplete penetration': 'ip', incompletepenetration: 'ip', root: 'ip', 'root defect': 'ip', penetration: 'ip',
    rootcrack: 'crack', toecrack: 'crack', centrelinecrack: 'crack', toecrackfillet: 'crack', 'root crack': 'crack', 'toe crack': 'crack', 'centreline crack': 'crack',
    'slag inclusion': 'slag', gas: 'porosity', pore: 'porosity',
  };
  /** Canonical indication type id: planar | crack | lof | ip | volumetric | porosity | slag | lamination | '' . */
  function normaliseType(type) {
    if (!type) return '';
    const raw = String(type).trim();
    const key = raw.toLowerCase();
    if (TYPE_SYNONYMS[key]) return TYPE_SYNONYMS[key];
    const compact = key.replace(/[\s_-]+/g, '');
    if (TYPE_SYNONYMS[compact]) return TYPE_SYNONYMS[compact];
    return compact;
  }
  const INDICATION_TYPES = [
    { id: 'planar', en: 'planar', ko: '면상' }, { id: 'crack', en: 'crack', ko: '균열' }, { id: 'lof', en: 'lack of fusion', ko: '융합 불량' },
    { id: 'ip', en: 'incomplete penetration', ko: '용입 부족' }, { id: 'volumetric', en: 'volumetric', ko: '체적형' },
    { id: 'porosity', en: 'porosity', ko: '기공' }, { id: 'slag', en: 'slag', ko: '슬래그 혼입' }, { id: 'lamination', en: 'lamination', ko: '라미네이션' },
  ];
  function typeLabel(id) { const e = INDICATION_TYPES.find(function (x) { return x.id === id; }); return e ? (isKo() ? e.ko : e.en) : (id || '—'); }
  function normaliseIndication(ind) {
    const i = ind || {};
    const amp = num(i.ampDbVsRef, num(i.ampDb, num(i.dB, num(i.amp, 0))));
    return {
      ampDbVsRef: amp,
      lengthMm: Math.max(0, num(i.lengthMm, num(i.length, 0))),
      type: normaliseType(i.type),
      soundPath: num(i.soundPath, num(i.sp, num(i.path, NaN))),
      depth: num(i.depth, num(i.dp, NaN)),
      z: num(i.z, NaN), n: i.n,
    };
  }
  function result(base) {
    return Object.assign({ disposition: 'n/a', recordable: false, class: null, pct: 0, ruleText: '', ruleTextKo: '', numbers: {} }, base);
  }
  const DISP_KO = { accept: '합격', reject: '불합격', 'not-recordable': '기록 불요', 'n/a': '해당 없음' };

  function evalIso11666(rule, level, T, amp, pct, ind, transferDb, ruleId) {
    const lvId = rule.levels && rule.levels[level] ? level : 'AL2';
    const lv = rule.levels[lvId];
    const evalDb = num(lv.evaluationDb, -10);
    const shortMax = fnOrNum(lv.shortMaxMm, T);
    const L = ind.lengthMm;
    const en = [], ko = [];
    const numbers = { ruleId, level: lvId, T, ampDbVsRef: ind.ampDbVsRef, transferDb, amp, pct, lengthMm: L, evaluationDb: evalDb, shortMaxMm: shortMax, type: ind.type };
    if (ruleId === 'iso17640') {
      en.push('ISO 17640 sets the evaluation level (technique 1: ref ' + fmtDb(evalDb) + ' dB); acceptance per ISO 11666 ' + lvId);
      ko.push('ISO 17640은 평가 레벨(기법 1: 기준 ' + fmtDb(evalDb) + ' dB)을 정하고, 합부 판정은 ISO 11666 ' + lvId + '에 따름');
    }
    en.push('ref ' + fmtDb(evalDb) + ' dB = ' + Math.round(100 * Math.pow(10, evalDb / 20)) + ' %');
    ko.push('기준 ' + fmtDb(evalDb) + ' dB = ' + Math.round(100 * Math.pow(10, evalDb / 20)) + ' %');
    if (transferDb) { en.push('transfer +' + transferDb + ' dB → amp ' + fmtDb(amp) + ' dB'); ko.push('전달 보정 +' + transferDb + ' dB → 진폭 ' + fmtDb(amp) + ' dB'); }
    if (amp < evalDb) {
      en.push('amp ' + fmtDb(amp) + ' dB < ' + fmtDb(evalDb) + ' → not recordable');
      ko.push('진폭 ' + fmtDb(amp) + ' dB < ' + fmtDb(evalDb) + ' → 기록 불요');
      return result({ disposition: 'not-recordable', recordable: false, class: null, pct, ruleText: en.join('; '), ruleTextKo: ko.join('; '), numbers, level: lvId, ruleId });
    }
    en.push('amp ' + fmtDb(amp) + ' dB ≥ ' + fmtDb(evalDb) + ' → recorded');
    ko.push('진폭 ' + fmtDb(amp) + ' dB ≥ ' + fmtDb(evalDb) + ' → 기록');
    const planar = (rule.planarReject || []).indexOf(ind.type) >= 0;
    const isShort = L <= shortMax;
    const limit = isShort ? num(lv.shortLimitDb, -4) : num(lv.longLimitDb, -10);
    numbers.class = isShort ? 'short' : 'long'; numbers.limitDb = limit; numbers.planar = planar;
    const shortDesc = lvId === 'AL3' ? '1.0·t' : '0.5·t';
    en.push('len ' + L + (isShort ? ' ≤ ' : ' > ') + 'max(10, ' + shortDesc + ') = ' + shortMax + ' → ' + (isShort ? 'short' : 'long') + ', limit ref ' + fmtDb(limit) + ' dB');
    ko.push('길이 ' + L + (isShort ? ' ≤ ' : ' > ') + 'max(10, ' + shortDesc + ') = ' + shortMax + ' → ' + (isShort ? '짧은' : '긴') + ' 지시, 허용 한계 기준 ' + fmtDb(limit) + ' dB');
    let disposition = amp <= limit ? 'accept' : 'reject';
    en.push('amp ' + fmtDb(amp) + ' dB ' + (amp <= limit ? '≤' : '>') + ' ' + fmtDb(limit) + ' → ' + disposition.toUpperCase());
    ko.push('진폭 ' + fmtDb(amp) + ' dB ' + (amp <= limit ? '≤' : '>') + ' ' + fmtDb(limit) + ' → ' + DISP_KO[disposition]);
    if (planar) {
      disposition = 'reject';
      en.push('type ' + ind.type + ' is planar → REJECT (sim rule: ISO 23279 characterisation is optional in ISO 11666)');
      ko.push('종류 ' + ind.type + ' = 면상 결함 → 불합격 (시뮬레이터 규칙: ISO 11666에서 ISO 23279 특성 분류는 선택 사항)');
    }
    if (lvId === 'AL3') { en.push('AL3 limits +4/−2 dB: confidence medium — verify'); ko.push('AL3 한계 +4/−2 dB: 신뢰도 중간 — 확인 필요'); }
    return result({ disposition, recordable: true, class: isShort ? 'short' : 'long', pct, ruleText: en.join('; '), ruleTextKo: ko.join('; '), numbers, level: lvId, ruleId });
  }

  function evalAsme8(rule, T, amp, pct, ind, transferDb) {
    const recordPct = num(rule.recordPct, 20);
    const lenLimit = fnOrNum(rule.rejectLengthMm, T);
    const L = ind.lengthMm;
    const en = [], ko = [];
    const numbers = { ruleId: 'asme8', T, ampDbVsRef: ind.ampDbVsRef, transferDb, amp, pct, lengthMm: L, recordPct, rejectLengthMm: lenLimit, type: ind.type };
    en.push(recordPct + ' % of reference = ' + fmtDb(M.lin2dB(recordPct / 100)) + ' dB');
    ko.push('기준의 ' + recordPct + ' % = ' + fmtDb(M.lin2dB(recordPct / 100)) + ' dB');
    if (transferDb) { en.push('transfer +' + transferDb + ' dB → amp ' + fmtDb(amp) + ' dB'); ko.push('전달 보정 +' + transferDb + ' dB → 진폭 ' + fmtDb(amp) + ' dB'); }
    if (pct < recordPct) {
      en.push('amp ' + fmtDb(amp) + ' dB = ' + pct + ' % < ' + recordPct + ' % → not recordable');
      ko.push('진폭 ' + fmtDb(amp) + ' dB = ' + pct + ' % < ' + recordPct + ' % → 기록 불요');
      return result({ disposition: 'not-recordable', recordable: false, class: null, pct, ruleText: en.join('; '), ruleTextKo: ko.join('; '), numbers, ruleId: 'asme8' });
    }
    en.push('amp ' + fmtDb(amp) + ' dB = ' + pct + ' % ≥ ' + recordPct + ' % → investigate/record');
    ko.push('진폭 ' + fmtDb(amp) + ' dB = ' + pct + ' % ≥ ' + recordPct + ' % → 조사·기록');
    const planar = (rule.planarReject || []).indexOf(ind.type) >= 0;
    numbers.planar = planar;
    let disposition;
    if (planar) {
      disposition = 'reject';
      en.push('type ' + ind.type + ' (crack / LOF / IP) → REJECT regardless of amplitude and length');
      ko.push('종류 ' + ind.type + ' (균열·융합 불량·용입 부족) → 진폭·길이와 무관하게 불합격');
    } else {
      const over = amp > 0;
      const lenOver = L > lenLimit;
      const lenText = T <= 19 ? '6 mm (1/4 in)' : (T <= 57 ? 't/3 = ' + (+lenLimit.toFixed(1)) : '19 mm (3/4 in)');
      disposition = over && lenOver ? 'reject' : 'accept';
      en.push('amp ' + fmtDb(amp) + ' dB ' + (over ? '> 0 (> 100 % DAC)' : '≤ 0 (≤ 100 % DAC)') + '; L ' + L + (lenOver ? ' > ' : ' ≤ ') + lenText + ' → ' + disposition.toUpperCase() + (over && !lenOver ? ' (length within limit)' : ''));
      ko.push('진폭 ' + fmtDb(amp) + ' dB ' + (over ? '> 0 (DAC 100 % 초과)' : '≤ 0 (DAC 100 % 이하)') + '; 길이 ' + L + (lenOver ? ' > ' : ' ≤ ') + lenText + ' → ' + DISP_KO[disposition]);
    }
    return result({ disposition, recordable: true, class: planar ? 'planar' : null, pct, ruleText: en.join('; '), ruleTextKo: ko.join('; '), numbers, ruleId: 'asme8' });
  }

  function evalAws(rule, T, amp, pct, ind, transferDb, probeAngle) {
    const band = fnOrNum(rule.bandOf, T);
    const angleIn = finite(probeAngle) ? probeAngle : num(st().probe && st().probe.angle, 70);
    const angle = [45, 60, 70].reduce(function (best, a) { return Math.abs(a - angleIn) < Math.abs(best - angleIn) ? a : best; }, 70);
    const en = [], ko = [];
    const numbers = { ruleId: 'awsd11', T, band, angle, probeAngle: angleIn, ampDbVsRef: ind.ampDbVsRef, transferDb, amp, pct, lengthMm: ind.lengthMm, soundPath: ind.soundPath, depth: ind.depth, type: ind.type };
    if (band < 0) {
      en.push('t ' + T + ' mm outside Table 8.2 (8…200 mm) → n/a');
      ko.push('두께 ' + T + ' mm는 표 8.2 범위(8…200 mm) 밖 → 해당 없음');
      return result({ disposition: 'n/a', recordable: false, class: null, pct, ruleText: en.join('; '), ruleTextKo: ko.join('; '), numbers, ruleId: 'awsd11' });
    }
    const bandLabel = band === 0 ? '8 ≤ t ≤ 20' : rule.bandsMm[band][0] + ' < t ≤ ' + rule.bandsMm[band][1];
    en.push('t ' + T + ' → band ' + band + ' (' + bandLabel + ' mm)');
    ko.push('두께 ' + T + ' → 구간 ' + band + ' (' + bandLabel + ' mm)');
    const row = rule.table[band] && rule.table[band][angle];
    if (!row) {
      en.push('band ' + band + ' lists only 70° (t ≤ 3/4 in) — ' + angle + '° → n/a');
      ko.push('구간 ' + band + '에는 70°만 규정 (t ≤ 3/4 in) — ' + angle + '° → 해당 없음');
      return result({ disposition: 'n/a', recordable: false, class: null, pct, ruleText: en.join('; '), ruleTextKo: ko.join('; '), numbers, ruleId: 'awsd11' });
    }
    const sp = finite(ind.soundPath) ? ind.soundPath : 0;
    const spIn = sp / 25.4;
    const c = spIn > 1 ? Math.round(2 * (spIn - 1)) : 0;
    const dRaw = typeof rule.rating === 'function' ? rule.rating(amp, sp) : -amp - c;
    const d = Math.round(dRaw);
    numbers.c = c; numbers.d = d; numbers.dRaw = dRaw;
    if (transferDb) { en.push('transfer +' + transferDb + ' dB → amp ' + fmtDb(amp) + ' dB'); ko.push('전달 보정 +' + transferDb + ' dB → 진폭 ' + fmtDb(amp) + ' dB'); }
    en.push((finite(ind.soundPath) ? 'SP ' + sp + ' mm = ' + spIn.toFixed(2) + ' in' : 'SP unknown (≤ 1 in assumed)') + ' → c = ' + c + ' dB');
    ko.push((finite(ind.soundPath) ? '빔 노정 ' + sp + ' mm = ' + spIn.toFixed(2) + ' in' : '빔 노정 미지정 (≤ 1 in 가정)') + ' → c = ' + c + ' dB');
    en.push('d = −(' + fmtDb(amp) + ') − ' + c + ' = ' + d);
    ko.push('d = −(' + fmtDb(amp) + ') − ' + c + ' = ' + d);
    let cls;
    if (d <= row.A) cls = 'A';
    else if (d >= row.B[0] && d <= row.B[1]) cls = 'B';
    else if (d >= row.C[0] && d <= row.C[1]) cls = 'C';
    else if (d >= row.D) cls = 'D';
    else cls = d < row.B[0] ? 'A' : 'D';
    numbers.class = cls; numbers.classLimits = row;
    const limits = angle + '°: A ≤ ' + row.A + ', B ' + row.B[0] + '…' + row.B[1] + ', C ' + row.C[0] + '…' + row.C[1] + ', D ≥ ' + row.D;
    en.push(limits + ' → class ' + cls);
    ko.push(limits + ' → 등급 ' + cls);
    const L = ind.lengthMm;
    let disposition = 'accept';
    if (cls === 'A') { disposition = 'reject'; en.push('class A → reject regardless of length'); ko.push('등급 A → 길이와 무관하게 불합격'); }
    else if (cls === 'B') { disposition = L > 19 ? 'reject' : 'accept'; en.push('class B: L ' + L + (L > 19 ? ' > ' : ' ≤ ') + '19 mm (3/4 in) → ' + disposition.toUpperCase()); ko.push('등급 B: 길이 ' + L + (L > 19 ? ' > ' : ' ≤ ') + '19 mm (3/4 in) → ' + DISP_KO[disposition]); }
    else if (cls === 'C') {
      const dp = ind.depth;
      const quarter = finite(dp) && (dp < T / 4 || dp > 3 * T / 4);
      const lim = quarter ? 19 : 50;
      disposition = L > lim ? 'reject' : 'accept';
      en.push('class C: ' + (finite(dp) ? 'dp ' + dp + (quarter ? ' in the top/bottom quarter' : ' in the middle half') : 'depth unknown → middle half assumed') + ' → limit ' + lim + ' mm; L ' + L + (L > lim ? ' > ' : ' ≤ ') + lim + ' → ' + disposition.toUpperCase());
      ko.push('등급 C: ' + (finite(dp) ? '깊이 ' + dp + (quarter ? ' (상·하 1/4 영역)' : ' (중앙 1/2 영역)') : '깊이 미지정 → 중앙 1/2 가정') + ' → 한계 ' + lim + ' mm; 길이 ' + L + (L > lim ? ' > ' : ' ≤ ') + lim + ' → ' + DISP_KO[disposition]);
    } else { en.push('class D → accept regardless of length'); ko.push('등급 D → 길이와 무관하게 합격'); }
    en.push('B/C isolation (spacing) rule omitted');
    ko.push('B/C 등급의 간격(이격) 규칙은 생략');
    return result({ disposition, recordable: cls !== 'D', class: cls, pct, ruleText: en.join('; '), ruleTextKo: ko.join('; '), numbers, ruleId: 'awsd11' });
  }

  /**
   * Evaluate one indication against a rule set (§4.3).
   * @param {{ruleId?:string, level?:string, T?:number, probeAngle?:number, transferDb?:number, rulesOverride?:object,
   *          indication:{ampDbVsRef:number, lengthMm?:number, type?:string, soundPath?:number, depth?:number}}} args
   * @returns {{disposition:'not-recordable'|'accept'|'reject'|'n/a', recordable:boolean, class:string|null, pct:number,
   *            ruleText:string, ruleTextKo:string, numbers:object}}
   */
  function evaluate(args) {
    const a = args || {};
    const sd = st().standards || {};
    const ruleId = rules[a.ruleId] ? a.ruleId : (rules[sd.standard] ? sd.standard : 'iso11666');
    const rule = ruleSet(ruleId, a.rulesOverride);
    const ind = normaliseIndication(a.indication || a);
    const T = num(a.T, specimenT());
    const transferDb = finite(a.transferDb) ? a.transferDb : num(sd.transferDb, 0);
    const amp = ind.ampDbVsRef + transferDb;
    const pct = Math.round(100 * Math.pow(10, amp / 20));
    const level = a.level || sd.level || 'AL2';
    let r;
    if (ruleId === 'asme8') r = evalAsme8(rule, T, amp, pct, ind, transferDb);
    else if (ruleId === 'awsd11') r = evalAws(rule, T, amp, pct, ind, transferDb, num(a.probeAngle, NaN));
    else if (ruleId === 'iso17640') {
      const tech = rule.techniques && rule.techniques[num(a.technique, num(sd.technique, 1))] ? num(a.technique, num(sd.technique, 1)) : 1;
      const evalDb = num(rule.techniques[tech].evaluationDb, -10);
      const acc = ruleSet('iso11666', a.rulesOverride);
      // acceptance decision via ISO 11666, but the evaluation level of the chosen technique governs recordability
      const lvl = Object.assign({}, acc.levels[acc.levels[level] ? level : 'AL2'], { evaluationDb: evalDb });
      const acc2 = Object.assign({}, acc, { levels: Object.assign({}, acc.levels) });
      acc2.levels[acc.levels[level] ? level : 'AL2'] = lvl;
      r = evalIso11666(acc2, level, T, amp, pct, ind, transferDb, 'iso17640');
      r.numbers.technique = tech;
    } else r = evalIso11666(rule, level, T, amp, pct, ind, transferDb, 'iso11666');
    r.ruleId = ruleId;
    r.lengthMethod = rule.lengthMethod;
    r.reference = rule.reference;
    return r;
  }

  // ================================================================== T4 — procedures
  const PROCEDURE_DATA = [
    { id: 'iso-B-plate20', name: 'ISO 17640 level B / ISO 11666 AL2 — plate 20 mm', nameKo: 'ISO 17640 B 등급 / ISO 11666 AL2 — 평판 20 mm',
      standard: 'iso11666', level: 'AL2', testingLevel: 'B', probes: ['mwb45-4', 'mwb60-4', 'mwb70-4', 'mb4s'] /* any two angles ≥ 10° apart + 0° */,
      surfaces: 'both sides, one surface', refBlock: 'dac', refSdhMm: 3, refReflector: '3 mm SDH (technique 1) / DSR 1.5 mm at 4 MHz (technique 2)',
      transferDb: 0 /* 2–12 dB compensated */, scanningGainAboveRefDb: 6,
      T: 20, specimen: { pipe: false, T: 20 }, instrument: { gain: 34, refGain: 34, range: 100 } },
    { id: 'asme-pipe-6in', name: 'ASME VIII App. 12 — pipe 6 in (WT 20)', nameKo: 'ASME VIII 부록 12 — 6 in 배관 (WT 20)',
      standard: 'asme8', level: null, testingLevel: null, refBlock: 'dac', refSdhMm: 2.4 /* T/4, T/2, 3T/4 */,
      probes: ['gen-45-5-10', 'gen-60-5-10', 'gen-0-5-10'], scanningGainAboveRefDb: 6, recordPct: 20, transferDb: 0,
      refReflector: '2.4 mm SDH at T/4, T/2, 3T/4 (ASME V T-434.2.1 basic block)',
      T: 20, specimen: { pipe: true, od: 168.3, wt: 20, T: 20 }, instrument: { gain: 34, refGain: 34, range: 100 } },
    { id: 'aws-d11-70', name: 'AWS D1.1 — 70° statically loaded (t ≤ 20)', nameKo: 'AWS D1.1 — 70° 정하중 (t ≤ 20)',
      standard: 'awsd11', level: null, testingLevel: null, refBlock: 'iiw' /* v1 block, 1.5 mm hole at (135,15) */, probes: ['gen-70-5-10', 'mwb70-2'],
      notes: 'AWS requires 2–2.5 MHz, 15–25 mm crystals for the standard procedure', scanningLevel: 'ref + 14 dB for SP ≤ 64 mm', transferDb: 0,
      refReflector: '1.5 mm (0.06 in) SDH of the IIW block',
      T: 20, specimen: { pipe: false, T: 20 }, instrument: { gain: 40, refGain: 40, range: 100 } },
  ];
  const procedures = {};
  PROCEDURE_DATA.forEach(function (p) { procedures[p.id] = p; });
  /** The three procedures as an array (§4.3 T4). */
  function procedureList() { return PROCEDURE_DATA.slice(); }

  /**
   * Apply a procedure preset in ONE UT.set (standards, weldOpts.T, instrument gain/refGain/range). null clears it.
   * @param {string|null} id
   * @returns {boolean}
   */
  function applyProcedure(id) {
    const s = st();
    if (id === null || id === undefined || id === '') {
      UT.set({ standards: Object.assign({}, s.standards, { procedure: null }) });
      return true;
    }
    const p = procedures[id];
    if (!p) return false;
    const standardsPatch = Object.assign({}, s.standards, { procedure: p.id, standard: p.standard, transferDb: num(p.transferDb, 0) });
    if (p.level) standardsPatch.level = p.level;
    if (p.testingLevel) standardsPatch.testingLevel = p.testingLevel;
    const weldPatch = Object.assign({}, s.weldOpts, { T: p.T });
    if (p.specimen && p.specimen.pipe && finite(p.specimen.wt)) weldPatch.wt = p.specimen.wt;
    const instPatch = Object.assign({}, s.instrument, p.instrument || {});
    UT.set({ standards: standardsPatch, weldOpts: weldPatch, instrument: instPatch });
    // rebuild the DAC block / weld when its thickness no longer matches the procedure (guarded, other module)
    const spec = st().specimen, mode = st().mode;
    if (spec && has('modes.enter') && (mode === 'dac' || mode === 'weld') && finite(spec.T) && Math.abs(spec.T - p.T) > 1e-9) {
      try { UT.modes.enter(mode, { keepProbe: true, silentUI: true }); } catch (e) { /* ignore */ }
    }
    return true;
  }
  /**
   * Probe library ids allowed by the active procedure (null = unrestricted).
   * @param {object} [state] defaults to UT.state
   * @returns {string[]|null}
   */
  function allowedProbes(state) {
    const s = state || st();
    const id = s && s.standards && s.standards.procedure;
    const p = id && procedures[id];
    return p && Array.isArray(p.probes) ? p.probes.slice() : null;
  }

  // ================================================================== standards notes (Help ▸ Standards notes)
  /** Confidence / caveat notes as plain strings (also UT.test.standardsNotes()). */
  function notes() {
    const out = [];
    out.push(NOTE + ' — every rule set in this simulator is illustrative teaching data, not a substitute for the standard.');
    out.push('ISO 17640:2017 — confidence HIGH on structure, technique/reference reflectors, quality-level mapping and transfer correction (ignore < 2 dB, compensate up to 12 dB, investigate above); MEDIUM on coverage per testing level, on the +6 dB scanning gain and on the 4 dB sensitivity re-check limit (lessons 23/25 say "verify"). Techniques 3 (notch) and 4 (tandem DSR) are LOW confidence and unused.');
    out.push('ISO 11666:2018 — confidence HIGH: AL2 ↔ quality B, AL3 ↔ quality C, no AL1; AL2 = −4 dB (short, l ≤ max(10, 0.5 t)) / −10 dB (long), evaluation level −10 dB (33 % DAC). AL3 = +4 dB (short, l ≤ max(10, 1.0 t)) / −2 dB (long), evaluation −6 dB: lead decision, confidence MEDIUM — verify (alternative if disproved: 0 / −6 dB). Planar reject (crack / LOF / IP) is a simulator rule — ISO 23279 characterisation is optional in ISO 11666.');
    out.push('ASME BPVC VIII-1 App. 12 (12-3) + ASME V Art. 4 — confidence HIGH: investigate all indications > 20 % of reference (compared in percent so −14 dB counts as 20 %); reject cracks / LOF / IP regardless; other indications reject when > 100 % DAC AND longer than 6 mm (t ≤ 19), t/3 (19 < t ≤ 57) or 19 mm (t > 57). Basic block SDH ⌀ 2.4 mm for t ≤ 25.');
    out.push('AWS D1.1 Table 8.2 (statically loaded, non-tubular) — confidence MEDIUM-HIGH (~75 %) on the class numbers, HIGH on structure: rating d = a − b − c with c = 2 dB per inch of sound path beyond 1 in (rounded, .5 up); classes A–D per thickness band and probe angle; for t ≤ 3/4 in only 70° is listed (45°/60° → n/a); the B/C isolation (spacing) rule is omitted; class D is accepted and not recorded.');
    out.push('DGS / ERS — normalised Krautkrämer diagram: backwall 1/A, disc 2π·G²/A² (lead decision), SDH √(2λd)/(a·A^1.5); far-field approximation (A ≥ 1); DGS applies to the 0° probe only; the transfer correction is added to the specimen echo. The reference echo is transported to the evaluated echo\'s path with the simulator\'s own backwall law (√(N/s) near-field blend plus material attenuation) before the diagram is entered, so the ERS inverts the tracer\'s FBH law exactly (identity for equal paths).');
    out.push('Mode conversion — the S↔L conversion coefficients R_LS(φ) and R_SL(φ) of the ray tracer are closed-form fits, ±0.1; converted echoes are labelled "Mode-converted (L/S)". Conversions with a coefficient R < 0.04 (L→S below ≈ 8°, S→L below ≈ 4.4° from the normal) are treated as no conversion, so e.g. the 0° plain-plate L-S-S-S satellite between backwall multiples 3 and 4 is deliberately absent (SPEC NOTE 30). Switching Probes ▸ Mode conversion OFF also removes the conversion LOSS on specular echoes (the 1 − R split), so the 60° root-corner echo reads ≈ +5.5 dB higher with mode conversion off — compare readings only with the same setting.');
    out.push('Exam sharing — an exam link contains no defects (only the seed, the code hash and the settings) and the result token is signed with FNV-1a. This is obfuscation for classroom use, not security: the browser devtools can still reach the generator.');
    out.push('Transfer correction — measured as the gain difference between the block and the specimen backwall (same path); ISO 17640: ignore < 2 dB, compensate 2…12 dB, investigate > 12 dB. Lesson 24 enters it in Evaluation ▸ Transfer.');
    return out;
  }
  /** Korean rendering of notes() (same order; UT.test.standardsNotes() stays English). */
  function notesKo() {
    return [
      t(NOTE) + ' — 이 시뮬레이터의 모든 규칙 세트는 교육용 예시 데이터이며 규격을 대신하지 않습니다.',
      'ISO 17640:2017 — 구조, 기법/기준 반사체, 품질 등급 매핑, 전달 손실 보정(2 dB 미만 무시, 12 dB까지 보정, 초과 시 조사)은 신뢰도 높음; 시험 레벨별 주사 범위, +6 dB 주사 게인, 4 dB 감도 재확인 한계는 신뢰도 보통(레슨 23/25에 "확인 필요" 표기). 기법 3(노치)과 4(탠덤 DSR)는 신뢰도 낮음이며 사용하지 않습니다.',
      'ISO 11666:2018 — 신뢰도 높음: AL2 ↔ 품질 등급 B, AL3 ↔ 품질 등급 C, AL1 없음; AL2 = −4 dB (짧은 지시, l ≤ max(10, 0.5 t)) / −10 dB (긴 지시), 평가 레벨 −10 dB (DAC 33 %). AL3 = +4 dB (짧은 지시, l ≤ max(10, 1.0 t)) / −2 dB (긴 지시), 평가 레벨 −6 dB: 리드 결정, 신뢰도 보통 — 확인 필요(반증 시 대안: 0 / −6 dB). 면상 결함(균열 / 융합 불량 / 용입 부족) 불합격은 시뮬레이터 규칙 — ISO 11666에서 ISO 23279 특성 평가는 선택 사항입니다.',
      'ASME BPVC VIII-1 App. 12 (12-3) + ASME V Art. 4 — 신뢰도 높음: 기준의 20 %를 넘는 모든 지시를 조사(퍼센트로 비교하므로 −14 dB가 20 %에 해당); 균열 / 융합 불량 / 용입 부족은 무조건 불합격; 그 밖의 지시는 DAC 100 % 초과이면서 길이가 6 mm (t ≤ 19), t/3 (19 < t ≤ 57) 또는 19 mm (t > 57)를 넘을 때 불합격. t ≤ 25의 기본 시험편 횡공 ⌀ 2.4 mm.',
      'AWS D1.1 표 8.2 (정하중, 비관형) — 등급 수치는 신뢰도 보통-높음(약 75 %), 구조는 높음: 지시 등급 d = a − b − c, c = 빔 노정 1 in 초과분 1 in당 2 dB (반올림, .5는 올림); 두께 구간과 탐촉자 각도별 A–D 등급; t ≤ 3/4 in에서는 70°만 규정(45°/60° → 해당 없음); B/C 격리(간격) 규칙은 생략; D 등급은 합격이며 기록하지 않습니다.',
      'DGS / ERS — 정규화된 Krautkrämer 선도: 저면 1/A, 원판 2π·G²/A² (리드 결정), 횡공 √(2λd)/(a·A^1.5); 원거리 음장 근사 (A ≥ 1); DGS는 0° 탐촉자에만 적용; 전달 손실 보정은 시험체 에코에 더해집니다. 기준 에코는 선도에 넣기 전에 시뮬레이터 자체의 저면 거리 법칙(√(N/s) 근거리 음장 혼합 + 재질 감쇠)으로 평가 에코의 노정으로 옮겨지므로 ERS는 광선 추적기의 평저공 법칙을 정확히 역산합니다(노정이 같으면 항등).',
      '모드 변환 — 광선 추적기의 S↔L 변환 계수 R_LS(φ), R_SL(φ)는 닫힌 형식 근사식(±0.1)이며, 변환된 에코는 "모드 변환 (L/S)"로 표시됩니다. 변환 계수 R < 0.04인 변환(법선 기준 L→S 약 8° 미만, S→L 약 4.4° 미만)은 변환 없음으로 취급하므로, 예를 들어 0° 평판의 저면 3회·4회 다중 반사 사이 L-S-S-S 위성 에코는 의도적으로 나타나지 않습니다(SPEC NOTE 30).',
      '시험 공유 — 시험 링크에는 결함이 들어 있지 않고(시드, 코드 해시, 설정만) 결과 토큰은 FNV-1a로 서명됩니다. 이는 교실용 난독화이지 보안이 아닙니다: 브라우저 개발자 도구로 여전히 생성기에 접근할 수 있습니다.',
      '전달 손실 보정 — 대비 시험편과 시험체 저면 에코(같은 노정)의 게인 차이로 측정; ISO 17640: 2 dB 미만 무시, 2…12 dB 보정, 12 dB 초과 시 조사. 레슨 24에서 평가 ▸ 전달 손실에 입력합니다.',
    ];
  }

  // ================================================================== CSS (injected on open)
  const css = [
    '.win[data-win=dgs] .win-body{padding:6px;background:#ececec;color:#000}',
    '.win[data-win=dgs] .dgs-canvas{display:block;width:460px;height:300px;background:#fff;border:1px solid #888}',
    '.win[data-win=dgs] .dgs-row{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:4px 0;font-size:12px}',
    '.win[data-win=dgs] .dgs-ers{font:bold 15px "Segoe UI",Arial,sans-serif;color:#004000;margin:4px 0}',
    '.win[data-win=dgs] .dgs-note{font-size:11px;color:#444}',
    '.win[data-win=dgs] .dgs-warn{font-size:11px;color:#a00000;font-weight:bold}',
    '.win[data-win=dgs] .dgs-fbh{flex:0 0 52px;width:52px;min-width:0}',
    '.win[data-win=evaluation] .win-body{padding:6px;background:#ececec;color:#000;font-size:12px}',
    '.win[data-win=evaluation] .ev-head{display:grid;grid-template-columns:1fr 1fr;gap:0 12px}',
    '.win[data-win=evaluation] .ev-head .fld-label{flex-basis:110px}',
    '.win[data-win=evaluation] .ev-head .fld-input{width:120px}',
    '.win[data-win=evaluation] .ev-ref{font-size:11px;color:#333;margin:2px 0 4px}',
    '.win[data-win=evaluation] .ev-table{border-collapse:collapse;width:100%;background:#fff}',
    '.win[data-win=evaluation] .ev-table th,.win[data-win=evaluation] .ev-table td{border:1px solid #999;padding:2px 3px;font-size:11px;text-align:center;vertical-align:middle}',
    '.win[data-win=evaluation] .ev-table input,.win[data-win=evaluation] .ev-table select{font-size:11px;padding:1px 2px;box-sizing:border-box}',
    '.win[data-win=evaluation] .ev-n{width:36px}.win[data-win=evaluation] .ev-in{width:52px}.win[data-win=evaluation] .ev-ang{width:44px}.win[data-win=evaluation] .ev-sel{width:112px}',
    '.win[data-win=evaluation] .ev-disp{font-weight:bold;min-width:70px}',
    '.win[data-win=evaluation] .ev-disp.accept{color:#006000}.win[data-win=evaluation] .ev-disp.reject{color:#c00000}',
    '.win[data-win=evaluation] .ev-disp.not-recordable{color:#555}.win[data-win=evaluation] .ev-disp.na{color:#777;font-style:italic}',
    '.win[data-win=evaluation] .ev-why{padding:0 5px;font-size:10px}',
    '.win[data-win=evaluation] .ev-whyrow td{text-align:left;background:#fbfbe6;font-size:11px;white-space:normal;line-height:1.3}',
    '.win[data-win=evaluation] .ev-numbers{color:#444;font-family:Consolas,monospace;font-size:10px;margin-top:2px;word-break:break-word}',
    '.win[data-win=evaluation] .ev-del{padding:0 5px;font-size:10px}',
    '.win[data-win=evaluation] .ev-summary{margin-top:4px;font-size:11px}',
    '.win[data-win=evaluation] .ev-override{margin-top:6px;font-size:11px}',
    '.win[data-win=evaluation] .ev-override textarea{width:100%;height:70px;font:10px Consolas,monospace;box-sizing:border-box}',
    '.win[data-win=evaluation] .ev-live{position:absolute;left:-9999px}',
    '.win[data-win=procedures] .win-body{padding:6px;background:#ececec;color:#000;font-size:12px}',
    '.win[data-win=procedures] .pr-item{border:1px solid #999;background:#fff;padding:5px 6px;margin:4px 0;display:flex;gap:8px;align-items:flex-start}',
    '.win[data-win=procedures] .pr-item.active{background:#e6f4e6;border-color:#2a7a2a}',
    '.win[data-win=procedures] .pr-body{flex:1;min-width:0}',
    '.win[data-win=procedures] .pr-title{font-weight:bold}',
    '.win[data-win=procedures] .pr-line{font-size:11px;color:#333}',
    '.win[data-win=procedures] .pr-cur{font-size:11px;margin:2px 0 4px}',
    '.win[data-win=stdnotes] .win-body{padding:8px;background:#fdfbd8;color:#000;font-size:12px;max-width:560px}',
    '.win[data-win=stdnotes] .sn-item{margin:0 0 8px;line-height:1.35}',
    '.win[data-win=stdnotes] .sn-item b{display:block;margin-bottom:1px}',
    '.win[data-win=stdnotes] .sn-note{font-style:italic;color:#444;margin-bottom:8px}',
  ].join('\n');
  function injectCss() { UT.dom.injectCss('standards', css); }
  function inBrowser() { return typeof document !== 'undefined' && !!document.body; }

  // ================================================================== window 'dgs'
  const dgsUi = { win: null, canvas: null, readout: null, refLine: null, warn: null, fbhIn: null, renderBound: false };
  let dgsRef = null;   // {kind:'backwall'|'fbh', path, ampPct, gain, fbhMm}

  function primaryReadout() { const f = UT.frame; return f && f.readouts && f.readouts.primary ? f.readouts.primary : null; }
  /**
   * Record the gated echo (frame.readouts.primary) as the DGS reference.
   * @param {'backwall'|'fbh'} kind
   * @param {number} [fbhMm] FBH diameter when kind is 'fbh' (default 3)
   * @returns {object|null} the stored reference
   */
  function recordReference(kind, fbhMm) {
    const R = primaryReadout();
    if (!R || !(R.peakPct > 0) || !(R.path > 0)) { UT.status({ right: t('Gate an echo first (no gated peak)') }); return null; }
    dgsRef = { kind: kind === 'fbh' ? 'fbh' : 'backwall', path: R.path, ampPct: R.peakPct, gain: st().instrument.gain, fbhMm: kind === 'fbh' ? (num(fbhMm, 3) || 3) : null, echoKind: R.echoKind || null };
    UT.status({ right: t('DGS reference recorded: {kind} at {path} mm, {pct} % at {gain} dB', { kind: dgsRef.kind, path: dgsRef.path.toFixed(1), pct: Math.round(dgsRef.ampPct), gain: dgsRef.gain }) });
    dgsDraw();
    return dgsRef;
  }
  /** Set/clear the reference directly ({kind, path, ampPct, gain, fbhMm} or null). */
  function setReference(ref) { dgsRef = ref && typeof ref === 'object' ? Object.assign({ kind: 'backwall', gain: 0 }, ref) : null; dgsDraw(); return dgsRef; }
  /** Live DGS computation from the current frame: {ref, echo, result, derived:{a, N}}. */
  function dgsCurrent() {
    const d = currentDerived();
    const R = primaryReadout();
    const echo = R && R.peakPct > 0 ? { path: R.path, ampPct: R.peakPct, gain: st().instrument.gain, echoKind: R.echoKind || null } : null;
    const res = d && dgsRef && echo ? ers({ derived: d, ref: dgsRef, echo, transferDb: num(st().standards && st().standards.transferDb, 0) }) : null;
    return { ref: dgsRef ? Object.assign({}, dgsRef) : null, echo, result: res, derived: d ? { a: d.crystalA || d.diameter, N: d.nearField, angle: d.refracted, lambda: d.lambda } : null };
  }
  const PLOT = { A0: 0.5, A1: 30, dB0: 10, dB1: -50 };
  function dgsDraw() {
    if (!dgsUi.win || !dgsUi.win.isOpen() || !dgsUi.canvas) return;
    const cv = dgsUi.canvas;
    const ctx = UT.dom.fitCanvas(cv);
    const W = cv.clientWidth || 460, H = cv.clientHeight || 300;
    const ml = 46, mr = 44, mt = 12, mb = 26;
    const pw = W - ml - mr, ph = H - mt - mb;
    const lA0 = Math.log10(PLOT.A0), lA1 = Math.log10(PLOT.A1);
    const xOf = function (A) { return ml + (Math.log10(Math.max(A, 1e-3)) - lA0) / (lA1 - lA0) * pw; };
    const yOf = function (db) { return mt + (PLOT.dB0 - db) / (PLOT.dB0 - PLOT.dB1) * ph; };
    const cur = dgsCurrent();
    const d = currentDerived();
    ctx.save();
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    // grid
    ctx.strokeStyle = '#d8d8d8'; ctx.lineWidth = 1; ctx.font = '10px "Segoe UI", Arial, sans-serif'; ctx.fillStyle = '#333';
    [0.5, 1, 2, 3, 5, 10, 20, 30].forEach(function (A) {
      const x = Math.round(xOf(A)) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, mt); ctx.lineTo(x, mt + ph); ctx.stroke();
      ctx.textAlign = 'center'; ctx.fillText(String(A), x, mt + ph + 12);
    });
    for (let db = PLOT.dB0; db >= PLOT.dB1; db -= 10) {
      const y = Math.round(yOf(db)) + 0.5;
      ctx.beginPath(); ctx.moveTo(ml, y); ctx.lineTo(ml + pw, y); ctx.stroke();
      ctx.textAlign = 'right'; ctx.fillText(String(db), ml - 4, y + 3);
    }
    ctx.textAlign = 'center'; ctx.fillText('A = s / N', ml + pw / 2, H - 2);
    ctx.save(); ctx.translate(10, mt + ph / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('H (dB)', 0, 0); ctx.restore();
    ctx.strokeStyle = '#555'; ctx.strokeRect(ml + 0.5, mt + 0.5, pw, ph);
    ctx.beginPath(); ctx.rect(ml, mt, pw, ph); ctx.clip();
    const cv2 = curves(d);
    const plotCurve = function (Hs, colour, width, dash) {
      ctx.strokeStyle = colour; ctx.lineWidth = width; ctx.setLineDash(dash || []);
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < cv2.A.length; i++) {
        const db = M.lin2dB(Hs[i]);
        const x = xOf(cv2.A[i]), y = yOf(Math.max(db, PLOT.dB1 - 5));
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke(); ctx.setLineDash([]);
    };
    plotCurve(cv2.bw, '#0040c0', 2.2);
    cv2.discs.forEach(function (dc) { plotCurve(dc.H, '#c04000', 1.1); });
    if (cur.result && finite(cur.result.G) && cur.result.G > 0) plotCurve(cv2.A.map(function (A) { return hDisc(A, cur.result.G); }), '#008000', 1.3, [4, 3]);
    ctx.restore();
    // labels
    ctx.save();
    ctx.font = '10px "Segoe UI", Arial, sans-serif'; ctx.textAlign = 'left';
    ctx.fillStyle = '#0040c0'; ctx.fillText(t('backwall'), ml + pw + 3, yOf(M.lin2dB(hBw(PLOT.A1))) + 3);
    ctx.fillStyle = '#c04000';
    cv2.discs.forEach(function (dc) {
      const db = M.lin2dB(hDisc(PLOT.A1, dc.G));
      if (db > PLOT.dB1) ctx.fillText('G ' + dc.G, ml + pw + 3, yOf(db) + 3);
    });
    // markers
    const mark = function (A, db, colour, square) {
      const x = xOf(A), y = yOf(db);
      if (A < PLOT.A0 || A > PLOT.A1 || db > PLOT.dB0 || db < PLOT.dB1) return;
      ctx.fillStyle = colour; ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
      ctx.beginPath();
      if (square) ctx.rect(x - 4, y - 4, 8, 8); else ctx.arc(x, y, 4.5, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    };
    if (cur.result) { mark(cur.result.Aref, cur.result.HdbRef, '#0040c0', true); mark(cur.result.Aecho, cur.result.HdbEcho, '#00c000', false); }
    else if (dgsRef && d) { const A = dgsRef.path / d.nearField; mark(A, M.lin2dB(dgsRef.kind === 'fbh' ? hDisc(A, (dgsRef.fbhMm || 3) / (d.crystalA || 10)) : hBw(A)), '#0040c0', true); }
    ctx.restore();
    // text
    if (dgsUi.readout) {
      dgsUi.readout.textContent = cur.result ? t('ERS = {ers} mm (G {g})', { ers: cur.result.ersMm.toFixed(1), g: cur.result.G.toFixed(2) }) + '   ' + t('{db} dB vs reference, {d3} dB vs ⌀3 disc', { db: fmtDb(+cur.result.dBvsRef.toFixed(1)), d3: fmtDb(+cur.result.dBvsDisc3.toFixed(1)) })
        : (dgsRef ? t('Gate an echo to read its ERS') : t('Record a reference first (backwall or FBH)'));
    }
    if (dgsUi.refLine) {
      dgsUi.refLine.textContent = dgsRef ? t('Reference: {kind} at {path} mm, {pct} % at {gain} dB', { kind: dgsRef.kind === 'fbh' ? t('FBH ⌀{d} mm', { d: dgsRef.fbhMm }) : t('backwall'), path: dgsRef.path.toFixed(1), pct: Math.round(dgsRef.ampPct), gain: dgsRef.gain })
        + (d ? '   N = ' + d.nearField.toFixed(1) + ' mm, a = ' + (d.crystalA || d.diameter) + ' mm' : '') : t('No reference recorded') + (d ? '   N = ' + d.nearField.toFixed(1) + ' mm' : '');
    }
    if (dgsUi.warn) dgsUi.warn.textContent = d && d.refracted !== 0 ? t('DGS applies to the 0° probe only — select the 0° probe') : '';
  }
  function dgsBuild() {
    const dom = UT.dom;
    dgsUi.canvas = dom.h('canvas', { class: 'dgs-canvas', width: 460, height: 300, 'aria-label': t('DGS diagram: normalised distance A versus echo height H in dB') });
    dgsUi.readout = dom.h('div', { class: 'dgs-ers', 'aria-live': 'polite' });
    dgsUi.refLine = dom.h('div', { class: 'dgs-row' });
    dgsUi.warn = dom.h('div', { class: 'dgs-warn' });
    dgsUi.fbhIn = dom.h('input', { type: 'number', class: 'fld-input dgs-fbh', value: 3, min: 1, max: 20, step: 0.5, 'aria-label': t('FBH diameter (mm)') });
    return dom.h('div', {}, [
      dgsUi.canvas,
      dgsUi.readout,
      dgsUi.refLine,
      dgsUi.warn,
      dom.h('div', { class: 'dgs-row' }, [
        dom.button('Record reference (backwall)', function () { recordReference('backwall'); }, { class: 'btn primary' }),
        dom.button('Record reference (FBH)', function () { recordReference('fbh', parseFloat(dgsUi.fbhIn.value)); }),
        dom.h('span', { i18n: '⌀ mm' }), dgsUi.fbhIn,
        dom.button('Clear', function () { setReference(null); }),
      ]),
      dom.h('div', { class: 'dgs-note', i18n: 'far-field approximation (A ≥ 1); DGS applies to the 0° probe only' }),
      dom.h('div', { class: 'dgs-note', i18n: 'Blue: backwall curve. Orange: disc curves G = d/a. Green dashed: the disc curve through the gated echo. Square = reference, circle = gated echo.' }),
    ]);
  }
  const dgs = {
    curves, ers, hBw, hDisc, hSdh, recordReference, setReference, current: dgsCurrent,
    /** The 'dgs' window api (null until first open()). */
    get window() { return dgsUi.win; },
    get reference() { return dgsRef; },
    isOpen() { return !!(dgsUi.win && dgsUi.win.isOpen()); },
    open() {
      if (!inBrowser()) return null;
      injectCss();
      if (!dgsUi.win) {
        dgsUi.win = UT.dom.win({ name: 'dgs', title: 'DGS diagram', x: 300, y: 90, content: dgsBuild() });
        if (!dgsUi.renderBound) { dgsUi.renderBound = true; UT.bus.on('render', function () { dgsDraw(); }); }
      }
      dgsUi.win.show();
      dgsDraw();
      return dgsUi.win;
    },
    close() { if (dgsUi.win) dgsUi.win.hide(); },
    toggle() { return dgs.isOpen() ? dgs.close() : dgs.open(); },
    draw: dgsDraw,
  };

  // ================================================================== window 'evaluation'
  const evUi = { win: null, tbody: null, summary: null, live: null, refLine: null, tIn: null, T: null, override: null, reportKey: null };
  let evRows = [];     // [{id, n, z, length, depth, type, ampDbVsRef, soundPath, angle, side, fromReport, result, open}]
  let evId = 1;
  function rowFromReport(r, i) {
    return { id: evId++, n: finite(r.n) ? r.n : i + 1, z: num(r.z, ''), length: num(r.length, ''), depth: num(r.depth, ''), type: normaliseType(r.type) || 'planar',
      ampDbVsRef: num(r.ampDb, num(r.ampDbVsRef, '')), soundPath: num(r.soundPath, ''), angle: num(r.angle, ''), side: r.side === undefined ? '' : r.side, fromReport: true, result: null, open: false };
  }
  function currentReport() { return (st().trade && Array.isArray(st().trade.report)) ? st().trade.report : []; }
  function syncFromReport() {
    const rep = currentReport();
    const key = JSON.stringify(rep);
    if (key === evUi.reportKey) return false;
    evUi.reportKey = key;
    const own = evRows.filter(function (r) { return !r.fromReport; });
    evRows = rep.filter(function (r) { return r && typeof r === 'object'; }).map(rowFromReport).concat(own);
    return true;
  }
  /** Add a row (partial fields ok); returns the row. */
  function addRow(row) {
    const r = Object.assign({ id: evId++, n: evRows.length + 1, z: '', length: '', depth: '', type: 'planar', ampDbVsRef: '', soundPath: '', angle: '', side: '', fromReport: false, result: null, open: false }, row || {});
    r.type = normaliseType(r.type) || 'planar';
    evRows.push(r);
    evRefresh();
    return r;
  }
  /** Add a row from the gated readout (dB vs DAC or vs the 80 % reference at refGain). */
  function addFromReadout() {
    const R = primaryReadout();
    const s = st();
    if (!R || !(R.peakPct > 0)) { UT.status({ right: t('Gate an echo first (no gated peak)') }); return null; }
    const amp = finite(R.dBToDac) ? R.dBToDac : (M.lin2dB(R.peakPct / 80) - ((s.instrument.gain || 0) - (finite(s.instrument.refGain) ? s.instrument.refGain : s.instrument.gain || 0)));
    let type = 'planar';
    if (has('rays.describe') && UT.frame && UT.frame.echoes) {
      try {
        const e = UT.frame.echoes.find(function (x) { return Math.abs(x.path - R.path) < 0.05; });
        const dsc = e ? UT.rays.describe(e) : null;
        const cat = dsc && typeof dsc === 'object' ? dsc.category : null;
        if (cat === 'lamination') type = 'lamination'; else if (cat === 'corner' || cat === 'tip') type = 'crack';
      } catch (e) { /* ignore */ }
    }
    return addRow({ z: s.probe.z, depth: +R.dp.toFixed(1), ampDbVsRef: +amp.toFixed(1), soundPath: +R.path.toFixed(1), angle: s.probe.angle, side: s.probe.side, type });
  }
  function removeRow(id) { evRows = evRows.filter(function (r) { return r.id !== id; }); evRefresh(); }
  /** Empty the table (mirrored trade-report rows included); the report is re-mirrored only once it changes again. */
  function clearRows() { evRows = []; evUi.reportKey = JSON.stringify(currentReport()); evRefresh(); }
  function evalArgsFor(row) {
    const s = st().standards || {};
    return { ruleId: s.standard, level: s.level, technique: s.technique, T: finite(evUi.T) ? evUi.T : specimenT(), probeAngle: num(row.angle, NaN),
      indication: { ampDbVsRef: num(row.ampDbVsRef, 0), lengthMm: num(row.length, 0), type: row.type, soundPath: num(row.soundPath, NaN), depth: num(row.depth, NaN) } };
  }
  /** Evaluate every row and write standards.lastEval = {ruleId, level, T, rows:[{indication, result}]}. */
  function evaluateAll() {
    const s = st().standards || {};
    const T = finite(evUi.T) ? evUi.T : specimenT();
    const rowsOut = evRows.map(function (r) {
      const args = evalArgsFor(r);
      r.result = evaluate(args);
      return { indication: Object.assign({ n: r.n, z: num(r.z, null), angle: num(r.angle, null), side: r.side === '' ? null : r.side }, args.indication), result: r.result };
    });
    const lastEval = { ruleId: rules[s.standard] ? s.standard : 'iso11666', level: s.level || null, T, rows: rowsOut, at: Date.now() };
    UT.setIn('standards', { lastEval }, { noRender: true });
    evRefresh();
    if (evUi.live) evUi.live.textContent = t('{n} indications evaluated: {r} reject, {a} accept', { n: rowsOut.length, r: rowsOut.filter(function (x) { return x.result.disposition === 'reject'; }).length, a: rowsOut.filter(function (x) { return x.result.disposition === 'accept'; }).length });
    return lastEval;
  }
  function dispLabel(d) { return t({ accept: 'accept', reject: 'reject', 'not-recordable': 'not recordable', 'n/a': 'n/a' }[d] || d); }
  function refText() {
    const s = st();
    const rule = ruleSet(s.standards.standard) || rules.iso11666;
    const proc = s.standards.procedure && procedures[s.standards.procedure];
    const dac = s.instrument.dac && s.instrument.dac.points && s.instrument.dac.points.length;
    const parts = [];
    parts.push(t('Reference: {ref}', { ref: proc ? proc.refReflector : (rule.refReflector || (rule.techniques && rule.techniques[1] && rule.techniques[1].ref) || (rule.calibration && rule.calibration.block) || '—') }));
    parts.push(dac ? t('DAC recorded ({n} points, ref {db} dB)', { n: dac, db: s.instrument.dac.refDb }) : t('no DAC: dB vs 80 % at the reference gain {g} dB', { g: s.instrument.refGain }));
    parts.push(t('length method: {m}', { m: isKo() ? lengthMethodNames[rule.lengthMethod].ko : lengthMethodNames[rule.lengthMethod].en }));
    if (proc) parts.push(t('procedure {id}', { id: proc.id }));
    return parts.join(' · ');
  }
  function evBuild() {
    const dom = UT.dom;
    const s = st();
    const sd = s.standards;
    const rule = ruleSet(sd.standard) || rules.iso11666;
    syncFromReport();
    const stdSel = dom.field('Standard', { tag: 'select', type: 'text', value: sd.standard, options: RULE_IDS.map(function (id) { return { value: id, label: RULE_NAMES[id] }; }),
      onchange: function (v) { UT.setIn('standards', { standard: v }, { noRender: true }); evRefresh(); } });
    const levelOpts = sd.standard === 'iso11666' || sd.standard === 'iso17640' ? ['AL2', 'AL3'] : [];
    const lvlSel = dom.field('Acceptance level', { tag: 'select', type: 'text', value: sd.level, options: levelOpts.length ? levelOpts : [{ value: sd.level || 'AL2', label: '—' }],
      onchange: function (v) { UT.setIn('standards', { level: v }, { noRender: true }); evRefresh(); } });
    if (!levelOpts.length) lvlSel.input.disabled = true;
    const tlSel = dom.field('Testing level', { tag: 'select', type: 'text', value: sd.testingLevel, options: ['A', 'B', 'C', 'D'],
      onchange: function (v) { UT.setIn('standards', { testingLevel: v }, { noRender: true }); } });
    const tFld = dom.field('Thickness t (mm)', { type: 'number', value: finite(evUi.T) ? evUi.T : specimenT(), min: 1, max: 300, step: 0.5,
      onchange: function (v) { evUi.T = finite(v) ? v : null; evRefresh(); } });
    evUi.tIn = tFld.input;
    const trFld = dom.field('Transfer correction (dB)', { type: 'number', value: sd.transferDb, min: -12, max: 20, step: 0.5,
      onchange: function (v) { UT.setIn('standards', { transferDb: finite(v) ? v : 0 }, { noRender: true }); evRefresh(); } });
    const angleFld = dom.field('Probe angle (AWS)', { type: 'text', value: s.probe.angle + '°', attrs: { readonly: true } });
    evUi.refLine = dom.h('div', { class: 'ev-ref' }, refText());
    const head = dom.h('tr', {}, ['#', 'z (mm)', 'Length (mm)', 'Depth (mm)', 'Type', 'dB vs ref', 'SP (mm)', 'Angle', 'Disposition', 'Why?', ''].map(function (h) { return dom.h('th', h ? { i18n: h } : {}); }));
    evUi.tbody = dom.h('tbody', {});
    const table = dom.h('table', { class: 'ev-table' }, [dom.h('thead', {}, head), evUi.tbody]);
    evUi.summary = dom.h('div', { class: 'ev-summary' });
    evUi.live = dom.h('div', { class: 'ev-live', 'aria-live': 'polite' });
    // rule override editor (leaf values only; functions stay)
    const ov = (sd.rulesOverride && sd.rulesOverride[sd.standard]) || null;
    const ta = dom.h('textarea', { spellcheck: 'false', 'aria-label': t('Rule override (JSON)') });
    ta.value = ov ? JSON.stringify(ov, null, 1) : '';
    const ovBox = dom.h('details', { class: 'ev-override' }, [
      dom.h('summary', {}, t('Edit rule set {id} (JSON override)', { id: sd.standard })),
      dom.h('div', {}, t('Current values: ') + JSON.stringify(rule, function (k, v) { return typeof v === 'function' ? '[fn]' : v; }).slice(0, 600) + '…'),
      ta,
      dom.h('div', { class: 'btn-row left' }, [
        dom.button('Apply override', function () {
          let obj = null;
          try { obj = ta.value.trim() ? JSON.parse(ta.value) : null; } catch (e) { UT.status({ right: t('Invalid JSON') }); return; }
          const all = Object.assign({}, sd.rulesOverride || {});
          if (obj) all[sd.standard] = obj; else delete all[sd.standard];
          UT.setIn('standards', { rulesOverride: Object.keys(all).length ? all : null }, { noRender: true });
          evRefresh();
        }),
        dom.button('Reset rule', function () { ta.value = ''; const all = Object.assign({}, sd.rulesOverride || {}); delete all[sd.standard]; UT.setIn('standards', { rulesOverride: Object.keys(all).length ? all : null }, { noRender: true }); evRefresh(); }),
      ]),
    ]);
    const body = dom.h('div', { class: 'ev' }, [
      dom.h('div', { class: 'ev-head' }, [stdSel, lvlSel, tlSel, tFld, trFld, angleFld]),
      evUi.refLine,
      table,
      dom.h('div', { class: 'btn-row left' }, [
        dom.button('Add row', function () { addRow(); }),
        dom.button('Add from readout', function () { addFromReadout(); }),
        dom.button('Evaluate all', function () { evaluateAll(); }, { class: 'btn primary' }),
        dom.button('Clear rows', function () { clearRows(); }),
        dom.button('Procedures…', function () { proceduresWin.open(); }),
      ]),
      evUi.summary,
      dom.h('div', { class: 'ev-ref' }, t('{note}. Standards notes: Help ▸ Standards notes', { note: t(rule.note) })),
      ovBox,
      evUi.live,
    ]);
    evFillRows();
    return body;
  }
  function evFillRows() {
    if (!evUi.tbody) return;
    const dom = UT.dom;
    evUi.tbody.textContent = '';
    evRows.forEach(function (r) {
      const numIn = function (field, cls, step) {
        return dom.h('input', { type: 'number', value: r[field] === '' || r[field] === null || r[field] === undefined ? '' : r[field], class: cls, step: step || 1,
          onchange: function (e) { r[field] = num(e.target.value, ''); } });
      };
      const typeSel = dom.h('select', { class: 'ev-sel', onchange: function (e) { r.type = e.target.value; } }, INDICATION_TYPES.map(function (x) { return dom.h('option', { value: x.id, selected: x.id === r.type ? true : null }, isKo() ? x.ko : x.en); }));
      const res = r.result;
      const dispCell = dom.h('td', { class: 'ev-disp ' + (res ? (res.disposition === 'n/a' ? 'na' : res.disposition) : '') }, res ? dispLabel(res.disposition) + (res.class ? ' (' + res.class + ')' : '') + (res.recordable && res.disposition === 'accept' ? ' · ' + t('record') : '') : '—');
      const whyBtn = dom.button('Why?', function () { r.open = !r.open; evFillRows(); }, { class: 'btn small ev-why', 'aria-expanded': r.open ? 'true' : 'false', disabled: res ? null : true });
      const tr = dom.h('tr', { dataset: { rowId: r.id } }, [
        dom.h('td', {}, numIn('n', 'ev-n')),
        dom.h('td', {}, numIn('z', 'ev-in')),
        dom.h('td', {}, numIn('length', 'ev-in')),
        dom.h('td', {}, numIn('depth', 'ev-in', 0.5)),
        dom.h('td', {}, typeSel),
        dom.h('td', {}, numIn('ampDbVsRef', 'ev-in', 0.5)),
        dom.h('td', {}, numIn('soundPath', 'ev-in', 0.5)),
        dom.h('td', {}, numIn('angle', 'ev-ang')),
        dispCell,
        dom.h('td', {}, whyBtn),
        dom.h('td', {}, dom.button('✕', function () { removeRow(r.id); }, { class: 'btn ev-del', title: t('Remove row') })),
      ]);
      evUi.tbody.appendChild(tr);
      if (r.open && res) {
        const nums = Object.keys(res.numbers || {}).filter(function (k) { return k !== 'classLimits'; }).map(function (k) { const v = res.numbers[k]; return k + '=' + (typeof v === 'number' ? +v.toFixed(2) : v); }).join('  ');
        evUi.tbody.appendChild(dom.h('tr', { class: 'ev-whyrow' }, dom.h('td', { colspan: 11 }, [
          dom.h('div', {}, (isKo() ? res.ruleTextKo : res.ruleText) + '  [' + res.reference + ']'),
          dom.h('div', { class: 'ev-numbers' }, nums),
        ])));
      }
    });
    if (evUi.summary) {
      const done = evRows.filter(function (r) { return r.result; });
      evUi.summary.textContent = done.length ? t('{n} of {m} rows evaluated: {r} reject, {a} accept, {x} not recordable', { n: done.length, m: evRows.length, r: done.filter(function (r) { return r.result.disposition === 'reject'; }).length, a: done.filter(function (r) { return r.result.disposition === 'accept'; }).length, x: done.filter(function (r) { return r.result.disposition === 'not-recordable'; }).length })
        : t('{m} rows — press Evaluate all', { m: evRows.length });
    }
  }
  function evRefresh() {
    if (!evUi.win || !evUi.win.isOpen()) return;
    evUi.win.setContent(evBuild());
  }
  const evaluation = {
    addRow, addFromReadout, evaluateAll, removeRow, clearRows,
    /** Current rows (copies). */
    rows() { return evRows.map(function (r) { return Object.assign({}, r); }); },
    /** Override the thickness used by the window (null = specimen). */
    setThickness(T) { evUi.T = finite(T) ? T : null; evRefresh(); },
    get window() { return evUi.win; },
    isOpen() { return !!(evUi.win && evUi.win.isOpen()); },
    open() {
      if (!inBrowser()) return null;
      injectCss();
      if (!evUi.win) evUi.win = UT.dom.win({ name: 'evaluation', title: 'Evaluation (standards)', x: 240, y: 80, w: 760 });
      evUi.win.show();
      evRefresh();
      return evUi.win;
    },
    close() { if (evUi.win) evUi.win.hide(); },
    toggle() { return evaluation.isOpen() ? evaluation.close() : evaluation.open(); },
    refresh: evRefresh,
  };

  // ================================================================== window 'procedures'
  const prUi = { win: null };
  function prBuild() {
    const dom = UT.dom;
    const cur = st().standards.procedure;
    const items = PROCEDURE_DATA.map(function (p) {
      const lines = [
        t('Standard: {s}', { s: RULE_NAMES[p.standard] || p.standard }) + (p.level ? ' · ' + p.level : '') + (p.testingLevel ? ' · ' + t('testing level {l}', { l: p.testingLevel }) : ''),
        t('Probes: {p}', { p: p.probes.join(', ') }),
        t('Reference block: {b} — {r}', { b: p.refBlock.toUpperCase(), r: p.refReflector }),
        t('Scanning sensitivity: {s}', { s: p.scanningLevel || t('reference + {db} dB', { db: p.scanningGainAboveRefDb }) }) + (p.recordPct ? ' · ' + t('record ≥ {pct} % of reference', { pct: p.recordPct }) : ''),
        t('Transfer correction: {db} dB', { db: p.transferDb }) + ' · ' + t('block thickness {T} mm', { T: p.T }) + (p.specimen && p.specimen.pipe ? ' · ' + t('pipe OD {od} × WT {wt}', { od: p.specimen.od, wt: p.specimen.wt }) : ''),
      ];
      if (p.notes) lines.push(t(p.notes));
      return dom.h('div', { class: 'pr-item' + (cur === p.id ? ' active' : ''), role: 'group', 'aria-label': p.id }, [
        dom.h('div', { class: 'pr-body' }, [dom.h('div', { class: 'pr-title' }, (isKo() ? p.nameKo : p.name) + '  [' + p.id + ']')].concat(lines.map(function (l) { return dom.h('div', { class: 'pr-line' }, l); }))),
        dom.button(cur === p.id ? 'Applied' : 'Apply', function () { applyProcedure(p.id); prRefresh(); evRefresh(); }, { class: 'btn' + (cur === p.id ? ' active' : ' primary') }),
      ]);
    });
    return dom.h('div', {}, [
      dom.h('div', { class: 'pr-cur' }, cur ? t('Active procedure: {id} — the toolbar and the probe library are limited to its probes during a trade test', { id: cur }) : t('No procedure applied (all probes allowed)')),
    ].concat(items, [
      dom.h('div', { class: 'btn-row left' }, [dom.button('Clear procedure', function () { applyProcedure(null); prRefresh(); evRefresh(); }), dom.button('Evaluation…', function () { evaluation.open(); })]),
      dom.h('div', { class: 'pr-line', i18n: 'A procedure sets the standard, the acceptance/testing level, the DAC block thickness, default gain/reference gain/range and the transfer correction in one step.' }),
    ]));
  }
  function prRefresh() { if (prUi.win && prUi.win.isOpen()) prUi.win.setContent(prBuild()); }
  const proceduresWin = {
    get window() { return prUi.win; },
    isOpen() { return !!(prUi.win && prUi.win.isOpen()); },
    open() {
      if (!inBrowser()) return null;
      injectCss();
      if (!prUi.win) prUi.win = UT.dom.win({ name: 'procedures', title: 'Procedures', x: 320, y: 120, w: 560 });
      prUi.win.show();
      prRefresh();
      return prUi.win;
    },
    close() { if (prUi.win) prUi.win.hide(); },
    toggle() { return proceduresWin.isOpen() ? proceduresWin.close() : proceduresWin.open(); },
  };
  // window methods on the procedures table are NON-enumerable (Object.keys → the three ids only)
  Object.defineProperties(procedures, {
    open: { value: proceduresWin.open, enumerable: false }, close: { value: proceduresWin.close, enumerable: false },
    toggle: { value: proceduresWin.toggle, enumerable: false }, isOpen: { value: proceduresWin.isOpen, enumerable: false },
    window: { get: function () { return prUi.win; }, enumerable: false }, list: { value: procedureList, enumerable: false },
  });

  // ================================================================== window 'stdnotes'
  const snUi = { win: null };
  function snBuild() {
    const dom = UT.dom;
    const heads = ['General', 'ISO 17640:2017', 'ISO 11666:2018', 'ASME VIII-1 App. 12 / ASME V Art. 4', 'AWS D1.1 Table 8.2', 'DGS / ERS', 'Mode conversion', 'Exam sharing', 'Transfer correction'];
    const list = notes(), ko = isKo() ? notesKo() : null;
    return dom.h('div', {}, [dom.h('div', { class: 'sn-note', i18n: 'Confidence notes for the rule sets, the mode-conversion fits and the exam lock. Nothing here replaces the current edition of a standard.' })]
      .concat(list.map(function (n, i) { return dom.h('div', { class: 'sn-item' }, [dom.h('b', { i18n: heads[i] || '' }), ko && ko[i] ? ko[i] : t(n)]); })));
  }
  const stdnotes = {
    notes,
    get window() { return snUi.win; },
    isOpen() { return !!(snUi.win && snUi.win.isOpen()); },
    open() {
      if (!inBrowser()) return null;
      injectCss();
      if (!snUi.win) snUi.win = UT.dom.win({ name: 'stdnotes', title: 'Standards notes', x: 360, y: 60, w: 580 });
      snUi.win.setContent(snBuild());
      snUi.win.show();
      return snUi.win;
    },
    close() { if (snUi.win) snUi.win.hide(); },
    toggle() { return stdnotes.isOpen() ? stdnotes.close() : stdnotes.open(); },
  };

  // ------------------------------------------------------------------ bus subscriptions (no DOM at load)
  UT.bus.on('lang', function () {
    if (evUi.win && evUi.win.isOpen()) evRefresh();
    if (prUi.win && prUi.win.isOpen()) prRefresh();
    if (snUi.win && snUi.win.isOpen()) snUi.win.setContent(snBuild());
    if (dgsUi.win && dgsUi.win.isOpen()) dgsDraw();
  });
  UT.bus.on('state', function (ev) {
    const keys = (ev && ev.keys) || [];
    if (!evUi.win || !evUi.win.isOpen()) { if (keys.indexOf('trade') >= 0) syncFromReport(); return; }
    if (keys.indexOf('trade') >= 0 && syncFromReport()) evRefresh();
    if (keys.indexOf('specimen') >= 0 && evUi.tIn && !finite(evUi.T)) evUi.tIn.value = specimenT();
    if (keys.indexOf('standards') >= 0 && ev.patch && ev.patch.standards && ev.patch.standards.procedure !== undefined) { evRefresh(); prRefresh(); }
  });

  // ================================================================== self test (headless)
  function __selftest() {
    const f = [];
    const near = function (a, b, tol) { return Math.abs(a - b) <= tol; };
    // DGS maths
    const c = curves(null);
    const i3 = c.A.reduce(function (best, a, i) { return Math.abs(a - 3) < Math.abs(c.A[best] - 3) ? i : best; }, 0);
    if (!near(hDisc(3, 0.3), 2 * Math.PI * 0.09 / 9, 1e-9)) f.push('hDisc(3,0.3) ' + hDisc(3, 0.3));
    if (c.discs.length !== 7 || !near(c.discs[2].H[i3], hDisc(c.A[i3], 0.3), 1e-12) || c.A.length !== 61 || c.bw[0] !== 1) f.push('curves shape');
    const d0 = { crystalA: 10, diameter: 10, nearField: 100 * 5 / (4 * 5.9), lambda: 1.18, refracted: 0, freq: 5 };
    const sp0 = { material: { key: 'carbon', attenL5: 0.005 } };
    // tracer FBH law (§3.8): amp_fbh(s) = amp_bw_law(s)·π·d²/(2·λ·max(s, N)), amp_bw_law = the simulator's 0° backwall law
    const bwAmp = function (s) { return 80 * bwLaw(s, d0, sp0); };
    const fbhAmp = function (s, dMm) { return bwAmp(s) * Math.PI * dMm * dMm / (2 * d0.lambda * Math.max(s, d0.nearField)); };
    if (!near(bwLaw(60, d0, sp0) / bwLaw(30, d0, sp0), Math.sqrt(30 / 60) * Math.pow(10, -0.005 * 60 / 20), 1e-9)) f.push('bwLaw ratio 60/30');
    [2, 3, 4, 6].forEach(function (dMm) {
      [30, 50, 60].forEach(function (s) {
        // backwall reference at 60 mm (V2-9 / §3.8 round trip, all paths 30…60 must invert exactly)
        const r = ers({ derived: d0, specimen: sp0, ref: { kind: 'backwall', path: 60, ampPct: bwAmp(60), gain: 30 }, echo: { path: s, ampPct: fbhAmp(s, dMm), gain: 30 } });
        if (!r || !near(r.ersMm, dMm, 0.01)) f.push('ers round trip ⌀' + dMm + '@' + s + ' → ' + (r && r.ersMm));
        // ⌀3 FBH reference at 30 mm
        const r2 = ers({ derived: d0, specimen: sp0, ref: { kind: 'fbh', path: 30, ampPct: fbhAmp(30, 3), gain: 20, fbhMm: 3 }, echo: { path: s, ampPct: fbhAmp(s, dMm), gain: 20 } });
        if (!r2 || !near(r2.ersMm, dMm, 0.01)) f.push('ers fbh-ref round trip ⌀' + dMm + '@' + s + ' → ' + (r2 && r2.ersMm));
      });
      // equal paths: the transport is the identity and the spec formula H_echo = H_ref·10^(ΔdB/20) applies verbatim
      const Aecho = 30 / d0.nearField;
      const r3 = ers({ derived: d0, specimen: sp0, ref: { kind: 'backwall', path: 30, ampPct: 80, gain: 30 }, echo: { path: 30, ampPct: 80 * hDisc(Aecho, dMm / 10) / hBw(Aecho), gain: 30 } });
      if (!r3 || !near(r3.ersMm, dMm, 0.01) || Math.abs(r3.distCorrDb) > 1e-9) f.push('ers equal-path ' + dMm + ' → ' + (r3 && r3.ersMm));
    });
    // gain difference: echo read at +6 dB gain must give the same ERS
    const rA = ers({ derived: d0, ref: { kind: 'backwall', path: 60, ampPct: 80, gain: 30 }, echo: { path: 30, ampPct: 40, gain: 30 } });
    const rB = ers({ derived: d0, ref: { kind: 'backwall', path: 60, ampPct: 80, gain: 30 }, echo: { path: 30, ampPct: 80, gain: 36.0206 }, transferDb: 0 });
    if (!rA || !rB || !near(rA.ersMm, rB.ersMm, 0.01)) f.push('ers gain invariance');
    if (ers({ derived: d0, ref: null, echo: { path: 30, ampPct: 40 } }) !== null) f.push('ers null without ref');
    // V2-16 (ASME / ISO 11666) — exact dispositions
    const ev = function (ruleId, extra, ind) { return evaluate(Object.assign({ ruleId, transferDb: 0 }, extra, { indication: ind })); };
    const exp = function (label, r, disp, rec) { if (r.disposition !== disp || (rec !== undefined && r.recordable !== rec)) f.push(label + ' → ' + r.disposition + '/' + r.recordable + ' (expected ' + disp + ')'); };
    exp('asme +1/10 slag', ev('asme8', { T: 20 }, { ampDbVsRef: 1, lengthMm: 10, type: 'slag' }), 'reject');
    exp('asme −10/10', ev('asme8', { T: 20 }, { ampDbVsRef: -10, lengthMm: 10 }), 'accept', true);
    exp('asme −16', ev('asme8', { T: 20 }, { ampDbVsRef: -16 }), 'not-recordable', false);
    exp('asme −6/6 crack', ev('asme8', { T: 20 }, { ampDbVsRef: -6, lengthMm: 6, type: 'crack' }), 'reject');
    exp('asme −14 = 20 %', ev('asme8', { T: 20 }, { ampDbVsRef: -14, lengthMm: 5 }), 'accept', true);
    exp('iso AL2 −12/8', ev('iso11666', { T: 20, level: 'AL2' }, { ampDbVsRef: -12, lengthMm: 8 }), 'not-recordable', false);
    exp('iso AL2 −6/8', ev('iso11666', { T: 20, level: 'AL2' }, { ampDbVsRef: -6, lengthMm: 8 }), 'accept', true);
    exp('iso AL2 +2/8', ev('iso11666', { T: 20, level: 'AL2' }, { ampDbVsRef: 2, lengthMm: 8 }), 'reject');
    exp('iso AL2 −8/15', ev('iso11666', { T: 20, level: 'AL2' }, { ampDbVsRef: -8, lengthMm: 15 }), 'reject');
    exp('iso AL2 −11/30', ev('iso11666', { T: 20, level: 'AL2' }, { ampDbVsRef: -11, lengthMm: 30 }), 'not-recordable');
    exp('iso AL2 −10/30', ev('iso11666', { T: 20, level: 'AL2' }, { ampDbVsRef: -10, lengthMm: 30 }), 'accept');
    exp('iso AL3 +3/15', ev('iso11666', { T: 20, level: 'AL3' }, { ampDbVsRef: 3, lengthMm: 15 }), 'accept');
    exp('iso AL3 −2/25', ev('iso11666', { T: 20, level: 'AL3' }, { ampDbVsRef: -2, lengthMm: 25 }), 'accept');
    exp('iso AL3 −1/25', ev('iso11666', { T: 20, level: 'AL3' }, { ampDbVsRef: -1, lengthMm: 25 }), 'reject');
    exp('iso AL3 0/25', ev('iso11666', { T: 20, level: 'AL3' }, { ampDbVsRef: 0, lengthMm: 25 }), 'reject');
    const isoShort = ev('iso11666', { T: 20, level: 'AL2' }, { ampDbVsRef: -6, lengthMm: 8 });
    if (isoShort.class !== 'short' || isoShort.pct !== 50 || !/short/.test(isoShort.ruleText) || !isoShort.ruleTextKo) f.push('iso class/pct/ruleText ' + JSON.stringify([isoShort.class, isoShort.pct]));
    // V2-16b (AWS)
    exp('aws +1/30/50', ev('awsd11', { T: 25, probeAngle: 70 }, { ampDbVsRef: 1, lengthMm: 30, soundPath: 50 }), 'reject');
    const awsA = ev('awsd11', { T: 25, probeAngle: 70 }, { ampDbVsRef: 1, lengthMm: 30, soundPath: 50 });
    if (awsA.numbers.c !== 2 || awsA.numbers.d !== -3 || awsA.class !== 'A') f.push('aws rating ' + JSON.stringify([awsA.numbers.c, awsA.numbers.d, awsA.class]));
    const awsC = ev('awsd11', { T: 25, probeAngle: 70 }, { ampDbVsRef: -6, lengthMm: 30, soundPath: 50 });
    exp('aws −6/30', awsC, 'accept'); if (awsC.class !== 'C' || awsC.numbers.d !== 4) f.push('aws class C ' + awsC.class + ' d ' + awsC.numbers.d);
    exp('aws −6/60', ev('awsd11', { T: 25, probeAngle: 70 }, { ampDbVsRef: -6, lengthMm: 60, soundPath: 50 }), 'reject');
    const awsD = ev('awsd11', { T: 25, probeAngle: 70 }, { ampDbVsRef: -9, lengthMm: 100, soundPath: 50 });
    exp('aws −9', awsD, 'accept'); if (awsD.class !== 'D' || awsD.numbers.d !== 7) f.push('aws class D ' + awsD.class);
    exp('aws 45° T15 band 0', ev('awsd11', { T: 15, probeAngle: 45 }, { ampDbVsRef: -6, lengthMm: 10, soundPath: 30 }), 'n/a');
    if (rules.awsd11.bandOf(20) !== 0) f.push('bandOf(20) ' + rules.awsd11.bandOf(20));
    exp('aws T7', ev('awsd11', { T: 7, probeAngle: 70 }, { ampDbVsRef: -6, lengthMm: 10, soundPath: 30 }), 'n/a');
    if (rules.awsd11.rating(1, 50) !== -3 || rules.awsd11.rating(-6, 25) !== 6) f.push('aws rating fn');
    // transfer correction: −12 dB with +4 transfer → −8 → recorded (ISO AL2)
    exp('iso transfer', evaluate({ ruleId: 'iso11666', T: 20, level: 'AL2', transferDb: 4, indication: { ampDbVsRef: -12, lengthMm: 8 } }), 'accept', true);
    // iso17640 delegates acceptance to 11666
    const i17 = ev('iso17640', { T: 20, level: 'AL2' }, { ampDbVsRef: -6, lengthMm: 8 });
    if (i17.disposition !== 'accept' || !/ISO 11666/.test(i17.ruleText)) f.push('iso17640 delegation ' + i17.disposition);
    // rulesOverride merge
    const ovr = evaluate({ ruleId: 'asme8', T: 20, transferDb: 0, rulesOverride: { asme8: { recordPct: 50 } }, indication: { ampDbVsRef: -10, lengthMm: 5 } });
    if (ovr.disposition !== 'not-recordable' || ruleSet('asme8', { asme8: { recordPct: 50 } }).recordPct !== 50 || ruleSet('asme8', { asme8: { recordPct: 50 } }).planarReject.length !== 3) f.push('rulesOverride merge');
    if (typeof ruleSet('iso11666', { iso11666: { levels: { AL2: { shortLimitDb: -6 } } } }).levels.AL2.shortMaxMm !== 'function') f.push('override keeps functions');
    if (Object.keys(lengthMethodNames).join(',') !== 'eval-level,6dB,50pct' || lengthMethodNames['6dB'].ko !== '6 dB 드롭법') f.push('lengthMethodNames');
    if (normaliseType('Lack of fusion') !== 'lof' || normaliseType('incompletePenetration') !== 'ip' || normaliseType('root') !== 'ip' || normaliseType('rootCrack') !== 'crack') f.push('type synonyms');
    // procedures / allowedProbes / applyProcedure on the live store (snapshot + restore)
    if (Object.keys(procedures).length !== 3 || procedureList().map(function (p) { return p.id; }).join(',') !== 'iso-B-plate20,asme-pipe-6in,aws-d11-70') f.push('procedures table');
    if (typeof procedures.toggle !== 'function' || JSON.stringify(Object.keys(procedures)).indexOf('toggle') >= 0) f.push('procedures window methods must be non-enumerable');
    if (allowedProbes({ standards: { procedure: null } }) !== null) f.push('allowedProbes null');
    const saved = { standards: UT.state.standards, weldOpts: UT.state.weldOpts, instrument: UT.state.instrument, specimen: UT.state.specimen, mode: UT.state.mode, probe: UT.state.probe, defects: UT.state.defects };
    try {
      if (!applyProcedure('iso-B-plate20')) f.push('applyProcedure returned false');
      const s = UT.state;
      if (s.standards.procedure !== 'iso-B-plate20' || s.standards.standard !== 'iso11666' || s.standards.level !== 'AL2' || s.standards.testingLevel !== 'B' || s.weldOpts.T !== 20 || s.instrument.refGain !== 34) f.push('applyProcedure state ' + JSON.stringify([s.standards.procedure, s.standards.standard, s.weldOpts.T]));
      const ap = allowedProbes();
      if (!ap || ap.join(',') !== 'mwb45-4,mwb60-4,mwb70-4,mb4s') f.push('allowedProbes ' + ap);
      if (applyProcedure('nope') !== false) f.push('applyProcedure unknown id');
      if (!applyProcedure(null) || UT.state.standards.procedure !== null || allowedProbes() !== null) f.push('applyProcedure(null)');
      // headless evaluation rows + lastEval
      evRows = []; evUi.reportKey = null;
      addRow({ ampDbVsRef: -6, length: 8, type: 'slag' });
      const le = evaluateAll();
      if (!le || le.rows.length !== 1 || !UT.state.standards.lastEval || UT.state.standards.lastEval.rows[0].result.disposition !== 'accept') f.push('evaluateAll/lastEval');
      evRows = []; evUi.reportKey = null;
    } catch (e) { f.push('exception ' + (e && e.message)); }
    finally {
      const patch = {};
      Object.keys(saved).forEach(function (k) { if (UT.state[k] !== saved[k]) patch[k] = saved[k]; });
      if (Object.keys(patch).length) UT.set(patch, { silent: true, noRender: true });
    }
    if (notes().length < 8 || !notes().some(function (n) { return /closed-form fits/.test(n); }) || !notes().some(function (n) { return /not security/.test(n); })) f.push('notes content');
    return f;
  }

  Object.assign(standards, {
    dgs, rules, ruleIds: RULE_IDS.slice(), ruleNames: RULE_NAMES, ruleSet, evaluate, normaliseType, indicationTypes: INDICATION_TYPES,
    lengthMethodNames, procedures, procedureList, applyProcedure, allowedProbes, notes,
    evaluation, proceduresWindow: proceduresWin, stdnotes, css, __selftest,
  });
  UT.standards = standards;

  // ------------------------------------------------------------------ test API (§7)
  Object.assign(UT.test, {
    /** dgs(): live {ref, echo, result}; dgs({record:'backwall'|'fbh', fbhMm}) records the gated echo; dgs({ref, echo, …}) = pure ers(). */
    dgs(args) {
      if (args && args.record) { recordReference(args.record, args.fbhMm); return dgsCurrent(); }
      if (args && (args.ref || args.echo)) return ers(args);
      return dgsCurrent();
    },
    evaluate(args) { return evaluate(args); },
    applyProcedure(id) { return applyProcedure(id); },
    rules() { const out = {}; RULE_IDS.forEach(function (id) { out[id] = ruleSet(id); }); return out; },
    allowedProbes() { return allowedProbes(); },
    standardsNotes() { return notes(); },
  });
})(window.UT = window.UT || {});
