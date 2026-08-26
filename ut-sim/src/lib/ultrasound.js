// Pure ultrasonic physics model - no React imports.
// Units: mm and microseconds (velocities in mm/us), amplitudes in %FSH.

import { defectBeamHits, foldDepth, legAtPath, toRad } from './geometry.js'

export const V_COMP = 5.92 // compression wave in steel, mm/us (5920 m/s)
export const V_SHEAR = 3.24 // shear wave in steel, mm/us (3240 m/s)

export const ATTEN_DB_PER_MM = { comp: 0.005, shear: 0.01 } // material attenuation
export const REF_GAIN_DB = 30 // gain at which a full reflector at s0 reads REF_AMP_PCT
export const REF_DISTANCE_MM = 50 // s0 - reference distance (near-field-ish)
export const REF_AMP_PCT = 80

export const RANGE_STEPS = [50, 100, 200, 250, 500]
export const GAIN_STEPS = [0.5, 2, 6]

export function waveForAngle(angleDeg) {
  return angleDeg === 0 ? 'comp' : 'shear'
}

export function velocityForAngle(angleDeg) {
  return angleDeg === 0 ? V_COMP : V_SHEAR
}

/** Simple distance-amplitude law: s0/s beyond the near field (in dB, <= 0). */
export function distanceLawDb(s) {
  const sEff = Math.max(s, REF_DISTANCE_MM)
  return 20 * Math.log10(REF_DISTANCE_MM / sEff)
}

export function attenuationDb(s, wave) {
  return -(ATTEN_DB_PER_MM[wave] ?? ATTEN_DB_PER_MM.shear) * Math.max(s, 0)
}

/** Echo amplitude in %FSH, clamped 0..110. extraDb is a positive penalty. */
export function echoAmplitudePct({ reflectivity, beamPath, gain, wave, extraDb = 0 }) {
  if (reflectivity <= 0 || beamPath <= 0) return 0
  const db =
    20 * Math.log10(reflectivity) +
    distanceLawDb(beamPath) +
    attenuationDb(beamPath, wave) -
    extraDb +
    (gain - REF_GAIN_DB)
  return Math.min(110, Math.max(0, REF_AMP_PCT * Math.pow(10, db / 20)))
}

/**
 * Orientation-dependent penalty (dB) for planar reflectors.
 * A planar defect reflects best when the beam hits it perpendicular
 * (tilt + probe angle = 90), except corner-type defects (root, toe)
 * which reflect well via the corner effect at any shear angle.
 */
export function orientationDb(defect, angleDeg) {
  if (!defect.planar) return 0
  if (defect.lamination) return angleDeg === 0 ? 0 : 14
  if (defect.corner) return angleDeg === 0 ? 18 : 2
  const misalign = Math.abs(90 - ((defect.tilt ?? 0) + angleDeg))
  return Math.min(18, 0.012 * misalign * misalign)
}

export function effectiveThickness(specimen, params = {}) {
  if (specimen.type === 'v1') {
    const face = params.face ?? specimen.defaultFace
    return specimen.faces[face].thickness
  }
  if (specimen.type === 'tky') return specimen.mainThickness
  return params.thickness ?? specimen.thickness
}

const PROBE_HALF_FOOT = 5 // mm - half footprint of the 0 deg probe

function laminationCoverage(defect, probeX) {
  const a0 = probeX - PROBE_HALF_FOOT
  const a1 = probeX + PROBE_HALF_FOOT
  const w = defect.size ?? 20
  const b0 = defect.x - w / 2
  const b1 = defect.x + w / 2
  const overlap = Math.min(a1, b1) - Math.max(a0, b0)
  return Math.max(0, Math.min(1, overlap / (2 * PROBE_HALF_FOOT)))
}

function activeFeatures(specimen, params) {
  const face = specimen.type === 'v1' ? (params.face ?? specimen.defaultFace) : null
  return (specimen.features ?? []).filter((f) => !f.face || f.face === face)
}

/** 0-degree compression probe: backwall multiples, laminations, cal features. */
function zeroDegreeEchoes({ specimen, params, defects, probeX }) {
  const t = effectiveThickness(specimen, params)
  const out = []
  if (specimen.type === 'v2') return out // curved block - no parallel backwall here

  let backwallFactor = 1

  for (const d of defects) {
    if (d.lamination) {
      const cov = laminationCoverage(d, probeX)
      if (cov <= 0) continue
      backwallFactor *= Math.max(0.03, 1 - 0.97 * cov)
      for (let n = 1; n <= 6; n++) {
        out.push({
          s: n * d.depth,
          reflectivity: (d.reflectivity ?? 0.85) * cov * Math.pow(0.7, n - 1),
          source: 'defect',
          defectId: d.id,
          label: n === 1 ? 'Lamination' : 'Lam x' + n,
        })
      }
    } else {
      const dx = Math.abs(d.x - probeX)
      if (dx > 8 || d.depth <= 0.5) continue
      out.push({
        s: d.depth,
        reflectivity: d.reflectivity ?? 0.5,
        extraDb: 6 * Math.pow(dx / 4, 2) + orientationDb(d, 0),
        source: 'defect',
        defectId: d.id,
        label: d.kind,
      })
    }
  }

  for (const f of activeFeatures(specimen, params)) {
    if (f.type === 'slot' && probeX >= f.x0 - 4 && probeX <= f.x1 + 4) {
      out.push({ s: f.thickness, reflectivity: 0.9, source: 'feature', label: 'Slot 91 mm' })
      backwallFactor *= 0.4
    }
    if (f.type === 'perspex' && probeX >= f.x0 && probeX <= f.x1) {
      out.push({ s: f.equiv, reflectivity: 0.55, source: 'feature', label: 'Perspex 50 mm eq.' })
      backwallFactor *= 0.6
    }
    if (f.type === 'sdh') {
      const dx = Math.abs(f.x - probeX)
      if (dx <= 6) {
        out.push({
          s: f.depth,
          reflectivity: 0.5,
          extraDb: 6 * Math.pow(dx / 3, 2),
          source: 'feature',
          label: 'SDH ' + f.depth + ' mm',
        })
      }
    }
  }

  for (let n = 1; n <= 8; n++) {
    out.push({
      s: n * t,
      reflectivity: backwallFactor * Math.pow(0.8, n - 1),
      source: 'backwall',
      label: n === 1 ? 'Backwall' : 'BW x' + n,
    })
  }
  return out
}

/** Angle shear probes: radius targets, SDH features and placed defects. */
function angleEchoes({ specimen, params, defects, probe, probeX, probeDir }) {
  const t = effectiveThickness(specimen, params)
  const out = []

  for (const f of activeFeatures(specimen, params)) {
    if (f.type === 'radius') {
      if (f.dir && f.dir !== probeDir) continue
      const dx = probeX - f.focusX
      const spreadDb = Math.min(30, 6 * Math.pow(dx / 2.5, 2))
      const repeat = f.repeat ?? f.radius
      for (let k = 0; k < 3; k++) {
        out.push({
          s: f.radius + k * repeat,
          reflectivity: 0.95 * Math.pow(0.55, k),
          extraDb: spreadDb,
          source: 'radius',
          label: k === 0 ? 'R' + f.radius : 'R' + f.radius + ' rpt ' + k,
        })
      }
    }
    if (f.type === 'sdh') {
      const hits = defectBeamHits({
        probeX,
        dir: probeDir,
        angleDeg: probe.angle,
        thickness: t,
        defect: { x: f.x, depth: f.depth, size: f.size ?? 2 },
        halfAngleDeg: probe.halfAngleDeg ?? 5,
      })
      for (const h of hits) {
        out.push({
          s: h.s,
          reflectivity: 0.5,
          extraDb: h.spreadDb,
          source: 'feature',
          label: 'SDH leg ' + h.leg,
          leg: h.leg,
        })
      }
    }
  }

  for (const d of defects) {
    const oDb = orientationDb(d, probe.angle)
    const hits = defectBeamHits({
      probeX,
      dir: probeDir,
      angleDeg: probe.angle,
      thickness: t,
      defect: d,
      halfAngleDeg: probe.halfAngleDeg ?? 5,
    })
    for (const h of hits) {
      out.push({
        s: h.s,
        reflectivity: d.reflectivity ?? 0.5,
        extraDb: h.spreadDb + oDb,
        source: 'defect',
        defectId: d.id,
        label: d.kind + ' leg ' + h.leg,
        leg: h.leg,
      })
    }
  }
  return out
}

/**
 * Central echo derivation. Returns echoes sorted by apparent beam path:
 * { id, s, apparent, amp, source, label, defectId?, leg? }
 * apparent = true beam path + zero error (wedge delay minus the user's
 * probe-zero setting) - a mis-set zero shifts every reading.
 */
export function computeEchoes({ specimen, specimenParams, defects, probe, probeX, probeDir, settings }) {
  const args = { specimen, params: specimenParams, defects, probe, probeX, probeDir }
  const raw = probe.angle === 0 ? zeroDegreeEchoes(args) : angleEchoes(args)
  const wave = waveForAngle(probe.angle)
  const zeroError = (probe.wedgeDelayMm ?? 0) - settings.probeZero
  const echoes = []
  raw.forEach((r, i) => {
    const amp = echoAmplitudePct({
      reflectivity: r.reflectivity,
      beamPath: r.s,
      gain: settings.gain,
      wave,
      extraDb: r.extraDb ?? 0,
    })
    if (amp < 0.5) return
    if (settings.reject > 0 && amp < settings.reject) return
    echoes.push({ id: i, ...r, amp, apparent: r.s + zeroError })
  })
  echoes.sort((a, b) => a.apparent - b.apparent)
  return echoes
}

/** Linear interpolation on the recorded DAC curve (flat extrapolation). */
export function dacAmpAt(dacPoints, s) {
  if (!dacPoints.length) return null
  const pts = [...dacPoints].sort((a, b) => a.s - b.s)
  if (s <= pts[0].s) return pts[0].amp
  if (s >= pts[pts.length - 1].s) return pts[pts.length - 1].amp
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    if (s >= a.s && s <= b.s) {
      const f = (s - a.s) / Math.max(1e-6, b.s - a.s)
      return a.amp + f * (b.amp - a.amp)
    }
  }
  return pts[pts.length - 1].amp
}

/**
 * Live readouts derived from the highest (gated) echo, using APPARENT beam
 * path - so a wrongly-set probe zero produces wrong readings, as it should.
 */
export function deriveReadout({ echoes, gate, dacPoints, probe, thickness }) {
  const pool = gate.on
    ? echoes.filter((e) => e.apparent >= gate.start && e.apparent <= gate.start + gate.width)
    : echoes
  let peak = null
  for (const e of pool) if (!peak || e.amp > peak.amp) peak = e
  if (!peak) return { peak: null }
  const s = peak.apparent
  const th = toRad(probe.angle)
  const surfaceDist = probe.angle === 0 ? 0 : s * Math.sin(th)
  const depth = probe.angle === 0 ? s : foldDepth(s * Math.cos(th), thickness)
  const leg = probe.angle === 0 ? 1 : legAtPath(s, probe.angle, thickness)
  const dacRef = dacPoints.length >= 2 ? dacAmpAt(dacPoints, s) : null
  const dbToDac =
    dacRef != null && dacRef > 0.5 && peak.amp > 0
      ? 20 * Math.log10(peak.amp / dacRef)
      : null
  return { peak, s, surfaceDist, depth, leg, amp: peak.amp, dbToDac }
}
