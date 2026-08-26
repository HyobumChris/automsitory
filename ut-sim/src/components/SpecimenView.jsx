import { useRef } from 'react'
import { beamPolyline, sampleArc, toRad } from '../lib/geometry.js'
import { activeFeatures } from '../lib/ultrasound.js'
import { effectiveLength, weldCenterOf } from '../data/specimens.js'

const BODY = 'url(#steelGrad)'
const BODY_BACK = '#b7bdc4'
const OUTLINE = '#2b3138'
const RED = '#e5484d'
const BLUE = '#0e9fbf'
const RULER = '#5c646c'
const WORKSPACE = '#e8eaed'

function pts2str(pts) {
  return pts.map(([x, y]) => x.toFixed(2) + ',' + y.toFixed(2)).join(' ')
}

function profilePoints(specimen, params, thickness, length) {
  switch (specimen.type) {
    case 'v1': {
      if ((params.face ?? specimen.defaultFace) === 'edge') {
        return [[0, 0], [length, 0], [length, thickness], [0, thickness]]
      }
      const arc = sampleArc(100, 0, 100, 180, 90, 28)
      return [[length, 0], [0, 0], ...arc.slice(1), [length, 100]]
    }
    case 'v2': {
      if ((params.face ?? specimen.defaultFace) === 'through') {
        return [[25, 0], [100, 0], [100, 12.5], [25, 12.5]]
      }
      const f = specimen.focusX
      const a25 = sampleArc(f, 0, 25, 180, 90, 20)
      const a50 = sampleArc(f, 0, 50, 90, 0, 24)
      return [...a25, [f, 50], ...a50.slice(1)]
    }
    default:
      return [[0, 0], [length, 0], [length, thickness], [0, thickness]]
  }
}

function DefectShape({ defect, selected, onSelect }) {
  const { x, depth, size = 4, tilt = 0, kind } = defect
  const common = {
    onPointerDown: (e) => {
      e.stopPropagation()
      onSelect(defect.id)
    },
    style: { cursor: 'pointer' },
  }
  const sel = selected ? (
    <circle cx={x} cy={depth} r={Math.max(size * 0.75, 3)} fill="none" stroke={BLUE} strokeWidth={0.4} strokeDasharray="1.5 1" />
  ) : null
  if (kind === 'porosity') {
    const r = Math.max(size / 6, 0.7)
    const offs = [[-size / 3, -size / 4], [size / 4, -size / 6], [-size / 6, size / 4], [size / 3, size / 5], [0, 0]]
    return (
      <g {...common}>
        {offs.map(([dx, dy], i) => (
          <circle key={i} cx={x + dx} cy={depth + dy} r={r} fill={RED} />
        ))}
        {sel}
      </g>
    )
  }
  if (kind === 'sdh') {
    return (
      <g {...common}>
        <circle cx={x} cy={depth} r={Math.max(size / 2, 1)} fill={RED} stroke="#2b3138" strokeWidth={0.2} />
        {sel}
      </g>
    )
  }
  if (kind === 'slag') {
    return (
      <g {...common}>
        <ellipse cx={x} cy={depth} rx={size / 2} ry={size / 4} fill={RED} />
        {sel}
      </g>
    )
  }
  const hx = (size / 2) * Math.sin(toRad(tilt))
  const hy = (size / 2) * Math.cos(toRad(tilt))
  return (
    <g {...common}>
      <line x1={x - hx} y1={depth - hy} x2={x + hx} y2={depth + hy} stroke={RED} strokeWidth={1.6} strokeLinecap="round" />
      {sel}
    </g>
  )
}

function ProbeWedge({ x, dir, angle, tofdLabel }) {
  if (angle === 0 && !tofdLabel) {
    return (
      <g>
        <polygon points={pts2str([[x - 7, -16], [x + 7, -16], [x + 7, 0], [x - 7, 0]])} fill="url(#probeGrad)" stroke={OUTLINE} strokeWidth={0.4} />
        <line x1={x - 6} y1={-15} x2={x + 6} y2={-15} stroke="#ffffff" strokeOpacity={0.45} strokeWidth={0.7} />
        <circle cx={x} cy={0} r={1.1} fill="#fff" stroke={OUTLINE} strokeWidth={0.4} />
      </g>
    )
  }
  const heel = x - dir * 14
  const pts = [[heel, 0], [heel, -13], [x + dir * 3, -13], [x + dir * 7, -5], [x + dir * 7, 0]]
  return (
    <g>
      <polygon points={pts2str(pts)} fill="url(#probeGrad)" stroke={OUTLINE} strokeWidth={0.4} />
      <line x1={heel + dir * 1} y1={-12.2} x2={x + dir * 2} y2={-12.2} stroke="#ffffff" strokeOpacity={0.45} strokeWidth={0.7} />
      <circle cx={x} cy={0} r={1.1} fill="#fff" stroke={OUTLINE} strokeWidth={0.4} />
      {tofdLabel && (
        <text x={heel + dir * 5} y={-15} fontSize={5} fontWeight="700" textAnchor="middle" fill="#1c2126">
          {tofdLabel}
        </text>
      )}
    </g>
  )
}

export default function SpecimenView({
  specimen,
  specimenParams,
  thickness,
  defects,
  selectedDefectId,
  probe,
  probeX,
  probeDir,
  settings,
  beamMarkers,
  hideDefects,
  showBeamFan,
  tofdMode,
  tofdS,
  dispatch,
}) {
  const svgRef = useRef(null)
  const dragging = useRef(false)

  const params = specimenParams
  const L = effectiveLength(specimen, params)
  const profile = profilePoints(specimen, params, thickness, L)
  const profileHeight = Math.max(...profile.map(([, y]) => y))
  const isTky = specimen.type === 'tky'
  const isPipe = specimen.type === 'pipe'
  const isBlock = specimen.type === 'v1' || specimen.type === 'v2' || specimen.type === 'asme'
  const v1Side = specimen.type === 'v1' && (params.face ?? specimen.defaultFace) === 'side'
  const v2Profile = specimen.type === 'v2' && (params.face ?? specimen.defaultFace) === 'profile'
  const braceScan = isTky && (params.scanSurface ?? 'main') === 'brace'

  const topPad = isTky ? 88 : 52
  const botPad = 16
  const vb = '-34 ' + -topPad + ' ' + (L + 70) + ' ' + (profileHeight + topPad + botPad)
  const fs = Math.max(Math.min(L * 0.022, (profileHeight + topPad + botPad) * 0.1), 4.5)

  const cx = weldCenterOf(specimen, params)

  /* --- TKY brace scan-surface transform (local flat coords -> world) --- */
  const beta = toRad(params.braceAngle ?? specimen.braceAngle ?? 45)
  const braceU = [Math.cos(beta), -Math.sin(beta)] // up along the brace face
  const braceN = [Math.sin(beta), Math.cos(beta)] // into the brace material
  const bx0 = specimen.braceX ?? 0
  const braceMatrix =
    'matrix(' + braceU[0] + ' ' + braceU[1] + ' ' + braceN[0] + ' ' + braceN[1] + ' ' + bx0 * (1 - braceU[0]) + ' ' + -braceU[1] * bx0 + ')'

  /* --- beam geometry (in scan-surface local coordinates) --- */
  const radiusFeature = activeFeatures(specimen, params).find(
    (f) => f.type === 'radius' && (!f.dir || f.dir === probeDir),
  )
  const aimedAtRadius = !tofdMode && probe.angle > 0 && radiusFeature && Math.abs(probeX - radiusFeature.focusX) <= 15

  const maxPath = Math.min(settings.range + Math.max(settings.xShift, 0), thickness * 8 + 40)
  let beamPts = null
  let fanA = null
  let fanB = null
  if (!tofdMode) {
    if (aimedAtRadius) {
      const mk = (a) => [
        [probeX, 0],
        [probeX + probeDir * radiusFeature.radius * Math.sin(toRad(a)), radiusFeature.radius * Math.cos(toRad(a))],
      ]
      beamPts = mk(probe.angle)
      fanA = mk(probe.angle - (probe.halfAngleDeg ?? 5))
      fanB = mk(probe.angle + (probe.halfAngleDeg ?? 5))
    } else if (probe.angle === 0) {
      beamPts = [[probeX, 0], [probeX, thickness]]
      const w = thickness * Math.tan(toRad(probe.halfAngleDeg ?? 4))
      fanA = [[probeX - 3, 0], [probeX - 3 - w, thickness]]
      fanB = [[probeX + 3, 0], [probeX + 3 + w, thickness]]
    } else {
      const mk = (a) => beamPolyline({ probeX, dir: probeDir, angleDeg: a, thickness, maxPath })
      beamPts = mk(probe.angle)
      fanA = mk(probe.angle - (probe.halfAngleDeg ?? 5))
      fanB = mk(probe.angle + (probe.halfAngleDeg ?? 5))
    }
  }

  /* --- drag (projected onto the active scan surface) --- */
  const svgX = (e) => {
    const svg = svgRef.current
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const p = pt.matrixTransform(svg.getScreenCTM().inverse())
    if (braceScan) return bx0 + (p.x - bx0) * braceU[0] + p.y * braceU[1]
    return p.x
  }
  const onPointerDown = (e) => {
    dragging.current = true
    svgRef.current.setPointerCapture(e.pointerId)
    dispatch({ type: 'SET_PROBE_X', x: svgX(e) })
  }
  const onPointerMove = (e) => {
    if (!dragging.current) return
    dispatch({ type: 'SET_PROBE_X', x: svgX(e) })
  }
  const onPointerUp = () => {
    dragging.current = false
  }

  /* --- rulers --- */
  const rulers = []
  const nStep = profileHeight <= 15 ? 5 : profileHeight <= 60 ? 10 : 25
  for (let d = 0; d <= profileHeight; d += 5) {
    const major = d % nStep === 0
    rulers.push(<line key={'l' + d} x1={-6} y1={d} x2={major ? -11 : -9} y2={d} stroke={RULER} strokeWidth={0.25} />)
    rulers.push(<line key={'r' + d} x1={L + 6} y1={d} x2={L + (major ? 11 : 9)} y2={d} stroke={RULER} strokeWidth={0.25} />)
    if (major) {
      rulers.push(
        <text key={'ln' + d} x={-13} y={d + fs * 0.35} fontSize={fs * 0.75} textAnchor="end" fill={RULER}>{d}</text>,
        <text key={'rn' + d} x={L + 13} y={d + fs * 0.35} fontSize={fs * 0.75} fill={RULER}>{d}</text>,
      )
    }
  }
  const scaleY = -30
  const scale = []
  if (isPipe) {
    // absolute circumferential scale: 0 .. pi*OD
    scale.push(<line key="base" x1={0} y1={scaleY} x2={L} y2={scaleY} stroke={RULER} strokeWidth={0.35} />)
    for (let v = 0; v <= L; v += 20) {
      const major = v % 100 === 0
      scale.push(<line key={'t' + v} x1={v} y1={scaleY} x2={v} y2={scaleY - (major ? 4 : 2.5)} stroke={RULER} strokeWidth={0.25} />)
      if (major) {
        scale.push(
          <text key={'n' + v} x={v} y={scaleY - 6} fontSize={fs * 0.72} textAnchor="middle" fill={RULER}>{v}</text>,
        )
      }
    }
    scale.push(
      <text key="cap" x={L} y={scaleY - 14} fontSize={fs * 0.8} textAnchor="end" fill={RULER}>
        circumference C = πD = {L} mm
      </text>,
    )
  } else {
    const maxHalf = Math.max(20, Math.min(100, Math.floor(Math.min(cx, L - cx) / 10) * 10))
    scale.push(<line key="base" x1={cx - maxHalf} y1={scaleY} x2={cx + maxHalf} y2={scaleY} stroke={RULER} strokeWidth={0.35} />)
    for (let v = -maxHalf; v <= maxHalf; v += 5) {
      const x = cx + v
      if (x < 0 || x > L) continue
      const major = v % 10 === 0
      scale.push(<line key={'t' + v} x1={x} y1={scaleY} x2={x} y2={scaleY - (major ? 4 : 2.5)} stroke={RULER} strokeWidth={0.25} />)
      if (major) {
        scale.push(
          <text key={'n' + v} x={x} y={scaleY - 6} fontSize={fs * 0.72} textAnchor="middle" fill={RULER}>
            {Math.abs(v)}
          </text>,
        )
      }
    }
  }

  /* --- weld / brace overlays --- */
  let weld = null
  if (specimen.type === 'weld' || isPipe) {
    const ho = thickness * Math.tan(toRad(specimen.prepHalfAngleDeg)) + 1.5
    weld = { wx: cx, ho }
  }
  let brace = null
  if (isTky) {
    const bt = specimen.braceThickness
    const bl = 74
    const x1 = bx0 + bt / Math.sin(beta)
    brace = {
      poly: [[bx0, 0], [bx0 + bl * braceU[0], bl * braceU[1]], [x1 + bl * braceU[0], bl * braceU[1]], [x1, 0]],
      x0: bx0,
      x1,
    }
  }

  /* --- plan view pointer --- */
  const planA = (probeDir > 0 ? 0 : Math.PI) + ((probeX - cx) / Math.max(L, 1)) * (Math.PI / 3) * (probeDir > 0 ? 1 : -1)

  const contextTitle = isBlock ? 'Carbon Steel Block' : specimen.name

  const probeAndBeam = (
    <>
      {!tofdMode && showBeamFan && fanA && (
        <g stroke="#0e9fbf" strokeOpacity={0.35} strokeWidth={0.5} strokeDasharray="1.6 1.6" fill="none">
          <polyline points={pts2str(fanA)} />
          <polyline points={pts2str(fanB)} />
        </g>
      )}
      {!tofdMode && beamPts && <polyline points={pts2str(beamPts)} fill="none" stroke={BLUE} strokeWidth={0.8} />}
      {tofdMode ? (
        <g style={{ cursor: 'ew-resize' }}>
          <ProbeWedge x={probeX - tofdS} dir={1} angle={60} tofdLabel="Tx" />
          <ProbeWedge x={probeX + tofdS} dir={-1} angle={60} tofdLabel="Rx" />
        </g>
      ) : (
        <g style={{ cursor: 'ew-resize' }}>
          <ProbeWedge x={probeX} dir={probeDir} angle={probe.angle} />
          <text x={probeX} y={-19} fontSize={fs * 0.9} fontWeight="700" fill="#1c2126" textAnchor="middle">
            {probe.angle}°{braceScan ? ' brace' : ''}
          </text>
        </g>
      )}
    </>
  )

  return (
    <div className="relative h-full w-full" style={{ background: WORKSPACE }}>
      <svg
        ref={svgRef}
        viewBox={vb}
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full touch-none select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <defs>
          <linearGradient id="steelGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#9aa3ab" />
            <stop offset="1" stopColor="#7d868e" />
          </linearGradient>
          <linearGradient id="probeGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3db273" />
            <stop offset="0.25" stopColor="#2f9e5f" />
            <stop offset="1" stopColor="#227a49" />
          </linearGradient>
          <pattern id="weldHatch" width="4" height="4" patternUnits="userSpaceOnUse">
            <path d="M0,4 L4,0" stroke="#5c646c" strokeWidth="0.5" />
          </pattern>
          <pattern id="probeHatch" width="3" height="3" patternUnits="userSpaceOnUse">
            <rect width="3" height="3" fill="#2f9e5f" />
            <path d="M0,3 L3,0 M0,0 L3,3" stroke="#227a49" strokeWidth="0.35" />
          </pattern>
        </defs>

        <text x={-28} y={-topPad + 10} fontSize={fs * 1.25} fontWeight="600" fill="#1c2126">
          {contextTitle} — {specimen.nameKo}
          {isPipe ? ' (' + (params.odIn ?? specimen.odIn) + '" OD, WT ' + thickness + 'mm, unrolled)' : ''}
        </text>

        {isBlock && (
          <polygon points={pts2str(profile)} transform="translate(8,-6)" fill={BODY_BACK} stroke={OUTLINE} strokeWidth={0.4} />
        )}
        <polygon points={pts2str(profile)} fill={BODY} stroke={OUTLINE} strokeWidth={0.7} />

        {rulers}
        {scale}

        {/* V1 features */}
        {v1Side && (
          <g>
            <text x={200} y={62} fontSize={fs * 3.2} fontWeight="700" fill="#1c2126" textAnchor="middle">V1</text>
            {(specimen.features ?? []).map((f, i) => {
              if (f.type === 'slot') {
                return (
                  <g key={i}>
                    <rect x={f.x0} y={f.thickness} width={f.x1 - f.x0} height={100 - f.thickness} fill={WORKSPACE} stroke="#2b3138" strokeWidth={0.4} />
                    <text x={(f.x0 + f.x1) / 2} y={f.thickness - 3} fontSize={fs * 0.8} fill="#1c2126" textAnchor="middle">91</text>
                  </g>
                )
              }
              if (f.type === 'perspex') {
                const pcx = (f.x0 + f.x1) / 2
                return (
                  <g key={i}>
                    <circle cx={pcx} cy={76} r={15} fill="#dfe3e8" stroke={OUTLINE} strokeWidth={0.5} />
                    <text x={pcx} y={78} fontSize={fs * 0.75} fill="#1c2126" textAnchor="middle">perspex</text>
                  </g>
                )
              }
              if (f.type === 'sdh') {
                return (
                  <g key={i}>
                    <circle cx={f.x} cy={f.depth} r={Math.max(f.size / 2, 1.2)} fill="#fff" stroke="#2b3138" strokeWidth={0.4} />
                    <text x={f.x + 5} y={f.depth + 2} fontSize={fs * 0.75} fill="#1c2126">SDH</text>
                  </g>
                )
              }
              return null
            })}
            <text x={100} y={-10} fontSize={fs * 0.85} fill="#1c2126" textAnchor="middle">focus ▼ R100</text>
          </g>
        )}
        {v2Profile && (
          <g>
            <text x={72} y={26} fontSize={fs * 2.4} fontWeight="700" fill="#1c2126" textAnchor="middle">V2</text>
            <circle cx={specimen.focusX} cy={12} r={2.5} fill="#fff" stroke="#2b3138" strokeWidth={0.4} />
          </g>
        )}
        {specimen.type === 'v2' && !v2Profile && (
          <text x={62} y={9} fontSize={fs * 1.4} fontWeight="700" fill="#1c2126" textAnchor="middle">V2 — 12.5 mm</text>
        )}

        {/* ASME basic block SDHs at T/4, T/2, 3T/4 */}
        {specimen.type === 'asme' && (
          <g>
            <text x={70} y={thickness * 0.62} fontSize={fs * 2.2} fontWeight="700" fill="#1c2126" textAnchor="middle">ASME</text>
            {activeFeatures(specimen, params).map((f, i) => (
              <g key={i}>
                <circle cx={f.x} cy={f.depth} r={Math.max(f.size / 2, 1.2)} fill="#fff" stroke="#2b3138" strokeWidth={0.4} />
                <text x={f.x + 6} y={f.depth + 2} fontSize={fs * 0.8} fill="#1c2126">
                  {f.label} = {f.depth.toFixed(1)}
                </text>
              </g>
            ))}
          </g>
        )}

        {/* weld overlay (butt weld + pipe circumferential weld) */}
        {weld && (
          <g>
            <polygon
              points={pts2str([[weld.wx - weld.ho, 0], [weld.wx + weld.ho, 0], [weld.wx + 1.5, thickness], [weld.wx - 1.5, thickness]])}
              fill="url(#weldHatch)"
              stroke="#5c646c"
              strokeWidth={0.4}
            />
            <path
              d={'M ' + (weld.wx - weld.ho - 2) + ' 0 Q ' + weld.wx + ' ' + -(thickness * 0.18) + ' ' + (weld.wx + weld.ho + 2) + ' 0'}
              fill="none"
              stroke="#5c646c"
              strokeWidth={0.5}
            />
            <path
              d={'M ' + (weld.wx - 3) + ' ' + thickness + ' Q ' + weld.wx + ' ' + (thickness + thickness * 0.09) + ' ' + (weld.wx + 3) + ' ' + thickness}
              fill="none"
              stroke="#5c646c"
              strokeWidth={0.5}
            />
          </g>
        )}

        {/* TKY brace */}
        {brace && (
          <g>
            <polygon points={pts2str(brace.poly)} fill={BODY} stroke={OUTLINE} strokeWidth={0.7} />
            <polygon points={pts2str([[brace.x0 - 4, 0], [brace.x0, 0], [brace.x0, -4]])} fill="url(#weldHatch)" stroke="#5c646c" strokeWidth={0.3} />
            <polygon points={pts2str([[brace.x1, 0], [brace.x1 + 4, 0], [brace.x1, -4]])} fill="url(#weldHatch)" stroke="#5c646c" strokeWidth={0.3} />
            <text x={brace.x0 - 6} y={-34} fontSize={fs} fill="#1c2126" textAnchor="end">
              brace {params.braceAngle ?? specimen.braceAngle}° t={specimen.braceThickness}mm
            </text>
          </g>
        )}

        {/* TOFD: lateral wave, backwall V-path, tip paths */}
        {tofdMode && (
          <g>
            <line x1={probeX - tofdS} y1={0.8} x2={probeX + tofdS} y2={0.8} stroke="#fff" strokeWidth={0.6} strokeDasharray="1.5 1.5" />
            <polyline
              points={pts2str([[probeX - tofdS, 0], [probeX, thickness], [probeX + tofdS, 0]])}
              fill="none"
              stroke={BLUE}
              strokeWidth={0.8}
            />
            {defects.map((d) => (
              <polyline
                key={d.id}
                points={pts2str([[probeX - tofdS, 0], [d.x, Math.max(0.5, d.depth - (d.size ?? 4) / 2)], [probeX + tofdS, 0]])}
                fill="none"
                stroke="#5c646c"
                strokeWidth={0.5}
                strokeDasharray="2 1.2"
              />
            ))}
          </g>
        )}

        {/* defects */}
        {!hideDefects &&
          defects.map((d) => (
            <DefectShape key={d.id} defect={d} selected={d.id === selectedDefectId} onSelect={(id) => dispatch({ type: 'SELECT_DEFECT', id })} />
          ))}

        {/* beam-spread sizing markers */}
        {beamMarkers.map((m, i) => (
          <g key={i} stroke="#3fb27f" strokeWidth={0.7}>
            <line x1={m.x - 2} y1={m.depth - 2} x2={m.x + 2} y2={m.depth + 2} />
            <line x1={m.x - 2} y1={m.depth + 2} x2={m.x + 2} y2={m.depth - 2} />
            <line x1={m.probeX} y1={-4} x2={m.probeX} y2={0} strokeWidth={1.2} />
          </g>
        ))}

        {/* probe + beam, on the main surface or rotated onto the brace face */}
        {braceScan ? <g transform={braceMatrix}>{probeAndBeam}</g> : probeAndBeam}
      </svg>

      {/* PLAN VIEW (top-right) */}
      <div className="pointer-events-none absolute right-2 top-1 flex flex-col items-center gap-0.5">
        <span className="text-[9px] font-medium uppercase tracking-[0.06em] text-muted">Plan view</span>
        <svg width="66" height="66">
          <circle cx={33} cy={33} r={25} fill="#f5f6f8" stroke="#c9ced4" strokeWidth={1} />
          <circle cx={33} cy={33} r={21} fill="none" stroke="#0e9fbf" strokeOpacity={0.25} strokeWidth={1} />
          <line x1={33} y1={33} x2={33 + 21 * Math.cos(planA)} y2={33 + 21 * Math.sin(planA)} stroke="#0e9fbf" strokeWidth={1.6} strokeLinecap="round" />
          <circle cx={33 + 21 * Math.cos(planA)} cy={33 + 21 * Math.sin(planA)} r={2.2} fill="#0e9fbf" />
          <circle cx={33} cy={33} r={1.6} fill="#5c646c" />
        </svg>
      </div>
    </div>
  )
}
