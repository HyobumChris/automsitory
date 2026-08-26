import { useRef } from 'react'
import { beamPolyline, sampleArc, toRad } from '../lib/geometry.js'

const STEEL = '#1e3054'
const STEEL_EDGE = '#4a6da8'
const BEAM = '#00e5ff'
const DEFECT = '#ff1744'
const NOTE = '#94a3b8'

function pts2str(pts) {
  return pts.map(([x, y]) => x.toFixed(2) + ',' + y.toFixed(2)).join(' ')
}

function profilePoints(specimen, params, thickness) {
  const L = specimen.length
  switch (specimen.type) {
    case 'v1': {
      if ((params.face ?? specimen.defaultFace) === 'edge') {
        return [[0, 0], [L, 0], [L, thickness], [0, thickness]]
      }
      // 100 mm radius quadrant at the left end, centred on the focus (100, 0)
      const arc = sampleArc(100, 0, 100, 180, 90, 28)
      return [[L, 0], [0, 0], ...arc.slice(1), [L, 100]]
    }
    case 'v2': {
      // fan shape: r25 arc on the left of the focus, r50 arc on the right
      const f = specimen.focusX
      const a25 = sampleArc(f, 0, 25, 180, 90, 20) // (f-25,0) -> (f,25)
      const a50 = sampleArc(f, 0, 50, 90, 0, 24) // (f,50) -> (f+50,0)
      return [...a25, [f, 50], ...a50.slice(1)]
    }
    default:
      return [[0, 0], [L, 0], [L, thickness], [0, thickness]]
  }
}

function DefectShape({ defect, selected, onSelect }) {
  const { x, depth, size = 4, tilt = 0, kind } = defect
  const stroke = selected ? '#ffab00' : DEFECT
  const common = {
    onPointerDown: (e) => {
      e.stopPropagation()
      onSelect(defect.id)
    },
    style: { cursor: 'pointer' },
  }
  if (kind === 'porosity') {
    const r = Math.max(size / 6, 0.7)
    const offs = [[-size / 3, -size / 4], [size / 4, -size / 6], [-size / 6, size / 4], [size / 3, size / 5], [0, 0]]
    return (
      <g {...common}>
        {offs.map(([dx, dy], i) => (
          <circle key={i} cx={x + dx} cy={depth + dy} r={r} fill={stroke} opacity={0.85} />
        ))}
      </g>
    )
  }
  if (kind === 'sdh') {
    return (
      <circle {...common} cx={x} cy={depth} r={Math.max(size / 2, 1)} fill="none" stroke={stroke} strokeWidth={0.8} />
    )
  }
  if (kind === 'slag') {
    return (
      <ellipse {...common} cx={x} cy={depth} rx={size / 2} ry={size / 4} fill={stroke} opacity={0.85} />
    )
  }
  // planar defects: line along the plane, tilt measured from vertical
  const hx = (size / 2) * Math.sin(toRad(tilt))
  const hy = (size / 2) * Math.cos(toRad(tilt))
  return (
    <line
      {...common}
      x1={x - hx}
      y1={depth - hy}
      x2={x + hx}
      y2={depth + hy}
      stroke={stroke}
      strokeWidth={1.4}
      strokeLinecap="round"
    />
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
  dispatch,
}) {
  const svgRef = useRef(null)
  const dragging = useRef(false)

  const L = specimen.length
  const params = specimenParams
  const profile = profilePoints(specimen, params, thickness)
  const profileHeight = Math.max(...profile.map(([, y]) => y))

  const isTky = specimen.type === 'tky'
  const topPad = isTky ? 78 : 30
  const botPad = 20
  const vb = '-12 ' + -topPad + ' ' + (L + 46) + ' ' + (profileHeight + topPad + botPad)
  const fs = Math.max(L * 0.024, 5)

  // radius-block special case: probe near the focus firing at the arc -> the
  // centreline meets the arc perpendicular at distance R (why any angle works)
  const radiusFeature = (specimen.features ?? []).find(
    (f) =>
      f.type === 'radius' &&
      (!f.face || f.face === (params.face ?? specimen.defaultFace)) &&
      (!f.dir || f.dir === probeDir),
  )
  const aimedAtRadius =
    probe.angle > 0 && radiusFeature && Math.abs(probeX - radiusFeature.focusX) <= 15

  let beamPts
  if (aimedAtRadius) {
    const th = toRad(probe.angle)
    beamPts = [
      [probeX, 0],
      [probeX + probeDir * radiusFeature.radius * Math.sin(th), radiusFeature.radius * Math.cos(th)],
    ]
  } else {
    beamPts = beamPolyline({
      probeX,
      dir: probeDir,
      angleDeg: probe.angle,
      thickness,
      maxPath: Math.min(settings.range + Math.max(settings.xShift, 0), thickness * 8 + 40),
    })
  }

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

  // probe body polygon
  const back = probeX - probeDir * 13
  const front = probeX + probeDir * 8
  const probePoly =
    probe.angle === 0
      ? [[probeX - 8, -18], [probeX + 8, -18], [probeX + 8, 0], [probeX - 8, 0]]
      : [[back, -16], [front, -16], [front, 0], [probeX - probeDir * 4, 0], [back, -7]]

  // weld overlay geometry
  let weld = null
  if (specimen.type === 'weld') {
    const wx = specimen.weldCenterX
    const ho = thickness * Math.tan(toRad(specimen.prepHalfAngleDeg)) + 1.5
    weld = { wx, ho }
  }

  // TKY brace polygon
  let brace = null
  if (isTky) {
    const beta = toRad(params.braceAngle ?? specimen.braceAngle)
    const bt = specimen.braceThickness
    const bl = 70
    const x0 = specimen.braceX
    const u = [Math.cos(beta), -Math.sin(beta)] // up along the brace
    const x1 = x0 + bt / Math.sin(beta) // heel on the surface
    brace = {
      poly: [
        [x0, 0],
        [x0 + bl * u[0], bl * u[1]],
        [x1 + bl * u[0], bl * u[1]],
        [x1, 0],
      ],
      x0,
      x1,
    }
  }

  const face = params.face ?? specimen.defaultFace
  const v1Side = specimen.type === 'v1' && face === 'side'

  return (
    <div className="rounded-lg border border-marine-600 bg-marine-800 p-2">
      <div className="mb-1 flex items-baseline justify-between px-1">
        <span className="text-xs font-semibold text-cyan-glow">
          Specimen View (시험편 단면)
        </span>
        <span className="text-[10px] text-slate-400">
          {specimen.name} · drag probe (탐촉자 드래그)
        </span>
      </div>
      <svg
        ref={svgRef}
        viewBox={vb}
        className="w-full touch-none select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        {/* specimen body */}
        <polygon points={pts2str(profile)} fill={STEEL} stroke={STEEL_EDGE} strokeWidth={0.8} />

        {/* V1 features */}
        {v1Side &&
          (specimen.features ?? []).map((f, i) => {
            if (f.type === 'slot') {
              return (
                <g key={i}>
                  <rect
                    x={f.x0}
                    y={f.thickness}
                    width={f.x1 - f.x0}
                    height={100 - f.thickness}
                    fill="#0a1628"
                    stroke={STEEL_EDGE}
                    strokeWidth={0.5}
                  />
                  <text x={(f.x0 + f.x1) / 2} y={f.thickness - 3} fontSize={fs * 0.8} fill={NOTE} textAnchor="middle">
                    91
                  </text>
                </g>
              )
            }
            if (f.type === 'perspex') {
              return (
                <g key={i}>
                  <rect
                    x={f.x0}
                    y={55}
                    width={f.x1 - f.x0}
                    height={45}
                    fill="rgba(255,171,0,0.15)"
                    stroke="#ffab00"
                    strokeWidth={0.5}
                    strokeDasharray="2 2"
                  />
                  <text x={(f.x0 + f.x1) / 2} y={80} fontSize={fs * 0.8} fill="#ffab00" textAnchor="middle">
                    perspex
                  </text>
                </g>
              )
            }
            if (f.type === 'sdh') {
              return (
                <g key={i}>
                  <circle cx={f.x} cy={f.depth} r={Math.max(f.size / 2, 1.2)} fill="none" stroke="#e2e8f0" strokeWidth={0.6} />
                  <text x={f.x + 5} y={f.depth + 2} fontSize={fs * 0.8} fill={NOTE}>
                    SDH
                  </text>
                </g>
              )
            }
            return null
          })}
        {specimen.type === 'v2' && (
          <circle cx={specimen.focusX} cy={12} r={2.5} fill="none" stroke="#e2e8f0" strokeWidth={0.5} />
        )}

        {/* weld overlay */}
        {weld && (
          <g>
            <path
              d={
                'M ' + (weld.wx - weld.ho) + ' 0 L ' + (weld.wx - 1.5) + ' ' + thickness +
                ' M ' + (weld.wx + weld.ho) + ' 0 L ' + (weld.wx + 1.5) + ' ' + thickness
              }
              stroke="#64748b"
              strokeWidth={0.6}
              strokeDasharray="2 1.5"
              fill="none"
            />
            <path
              d={
                'M ' + (weld.wx - weld.ho - 2) + ' 0 Q ' + weld.wx + ' ' + -(thickness * 0.18) +
                ' ' + (weld.wx + weld.ho + 2) + ' 0'
              }
              fill="rgba(100,116,139,0.35)"
              stroke="#64748b"
              strokeWidth={0.5}
            />
            <path
              d={
                'M ' + (weld.wx - 3) + ' ' + thickness + ' Q ' + weld.wx + ' ' +
                (thickness + thickness * 0.09) + ' ' + (weld.wx + 3) + ' ' + thickness
              }
              fill="rgba(100,116,139,0.35)"
              stroke="#64748b"
              strokeWidth={0.5}
            />
          </g>
        )}

        {/* TKY brace */}
        {brace && (
          <g>
            <polygon points={pts2str(brace.poly)} fill={STEEL} stroke={STEEL_EDGE} strokeWidth={0.8} />
            <path
              d={'M ' + (brace.x0 - 4) + ' 0 L ' + brace.x0 + ' -4 M ' + brace.x1 + ' -4 L ' + (brace.x1 + 4) + ' 0'}
              stroke="#64748b"
              strokeWidth={1.2}
              fill="none"
            />
            <text x={brace.x0 - 6} y={-30} fontSize={fs} fill={NOTE} textAnchor="end">
              brace {params.braceAngle ?? specimen.braceAngle}°
            </text>
          </g>
        )}

        {/* beam centreline */}
        <polyline
          points={pts2str(beamPts)}
          fill="none"
          stroke={BEAM}
          strokeWidth={1}
          strokeOpacity={0.85}
          strokeDasharray="3 1.5"
        />

        {/* defects */}
        {defects.map((d) => (
          <DefectShape
            key={d.id}
            defect={d}
            selected={d.id === selectedDefectId}
            onSelect={(id) => dispatch({ type: 'SELECT_DEFECT', id })}
          />
        ))}

        {/* beam-spread (20 %) sizing markers */}
        {beamMarkers.map((m, i) => (
          <g key={i} stroke="#00e676" strokeWidth={0.8}>
            <line x1={m.x - 2} y1={m.depth - 2} x2={m.x + 2} y2={m.depth + 2} />
            <line x1={m.x - 2} y1={m.depth + 2} x2={m.x + 2} y2={m.depth - 2} />
            <line x1={m.probeX} y1={-4} x2={m.probeX} y2={0} stroke="#00e676" strokeWidth={1.4} />
          </g>
        ))}

        {/* probe */}
        <g style={{ cursor: 'ew-resize' }}>
          <polygon points={pts2str(probePoly)} fill="#334155" stroke="#00e5ff" strokeWidth={0.8} />
          <line x1={probeX} y1={-3} x2={probeX} y2={1.5} stroke="#ffab00" strokeWidth={1} />
          <text
            x={probeX}
            y={-20}
            fontSize={fs}
            fill="#00e5ff"
            textAnchor="middle"
            fontWeight="600"
          >
            {probe.angle === 0 ? '0°' : probe.angle + '°'} x={probeX.toFixed(1)}
          </text>
        </g>

        {/* dimensions */}
        <line x1={L + 8} y1={0} x2={L + 8} y2={profileHeight} stroke={NOTE} strokeWidth={0.5} />
        <text
          x={L + 12}
          y={profileHeight / 2}
          fontSize={fs}
          fill={NOTE}
          dominantBaseline="middle"
        >
          {specimen.type === 'v1' || specimen.type === 'v2'
            ? profileHeight.toFixed(0) + ' mm'
            : 't=' + thickness + ' mm'}
        </text>
        {v1Side && (
          <text x={100} y={-8} fontSize={fs * 0.9} fill={NOTE} textAnchor="middle">
            focus ▼ R100
          </text>
        )}
      </svg>
    </div>
  )
}
