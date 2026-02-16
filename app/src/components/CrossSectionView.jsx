import { motion } from 'framer-motion';

const PARTS = {
  'coaming-top': {
    label: 'Hatch Coaming\nTop Plate',
    labelPos: [490, 82],
    leaderFrom: [448, 88],
    leaderTo: [440, 88],
  },
  'coaming-side': {
    label: 'Hatch Side\nCoaming Plate',
    labelPos: [490, 175],
    leaderFrom: [470, 175],
    leaderTo: [352, 175],
  },
  'upper-deck': {
    label: 'Upper Deck',
    labelPos: [490, 265],
    leaderFrom: [480, 268],
    leaderTo: [440, 268],
  },
  'sheer-strake': {
    label: 'Sheer\nStrake',
    labelPos: [20, 310],
    leaderFrom: [50, 300],
    leaderTo: [70, 280],
  },
  'longitudinals': {
    label: 'Longitudinals',
    labelPos: [20, 380],
    leaderFrom: [70, 370],
    leaderTo: [150, 340],
  },
};

function isHighlighted(partId, highlights) {
  if (!highlights || highlights.length === 0) return false;
  return highlights.includes(partId);
}

export default function CrossSectionView({ highlights = [], highlightColor = '#60a5fa' }) {
  const getPartFill = (partId, baseFill) => {
    if (isHighlighted(partId, highlights)) return highlightColor;
    return baseFill;
  };

  const getPartStroke = (partId) => {
    if (isHighlighted(partId, highlights)) return highlightColor;
    return '#94a3b8';
  };

  const getPartFilter = (partId) => {
    if (isHighlighted(partId, highlights)) return 'url(#highlight-glow)';
    return 'none';
  };

  const getPartOpacity = (partId) => {
    if (highlights.length === 0) return 1;
    if (isHighlighted(partId, highlights)) return 1;
    return 0.35;
  };

  return (
    <svg viewBox="0 0 620 460" className="w-full h-full" style={{ maxHeight: '100%' }}>
      <defs>
        <filter id="highlight-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feFlood floodColor={highlightColor} floodOpacity="0.5" result="color" />
          <feComposite in2="blur" operator="in" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Cross-hatch pattern for steel sections */}
        <pattern id="steel-hatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="#475569" strokeWidth="0.5" opacity="0.3" />
        </pattern>

        <pattern id="steel-hatch-hl" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke={highlightColor} strokeWidth="0.5" opacity="0.3" />
        </pattern>
      </defs>

      {/* Background grid */}
      <rect width="620" height="460" fill="#0a1628" rx="8" />
      {Array.from({ length: 31 }, (_, i) => (
        <line key={`vg${i}`} x1={i * 20} y1="0" x2={i * 20} y2="460" stroke="#1e293b" strokeWidth="0.5" />
      ))}
      {Array.from({ length: 24 }, (_, i) => (
        <line key={`hg${i}`} x1="0" y1={i * 20} x2="620" y2={i * 20} stroke="#1e293b" strokeWidth="0.5" />
      ))}

      {/* Title */}
      <text x="310" y="30" textAnchor="middle" fill="#94a3b8" fontSize="12" fontWeight="600" letterSpacing="1">
        CROSS-SECTION VIEW — Fig 8.2.1
      </text>

      {/* ─── HATCH COAMING TOP PLATE ─── */}
      <g opacity={getPartOpacity('coaming-top')}>
        <rect
          x="260" y="72" width="180" height="20"
          fill={getPartFill('coaming-top', '#4a5568')}
          stroke={getPartStroke('coaming-top')}
          strokeWidth={isHighlighted('coaming-top', highlights) ? 2.5 : 1}
          filter={getPartFilter('coaming-top')}
          rx="1"
        />
        <rect x="260" y="72" width="180" height="20" fill="url(#steel-hatch)" rx="1" />
        {isHighlighted('coaming-top', highlights) && (
          <motion.rect
            x="258" y="70" width="184" height="24" rx="2"
            fill="none" stroke={highlightColor} strokeWidth="2"
            initial={{ opacity: 0.4 }} animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        )}
      </g>

      {/* ─── HATCH SIDE COAMING PLATE ─── */}
      <g opacity={getPartOpacity('coaming-side')}>
        <rect
          x="325" y="92" width="24" height="168"
          fill={getPartFill('coaming-side', '#4a5568')}
          stroke={getPartStroke('coaming-side')}
          strokeWidth={isHighlighted('coaming-side', highlights) ? 2.5 : 1}
          filter={getPartFilter('coaming-side')}
          rx="1"
        />
        <rect x="325" y="92" width="24" height="168" fill="url(#steel-hatch)" rx="1" />
        {isHighlighted('coaming-side', highlights) && (
          <motion.rect
            x="323" y="90" width="28" height="172" rx="2"
            fill="none" stroke={highlightColor} strokeWidth="2"
            initial={{ opacity: 0.4 }} animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        )}
      </g>

      {/* Coaming bracket / stiffener */}
      <g opacity={Math.max(getPartOpacity('coaming-side'), getPartOpacity('upper-deck'))}>
        <polygon
          points="325,260 302,260 325,220"
          fill="#3d4a5c" stroke="#64748b" strokeWidth="0.8"
        />
        <polygon
          points="349,260 372,260 349,220"
          fill="#3d4a5c" stroke="#64748b" strokeWidth="0.8"
        />
      </g>

      {/* ─── UPPER DECK PLATE ─── */}
      <g opacity={getPartOpacity('upper-deck')}>
        <rect
          x="72" y="258" width="480" height="16"
          fill={getPartFill('upper-deck', '#3d4a5c')}
          stroke={getPartStroke('upper-deck')}
          strokeWidth={isHighlighted('upper-deck', highlights) ? 2.5 : 1}
          filter={getPartFilter('upper-deck')}
          rx="1"
        />
        <rect x="72" y="258" width="480" height="16" fill="url(#steel-hatch)" rx="1" />
        {isHighlighted('upper-deck', highlights) && (
          <motion.rect
            x="70" y="256" width="484" height="20" rx="2"
            fill="none" stroke={highlightColor} strokeWidth="2"
            initial={{ opacity: 0.4 }} animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        )}
      </g>

      {/* ─── SHEER STRAKE ─── */}
      <g opacity={getPartOpacity('sheer-strake')}>
        <rect
          x="55" y="170" width="18" height="190"
          fill={getPartFill('sheer-strake', '#4a5568')}
          stroke={getPartStroke('sheer-strake')}
          strokeWidth={isHighlighted('sheer-strake', highlights) ? 2.5 : 1}
          filter={getPartFilter('sheer-strake')}
          rx="1"
        />
        <rect x="55" y="170" width="18" height="190" fill="url(#steel-hatch)" rx="1" />
        {isHighlighted('sheer-strake', highlights) && (
          <motion.rect
            x="53" y="168" width="22" height="194" rx="2"
            fill="none" stroke={highlightColor} strokeWidth="2"
            initial={{ opacity: 0.4 }} animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        )}
      </g>

      {/* Corner connection: sheer strake to deck */}
      <g opacity={Math.max(getPartOpacity('sheer-strake'), getPartOpacity('upper-deck'))}>
        <line x1="73" y1="258" x2="73" y2="248" stroke="#64748b" strokeWidth="1" />
        <line x1="73" y1="248" x2="83" y2="258" stroke="#64748b" strokeWidth="1" />
      </g>

      {/* ─── LONGITUDINALS (T-bar stiffeners under deck) ─── */}
      <g opacity={getPartOpacity('longitudinals')}>
        {[140, 210, 400, 470, 530].map((x, i) => (
          <g key={`long-${i}`}>
            {/* Web */}
            <rect
              x={x - 2} y="274" width="4" height="55"
              fill={getPartFill('longitudinals', '#3d4a5c')}
              stroke={getPartStroke('longitudinals')}
              strokeWidth={isHighlighted('longitudinals', highlights) ? 1.5 : 0.5}
            />
            {/* Flange */}
            <rect
              x={x - 10} y="327" width="20" height="5"
              fill={getPartFill('longitudinals', '#3d4a5c')}
              stroke={getPartStroke('longitudinals')}
              strokeWidth={isHighlighted('longitudinals', highlights) ? 1.5 : 0.5}
              rx="0.5"
            />
          </g>
        ))}
      </g>

      {/* ─── LABELS & LEADERS ─── */}
      {Object.entries(PARTS).map(([partId, part]) => {
        const hl = isHighlighted(partId, highlights);
        const labelOpacity = highlights.length === 0 ? 0.85 : (hl ? 1 : 0.25);
        return (
          <g key={partId} opacity={labelOpacity}>
            <line
              x1={part.leaderFrom[0]} y1={part.leaderFrom[1]}
              x2={part.leaderTo[0]} y2={part.leaderTo[1]}
              stroke={hl ? highlightColor : '#64748b'}
              strokeWidth={hl ? 1.5 : 0.8}
              strokeDasharray={hl ? 'none' : '3,2'}
            />
            <circle
              cx={part.leaderTo[0]} cy={part.leaderTo[1]} r="2.5"
              fill={hl ? highlightColor : '#64748b'}
            />
            {part.label.split('\n').map((line, li) => (
              <text
                key={li}
                x={part.labelPos[0]} y={part.labelPos[1] + li * 14}
                fill={hl ? highlightColor : '#94a3b8'}
                fontSize="11"
                fontWeight={hl ? '600' : '400'}
              >
                {line}
              </text>
            ))}
          </g>
        );
      })}

      {/* Dimension markings */}
      <g opacity="0.5">
        {/* Coaming height dimension */}
        <line x1="240" y1="76" x2="240" y2="268" stroke="#64748b" strokeWidth="0.5" strokeDasharray="2,2" />
        <line x1="236" y1="76" x2="244" y2="76" stroke="#64748b" strokeWidth="0.8" />
        <line x1="236" y1="268" x2="244" y2="268" stroke="#64748b" strokeWidth="0.8" />
        <text x="232" y="175" fill="#64748b" fontSize="9" textAnchor="middle" transform="rotate(-90, 232, 175)">
          Coaming Height
        </text>

        {/* Deck thickness marker */}
        <line x1="560" y1="258" x2="575" y2="258" stroke="#64748b" strokeWidth="0.5" />
        <line x1="560" y1="274" x2="575" y2="274" stroke="#64748b" strokeWidth="0.5" />
        <text x="582" y="270" fill="#64748b" fontSize="8">t</text>
      </g>

      {/* Hatch opening indicator */}
      <g opacity="0.5">
        <line x1="350" y1="52" x2="350" y2="68" stroke="#475569" strokeWidth="0.5" strokeDasharray="2,2" />
        <text x="350" y="48" textAnchor="middle" fill="#475569" fontSize="9">
          ← HATCH OPENING
        </text>
        <line x1="72" y1="52" x2="72" y2="68" stroke="#475569" strokeWidth="0.5" strokeDasharray="2,2" />
        <text x="72" y="48" textAnchor="middle" fill="#475569" fontSize="9">
          HULL SIDE →
        </text>
      </g>

      {/* Bottom structure hint */}
      <g opacity="0.3">
        <line x1="73" y1="360" x2="550" y2="360" stroke="#334155" strokeWidth="0.5" strokeDasharray="4,4" />
        <text x="310" y="375" textAnchor="middle" fill="#334155" fontSize="9">Inner Bottom</text>
      </g>
    </svg>
  );
}
