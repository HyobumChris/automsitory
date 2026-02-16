import { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Anchor,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Scan,
  Layers,
  Info,
  RotateCcw,
  Gauge,
} from "lucide-react";

/* ─────────────────────────────────────────────
   FLOWCHART STATE MACHINE
   ───────────────────────────────────────────── */

const STEPS = {
  // ── EH36 ──────────────────────────────────
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
    label:
      "[Measure 1] 100% NDE on all upper flange longitudinal members",
    view: "B",
    highlight: "transverse",
    highlightColor: "#06b6d4",
    tooltip:
      "Measure 1: 100% UT strictly applies to Block-to-Block Butt Welds",
    terminal: true,
  },

  // ── EH40 ──────────────────────────────────
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

  // ── EH40 YES branch (Crack Arrest) ───────
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
    tooltip:
      "Staggered block joint design prevents crack propagation across blocks.",
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
    label:
      "[Measures 4 & 5] Crack arrest steel for upper deck & sheer strake (BCA1)",
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

  // ── EH40 NO branch (No Crack Arrest) ─────
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

  // ── EH47 ──────────────────────────────────
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

  // ── EH47 YES branch ──────────────────────
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
    tooltip:
      "Staggered block joint design prevents crack propagation across blocks.",
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
    label:
      "[Measures 4 & 5] Crack arrest steel for upper deck & sheer strake (BCA1)",
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

  // ── EH47 NO branch ───────────────────────
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

/* ─────────────────────────────────────────────
   VIEW A — 2D CROSS-SECTION (Fig 8.2.1)
   ───────────────────────────────────────────── */

function ViewA({ highlight, highlightColor }) {
  const isCoaming = highlight === "coaming" || highlight === "coaming-both";
  const isCoamingSide = highlight === "coaming-side" || highlight === "coaming-both";
  const isCoamingTop = highlight === "coaming" || highlight === "coaming-both";
  const isDeckSheer = highlight === "deck-sheer";

  const coamingTopColor = isCoamingTop ? highlightColor : "#475569";
  const coamingSideColor = isCoamingSide ? highlightColor : "#475569";
  const deckColor = isDeckSheer ? highlightColor : "#64748b";
  const sheerColor = isDeckSheer ? highlightColor : "#64748b";
  const longColor = "#334155";

  const glowFilter = (color) => {
    if (!color || color === "#475569" || color === "#64748b" || color === "#334155")
      return "";
    return `drop-shadow(0 0 8px ${color}80) drop-shadow(0 0 16px ${color}40)`;
  };

  return (
    <svg viewBox="0 0 600 480" className="w-full h-full">
      <defs>
        <linearGradient id="bgGradA" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0f172a" />
          <stop offset="100%" stopColor="#1e293b" />
        </linearGradient>
        <filter id="glowCyan">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feFlood floodColor="#06b6d4" floodOpacity="0.6" />
          <feComposite in2="blur" operator="in" />
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="glowAmber">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feFlood floodColor="#f59e0b" floodOpacity="0.6" />
          <feComposite in2="blur" operator="in" />
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="glowGreen">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feFlood floodColor="#10b981" floodOpacity="0.6" />
          <feComposite in2="blur" operator="in" />
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <pattern
          id="gridPattern"
          width="20"
          height="20"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 20 0 L 0 0 0 20"
            fill="none"
            stroke="#1e293b"
            strokeWidth="0.5"
          />
        </pattern>
      </defs>

      <rect width="600" height="480" fill="url(#bgGradA)" />
      <rect width="600" height="480" fill="url(#gridPattern)" opacity="0.4" />

      {/* Title */}
      <text
        x="300"
        y="30"
        textAnchor="middle"
        fill="#94a3b8"
        fontSize="13"
        fontFamily="monospace"
        fontWeight="bold"
      >
        CROSS-SECTION VIEW — Fig 8.2.1
      </text>

      {/* CL indicator */}
      <line
        x1="300"
        y1="50"
        x2="300"
        y2="460"
        stroke="#334155"
        strokeWidth="0.5"
        strokeDasharray="8 4"
      />
      <text
        x="304"
        y="62"
        fill="#475569"
        fontSize="10"
        fontFamily="monospace"
      >
        CL
      </text>

      {/* Hatch opening top lines */}
      <line x1="180" y1="120" x2="420" y2="120" stroke="#334155" strokeWidth="0.5" strokeDasharray="4 4" />

      {/* ── HATCH COAMING TOP PLATE ── */}
      <motion.rect
        x="155"
        y="100"
        width="290"
        height="14"
        fill={coamingTopColor}
        rx="1"
        animate={{
          fill: coamingTopColor,
          filter: glowFilter(coamingTopColor),
        }}
        transition={{ duration: 0.5 }}
      />
      <text
        x="300"
        y="94"
        textAnchor="middle"
        fill={isCoamingTop ? highlightColor : "#94a3b8"}
        fontSize="10"
        fontFamily="monospace"
        fontWeight="bold"
      >
        HATCH COAMING TOP PLATE
      </text>
      {isCoamingTop && (
        <motion.rect
          x="155"
          y="100"
          width="290"
          height="14"
          fill="none"
          stroke={highlightColor}
          strokeWidth="2"
          rx="1"
          className="animate-pulse-glow"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        />
      )}

      {/* ── HATCH SIDE COAMING (Left) ── */}
      <motion.rect
        x="155"
        y="114"
        width="14"
        height="140"
        fill={coamingSideColor}
        rx="1"
        animate={{
          fill: coamingSideColor,
          filter: glowFilter(coamingSideColor),
        }}
        transition={{ duration: 0.5 }}
      />
      {/* ── HATCH SIDE COAMING (Right) ── */}
      <motion.rect
        x="431"
        y="114"
        width="14"
        height="140"
        fill={coamingSideColor}
        rx="1"
        animate={{
          fill: coamingSideColor,
          filter: glowFilter(coamingSideColor),
        }}
        transition={{ duration: 0.5 }}
      />

      {/* Label for side coaming */}
      <text
        x="130"
        y="185"
        textAnchor="end"
        fill={isCoamingSide ? highlightColor : "#94a3b8"}
        fontSize="9"
        fontFamily="monospace"
        fontWeight="bold"
        transform="rotate(-90, 130, 185)"
      >
        SIDE COAMING
      </text>
      <text
        x="470"
        y="185"
        textAnchor="start"
        fill={isCoamingSide ? highlightColor : "#94a3b8"}
        fontSize="9"
        fontFamily="monospace"
        fontWeight="bold"
        transform="rotate(90, 470, 185)"
      >
        SIDE COAMING
      </text>

      {isCoamingSide && (
        <>
          <motion.rect
            x="155"
            y="114"
            width="14"
            height="140"
            fill="none"
            stroke={highlightColor}
            strokeWidth="2"
            rx="1"
            className="animate-pulse-glow"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          />
          <motion.rect
            x="431"
            y="114"
            width="14"
            height="140"
            fill="none"
            stroke={highlightColor}
            strokeWidth="2"
            rx="1"
            className="animate-pulse-glow"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          />
        </>
      )}

      {/* ── UPPER DECK ── */}
      <motion.rect
        x="60"
        y="254"
        width="480"
        height="10"
        fill={deckColor}
        animate={{
          fill: deckColor,
          filter: glowFilter(deckColor),
        }}
        transition={{ duration: 0.5 }}
      />
      <text
        x="300"
        y="280"
        textAnchor="middle"
        fill={isDeckSheer ? highlightColor : "#94a3b8"}
        fontSize="10"
        fontFamily="monospace"
        fontWeight="bold"
      >
        UPPER DECK
      </text>
      {isDeckSheer && (
        <motion.rect
          x="60"
          y="254"
          width="480"
          height="10"
          fill="none"
          stroke={highlightColor}
          strokeWidth="2"
          className="animate-pulse-glow"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        />
      )}

      {/* Bracket connections */}
      <polygon points="155,254 155,240 169,254" fill="#3b4252" />
      <polygon points="445,254 445,240 431,254" fill="#3b4252" />

      {/* ── SHEER STRAKE (Left) ── */}
      <motion.rect
        x="50"
        y="210"
        width="10"
        height="110"
        fill={sheerColor}
        animate={{
          fill: sheerColor,
          filter: glowFilter(sheerColor),
        }}
        transition={{ duration: 0.5 }}
      />
      {/* ── SHEER STRAKE (Right) ── */}
      <motion.rect
        x="540"
        y="210"
        width="10"
        height="110"
        fill={sheerColor}
        animate={{
          fill: sheerColor,
          filter: glowFilter(sheerColor),
        }}
        transition={{ duration: 0.5 }}
      />
      <text
        x="30"
        y="265"
        textAnchor="end"
        fill={isDeckSheer ? highlightColor : "#94a3b8"}
        fontSize="8"
        fontFamily="monospace"
        transform="rotate(-90, 30, 265)"
      >
        SHEER STRAKE
      </text>
      <text
        x="570"
        y="265"
        textAnchor="start"
        fill={isDeckSheer ? highlightColor : "#94a3b8"}
        fontSize="8"
        fontFamily="monospace"
        transform="rotate(90, 570, 265)"
      >
        SHEER STRAKE
      </text>

      {isDeckSheer && (
        <>
          <motion.rect
            x="50"
            y="210"
            width="10"
            height="110"
            fill="none"
            stroke={highlightColor}
            strokeWidth="2"
            className="animate-pulse-glow"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          />
          <motion.rect
            x="540"
            y="210"
            width="10"
            height="110"
            fill="none"
            stroke={highlightColor}
            strokeWidth="2"
            className="animate-pulse-glow"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          />
        </>
      )}

      {/* ── LONGITUDINALS (stiffeners below deck) ── */}
      {[130, 210, 300, 390, 470].map((lx, i) => (
        <g key={i}>
          <rect
            x={lx - 2}
            y="264"
            width="4"
            height="50"
            fill={longColor}
          />
          <rect
            x={lx - 10}
            y="310"
            width="20"
            height="4"
            fill={longColor}
          />
        </g>
      ))}
      <text
        x="300"
        y="340"
        textAnchor="middle"
        fill="#64748b"
        fontSize="9"
        fontFamily="monospace"
      >
        LONGITUDINALS
      </text>

      {/* Inner bottom */}
      <rect x="60" y="400" width="480" height="6" fill="#334155" />
      <text
        x="300"
        y="420"
        textAnchor="middle"
        fill="#475569"
        fontSize="9"
        fontFamily="monospace"
      >
        INNER BOTTOM
      </text>

      {/* Side shell plating */}
      <line x1="60" y1="264" x2="50" y2="320" stroke="#475569" strokeWidth="2" />
      <line x1="540" y1="264" x2="550" y2="320" stroke="#475569" strokeWidth="2" />

      {/* Dimension arrows for coaming */}
      <line x1="150" y1="100" x2="150" y2="254" stroke="#475569" strokeWidth="0.5" strokeDasharray="3 2" />
      <line x1="140" y1="100" x2="150" y2="100" stroke="#475569" strokeWidth="0.5" />
      <line x1="140" y1="254" x2="150" y2="254" stroke="#475569" strokeWidth="0.5" />
      <text x="142" y="180" textAnchor="end" fill="#64748b" fontSize="8" fontFamily="monospace" transform="rotate(-90,142,180)">
        t (thickness)
      </text>
    </svg>
  );
}

/* ─────────────────────────────────────────────
   VIEW B — 3D ISOMETRIC BLOCK JOINT
   ───────────────────────────────────────────── */

function ViewB({ highlight, highlightColor }) {
  const isTransverse = highlight === "transverse";
  const isBlockShift = highlight === "block-shift";
  const isRedIntersections = highlight === "red-intersections";
  const isRadarScan = highlight === "radar-scan";

  const isoX = (x, y, z) => 300 + (x - y) * 0.866;
  const isoY = (x, y, z) => 160 + (x + y) * 0.5 - z;

  const transColor = isTransverse
    ? highlightColor
    : isBlockShift
      ? highlightColor
      : "#475569";
  const longJointColor = "#64748b";

  const blockAColor = "#1e293b";
  const blockBColor = "#0f172a";
  const blockAFace = "#1a2332";
  const blockBFace = "#141d2b";
  const blockATop = "#243347";
  const blockBTop = "#1e2d42";

  const buildBlock = (ox, oy, oz, w, d, h, fillTop, fillFront, fillSide) => {
    const pts = [
      [ox, oy, oz],
      [ox + w, oy, oz],
      [ox + w, oy + d, oz],
      [ox, oy + d, oz],
      [ox, oy, oz + h],
      [ox + w, oy, oz + h],
      [ox + w, oy + d, oz + h],
      [ox, oy + d, oz + h],
    ];
    const p = pts.map(([x, y, z]) => `${isoX(x, y, z)},${isoY(x, y, z)}`);
    return (
      <g>
        {/* Top face */}
        <polygon points={`${p[4]} ${p[5]} ${p[6]} ${p[7]}`} fill={fillTop} stroke="#334155" strokeWidth="0.5" />
        {/* Front face */}
        <polygon points={`${p[0]} ${p[1]} ${p[5]} ${p[4]}`} fill={fillFront} stroke="#334155" strokeWidth="0.5" />
        {/* Side face */}
        <polygon points={`${p[1]} ${p[2]} ${p[6]} ${p[5]}`} fill={fillSide} stroke="#334155" strokeWidth="0.5" />
      </g>
    );
  };

  const drawStiffener = (ox, oy, oz, length, height, along) => {
    const pts = along === "x"
      ? [
          [ox, oy, oz],
          [ox + length, oy, oz],
          [ox + length, oy, oz + height],
          [ox, oy, oz + height],
        ]
      : [
          [ox, oy, oz],
          [ox, oy + length, oz],
          [ox, oy + length, oz + height],
          [ox, oy, oz + height],
        ];
    const p = pts.map(([x, y, z]) => `${isoX(x, y, z)},${isoY(x, y, z)}`);
    return (
      <polygon
        points={p.join(" ")}
        fill={longJointColor}
        stroke="#475569"
        strokeWidth="0.5"
        opacity="0.6"
      />
    );
  };

  const buttJointSeam = () => {
    if (isBlockShift) {
      const pts = [
        [0, -5, 120], [0, 30, 120], [0, 30, 100],
        [5, 30, 100], [5, 80, 100], [5, 80, 120],
        [0, 80, 120], [0, 130, 120], [0, 130, 0],
        [0, 80, 0], [5, 80, 0], [5, 80, 20],
        [5, 30, 20], [5, 30, 0], [0, 30, 0], [0, -5, 0],
      ];
      const p = pts.map(([x, y, z]) => `${isoX(x, y, z)},${isoY(x, y, z)}`);
      return (
        <g>
          <motion.polygon
            points={p.join(" ")}
            fill="none"
            stroke={highlightColor}
            strokeWidth="3"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            className="animate-pulse-glow"
          />
          <motion.polygon
            points={p.join(" ")}
            fill={`${highlightColor}15`}
            stroke="none"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.1, 0.3, 0.1] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          {/* Z-offset label */}
          <text
            x={isoX(8, 55, 115)}
            y={isoY(8, 55, 115)}
            fill={highlightColor}
            fontSize="9"
            fontFamily="monospace"
            fontWeight="bold"
          >
            BLOCK SHIFT
          </text>
        </g>
      );
    }

    const seamPts = [
      [0, -5, 120],
      [0, -5, 0],
      [0, 130, 0],
      [0, 130, 120],
    ];
    const p = seamPts.map(([x, y, z]) => `${isoX(x, y, z)},${isoY(x, y, z)}`);

    return (
      <g>
        <motion.polygon
          points={p.join(" ")}
          fill={isTransverse ? `${transColor}15` : "none"}
          stroke={transColor}
          strokeWidth={isTransverse ? 3 : 1}
          animate={
            isTransverse
              ? { strokeWidth: [2, 4, 2], opacity: [0.7, 1, 0.7] }
              : {}
          }
          transition={
            isTransverse ? { duration: 1.5, repeat: Infinity } : {}
          }
        />
        {isTransverse && (
          <motion.polygon
            points={p.join(" ")}
            fill="none"
            stroke={transColor}
            strokeWidth="6"
            opacity="0.2"
            className="animate-pulse-glow"
          />
        )}
      </g>
    );
  };

  return (
    <svg viewBox="0 0 600 480" className="w-full h-full">
      <defs>
        <linearGradient id="bgGradB" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0c1222" />
          <stop offset="100%" stopColor="#111a2e" />
        </linearGradient>
        <pattern
          id="gridPatternB"
          width="20"
          height="20"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 20 0 L 0 0 0 20"
            fill="none"
            stroke="#1a2332"
            strokeWidth="0.3"
          />
        </pattern>
      </defs>

      <rect width="600" height="480" fill="url(#bgGradB)" />
      <rect width="600" height="480" fill="url(#gridPatternB)" opacity="0.5" />

      {/* Title */}
      <text
        x="300"
        y="26"
        textAnchor="middle"
        fill="#94a3b8"
        fontSize="13"
        fontFamily="monospace"
        fontWeight="bold"
      >
        3D ISOMETRIC — BLOCK JOINT VIEW
      </text>

      {/* Block A (left/back) */}
      {buildBlock(-120, 0, 0, 120, 125, 120, blockATop, blockAFace, blockAColor)}

      {/* Block B (right/front) */}
      {buildBlock(0, 0, 0, 120, 125, 120, blockBTop, blockBFace, blockBColor)}

      {/* Deck plate on top - Block A */}
      {buildBlock(-120, 0, 120, 120, 125, 8, "#2a4a6b", "#1e3a5c", "#1a3352")}

      {/* Deck plate on top - Block B */}
      {buildBlock(0, 0, 120, 120, 125, 8, "#243e5c", "#1a3352", "#162d48")}

      {/* Coaming on Block A */}
      {buildBlock(-120, 15, 128, 120, 8, 50, "#2e5078", "#264468", "#203a5e")}

      {/* Coaming on Block B */}
      {buildBlock(0, 15, 128, 120, 8, 50, "#284872", "#223e62", "#1c3458")}

      {/* Coaming top plate */}
      {buildBlock(-120, 10, 178, 240, 18, 6, "#3b6898", "#2e5480", "#264872")}

      {/* Longitudinal stiffeners (running along X, through both blocks) */}
      {[25, 55, 85, 115].map((yOff, i) => (
        <g key={`long-${i}`} opacity="0.5">
          {drawStiffener(-110, yOff, 0, 220, 20, "x")}
        </g>
      ))}

      {/* Longitudinal joint labels */}
      <text
        x={isoX(-80, 5, 15)}
        y={isoY(-80, 5, 15)}
        fill={longJointColor}
        fontSize="8"
        fontFamily="monospace"
        opacity="0.7"
      >
        Q.1/Q.2 LONG. JOINTS
      </text>

      {/* ── TRANSVERSE BUTT JOINT SEAM ── */}
      {buttJointSeam()}

      {/* Transverse joint label */}
      {(isTransverse || isBlockShift) && (
        <text
          x={isoX(5, -12, 65)}
          y={isoY(5, -12, 65)}
          fill={transColor}
          fontSize="9"
          fontFamily="monospace"
          fontWeight="bold"
        >
          Q.3/Q.4 TRANS. BUTT JOINT
        </text>
      )}

      {/* Block labels */}
      <text
        x={isoX(-60, 62, 65)}
        y={isoY(-60, 62, 65)}
        textAnchor="middle"
        fill="#64748b"
        fontSize="14"
        fontFamily="monospace"
        fontWeight="bold"
        opacity="0.4"
      >
        BLOCK A
      </text>
      <text
        x={isoX(60, 62, 65)}
        y={isoY(60, 62, 65)}
        textAnchor="middle"
        fill="#64748b"
        fontSize="14"
        fontFamily="monospace"
        fontWeight="bold"
        opacity="0.4"
      >
        BLOCK B
      </text>

      {/* Red intersection dots */}
      {isRedIntersections &&
        [
          [0, 25, 0],
          [0, 55, 0],
          [0, 85, 0],
          [0, 115, 0],
          [0, 25, 120],
          [0, 55, 120],
          [0, 85, 120],
          [0, 115, 120],
        ].map(([x, y, z], i) => (
          <g key={`red-${i}`}>
            <motion.circle
              cx={isoX(x, y, z)}
              cy={isoY(x, y, z)}
              r="4"
              fill="#ef4444"
              animate={{ r: [3, 6, 3], opacity: [1, 0.5, 1] }}
              transition={{
                duration: 1.2,
                repeat: Infinity,
                delay: i * 0.15,
              }}
            />
            <motion.circle
              cx={isoX(x, y, z)}
              cy={isoY(x, y, z)}
              r="10"
              fill="none"
              stroke="#ef4444"
              strokeWidth="1"
              animate={{ r: [6, 16, 6], opacity: [0.8, 0, 0.8] }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                delay: i * 0.15,
              }}
            />
          </g>
        ))}

      {/* Radar scan icons */}
      {isRadarScan &&
        [
          [0, 30, 60],
          [0, 70, 60],
          [0, 100, 60],
        ].map(([x, y, z], i) => (
          <g key={`radar-${i}`}>
            <motion.circle
              cx={isoX(x, y, z)}
              cy={isoY(x, y, z)}
              r="3"
              fill="#06b6d4"
            />
            {[0, 1, 2].map((ring) => (
              <motion.circle
                key={ring}
                cx={isoX(x, y, z)}
                cy={isoY(x, y, z)}
                r="3"
                fill="none"
                stroke="#06b6d4"
                strokeWidth="1"
                animate={{
                  r: [4, 20],
                  opacity: [0.8, 0],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  delay: ring * 0.6 + i * 0.3,
                }}
              />
            ))}
            {i === 1 && (
              <text
                x={isoX(x, y, z) + 18}
                y={isoY(x, y, z) - 2}
                fill="#06b6d4"
                fontSize="8"
                fontFamily="monospace"
              >
                UT SCAN
              </text>
            )}
          </g>
        ))}

      {/* Axis indicator */}
      <g transform="translate(50, 430)">
        <line x1="0" y1="0" x2="30" y2="-15" stroke="#475569" strokeWidth="1" />
        <text x="34" y="-14" fill="#64748b" fontSize="8" fontFamily="monospace">
          X
        </text>
        <line x1="0" y1="0" x2="-30" y2="-15" stroke="#475569" strokeWidth="1" />
        <text x="-42" y="-14" fill="#64748b" fontSize="8" fontFamily="monospace">
          Y
        </text>
        <line x1="0" y1="0" x2="0" y2="-30" stroke="#475569" strokeWidth="1" />
        <text x="4" y="-28" fill="#64748b" fontSize="8" fontFamily="monospace">
          Z
        </text>
      </g>
    </svg>
  );
}

/* ─────────────────────────────────────────────
   FLOWCHART NODE COMPONENT
   ───────────────────────────────────────────── */

function FlowNode({ step, onYes, onNo, onNext, isActive, isCompleted, index }) {
  const data = STEPS[step];
  if (!data) return null;

  const isQuestion = !!data.question;
  const hasNext = !!data.next;
  const isTerminalNode = !!data.terminal;

  const borderColor = isActive
    ? data.highlightColor || "#06b6d4"
    : isCompleted
      ? "#334155"
      : "#1e293b";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{
        opacity: isActive ? 1 : isCompleted ? 0.6 : 0.4,
        y: 0,
        scale: isActive ? 1 : 0.97,
      }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="relative"
    >
      {/* Connector line from previous */}
      {index > 0 && (
        <div className="flex justify-center mb-1">
          <div
            className="w-0.5 h-5"
            style={{ backgroundColor: isCompleted || isActive ? "#475569" : "#1e293b" }}
          />
        </div>
      )}

      <div
        className={`
          rounded-lg p-3 border transition-all duration-300
          ${isActive ? "bg-slate-800/80 shadow-lg" : "bg-slate-900/60"}
          ${isQuestion && isActive ? "border-l-4" : "border"}
        `}
        style={{
          borderColor,
          boxShadow: isActive ? `0 0 20px ${borderColor}30` : "none",
        }}
      >
        {/* Step number badge */}
        <div className="flex items-start gap-2">
          <div
            className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
            style={{
              backgroundColor: isCompleted
                ? "#10b981"
                : isActive
                  ? `${borderColor}30`
                  : "#1e293b",
              color: isCompleted ? "#fff" : isActive ? borderColor : "#475569",
            }}
          >
            {isCompleted ? (
              <CheckCircle2 size={14} />
            ) : (
              index + 1
            )}
          </div>

          <div className="flex-1 min-w-0">
            {isQuestion ? (
              <>
                <p className="text-sm font-medium text-slate-200 mb-2 leading-snug">
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
                      className="px-4 py-1.5 rounded-md text-xs font-bold bg-emerald-600/20 text-emerald-400 border border-emerald-600/40 hover:bg-emerald-600/30 transition-colors"
                    >
                      YES
                    </button>
                    <button
                      onClick={onNo}
                      className="px-4 py-1.5 rounded-md text-xs font-bold bg-red-600/20 text-red-400 border border-red-600/40 hover:bg-red-600/30 transition-colors"
                    >
                      NO
                    </button>
                  </motion.div>
                )}
              </>
            ) : (
              <>
                <p className="text-sm text-slate-300 leading-snug">
                  {data.label}
                </p>
                {isActive && hasNext && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                  >
                    <button
                      onClick={onNext}
                      className="mt-2 px-4 py-1.5 rounded-md text-xs font-bold bg-sky-600/20 text-sky-400 border border-sky-600/40 hover:bg-sky-600/30 transition-colors flex items-center gap-1"
                    >
                      NEXT <ChevronRight size={12} />
                    </button>
                  </motion.div>
                )}
                {isActive && isTerminalNode && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mt-2 flex items-center gap-1 text-xs text-emerald-400"
                  >
                    <ShieldCheck size={14} />
                    <span className="font-medium">Assessment Complete</span>
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

/* ─────────────────────────────────────────────
   TOOLTIP OVERLAY
   ───────────────────────────────────────────── */

function TooltipOverlay({ tooltip, color }) {
  return (
    <AnimatePresence>
      {tooltip && (
        <motion.div
          key={tooltip}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="absolute bottom-4 left-4 right-4 z-10"
        >
          <div
            className="rounded-lg px-4 py-3 backdrop-blur-sm border text-sm font-medium flex items-start gap-2"
            style={{
              backgroundColor: `${color}15`,
              borderColor: `${color}40`,
              color: color,
            }}
          >
            <Info size={16} className="flex-shrink-0 mt-0.5" />
            <span>{tooltip}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ─────────────────────────────────────────────
   MAIN APP
   ───────────────────────────────────────────── */

export default function App() {
  const [selectedGrade, setSelectedGrade] = useState(null);
  const [stepHistory, setStepHistory] = useState([]);
  const [activeStepIdx, setActiveStepIdx] = useState(0);

  const currentStepId = stepHistory[activeStepIdx];
  const currentStep = currentStepId ? STEPS[currentStepId] : null;

  const handleGradeSelect = useCallback((grade) => {
    setSelectedGrade(grade);
    setStepHistory([GRADE_START[grade]]);
    setActiveStepIdx(0);
  }, []);

  const handleYes = useCallback(() => {
    if (!currentStep?.yes) return;
    setStepHistory((prev) => [...prev.slice(0, activeStepIdx + 1), currentStep.yes]);
    setActiveStepIdx((prev) => prev + 1);
  }, [currentStep, activeStepIdx]);

  const handleNo = useCallback(() => {
    if (!currentStep?.no) return;
    setStepHistory((prev) => [...prev.slice(0, activeStepIdx + 1), currentStep.no]);
    setActiveStepIdx((prev) => prev + 1);
  }, [currentStep, activeStepIdx]);

  const handleNext = useCallback(() => {
    if (!currentStep?.next) return;
    setStepHistory((prev) => [...prev.slice(0, activeStepIdx + 1), currentStep.next]);
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
      { id: "EH36", label: "Grade EH36", desc: "Standard high-tensile" },
      { id: "EH40", label: "Grade EH40", desc: "Enhanced toughness" },
      { id: "EH47", label: "Grade EH47", desc: "Extra high strength" },
    ],
    []
  );

  return (
    <div className="h-screen w-screen bg-[#0c1222] text-slate-200 flex flex-col overflow-hidden">
      {/* ── HEADER ── */}
      <header className="flex-shrink-0 border-b border-slate-800 bg-[#0c1222]/95 backdrop-blur-sm">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-sky-600/20 flex items-center justify-center">
              <Anchor className="text-sky-400" size={20} />
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-100 tracking-wide">
                LR HATCH COAMING CRACK PREVENTION
              </h1>
              <p className="text-xs text-slate-500">
                Lloyd&apos;s Register Rules &mdash; Containership Thick Plate Assessment Tool
              </p>
            </div>
          </div>
          {selectedGrade && (
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors border border-slate-700"
            >
              <RotateCcw size={12} />
              Reset
            </button>
          )}
        </div>
      </header>

      {/* ── MAIN CONTENT ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* ── LEFT PANEL ── */}
        <div className="w-[420px] flex-shrink-0 border-r border-slate-800 flex flex-col bg-[#0d1424]">
          {/* Grade selector */}
          <div className="p-4 border-b border-slate-800">
            <div className="flex items-center gap-2 mb-3">
              <Gauge size={14} className="text-slate-500" />
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Steel Grade Selection
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {grades.map((g) => (
                <button
                  key={g.id}
                  onClick={() => handleGradeSelect(g.id)}
                  className={`
                    rounded-lg p-2.5 text-center border transition-all duration-200
                    ${
                      selectedGrade === g.id
                        ? "bg-sky-600/20 border-sky-500/50 text-sky-300"
                        : "bg-slate-900/50 border-slate-700/50 text-slate-400 hover:bg-slate-800 hover:border-slate-600"
                    }
                  `}
                >
                  <div className="text-sm font-bold">{g.id}</div>
                  <div className="text-[10px] opacity-70 mt-0.5">{g.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Flowchart steps */}
          <div className="flex-1 overflow-y-auto p-4 space-y-0">
            <AnimatePresence mode="popLayout">
              {!selectedGrade ? (
                <motion.div
                  key="placeholder"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center h-full text-center"
                >
                  <Layers size={48} className="text-slate-700 mb-4" />
                  <p className="text-sm text-slate-500">
                    Select a steel grade above to begin the assessment
                  </p>
                  <p className="text-xs text-slate-600 mt-2 max-w-xs">
                    The interactive flowchart will guide you through
                    Lloyd&apos;s Register crack propagation prevention measures.
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
          <div className="p-3 border-t border-slate-800 bg-[#0c1222]">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {[
                { color: "#06b6d4", label: "NDE / Butt Joint" },
                { color: "#f59e0b", label: "Crack Arrest / BCA" },
                { color: "#10b981", label: "Deck & Sheer Strake" },
                { color: "#ef4444", label: "Enhanced NDE / CTOD" },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2">
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-[10px] text-slate-500">
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── RIGHT PANEL (Visualizer) ── */}
        <div className="flex-1 flex flex-col relative overflow-hidden">
          {/* View toggle indicator */}
          <div className="absolute top-3 left-4 z-10 flex items-center gap-2">
            <div
              className={`
                px-3 py-1 rounded-full text-xs font-bold border backdrop-blur-sm
                ${viewType === "A" ? "bg-sky-900/40 border-sky-700/50 text-sky-300" : "bg-slate-900/40 border-slate-700/50 text-slate-500"}
              `}
            >
              2D SECTION
            </div>
            <div
              className={`
                px-3 py-1 rounded-full text-xs font-bold border backdrop-blur-sm
                ${viewType === "B" ? "bg-sky-900/40 border-sky-700/50 text-sky-300" : "bg-slate-900/40 border-slate-700/50 text-slate-500"}
              `}
            >
              3D ISOMETRIC
            </div>
          </div>

          {/* Active grade badge */}
          {selectedGrade && (
            <div className="absolute top-3 right-4 z-10">
              <div className="px-3 py-1 rounded-full text-xs font-bold bg-slate-800/80 text-slate-300 border border-slate-700 backdrop-blur-sm">
                {selectedGrade}
              </div>
            </div>
          )}

          {/* SVG Visualizer */}
          <div className="flex-1 flex items-center justify-center p-4 relative">
            <AnimatePresence mode="wait">
              <motion.div
                key={viewType + (highlight || "none")}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.4, ease: "easeInOut" }}
                className="w-full h-full max-w-[700px] max-h-[560px]"
              >
                {viewType === "A" ? (
                  <ViewA
                    highlight={highlight}
                    highlightColor={highlightColor}
                  />
                ) : (
                  <ViewB
                    highlight={highlight}
                    highlightColor={highlightColor}
                  />
                )}
              </motion.div>
            </AnimatePresence>

            {/* Floating tooltip */}
            <TooltipOverlay tooltip={tooltip} color={highlightColor} />
          </div>

          {/* Bottom info bar */}
          <div className="flex-shrink-0 px-4 py-2 border-t border-slate-800 bg-[#0c1222]/80 backdrop-blur-sm flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <AlertTriangle size={12} />
              <span>
                Reference: LR Rules Pt.3, Ch.8, Sec.8.2 &mdash; Hatch Coaming
                Crack Arrest
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <Scan size={12} />
              <span>
                {viewType === "A" ? "Cross-Section" : "Isometric"} View
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
