// Beam path / skip-leg geometry helpers. Pure functions, no React.
// Coordinate convention: x along the scanning surface (mm), depth positive
// downwards from the scanning surface (mm). Probe angle measured from the
// surface normal (0 deg = straight down).

export function toRad(deg) {
  return (deg * Math.PI) / 180
}

export function toDeg(rad) {
  return (rad * 180) / Math.PI
}

/**
 * Unfolded (mirror-image) depth of a reflector for a given leg (1-based).
 * Leg 1 travels down, leg 2 is mirrored off the backwall, leg 3 off the
 * scanning surface again, and so on.
 */
export function unfoldDepth(depth, thickness, leg) {
  return leg % 2 === 1 ? (leg - 1) * thickness + depth : leg * thickness - depth
}

/** Fold an unfolded (raw) depth back into the section: 0..thickness. */
export function foldDepth(rawDepth, thickness) {
  if (thickness <= 0) return rawDepth
  const period = 2 * thickness
  let r = rawDepth % period
  if (r < 0) r += period
  return r <= thickness ? r : period - r
}

/** Which leg (1st, 2nd, ...) a given beam path length falls in. */
export function legAtPath(s, angleDeg, thickness) {
  if (angleDeg === 0 || thickness <= 0) return 1
  const rawDepth = s * Math.cos(toRad(angleDeg))
  return Math.max(1, Math.min(9, Math.floor(rawDepth / thickness) + 1))
}

/**
 * Test whether an angle-beam centreline (with beam spread) intersects a
 * defect at (defect.x, defect.depth) within the first `maxLegs` legs.
 * dir is +1 (beam fires towards +x) or -1.
 *
 * Returns an array of hits: { leg, s, spreadDb, depth, surfaceDist }.
 * spreadDb is the gaussian-ish amplitude penalty (dB) for the angular
 * offset between the centreline and the defect (-6 dB at the half-angle).
 */
export function defectBeamHits({
  probeX,
  dir,
  angleDeg,
  thickness,
  defect,
  halfAngleDeg = 5,
  maxLegs = 2,
}) {
  const hits = []
  if (angleDeg === 0) {
    const dx = defect.x - probeX
    const s = defect.depth
    if (s <= 0.5) return hits
    const offsetDeg = toDeg(Math.atan2(Math.abs(dx), Math.max(s, 1)))
    if (offsetDeg > halfAngleDeg * 3) return hits
    hits.push({
      leg: 1,
      s,
      spreadDb: 6 * (offsetDeg / halfAngleDeg) ** 2,
      depth: defect.depth,
      surfaceDist: 0,
    })
    return hits
  }
  const th = toRad(angleDeg)
  const sinT = Math.sin(th)
  const cosT = Math.cos(th)
  for (let leg = 1; leg <= maxLegs; leg++) {
    const D = unfoldDepth(defect.depth, thickness, leg)
    const vx = (defect.x - probeX) * dir // forward distance along the surface
    const s = vx * sinT + D * cosT // beam path to closest approach
    if (s <= 1) continue
    const miss = Math.abs(vx * cosT - D * sinT) // perpendicular miss distance
    const missEff = Math.max(0, miss - (defect.size ?? 2) / 2)
    const offsetDeg = toDeg(Math.atan2(missEff, s))
    if (offsetDeg > halfAngleDeg * 3) continue
    hits.push({
      leg,
      s,
      spreadDb: 6 * (offsetDeg / halfAngleDeg) ** 2,
      depth: foldDepth(s * cosT, thickness),
      surfaceDist: s * sinT,
    })
  }
  return hits
}

/**
 * Folded beam centreline polyline for drawing in the cross-section view.
 * Returns an array of [x, depth] points starting at the probe index point.
 */
export function beamPolyline({ probeX, dir, angleDeg, thickness, maxPath, maxLegs = 3 }) {
  if (angleDeg === 0) {
    return [
      [probeX, 0],
      [probeX, Math.min(thickness, Math.max(maxPath, 1))],
    ]
  }
  const th = toRad(angleDeg)
  const pts = [[probeX, 0]]
  let x = probeX
  let y = 0
  let goingDown = true
  let remaining = Math.max(maxPath, 1)
  let legs = 0
  while (remaining > 0.5 && legs < maxLegs) {
    const distToSurface = goingDown ? thickness - y : y
    const legLen = distToSurface / Math.cos(th)
    const seg = Math.min(legLen, remaining)
    const ny = y + (goingDown ? 1 : -1) * seg * Math.cos(th)
    const nx = x + dir * seg * Math.sin(th)
    pts.push([nx, ny])
    x = nx
    y = ny
    remaining -= seg
    if (seg >= legLen - 1e-9) {
      goingDown = !goingDown
      legs += 1
    } else {
      break
    }
  }
  return pts
}

/**
 * Probe index position that puts the beam centreline exactly on a target
 * (x, depth) for a given leg. Useful for beam-spread sizing exercises.
 */
export function probeXForTarget({ x, depth }, angleDeg, thickness, dir, leg = 1) {
  const th = toRad(angleDeg)
  const D = unfoldDepth(depth, thickness, leg)
  return x - dir * D * Math.tan(th)
}

/** Sample an arc (circle centred cx,cy radius r) from angle a0 to a1 degrees. */
export function sampleArc(cx, cy, r, a0Deg, a1Deg, n = 24) {
  const pts = []
  for (let i = 0; i <= n; i++) {
    const a = toRad(a0Deg + ((a1Deg - a0Deg) * i) / n)
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
  }
  return pts
}
