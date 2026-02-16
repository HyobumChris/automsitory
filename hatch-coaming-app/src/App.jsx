import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion"; // eslint-disable-line no-unused-vars
import {
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Scan,
  Layers,
  Info,
  RotateCcw,
  Gauge,
  Ship,
} from "lucide-react";

/* ═══════════════════════════════════════════════
   FLOWCHART STATE MACHINE
   ═══════════════════════════════════════════════ */

const STEPS = {
  eh36_start: {
    id: "eh36_start",
    grade: "EH36",
    question: "Is hatch coaming thickness t > 85 mm?",
    view: "A",
    highlight: "coaming",
    highlightColor: "#06b6d4",
    tooltip: null,
    yes: "eh36_measure1",
    no: "eh36_standard",
  },
  eh36_standard: {
    id: "eh36_standard",
    grade: "EH36",
    label: "Standard materials — no additional measures required.",
    view: "A",
    highlight: "coaming",
    highlightColor: "#94a3b8",
    tooltip: "No extra measures for t ≤ 85 mm on EH36 grade.",
    terminal: true,
  },
  eh36_measure1: {
    id: "eh36_measure1",
    grade: "EH36",
    label: "[Measure 1] 100% NDE on all upper flange longitudinal members",
    view: "B",
    highlight: "transverse",
    highlightColor: "#06b6d4",
    tooltip: "Measure 1: 100% UT strictly applies to Block-to-Block Butt Welds",
    terminal: true,
  },

  eh40_start: {
    id: "eh40_start",
    grade: "EH40",
    question: "Is hatch coaming top or side thickness t > 85 mm?",
    view: "A",
    highlight: "coaming-both",
    highlightColor: "#06b6d4",
    yes: "eh40_crack_arrest_q",
    no: "eh40_no85_measure1",
  },
  eh40_no85_measure1: {
    id: "eh40_no85_measure1",
    grade: "EH40",
    label: "[Measure 1] 100% NDE on all upper flange longitudinal members",
    view: "B",
    highlight: "transverse",
    highlightColor: "#06b6d4",
    tooltip: "Measure 1: 100% UT strictly applies to Block-to-Block Butt Welds",
    terminal: true,
  },
  eh40_crack_arrest_q: {
    id: "eh40_crack_arrest_q",
    grade: "EH40",
    question: "Crack arrest design?",
    view: "A",
    highlight: "coaming-both",
    highlightColor: "#f59e0b",
    yes: "eh40_ca_measure3",
    no: "eh40_nca_measure3",
  },
  eh40_ca_measure3: {
    id: "eh40_ca_measure3",
    grade: "EH40",
    label: "[Measure 3] Crack arrest steel for hatch coaming",
    view: "A",
    highlight: "coaming-both",
    highlightColor: "#f59e0b",
    tooltip: "Crack arrest steel required for hatch coaming structure.",
    next: "eh40_ca_side_q",
  },
  eh40_ca_side_q: {
    id: "eh40_ca_side_q",
    grade: "EH40",
    question: "Is hatch coaming side thickness t > 80 mm?",
    view: "A",
    highlight: "coaming-side",
    highlightColor: "#eab308",
    yes: "eh40_ca_bca2",
    no: "eh40_ca_bca1",
  },
  eh40_ca_bca2: {
    id: "eh40_ca_bca2",
    grade: "EH40",
    label: "BCA2 steel required for hatch coaming side",
    view: "A",
    highlight: "coaming-side",
    highlightColor: "#eab308",
    tooltip: "BCA2: High-performance crack arrest steel for thick plates (>80 mm).",
    next: "eh40_ca_block_shift",
  },
  eh40_ca_bca1: {
    id: "eh40_ca_bca1",
    grade: "EH40",
    label: "BCA1 steel required for hatch coaming side",
    view: "A",
    highlight: "coaming-side",
    highlightColor: "#eab308",
    tooltip: "BCA1: Standard crack arrest steel for plates ≤ 80 mm.",
    next: "eh40_ca_block_shift",
  },
  eh40_ca_block_shift: {
    id: "eh40_ca_block_shift",
    grade: "EH40",
    label: "Block shift / Crack arrest insert plates or holes",
    view: "B",
    highlight: "block-shift",
    highlightColor: "#f59e0b",
    tooltip: "Staggered block joint design prevents crack propagation across blocks.",
    next: "eh40_ca_welding",
  },
  eh40_ca_welding: {
    id: "eh40_ca_welding",
    grade: "EH40",
    label: "FCAW / GMAW / EGW welding process required",
    view: "B",
    highlight: "transverse",
    highlightColor: "#a855f7",
    tooltip: "Controlled welding processes reduce residual stress and defects.",
    next: "eh40_ca_measures45",
  },
  eh40_ca_measures45: {
    id: "eh40_ca_measures45",
    grade: "EH40",
    label: "[Measures 4 & 5] Crack arrest steel for upper deck & sheer strake (BCA1)",
    view: "A",
    highlight: "deck-sheer",
    highlightColor: "#10b981",
    tooltip: "Upper deck and sheer strake require BCA1 crack arrest steel.",
    next: "eh40_ca_final_measure1",
  },
  eh40_ca_final_measure1: {
    id: "eh40_ca_final_measure1",
    grade: "EH40",
    label: "[Measure 1] 100% NDE on all upper flange longitudinal members",
    view: "B",
    highlight: "transverse",
    highlightColor: "#06b6d4",
    tooltip: "Measure 1: 100% UT strictly applies to Block-to-Block Butt Welds",
    terminal: true,
  },
  eh40_nca_measure3: {
    id: "eh40_nca_measure3",
    grade: "EH40",
    label: "[Measure 3] Enhanced NDE with stricter criteria",
    view: "B",
    highlight: "red-intersections",
    highlightColor: "#ef4444",
    tooltip: "CTOD test based on LR ShipRight",
    next: "eh40_nca_shipright",
  },
  eh40_nca_shipright: {
    id: "eh40_nca_shipright",
    grade: "EH40",
    label: "ShipRight Procedure Use",
    view: "B",
    highlight: "transverse",
    highlightColor: "#a855f7",
    tooltip: "LR ShipRight FDA/SDA procedures for fatigue & structural assessment.",
    next: "eh40_nca_welding",
  },
  eh40_nca_welding: {
    id: "eh40_nca_welding",
    grade: "EH40",
    label: "FCAW / GMAW welding process",
    view: "B",
    highlight: "transverse",
    highlightColor: "#a855f7",
    tooltip: "Controlled welding processes for enhanced joint quality.",
    next: "eh40_nca_measure2",
  },
  eh40_nca_measure2: {
    id: "eh40_nca_measure2",
    grade: "EH40",
    label: "[Measure 2] Periodic in-service NDE",
    view: "B",
    highlight: "radar-scan",
    highlightColor: "#06b6d4",
    tooltip: "Periodic ultrasonic inspection of critical weld joints during service.",
    next: "eh40_nca_measures45",
  },
  eh40_nca_measures45: {
    id: "eh40_nca_measures45",
    grade: "EH40",
    label: "[Measures 4 & 5] Crack arrest steel for upper deck & sheer strake",
    view: "A",
    highlight: "deck-sheer",
    highlightColor: "#10b981",
    tooltip: "Upper deck and sheer strake require crack arrest steel.",
    next: "eh40_nca_final_measure1",
  },
  eh40_nca_final_measure1: {
    id: "eh40_nca_final_measure1",
    grade: "EH40",
    label: "[Measure 1] 100% NDE on all upper flange longitudinal members",
    view: "B",
    highlight: "transverse",
    highlightColor: "#06b6d4",
    tooltip: "Measure 1: 100% UT strictly applies to Block-to-Block Butt Welds",
    terminal: true,
  },

  eh47_crack_arrest_q: {
    id: "eh47_crack_arrest_q",
    grade: "EH47",
    question: "Crack arrest design?",
    view: "A",
    highlight: "coaming-both",
    highlightColor: "#f59e0b",
    yes: "eh47_ca_measure3",
    no: "eh47_nca_measure3",
  },
  eh47_ca_measure3: {
    id: "eh47_ca_measure3",
    grade: "EH47",
    label: "[Measure 3] Crack arrest steel for hatch coaming",
    view: "A",
    highlight: "coaming-both",
    highlightColor: "#f59e0b",
    tooltip: "Crack arrest steel required for hatch coaming structure.",
    next: "eh47_ca_side_q",
  },
  eh47_ca_side_q: {
    id: "eh47_ca_side_q",
    grade: "EH47",
    question: "Is hatch coaming side thickness t > 80 mm?",
    view: "A",
    highlight: "coaming-side",
    highlightColor: "#eab308",
    yes: "eh47_ca_bca2",
    no: "eh47_ca_bca1",
  },
  eh47_ca_bca2: {
    id: "eh47_ca_bca2",
    grade: "EH47",
    label: "BCA2 steel required for hatch coaming side",
    view: "A",
    highlight: "coaming-side",
    highlightColor: "#eab308",
    tooltip: "BCA2: High-performance crack arrest steel for thick plates (>80 mm).",
    next: "eh47_ca_block_shift",
  },
  eh47_ca_bca1: {
    id: "eh47_ca_bca1",
    grade: "EH47",
    label: "BCA1 steel required for hatch coaming side",
    view: "A",
    highlight: "coaming-side",
    highlightColor: "#eab308",
    tooltip: "BCA1: Standard crack arrest steel for plates ≤ 80 mm.",
    next: "eh47_ca_block_shift",
  },
  eh47_ca_block_shift: {
    id: "eh47_ca_block_shift",
    grade: "EH47",
    label: "Block shift / Crack arrest insert plates or holes",
    view: "B",
    highlight: "block-shift",
    highlightColor: "#f59e0b",
    tooltip: "Staggered block joint design prevents crack propagation across blocks.",
    next: "eh47_ca_welding",
  },
  eh47_ca_welding: {
    id: "eh47_ca_welding",
    grade: "EH47",
    label: "FCAW / GMAW / EGW welding process required",
    view: "B",
    highlight: "transverse",
    highlightColor: "#a855f7",
    tooltip: "Controlled welding processes reduce residual stress and defects.",
    next: "eh47_ca_measures45",
  },
  eh47_ca_measures45: {
    id: "eh47_ca_measures45",
    grade: "EH47",
    label: "[Measures 4 & 5] Crack arrest steel for upper deck & sheer strake (BCA1)",
    view: "A",
    highlight: "deck-sheer",
    highlightColor: "#10b981",
    tooltip: "Upper deck and sheer strake require BCA1 crack arrest steel.",
    next: "eh47_ca_final_measure1",
  },
  eh47_ca_final_measure1: {
    id: "eh47_ca_final_measure1",
    grade: "EH47",
    label: "[Measure 1] 100% NDE on all upper flange longitudinal members",
    view: "B",
    highlight: "transverse",
    highlightColor: "#06b6d4",
    tooltip: "Measure 1: 100% UT strictly applies to Block-to-Block Butt Welds",
    terminal: true,
  },
  eh47_nca_measure3: {
    id: "eh47_nca_measure3",
    grade: "EH47",
    label: "[Measure 3] Enhanced NDE with stricter criteria",
    view: "B",
    highlight: "red-intersections",
    highlightColor: "#ef4444",
    tooltip: "CTOD test based on LR ShipRight",
    next: "eh47_nca_shipright",
  },
  eh47_nca_shipright: {
    id: "eh47_nca_shipright",
    grade: "EH47",
    label: "ShipRight Procedure Use",
    view: "B",
    highlight: "transverse",
    highlightColor: "#a855f7",
    tooltip: "LR ShipRight FDA/SDA procedures for fatigue & structural assessment.",
    next: "eh47_nca_welding",
  },
  eh47_nca_welding: {
    id: "eh47_nca_welding",
    grade: "EH47",
    label: "FCAW / GMAW welding process",
    view: "B",
    highlight: "transverse",
    highlightColor: "#a855f7",
    tooltip: "Controlled welding processes for enhanced joint quality.",
    next: "eh47_nca_measure2",
  },
  eh47_nca_measure2: {
    id: "eh47_nca_measure2",
    grade: "EH47",
    label: "[Measure 2] Periodic in-service NDE",
    view: "B",
    highlight: "radar-scan",
    highlightColor: "#06b6d4",
    tooltip: "Periodic ultrasonic inspection of critical weld joints during service.",
    next: "eh47_nca_measures45",
  },
  eh47_nca_measures45: {
    id: "eh47_nca_measures45",
    grade: "EH47",
    label: "[Measures 4 & 5] Crack arrest steel for upper deck & sheer strake",
    view: "A",
    highlight: "deck-sheer",
    highlightColor: "#10b981",
    tooltip: "Upper deck and sheer strake require crack arrest steel.",
    next: "eh47_nca_final_measure1",
  },
  eh47_nca_final_measure1: {
    id: "eh47_nca_final_measure1",
    grade: "EH47",
    label: "[Measure 1] 100% NDE on all upper flange longitudinal members",
    view: "B",
    highlight: "transverse",
    highlightColor: "#06b6d4",
    tooltip: "Measure 1: 100% UT strictly applies to Block-to-Block Butt Welds",
    terminal: true,
  },
};

const GRADE_START = {
  EH36: "eh36_start",
  EH40: "eh40_start",
  EH47: "eh47_crack_arrest_q",
};

/* ═══════════════════════════════════════════════
   ISOMETRIC PROJECTION HELPERS
   ═══════════════════════════════════════════════ */

const CX = 310;
const CY = 200;
const S = 0.82;

function isoX(x, y) {
  return CX + (x - y) * 0.866 * S;
}
function isoY(x, y, z) {
  return CY + (x + y) * 0.5 * S - z * S;
}
function isoPoint(x, y, z) {
  return `${isoX(x, y)},${isoY(x, y, z)}`;
}

/* ═══════════════════════════════════════════════
   VIEW A — 2D CROSS-SECTION (Fig 8.2.1)
   ═══════════════════════════════════════════════ */

function DimArrow({ x1, y1, x2, y2, label, offset = 0 }) {
  const mx = (x1 + x2) / 2 + offset;
  const my = (y1 + y2) / 2;
  const isVertical = Math.abs(x1 - x2) < 2;
  return (
    <g>
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="#475569"
        strokeWidth="0.6"
        strokeDasharray="3 2"
      />
      <polygon
        points={
          isVertical
            ? `${x1 - 3},${y1 + 6} ${x1},${y1} ${x1 + 3},${y1 + 6}`
            : `${x1 + 6},${y1 - 3} ${x1},${y1} ${x1 + 6},${y1 + 3}`
        }
        fill="#475569"
      />
      <polygon
        points={
          isVertical
            ? `${x2 - 3},${y2 - 6} ${x2},${y2} ${x2 + 3},${y2 - 6}`
            : `${x2 - 6},${y2 - 3} ${x2},${y2} ${x2 - 6},${y2 + 3}`
        }
        fill="#475569"
      />
      {label && (
        <text
          x={mx}
          y={my}
          textAnchor="middle"
          fill="#64748b"
          fontSize="8"
          fontFamily="monospace"
          transform={isVertical ? `rotate(-90,${mx},${my})` : ""}
        >
          {label}
        </text>
      )}
    </g>
  );
}

function ViewA({ highlight, highlightColor }) {
  const isCoamingSide =
    highlight === "coaming-side" || highlight === "coaming-both";
  const isCoamingTop =
    highlight === "coaming" || highlight === "coaming-both";
  const isDeckSheer = highlight === "deck-sheer";

  const DIM = "#475569";

  const coamingTopFill = isCoamingTop ? highlightColor : "#4a5568";
  const coamingSideFill = isCoamingSide ? highlightColor : "#4a5568";
  const deckFill = isDeckSheer ? highlightColor : "#556677";
  const sheerFill = isDeckSheer ? highlightColor : "#556677";

  const glow = (active, color) =>
    active
      ? `drop-shadow(0 0 6px ${color}99) drop-shadow(0 0 14px ${color}55)`
      : "none";

  return (
    <svg viewBox="0 0 620 500" className="w-full h-full">
      <defs>
        <linearGradient id="bgA" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0c1222" />
          <stop offset="100%" stopColor="#131b2e" />
        </linearGradient>
        <pattern id="gridA" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#182030" strokeWidth="0.4" />
        </pattern>
        <filter id="gA">
          <feGaussianBlur stdDeviation="6" result="b" />
          <feFlood floodColor={highlightColor} floodOpacity="0.5" />
          <feComposite in2="b" operator="in" />
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect width="620" height="500" fill="url(#bgA)" />
      <rect width="620" height="500" fill="url(#gridA)" opacity="0.5" />

      {/* Title block */}
      <rect x="10" y="8" width="600" height="24" rx="4" fill="#111827" stroke="#1e293b" strokeWidth="0.5" />
      <text x="310" y="24" textAnchor="middle" fill="#94a3b8" fontSize="11" fontFamily="monospace" fontWeight="bold">
        CROSS-SECTION VIEW — LR Rules Fig 8.2.1
      </text>

      {/* Centerline */}
      <line x1="310" y1="45" x2="310" y2="475" stroke="#1e293b" strokeWidth="0.8" strokeDasharray="10 5" />
      <text x="318" y="55" fill="#334155" fontSize="9" fontFamily="monospace">CL</text>

      {/* ═══ HATCH COAMING TOP PLATE ═══ */}
      <motion.g
        style={{ filter: glow(isCoamingTop, highlightColor) }}
        animate={{ opacity: 1 }}
      >
        <rect x="160" y="95" width="300" height="16" fill={coamingTopFill} rx="1" stroke="#334155" strokeWidth="0.5" />
        {isCoamingTop && (
          <motion.rect
            x="160" y="95" width="300" height="16" fill="none"
            stroke={highlightColor} strokeWidth="2.5" rx="1"
            animate={{ opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        )}
      </motion.g>
      <text x="310" y="88" textAnchor="middle" fill={isCoamingTop ? highlightColor : "#8899aa"} fontSize="9" fontFamily="monospace" fontWeight="bold">
        HATCH COAMING TOP PLATE
      </text>

      {/* ═══ HATCH SIDE COAMING (LEFT + RIGHT) ═══ */}
      {[{ x: 160 }, { x: 444 }].map((side, si) => (
        <motion.g key={si} style={{ filter: glow(isCoamingSide, highlightColor) }}>
          <rect x={side.x} y={111} width="16" height="148" fill={coamingSideFill} rx="1" stroke="#334155" strokeWidth="0.5" />
          {isCoamingSide && (
            <motion.rect
              x={side.x} y={111} width="16" height="148" fill="none"
              stroke={highlightColor} strokeWidth="2.5" rx="1"
              animate={{ opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
          )}
        </motion.g>
      ))}

      {/* Side coaming labels (vertical) */}
      <text x="142" y="186" textAnchor="middle" fill={isCoamingSide ? highlightColor : "#778899"} fontSize="8" fontFamily="monospace" fontWeight="bold" transform="rotate(-90,142,186)">
        SIDE COAMING
      </text>
      <text x="478" y="186" textAnchor="middle" fill={isCoamingSide ? highlightColor : "#778899"} fontSize="8" fontFamily="monospace" fontWeight="bold" transform="rotate(90,478,186)">
        SIDE COAMING
      </text>

      {/* Hatch coaming inner stiffeners (horizontal brackets) */}
      {[135, 175, 215].map((yy, i) => (
        <g key={`bkt-${i}`}>
          <rect x="176" y={yy} width="24" height="3" fill="#3a4555" rx="0.5" />
          <rect x="420" y={yy} width="24" height="3" fill="#3a4555" rx="0.5" />
        </g>
      ))}

      {/* ═══ UPPER DECK ═══ */}
      <motion.g style={{ filter: glow(isDeckSheer, highlightColor) }}>
        <rect x="55" y="259" width="510" height="12" fill={deckFill} stroke="#334155" strokeWidth="0.5" />
        {isDeckSheer && (
          <motion.rect
            x="55" y="259" width="510" height="12" fill="none"
            stroke={highlightColor} strokeWidth="2.5"
            animate={{ opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        )}
      </motion.g>
      <text x="310" y="286" textAnchor="middle" fill={isDeckSheer ? highlightColor : "#8899aa"} fontSize="9.5" fontFamily="monospace" fontWeight="bold">
        UPPER DECK PLATING
      </text>

      {/* Bracket connections (coaming to deck) */}
      <polygon points="160,259 160,245 176,259" fill="#3a4555" stroke="#334155" strokeWidth="0.3" />
      <polygon points="460,259 460,245 444,259" fill="#3a4555" stroke="#334155" strokeWidth="0.3" />

      {/* ═══ SHEER STRAKE (Left + Right) ═══ */}
      {[{ x: 42 }, { x: 558 }].map((side, si) => (
        <motion.g key={`ss-${si}`} style={{ filter: glow(isDeckSheer, highlightColor) }}>
          <rect x={side.x} y="215" width="13" height="120" fill={sheerFill} stroke="#334155" strokeWidth="0.5" />
          {isDeckSheer && (
            <motion.rect
              x={side.x} y="215" width="13" height="120" fill="none"
              stroke={highlightColor} strokeWidth="2.5"
              animate={{ opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
          )}
        </motion.g>
      ))}
      <text x="22" y="278" textAnchor="middle" fill={isDeckSheer ? highlightColor : "#778899"} fontSize="7" fontFamily="monospace" transform="rotate(-90,22,278)">
        SHEER STRAKE
      </text>
      <text x="598" y="278" textAnchor="middle" fill={isDeckSheer ? highlightColor : "#778899"} fontSize="7" fontFamily="monospace" transform="rotate(90,598,278)">
        SHEER STRAKE
      </text>

      {/* ═══ LONGITUDINAL STIFFENERS (T-bars below deck) ═══ */}
      {[120, 195, 270, 350, 425, 500].map((lx, i) => (
        <g key={`lon-${i}`}>
          <rect x={lx - 2} y="271" width="4" height="55" fill="#364152" stroke="#2a3444" strokeWidth="0.3" />
          <rect x={lx - 12} y="322" width="24" height="4" fill="#364152" stroke="#2a3444" strokeWidth="0.3" rx="0.5" />
        </g>
      ))}
      <text x="310" y="348" textAnchor="middle" fill="#64748b" fontSize="8" fontFamily="monospace">
        LONGITUDINAL STIFFENERS (T-bars)
      </text>

      {/* ═══ WEB FRAMES (transverse structure) ═══ */}
      <rect x="55" y="360" width="510" height="4" fill="#2d3a4a" stroke="#1e293b" strokeWidth="0.3" />
      <text x="310" y="378" textAnchor="middle" fill="#475569" fontSize="7.5" fontFamily="monospace">
        TRANSVERSE WEB FRAME
      </text>

      {/* ═══ INNER BOTTOM ═══ */}
      <rect x="55" y="410" width="510" height="8" fill="#2d3a4a" stroke="#334155" strokeWidth="0.5" />
      <text x="310" y="434" textAnchor="middle" fill="#475569" fontSize="8" fontFamily="monospace">
        INNER BOTTOM PLATING
      </text>

      {/* Double bottom stiffeners */}
      {[120, 195, 270, 350, 425, 500].map((lx, i) => (
        <g key={`db-${i}`}>
          <rect x={lx - 1.5} y="418" width="3" height="30" fill="#28333f" />
        </g>
      ))}

      {/* ═══ BOTTOM SHELL ═══ */}
      <rect x="55" y="454" width="510" height="6" fill="#2d3a4a" stroke="#334155" strokeWidth="0.5" />
      <text x="310" y="474" textAnchor="middle" fill="#475569" fontSize="7.5" fontFamily="monospace">
        BOTTOM SHELL
      </text>

      {/* Side shell connections */}
      <line x1="55" y1="271" x2="42" y2="335" stroke="#4a5568" strokeWidth="2" />
      <line x1="565" y1="271" x2="571" y2="335" stroke="#4a5568" strokeWidth="2" />

      {/* ═══ DIMENSION ANNOTATIONS ═══ */}
      <DimArrow x1={135} y1={95} x2={135} y2={259} label="Coaming Height" offset={-10} />

      {/* Thickness callouts */}
      <g>
        <line x1="463" y1="95" x2="510" y2="75" stroke={DIM} strokeWidth="0.5" />
        <circle cx="510" cy="75" r="1.5" fill={DIM} />
        <text x="515" y="73" fill="#94a3b8" fontSize="7" fontFamily="monospace">t top</text>
      </g>
      <g>
        <line x1="463" y1="185" x2="510" y2="170" stroke={DIM} strokeWidth="0.5" />
        <circle cx="510" cy="170" r="1.5" fill={DIM} />
        <text x="515" y="168" fill="#94a3b8" fontSize="7" fontFamily="monospace">t side</text>
      </g>

      {/* Weld symbols at key connections */}
      {[
        [160, 259],
        [460, 259],
        [55, 259],
        [565, 259],
      ].map(([wx, wy], i) => (
        <g key={`weld-${i}`}>
          <path
            d={`M ${wx - 4} ${wy - 4} L ${wx} ${wy + 2} L ${wx + 4} ${wy - 4}`}
            fill="none"
            stroke="#f59e0b"
            strokeWidth="1"
            opacity="0.5"
          />
        </g>
      ))}

      {/* Drawing border */}
      <rect x="4" y="4" width="612" height="492" fill="none" stroke="#1e293b" strokeWidth="1" rx="6" />
    </svg>
  );
}

/* ═══════════════════════════════════════════════
   VIEW B — 3D ISOMETRIC BLOCK JOINT (Premium CAD)
   ═══════════════════════════════════════════════ */

function ViewB({ highlight, highlightColor }) {
  const isTransverse = highlight === "transverse";
  const isBlockShift = highlight === "block-shift";
  const isRedIntersections = highlight === "red-intersections";
  const isRadarScan = highlight === "radar-scan";

  const transColor =
    isTransverse || isBlockShift ? highlightColor : "#3b4252";

  const face = (pts, fill, stroke = "#2d3a4a", sw = 0.5) => {
    const d = pts.map((p) => isoPoint(p[0], p[1], p[2])).join(" ");
    return <polygon points={d} fill={fill} stroke={stroke} strokeWidth={sw} />;
  };

  const box = (ox, oy, oz, w, d, h, topC, frontC, sideC) => {
    const p = [
      [ox, oy, oz],
      [ox + w, oy, oz],
      [ox + w, oy + d, oz],
      [ox, oy + d, oz],
      [ox, oy, oz + h],
      [ox + w, oy, oz + h],
      [ox + w, oy + d, oz + h],
      [ox, oy + d, oz + h],
    ];
    return (
      <g>
        {face([p[4], p[5], p[6], p[7]], topC)}
        {face([p[0], p[1], p[5], p[4]], frontC)}
        {face([p[1], p[2], p[6], p[5]], sideC)}
      </g>
    );
  };

  const stiffenerX = (ox, oy, oz, len, h, opacity = 0.5) => {
    const pts = [
      [ox, oy, oz],
      [ox + len, oy, oz],
      [ox + len, oy, oz + h],
      [ox, oy, oz + h],
    ];
    return (
      <polygon
        points={pts.map((p) => isoPoint(p[0], p[1], p[2])).join(" ")}
        fill="#4a5568"
        stroke="#3b4252"
        strokeWidth="0.4"
        opacity={opacity}
      />
    );
  };

  const transverseJointSeam = () => {
    if (isBlockShift) {
      const shiftPts = [
        [0, -8, 140], [0, 35, 140], [0, 35, 115],
        [6, 35, 115], [6, 90, 115], [6, 90, 140],
        [0, 90, 140], [0, 140, 140], [0, 140, 0],
        [0, 90, 0], [6, 90, 0], [6, 90, 25],
        [6, 35, 25], [6, 35, 0], [0, 35, 0], [0, -8, 0],
      ];
      const d = shiftPts.map((p) => isoPoint(p[0], p[1], p[2])).join(" ");

      return (
        <g>
          <motion.polygon
            points={d}
            fill={`${highlightColor}12`}
            stroke={highlightColor}
            strokeWidth="3"
            animate={{ opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <motion.polygon
            points={d}
            fill="none"
            stroke={highlightColor}
            strokeWidth="6"
            opacity="0.15"
            className="animate-pulse-glow"
          />
          {/* Z-shape annotation markers */}
          {[[35, 115], [90, 25]].map(([yy, zz], i) => (
            <motion.circle
              key={i}
              cx={isoX(3, yy)}
              cy={isoY(3, yy, zz)}
              r="5"
              fill={highlightColor}
              opacity="0.6"
              animate={{ r: [4, 7, 4], opacity: [0.4, 0.8, 0.4] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.4 }}
            />
          ))}
          <text
            x={isoX(12, 62)}
            y={isoY(12, 62, 132)}
            fill={highlightColor}
            fontSize="9"
            fontFamily="monospace"
            fontWeight="bold"
          >
            BLOCK SHIFT
          </text>
          <text
            x={isoX(12, 62)}
            y={isoY(12, 62, 122)}
            fill={highlightColor}
            fontSize="7"
            fontFamily="monospace"
            opacity="0.7"
          >
            (Z-stagger joint)
          </text>
        </g>
      );
    }

    const seamPts = [
      [0, -8, 140],
      [0, -8, 0],
      [0, 140, 0],
      [0, 140, 140],
    ];
    const d = seamPts.map((p) => isoPoint(p[0], p[1], p[2])).join(" ");

    return (
      <g>
        <motion.polygon
          points={d}
          fill={isTransverse ? `${transColor}10` : "none"}
          stroke={transColor}
          strokeWidth={isTransverse ? 3 : 0.8}
          animate={
            isTransverse
              ? { strokeWidth: [2, 4, 2], opacity: [0.6, 1, 0.6] }
              : {}
          }
          transition={isTransverse ? { duration: 1.5, repeat: Infinity } : {}}
        />
        {isTransverse && (
          <>
            <motion.polygon
              points={d}
              fill="none"
              stroke={transColor}
              strokeWidth="8"
              opacity="0.12"
              className="animate-pulse-glow"
            />
            {/* Weld bead detail lines along seam */}
            {[10, 30, 50, 70, 90, 110, 130].map((zz, i) => (
              <motion.line
                key={i}
                x1={isoX(0, -5)}
                y1={isoY(0, -5, zz)}
                x2={isoX(0, 135)}
                y2={isoY(0, 135, zz)}
                stroke={transColor}
                strokeWidth="0.5"
                opacity="0.3"
                animate={{ opacity: [0.1, 0.4, 0.1] }}
                transition={{ duration: 2, repeat: Infinity, delay: i * 0.15 }}
              />
            ))}
          </>
        )}
      </g>
    );
  };

  return (
    <svg viewBox="0 0 620 500" className="w-full h-full">
      <defs>
        <linearGradient id="bgB" x1="0" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#0a0f1c" />
          <stop offset="100%" stopColor="#0e1628" />
        </linearGradient>
        <pattern id="gridB" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#141e30" strokeWidth="0.3" />
        </pattern>
        <linearGradient id="blockAGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1a2744" />
          <stop offset="100%" stopColor="#152038" />
        </linearGradient>
        <linearGradient id="blockBGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#141f38" />
          <stop offset="100%" stopColor="#0f1930" />
        </linearGradient>
      </defs>

      <rect width="620" height="500" fill="url(#bgB)" />
      <rect width="620" height="500" fill="url(#gridB)" opacity="0.6" />

      {/* Title block */}
      <rect x="10" y="8" width="600" height="24" rx="4" fill="#111827" stroke="#1e293b" strokeWidth="0.5" />
      <text x="310" y="24" textAnchor="middle" fill="#94a3b8" fontSize="11" fontFamily="monospace" fontWeight="bold">
        3D ISOMETRIC — HULL BLOCK JOINT VIEW
      </text>

      {/* ═══ GROUND SHADOW ═══ */}
      <ellipse
        cx={isoX(0, 65)}
        cy={isoY(0, 65, -10)}
        rx="200"
        ry="40"
        fill="#060a14"
        opacity="0.4"
      />

      {/* ═══ BLOCK A (aft block) ═══ */}
      {box(-130, 0, 0, 130, 132, 130, "#1e2d48", "#182440", "#152038")}

      {/* ═══ BLOCK B (fwd block) ═══ */}
      {box(0, 0, 0, 130, 132, 130, "#192844", "#14203a", "#111c34")}

      {/* ═══ UPPER DECK PLATE ═══ */}
      {box(-130, 0, 130, 130, 132, 8, "#2a4872", "#203d64", "#1a3558")}
      {box(0, 0, 130, 130, 132, 8, "#24426a", "#1c385e", "#183052")}

      {/* ═══ HATCH COAMING SIDE PLATES ═══ */}
      {box(-130, 16, 138, 130, 10, 55, "#2e5282", "#264874", "#203e66")}
      {box(0, 16, 138, 130, 10, 55, "#284c7c", "#22426e", "#1c3860")}

      {/* ═══ HATCH COAMING TOP PLATE ═══ */}
      {box(-130, 12, 193, 260, 20, 7, "#3e6ca0", "#305890", "#28507e")}

      {/* Coaming top plate label */}
      <text
        x={isoX(0, 8)}
        y={isoY(0, 8, 208)}
        fill="#5a90c0"
        fontSize="7"
        fontFamily="monospace"
        opacity="0.8"
      >
        COAMING TOP PL.
      </text>

      {/* ═══ LONGITUDINAL STIFFENERS (run along X, through both blocks) ═══ */}
      {[22, 48, 74, 100, 124].map((yy, i) => (
        <g key={`ls-${i}`}>
          {stiffenerX(-120, yy, 0, 240, 22, 0.35)}
          {stiffenerX(-120, yy, 130, 240, 8, 0.2)}
        </g>
      ))}

      {/* Longitudinal stiffener labels */}
      <text
        x={isoX(-100, 8)}
        y={isoY(-100, 8, 18)}
        fill="#5a7a98"
        fontSize="7"
        fontFamily="monospace"
        opacity="0.7"
      >
        Q.1/Q.2 LONGITUDINAL JOINTS
      </text>
      <line
        x1={isoX(-100, 8)}
        y1={isoY(-100, 8, 16)}
        x2={isoX(-100, 22)}
        y2={isoY(-100, 22, 12)}
        stroke="#5a7a98"
        strokeWidth="0.5"
        opacity="0.4"
      />

      {/* ═══ TRANSVERSE WEB FRAMES (visible cross-braces inside blocks) ═══ */}
      {[-65, 65].map((xx, i) => {
        const pts = [
          [xx, 0, 0], [xx, 132, 0],
          [xx, 132, 130], [xx, 0, 130],
        ];
        return (
          <polygon
            key={`wf-${i}`}
            points={pts.map((p) => isoPoint(p[0], p[1], p[2])).join(" ")}
            fill="#1a2540"
            stroke="#243050"
            strokeWidth="0.4"
            opacity="0.3"
          />
        );
      })}

      {/* ═══ TRANSVERSE BUTT JOINT SEAM ═══ */}
      {transverseJointSeam()}

      {/* Transverse joint label (when active) */}
      {(isTransverse || isBlockShift) && (
        <g>
          <text
            x={isoX(8, -18)}
            y={isoY(8, -18, 75)}
            fill={transColor}
            fontSize="9"
            fontFamily="monospace"
            fontWeight="bold"
          >
            Q.3/Q.4 TRANS. BUTT JOINT
          </text>
          <line
            x1={isoX(4, -10)}
            y1={isoY(4, -10, 73)}
            x2={isoX(0, 10)}
            y2={isoY(0, 10, 70)}
            stroke={transColor}
            strokeWidth="0.6"
            opacity="0.5"
          />
        </g>
      )}

      {/* ═══ BLOCK LABELS ═══ */}
      <text
        x={isoX(-65, 66)}
        y={isoY(-65, 66, 70)}
        textAnchor="middle"
        fill="#4a6888"
        fontSize="16"
        fontFamily="monospace"
        fontWeight="bold"
        opacity="0.3"
      >
        BLOCK A
      </text>
      <text
        x={isoX(-65, 66)}
        y={isoY(-65, 66, 58)}
        textAnchor="middle"
        fill="#4a6888"
        fontSize="8"
        fontFamily="monospace"
        opacity="0.2"
      >
        (AFT)
      </text>
      <text
        x={isoX(65, 66)}
        y={isoY(65, 66, 70)}
        textAnchor="middle"
        fill="#4a6888"
        fontSize="16"
        fontFamily="monospace"
        fontWeight="bold"
        opacity="0.3"
      >
        BLOCK B
      </text>
      <text
        x={isoX(65, 66)}
        y={isoY(65, 66, 58)}
        textAnchor="middle"
        fill="#4a6888"
        fontSize="8"
        fontFamily="monospace"
        opacity="0.2"
      >
        (FWD)
      </text>

      {/* ═══ RED INTERSECTION DOTS (for enhanced NDE) ═══ */}
      {isRedIntersections &&
        [
          [0, 22, 0], [0, 48, 0], [0, 74, 0], [0, 100, 0], [0, 124, 0],
          [0, 22, 130], [0, 48, 130], [0, 74, 130], [0, 100, 130], [0, 124, 130],
        ].map(([x, y, z], i) => (
          <g key={`rd-${i}`}>
            <motion.circle
              cx={isoX(x, y)} cy={isoY(x, y, z)} r="5"
              fill="#ef4444"
              animate={{ r: [3, 7, 3], opacity: [1, 0.4, 1] }}
              transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.12 }}
            />
            <motion.circle
              cx={isoX(x, y)} cy={isoY(x, y, z)} r="5"
              fill="none" stroke="#ef4444" strokeWidth="1.5"
              animate={{ r: [5, 18], opacity: [0.8, 0] }}
              transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.12 }}
            />
          </g>
        ))}

      {/* ═══ RADAR SCAN ICONS (for periodic NDE) ═══ */}
      {isRadarScan &&
        [
          [0, 30, 65], [0, 66, 65], [0, 100, 65],
        ].map(([x, y, z], i) => (
          <g key={`rdr-${i}`}>
            <motion.circle
              cx={isoX(x, y)} cy={isoY(x, y, z)} r="3" fill="#06b6d4"
            />
            {[0, 1, 2].map((ring) => (
              <motion.circle
                key={ring}
                cx={isoX(x, y)} cy={isoY(x, y, z)} r="3"
                fill="none" stroke="#06b6d4" strokeWidth="1.2"
                animate={{ r: [4, 22], opacity: [0.7, 0] }}
                transition={{ duration: 2.2, repeat: Infinity, delay: ring * 0.7 + i * 0.3 }}
              />
            ))}
            {i === 1 && (
              <text
                x={isoX(x, y) + 20}
                y={isoY(x, y, z) - 4}
                fill="#06b6d4"
                fontSize="8"
                fontFamily="monospace"
                fontWeight="bold"
              >
                UT SCAN
              </text>
            )}
          </g>
        ))}

      {/* ═══ AXIS INDICATOR ═══ */}
      <g transform="translate(52, 455)">
        <circle cx="0" cy="0" r="18" fill="#0d1424" stroke="#1e293b" strokeWidth="0.5" />
        <line x1="0" y1="0" x2="16" y2="-8" stroke="#5a90c0" strokeWidth="1.2" />
        <text x="20" y="-7" fill="#5a90c0" fontSize="8" fontFamily="monospace" fontWeight="bold">X</text>
        <line x1="0" y1="0" x2="-16" y2="-8" stroke="#6ac080" strokeWidth="1.2" />
        <text x="-26" y="-7" fill="#6ac080" fontSize="8" fontFamily="monospace" fontWeight="bold">Y</text>
        <line x1="0" y1="0" x2="0" y2="-18" stroke="#c07a5a" strokeWidth="1.2" />
        <text x="4" y="-16" fill="#c07a5a" fontSize="8" fontFamily="monospace" fontWeight="bold">Z</text>
      </g>

      {/* Ship direction arrow */}
      <g transform={`translate(${isoX(130, 66)}, ${isoY(130, 66, 200) + 10})`}>
        <line x1="-20" y1="0" x2="20" y2="0" stroke="#475569" strokeWidth="1" />
        <polygon points="20,-4 28,0 20,4" fill="#475569" />
        <text x="-8" y="-6" fill="#475569" fontSize="7" fontFamily="monospace">FWD</text>
      </g>

      {/* Drawing border */}
      <rect x="4" y="4" width="612" height="492" fill="none" stroke="#1e293b" strokeWidth="1" rx="6" />
    </svg>
  );
}

/* ═══════════════════════════════════════════════
   FLOWCHART NODE COMPONENT
   ═══════════════════════════════════════════════ */

function FlowNode({ step, onYes, onNo, onNext, isActive, isCompleted, index }) {
  const data = STEPS[step];
  if (!data) return null;

  const isQuestion = !!data.question;
  const hasNext = !!data.next;
  const isTerminalNode = !!data.terminal;

  const accentColor = isActive
    ? data.highlightColor || "#06b6d4"
    : isCompleted
      ? "#334155"
      : "#1e293b";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{
        opacity: isActive ? 1 : isCompleted ? 0.55 : 0.35,
        y: 0,
        scale: isActive ? 1 : 0.97,
      }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="relative"
    >
      {index > 0 && (
        <div className="flex justify-center mb-1">
          <motion.div
            className="w-0.5 h-5 rounded-full"
            style={{
              backgroundColor:
                isCompleted || isActive ? "#475569" : "#1e293b",
            }}
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ duration: 0.3 }}
          />
        </div>
      )}

      <div
        className={`
          rounded-lg p-3 border transition-all duration-300
          ${isActive ? "bg-slate-800/90 shadow-xl" : "bg-slate-900/50"}
          ${isQuestion && isActive ? "border-l-4" : "border"}
        `}
        style={{
          borderColor: accentColor,
          boxShadow: isActive ? `0 0 24px ${accentColor}25, 0 0 48px ${accentColor}10` : "none",
        }}
      >
        <div className="flex items-start gap-2.5">
          <div
            className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
            style={{
              backgroundColor: isCompleted
                ? "#10b981"
                : isActive
                  ? `${accentColor}25`
                  : "#1a2030",
              color: isCompleted ? "#fff" : isActive ? accentColor : "#475569",
              border: `1px solid ${isCompleted ? "#10b981" : isActive ? `${accentColor}50` : "#1e293b"}`,
            }}
          >
            {isCompleted ? <CheckCircle2 size={13} /> : index + 1}
          </div>

          <div className="flex-1 min-w-0">
            {isQuestion ? (
              <>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                    Decision
                  </span>
                  {data.view === "A" && (
                    <span className="text-[8px] px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-400">
                      2D
                    </span>
                  )}
                  {data.view === "B" && (
                    <span className="text-[8px] px-1.5 py-0.5 rounded bg-sky-900/50 text-sky-400">
                      3D
                    </span>
                  )}
                </div>
                <p className="text-[13px] font-medium text-slate-200 mb-2.5 leading-snug">
                  {data.question}
                </p>
                {isActive && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="flex gap-2"
                  >
                    <button
                      onClick={onYes}
                      className="px-5 py-1.5 rounded-md text-xs font-bold bg-emerald-600/15 text-emerald-400 border border-emerald-600/30 hover:bg-emerald-600/25 hover:border-emerald-500/50 transition-all cursor-pointer"
                    >
                      YES
                    </button>
                    <button
                      onClick={onNo}
                      className="px-5 py-1.5 rounded-md text-xs font-bold bg-red-600/15 text-red-400 border border-red-600/30 hover:bg-red-600/25 hover:border-red-500/50 transition-all cursor-pointer"
                    >
                      NO
                    </button>
                  </motion.div>
                )}
              </>
            ) : (
              <>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                    {isTerminalNode ? "Final" : "Measure"}
                  </span>
                  {data.view === "A" && (
                    <span className="text-[8px] px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-400">
                      2D
                    </span>
                  )}
                  {data.view === "B" && (
                    <span className="text-[8px] px-1.5 py-0.5 rounded bg-sky-900/50 text-sky-400">
                      3D
                    </span>
                  )}
                </div>
                <p className="text-[13px] text-slate-300 leading-snug">
                  {data.label}
                </p>
                {isActive && hasNext && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.15 }}
                  >
                    <button
                      onClick={onNext}
                      className="mt-2.5 px-4 py-1.5 rounded-md text-xs font-bold bg-sky-600/15 text-sky-400 border border-sky-600/30 hover:bg-sky-600/25 hover:border-sky-500/50 transition-all flex items-center gap-1 cursor-pointer"
                    >
                      NEXT STEP <ChevronRight size={12} />
                    </button>
                  </motion.div>
                )}
                {isActive && isTerminalNode && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="mt-2.5 flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-600/10 px-3 py-1.5 rounded-md border border-emerald-600/20"
                  >
                    <ShieldCheck size={14} />
                    <span className="font-semibold">Assessment Complete</span>
                  </motion.div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════
   TOOLTIP OVERLAY
   ═══════════════════════════════════════════════ */

function TooltipOverlay({ tooltip, color }) {
  return (
    <AnimatePresence>
      {tooltip && (
        <motion.div
          key={tooltip}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3 }}
          className="absolute bottom-4 left-4 right-4 z-20"
        >
          <div
            className="rounded-lg px-4 py-3 backdrop-blur-md border text-sm font-medium flex items-start gap-2.5"
            style={{
              backgroundColor: `${color}12`,
              borderColor: `${color}35`,
              color: color,
            }}
          >
            <Info size={16} className="flex-shrink-0 mt-0.5" />
            <span className="leading-snug">{tooltip}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ═══════════════════════════════════════════════
   MAIN APP
   ═══════════════════════════════════════════════ */

export default function App() {
  const [selectedGrade, setSelectedGrade] = useState(null);
  const [stepHistory, setStepHistory] = useState([]);
  const [activeStepIdx, setActiveStepIdx] = useState(0);
  const scrollRef = useRef(null);

  const currentStepId = stepHistory[activeStepIdx];
  const currentStep = currentStepId ? STEPS[currentStepId] : null;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [stepHistory.length]);

  const handleGradeSelect = useCallback((grade) => {
    setSelectedGrade(grade);
    setStepHistory([GRADE_START[grade]]);
    setActiveStepIdx(0);
  }, []);

  const handleYes = useCallback(() => {
    if (!currentStep?.yes) return;
    setStepHistory((prev) => [
      ...prev.slice(0, activeStepIdx + 1),
      currentStep.yes,
    ]);
    setActiveStepIdx((prev) => prev + 1);
  }, [currentStep, activeStepIdx]);

  const handleNo = useCallback(() => {
    if (!currentStep?.no) return;
    setStepHistory((prev) => [
      ...prev.slice(0, activeStepIdx + 1),
      currentStep.no,
    ]);
    setActiveStepIdx((prev) => prev + 1);
  }, [currentStep, activeStepIdx]);

  const handleNext = useCallback(() => {
    if (!currentStep?.next) return;
    setStepHistory((prev) => [
      ...prev.slice(0, activeStepIdx + 1),
      currentStep.next,
    ]);
    setActiveStepIdx((prev) => prev + 1);
  }, [currentStep, activeStepIdx]);

  const handleReset = useCallback(() => {
    setSelectedGrade(null);
    setStepHistory([]);
    setActiveStepIdx(0);
  }, []);

  const viewType = currentStep?.view || "A";
  const highlight = currentStep?.highlight || null;
  const highlightColor = currentStep?.highlightColor || "#06b6d4";
  const tooltip = currentStep?.tooltip || null;

  const grades = useMemo(
    () => [
      { id: "EH36", desc: "Standard HT", color: "#06b6d4" },
      { id: "EH40", desc: "Enhanced", color: "#f59e0b" },
      { id: "EH47", desc: "Extra HS", color: "#a855f7" },
    ],
    []
  );

  return (
    <div className="h-screen w-screen bg-[#0a0f1c] text-slate-200 flex flex-col overflow-hidden">
      {/* ═══ HEADER ═══ */}
      <header className="flex-shrink-0 border-b border-slate-800/80 bg-[#0c1222]/95 backdrop-blur-sm">
        <div className="px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-600/30 to-sky-800/30 flex items-center justify-center border border-sky-700/30">
              <Ship className="text-sky-400" size={18} />
            </div>
            <div>
              <h1 className="text-[13px] font-bold text-slate-100 tracking-wide leading-tight">
                HATCH COAMING CRACK PREVENTION
              </h1>
              <p className="text-[10px] text-slate-500 leading-tight">
                Lloyd&apos;s Register Rules Pt.3 Ch.8 &mdash; Thick Plate Assessment
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {selectedGrade && (
              <div
                className="px-2.5 py-1 rounded-md text-[10px] font-bold border"
                style={{
                  borderColor: `${grades.find((g) => g.id === selectedGrade)?.color}40`,
                  color: grades.find((g) => g.id === selectedGrade)?.color,
                  backgroundColor: `${grades.find((g) => g.id === selectedGrade)?.color}10`,
                }}
              >
                {selectedGrade}
              </div>
            )}
            {selectedGrade && (
              <button
                onClick={handleReset}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors border border-slate-700/50 cursor-pointer"
              >
                <RotateCcw size={10} />
                Reset
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ═══ MAIN CONTENT ═══ */}
      <div className="flex-1 flex overflow-hidden">
        {/* ═══ LEFT PANEL ═══ */}
        <div className="w-[400px] flex-shrink-0 border-r border-slate-800/60 flex flex-col bg-[#0b1020]">
          {/* Grade selector */}
          <div className="p-3 border-b border-slate-800/60">
            <div className="flex items-center gap-2 mb-2.5">
              <Gauge size={12} className="text-slate-600" />
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Steel Grade
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {grades.map((g) => (
                <button
                  key={g.id}
                  onClick={() => handleGradeSelect(g.id)}
                  className={`
                    rounded-lg p-2 text-center border transition-all duration-200 cursor-pointer
                    ${
                      selectedGrade === g.id
                        ? "shadow-lg"
                        : "bg-slate-900/40 border-slate-800/60 text-slate-400 hover:bg-slate-800/60 hover:border-slate-600/50"
                    }
                  `}
                  style={
                    selectedGrade === g.id
                      ? {
                          backgroundColor: `${g.color}15`,
                          borderColor: `${g.color}40`,
                          color: g.color,
                        }
                      : {}
                  }
                >
                  <div className="text-sm font-bold">{g.id}</div>
                  <div className="text-[9px] opacity-60 mt-0.5">{g.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Flowchart */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-0">
            <AnimatePresence mode="popLayout">
              {!selectedGrade ? (
                <motion.div
                  key="placeholder"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center h-full text-center px-6"
                >
                  <div className="w-16 h-16 rounded-2xl bg-slate-800/50 flex items-center justify-center mb-4 border border-slate-700/30">
                    <Layers size={28} className="text-slate-600" />
                  </div>
                  <p className="text-sm text-slate-400 font-medium">
                    Select a steel grade to begin
                  </p>
                  <p className="text-[11px] text-slate-600 mt-2 max-w-[280px] leading-relaxed">
                    The decision tree will guide you through Lloyd&apos;s Register
                    crack propagation prevention measures step by step.
                  </p>
                </motion.div>
              ) : (
                stepHistory.map((stepId, idx) => (
                  <FlowNode
                    key={stepId}
                    step={stepId}
                    index={idx}
                    isActive={idx === activeStepIdx}
                    isCompleted={idx < activeStepIdx}
                    onYes={handleYes}
                    onNo={handleNo}
                    onNext={handleNext}
                  />
                ))
              )}
            </AnimatePresence>
          </div>

          {/* Legend */}
          <div className="p-2.5 border-t border-slate-800/60 bg-[#0a0e1a]">
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
              {[
                { color: "#06b6d4", label: "NDE / Butt Welds" },
                { color: "#f59e0b", label: "Crack Arrest / BCA" },
                { color: "#10b981", label: "Deck & Sheer Strake" },
                { color: "#ef4444", label: "Enhanced NDE / CTOD" },
                { color: "#a855f7", label: "Welding Process" },
                { color: "#eab308", label: "BCA Steel Grade" },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-1.5">
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-[9px] text-slate-500 leading-tight">
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ═══ RIGHT PANEL (Visualizer) ═══ */}
        <div className="flex-1 flex flex-col relative overflow-hidden bg-gradient-to-br from-[#0a0f1c] to-[#0e1628]">
          {/* View indicator pills */}
          <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5">
            {[
              { key: "A", label: "2D SECTION" },
              { key: "B", label: "3D ISOMETRIC" },
            ].map((v) => (
              <div
                key={v.key}
                className={`
                  px-2.5 py-1 rounded-full text-[10px] font-bold border backdrop-blur-md transition-all duration-300
                  ${
                    viewType === v.key
                      ? "bg-sky-900/50 border-sky-600/40 text-sky-300 shadow-lg shadow-sky-900/20"
                      : "bg-slate-900/50 border-slate-700/30 text-slate-600"
                  }
                `}
              >
                {v.label}
              </div>
            ))}
          </div>

          {/* SVG Visualizer */}
          <div className="flex-1 flex items-center justify-center p-3 relative">
            <AnimatePresence mode="wait">
              <motion.div
                key={viewType + (highlight || "none")}
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                className="w-full h-full max-w-[750px] max-h-[600px]"
              >
                {viewType === "A" ? (
                  <ViewA highlight={highlight} highlightColor={highlightColor} />
                ) : (
                  <ViewB highlight={highlight} highlightColor={highlightColor} />
                )}
              </motion.div>
            </AnimatePresence>

            <TooltipOverlay tooltip={tooltip} color={highlightColor} />
          </div>

          {/* Bottom status bar */}
          <div className="flex-shrink-0 px-3 py-1.5 border-t border-slate-800/50 bg-[#0a0e1a]/90 backdrop-blur-sm flex items-center justify-between">
            <div className="flex items-center gap-2 text-[10px] text-slate-600">
              <AlertTriangle size={10} />
              <span>
                Ref: LR Rules Pt.3, Ch.8, Sec.8.2 — Hatch Coaming Crack Arrest Measures
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-600">
              <Scan size={10} />
              <span>{viewType === "A" ? "Cross-Section" : "Isometric Block Joint"}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
