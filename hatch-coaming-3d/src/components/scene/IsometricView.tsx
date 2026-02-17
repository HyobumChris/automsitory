import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { MEASURES_DATA, YIELD_STRENGTH, getBCAType } from '../../store/rulesEngine'

/* ─── Isometric Projection Helpers ─── */
const SCALE = 28
const CX = 480
const CY = 320
const cos30 = Math.cos(Math.PI / 6)
const sin30 = 0.5

/** Project 3D (x, y, z) to 2D isometric screen coords */
function iso(x: number, y: number, z: number): [number, number] {
  return [
    CX + (x - z) * cos30 * SCALE,
    CY + (x + z) * sin30 * SCALE - y * SCALE,
  ]
}

/** Convert an array of 3D points into an SVG polygon points string */
function polyPoints(pts: [number, number, number][]): string {
  return pts.map(([x, y, z]) => iso(x, y, z).join(',')).join(' ')
}

/* ─── Structural Member Definitions ─── */
// All coordinates in ship-relative 3D: x=athwartship (positive outboard), y=vertical (positive up), z=along ship length

// Upper deck plate (horizontal, at y=0)
const DECK_TOP: [number, number, number][] = [
  [-3, 0, 0], [9, 0, 0], [9, 0, 8], [-3, 0, 8],
]
const DECK_FRONT: [number, number, number][] = [
  [-3, 0, 0], [9, 0, 0], [9, -0.4, 0], [-3, -0.4, 0],
]
const DECK_SIDE: [number, number, number][] = [
  [9, 0, 0], [9, 0, 8], [9, -0.4, 8], [9, -0.4, 0],
]

// Hatch coaming side plate (vertical, at x=0, from deck up)
const COAMING_SIDE_FRONT: [number, number, number][] = [
  [-0.15, 0, 0], [0.15, 0, 0], [0.15, 5.5, 0], [-0.15, 5.5, 0],
]
const COAMING_SIDE_RIGHT: [number, number, number][] = [
  [0.15, 0, 0], [0.15, 0, 8], [0.15, 5.5, 8], [0.15, 5.5, 0],
]

// Hatch coaming top plate (horizontal, at top of coaming)
const COAMING_TOP_TOP: [number, number, number][] = [
  [-1.8, 5.5, 0], [1.2, 5.5, 0], [1.2, 5.5, 8], [-1.8, 5.5, 8],
]
const COAMING_TOP_FRONT: [number, number, number][] = [
  [-1.8, 5.5, 0], [1.2, 5.5, 0], [1.2, 5.2, 0], [-1.8, 5.2, 0],
]
const COAMING_TOP_SIDE: [number, number, number][] = [
  [1.2, 5.5, 0], [1.2, 5.5, 8], [1.2, 5.2, 8], [1.2, 5.2, 0],
]

// Sheer strake (side shell plate at deck level, at x=9)
const SHEER_FRONT: [number, number, number][] = [
  [9, -3, 0], [9.3, -3, 0], [9.3, 1.5, 0], [9, 1.5, 0],
]
const SHEER_RIGHT: [number, number, number][] = [
  [9.3, -3, 0], [9.3, -3, 8], [9.3, 1.5, 8], [9.3, 1.5, 0],
]

// Longitudinal bulkhead (vertical, at x=-3)
const LBHD_FRONT: [number, number, number][] = [
  [-3, -3, 0], [-2.7, -3, 0], [-2.7, 0, 0], [-3, 0, 0],
]
const LBHD_RIGHT: [number, number, number][] = [
  [-2.7, -3, 0], [-2.7, -3, 8], [-2.7, 0, 8], [-2.7, 0, 0],
]

// Deck longitudinals (T-stiffeners under deck, running along z-axis)
const DECK_LONG_POSITIONS = [2, 4.5, 7]

function deckLongWeb(xPos: number): [number, number, number][] {
  return [
    [xPos - 0.06, 0, 0], [xPos + 0.06, 0, 0],
    [xPos + 0.06, -1.2, 0], [xPos - 0.06, -1.2, 0],
  ]
}
function deckLongWebSide(xPos: number): [number, number, number][] {
  return [
    [xPos + 0.06, 0, 0], [xPos + 0.06, 0, 8],
    [xPos + 0.06, -1.2, 8], [xPos + 0.06, -1.2, 0],
  ]
}
function deckLongFlange(xPos: number): [number, number, number][] {
  return [
    [xPos - 0.4, -1.2, 0], [xPos + 0.4, -1.2, 0],
    [xPos + 0.4, -1.2, 8], [xPos - 0.4, -1.2, 8],
  ]
}

// Inner hull longitudinals (stiffeners on longitudinal bulkhead)
const INNER_HULL_LONG_Y = [-1, -2]

function innerHullLongWeb(yPos: number): [number, number, number][] {
  return [
    [-2.7, yPos - 0.06, 0], [-2.7, yPos + 0.06, 0],
    [-1.7, yPos + 0.06, 0], [-1.7, yPos - 0.06, 0],
  ]
}
function innerHullLongSide(yPos: number): [number, number, number][] {
  return [
    [-1.7, yPos + 0.06, 0], [-1.7, yPos + 0.06, 8],
    [-1.7, yPos - 0.06, 8], [-1.7, yPos - 0.06, 0],
  ]
}

// Side longitudinals (stiffeners on sheer strake)
const SIDE_LONG_Y = [-0.5, -1.5]

function sideLongWeb(yPos: number): [number, number, number][] {
  return [
    [9, yPos - 0.06, 0], [9, yPos + 0.06, 0],
    [8, yPos + 0.06, 0], [8, yPos - 0.06, 0],
  ]
}
function sideLongSide(yPos: number): [number, number, number][] {
  return [
    [8, yPos + 0.06, 0], [8, yPos + 0.06, 8],
    [8, yPos - 0.06, 8], [8, yPos - 0.06, 0],
  ]
}

// Butt weld joint positions along z-axis (block joints)
const BUTT_WELD_Z = [2.7, 5.3]

/* ─── Member Metadata for Tooltips ─── */
const MEMBER_INFO: Record<string, { name: string; description: string }> = {
  upper_deck_plate: { name: 'Upper Deck Plate', description: 'Horizontal plate at deck level' },
  hatch_coaming_side: { name: 'Hatch Coaming Side Plate', description: 'Vertical plate connecting top to deck' },
  coaming_top_plate: { name: 'Hatch Coaming Top Plate', description: 'Horizontal plate at top of coaming' },
  sheer_strake: { name: 'Sheer Strake', description: 'Side shell plate at deck level' },
  longitudinal_bulkhead: { name: 'Longitudinal Bulkhead', description: 'Internal vertical structural division' },
  deck_longitudinals: { name: 'Deck Longitudinals', description: 'T-stiffeners running along the deck underside' },
  inner_hull_longitudinals: { name: 'Inner Hull Longitudinals', description: 'Stiffeners on the longitudinal bulkhead' },
  side_longitudinals: { name: 'Side Longitudinals', description: 'Stiffeners on the side shell' },
  coaming_deck_junction: { name: 'Coaming/Deck Junction', description: 'Critical T-joint where coaming side meets upper deck' },
  butt_welds: { name: 'Block-to-Block Butt Welds', description: 'Butt weld joints between construction blocks' },
}

/* ─── Which measures affect which members ─── */
function getMeasuresForMember(memberId: string): number[] {
  const result: number[] = []
  for (const [idStr, data] of Object.entries(MEASURES_DATA)) {
    const id = Number(idStr)
    if (data.affectedMembers.some((m) => memberId.includes(m) || m.includes(memberId))) {
      result.push(id)
    }
  }
  return result
}

/* ─── Tooltip Component ─── */
function Tooltip({
  x,
  y,
  memberId,
  activeMeasures,
  steelGrade,
  thickness,
}: {
  x: number
  y: number
  memberId: string
  activeMeasures: number[]
  steelGrade: string
  thickness: number
}) {
  const info = MEMBER_INFO[memberId]
  if (!info) return null
  const affectingMeasures = getMeasuresForMember(memberId).filter((m) => activeMeasures.includes(m))
  const yieldStr = YIELD_STRENGTH[steelGrade as keyof typeof YIELD_STRENGTH]

  let bcaType: string | null = null
  if (memberId === 'upper_deck_plate') {
    bcaType = getBCAType('upper_deck', thickness, yieldStr)
  } else if (memberId === 'hatch_coaming_side') {
    bcaType = getBCAType('hatch_coaming_side', thickness, yieldStr)
  }

  return (
    <div
      className="tooltip-popup"
      style={{ left: x + 15, top: y - 10, position: 'absolute', pointerEvents: 'none', zIndex: 100 }}
    >
      <div className="tooltip-title">{info.name}</div>
      <div className="tooltip-desc">{info.description}</div>
      {affectingMeasures.length > 0 && (
        <div className="tooltip-measures">
          {affectingMeasures.map((m) => (
            <span
              key={m}
              className="tooltip-measure-tag"
              style={{ borderColor: MEASURES_DATA[m].color, color: MEASURES_DATA[m].color }}
            >
              M{m}
            </span>
          ))}
        </div>
      )}
      {bcaType && (
        <div className="tooltip-bca">
          BCA: <strong>{bcaType}</strong>
        </div>
      )}
    </div>
  )
}

/* ─── Main Isometric View Component ─── */
export function IsometricView() {
  const {
    steelGrade,
    thickness,
    evaluation,
    measure3SubOption,
    hoveredMember,
    highlightedMeasure,
    showAll,
    animatingMeasures,
    setHoveredMember,
    setAnimatingMeasures,
    setAnimationComplete,
  } = useAppStore()

  const svgRef = useRef<SVGSVGElement>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const accumulatedRef = useRef<number[]>([])

  const activeMeasures = useMemo(() => {
    if (showAll) return [1, 2, 3, 4, 5]
    return evaluation.activeMeasureIds
  }, [showAll, evaluation.activeMeasureIds])

  // Sequential animation: stagger measures appearing one by one
  const activeMeasuresKey = activeMeasures.join(',')
  useEffect(() => {
    if (activeMeasures.length === 0) {
      accumulatedRef.current = []
      setAnimatingMeasures([])
      setAnimationComplete(true)
      return
    }

    accumulatedRef.current = []
    setAnimatingMeasures([])
    setAnimationComplete(false)

    const timers: ReturnType<typeof setTimeout>[] = []
    activeMeasures.forEach((measureId, index) => {
      const timer = setTimeout(() => {
        if (!accumulatedRef.current.includes(measureId)) {
          accumulatedRef.current = [...accumulatedRef.current, measureId]
        }
        setAnimatingMeasures([...accumulatedRef.current])
        if (index === activeMeasures.length - 1) {
          setTimeout(() => setAnimationComplete(true), 600)
        }
      }, index * 400 + 200)
      timers.push(timer)
    })

    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMeasuresKey, setAnimatingMeasures, setAnimationComplete])

  const visibleMeasures = animatingMeasures

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (hoveredMember && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
      }
    },
    [hoveredMember],
  )

  const handleMemberEnter = useCallback(
    (memberId: string) => {
      setHoveredMember(memberId)
    },
    [setHoveredMember],
  )

  const handleMemberLeave = useCallback(() => {
    setHoveredMember(null)
    setTooltipPos(null)
  }, [setHoveredMember])

  // Check if a measure is visible (animating in)
  const isMeasureVisible = useCallback(
    (measureId: number) => visibleMeasures.includes(measureId),
    [visibleMeasures],
  )

  // Get color for a structural member based on active measures
  const getMemberColor = useCallback(
    (memberId: string, baseColor: string) => {
      const affecting = getMeasuresForMember(memberId).filter((m) => isMeasureVisible(m))
      if (highlightedMeasure !== null) {
        if (affecting.includes(highlightedMeasure)) {
          return MEASURES_DATA[highlightedMeasure].color
        }
        return baseColor
      }
      if (affecting.length > 0) {
        return MEASURES_DATA[affecting[affecting.length - 1]].color
      }
      return baseColor
    },
    [isMeasureVisible, highlightedMeasure],
  )

  // Get opacity for animation
  const getMemberOpacity = useCallback(
    (memberId: string) => {
      const affecting = getMeasuresForMember(memberId).filter((m) => isMeasureVisible(m))
      if (highlightedMeasure !== null) {
        return affecting.includes(highlightedMeasure) ? 1 : 0.3
      }
      return affecting.length > 0 ? 0.85 : 0.6
    },
    [isMeasureVisible, highlightedMeasure],
  )

  // Get glow filter for highlighted members
  const getGlowFilter = useCallback(
    (memberId: string) => {
      const affecting = getMeasuresForMember(memberId).filter((m) => isMeasureVisible(m))
      if (highlightedMeasure !== null && affecting.includes(highlightedMeasure)) {
        return `url(#glow-${highlightedMeasure})`
      }
      if (affecting.length > 0) {
        return `url(#glow-${affecting[affecting.length - 1]})`
      }
      return undefined
    },
    [isMeasureVisible, highlightedMeasure],
  )

  const isHovered = useCallback(
    (memberId: string) => hoveredMember === memberId,
    [hoveredMember],
  )

  // Base colors for structure
  const BASE_PLATE = '#3B4559'
  const BASE_PLATE_DARK = '#2D3548'
  const BASE_PLATE_SIDE = '#252E3F'
  const BASE_STIFFENER = '#344052'
  const WELD_COLOR = '#64748B'

  return (
    <div
      ref={containerRef}
      className="isometric-container"
      onMouseMove={handleMouseMove}
    >
      <svg
        ref={svgRef}
        viewBox="0 0 960 640"
        className="isometric-svg"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Glow filters for each measure color */}
          {Object.entries(MEASURES_DATA).map(([id, data]) => (
            <filter key={id} id={`glow-${id}`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feFlood floodColor={data.color} floodOpacity="0.6" result="color" />
              <feComposite in="color" in2="blur" operator="in" result="shadow" />
              <feMerge>
                <feMergeNode in="shadow" />
                <feMergeNode in="shadow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          ))}

          {/* Dashed pattern for Measure 2 (in-service NDE) */}
          <pattern id="measure2-dash" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="8" stroke="#F59E0B" strokeWidth="3" opacity="0.6" />
          </pattern>

          {/* Hatching for overlapping measures */}
          <pattern id="hatch-red" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="#DC2626" strokeWidth="1.5" opacity="0.7" />
          </pattern>
          <pattern id="hatch-purple" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(-45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="#9333EA" strokeWidth="1.5" opacity="0.7" />
          </pattern>

          {/* Measure 3 sub-option patterns */}
          {/* (a) Staggered welds: offset marks */}
          <pattern id="stagger-marks" patternUnits="userSpaceOnUse" width="12" height="12">
            <line x1="2" y1="0" x2="2" y2="6" stroke="#DC2626" strokeWidth="2" />
            <line x1="8" y1="6" x2="8" y2="12" stroke="#DC2626" strokeWidth="2" />
          </pattern>
          {/* (b) Crack arrest holes */}
          <pattern id="arrest-holes" patternUnits="userSpaceOnUse" width="16" height="16">
            <circle cx="8" cy="8" r="3" fill="none" stroke="#DC2626" strokeWidth="1.5" />
          </pattern>
          {/* (c) Insert plates */}
          <pattern id="insert-plates" patternUnits="userSpaceOnUse" width="14" height="14">
            <rect x="2" y="2" width="10" height="10" fill="#DC2626" opacity="0.3" rx="1" />
            <rect x="4" y="4" width="6" height="6" fill="#DC2626" opacity="0.5" rx="1" />
          </pattern>
          {/* (d) Enhanced NDE markers */}
          <pattern id="enhanced-nde" patternUnits="userSpaceOnUse" width="10" height="10">
            <path d="M0,5 L5,0 L10,5 L5,10 Z" fill="none" stroke="#DC2626" strokeWidth="1" opacity="0.6" />
          </pattern>

          {/* Pulsing animation for Measure 2 */}
          <style>{`
            @keyframes pulse-opacity {
              0%, 100% { opacity: 0.4; }
              50% { opacity: 0.8; }
            }
            .measure2-pulse { animation: pulse-opacity 2s ease-in-out infinite; }
            @keyframes fade-in {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            .measure-fade-in { animation: fade-in 600ms ease-out forwards; }
          `}</style>
        </defs>

        {/* ═══ Background Grid ═══ */}
        <rect width="960" height="640" fill="#0F172A" />
        {/* Subtle isometric grid */}
        <g opacity="0.06">
          {Array.from({ length: 20 }, (_, i) => {
            const z = i * 1.5
            const [x1, y1] = iso(-5, 0, z)
            const [x2, y2] = iso(15, 0, z)
            return <line key={`gz${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#64748B" strokeWidth="0.5" />
          })}
          {Array.from({ length: 20 }, (_, i) => {
            const x = -5 + i * 1.5
            const [x1, y1] = iso(x, 0, 0)
            const [x2, y2] = iso(x, 0, 12)
            return <line key={`gx${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#64748B" strokeWidth="0.5" />
          })}
        </g>

        {/* ═══ Structural Members (back to front for proper occlusion) ═══ */}

        {/* --- Longitudinal Bulkhead --- */}
        <g
          className={`structural-member ${isHovered('longitudinal_bulkhead') ? 'hovered' : ''}`}
          onMouseEnter={() => handleMemberEnter('longitudinal_bulkhead')}
          onMouseLeave={handleMemberLeave}
          style={{ cursor: 'pointer' }}
        >
          <polygon
            points={polyPoints(LBHD_RIGHT)}
            fill={BASE_PLATE_SIDE}
            stroke="#475569"
            strokeWidth="0.8"
            opacity={getMemberOpacity('longitudinal_bulkhead')}
          />
          <polygon
            points={polyPoints(LBHD_FRONT)}
            fill={BASE_PLATE_DARK}
            stroke="#475569"
            strokeWidth="0.8"
            opacity={getMemberOpacity('longitudinal_bulkhead')}
          />
        </g>

        {/* --- Inner Hull Longitudinals --- */}
        {INNER_HULL_LONG_Y.map((yPos) => (
          <g
            key={`ihl-${yPos}`}
            className={`structural-member ${isHovered('inner_hull_longitudinals') ? 'hovered' : ''}`}
            onMouseEnter={() => handleMemberEnter('inner_hull_longitudinals')}
            onMouseLeave={handleMemberLeave}
            style={{ cursor: 'pointer' }}
          >
            <polygon
              points={polyPoints(innerHullLongSide(yPos))}
              fill={getMemberColor('inner_hull_longitudinals', BASE_STIFFENER)}
              stroke="#475569"
              strokeWidth="0.5"
              opacity={getMemberOpacity('inner_hull_longitudinals')}
              filter={getGlowFilter('inner_hull_longitudinals')}
            />
            <polygon
              points={polyPoints(innerHullLongWeb(yPos))}
              fill={getMemberColor('inner_hull_longitudinals', BASE_STIFFENER)}
              stroke="#475569"
              strokeWidth="0.5"
              opacity={getMemberOpacity('inner_hull_longitudinals')}
            />
          </g>
        ))}

        {/* --- Side Longitudinals --- */}
        {SIDE_LONG_Y.map((yPos) => (
          <g
            key={`sl-${yPos}`}
            className={`structural-member ${isHovered('side_longitudinals') ? 'hovered' : ''}`}
            onMouseEnter={() => handleMemberEnter('side_longitudinals')}
            onMouseLeave={handleMemberLeave}
            style={{ cursor: 'pointer' }}
          >
            <polygon
              points={polyPoints(sideLongSide(yPos))}
              fill={getMemberColor('side_longitudinals', BASE_STIFFENER)}
              stroke="#475569"
              strokeWidth="0.5"
              opacity={getMemberOpacity('side_longitudinals')}
            />
            <polygon
              points={polyPoints(sideLongWeb(yPos))}
              fill={getMemberColor('side_longitudinals', BASE_STIFFENER)}
              stroke="#475569"
              strokeWidth="0.5"
              opacity={getMemberOpacity('side_longitudinals')}
            />
          </g>
        ))}

        {/* --- Sheer Strake --- */}
        <g
          className={`structural-member ${isHovered('sheer_strake') ? 'hovered' : ''}`}
          onMouseEnter={() => handleMemberEnter('sheer_strake')}
          onMouseLeave={handleMemberLeave}
          style={{ cursor: 'pointer' }}
        >
          <polygon
            points={polyPoints(SHEER_RIGHT)}
            fill={getMemberColor('sheer_strake', BASE_PLATE_SIDE)}
            stroke="#475569"
            strokeWidth="0.8"
            opacity={getMemberOpacity('sheer_strake')}
            filter={getGlowFilter('sheer_strake')}
          />
          <polygon
            points={polyPoints(SHEER_FRONT)}
            fill={getMemberColor('sheer_strake', BASE_PLATE_DARK)}
            stroke="#475569"
            strokeWidth="0.8"
            opacity={getMemberOpacity('sheer_strake')}
          />
        </g>

        {/* --- Deck Longitudinals (under deck) --- */}
        {DECK_LONG_POSITIONS.map((xPos) => (
          <g
            key={`dl-${xPos}`}
            className={`structural-member ${isHovered('deck_longitudinals') ? 'hovered' : ''}`}
            onMouseEnter={() => handleMemberEnter('deck_longitudinals')}
            onMouseLeave={handleMemberLeave}
            style={{ cursor: 'pointer' }}
          >
            <polygon
              points={polyPoints(deckLongFlange(xPos))}
              fill={getMemberColor('deck_longitudinals', BASE_STIFFENER)}
              stroke="#475569"
              strokeWidth="0.5"
              opacity={getMemberOpacity('deck_longitudinals')}
              filter={getGlowFilter('deck_longitudinals')}
            />
            <polygon
              points={polyPoints(deckLongWebSide(xPos))}
              fill={getMemberColor('deck_longitudinals', BASE_STIFFENER)}
              stroke="#475569"
              strokeWidth="0.5"
              opacity={getMemberOpacity('deck_longitudinals')}
            />
            <polygon
              points={polyPoints(deckLongWeb(xPos))}
              fill={getMemberColor('deck_longitudinals', BASE_STIFFENER)}
              stroke="#475569"
              strokeWidth="0.5"
              opacity={getMemberOpacity('deck_longitudinals')}
            />
          </g>
        ))}

        {/* --- Upper Deck Plate --- */}
        <g
          className={`structural-member ${isHovered('upper_deck_plate') ? 'hovered' : ''}`}
          onMouseEnter={() => handleMemberEnter('upper_deck_plate')}
          onMouseLeave={handleMemberLeave}
          style={{ cursor: 'pointer' }}
        >
          {/* Deck side face */}
          <polygon
            points={polyPoints(DECK_SIDE)}
            fill={getMemberColor('upper_deck_plate', BASE_PLATE_SIDE)}
            stroke="#475569"
            strokeWidth="0.8"
            opacity={getMemberOpacity('upper_deck_plate')}
          />
          {/* Deck front face */}
          <polygon
            points={polyPoints(DECK_FRONT)}
            fill={getMemberColor('upper_deck_plate', BASE_PLATE_DARK)}
            stroke="#475569"
            strokeWidth="0.8"
            opacity={getMemberOpacity('upper_deck_plate')}
          />
          {/* Deck top face */}
          <polygon
            points={polyPoints(DECK_TOP)}
            fill={getMemberColor('upper_deck_plate', BASE_PLATE)}
            stroke="#475569"
            strokeWidth="0.8"
            opacity={getMemberOpacity('upper_deck_plate')}
            filter={getGlowFilter('upper_deck_plate')}
          />

          {/* Measure 4 overlay: green fill for BCA steel */}
          {isMeasureVisible(4) && (
            <polygon
              points={polyPoints(DECK_TOP)}
              fill="#16A34A"
              opacity="0.25"
              className="measure-fade-in"
            />
          )}
          {/* Measure 5 overlay: purple hatching for extended BCA */}
          {isMeasureVisible(5) && (
            <polygon
              points={polyPoints(DECK_TOP)}
              fill="url(#hatch-purple)"
              opacity="0.5"
              className="measure-fade-in"
            />
          )}
        </g>

        {/* --- Block-to-Block Butt Welds on Deck --- */}
        {BUTT_WELD_Z.map((zPos) => {
          const weldLine: [number, number, number][] = [
            [-3, 0.02, zPos],
            [9, 0.02, zPos],
          ]
          const [x1, y1] = iso(...weldLine[0])
          const [x2, y2] = iso(...weldLine[1])
          const weldActive = isMeasureVisible(1)
          const weldColor = weldActive ? '#2563EB' : WELD_COLOR

          return (
            <g key={`bw-deck-${zPos}`}
              onMouseEnter={() => handleMemberEnter('butt_welds')}
              onMouseLeave={handleMemberLeave}
              style={{ cursor: 'pointer' }}
            >
              <line
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={weldColor}
                strokeWidth={weldActive ? 2.5 : 1.5}
                strokeDasharray={isMeasureVisible(2) ? '6 4' : 'none'}
                opacity={weldActive ? 0.9 : 0.4}
                filter={weldActive ? 'url(#glow-1)' : undefined}
                className={weldActive ? 'measure-fade-in' : ''}
              />
              {/* Measure 2 overlay: dashed amber */}
              {isMeasureVisible(2) && (
                <line
                  x1={x1} y1={y1 - 2} x2={x2} y2={y2 - 2}
                  stroke="#F59E0B"
                  strokeWidth="1.5"
                  strokeDasharray="4 6"
                  className="measure2-pulse"
                />
              )}
            </g>
          )
        })}

        {/* --- Butt Welds on Coaming Side --- */}
        {BUTT_WELD_Z.map((zPos) => {
          const [x1, y1] = iso(0, 0, zPos)
          const [x2, y2] = iso(0, 5.5, zPos)
          const weldActive = isMeasureVisible(1)
          const weldColor = weldActive ? '#2563EB' : WELD_COLOR

          return (
            <g key={`bw-coaming-${zPos}`}
              onMouseEnter={() => handleMemberEnter('butt_welds')}
              onMouseLeave={handleMemberLeave}
              style={{ cursor: 'pointer' }}
            >
              <line
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={weldColor}
                strokeWidth={weldActive ? 2.5 : 1.5}
                opacity={weldActive ? 0.9 : 0.4}
                filter={weldActive ? 'url(#glow-1)' : undefined}
                className={weldActive ? 'measure-fade-in' : ''}
              />
              {isMeasureVisible(2) && (
                <line
                  x1={x1 - 2} y1={y1} x2={x2 - 2} y2={y2}
                  stroke="#F59E0B"
                  strokeWidth="1.5"
                  strokeDasharray="4 6"
                  className="measure2-pulse"
                />
              )}
            </g>
          )
        })}

        {/* --- Butt Welds on Coaming Top --- */}
        {BUTT_WELD_Z.map((zPos) => {
          const [x1, y1] = iso(-1.8, 5.5, zPos)
          const [x2, y2] = iso(1.2, 5.5, zPos)
          const weldActive = isMeasureVisible(1)
          const weldColor = weldActive ? '#2563EB' : WELD_COLOR

          return (
            <g key={`bw-ctop-${zPos}`}
              onMouseEnter={() => handleMemberEnter('butt_welds')}
              onMouseLeave={handleMemberLeave}
              style={{ cursor: 'pointer' }}
            >
              <line
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={weldColor}
                strokeWidth={weldActive ? 2 : 1}
                opacity={weldActive ? 0.9 : 0.4}
                filter={weldActive ? 'url(#glow-1)' : undefined}
              />
            </g>
          )
        })}

        {/* --- Hatch Coaming Side Plate --- */}
        <g
          className={`structural-member ${isHovered('hatch_coaming_side') ? 'hovered' : ''}`}
          onMouseEnter={() => handleMemberEnter('hatch_coaming_side')}
          onMouseLeave={handleMemberLeave}
          style={{ cursor: 'pointer' }}
        >
          <polygon
            points={polyPoints(COAMING_SIDE_RIGHT)}
            fill={getMemberColor('hatch_coaming_side', BASE_PLATE_SIDE)}
            stroke="#475569"
            strokeWidth="0.8"
            opacity={getMemberOpacity('hatch_coaming_side')}
            filter={getGlowFilter('hatch_coaming_side')}
          />
          <polygon
            points={polyPoints(COAMING_SIDE_FRONT)}
            fill={getMemberColor('hatch_coaming_side', BASE_PLATE)}
            stroke="#475569"
            strokeWidth="0.8"
            opacity={getMemberOpacity('hatch_coaming_side')}
          />
        </g>

        {/* --- Coaming / Deck Junction (Critical T-Joint — Measure 3 focus) --- */}
        <g
          className={`structural-member ${isHovered('coaming_deck_junction') ? 'hovered' : ''}`}
          onMouseEnter={() => handleMemberEnter('coaming_deck_junction')}
          onMouseLeave={handleMemberLeave}
          style={{ cursor: 'pointer' }}
        >
          {/* Base junction weld line */}
          {(() => {
            const [x1, y1] = iso(-0.5, 0.01, 0)
            const [x2, y2] = iso(-0.5, 0.01, 8)
            const [x3, y3] = iso(0.5, 0.01, 8)
            const [x4, y4] = iso(0.5, 0.01, 0)
            const junctionActive = isMeasureVisible(3)
            const jColor = junctionActive ? '#DC2626' : '#64748B'

            return (
              <>
                {/* Junction weld zone on deck surface */}
                <polygon
                  points={`${x1},${y1} ${x2},${y2} ${x3},${y3} ${x4},${y4}`}
                  fill={jColor}
                  opacity={junctionActive ? 0.5 : 0.15}
                  filter={junctionActive ? 'url(#glow-3)' : undefined}
                  className={junctionActive ? 'measure-fade-in' : ''}
                />
                {/* Junction line emphasis */}
                <line
                  x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke={jColor}
                  strokeWidth={junctionActive ? 3 : 1.5}
                  opacity={junctionActive ? 0.9 : 0.3}
                />

                {/* Measure 3 sub-option detail overlays */}
                {junctionActive && measure3SubOption === 'a' && (
                  <polygon
                    points={`${x1},${y1} ${x2},${y2} ${x3},${y3} ${x4},${y4}`}
                    fill="url(#stagger-marks)"
                    opacity="0.7"
                    className="measure-fade-in"
                  />
                )}
                {junctionActive && measure3SubOption === 'b' && (
                  <polygon
                    points={`${x1},${y1} ${x2},${y2} ${x3},${y3} ${x4},${y4}`}
                    fill="url(#arrest-holes)"
                    opacity="0.7"
                    className="measure-fade-in"
                  />
                )}
                {junctionActive && measure3SubOption === 'c' && (
                  <polygon
                    points={`${x1},${y1} ${x2},${y2} ${x3},${y3} ${x4},${y4}`}
                    fill="url(#insert-plates)"
                    opacity="0.7"
                    className="measure-fade-in"
                  />
                )}
                {junctionActive && measure3SubOption === 'd' && (
                  <polygon
                    points={`${x1},${y1} ${x2},${y2} ${x3},${y3} ${x4},${y4}`}
                    fill="url(#enhanced-nde)"
                    opacity="0.7"
                    className="measure-fade-in"
                  />
                )}
              </>
            )
          })()}
        </g>

        {/* --- Hatch Coaming Top Plate --- */}
        <g
          className={`structural-member ${isHovered('coaming_top_plate') ? 'hovered' : ''}`}
          onMouseEnter={() => handleMemberEnter('coaming_top_plate')}
          onMouseLeave={handleMemberLeave}
          style={{ cursor: 'pointer' }}
        >
          <polygon
            points={polyPoints(COAMING_TOP_SIDE)}
            fill={getMemberColor('coaming_top_plate', BASE_PLATE_SIDE)}
            stroke="#475569"
            strokeWidth="0.8"
            opacity={getMemberOpacity('coaming_top_plate')}
          />
          <polygon
            points={polyPoints(COAMING_TOP_FRONT)}
            fill={getMemberColor('coaming_top_plate', BASE_PLATE_DARK)}
            stroke="#475569"
            strokeWidth="0.8"
            opacity={getMemberOpacity('coaming_top_plate')}
          />
          <polygon
            points={polyPoints(COAMING_TOP_TOP)}
            fill={getMemberColor('coaming_top_plate', BASE_PLATE)}
            stroke="#475569"
            strokeWidth="0.8"
            opacity={getMemberOpacity('coaming_top_plate')}
            filter={getGlowFilter('coaming_top_plate')}
          />
        </g>

        {/* ═══ Structural Labels ═══ */}
        <g className="labels" fontFamily="'JetBrains Mono', monospace" fontSize="10" fontWeight="600">
          {/* Hatch Coaming Top Plate */}
          {(() => {
            const [lx, ly] = iso(-0.3, 5.8, -0.5)
            return (
              <g>
                <line x1={lx} y1={ly + 4} x2={lx} y2={ly + 16} stroke="#64748B" strokeWidth="0.5" />
                <text x={lx} y={ly + 28} fill="#94A3B8" textAnchor="middle" fontSize="9">
                  COAMING TOP PLATE
                </text>
              </g>
            )
          })()}

          {/* Hatch Coaming Side Plate */}
          {(() => {
            const [lx, ly] = iso(-0.5, 2.8, -0.3)
            return (
              <text x={lx - 8} y={ly} fill="#94A3B8" textAnchor="end" fontSize="9"
                transform={`rotate(-78, ${lx - 8}, ${ly})`}>
                COAMING SIDE
              </text>
            )
          })()}

          {/* Upper Deck */}
          {(() => {
            const [lx, ly] = iso(4.5, 0.2, 4)
            return (
              <text x={lx} y={ly} fill="#94A3B8" textAnchor="middle" fontSize="10" fontWeight="700">
                UPPER DECK
              </text>
            )
          })()}

          {/* Sheer Strake */}
          {(() => {
            const [lx, ly] = iso(9.8, -0.5, -0.5)
            return (
              <text x={lx + 6} y={ly} fill="#94A3B8" textAnchor="start" fontSize="9">
                SHEER STRAKE
              </text>
            )
          })()}

          {/* Longitudinal Bulkhead */}
          {(() => {
            const [lx, ly] = iso(-3.5, -1.5, -0.3)
            return (
              <text x={lx - 6} y={ly} fill="#94A3B8" textAnchor="end" fontSize="8">
                LONG. BULKHEAD
              </text>
            )
          })()}

          {/* Deck Longitudinals label */}
          {(() => {
            const [lx, ly] = iso(4.5, -1.5, -0.3)
            return (
              <text x={lx} y={ly + 6} fill="#94A3B8" textAnchor="middle" fontSize="8">
                DECK LONGITUDINALS
              </text>
            )
          })()}

          {/* Inner Hull Longitudinals label */}
          {(() => {
            const [lx, ly] = iso(-2.2, -1.5, -0.3)
            return (
              <text x={lx - 2} y={ly + 4} fill="#94A3B8" textAnchor="end" fontSize="8">
                INNER HULL LONGS.
              </text>
            )
          })()}

          {/* Side Longitudinals label */}
          {(() => {
            const [lx, ly] = iso(8.5, -1, -0.3)
            return (
              <text x={lx + 4} y={ly + 4} fill="#94A3B8" textAnchor="start" fontSize="8">
                SIDE LONGS.
              </text>
            )
          })()}

          {/* Critical Junction Label */}
          {isMeasureVisible(3) && (() => {
            const [lx, ly] = iso(0, 0.1, -0.8)
            return (
              <g className="measure-fade-in">
                <line x1={lx} y1={ly} x2={lx - 40} y2={ly - 20} stroke="#DC2626" strokeWidth="1" strokeDasharray="3 2" />
                <rect x={lx - 145} y={ly - 34} width="105" height="18" rx="3" fill="#0F172A" stroke="#DC2626" strokeWidth="1" />
                <text x={lx - 92} y={ly - 21} fill="#DC2626" textAnchor="middle" fontSize="9" fontWeight="700">
                  CRITICAL T-JOINT
                </text>
              </g>
            )
          })()}

          {/* Butt Weld Labels */}
          {BUTT_WELD_Z.map((zPos, i) => {
            const [lx, ly] = iso(9.5, 0.5, zPos)
            return (
              <g key={`bwl-${i}`}>
                <text x={lx + 4} y={ly - 4} fill="#64748B" textAnchor="start" fontSize="7" fontStyle="italic">
                  Block Joint
                </text>
              </g>
            )
          })}
        </g>

        {/* ═══ Measure 5: Attachment Weld Markers ═══ */}
        {isMeasureVisible(5) && (
          <g className="measure-fade-in">
            {/* Small diamond markers at attachment points on deck */}
            {[1, 3, 5, 7].map((xPos) => {
              const [cx, cy] = iso(xPos, 0.05, 4)
              return (
                <g key={`aw-${xPos}`}>
                  <polygon
                    points={`${cx},${cy - 5} ${cx + 4},${cy} ${cx},${cy + 5} ${cx - 4},${cy}`}
                    fill="#9333EA"
                    opacity="0.7"
                  />
                </g>
              )
            })}
          </g>
        )}

        {/* ═══ Thickness Warning ═══ */}
        {thickness > 100 && (
          <g>
            <rect x="340" y="580" width="280" height="30" rx="4" fill="#7C2D12" stroke="#F97316" strokeWidth="1" />
            <text x="480" y="600" fill="#FB923C" textAnchor="middle" fontSize="11" fontWeight="600">
              WARNING: t &gt; 100mm requires special consideration
            </text>
          </g>
        )}
      </svg>

      {/* Tooltip */}
      {hoveredMember && tooltipPos && (
        <Tooltip
          x={tooltipPos.x}
          y={tooltipPos.y}
          memberId={hoveredMember}
          activeMeasures={activeMeasures}
          steelGrade={steelGrade}
          thickness={thickness}
        />
      )}
    </div>
  )
}
