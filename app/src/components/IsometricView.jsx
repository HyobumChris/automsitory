import { motion } from 'framer-motion';

// Isometric projection math
const C30 = Math.cos(Math.PI / 6);
const S30 = 0.5;
const SCALE = 2.6;
const CX = 295;
const CY = 215;

function p(x, y, z) {
  return [
    CX + (x - y) * C30 * SCALE,
    CY + (x + y) * S30 * SCALE - z * SCALE,
  ];
}

function pts(...coords) {
  return coords.map(c => p(...c).join(',')).join(' ');
}

// Block dimensions
const BL = 48; // half-length each block
const BW = 32; // width (depth)
const BH = 26; // height

// Longitudinal positions on top face (y values)
const LONG_Y_TOP = [8, 16, 24];
// Longitudinal positions on front face (z values)
const LONG_Z_FRONT = [8, 17];
// Frame positions on end face (y values)
const FRAME_Y_END = [8, 16, 24];

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

  // Joint line coordinates (straight or Z-shaped)
  const jx = BL; // joint at x = BL
  const jointTopStraight = [p(jx, 0, BH), p(jx, BW, BH)];
  const jointFrontStraight = [p(jx, 0, 0), p(jx, 0, BH)];

  // Z-shaped block shift on top face
  const jointTopShifted = [
    p(jx, 0, BH),
    p(jx - 4, 10, BH),
    p(jx + 4, 22, BH),
    p(jx, BW, BH),
  ];

  // Z-shaped on front face
  const jointFrontShifted = [
    p(jx, 0, 0),
    p(jx - 4, 0, 10),
    p(jx + 4, 0, 17),
    p(jx, 0, BH),
  ];

  const jointTop = isBlockShift ? jointTopShifted : jointTopStraight;
  const jointFront = isBlockShift ? jointFrontShifted : jointFrontStraight;

  const jointTopPath = `M ${jointTop.map(pt => pt.join(',')).join(' L ')}`;
  const jointFrontPath = `M ${jointFront.map(pt => pt.join(',')).join(' L ')}`;

  // Intersection points (where longitudinals meet the joint)
  const intersectionPointsTop = LONG_Y_TOP.map(y => p(jx, y, BH));
  const intersectionPointsFront = LONG_Z_FRONT.map(z => p(jx, 0, z));
  const allIntersections = [...intersectionPointsTop, ...intersectionPointsFront];

  // Joint highlight properties
  const jointStroke = isTransverse ? '#00e5ff' : isBlockShift ? '#f59e0b' : isIntersections ? '#ff1744' : '#94a3b8';
  const jointWidth = (isTransverse || isBlockShift || isIntersections) ? 4 : 1.5;
  const jointGlow = (isTransverse || isBlockShift || isIntersections);

  return (
    <svg viewBox="0 0 620 460" className="w-full h-full" style={{ maxHeight: '100%' }}>
      <defs>
        <filter id="glow-joint" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feFlood floodColor={jointStroke} floodOpacity="0.7" result="color" />
          <feComposite in2="blur" operator="in" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <filter id="glow-red" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feFlood floodColor="#ff1744" floodOpacity="0.8" result="color" />
          <feComposite in2="blur" operator="in" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <filter id="glow-cyan-soft" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feFlood floodColor="#00e5ff" floodOpacity="0.6" result="color" />
          <feComposite in2="blur" operator="in" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Steel texture pattern */}
        <linearGradient id="top-a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4a5568" />
          <stop offset="100%" stopColor="#3d4a5c" />
        </linearGradient>
        <linearGradient id="top-b" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#525e6f" />
          <stop offset="100%" stopColor="#475569" />
        </linearGradient>
        <linearGradient id="front-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3d4a5c" />
          <stop offset="100%" stopColor="#2d3748" />
        </linearGradient>
        <linearGradient id="end-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#334155" />
          <stop offset="100%" stopColor="#1e293b" />
        </linearGradient>
      </defs>

      {/* Background */}
      <rect width="620" height="460" fill="#0a1628" rx="8" />
      {/* Subtle grid */}
      {Array.from({ length: 31 }, (_, i) => (
        <line key={`vg${i}`} x1={i * 20} y1="0" x2={i * 20} y2="460" stroke="#111d2e" strokeWidth="0.3" />
      ))}
      {Array.from({ length: 24 }, (_, i) => (
        <line key={`hg${i}`} x1="0" y1={i * 20} x2="620" y2={i * 20} stroke="#111d2e" strokeWidth="0.3" />
      ))}

      {/* Title */}
      <text x="310" y="28" textAnchor="middle" fill="#94a3b8" fontSize="12" fontWeight="600" letterSpacing="1">
        3D ISOMETRIC VIEW — BLOCK JOINT
      </text>

      {/* ═══ DRAW END FACE (x = 2*BL) — behind everything ═══ */}
      <polygon
        points={pts([2 * BL, 0, 0], [2 * BL, BW, 0], [2 * BL, BW, BH], [2 * BL, 0, BH])}
        fill="url(#end-grad)" stroke="#475569" strokeWidth="0.8"
      />
      {/* Internal frames on end face */}
      {FRAME_Y_END.map((y, i) => (
        <line key={`ef-h-${i}`}
          x1={p(2 * BL, y, 0)[0]} y1={p(2 * BL, y, 0)[1]}
          x2={p(2 * BL, y, BH)[0]} y2={p(2 * BL, y, BH)[1]}
          stroke="#475569" strokeWidth="0.5" opacity="0.6"
        />
      ))}
      {[8, 17].map((z, i) => (
        <line key={`ef-v-${i}`}
          x1={p(2 * BL, 0, z)[0]} y1={p(2 * BL, 0, z)[1]}
          x2={p(2 * BL, BW, z)[0]} y2={p(2 * BL, BW, z)[1]}
          stroke="#475569" strokeWidth="0.5" opacity="0.6"
        />
      ))}
      {/* End face label */}
      <text
        x={p(2 * BL, BW / 2, BH / 2)[0]} y={p(2 * BL, BW / 2, BH / 2)[1]}
        textAnchor="middle" fill="#64748b" fontSize="8" fontWeight="500"
      >
        SECTION
      </text>

      {/* ═══ DRAW FRONT FACE (y=0) ═══ */}
      {/* Block A front */}
      <polygon
        points={pts([0, 0, 0], [BL, 0, 0], [BL, 0, BH], [0, 0, BH])}
        fill="url(#front-grad)" stroke="#4a5568" strokeWidth="0.8"
      />
      {/* Block B front */}
      <polygon
        points={pts([BL, 0, 0], [2 * BL, 0, 0], [2 * BL, 0, BH], [BL, 0, BH])}
        fill="url(#front-grad)" stroke="#4a5568" strokeWidth="0.8"
      />

      {/* Longitudinal stiffener lines on front face */}
      {LONG_Z_FRONT.map((z, i) => (
        <line key={`lf-${i}`}
          x1={p(0, 0, z)[0]} y1={p(0, 0, z)[1]}
          x2={p(2 * BL, 0, z)[0]} y2={p(2 * BL, 0, z)[1]}
          stroke="#566578"
          strokeWidth={(isTransverse || isBlockShift) ? 0.5 : 0.8}
          opacity={(isTransverse || isBlockShift) ? 0.3 : 0.6}
          strokeDasharray="4,3"
        />
      ))}

      {/* ═══ DRAW TOP FACES ═══ */}
      {/* Block A top */}
      <polygon
        points={pts([0, 0, BH], [BL, 0, BH], [BL, BW, BH], [0, BW, BH])}
        fill="url(#top-a)" stroke="#5a6a7e" strokeWidth="0.8"
      />
      {/* Block B top */}
      <polygon
        points={pts([BL, 0, BH], [2 * BL, 0, BH], [2 * BL, BW, BH], [BL, BW, BH])}
        fill="url(#top-b)" stroke="#5a6a7e" strokeWidth="0.8"
      />

      {/* Longitudinal stiffener lines on top face */}
      {LONG_Y_TOP.map((y, i) => (
        <line key={`lt-${i}`}
          x1={p(0, y, BH)[0]} y1={p(0, y, BH)[1]}
          x2={p(2 * BL, y, BH)[0]} y2={p(2 * BL, y, BH)[1]}
          stroke="#6b7a8e"
          strokeWidth={(isTransverse || isBlockShift) ? 0.5 : 0.8}
          opacity={(isTransverse || isBlockShift) ? 0.3 : 0.6}
          strokeDasharray="6,4"
        />
      ))}

      {/* ═══ BLOCK LABELS ═══ */}
      <text
        x={p(BL / 2, BW / 2, BH)[0]} y={p(BL / 2, BW / 2, BH)[1] - 2}
        textAnchor="middle" fill="#94a3b8" fontSize="11" fontWeight="600"
      >
        BLOCK A
      </text>
      <text
        x={p(BL + BL / 2, BW / 2, BH)[0]} y={p(BL + BL / 2, BW / 2, BH)[1] - 2}
        textAnchor="middle" fill="#94a3b8" fontSize="11" fontWeight="600"
      >
        BLOCK B
      </text>

      {/* ═══ TRANSVERSE BUTT JOINT LINE ═══ */}
      {/* Joint on top face */}
      <motion.path
        d={jointTopPath}
        fill="none"
        stroke={jointStroke}
        strokeWidth={jointWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={jointGlow ? 'url(#glow-joint)' : 'none'}
        initial={false}
        animate={jointGlow ? { opacity: [0.6, 1, 0.6] } : { opacity: 1 }}
        transition={jointGlow ? { duration: 1.5, repeat: Infinity } : {}}
      />
      {/* Joint on front face */}
      <motion.path
        d={jointFrontPath}
        fill="none"
        stroke={jointStroke}
        strokeWidth={jointWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={jointGlow ? 'url(#glow-joint)' : 'none'}
        initial={false}
        animate={jointGlow ? { opacity: [0.6, 1, 0.6] } : { opacity: 1 }}
        transition={jointGlow ? { duration: 1.5, repeat: Infinity, delay: 0.2 } : {}}
      />

      {/* ═══ BLOCK SHIFT LABELS ═══ */}
      {isBlockShift && (
        <g>
          {/* Z-shape label */}
          <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
            <rect
              x={p(jx - 6, -5, BH)[0] - 45} y={p(jx - 6, -5, BH)[1] - 10}
              width="90" height="20" rx="4" fill="#1e293b" stroke="#f59e0b" strokeWidth="1" opacity="0.9"
            />
            <text
              x={p(jx - 6, -5, BH)[0]} y={p(jx - 6, -5, BH)[1] + 4}
              textAnchor="middle" fill="#f59e0b" fontSize="9" fontWeight="600"
            >
              BLOCK SHIFT
            </text>
          </motion.g>

          {/* Insert plate indicators */}
          {[10, 22].map((y, i) => {
            const cx = p(jx + (i === 0 ? -4 : 4), y, BH);
            return (
              <motion.g key={`ins-${i}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 + i * 0.2 }}>
                <circle cx={cx[0]} cy={cx[1]} r="5" fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="2,2" />
                <circle cx={cx[0]} cy={cx[1]} r="2" fill="#f59e0b" />
              </motion.g>
            );
          })}
        </g>
      )}

      {/* ═══ INTERSECTION HIGHLIGHTS (Red Pulsing Dots) ═══ */}
      {isIntersections && allIntersections.map((pt, i) => (
        <g key={`int-${i}`}>
          <motion.circle
            cx={pt[0]} cy={pt[1]} r="6"
            fill="none" stroke="#ff1744" strokeWidth="2"
            filter="url(#glow-red)"
            initial={{ opacity: 0.4, scale: 0.8 }}
            animate={{ opacity: [0.4, 1, 0.4], scale: [0.8, 1.2, 0.8] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.15 }}
          />
          <circle cx={pt[0]} cy={pt[1]} r="2.5" fill="#ff1744" />
        </g>
      ))}

      {/* ═══ RADAR / SCAN EFFECT ═══ */}
      {isRadar && allIntersections.map((pt, i) => (
        <g key={`radar-${i}`}>
          <circle cx={pt[0]} cy={pt[1]} r="3" fill="#00e5ff" />
          {[0, 0.7, 1.4].map((delay, j) => (
            <motion.circle
              key={`rw-${i}-${j}`}
              cx={pt[0]} cy={pt[1]}
              r="4"
              fill="none" stroke="#00e5ff" strokeWidth="1.5"
              filter="url(#glow-cyan-soft)"
              initial={{ r: 4, opacity: 1 }}
              animate={{ r: 25, opacity: 0 }}
              transition={{ duration: 2, repeat: Infinity, delay: delay, ease: 'easeOut' }}
            />
          ))}
        </g>
      ))}

      {/* ═══ TOOLTIP ═══ */}
      {tooltip && (
        <motion.g initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <rect
            x="140" y="395" width="340" height="44" rx="6"
            fill="#0f172a" stroke={highlightColor} strokeWidth="1.5" opacity="0.95"
          />
          <text x="310" y="415" textAnchor="middle" fill={highlightColor} fontSize="10" fontWeight="600">
            {tooltip}
          </text>
          <text x="310" y="430" textAnchor="middle" fill="#94a3b8" fontSize="9">
            Transverse butt welds at block joint boundaries
          </text>
        </motion.g>
      )}

      {/* ═══ LEGEND ═══ */}
      <g transform="translate(16, 400)">
        <rect x="0" y="0" width="130" height="50" rx="4" fill="#0f172a" stroke="#1e293b" strokeWidth="1" opacity="0.9" />
        <line x1="10" y1="16" x2="30" y2="16" stroke="#566578" strokeWidth="1" strokeDasharray="4,3" />
        <text x="36" y="19" fill="#64748b" fontSize="8">Longitudinal Joints</text>
        <line x1="10" y1="34" x2="30" y2="34" stroke={jointStroke} strokeWidth="2.5" />
        <text x="36" y="37" fill="#94a3b8" fontSize="8">Transverse Butt Joint</text>
      </g>

      {/* Axis indicators */}
      <g transform="translate(50, 420)" opacity="0.4">
        <line x1="0" y1="0" x2={20 * C30} y2={20 * S30} stroke="#94a3b8" strokeWidth="0.8" />
        <text x={22 * C30} y={22 * S30 + 3} fill="#94a3b8" fontSize="7">X (Fwd)</text>
        <line x1="0" y1="0" x2={-20 * C30} y2={20 * S30} stroke="#94a3b8" strokeWidth="0.8" />
        <text x={-24 * C30 - 5} y={22 * S30 + 3} fill="#94a3b8" fontSize="7">Y</text>
        <line x1="0" y1="0" x2="0" y2="-20" stroke="#94a3b8" strokeWidth="0.8" />
        <text x="-3" y="-24" fill="#94a3b8" fontSize="7">Z</text>
      </g>
    </svg>
  );
}
