import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Anchor,
  ChevronRight,
  ChevronDown,
  RotateCcw,
  Info,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Eye,
  Layers,
  Shield,
  AlertTriangle,
} from 'lucide-react';

/* ───────────────────────── colour palette ───────────────────────── */
const C = {
  bg: '#0f172a',
  panel: '#1e293b',
  border: '#334155',
  text: '#e2e8f0',
  dim: '#94a3b8',
  accent: '#38bdf8',
  accentDim: '#0ea5e9',
  neonGreen: '#4ade80',
  neonYellow: '#facc15',
  neonRed: '#f87171',
  neonOrange: '#fb923c',
  neonPurple: '#a78bfa',
  coaming: '#60a5fa',
  deck: '#818cf8',
  sheer: '#34d399',
  longitudinal: '#fbbf24',
  weldQ12: '#94a3b8',
  weldQ34: '#f87171',
  blockA: '#2563eb',
  blockB: '#7c3aed',
};

/* ───────────────────── isometric math helpers ───────────────────── */
const ISO_ANGLE = Math.PI / 6;
const COS30 = Math.cos(ISO_ANGLE);
const SIN30 = Math.sin(ISO_ANGLE);

function isoProject(x, y, z) {
  return {
    sx: COS30 * x - COS30 * y,
    sy: SIN30 * x + SIN30 * y - z,
  };
}

function isoP(x, y, z, ox = 300, oy = 220) {
  const { sx, sy } = isoProject(x, y, z);
  return { x: ox + sx, y: oy + sy };
}

function isoStr(x, y, z, ox = 300, oy = 220) {
  const p = isoP(x, y, z, ox, oy);
  return `${p.x},${p.y}`;
}

/* ────────────────── View A: 2D cross‑section (Fig 8.2.1) ────────── */
function ViewA({ highlight }) {
  const hl = highlight || {};
  const glowId = 'glow-a';

  const strokeW = (key) => (hl[key] ? 3 : 1.5);
  const strokeC = (key, base) => (hl[key] ? C.accent : base);
  const fillO = (key) => (hl[key] ? 0.25 : 0.08);

  return (
    <svg viewBox="0 0 600 420" className="w-full h-full">
      <defs>
        <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <pattern id="grid-a" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke={C.border} strokeWidth="0.3" />
        </pattern>
        <pattern id="hatch-a" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke={C.dim} strokeWidth="0.5" opacity="0.3" />
        </pattern>
      </defs>

      <rect width="600" height="420" fill={C.bg} />
      <rect width="600" height="420" fill="url(#grid-a)" />

      {/* Title */}
      <text x="300" y="24" textAnchor="middle" fill={C.accent} fontSize="13" fontWeight="bold" fontFamily="monospace">
        VIEW A — 2D Cross-Section (Fig 8.2.1)
      </text>

      {/* ── Sheer strake ── */}
      <rect
        x="80" y="180" width="12" height="160"
        fill={C.sheer} fillOpacity={fillO('sheerStrake')}
        stroke={strokeC('sheerStrake', C.sheer)}
        strokeWidth={strokeW('sheerStrake')}
        filter={hl.sheerStrake ? `url(#${glowId})` : undefined}
      />
      <text x="60" y="265" textAnchor="middle" fill={C.sheer} fontSize="9" fontFamily="monospace"
        transform="rotate(-90 60 265)">
        SHEER STRAKE
      </text>

      {/* ── Upper deck ── */}
      <rect
        x="92" y="180" width="420" height="10"
        fill={C.deck} fillOpacity={fillO('upperDeck')}
        stroke={strokeC('upperDeck', C.deck)}
        strokeWidth={strokeW('upperDeck')}
        filter={hl.upperDeck ? `url(#${glowId})` : undefined}
      />
      <text x="300" y="208" textAnchor="middle" fill={C.deck} fontSize="9" fontFamily="monospace">
        UPPER DECK
      </text>

      {/* ── Hatch side coaming plate ── */}
      <rect
        x="170" y="70" width="10" height="112"
        fill={C.coaming} fillOpacity={fillO('coamingSide')}
        stroke={strokeC('coamingSide', C.coaming)}
        strokeWidth={strokeW('coamingSide')}
        filter={hl.coamingSide ? `url(#${glowId})` : undefined}
      />
      <text x="195" y="130" fill={C.coaming} fontSize="8" fontFamily="monospace">HATCH SIDE</text>
      <text x="195" y="142" fill={C.coaming} fontSize="8" fontFamily="monospace">COAMING PLATE</text>

      {/* ── Hatch coaming top plate ── */}
      <rect
        x="130" y="60" width="180" height="12"
        fill={C.accent} fillOpacity={fillO('coamingTop')}
        stroke={strokeC('coamingTop', C.accent)}
        strokeWidth={strokeW('coamingTop')}
        filter={hl.coamingTop ? `url(#${glowId})` : undefined}
      />
      <text x="220" y="52" textAnchor="middle" fill={C.accent} fontSize="9" fontWeight="bold" fontFamily="monospace">
        HATCH COAMING TOP PLATE
      </text>
      {/* Thickness label */}
      {hl.coamingTop && (
        <g>
          <line x1="315" y1="55" x2="315" y2="78" stroke={C.neonYellow} strokeWidth="1" strokeDasharray="3,2" />
          <text x="330" y="75" fill={C.neonYellow} fontSize="8" fontFamily="monospace">t ≥ threshold</text>
        </g>
      )}

      {/* ── Deck longitudinals ── */}
      {[230, 310, 390, 460].map((lx, i) => (
        <g key={`dl-${i}`}>
          <rect
            x={lx} y="190" width="4" height="50"
            fill={C.longitudinal} fillOpacity={fillO('deckLong')}
            stroke={strokeC('deckLong', C.longitudinal)}
            strokeWidth={strokeW('deckLong')}
            filter={hl.deckLong ? `url(#${glowId})` : undefined}
          />
          <rect x={lx - 8} y="238" width="20" height="3"
            fill={C.longitudinal} fillOpacity={fillO('deckLong')}
            stroke={strokeC('deckLong', C.longitudinal)}
            strokeWidth={strokeW('deckLong')}
          />
        </g>
      ))}
      <text x="350" y="260" textAnchor="middle" fill={C.longitudinal} fontSize="8" fontFamily="monospace">
        DECK LONGITUDINALS
      </text>

      {/* ── Side longitudinals ── */}
      {[220, 270, 320].map((ly, i) => (
        <g key={`sl-${i}`}>
          <rect
            x="92" y={ly} width="40" height="3"
            fill={C.longitudinal} fillOpacity={fillO('sideLong')}
            stroke={strokeC('sideLong', C.longitudinal)}
            strokeWidth={strokeW('sideLong')}
            filter={hl.sideLong ? `url(#${glowId})` : undefined}
          />
          <rect x="130" y={ly - 6} width="3" height="15"
            fill={C.longitudinal} fillOpacity={fillO('sideLong')}
            stroke={strokeC('sideLong', C.longitudinal)}
            strokeWidth={strokeW('sideLong')}
          />
        </g>
      ))}
      <text x="68" y="355" fill={C.longitudinal} fontSize="8" fontFamily="monospace"
        transform="rotate(-90 68 355)">
        SIDE LONG&apos;LS
      </text>

      {/* ── Coaming bracket ── */}
      <polygon
        points="170,182 180,182 170,140"
        fill={C.dim} fillOpacity="0.15"
        stroke={C.dim} strokeWidth="1"
      />

      {/* ── Dimension lines ── */}
      <g stroke={C.dim} strokeWidth="0.5" strokeDasharray="4,3" opacity="0.5">
        <line x1="130" y1="40" x2="310" y2="40" />
        <line x1="130" y1="38" x2="130" y2="42" />
        <line x1="310" y1="38" x2="310" y2="42" />
        <text x="220" y="38" textAnchor="middle" fill={C.dim} fontSize="7" fontFamily="monospace">Coaming breadth</text>
      </g>

      {/* Legend */}
      <g transform="translate(400, 290)">
        <text x="0" y="0" fill={C.dim} fontSize="9" fontWeight="bold" fontFamily="monospace">LEGEND</text>
        {[
          [C.accent, 'Coaming top plate'],
          [C.coaming, 'Coaming side plate'],
          [C.deck, 'Upper deck'],
          [C.sheer, 'Sheer strake'],
          [C.longitudinal, 'Longitudinals'],
        ].map(([color, label], i) => (
          <g key={label} transform={`translate(0, ${16 + i * 16})`}>
            <rect x="0" y="-8" width="12" height="8" fill={color} fillOpacity="0.4" stroke={color} strokeWidth="1" />
            <text x="18" y="0" fill={C.dim} fontSize="8" fontFamily="monospace">{label}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

/* ──────────── View B: 3D isometric block joint ──────────── */
function ViewB({ highlight }) {
  const hl = highlight || {};
  const glowId = 'glow-b';

  // Block dimensions
  const BW = 100; // width (x)
  const BD = 80;  // depth (y)
  const BH = 60;  // height (z)
  const GAP = 6;
  const deckH = 6;
  const coamH = 45;
  const coamW = 60;
  const coamT = 5;

  // Offsets for centering
  const OX = 300;
  const OY = 260;

  // Helper to build polygon points from iso coords
  const quad = (pts) => pts.map(([x, y, z]) => isoStr(x, y, z, OX, OY)).join(' ');

  // Block A (left) - x from -BW-GAP/2 to -GAP/2
  const ax1 = -BW - GAP / 2;
  const ax2 = -GAP / 2;
  // Block B (right) - x from GAP/2 to BW+GAP/2
  const bx1 = GAP / 2;
  const bx2 = BW + GAP / 2;

  const y1 = -BD / 2;
  const y2 = BD / 2;

  const jointActive = hl.buttJoint;
  const longActive = hl.longJoint;

  return (
    <svg viewBox="0 0 600 420" className="w-full h-full">
      <defs>
        <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="glow-red" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <pattern id="grid-b" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke={C.border} strokeWidth="0.3" />
        </pattern>
      </defs>

      <rect width="600" height="420" fill={C.bg} />
      <rect width="600" height="420" fill="url(#grid-b)" />

      <text x="300" y="24" textAnchor="middle" fill={C.accent} fontSize="13" fontWeight="bold" fontFamily="monospace">
        VIEW B — 3D Isometric Block Joint Detail
      </text>

      {/* ── Block A hull (bottom) ── */}
      <polygon
        points={quad([
          [ax1, y1, 0], [ax2, y1, 0], [ax2, y2, 0], [ax1, y2, 0],
        ])}
        fill={C.blockA} fillOpacity="0.06" stroke={C.blockA} strokeWidth="1" opacity="0.5"
      />
      {/* Block A top face */}
      <polygon
        points={quad([
          [ax1, y1, BH], [ax2, y1, BH], [ax2, y2, BH], [ax1, y2, BH],
        ])}
        fill={C.blockA} fillOpacity="0.12" stroke={C.blockA} strokeWidth="1"
      />
      {/* Block A front face */}
      <polygon
        points={quad([
          [ax1, y2, 0], [ax2, y2, 0], [ax2, y2, BH], [ax1, y2, BH],
        ])}
        fill={C.blockA} fillOpacity="0.08" stroke={C.blockA} strokeWidth="1"
      />
      {/* Block A right face */}
      <polygon
        points={quad([
          [ax2, y1, 0], [ax2, y2, 0], [ax2, y2, BH], [ax2, y1, BH],
        ])}
        fill={C.blockA} fillOpacity="0.1" stroke={C.blockA} strokeWidth="1"
      />

      {/* ── Block B hull (bottom) ── */}
      <polygon
        points={quad([
          [bx1, y1, 0], [bx2, y1, 0], [bx2, y2, 0], [bx1, y2, 0],
        ])}
        fill={C.blockB} fillOpacity="0.06" stroke={C.blockB} strokeWidth="1" opacity="0.5"
      />
      <polygon
        points={quad([
          [bx1, y1, BH], [bx2, y1, BH], [bx2, y2, BH], [bx1, y2, BH],
        ])}
        fill={C.blockB} fillOpacity="0.12" stroke={C.blockB} strokeWidth="1"
      />
      <polygon
        points={quad([
          [bx1, y2, 0], [bx2, y2, 0], [bx2, y2, BH], [bx1, y2, BH],
        ])}
        fill={C.blockB} fillOpacity="0.08" stroke={C.blockB} strokeWidth="1"
      />
      <polygon
        points={quad([
          [bx2, y1, 0], [bx2, y2, 0], [bx2, y2, BH], [bx2, y1, BH],
        ])}
        fill={C.blockB} fillOpacity="0.1" stroke={C.blockB} strokeWidth="1"
      />

      {/* ── Upper deck plates ── */}
      {/* Block A deck */}
      <polygon
        points={quad([
          [ax1, y1, BH], [ax2, y1, BH], [ax2, y2, BH], [ax1, y2, BH],
        ])}
        fill={C.deck} fillOpacity="0.15" stroke={C.deck} strokeWidth="1.2"
      />
      {/* Block B deck */}
      <polygon
        points={quad([
          [bx1, y1, BH], [bx2, y1, BH], [bx2, y2, BH], [bx1, y2, BH],
        ])}
        fill={C.deck} fillOpacity="0.15" stroke={C.deck} strokeWidth="1.2"
      />

      {/* ── Coaming on Block A ── */}
      {(() => {
        const cBase = BH;
        const cTop = BH + coamH;
        const cy1 = y1 + 10;
        const cy2 = cy1 + coamT;
        // Side plate
        return (
          <g>
            <polygon
              points={quad([
                [ax1 + 15, cy1, cBase], [ax2, cy1, cBase],
                [ax2, cy1, cTop], [ax1 + 15, cy1, cTop],
              ])}
              fill={C.coaming} fillOpacity="0.15" stroke={C.coaming} strokeWidth="1"
            />
            {/* Top plate */}
            <polygon
              points={quad([
                [ax1 + 15, cy1 - 15, cTop], [ax2, cy1 - 15, cTop],
                [ax2, cy1 + coamT, cTop], [ax1 + 15, cy1 + coamT, cTop],
              ])}
              fill={C.accent} fillOpacity={hl.coamingTop ? 0.35 : 0.18}
              stroke={hl.coamingTop ? C.accent : C.coaming}
              strokeWidth={hl.coamingTop ? 2 : 1}
              filter={hl.coamingTop ? `url(#${glowId})` : undefined}
            />
          </g>
        );
      })()}

      {/* ── Coaming on Block B ── */}
      {(() => {
        const cBase = BH;
        const cTop = BH + coamH;
        const cy1 = y1 + 10;
        return (
          <g>
            <polygon
              points={quad([
                [bx1, cy1, cBase], [bx2 - 15, cy1, cBase],
                [bx2 - 15, cy1, cTop], [bx1, cy1, cTop],
              ])}
              fill={C.coaming} fillOpacity="0.15" stroke={C.coaming} strokeWidth="1"
            />
            <polygon
              points={quad([
                [bx1, cy1 - 15, cTop], [bx2 - 15, cy1 - 15, cTop],
                [bx2 - 15, cy1 + coamT, cTop], [bx1, cy1 + coamT, cTop],
              ])}
              fill={C.accent} fillOpacity={hl.coamingTop ? 0.35 : 0.18}
              stroke={hl.coamingTop ? C.accent : C.coaming}
              strokeWidth={hl.coamingTop ? 2 : 1}
              filter={hl.coamingTop ? `url(#${glowId})` : undefined}
            />
          </g>
        );
      })()}

      {/* ── Longitudinal stiffeners (Q.1 / Q.2 direction) ── */}
      {[-10, 10, 30].map((yOff, i) => {
        const ly = y1 + 20 + yOff;
        return (
          <g key={`long-${i}`}>
            {/* Stiffener across Block A */}
            <line
              x1={isoP(ax1 + 10, ly, BH, OX, OY).x} y1={isoP(ax1 + 10, ly, BH, OX, OY).y}
              x2={isoP(ax2, ly, BH, OX, OY).x} y2={isoP(ax2, ly, BH, OX, OY).y}
              stroke={longActive ? C.neonYellow : C.longitudinal}
              strokeWidth={longActive ? 2 : 1}
              opacity={longActive ? 1 : 0.5}
              filter={longActive ? `url(#${glowId})` : undefined}
            />
            {/* Stiffener across Block B */}
            <line
              x1={isoP(bx1, ly, BH, OX, OY).x} y1={isoP(bx1, ly, BH, OX, OY).y}
              x2={isoP(bx2 - 10, ly, BH, OX, OY).x} y2={isoP(bx2 - 10, ly, BH, OX, OY).y}
              stroke={longActive ? C.neonYellow : C.longitudinal}
              strokeWidth={longActive ? 2 : 1}
              opacity={longActive ? 1 : 0.5}
              filter={longActive ? `url(#${glowId})` : undefined}
            />
          </g>
        );
      })}

      {/* ── Q.3 / Q.4: Block-to-block transverse BUTT JOINT SEAM ── */}
      <line
        x1={isoP(0, y1, 0, OX, OY).x} y1={isoP(0, y1, 0, OX, OY).y}
        x2={isoP(0, y2, 0, OX, OY).x} y2={isoP(0, y2, 0, OX, OY).y}
        stroke={jointActive ? C.neonRed : C.weldQ34}
        strokeWidth={jointActive ? 3 : 1.5}
        strokeDasharray={jointActive ? '0' : '8,4'}
        filter={jointActive ? 'url(#glow-red)' : undefined}
      />
      <line
        x1={isoP(0, y1, BH, OX, OY).x} y1={isoP(0, y1, BH, OX, OY).y}
        x2={isoP(0, y2, BH, OX, OY).x} y2={isoP(0, y2, BH, OX, OY).y}
        stroke={jointActive ? C.neonRed : C.weldQ34}
        strokeWidth={jointActive ? 3 : 1.5}
        strokeDasharray={jointActive ? '0' : '8,4'}
        filter={jointActive ? 'url(#glow-red)' : undefined}
      />
      {/* Vertical seam lines */}
      {[y1, y1 + BD * 0.33, y1 + BD * 0.66, y2].map((yy, i) => (
        <line key={`vs-${i}`}
          x1={isoP(0, yy, 0, OX, OY).x} y1={isoP(0, yy, 0, OX, OY).y}
          x2={isoP(0, yy, BH, OX, OY).x} y2={isoP(0, yy, BH, OX, OY).y}
          stroke={jointActive ? C.neonRed : C.weldQ34}
          strokeWidth={jointActive ? 2 : 1}
          strokeDasharray={jointActive ? '0' : '6,4'}
          filter={jointActive ? 'url(#glow-red)' : undefined}
        />
      ))}

      {/* Coaming butt joint seam (top) */}
      <line
        x1={isoP(0, y1 + 10, BH, OX, OY).x} y1={isoP(0, y1 + 10, BH, OX, OY).y}
        x2={isoP(0, y1 + 10, BH + coamH, OX, OY).x} y2={isoP(0, y1 + 10, BH + coamH, OX, OY).y}
        stroke={jointActive ? C.neonRed : C.weldQ34}
        strokeWidth={jointActive ? 3 : 1.5}
        strokeDasharray={jointActive ? '0' : '8,4'}
        filter={jointActive ? 'url(#glow-red)' : undefined}
      />

      {/* ── Scan pulse animation on butt joint ── */}
      {jointActive && (
        <g>
          <circle r="5" fill={C.neonRed} opacity="0.8" filter="url(#glow-red)">
            <animateMotion
              dur="2.5s" repeatCount="indefinite"
              path={`M${isoP(0, y1, BH / 2, OX, OY).x},${isoP(0, y1, BH / 2, OX, OY).y} L${isoP(0, y2, BH / 2, OX, OY).x},${isoP(0, y2, BH / 2, OX, OY).y}`}
            />
          </circle>
          <circle r="3" fill={C.neonRed} opacity="0.6">
            <animateMotion
              dur="2.5s" repeatCount="indefinite" begin="0.8s"
              path={`M${isoP(0, y2, BH * 0.8, OX, OY).x},${isoP(0, y2, BH * 0.8, OX, OY).y} L${isoP(0, y1, BH * 0.8, OX, OY).x},${isoP(0, y1, BH * 0.8, OX, OY).y}`}
            />
          </circle>
        </g>
      )}

      {/* ── Labels ── */}
      {/* Block A label */}
      <text
        x={isoP(ax1 + BW / 2, y2 + 8, 0, OX, OY).x}
        y={isoP(ax1 + BW / 2, y2 + 8, 0, OX, OY).y + 14}
        textAnchor="middle" fill={C.blockA} fontSize="11" fontWeight="bold" fontFamily="monospace"
      >
        BLOCK A
      </text>
      {/* Block B label */}
      <text
        x={isoP(bx1 + BW / 2, y2 + 8, 0, OX, OY).x}
        y={isoP(bx1 + BW / 2, y2 + 8, 0, OX, OY).y + 14}
        textAnchor="middle" fill={C.blockB} fontSize="11" fontWeight="bold" fontFamily="monospace"
      >
        BLOCK B
      </text>

      {/* Q.3/Q.4 label */}
      <g>
        <text
          x={isoP(0, y2 + 5, BH / 2, OX, OY).x + 15}
          y={isoP(0, y2 + 5, BH / 2, OX, OY).y}
          fill={jointActive ? C.neonRed : C.weldQ34} fontSize="9" fontWeight="bold" fontFamily="monospace"
        >
          Q.3 / Q.4
        </text>
        <text
          x={isoP(0, y2 + 5, BH / 2, OX, OY).x + 15}
          y={isoP(0, y2 + 5, BH / 2, OX, OY).y + 12}
          fill={jointActive ? C.neonRed : C.dim} fontSize="7" fontFamily="monospace"
        >
          Block-to-block butt weld
        </text>
        <text
          x={isoP(0, y2 + 5, BH / 2, OX, OY).x + 15}
          y={isoP(0, y2 + 5, BH / 2, OX, OY).y + 22}
          fill={jointActive ? C.neonRed : C.dim} fontSize="7" fontFamily="monospace"
        >
          → Governed by Measure 1
        </text>
      </g>

      {/* Q.1/Q.2 label */}
      <g>
        <text
          x={isoP(ax1 + 20, y1 - 5, BH, OX, OY).x}
          y={isoP(ax1 + 20, y1 - 5, BH, OX, OY).y - 8}
          fill={longActive ? C.neonYellow : C.weldQ12} fontSize="9" fontWeight="bold" fontFamily="monospace"
        >
          Q.1 / Q.2
        </text>
        <text
          x={isoP(ax1 + 20, y1 - 5, BH, OX, OY).x}
          y={isoP(ax1 + 20, y1 - 5, BH, OX, OY).y + 2}
          fill={longActive ? C.neonYellow : C.dim} fontSize="7" fontFamily="monospace"
        >
          Longitudinal joints
        </text>
        <text
          x={isoP(ax1 + 20, y1 - 5, BH, OX, OY).x}
          y={isoP(ax1 + 20, y1 - 5, BH, OX, OY).y + 12}
          fill={longActive ? C.neonYellow : C.dim} fontSize="7" fontFamily="monospace"
        >
          → NOT governed by Measure 1
        </text>
      </g>

      {/* ── U11/M11 marker (at butt joint intersection) ── */}
      {jointActive && (
        <g>
          <circle
            cx={isoP(0, y1 + 20, BH, OX, OY).x}
            cy={isoP(0, y1 + 20, BH, OX, OY).y}
            r="8" fill="none" stroke={C.neonRed} strokeWidth="2"
            filter="url(#glow-red)"
          >
            <animate attributeName="r" values="6;10;6" dur="1.5s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="1;0.5;1" dur="1.5s" repeatCount="indefinite" />
          </circle>
          <text
            x={isoP(0, y1 + 20, BH, OX, OY).x - 30}
            y={isoP(0, y1 + 20, BH, OX, OY).y - 14}
            fill={C.neonRed} fontSize="8" fontWeight="bold" fontFamily="monospace"
          >
            U11/M11
          </text>
          <text
            x={isoP(0, y1 + 20, BH, OX, OY).x - 30}
            y={isoP(0, y1 + 20, BH, OX, OY).y - 4}
            fill={C.neonOrange} fontSize="7" fontFamily="monospace"
          >
            100% UT
          </text>
        </g>
      )}

      {/* ── Legend ── */}
      <g transform="translate(420, 330)">
        <text x="0" y="0" fill={C.dim} fontSize="9" fontWeight="bold" fontFamily="monospace">JOINT TYPES</text>
        <rect x="0" y="8" width="16" height="3" fill={C.weldQ34} />
        <text x="22" y="14" fill={C.dim} fontSize="7" fontFamily="monospace">Q.3/Q.4 Butt (Measure 1)</text>
        <rect x="0" y="22" width="16" height="3" fill={C.longitudinal} />
        <text x="22" y="28" fill={C.dim} fontSize="7" fontFamily="monospace">Q.1/Q.2 Longitudinal</text>
        <rect x="0" y="36" width="8" height="8" fill={C.blockA} fillOpacity="0.3" stroke={C.blockA} strokeWidth="1" />
        <text x="22" y="44" fill={C.dim} fontSize="7" fontFamily="monospace">Block A</text>
        <rect x="0" y="50" width="8" height="8" fill={C.blockB} fillOpacity="0.3" stroke={C.blockB} strokeWidth="1" />
        <text x="22" y="58" fill={C.dim} fontSize="7" fontFamily="monospace">Block B</text>
      </g>
    </svg>
  );
}

/* ───────────────────── STEPS state‑machine ───────────────────── */
const STEPS = {
  /* ── EH36 ── */
  'eh36-start': {
    type: 'info',
    title: 'EH36 — No Additional Measures',
    body: 'For EH36 steel (σᵧ = 355 MPa), Lloyd\'s Register Rules Part 3 Ch.8 Sec.8.2 does NOT require any additional crack propagation prevention measures for hatch coaming thick plates.',
    terminal: true,
    view: 'A',
    highlight: { coamingTop: true, upperDeck: true },
  },

  /* ── EH40 ── */
  'eh40-start': {
    type: 'question',
    title: 'EH40 — Coaming Top Plate Thickness',
    body: 'Is the hatch coaming top plate thickness ≥ 20mm?',
    yes: 'eh40-thick-m1',
    no: 'eh40-thin-end',
    view: 'A',
    highlight: { coamingTop: true },
  },
  'eh40-thin-end': {
    type: 'info',
    title: 'EH40 — No Additional Measures Required',
    body: 'For EH40 with coaming top plate < 20mm, no additional crack arrest measures are required per LR Rules.',
    terminal: true,
    view: 'A',
    highlight: { coamingTop: true },
  },
  'eh40-thick-m1': {
    type: 'info',
    title: 'Measure 1: 100% UT of Block Joint Butt Welds',
    body: 'All block-to-block butt welds (Q.3/Q.4) in way of hatch coaming thick plate zone must undergo 100% Ultrasonic Testing (UT). This applies to joints U11/M11 type that intersect the block-to-block butt weld.\n\nNote: Q.1/Q.2 longitudinal joints are NOT governed by this measure.',
    next: 'eh40-thick-q1',
    view: 'B',
    highlight: { buttJoint: true },
  },
  'eh40-thick-q1': {
    type: 'question',
    title: 'EH40 — Welding Process Check',
    body: 'Is the block joint butt weld performed by FCAW or GMAW process (NOT EGW)?',
    yes: 'eh40-thick-fcaw-end',
    no: 'eh40-thick-egw-m2',
    view: 'B',
    highlight: { buttJoint: true },
  },
  'eh40-thick-fcaw-end': {
    type: 'info',
    title: 'EH40 + FCAW/GMAW — Measure 1 Only',
    body: 'For EH40 (t ≥ 20mm) with FCAW/GMAW welding:\n\n✓ Measure 1 (100% UT) is sufficient.\n\nNo additional CTOD testing or BCA steel required.',
    terminal: true,
    view: 'B',
    highlight: { buttJoint: true },
  },
  'eh40-thick-egw-m2': {
    type: 'info',
    title: 'Measure 2: CTOD Testing Required',
    body: 'Because EGW (Electro-Gas Welding) is used for the block joint, CTOD (Crack Tip Opening Displacement) testing of the weld procedure is required.\n\nCTOD tests must demonstrate adequate fracture toughness at the design temperature.',
    next: 'eh40-thick-egw-q2',
    view: 'B',
    highlight: { buttJoint: true, coamingTop: true },
  },
  'eh40-thick-egw-q2': {
    type: 'question',
    title: 'EH40 + EGW — CTOD Result',
    body: 'Does the CTOD test result meet the acceptance criteria?',
    yes: 'eh40-thick-egw-pass',
    no: 'eh40-thick-egw-fail',
    view: 'B',
    highlight: { buttJoint: true },
  },
  'eh40-thick-egw-pass': {
    type: 'info',
    title: 'EH40 + EGW — CTOD Passed',
    body: 'CTOD test passed. Measures 1 + 2 satisfied.\n\n✓ Measure 1: 100% UT — Done\n✓ Measure 2: CTOD test — Passed\n\nNo BCA steel insertion required.',
    terminal: true,
    view: 'B',
    highlight: { buttJoint: true },
  },
  'eh40-thick-egw-fail': {
    type: 'info',
    title: 'Measure 3: BCA Steel Required',
    body: 'CTOD test failed. BCA (Brittle Crack Arrest) steel must be inserted.\n\nBCA1 or BCA2 grade steel strakes are to be inserted in the upper deck and/or sheer strake in way of the hatch coaming region, following ShipRight procedure.\n\n✓ Measure 1: 100% UT\n✓ Measure 2: CTOD attempted (failed)\n✓ Measure 3: BCA steel insertion',
    terminal: true,
    view: 'A',
    highlight: { coamingTop: true, upperDeck: true, sheerStrake: true },
  },

  /* ── EH47 ── */
  'eh47-start': {
    type: 'question',
    title: 'EH47 — Coaming Top Plate Thickness',
    body: 'Is the hatch coaming top plate thickness ≥ 15mm?',
    yes: 'eh47-thick-m1',
    no: 'eh47-thin-end',
    view: 'A',
    highlight: { coamingTop: true },
  },
  'eh47-thin-end': {
    type: 'info',
    title: 'EH47 — No Additional Measures Required',
    body: 'For EH47 with coaming top plate < 15mm, no additional crack arrest measures are required per LR Rules.',
    terminal: true,
    view: 'A',
    highlight: { coamingTop: true },
  },
  'eh47-thick-m1': {
    type: 'info',
    title: 'Measure 1: 100% UT of Block Joint Butt Welds',
    body: 'All block-to-block butt welds (Q.3/Q.4) in way of hatch coaming thick plate zone must undergo 100% Ultrasonic Testing (UT).\n\nNote: The EH47 threshold is 15mm (lower than EH40\'s 20mm) due to higher yield strength (460 MPa).',
    next: 'eh47-thick-q1',
    view: 'B',
    highlight: { buttJoint: true },
  },
  'eh47-thick-q1': {
    type: 'question',
    title: 'EH47 — Welding Process Check',
    body: 'Is the block joint butt weld performed by FCAW or GMAW process (NOT EGW)?',
    yes: 'eh47-thick-fcaw-m2',
    no: 'eh47-thick-egw-m2',
    view: 'B',
    highlight: { buttJoint: true },
  },
  'eh47-thick-fcaw-m2': {
    type: 'info',
    title: 'Measure 2: CTOD Testing (EH47 + FCAW/GMAW)',
    body: 'Even with FCAW/GMAW, EH47 requires CTOD testing due to the higher yield strength.\n\nCTOD tests must demonstrate adequate fracture toughness at the design temperature.',
    next: 'eh47-thick-fcaw-q2',
    view: 'B',
    highlight: { buttJoint: true, coamingTop: true },
  },
  'eh47-thick-fcaw-q2': {
    type: 'question',
    title: 'EH47 + FCAW/GMAW — CTOD Result',
    body: 'Does the CTOD test result meet the acceptance criteria?',
    yes: 'eh47-thick-fcaw-pass',
    no: 'eh47-thick-fcaw-fail',
    view: 'B',
    highlight: { buttJoint: true },
  },
  'eh47-thick-fcaw-pass': {
    type: 'info',
    title: 'EH47 + FCAW/GMAW — CTOD Passed',
    body: 'CTOD test passed.\n\n✓ Measure 1: 100% UT — Done\n✓ Measure 2: CTOD test — Passed\n\nNo BCA steel required.',
    terminal: true,
    view: 'B',
    highlight: { buttJoint: true },
  },
  'eh47-thick-fcaw-fail': {
    type: 'info',
    title: 'Measure 3: BCA Steel Required',
    body: 'CTOD test failed for EH47 + FCAW/GMAW.\n\nBCA2 grade steel strakes must be inserted in the upper deck and/or sheer strake in way of the hatch coaming region.\n\n✓ Measure 1: 100% UT\n✓ Measure 2: CTOD attempted (failed)\n✓ Measure 3: BCA steel insertion',
    terminal: true,
    view: 'A',
    highlight: { coamingTop: true, upperDeck: true, sheerStrake: true },
  },
  'eh47-thick-egw-m2': {
    type: 'info',
    title: 'Measure 2: CTOD Testing (EH47 + EGW)',
    body: 'EGW process with EH47 requires CTOD testing.\n\nNote: EGW combined with EH47 is the highest risk combination due to high yield strength + high heat input welding.',
    next: 'eh47-thick-egw-q2',
    view: 'B',
    highlight: { buttJoint: true, coamingTop: true },
  },
  'eh47-thick-egw-q2': {
    type: 'question',
    title: 'EH47 + EGW — CTOD Result',
    body: 'Does the CTOD test result meet the acceptance criteria?',
    yes: 'eh47-thick-egw-pass',
    no: 'eh47-thick-egw-fail',
    view: 'B',
    highlight: { buttJoint: true },
  },
  'eh47-thick-egw-pass': {
    type: 'info',
    title: 'EH47 + EGW — CTOD Passed',
    body: 'CTOD test passed.\n\n✓ Measure 1: 100% UT — Done\n✓ Measure 2: CTOD test — Passed\n\nNo BCA steel required.',
    terminal: true,
    view: 'B',
    highlight: { buttJoint: true },
  },
  'eh47-thick-egw-fail': {
    type: 'info',
    title: 'Measure 3: BCA Steel Required',
    body: 'CTOD test failed for EH47 + EGW — highest risk combination.\n\nBCA2 grade steel strakes must be inserted. Additional ShipRight SDA/FDA notation conditions may apply.\n\n✓ Measure 1: 100% UT\n✓ Measure 2: CTOD attempted (failed)\n✓ Measure 3: BCA steel insertion + ShipRight review',
    terminal: true,
    view: 'A',
    highlight: { coamingTop: true, upperDeck: true, sheerStrake: true },
  },
};

/* ─────────────── FlowNode component ─────────────── */
function FlowNode({ step, onAnswer, onNext, onReset }) {
  if (!step) return null;
  const isQuestion = step.type === 'question';

  return (
    <motion.div
      key={step.title}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.35 }}
      className="rounded-xl border p-5"
      style={{
        borderColor: isQuestion ? C.neonYellow : step.terminal ? C.neonGreen : C.accent,
        background: `${C.panel}ee`,
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        {isQuestion ? (
          <AlertTriangle size={18} color={C.neonYellow} />
        ) : step.terminal ? (
          <CheckCircle2 size={18} color={C.neonGreen} />
        ) : (
          <Info size={18} color={C.accent} />
        )}
        <h3
          className="text-sm font-bold font-mono"
          style={{ color: isQuestion ? C.neonYellow : step.terminal ? C.neonGreen : C.accent }}
        >
          {step.title}
        </h3>
      </div>

      {/* Body */}
      <div className="text-xs font-mono leading-relaxed whitespace-pre-line mb-4" style={{ color: C.text }}>
        {step.body}
      </div>

      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        {isQuestion && (
          <>
            <button
              onClick={() => onAnswer('yes')}
              className="flex items-center gap-1 px-4 py-2 rounded-lg text-xs font-bold font-mono transition-all hover:scale-105 cursor-pointer"
              style={{ background: C.neonGreen, color: C.bg }}
            >
              <CheckCircle2 size={14} /> YES
            </button>
            <button
              onClick={() => onAnswer('no')}
              className="flex items-center gap-1 px-4 py-2 rounded-lg text-xs font-bold font-mono transition-all hover:scale-105 cursor-pointer"
              style={{ background: C.neonRed, color: '#fff' }}
            >
              <XCircle size={14} /> NO
            </button>
          </>
        )}
        {!isQuestion && !step.terminal && (
          <button
            onClick={onNext}
            className="flex items-center gap-1 px-4 py-2 rounded-lg text-xs font-bold font-mono transition-all hover:scale-105 cursor-pointer"
            style={{ background: C.accent, color: C.bg }}
          >
            NEXT <ArrowRight size={14} />
          </button>
        )}
        {step.terminal && (
          <button
            onClick={onReset}
            className="flex items-center gap-1 px-4 py-2 rounded-lg text-xs font-bold font-mono transition-all hover:scale-105 cursor-pointer"
            style={{ background: C.border, color: C.text }}
          >
            <RotateCcw size={14} /> START OVER
          </button>
        )}
      </div>
    </motion.div>
  );
}

/* ─────────────── History breadcrumbs ─────────────── */
function HistoryTrail({ history, steps }) {
  if (history.length <= 1) return null;
  return (
    <div className="flex flex-wrap items-center gap-1 mb-4 px-1">
      {history.map((h, i) => {
        const s = steps[h.stepId];
        const isLast = i === history.length - 1;
        return (
          <span key={i} className="flex items-center gap-1">
            <span
              className="text-[10px] font-mono px-2 py-0.5 rounded-full"
              style={{
                background: isLast ? `${C.accent}33` : `${C.border}88`,
                color: isLast ? C.accent : C.dim,
                border: `1px solid ${isLast ? C.accent : 'transparent'}`,
              }}
            >
              {s?.title?.split('—')[0]?.trim() || h.stepId}
              {h.answer && (
                <span style={{ color: h.answer === 'yes' ? C.neonGreen : C.neonRed }}>
                  {' '}→ {h.answer.toUpperCase()}
                </span>
              )}
            </span>
            {!isLast && <ChevronRight size={10} color={C.dim} />}
          </span>
        );
      })}
    </div>
  );
}

/* ══════════════════════ MAIN APP ══════════════════════ */
export default function App() {
  const [grade, setGrade] = useState(null);
  const [currentStepId, setCurrentStepId] = useState(null);
  const [history, setHistory] = useState([]);

  const currentStep = currentStepId ? STEPS[currentStepId] : null;

  const selectGrade = useCallback((g) => {
    const startId = `${g}-start`;
    setGrade(g);
    setCurrentStepId(startId);
    setHistory([{ stepId: startId, answer: null }]);
  }, []);

  const handleAnswer = useCallback(
    (answer) => {
      if (!currentStep) return;
      const nextId = answer === 'yes' ? currentStep.yes : currentStep.no;
      if (nextId) {
        setHistory((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { ...updated[updated.length - 1], answer };
          return [...updated, { stepId: nextId, answer: null }];
        });
        setCurrentStepId(nextId);
      }
    },
    [currentStep]
  );

  const handleNext = useCallback(() => {
    if (!currentStep?.next) return;
    setHistory((prev) => [...prev, { stepId: currentStep.next, answer: null }]);
    setCurrentStepId(currentStep.next);
  }, [currentStep]);

  const handleReset = useCallback(() => {
    setGrade(null);
    setCurrentStepId(null);
    setHistory([]);
  }, []);

  // Determine which view to show
  const activeView = currentStep?.view || 'A';
  const highlightMap = currentStep?.highlight || {};

  const grades = [
    { id: 'eh36', label: 'EH36', sub: '355 MPa', color: C.neonGreen },
    { id: 'eh40', label: 'EH40', sub: '390 MPa', color: C.neonYellow },
    { id: 'eh47', label: 'EH47', sub: '460 MPa', color: C.neonRed },
  ];

  return (
    <div className="min-h-screen flex flex-col" style={{ background: C.bg, color: C.text }}>
      {/* ── Header ── */}
      <header
        className="flex items-center gap-3 px-6 py-3 border-b"
        style={{ borderColor: C.border, background: `${C.panel}cc` }}
      >
        <Anchor size={22} color={C.accent} />
        <div>
          <h1 className="text-sm font-bold font-mono" style={{ color: C.accent }}>
            LR Rules — Hatch Coaming Crack Propagation Prevention
          </h1>
          <p className="text-[10px] font-mono" style={{ color: C.dim }}>
            Part 3, Ch.8, Sec.8.2 — Interactive Flowchart &amp; Visualizer
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Shield size={16} color={C.dim} />
          <span className="text-[10px] font-mono" style={{ color: C.dim }}>
            Containership Structural Rules
          </span>
        </div>
      </header>

      {/* ── Main content ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Left Panel: Flowchart Wizard ── */}
        <div
          className="w-[420px] min-w-[380px] flex flex-col border-r overflow-y-auto"
          style={{ borderColor: C.border, background: `${C.panel}99` }}
        >
          <div className="p-4 border-b" style={{ borderColor: C.border }}>
            <div className="flex items-center gap-2 mb-3">
              <Layers size={16} color={C.accent} />
              <span className="text-xs font-bold font-mono" style={{ color: C.accent }}>
                STEEL GRADE SELECTION
              </span>
            </div>
            <div className="flex gap-2">
              {grades.map((g) => (
                <button
                  key={g.id}
                  onClick={() => selectGrade(g.id)}
                  className="flex-1 rounded-lg border px-3 py-2 text-center transition-all hover:scale-105 cursor-pointer"
                  style={{
                    borderColor: grade === g.id ? g.color : C.border,
                    background: grade === g.id ? `${g.color}22` : 'transparent',
                    boxShadow: grade === g.id ? `0 0 12px ${g.color}44` : 'none',
                  }}
                >
                  <div className="text-sm font-bold font-mono" style={{ color: g.color }}>
                    {g.label}
                  </div>
                  <div className="text-[10px] font-mono" style={{ color: C.dim }}>
                    {g.sub}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* History trail */}
          <div className="px-4 pt-3">
            <HistoryTrail history={history} steps={STEPS} />
          </div>

          {/* Current step */}
          <div className="flex-1 p-4">
            <AnimatePresence mode="wait">
              {currentStep ? (
                <FlowNode
                  key={currentStepId}
                  step={currentStep}
                  onAnswer={handleAnswer}
                  onNext={handleNext}
                  onReset={handleReset}
                />
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center justify-center h-full text-center"
                >
                  <Anchor size={48} color={C.border} className="mb-4" />
                  <p className="text-sm font-mono" style={{ color: C.dim }}>
                    Select a steel grade above to begin
                  </p>
                  <p className="text-[10px] font-mono mt-2" style={{ color: C.border }}>
                    The flowchart will guide you through the applicable
                    <br />
                    crack propagation prevention measures
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Measure summary bar */}
          {currentStep?.terminal && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mx-4 mb-4 p-3 rounded-lg border"
              style={{ borderColor: C.neonGreen, background: `${C.neonGreen}11` }}
            >
              <div className="text-[10px] font-bold font-mono mb-1" style={{ color: C.neonGreen }}>
                ASSESSMENT COMPLETE
              </div>
              <div className="text-[10px] font-mono" style={{ color: C.dim }}>
                {grade?.toUpperCase()} steel grade — all applicable measures determined.
                <br />
                Click START OVER to evaluate a different configuration.
              </div>
            </motion.div>
          )}
        </div>

        {/* ── Right Panel: Dynamic Visualizer ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* View toggle indicator */}
          <div className="flex items-center gap-3 px-4 py-2 border-b" style={{ borderColor: C.border }}>
            <Eye size={14} color={C.accent} />
            <span className="text-[10px] font-bold font-mono" style={{ color: C.accent }}>
              ACTIVE VIEW
            </span>
            <div className="flex gap-1">
              <span
                className="text-[10px] font-mono px-2 py-0.5 rounded-full"
                style={{
                  background: activeView === 'A' ? `${C.accent}33` : 'transparent',
                  color: activeView === 'A' ? C.accent : C.dim,
                  border: `1px solid ${activeView === 'A' ? C.accent : C.border}`,
                }}
              >
                2D Cross-Section
              </span>
              <span
                className="text-[10px] font-mono px-2 py-0.5 rounded-full"
                style={{
                  background: activeView === 'B' ? `${C.accent}33` : 'transparent',
                  color: activeView === 'B' ? C.accent : C.dim,
                  border: `1px solid ${activeView === 'B' ? C.accent : C.border}`,
                }}
              >
                3D Block Joint
              </span>
            </div>
            {currentStep && (
              <span className="ml-auto text-[10px] font-mono" style={{ color: C.dim }}>
                {Object.keys(highlightMap).length > 0
                  ? `Highlighting: ${Object.keys(highlightMap).join(', ')}`
                  : 'No highlights'}
              </span>
            )}
          </div>

          {/* SVG view area */}
          <div className="flex-1 p-4 flex items-center justify-center">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeView}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.4 }}
                className="w-full max-w-[700px] aspect-[600/420] rounded-xl border overflow-hidden"
                style={{ borderColor: C.border, background: C.bg }}
              >
                {activeView === 'A' ? (
                  <ViewA highlight={highlightMap} />
                ) : (
                  <ViewB highlight={highlightMap} />
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Bottom info bar */}
          <div
            className="flex items-center justify-between px-4 py-2 border-t text-[10px] font-mono"
            style={{ borderColor: C.border, color: C.dim }}
          >
            <span>Lloyd&apos;s Register Rules for Ships — Part 3, Chapter 8, Section 8.2</span>
            <span>Vibe Coding Interactive Visualizer v1.0</span>
          </div>
        </div>
      </div>
    </div>
  );
}
