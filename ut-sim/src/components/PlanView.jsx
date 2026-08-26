import { useRef } from 'react'
import { toRad } from '../lib/geometry.js'
import { effectiveLength, weldCenterOf } from '../data/specimens.js'

const RULER = '#5c646c'
const RED = '#e5484d'
const OUTLINE = '#2b3138'
const ACCENT = '#0e9fbf'

function PlanDefect({ defect, selected, onSelect, py }) {
  const { x, size = 4, kind } = defect
  const common = {
    onPointerDown: (e) => {
      e.stopPropagation()
      onSelect(defect.id)
    },
    style: { cursor: 'pointer' },
  }
  const sel = selected ? (
    <circle cx={x} cy={py} r={Math.max(size * 0.75, 4)} fill="none" stroke={ACCENT} strokeWidth={0.5} strokeDasharray="1.5 1" />
  ) : null
  if (kind === 'porosity') {
    const offs = [[-1.5, -size / 3], [1.2, -size / 6], [-0.8, size / 4], [1.5, size / 3], [0, 0]]
    return (
      <g {...common}>
        {offs.map(([dx, dy], i) => (
          <circle key={i} cx={x + dx} cy={py + dy} r={Math.max(size / 6, 0.7)} fill={RED} />
        ))}
        {sel}
      </g>
    )
  }
  if (kind === 'sdh') {
    return (
      <g {...common}>
        <circle cx={x} cy={py} r={Math.max(size / 2, 1)} fill={RED} stroke={OUTLINE} strokeWidth={0.2} />
        {sel}
      </g>
    )
  }
  if (kind === 'lamination') {
    return (
      <g {...common}>
        <ellipse cx={x} cy={py} rx={size / 2} ry={size / 3.2} fill={RED} fillOpacity={0.6} stroke={RED} strokeWidth={0.6} />
        {sel}
      </g>
    )
  }
  if (kind === 'slag') {
    return (
      <g {...common}>
        <ellipse cx={x} cy={py} rx={size / 4} ry={size / 2} fill={RED} />
        {sel}
      </g>
    )
  }
  // planar defects: bar along the weld axis
  return (
    <g {...common}>
      <line x1={x} y1={py - size / 2} x2={x} y2={py + size / 2} stroke={RED} strokeWidth={1.6} strokeLinecap="round" />
      {sel}
    </g>
  )
}

/**
 * Top-down plan view (UTman-style): plate from above, weld band down the
 * centre, probe seen from above, beam skip fan as a widening dotted cone,
 * defects at their (position, length) locations, probe-position ruler below.
 */
export default function PlanView({
  specimen,
  specimenParams,
  thickness,
  defects,
  selectedDefectId,
  probe,
  probeX,
  probeDir,
  settings,
  tofdMode,
  tofdS,
  hideDefects,
  showBeamFan,
  dispatch,
}) {
  const svgRef = useRef(null)
  const dragging = useRef(false)
  const params = specimenParams
  const L = effectiveLength(specimen, params)
  const cx = weldCenterOf(specimen, params)
  const isPipe = specimen.type === 'pipe'
  const isTky = specimen.type === 'tky'
  const planH = 160
  const rulerH = 24
  const vb = '-34 -8 ' + (L + 70) + ' ' + (planH + rulerH + 16)
  const fs = Math.max(L * 0.022, 4.5)
  const py = planH / 2

  // weld / brace band (vertical, hatched)
  const ho = (specimen.prepHalfAngleDeg ? thickness * Math.tan(toRad(specimen.prepHalfAngleDeg)) : 6) + 1.5
  const beta = toRad(params.braceAngle ?? specimen.braceAngle ?? 45)
  const bandX0 = isTky ? specimen.braceX : cx - ho
  const bandX1 = isTky ? specimen.braceX + specimen.braceThickness / Math.sin(beta) : cx + ho

  // beam fan projected to plan
  const th = toRad(probe.angle)
  const half = toRad(probe.halfAngleDeg ?? 5)
  const maxPath = Math.min(settings.range + Math.max(settings.xShift, 0), thickness * 8 + 40)
  const maxSurf = probe.angle === 0 ? 7 : Math.min(maxPath * Math.sin(th), L * 0.9)
  const fanEndX = probeX + probeDir * maxSurf
  const fanHalfW = probe.angle === 0 ? 5 : Math.min((maxSurf / Math.sin(th)) * Math.tan(half), planH / 2 - 4)
  const halfWAt = (u) => (probe.angle === 0 ? 5 : Math.min((u / Math.sin(th)) * Math.tan(half), planH / 2 - 4))
  const skipMarks = []
  if (probe.angle > 0) {
    const stepU = thickness * Math.tan(th)
    for (let k = 1; k <= 4; k++) {
      const u = k * stepU
      if (u > maxSurf) break
      skipMarks.push({ x: probeX + probeDir * u, w: halfWAt(u), label: k / 2 + 'S' })
    }
  }

  /* drag = move probe */
  const svgX = (e) => {
    const svg = svgRef.current
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    return pt.matrixTransform(svg.getScreenCTM().inverse()).x
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

  /* side rulers (along-weld mm) */
  const rulers = []
  for (let d = 0; d <= planH; d += 10) {
    const major = d % 40 === 0
    rulers.push(<line key={'l' + d} x1={-6} y1={d} x2={major ? -11 : -9} y2={d} stroke={RULER} strokeWidth={0.25} />)
    rulers.push(<line key={'r' + d} x1={L + 6} y1={d} x2={L + (major ? 11 : 9)} y2={d} stroke={RULER} strokeWidth={0.25} />)
    if (major) {
      rulers.push(
        <text key={'ln' + d} x={-13} y={d + fs * 0.35} fontSize={fs * 0.75} textAnchor="end" fill={RULER}>{d}</text>,
        <text key={'rn' + d} x={L + 13} y={d + fs * 0.35} fontSize={fs * 0.75} fill={RULER}>{d}</text>,
      )
    }
  }

  /* probe-position ruler along the bottom (100…0…100 / 0..πD for pipe) */
  const scaleY = planH + 12
  const scale = []
  if (isPipe) {
    scale.push(<line key="base" x1={0} y1={scaleY} x2={L} y2={scaleY} stroke={RULER} strokeWidth={0.35} />)
    for (let v = 0; v <= L; v += 20) {
      const major = v % 100 === 0
      scale.push(<line key={'t' + v} x1={v} y1={scaleY} x2={v} y2={scaleY - (major ? 4 : 2.5)} stroke={RULER} strokeWidth={0.25} />)
      if (major) {
        scale.push(
          <text key={'n' + v} x={v} y={scaleY + 7} fontSize={fs * 0.72} textAnchor="middle" fill={RULER}>{v}</text>,
        )
      }
    }
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
          <text key={'n' + v} x={x} y={scaleY + 7} fontSize={fs * 0.72} textAnchor="middle" fill={RULER}>{Math.abs(v)}</text>,
        )
      }
    }
  }

  const probeHalfLen = 13 // along weld axis

  return (
    <svg
      ref={svgRef}
      viewBox={vb}
      preserveAspectRatio="xMidYMax meet"
      className="h-full w-full touch-none select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      <defs>
        <linearGradient id="pvSteel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9ba4ac" />
          <stop offset="1" stopColor="#87909a" />
        </linearGradient>
        <linearGradient id="pvProbe" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3db273" />
          <stop offset="1" stopColor="#227a49" />
        </linearGradient>
        <pattern id="pvHatch" width="4" height="4" patternUnits="userSpaceOnUse">
          <path d="M0,4 L4,0" stroke="#5c646c" strokeWidth="0.5" />
        </pattern>
        <clipPath id="pvClip">
          <rect x="0" y="0" width={L} height={planH} />
        </clipPath>
      </defs>

      {/* plate from above */}
      <rect x={0} y={0} width={L} height={planH} fill="url(#pvSteel)" stroke={OUTLINE} strokeWidth={0.7} />

      {/* weld / brace band down the centre */}
      <rect x={bandX0} y={0} width={bandX1 - bandX0} height={planH} fill="url(#pvHatch)" stroke="#5c646c" strokeWidth={0.4} />
      <line x1={(bandX0 + bandX1) / 2} y1={0} x2={(bandX0 + bandX1) / 2} y2={planH} stroke="#5c646c" strokeWidth={0.3} strokeDasharray="3 2" />

      {rulers}
      {scale}

      {/* beam skip fan (dotted, widening) */}
      {!tofdMode && showBeamFan && (
        <g clipPath="url(#pvClip)">
          <line x1={probeX} y1={py} x2={fanEndX} y2={py} stroke={ACCENT} strokeWidth={0.7} strokeDasharray="2 1.6" />
          <line x1={probeX} y1={py} x2={fanEndX} y2={py - fanHalfW} stroke={ACCENT} strokeOpacity={0.5} strokeWidth={0.5} strokeDasharray="1.2 1.6" />
          <line x1={probeX} y1={py} x2={fanEndX} y2={py + fanHalfW} stroke={ACCENT} strokeOpacity={0.5} strokeWidth={0.5} strokeDasharray="1.2 1.6" />
          {skipMarks.map((m, i) => (
            <g key={i}>
              <line x1={m.x} y1={py - m.w - 3} x2={m.x} y2={py + m.w + 3} stroke={ACCENT} strokeOpacity={0.65} strokeWidth={0.4} strokeDasharray="2.4 1.4" />
              <text x={m.x} y={py - m.w - 5} fontSize={fs * 0.75} textAnchor="middle" fill={ACCENT}>
                {m.label}
              </text>
            </g>
          ))}
        </g>
      )}

      {/* TOFD pair from above */}
      {tofdMode ? (
        <g style={{ cursor: 'ew-resize' }}>
          <line x1={probeX - tofdS} y1={py} x2={probeX + tofdS} y2={py} stroke={ACCENT} strokeWidth={0.6} strokeDasharray="2 1.6" />
          {[[-1, 'Tx'], [1, 'Rx']].map(([s, lbl]) => (
            <g key={lbl}>
              <rect x={probeX + s * tofdS - 8} y={py - probeHalfLen} width={16} height={2 * probeHalfLen} fill="url(#pvProbe)" stroke={OUTLINE} strokeWidth={0.4} />
              <text x={probeX + s * tofdS} y={py - probeHalfLen - 3} fontSize={fs * 0.8} fontWeight="700" textAnchor="middle" fill="#1c2126">
                {lbl}
              </text>
            </g>
          ))}
        </g>
      ) : (
        <g style={{ cursor: 'ew-resize' }}>
          {/* probe seen from above, notch shows firing direction */}
          <rect x={probeX - probeDir * 14} y={py - probeHalfLen} width={14} height={2 * probeHalfLen} fill="url(#pvProbe)" stroke={OUTLINE} strokeWidth={0.4} transform={probeDir < 0 ? 'translate(' + 2 * probeX + ',0) scale(-1,1)' : undefined} />
          <polygon
            points={
              probeX + ',' + (py - 5) + ' ' + (probeX + probeDir * 5) + ',' + py + ' ' + probeX + ',' + (py + 5)
            }
            fill="#2f9e5f"
            stroke={OUTLINE}
            strokeWidth={0.4}
          />
          <circle cx={probeX} cy={py} r={1.1} fill="#fff" stroke={OUTLINE} strokeWidth={0.4} />
        </g>
      )}

      {/* defects at their (position, length) locations */}
      {!hideDefects &&
        defects.map((d) => (
          <PlanDefect key={d.id} defect={d} selected={d.id === selectedDefectId} onSelect={(id) => dispatch({ type: 'SELECT_DEFECT', id })} py={py} />
        ))}
    </svg>
  )
}
