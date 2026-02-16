import { motion } from 'framer-motion'; // eslint-disable-line no-unused-vars

const PARTS_META = {
  'coaming-top': {
    label: 'Hatch Coaming Top Plate',
    labelPos: [470, 78],
    leaderEnd: [440, 85],
    leaderStart: [460, 82],
  },
  'coaming-side': {
    label: 'Hatch Side Coaming Plate',
    labelPos: [470, 170],
    leaderEnd: [352, 170],
    leaderStart: [460, 170],
  },
  'upper-deck': {
    label: 'Upper Deck',
    labelPos: [470, 258],
    leaderEnd: [440, 261],
    leaderStart: [460, 261],
  },
  'sheer-strake': {
    label: 'Sheer Strake',
    labelPos: [12, 355],
    leaderEnd: [70, 310],
    leaderStart: [55, 340],
  },
  'longitudinals': {
    label: 'Longitudinals',
    labelPos: [12, 405],
    leaderEnd: [148, 322],
    leaderStart: [60, 395],
  },
};

function isHL(partId, highlights) {
  if (!highlights || !highlights.length) return false;
  return highlights.includes(partId);
}

export default function CrossSectionView({ highlights = [], highlightColor = '#60a5fa' }) {
  const getFill = (id, base) => isHL(id, highlights) ? highlightColor : base;
  const getStroke = (id) => isHL(id, highlights) ? highlightColor : '#7a8ca0';
  const getSW = (id) => isHL(id, highlights) ? 2.5 : 1;
  const getFilter = (id) => isHL(id, highlights) ? 'url(#cs-glow)' : 'none';
  const getOpacity = (id) => {
    if (!highlights.length) return 1;
    return isHL(id, highlights) ? 1 : 0.3;
  };

  return (
    <svg viewBox="0 0 620 460" className="w-full h-full" style={{ maxHeight: '100%' }}>
      <defs>
        <filter id="cs-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feFlood floodColor={highlightColor} floodOpacity="0.45" result="color" />
          <feComposite in2="blur" operator="in" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Cross-hatch pattern */}
        <pattern id="cs-hatch" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="5" stroke="#5a6e80" strokeWidth="0.4" opacity="0.25" />
        </pattern>
        <pattern id="cs-hatch2" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(-45)">
          <line x1="0" y1="0" x2="0" y2="5" stroke="#5a6e80" strokeWidth="0.4" opacity="0.15" />
        </pattern>
      </defs>

      {/* Background */}
      <rect width="620" height="460" fill="#0a1628" rx="8" />

      {/* Engineering grid */}
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
        CROSS-SECTION VIEW — HATCH COAMING DETAIL (Fig 8.2.1)
      </text>

      {/* ─── Center line (ship center axis indicator) ─── */}
      <line x1="350" y1="45" x2="350" y2="55" stroke="#2d4050" strokeWidth="0.8" strokeDasharray="8,4" />

      {/* ═══════════ HATCH COAMING TOP PLATE ═══════════ */}
      <g opacity={getOpacity('coaming-top')}>
        <rect
          x="255" y="68" width="185" height="22"
          fill={getFill('coaming-top', '#3d5060')}
          stroke={getStroke('coaming-top')}
          strokeWidth={getSW('coaming-top')}
          filter={getFilter('coaming-top')}
          rx="1"
        />
        {/* Cross hatch texture */}
        <rect x="255" y="68" width="185" height="22" fill="url(#cs-hatch)" rx="1" />
        <rect x="255" y="68" width="185" height="22" fill="url(#cs-hatch2)" rx="1" />

        {/* Thickness dimension */}
        <g opacity="0.5">
          <line x1="250" y1="68" x2="245" y2="68" stroke="#5a7585" strokeWidth="0.5" />
          <line x1="250" y1="90" x2="245" y2="90" stroke="#5a7585" strokeWidth="0.5" />
          <line x1="247" y1="68" x2="247" y2="90" stroke="#5a7585" strokeWidth="0.5" />
          <text x="240" y="82" textAnchor="end" fill="#5a7585" fontSize="7">t</text>
        </g>

        {isHL('coaming-top', highlights) && (
          <motion.rect
            x="253" y="66" width="189" height="26" rx="3"
            fill="none" stroke={highlightColor} strokeWidth="2"
            initial={{ opacity: 0.3 }}
            animate={{ opacity: [0.3, 0.9, 0.3] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        )}
      </g>

      {/* ═══════════ HATCH SIDE COAMING PLATE ═══════════ */}
      <g opacity={getOpacity('coaming-side')}>
        <rect
          x="326" y="90" width="22" height="163"
          fill={getFill('coaming-side', '#3d5060')}
          stroke={getStroke('coaming-side')}
          strokeWidth={getSW('coaming-side')}
          filter={getFilter('coaming-side')}
          rx="1"
        />
        <rect x="326" y="90" width="22" height="163" fill="url(#cs-hatch)" rx="1" />
        <rect x="326" y="90" width="22" height="163" fill="url(#cs-hatch2)" rx="1" />

        {/* Thickness dimension */}
        <g opacity="0.5">
          <line x1="326" y1="95" x2="326" y2="100" stroke="#5a7585" strokeWidth="0.5" />
          <line x1="348" y1="95" x2="348" y2="100" stroke="#5a7585" strokeWidth="0.5" />
          <line x1="326" y1="97" x2="348" y2="97" stroke="#5a7585" strokeWidth="0.5" />
          <text x="337" y="108" textAnchor="middle" fill="#5a7585" fontSize="7">t</text>
        </g>

        {isHL('coaming-side', highlights) && (
          <motion.rect
            x="324" y="88" width="26" height="167" rx="3"
            fill="none" stroke={highlightColor} strokeWidth="2"
            initial={{ opacity: 0.3 }}
            animate={{ opacity: [0.3, 0.9, 0.3] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        )}
      </g>

      {/* ═══════════ COAMING BRACKETS ═══════════ */}
      <g opacity={Math.max(getOpacity('coaming-side'), getOpacity('upper-deck')) * 0.8}>
        {/* Port side bracket */}
        <polygon
          points="326,253 300,253 326,218"
          fill="#2d4050" stroke="#4a6070" strokeWidth="0.8" strokeLinejoin="round"
        />
        {/* Stbd side bracket */}
        <polygon
          points="348,253 374,253 348,218"
          fill="#2d4050" stroke="#4a6070" strokeWidth="0.8" strokeLinejoin="round"
        />
        {/* Small stiffener on bracket */}
        <line x1="313" y1="253" x2="326" y2="236" stroke="#4a6070" strokeWidth="0.5" strokeDasharray="2,1" />
        <line x1="361" y1="253" x2="348" y2="236" stroke="#4a6070" strokeWidth="0.5" strokeDasharray="2,1" />
      </g>

      {/* ═══════════ UPPER DECK PLATE ═══════════ */}
      <g opacity={getOpacity('upper-deck')}>
        <rect
          x="68" y="251" width="490" height="16"
          fill={getFill('upper-deck', '#344555')}
          stroke={getStroke('upper-deck')}
          strokeWidth={getSW('upper-deck')}
          filter={getFilter('upper-deck')}
          rx="1"
        />
        <rect x="68" y="251" width="490" height="16" fill="url(#cs-hatch)" rx="1" />

        {isHL('upper-deck', highlights) && (
          <motion.rect
            x="66" y="249" width="494" height="20" rx="3"
            fill="none" stroke={highlightColor} strokeWidth="2"
            initial={{ opacity: 0.3 }}
            animate={{ opacity: [0.3, 0.9, 0.3] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        )}
      </g>

      {/* ═══════════ SHEER STRAKE ═══════════ */}
      <g opacity={getOpacity('sheer-strake')}>
        <rect
          x="50" y="160" width="20" height="200"
          fill={getFill('sheer-strake', '#3d5060')}
          stroke={getStroke('sheer-strake')}
          strokeWidth={getSW('sheer-strake')}
          filter={getFilter('sheer-strake')}
          rx="1"
        />
        <rect x="50" y="160" width="20" height="200" fill="url(#cs-hatch)" rx="1" />
        <rect x="50" y="160" width="20" height="200" fill="url(#cs-hatch2)" rx="1" />

        {isHL('sheer-strake', highlights) && (
          <motion.rect
            x="48" y="158" width="24" height="204" rx="3"
            fill="none" stroke={highlightColor} strokeWidth="2"
            initial={{ opacity: 0.3 }}
            animate={{ opacity: [0.3, 0.9, 0.3] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        )}
      </g>

      {/* Sheer strake to deck connection detail */}
      <g opacity={Math.max(getOpacity('sheer-strake'), getOpacity('upper-deck')) * 0.7}>
        <path d="M 70,251 L 70,245 L 78,251" fill="none" stroke="#5a7585" strokeWidth="0.8" />
        <circle cx="70" cy="251" r="1.5" fill="#5a7585" />
      </g>

      {/* ═══════════ LONGITUDINAL STIFFENERS ═══════════ */}
      <g opacity={getOpacity('longitudinals')}>
        {[140, 215, 410, 480, 540].map((x, i) => (
          <g key={`stiff-${i}`}>
            {/* Web */}
            <rect
              x={x - 2} y="267" width="4" height="58"
              fill={getFill('longitudinals', '#2d4050')}
              stroke={getStroke('longitudinals')}
              strokeWidth={isHL('longitudinals', highlights) ? 1.5 : 0.6}
              rx="0.5"
            />
            {/* Flange */}
            <rect
              x={x - 12} y="323" width="24" height="5"
              fill={getFill('longitudinals', '#2d4050')}
              stroke={getStroke('longitudinals')}
              strokeWidth={isHL('longitudinals', highlights) ? 1.5 : 0.6}
              rx="0.8"
            />
            {/* Weld symbol at deck connection */}
            <circle cx={x - 3} cy="267" r="1" fill="#5a7585" opacity="0.5" />
            <circle cx={x + 3} cy="267" r="1" fill="#5a7585" opacity="0.5" />
          </g>
        ))}
      </g>

      {/* ═══════════ LABELS & LEADER LINES ═══════════ */}
      {Object.entries(PARTS_META).map(([partId, meta]) => {
        const hl = isHL(partId, highlights);
        const opacity = !highlights.length ? 0.85 : (hl ? 1 : 0.2);
        const color = hl ? highlightColor : '#7a8ca0';
        return (
          <g key={partId} opacity={opacity}>
            <line
              x1={meta.leaderStart[0]} y1={meta.leaderStart[1]}
              x2={meta.leaderEnd[0]} y2={meta.leaderEnd[1]}
              stroke={color} strokeWidth={hl ? 1.2 : 0.6} strokeDasharray={hl ? 'none' : '3,2'}
            />
            <circle cx={meta.leaderEnd[0]} cy={meta.leaderEnd[1]} r={hl ? 3 : 2} fill={color} />
            <text
              x={meta.labelPos[0]} y={meta.labelPos[1]}
              fill={color} fontSize="10" fontWeight={hl ? '700' : '400'} letterSpacing="0.3"
            >
              {meta.label}
            </text>
          </g>
        );
      })}

      {/* ═══════════ CONTEXT INDICATORS ═══════════ */}
      <g opacity="0.4">
        {/* Hatch opening arrow */}
        <path d="M 365,55 L 405,55" stroke="#3d5060" strokeWidth="0.8" markerEnd="none" />
        <text x="385" y="50" textAnchor="middle" fill="#3d5060" fontSize="8" fontWeight="500">
          HATCH OPENING
        </text>
        <path d="M 365,55 L 370,52 L 370,58 Z" fill="#3d5060" />

        {/* Hull exterior arrow */}
        <text x="55" y="148" textAnchor="middle" fill="#3d5060" fontSize="8" fontWeight="500">
          HULL
        </text>
        <text x="55" y="157" textAnchor="middle" fill="#3d5060" fontSize="8" fontWeight="500">
          SIDE
        </text>

        {/* Inner bottom hint */}
        <line x1="68" y1="380" x2="558" y2="380" stroke="#1e3040" strokeWidth="0.6" strokeDasharray="6,4" />
        <text x="310" y="395" textAnchor="middle" fill="#1e3040" fontSize="8">Inner Bottom</text>
      </g>

      {/* Section cut markers */}
      <g opacity="0.25">
        <line x1="30" y1="42" x2="30" y2="440" stroke="#2d4050" strokeWidth="1.5" />
        <text x="30" y="445" textAnchor="middle" fill="#2d4050" fontSize="9" fontWeight="700">A</text>
        <line x1="590" y1="42" x2="590" y2="440" stroke="#2d4050" strokeWidth="1.5" />
        <text x="590" y="445" textAnchor="middle" fill="#2d4050" fontSize="9" fontWeight="700">A</text>
      </g>
    </svg>
  );
}
