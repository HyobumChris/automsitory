import { motion } from 'framer-motion'; // eslint-disable-line no-unused-vars

// Isometric projection math
const C30 = Math.cos(Math.PI / 6);
const S30 = 0.5;
const SCALE = 2.5;
const CX = 290;
const CY = 205;

function p(x, y, z) {
  return [
    CX + (x - y) * C30 * SCALE,
    CY + (x + y) * S30 * SCALE - z * SCALE,
  ];
}

function pts(...coords) {
  return coords.map(c => p(...c).join(',')).join(' ');
}

// Block dimensions (3D units)
const BL = 50; // half-length (each block)
const BW = 34; // width/depth
const BH = 28; // height

// Deck plate thickness (visual)
const DT = 3;
// Side shell thickness (visual)
const ST = 2.5;

// Longitudinal stiffener positions on top face (y values)
const LONG_Y_TOP = [7, 14, 21, 28];
// Longitudinal stiffener positions on front face (z values)
const LONG_Z_FRONT = [7, 14, 21];
// Internal frame positions on end face
const FRAME_Y = [8, 17, 26];
const FRAME_Z = [7, 14, 21];

export default function IsometricView({
  highlights = [],
  highlightColor = '#00e5ff',
  tooltip = '',
  showBlockShift = false,
}) {
  const hasHL = (id) => highlights.includes(id);
  const isTransverse = hasHL('transverse-butt');
  const isBlockShift = hasHL('block-shift') || showBlockShift;
  const isIntersections = hasHL('intersections');
  const isRadar = hasHL('radar');
  const hasActiveHighlight = isTransverse || isBlockShift || isIntersections || isRadar;

  // Joint x-coordinate
  const jx = BL;

  // Joint line paths (straight or Z-shaped for block shift)
  const jointTopPoints = isBlockShift
    ? [p(jx, 0, BH), p(jx - 5, 10, BH), p(jx + 5, 24, BH), p(jx, BW, BH)]
    : [p(jx, 0, BH), p(jx, BW, BH)];

  const jointFrontPoints = isBlockShift
    ? [p(jx, 0, 0), p(jx - 5, 0, 9), p(jx + 5, 0, 19), p(jx, 0, BH)]
    : [p(jx, 0, 0), p(jx, 0, BH)];

  const jointTopPath = `M ${jointTopPoints.map(pt => pt.join(',')).join(' L ')}`;
  const jointFrontPath = `M ${jointFrontPoints.map(pt => pt.join(',')).join(' L ')}`;

  // Intersection points for red dots / radar
  const intersectionsTop = LONG_Y_TOP.map(y => p(jx, y, BH));
  const intersectionsFront = LONG_Z_FRONT.map(z => p(jx, 0, z));
  const allIntersections = [...intersectionsTop, ...intersectionsFront];

  // Joint visual properties
  const jointColor = isTransverse ? '#00e5ff' : isBlockShift ? '#f59e0b' : isIntersections ? '#ff1744' : '#8899aa';
  const jointWidth = hasActiveHighlight ? 4.5 : 1.8;
  const jointGlow = hasActiveHighlight;

  // Dim longitudinal lines when highlighting transverse
  const longOpacity = hasActiveHighlight ? 0.2 : 0.55;
  const longWidth = hasActiveHighlight ? 0.4 : 0.7;

  return (
    <svg viewBox="0 0 620 460" className="w-full h-full" style={{ maxHeight: '100%' }}>
      <defs>
        {/* Glow filters */}
        <filter id="glow-main" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feFlood floodColor={jointColor} floodOpacity="0.65" result="color" />
          <feComposite in2="blur" operator="in" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="glow-red" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feFlood floodColor="#ff1744" floodOpacity="0.8" result="color" />
          <feComposite in2="blur" operator="in" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="glow-radar" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feFlood floodColor="#00e5ff" floodOpacity="0.5" result="color" />
          <feComposite in2="blur" operator="in" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Face gradients */}
        <linearGradient id="iso-top-a" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4a5c6e" />
          <stop offset="100%" stopColor="#3d4f5e" />
        </linearGradient>
        <linearGradient id="iso-top-b" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#546878" />
          <stop offset="100%" stopColor="#475a6a" />
        </linearGradient>
        <linearGradient id="iso-front" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#3a4d5e" />
          <stop offset="100%" stopColor="#283848" />
        </linearGradient>
        <linearGradient id="iso-end" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#2d4050" />
          <stop offset="100%" stopColor="#1a2d3d" />
        </linearGradient>

        {/* Deck highlight gradient */}
        <linearGradient id="deck-stripe" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#5a6e80" stopOpacity="0.15" />
          <stop offset="50%" stopColor="#6a8090" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#5a6e80" stopOpacity="0.15" />
        </linearGradient>
      </defs>

      {/* Background */}
      <rect width="620" height="460" fill="#0a1628" rx="8" />

      {/* Subtle engineering grid */}
      {Array.from({ length: 63 }, (_, i) => (
        <line key={`vg${i}`} x1={i * 10} y1="0" x2={i * 10} y2="460"
          stroke={i % 5 === 0 ? '#16243a' : '#101c2e'} strokeWidth={i % 5 === 0 ? 0.5 : 0.2} />
      ))}
      {Array.from({ length: 47 }, (_, i) => (
        <line key={`hg${i}`} x1="0" y1={i * 10} x2="620" y2={i * 10}
          stroke={i % 5 === 0 ? '#16243a' : '#101c2e'} strokeWidth={i % 5 === 0 ? 0.5 : 0.2} />
      ))}

      {/* Title */}
      <text x="310" y="26" textAnchor="middle" fill="#7a8ca0" fontSize="11" fontWeight="600" letterSpacing="1.5">
        3D ISOMETRIC VIEW — HULL BLOCK JOINT ASSEMBLY
      </text>

      {/* ═══════════ DRAW BACK FACES (hidden mostly, for depth) ═══════════ */}

      {/* ═══════════ END FACE (x = 2*BL) — drawn first (behind) ═══════════ */}
      <polygon
        points={pts([2 * BL, 0, 0], [2 * BL, BW, 0], [2 * BL, BW, BH], [2 * BL, 0, BH])}
        fill="url(#iso-end)" stroke="#3d5060" strokeWidth="1"
      />

      {/* Internal frames on end face */}
      {FRAME_Y.map((y, i) => (
        <line key={`ef-v-${i}`}
          x1={p(2 * BL, y, 0)[0]} y1={p(2 * BL, y, 0)[1]}
          x2={p(2 * BL, y, BH)[0]} y2={p(2 * BL, y, BH)[1]}
          stroke="#3d5565" strokeWidth="0.6" />
      ))}
      {FRAME_Z.map((z, i) => (
        <line key={`ef-h-${i}`}
          x1={p(2 * BL, 0, z)[0]} y1={p(2 * BL, 0, z)[1]}
          x2={p(2 * BL, BW, z)[0]} y2={p(2 * BL, BW, z)[1]}
          stroke="#3d5565" strokeWidth="0.6" />
      ))}

      {/* End face "SECTION" label */}
      <text
        x={p(2 * BL, BW * 0.5, BH * 0.5)[0]}
        y={p(2 * BL, BW * 0.5, BH * 0.5)[1]}
        textAnchor="middle" fill="#4d6575" fontSize="8" fontWeight="600" letterSpacing="1"
      >
        SECTION
      </text>

      {/* End face border highlight */}
      <polygon
        points={pts(
          [2 * BL, 0, BH], [2 * BL, 0, BH - DT],
          [2 * BL, BW, BH - DT], [2 * BL, BW, BH]
        )}
        fill="#4a6070" stroke="#5a7585" strokeWidth="0.5" opacity="0.6"
      />
      <polygon
        points={pts(
          [2 * BL, 0, 0], [2 * BL, 0, BH],
          [2 * BL, ST, BH], [2 * BL, ST, 0]
        )}
        fill="#4a6070" stroke="#5a7585" strokeWidth="0.5" opacity="0.6"
      />

      {/* ═══════════ FRONT FACE (y=0) ═══════════ */}

      {/* Block A front face */}
      <polygon
        points={pts([0, 0, 0], [BL, 0, 0], [BL, 0, BH], [0, 0, BH])}
        fill="url(#iso-front)" stroke="#3d5565" strokeWidth="0.8"
      />
      {/* Block B front face */}
      <polygon
        points={pts([BL, 0, 0], [2 * BL, 0, 0], [2 * BL, 0, BH], [BL, 0, BH])}
        fill="url(#iso-front)" stroke="#3d5565" strokeWidth="0.8"
      />

      {/* Side shell thickness indicator (subtle strip at top of front face) */}
      <polygon
        points={pts([0, 0, BH - DT], [2 * BL, 0, BH - DT], [2 * BL, 0, BH], [0, 0, BH])}
        fill="#4a5e70" stroke="none" opacity="0.3"
      />

      {/* Longitudinal stiffeners on front face (horizontal lines) */}
      {LONG_Z_FRONT.map((z, i) => (
        <g key={`lf-${i}`}>
          <line
            x1={p(0, 0, z)[0]} y1={p(0, 0, z)[1]}
            x2={p(2 * BL, 0, z)[0]} y2={p(2 * BL, 0, z)[1]}
            stroke="#506878"
            strokeWidth={longWidth}
            opacity={longOpacity}
            strokeDasharray="5,4"
          />
          {/* Stiffener web (tiny depth indicator) */}
          {[12, 30, 50, 68, 86].map((x, j) => (
            <line key={`sw-${i}-${j}`}
              x1={p(x, 0, z)[0]} y1={p(x, 0, z)[1]}
              x2={p(x, 0, z + 2)[0]} y2={p(x, 0, z + 2)[1]}
              stroke="#506878" strokeWidth="0.4" opacity={longOpacity * 0.7}
            />
          ))}
        </g>
      ))}

      {/* Weld seam mark on front face at bottom */}
      <line
        x1={p(0, 0, 0)[0]} y1={p(0, 0, 0)[1]}
        x2={p(2 * BL, 0, 0)[0]} y2={p(2 * BL, 0, 0)[1]}
        stroke="#3a4e5e" strokeWidth="1.5"
      />

      {/* ═══════════ TOP FACE (z = BH) — Deck plate ═══════════ */}

      {/* Block A top face */}
      <polygon
        points={pts([0, 0, BH], [BL, 0, BH], [BL, BW, BH], [0, BW, BH])}
        fill="url(#iso-top-a)" stroke="#5a6e80" strokeWidth="0.8"
      />
      {/* Block B top face */}
      <polygon
        points={pts([BL, 0, BH], [2 * BL, 0, BH], [2 * BL, BW, BH], [BL, BW, BH])}
        fill="url(#iso-top-b)" stroke="#5a6e80" strokeWidth="0.8"
      />

      {/* Deck plate edge stripes (subtle texture) */}
      <polygon
        points={pts([0, 0, BH], [2 * BL, 0, BH], [2 * BL, 2, BH], [0, 2, BH])}
        fill="#6a7e90" opacity="0.15"
      />
      <polygon
        points={pts([0, BW - 2, BH], [2 * BL, BW - 2, BH], [2 * BL, BW, BH], [0, BW, BH])}
        fill="#3a4e5e" opacity="0.15"
      />

      {/* Longitudinal stiffener lines on top face */}
      {LONG_Y_TOP.map((y, i) => (
        <line key={`lt-${i}`}
          x1={p(0, y, BH)[0]} y1={p(0, y, BH)[1]}
          x2={p(2 * BL, y, BH)[0]} y2={p(2 * BL, y, BH)[1]}
          stroke="#6a7e90"
          strokeWidth={longWidth}
          opacity={longOpacity}
          strokeDasharray="7,5"
        />
      ))}

      {/* Hatch coaming representation on deck (small raised rectangle) */}
      <polygon
        points={pts([15, 4, BH], [85, 4, BH], [85, 4, BH + 4], [15, 4, BH + 4])}
        fill="#5a6e80" stroke="#6a8090" strokeWidth="0.5" opacity="0.35"
      />

      {/* ═══════════ BLOCK LABELS ═══════════ */}
      <text
        x={p(BL * 0.5, BW * 0.48, BH)[0]}
        y={p(BL * 0.5, BW * 0.48, BH)[1] - 3}
        textAnchor="middle" fill="#8899aa" fontSize="11" fontWeight="700" letterSpacing="1"
      >
        BLOCK A
      </text>
      <text
        x={p(BL * 1.5, BW * 0.48, BH)[0]}
        y={p(BL * 1.5, BW * 0.48, BH)[1] - 3}
        textAnchor="middle" fill="#8899aa" fontSize="11" fontWeight="700" letterSpacing="1"
      >
        BLOCK B
      </text>

      {/* ═══════════ TRANSVERSE BUTT JOINT ═══════════ */}

      {/* Shadow / base joint line (always visible, subtle) */}
      {!hasActiveHighlight && (
        <>
          <path d={jointTopPath} fill="none" stroke="#8899aa" strokeWidth="1.5" strokeLinecap="round" />
          <path d={jointFrontPath} fill="none" stroke="#788898" strokeWidth="1.5" strokeLinecap="round" />
        </>
      )}

      {/* Highlighted joint on top face */}
      <motion.path
        d={jointTopPath}
        fill="none"
        stroke={jointColor}
        strokeWidth={jointWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={jointGlow ? 'url(#glow-main)' : 'none'}
        initial={false}
        animate={jointGlow ? { opacity: [0.55, 1, 0.55], strokeWidth: [jointWidth - 0.5, jointWidth + 1, jointWidth - 0.5] } : { opacity: 1 }}
        transition={jointGlow ? { duration: 1.8, repeat: Infinity, ease: 'easeInOut' } : {}}
      />

      {/* Highlighted joint on front face */}
      <motion.path
        d={jointFrontPath}
        fill="none"
        stroke={jointColor}
        strokeWidth={jointWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={jointGlow ? 'url(#glow-main)' : 'none'}
        initial={false}
        animate={jointGlow ? { opacity: [0.55, 1, 0.55], strokeWidth: [jointWidth - 0.5, jointWidth + 1, jointWidth - 0.5] } : { opacity: 1 }}
        transition={jointGlow ? { duration: 1.8, repeat: Infinity, ease: 'easeInOut', delay: 0.25 } : {}}
      />

      {/* Joint label */}
      {(isTransverse || (!hasActiveHighlight)) && (
        <motion.g
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <line
            x1={p(jx, -2, BH)[0]} y1={p(jx, -2, BH)[1]}
            x2={p(jx, -2, BH)[0] + 40} y2={p(jx, -2, BH)[1] - 25}
            stroke={isTransverse ? '#00e5ff' : '#5a6e80'} strokeWidth="0.8" strokeDasharray="3,2"
          />
          <rect
            x={p(jx, -2, BH)[0] + 42 - 2} y={p(jx, -2, BH)[1] - 25 - 10}
            width="115" height="18" rx="3"
            fill="#0f172a" stroke={isTransverse ? '#00e5ff' : '#3d5060'} strokeWidth="0.8" opacity="0.95"
          />
          <text
            x={p(jx, -2, BH)[0] + 42 + 55} y={p(jx, -2, BH)[1] - 25 - 0}
            textAnchor="middle" fill={isTransverse ? '#00e5ff' : '#6a8090'} fontSize="8" fontWeight="600"
          >
            TRANSVERSE BUTT JOINT
          </text>
        </motion.g>
      )}

      {/* ═══════════ BLOCK SHIFT INDICATORS ═══════════ */}
      {isBlockShift && (
        <g>
          {/* Block shift label */}
          <motion.g initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.5 }}>
            <rect
              x={p(jx, BW + 3, BH)[0] - 55} y={p(jx, BW + 3, BH)[1] - 8}
              width="110" height="22" rx="4"
              fill="#1a2535" stroke="#f59e0b" strokeWidth="1.2" opacity="0.95"
            />
            <text
              x={p(jx, BW + 3, BH)[0]} y={p(jx, BW + 3, BH)[1] + 6}
              textAnchor="middle" fill="#f59e0b" fontSize="9" fontWeight="700" letterSpacing="0.5"
            >
              BLOCK SHIFT
            </text>
          </motion.g>

          {/* Insert plate markers along the Z-joint */}
          {[
            p(jx - 5, 10, BH),
            p(jx + 5, 24, BH),
          ].map((pt, i) => (
            <motion.g key={`ins-${i}`}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5 + i * 0.2, type: 'spring', damping: 12 }}
            >
              <motion.circle
                cx={pt[0]} cy={pt[1]} r="7"
                fill="none" stroke="#f59e0b" strokeWidth="1.5"
                strokeDasharray="3,2"
                animate={{ r: [7, 9, 7] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              <circle cx={pt[0]} cy={pt[1]} r="2.5" fill="#f59e0b" />
              <text x={pt[0]} y={pt[1] + 16} textAnchor="middle" fill="#d4a017" fontSize="7" fontWeight="500">
                Insert
              </text>
            </motion.g>
          ))}

          {/* Stagger arrows showing shift direction */}
          <motion.g initial={{ opacity: 0 }} animate={{ opacity: 0.6 }} transition={{ delay: 0.8 }}>
            {/* Arrow from straight to offset */}
            {(() => {
              const a = p(jx, 5, BH);
              const b = p(jx - 5, 10, BH);
              return (
                <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]}
                  stroke="#f59e0b" strokeWidth="1" markerEnd="url(#arrow-amber)" opacity="0.5" />
              );
            })()}
          </motion.g>
        </g>
      )}

      {/* ═══════════ INTERSECTION RED DOTS ═══════════ */}
      {isIntersections && allIntersections.map((pt, i) => (
        <g key={`int-${i}`}>
          <motion.circle
            cx={pt[0]} cy={pt[1]} r="7"
            fill="none" stroke="#ff1744" strokeWidth="2.5"
            filter="url(#glow-red)"
            initial={{ opacity: 0.3 }}
            animate={{ opacity: [0.3, 1, 0.3], r: [6, 9, 6] }}
            transition={{ duration: 1.3, repeat: Infinity, delay: i * 0.12 }}
          />
          <motion.circle
            cx={pt[0]} cy={pt[1]} r="2.5"
            fill="#ff1744"
            animate={{ scale: [0.8, 1.2, 0.8] }}
            transition={{ duration: 1.3, repeat: Infinity, delay: i * 0.12 }}
          />
        </g>
      ))}

      {/* Intersection label */}
      {isIntersections && (
        <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
          <rect x="165" y="400" width="290" height="20" rx="4" fill="#1a0a10" stroke="#ff1744" strokeWidth="1" opacity="0.9" />
          <text x="310" y="414" textAnchor="middle" fill="#ff1744" fontSize="9" fontWeight="600">
            Critical NDE inspection points — CTOD testing required
          </text>
        </motion.g>
      )}

      {/* ═══════════ RADAR / SCAN EFFECT ═══════════ */}
      {isRadar && allIntersections.map((pt, i) => (
        <g key={`radar-${i}`}>
          <circle cx={pt[0]} cy={pt[1]} r="3" fill="#00e5ff" opacity="0.9" />
          {[0, 0.6, 1.2].map((delay, j) => (
            <motion.circle
              key={`rw-${i}-${j}`}
              cx={pt[0]} cy={pt[1]}
              fill="none" stroke="#00e5ff" strokeWidth="1.2"
              filter="url(#glow-radar)"
              initial={{ r: 3, opacity: 0.8 }}
              animate={{ r: [3, 28], opacity: [0.8, 0] }}
              transition={{ duration: 2.2, repeat: Infinity, delay, ease: 'easeOut' }}
            />
          ))}
        </g>
      ))}

      {/* Radar label */}
      {isRadar && (
        <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
          <rect x="180" y="400" width="260" height="20" rx="4" fill="#0a1520" stroke="#00e5ff" strokeWidth="1" opacity="0.9" />
          <text x="310" y="414" textAnchor="middle" fill="#00e5ff" fontSize="9" fontWeight="600">
            Periodic in-service NDE scan locations
          </text>
        </motion.g>
      )}

      {/* ═══════════ TOOLTIP (from flowchart) ═══════════ */}
      {tooltip && !isIntersections && !isRadar && (
        <motion.g initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.4 }}>
          <rect
            x="120" y="392" width="380" height="48" rx="6"
            fill="#0c1825" stroke={highlightColor} strokeWidth="1.5" opacity="0.95"
          />
          <text x="310" y="412" textAnchor="middle" fill={highlightColor} fontSize="10" fontWeight="600">
            {tooltip}
          </text>
          <text x="310" y="428" textAnchor="middle" fill="#6a8090" fontSize="8.5">
            Transverse butt welds at block-to-block joint boundaries
          </text>
        </motion.g>
      )}

      {/* ═══════════ LEGEND ═══════════ */}
      <g transform="translate(14, 396)">
        <rect x="0" y="0" width="100" height="54" rx="5" fill="#0c1520" stroke="#1e3040" strokeWidth="0.8" opacity="0.95" />
        <text x="50" y="12" textAnchor="middle" fill="#6a8090" fontSize="7" fontWeight="600" letterSpacing="0.5">LEGEND</text>
        <line x1="10" y1="24" x2="28" y2="24" stroke="#6a8090" strokeWidth="0.7" strokeDasharray="4,3" />
        <text x="34" y="27" fill="#5a7080" fontSize="7">Longitudinal</text>
        <line x1="10" y1="40" x2="28" y2="40" stroke={jointColor} strokeWidth="2.5" />
        <text x="34" y="43" fill="#8899aa" fontSize="7">Transverse</text>
      </g>

      {/* ═══════════ AXIS INDICATOR ═══════════ */}
      <g transform="translate(575, 420)" opacity="0.35">
        <line x1="0" y1="0" x2={18 * C30} y2={18 * S30} stroke="#8899aa" strokeWidth="0.8" />
        <text x={20 * C30 + 2} y={20 * S30 + 2} fill="#8899aa" fontSize="7" fontWeight="500">X</text>
        <line x1="0" y1="0" x2={-18 * C30} y2={18 * S30} stroke="#8899aa" strokeWidth="0.8" />
        <text x={-20 * C30 - 6} y={20 * S30 + 2} fill="#8899aa" fontSize="7" fontWeight="500">Y</text>
        <line x1="0" y1="0" x2="0" y2="-18" stroke="#8899aa" strokeWidth="0.8" />
        <text x="-3" y="-22" fill="#8899aa" fontSize="7" fontWeight="500">Z</text>
      </g>
    </svg>
  );
}
