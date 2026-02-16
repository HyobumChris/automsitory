import React, { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Layers3,
  Radar,
  ShieldCheck,
  Ship,
  Sparkles,
  Undo2,
  Workflow,
  XCircle,
} from "lucide-react";

const GRADE_META = {
  EH36: {
    accent: "from-sky-500/20 to-cyan-400/10",
    ring: "ring-sky-400/50",
    text: "text-sky-300",
    border: "border-sky-400/40",
  },
  EH40: {
    accent: "from-violet-500/20 to-fuchsia-400/10",
    ring: "ring-violet-400/50",
    text: "text-violet-300",
    border: "border-violet-400/40",
  },
  EH47: {
    accent: "from-rose-500/20 to-red-400/10",
    ring: "ring-rose-400/50",
    text: "text-rose-300",
    border: "border-rose-400/40",
  },
};

const FLOWS = {
  EH36: {
    root: "eh36_q1",
    nodes: {
      eh36_q1: {
        id: "eh36_q1",
        kind: "question",
        step: "Step 1",
        title: "Coaming t > 85 mm?",
        detail:
          "Initial threshold check for the hatch coaming before selecting prevention measures.",
        yes: "eh36_m1",
        no: "eh36_standard",
        visual: {
          view: "A",
          mode: "coamingFocus",
          tooltip:
            "View A: check hatch coaming thickness at the top and side region against the 85 mm gate.",
          anchor: "coaming",
        },
      },
      eh36_standard: {
        id: "eh36_standard",
        kind: "terminal",
        step: "Result",
        title: "Standard materials, construction and NDE",
        detail:
          "Thickness is within standard envelope. Follow baseline material and NDE requirements.",
        visual: {
          view: "A",
          mode: "default",
          tooltip:
            "Standard path: no additional crack-propagation prevention sequence is triggered.",
          anchor: "deck",
        },
      },
      eh36_m1: {
        id: "eh36_m1",
        kind: "terminal",
        step: "Measure 1",
        title: "100% NDE on all upper flange longitudinal members",
        detail:
          "Focus inspection on block-to-block butt welds at the transverse intersection.",
        visual: {
          view: "B",
          mode: "transverseCyan",
          tooltip:
            "Measure 1: 100% UT strictly applies to Block-to-Block Butt Welds (Q.3/Q.4 concept).",
          anchor: "seam",
        },
      },
    },
  },
  EH40: {
    root: "eh40_q1",
    nodes: {
      eh40_q1: {
        id: "eh40_q1",
        kind: "question",
        step: "Step 1",
        title: "Coaming top or side t > 85 mm?",
        detail:
          "Evaluate both hatch coaming top plate and side coaming plate for threshold exceedance.",
        yes: "eh40_q2",
        no: "eh40_m1_direct",
        visual: {
          view: "A",
          mode: "coamingTopSide",
          tooltip:
            "View A: both top and side coaming plates are active for the EH40 entry check.",
          anchor: "coaming",
        },
      },
      eh40_m1_direct: {
        id: "eh40_m1_direct",
        kind: "terminal",
        step: "Measure 1",
        title: "100% NDE on all upper flange longitudinal members",
        detail:
          "Direct path for EH40 when thickness gate is not exceeded.",
        visual: {
          view: "B",
          mode: "transverseCyan",
          tooltip:
            "Measure 1: transverse butt joint receives primary UT emphasis; longitudinal joints are de-emphasized.",
          anchor: "seam",
        },
      },
      eh40_q2: {
        id: "eh40_q2",
        kind: "question",
        step: "Step 2",
        title: "Crack arrest design?",
        detail:
          "Choose whether dedicated crack arrest design provisions are incorporated.",
        yes: "eh40_m3_coaming",
        no: "eh40_m3_enhanced",
        visual: {
          view: "A",
          mode: "coamingFocus",
          tooltip:
            "Crack arrest decision point controls whether design-led or enhanced-NDE-led path is followed.",
          anchor: "coaming",
        },
      },
      eh40_m3_coaming: {
        id: "eh40_m3_coaming",
        kind: "action",
        step: "Measure 3",
        title: "Crack arrest steel for hatch coaming",
        detail:
          "Apply crack arrest steel strategy directly to hatch coaming region.",
        next: "eh40_q3",
        visual: {
          view: "A",
          mode: "coamingAmber",
          tooltip:
            "Measure 3 (design path): hatch coaming is upgraded with crack arrest steel.",
          anchor: "coaming",
        },
      },
      eh40_q3: {
        id: "eh40_q3",
        kind: "question",
        step: "Step 3",
        title: "Coaming side t > 80 mm?",
        detail:
          "Use side-plate thickness split to decide BCA steel level.",
        yes: "eh40_bca2",
        no: "eh40_bca1",
        visual: {
          view: "A",
          mode: "coamingSideYellow",
          tooltip:
            "Side plate thickness branching for BCA1 / BCA2 material selection.",
          anchor: "coaming",
        },
      },
      eh40_bca2: {
        id: "eh40_bca2",
        kind: "action",
        step: "Material",
        title: "BCA2 steel",
        detail:
          "Select higher crack arrest class for thicker side plate.",
        next: "eh40_block_shift",
        visual: {
          view: "A",
          mode: "coamingSideYellow",
          tooltip:
            "BCA2 selected: side coaming remains highlighted as the governing member.",
          anchor: "coaming",
        },
      },
      eh40_bca1: {
        id: "eh40_bca1",
        kind: "action",
        step: "Material",
        title: "BCA1 steel",
        detail:
          "Select crack arrest class for side plate in lower thickness band.",
        next: "eh40_block_shift",
        visual: {
          view: "A",
          mode: "coamingSideYellow",
          tooltip:
            "BCA1 selected: side coaming is still the controlling region in this branch.",
          anchor: "coaming",
        },
      },
      eh40_block_shift: {
        id: "eh40_block_shift",
        kind: "action",
        step: "Detailing",
        title: "Block shift / Crack arrest insert plates or holes",
        detail:
          "Introduce seam offset or insert concept to reduce straight crack run path.",
        next: "eh40_weld_yes",
        visual: {
          view: "B",
          mode: "staggeredSeam",
          tooltip:
            "3D seam transitions to staggered profile to represent block shift / insert concept.",
          anchor: "seam",
        },
      },
      eh40_weld_yes: {
        id: "eh40_weld_yes",
        kind: "action",
        step: "Process",
        title: "FCAW / GMAW / EGW welding process",
        detail:
          "Proceed with controlled welding process for crack arrest configuration.",
        next: "eh40_m45_yes",
        visual: {
          view: "B",
          mode: "weldingProcess",
          tooltip:
            "Welding process selection stage prior to deck-level crack arrest measures.",
          anchor: "process",
        },
      },
      eh40_m45_yes: {
        id: "eh40_m45_yes",
        kind: "action",
        step: "Measures 4 & 5",
        title: "Crack arrest steel for upper deck (BCA1)",
        detail:
          "Upgrade upper deck and sheer-strake route with crack arrest steel requirements.",
        next: "eh40_m1_final_yes",
        visual: {
          view: "A",
          mode: "upperDeckEmerald",
          tooltip:
            "Measures 4 & 5: upper deck and sheer strake receive BCA1-focused crack arrest treatment.",
          anchor: "deck",
        },
      },
      eh40_m1_final_yes: {
        id: "eh40_m1_final_yes",
        kind: "terminal",
        step: "Measure 1",
        title: "100% NDE on all upper flange longitudinal members",
        detail:
          "Final verification stage with butt-joint-centric NDE focus.",
        visual: {
          view: "B",
          mode: "transverseCyan",
          tooltip:
            "Final Measure 1 confirmation: prioritize UT at transverse block-to-block butt weld seam.",
          anchor: "seam",
        },
      },
      eh40_m3_enhanced: {
        id: "eh40_m3_enhanced",
        kind: "action",
        step: "Measure 3",
        title: "Enhanced NDE with stricter criteria",
        detail:
          "Apply enhanced acceptance criteria and intensified NDE approach.",
        next: "eh40_shipright",
        visual: {
          view: "B",
          mode: "enhancedNdeRed",
          tooltip:
            "CTOD test based on LR ShipRight: red pulsing points mark critical intersection checks.",
          anchor: "intersections",
        },
      },
      eh40_shipright: {
        id: "eh40_shipright",
        kind: "action",
        step: "Procedure",
        title: "ShipRight Procedure Use",
        detail:
          "Use enhanced NDE framework aligned with LR ShipRight guidance.",
        next: "eh40_weld_no",
        visual: {
          view: "B",
          mode: "shipRight",
          tooltip:
            "ShipRight procedure governs detailed enhanced NDE execution and reporting.",
          anchor: "process",
        },
      },
      eh40_weld_no: {
        id: "eh40_weld_no",
        kind: "action",
        step: "Process",
        title: "FCAW / GMAW welding process",
        detail:
          "Proceed with approved welding route after enhanced NDE strategy.",
        next: "eh40_m2",
        visual: {
          view: "B",
          mode: "weldingProcess",
          tooltip:
            "Welding process confirmation on enhanced NDE branch.",
          anchor: "process",
        },
      },
      eh40_m2: {
        id: "eh40_m2",
        kind: "action",
        step: "Measure 2",
        title: "Periodic in-service NDE",
        detail:
          "Introduce periodic in-service scanning at welded intersections.",
        next: "eh40_m45_no",
        visual: {
          view: "B",
          mode: "periodicRadar",
          tooltip:
            "Measure 2: periodic radar-like scan checks are concentrated near welded joints.",
          anchor: "intersections",
        },
      },
      eh40_m45_no: {
        id: "eh40_m45_no",
        kind: "action",
        step: "Measures 4 & 5",
        title: "Crack arrest steel for upper deck (BCA1)",
        detail:
          "Apply deck-level crack arrest reinforcement prior to final Measure 1 closure.",
        next: "eh40_m1_final_no",
        visual: {
          view: "A",
          mode: "upperDeckEmerald",
          tooltip:
            "Upper deck and sheer strake are highlighted for Measures 4 & 5 implementation.",
          anchor: "deck",
        },
      },
      eh40_m1_final_no: {
        id: "eh40_m1_final_no",
        kind: "terminal",
        step: "Measure 1",
        title: "100% NDE on all upper flange longitudinal members",
        detail:
          "Final closure step after enhanced-NDE-first route.",
        visual: {
          view: "B",
          mode: "transverseCyan",
          tooltip:
            "Final Measure 1 closure: transverse butt seam remains the principal UT target.",
          anchor: "seam",
        },
      },
    },
  },
  EH47: {
    root: "eh47_q1",
    nodes: {
      eh47_q1: {
        id: "eh47_q1",
        kind: "question",
        step: "Step 1",
        title: "Crack arrest design?",
        detail:
          "EH47 starts directly at crack arrest design decision and follows EH40 branch logic.",
        yes: "eh47_m3_coaming",
        no: "eh47_m3_enhanced",
        visual: {
          view: "A",
          mode: "coamingFocus",
          tooltip:
            "EH47 entry: decide crack arrest design strategy before welding/NDE route selection.",
          anchor: "coaming",
        },
      },
      eh47_m3_coaming: {
        id: "eh47_m3_coaming",
        kind: "action",
        step: "Measure 3",
        title: "Crack arrest steel for hatch coaming",
        detail:
          "Design-led branch with crack arrest steel application on hatch coaming.",
        next: "eh47_q3",
        visual: {
          view: "A",
          mode: "coamingAmber",
          tooltip:
            "Measure 3 (design path): hatch coaming upgraded with crack arrest steel.",
          anchor: "coaming",
        },
      },
      eh47_q3: {
        id: "eh47_q3",
        kind: "question",
        step: "Step 2",
        title: "Coaming side t > 80 mm?",
        detail:
          "Branch to BCA1/BCA2 based on side plate thickness.",
        yes: "eh47_bca2",
        no: "eh47_bca1",
        visual: {
          view: "A",
          mode: "coamingSideYellow",
          tooltip:
            "Side plate thickness branching remains identical to EH40 logic.",
          anchor: "coaming",
        },
      },
      eh47_bca2: {
        id: "eh47_bca2",
        kind: "action",
        step: "Material",
        title: "BCA2 steel",
        detail:
          "Use higher crack arrest class for thicker side plate.",
        next: "eh47_block_shift",
        visual: {
          view: "A",
          mode: "coamingSideYellow",
          tooltip:
            "BCA2 material assignment for thick side plate.",
          anchor: "coaming",
        },
      },
      eh47_bca1: {
        id: "eh47_bca1",
        kind: "action",
        step: "Material",
        title: "BCA1 steel",
        detail:
          "Use BCA1 class where thickness remains in lower split.",
        next: "eh47_block_shift",
        visual: {
          view: "A",
          mode: "coamingSideYellow",
          tooltip:
            "BCA1 material assignment for side plate in lower thickness split.",
          anchor: "coaming",
        },
      },
      eh47_block_shift: {
        id: "eh47_block_shift",
        kind: "action",
        step: "Detailing",
        title: "Block shift / Crack arrest insert plates or holes",
        detail:
          "Apply seam staggering and crack arrest insert concept.",
        next: "eh47_weld_yes",
        visual: {
          view: "B",
          mode: "staggeredSeam",
          tooltip:
            "3D joint seam is re-shaped to a staggered profile for block shift / insert detailing.",
          anchor: "seam",
        },
      },
      eh47_weld_yes: {
        id: "eh47_weld_yes",
        kind: "action",
        step: "Process",
        title: "FCAW / GMAW / EGW welding process",
        detail:
          "Proceed with approved welding process after detailing strategy.",
        next: "eh47_m45_yes",
        visual: {
          view: "B",
          mode: "weldingProcess",
          tooltip:
            "Welding process confirmation on design-led branch.",
          anchor: "process",
        },
      },
      eh47_m45_yes: {
        id: "eh47_m45_yes",
        kind: "action",
        step: "Measures 4 & 5",
        title: "Crack arrest steel for upper deck (BCA1)",
        detail:
          "Apply deck-level crack arrest reinforcement before final closure.",
        next: "eh47_m1_final_yes",
        visual: {
          view: "A",
          mode: "upperDeckEmerald",
          tooltip:
            "Upper deck + sheer strake crack arrest requirement is active (Measures 4 & 5).",
          anchor: "deck",
        },
      },
      eh47_m1_final_yes: {
        id: "eh47_m1_final_yes",
        kind: "terminal",
        step: "Measure 1",
        title: "100% NDE on all upper flange longitudinal members",
        detail:
          "Final closure on design-led EH47 route.",
        visual: {
          view: "B",
          mode: "transverseCyan",
          tooltip:
            "Final Measure 1: transverse butt seam remains primary UT target.",
          anchor: "seam",
        },
      },
      eh47_m3_enhanced: {
        id: "eh47_m3_enhanced",
        kind: "action",
        step: "Measure 3",
        title: "Enhanced NDE with stricter criteria",
        detail:
          "Apply enhanced NDE criteria with CTOD-centered checks.",
        next: "eh47_shipright",
        visual: {
          view: "B",
          mode: "enhancedNdeRed",
          tooltip:
            "CTOD test based on LR ShipRight: pulsing red checks at seam intersections.",
          anchor: "intersections",
        },
      },
      eh47_shipright: {
        id: "eh47_shipright",
        kind: "action",
        step: "Procedure",
        title: "ShipRight Procedure Use",
        detail:
          "Use ShipRight enhanced NDE framework for containership procedure control.",
        next: "eh47_weld_no",
        visual: {
          view: "B",
          mode: "shipRight",
          tooltip:
            "ShipRight procedure controls enhanced NDE rigor and reporting pathway.",
          anchor: "process",
        },
      },
      eh47_weld_no: {
        id: "eh47_weld_no",
        kind: "action",
        step: "Process",
        title: "FCAW / GMAW welding process",
        detail:
          "Proceed with welding process in enhanced-NDE-first route.",
        next: "eh47_m2",
        visual: {
          view: "B",
          mode: "weldingProcess",
          tooltip:
            "Process confirmation before periodic in-service NDE stage.",
          anchor: "process",
        },
      },
      eh47_m2: {
        id: "eh47_m2",
        kind: "action",
        step: "Measure 2",
        title: "Periodic in-service NDE",
        detail:
          "Introduce periodic in-service checks around critical joint intersections.",
        next: "eh47_m45_no",
        visual: {
          view: "B",
          mode: "periodicRadar",
          tooltip:
            "Periodic radar-like scans indicate in-service NDE requirement at joints.",
          anchor: "intersections",
        },
      },
      eh47_m45_no: {
        id: "eh47_m45_no",
        kind: "action",
        step: "Measures 4 & 5",
        title: "Crack arrest steel for upper deck (BCA1)",
        detail:
          "Deck and sheer route reinforcement before final Measure 1 step.",
        next: "eh47_m1_final_no",
        visual: {
          view: "A",
          mode: "upperDeckEmerald",
          tooltip:
            "Measures 4 & 5 in View A: upper deck and sheer strake are emphasized.",
          anchor: "deck",
        },
      },
      eh47_m1_final_no: {
        id: "eh47_m1_final_no",
        kind: "terminal",
        step: "Measure 1",
        title: "100% NDE on all upper flange longitudinal members",
        detail:
          "Final closure after enhanced-NDE-first EH47 route.",
        visual: {
          view: "B",
          mode: "transverseCyan",
          tooltip:
            "Final Measure 1 closure: UT focus returns to transverse butt joint seam.",
          anchor: "seam",
        },
      },
    },
  },
};

function choiceTone(choice) {
  if (choice === "Yes") return "bg-emerald-500/15 text-emerald-300 border-emerald-400/40";
  if (choice === "No") return "bg-rose-500/15 text-rose-300 border-rose-400/40";
  return "bg-cyan-500/15 text-cyan-300 border-cyan-400/40";
}

function getModeIcon(mode) {
  if (mode === "transverseCyan") return ShieldCheck;
  if (mode === "enhancedNdeRed") return AlertTriangle;
  if (mode === "periodicRadar") return Radar;
  if (mode === "staggeredSeam") return Workflow;
  return Layers3;
}

function isoPoint(x, y, z) {
  const originX = 330;
  const originY = 270;
  const px = originX + (x - y) * 1.2;
  const py = originY + (x + y) * 0.48 - z * 1.15;
  return { x: px, y: py };
}

function polyPoints(coords) {
  return coords
    .map(([x, y, z]) => {
      const p = isoPoint(x, y, z);
      return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
    })
    .join(" ");
}

function lineD(coords) {
  return coords
    .map(([x, y, z], i) => {
      const p = isoPoint(x, y, z);
      return `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
    })
    .join(" ");
}

function TwoDSectionView({ mode }) {
  const highlightCoaming = ["coamingFocus", "coamingTopSide", "coamingAmber"].includes(mode);
  const highlightCoamingSide = ["coamingSideYellow"].includes(mode);
  const highlightDeck = mode === "upperDeckEmerald";

  const topPlateFill = mode === "coamingAmber" ? "#f59e0b" : highlightCoaming ? "#22d3ee" : "#64748b";
  const sidePlateFill =
    mode === "coamingAmber"
      ? "#d97706"
      : highlightCoamingSide
        ? "#facc15"
        : highlightCoaming
          ? "#0ea5e9"
          : "#475569";
  const upperDeckFill = highlightDeck ? "#10b981" : "#334155";
  const sheerFill = highlightDeck ? "#34d399" : "#1e293b";
  const lineAccent = highlightDeck || highlightCoaming || highlightCoamingSide ? "#e2e8f0" : "#94a3b8";

  return (
    <svg viewBox="0 0 720 430" className="h-full w-full">
      <defs>
        <pattern id="cad-grid" width="18" height="18" patternUnits="userSpaceOnUse">
          <path d="M 18 0 L 0 0 0 18" fill="none" stroke="#0f172a" strokeWidth="1" />
        </pattern>
        <filter id="cyanGlow2D" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#22d3ee" floodOpacity="0.7" />
        </filter>
        <filter id="amberGlow2D" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#f59e0b" floodOpacity="0.7" />
        </filter>
        <filter id="emeraldGlow2D" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#10b981" floodOpacity="0.7" />
        </filter>
      </defs>

      <rect x="0" y="0" width="720" height="430" fill="#020617" />
      <rect x="32" y="24" width="656" height="380" fill="url(#cad-grid)" opacity="0.75" />

      <path d="M 70 244 L 610 244 L 610 272 L 70 272 Z" fill={upperDeckFill} stroke="#94a3b8" strokeWidth="2.2" />
      <path d="M 70 272 L 250 272 L 250 300 L 70 300 Z" fill={sheerFill} stroke="#94a3b8" strokeWidth="2.2" />

      <path d="M 388 90 L 418 90 L 418 244 L 388 244 Z" fill={sidePlateFill} stroke="#cbd5e1" strokeWidth="2.3" />
      <path d="M 388 64 L 530 64 L 530 90 L 388 90 Z" fill={topPlateFill} stroke="#cbd5e1" strokeWidth="2.3" />

      {Array.from({ length: 6 }).map((_, i) => {
        const x = 160 + i * 68;
        return (
          <g key={`deck-long-${x}`}>
            <line x1={x} y1={244} x2={x} y2={262} stroke="#93a7c0" strokeWidth="3.2" />
            <line x1={x - 12} y1={262} x2={x + 12} y2={262} stroke="#93a7c0" strokeWidth="2.4" />
          </g>
        );
      })}

      {Array.from({ length: 4 }).map((_, i) => {
        const y = 124 + i * 28;
        return (
          <g key={`side-long-${y}`}>
            <line x1="388" y1={y} x2="352" y2={y} stroke="#93a7c0" strokeWidth="3" />
            <line x1="352" y1={y - 10} x2="352" y2={y + 10} stroke="#93a7c0" strokeWidth="2.2" />
          </g>
        );
      })}

      {(highlightCoaming || highlightCoamingSide) && (
        <>
          <motion.path
            d="M 386 62 L 532 62 L 532 92 L 386 92 Z"
            fill="none"
            stroke={mode === "coamingAmber" ? "#fbbf24" : mode === "coamingSideYellow" ? "#fde047" : "#67e8f9"}
            strokeWidth="3"
            filter={mode === "coamingAmber" ? "url(#amberGlow2D)" : "url(#cyanGlow2D)"}
            animate={{ opacity: [0.45, 1, 0.45] }}
            transition={{ duration: 1.9, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.path
            d="M 386 88 L 420 88 L 420 246 L 386 246 Z"
            fill="none"
            stroke={mode === "coamingAmber" ? "#fbbf24" : mode === "coamingSideYellow" ? "#fde047" : "#67e8f9"}
            strokeWidth="3"
            filter={mode === "coamingAmber" ? "url(#amberGlow2D)" : "url(#cyanGlow2D)"}
            animate={{ opacity: [0.45, 1, 0.45] }}
            transition={{ duration: 1.9, repeat: Infinity, ease: "easeInOut", delay: 0.15 }}
          />
        </>
      )}

      {highlightDeck && (
        <>
          <motion.path
            d="M 68 242 L 612 242 L 612 274 L 68 274 Z"
            fill="none"
            stroke="#6ee7b7"
            strokeWidth="3"
            filter="url(#emeraldGlow2D)"
            animate={{ opacity: [0.45, 1, 0.45] }}
            transition={{ duration: 2.1, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.path
            d="M 68 270 L 252 270 L 252 302 L 68 302 Z"
            fill="none"
            stroke="#34d399"
            strokeWidth="3"
            filter="url(#emeraldGlow2D)"
            animate={{ opacity: [0.45, 1, 0.45] }}
            transition={{ duration: 2.1, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
          />
        </>
      )}

      <line x1="530" y1="78" x2="646" y2="46" stroke={lineAccent} strokeWidth="1.8" />
      <text x="652" y="44" fill={lineAccent} fontSize="12" fontWeight="600">
        Hatch coaming top plate
      </text>

      <line x1="418" y1="138" x2="642" y2="122" stroke={lineAccent} strokeWidth="1.8" />
      <text x="648" y="124" fill={lineAccent} fontSize="12" fontWeight="600">
        Hatch side coaming plate
      </text>

      <line x1="611" y1="250" x2="638" y2="228" stroke={lineAccent} strokeWidth="1.8" />
      <text x="644" y="230" fill={lineAccent} fontSize="12" fontWeight="600">
        Upper deck
      </text>

      <line x1="248" y1="286" x2="340" y2="336" stroke={lineAccent} strokeWidth="1.8" />
      <text x="348" y="340" fill={lineAccent} fontSize="12" fontWeight="600">
        Sheer strake
      </text>

      <line x1="168" y1="262" x2="88" y2="196" stroke={lineAccent} strokeWidth="1.8" />
      <text x="42" y="194" fill={lineAccent} fontSize="12" fontWeight="600">
        Longitudinals
      </text>
    </svg>
  );
}

function RadarPing({ cx, cy, color = "#22d3ee" }) {
  return (
    <g>
      <motion.circle
        cx={cx}
        cy={cy}
        r="6"
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        animate={{ r: [6, 18], opacity: [0.9, 0] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
      />
      <motion.circle
        cx={cx}
        cy={cy}
        r="6"
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        animate={{ r: [6, 20], opacity: [0.75, 0] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut", delay: 0.45 }}
      />
      <circle cx={cx} cy={cy} r="3.3" fill={color} />
      <line x1={cx - 8} y1={cy} x2={cx + 8} y2={cy} stroke={color} strokeWidth="1.4" />
      <line x1={cx} y1={cy - 8} x2={cx} y2={cy + 8} stroke={color} strokeWidth="1.4" />
    </g>
  );
}

function ThreeDIsometricView({ mode }) {
  const showTransverseCyan = mode === "transverseCyan";
  const showStaggered = mode === "staggeredSeam";
  const showEnhancedRed = mode === "enhancedNdeRed";
  const showPeriodicRadar = mode === "periodicRadar";
  const showShipRight = mode === "shipRight";
  const showWeldingProcess = mode === "weldingProcess";

  const seamColor = showEnhancedRed
    ? "#f43f5e"
    : showShipRight
      ? "#a78bfa"
      : showStaggered
        ? "#fbbf24"
        : "#22d3ee";
  const longitudinalOpacity = showTransverseCyan ? 0.22 : 0.72;
  const seamStrokeWidth = showTransverseCyan ? 4.2 : showEnhancedRed ? 3.8 : 3.2;

  const seamTopStraight = lineD([
    [125, 0, 70],
    [125, 85, 70],
  ]);
  const seamTopStaggered = lineD([
    [125, 0, 70],
    [118, 18, 70],
    [132, 37, 70],
    [118, 60, 70],
    [125, 85, 70],
  ]);
  const seamFront = lineD([
    [125, 0, 0],
    [125, 0, 70],
  ]);
  const seamBack = lineD([
    [125, 85, 0],
    [125, 85, 70],
  ]);

  const topIntersections = [10, 23, 36, 49, 62, 75].map((y) => isoPoint(125, y, 70));
  const sideIntersections = [12, 24, 36, 48, 60].map((z) => isoPoint(125, 0, z));

  return (
    <svg viewBox="0 0 760 460" className="h-full w-full">
      <defs>
        <pattern id="cad-grid-3d" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#0f172a" strokeWidth="1" />
        </pattern>
        <filter id="cyanGlow3D" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="0" stdDeviation="4.2" floodColor="#22d3ee" floodOpacity="0.85" />
        </filter>
        <filter id="redGlow3D" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#f43f5e" floodOpacity="0.85" />
        </filter>
      </defs>

      <rect x="0" y="0" width="760" height="460" fill="#020617" />
      <rect x="28" y="24" width="704" height="412" fill="url(#cad-grid-3d)" opacity="0.7" />

      <polygon
        points={polyPoints([
          [0, 0, 0],
          [250, 0, 0],
          [250, 85, 0],
          [0, 85, 0],
        ])}
        fill="#050b19"
        opacity="0.75"
      />

      <polygon
        points={polyPoints([
          [0, 85, 0],
          [0, 0, 0],
          [0, 0, 70],
          [0, 85, 70],
        ])}
        fill="#182235"
        stroke="#475569"
        strokeWidth="1.6"
      />

      <polygon
        points={polyPoints([
          [0, 0, 0],
          [125, 0, 0],
          [125, 0, 70],
          [0, 0, 70],
        ])}
        fill="#1e293b"
        stroke="#64748b"
        strokeWidth="1.6"
      />
      <polygon
        points={polyPoints([
          [0, 0, 70],
          [125, 0, 70],
          [125, 85, 70],
          [0, 85, 70],
        ])}
        fill="#334155"
        stroke="#94a3b8"
        strokeWidth="1.7"
      />

      <polygon
        points={polyPoints([
          [125, 0, 0],
          [250, 0, 0],
          [250, 0, 70],
          [125, 0, 70],
        ])}
        fill="#253247"
        stroke="#64748b"
        strokeWidth="1.6"
      />
      <polygon
        points={polyPoints([
          [125, 0, 70],
          [250, 0, 70],
          [250, 85, 70],
          [125, 85, 70],
        ])}
        fill="#3b4b62"
        stroke="#94a3b8"
        strokeWidth="1.7"
      />
      <polygon
        points={polyPoints([
          [250, 0, 0],
          [250, 85, 0],
          [250, 85, 70],
          [250, 0, 70],
        ])}
        fill="#1f2a3d"
        stroke="#64748b"
        strokeWidth="1.6"
      />

      {Array.from({ length: 6 }).map((_, i) => {
        const y = 10 + i * 13;
        return (
          <path
            key={`long-top-${y}`}
            className="longitudinal-joints"
            d={lineD([
              [8, y, 70],
              [242, y, 70],
            ])}
            fill="none"
            stroke="#64748b"
            strokeWidth="2.1"
            opacity={longitudinalOpacity}
          />
        );
      })}

      {Array.from({ length: 5 }).map((_, i) => {
        const z = 12 + i * 12;
        return (
          <path
            key={`long-side-${z}`}
            className="longitudinal-joints"
            d={lineD([
              [8, 0, z],
              [242, 0, z],
            ])}
            fill="none"
            stroke="#64748b"
            strokeWidth="2.1"
            opacity={longitudinalOpacity}
          />
        );
      })}

      <motion.path
        className="transverse-butt-joints"
        d={showStaggered ? seamTopStaggered : seamTopStraight}
        fill="none"
        stroke={seamColor}
        strokeWidth={seamStrokeWidth}
        filter={
          showEnhancedRed ? "url(#redGlow3D)" : showTransverseCyan || showStaggered ? "url(#cyanGlow3D)" : undefined
        }
        animate={
          showTransverseCyan
            ? { strokeWidth: [4.2, 7.2, 4.2], strokeOpacity: [0.8, 1, 0.8] }
            : showEnhancedRed
              ? { strokeWidth: [3.8, 5.5, 3.8], strokeOpacity: [0.6, 1, 0.6] }
              : { strokeOpacity: [0.75, 0.95, 0.75] }
        }
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.path
        className="transverse-butt-joints"
        d={seamFront}
        fill="none"
        stroke={seamColor}
        strokeWidth={seamStrokeWidth - 0.8}
        filter={showEnhancedRed ? "url(#redGlow3D)" : showTransverseCyan ? "url(#cyanGlow3D)" : undefined}
        animate={
          showTransverseCyan || showEnhancedRed
            ? { strokeOpacity: [0.55, 1, 0.55] }
            : { strokeOpacity: [0.7, 0.9, 0.7] }
        }
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut", delay: 0.1 }}
      />

      <path
        className="transverse-butt-joints"
        d={seamBack}
        fill="none"
        stroke={seamColor}
        strokeWidth={seamStrokeWidth - 1}
        opacity="0.7"
      />

      {showStaggered && (
        <>
          <polygon
            points={polyPoints([
              [121, 25, 70],
              [129, 25, 70],
              [129, 45, 70],
              [121, 45, 70],
            ])}
            fill="#0f172a"
            stroke="#facc15"
            strokeWidth="1.6"
            opacity="0.95"
          />
          <polygon
            points={polyPoints([
              [121, 52, 70],
              [129, 52, 70],
              [129, 72, 70],
              [121, 72, 70],
            ])}
            fill="#0f172a"
            stroke="#facc15"
            strokeWidth="1.6"
            opacity="0.95"
          />
          <circle cx={isoPoint(125, 34, 70).x} cy={isoPoint(125, 34, 70).y} r="2.7" fill="#fef08a" />
          <circle cx={isoPoint(125, 62, 70).x} cy={isoPoint(125, 62, 70).y} r="2.7" fill="#fef08a" />
        </>
      )}

      {showEnhancedRed &&
        topIntersections.map((p, i) => (
          <motion.circle
            key={`red-top-${i}`}
            cx={p.x}
            cy={p.y}
            r="3.6"
            fill="#fb7185"
            stroke="#fecdd3"
            strokeWidth="1.2"
            animate={{ r: [3, 7, 3], opacity: [0.35, 1, 0.35] }}
            transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.12 }}
          />
        ))}

      {showEnhancedRed &&
        sideIntersections.map((p, i) => (
          <motion.circle
            key={`red-side-${i}`}
            cx={p.x}
            cy={p.y}
            r="3.4"
            fill="#fb7185"
            stroke="#fecdd3"
            strokeWidth="1.2"
            animate={{ r: [2.8, 6.5, 2.8], opacity: [0.35, 1, 0.35] }}
            transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.12 + 0.4 }}
          />
        ))}

      {showPeriodicRadar && (
        <>
          <RadarPing cx={isoPoint(125, 20, 70).x} cy={isoPoint(125, 20, 70).y} color="#22d3ee" />
          <RadarPing cx={isoPoint(125, 57, 70).x} cy={isoPoint(125, 57, 70).y} color="#06b6d4" />
          <RadarPing cx={isoPoint(125, 0, 32).x} cy={isoPoint(125, 0, 32).y} color="#67e8f9" />
        </>
      )}

      {showShipRight && (
        <g>
          <path
            d={lineD([
              [102, 6, 77],
              [150, 6, 77],
            ])}
            fill="none"
            stroke="#a78bfa"
            strokeWidth="2.2"
          />
          <text x={isoPoint(152, 6, 77).x + 8} y={isoPoint(152, 6, 77).y + 4} fill="#c4b5fd" fontSize="12">
            ShipRight Procedure
          </text>
        </g>
      )}

      {showWeldingProcess && (
        <g>
          <path
            d={lineD([
              [136, 0, 73],
              [158, 0, 82],
            ])}
            fill="none"
            stroke="#f59e0b"
            strokeWidth="2.2"
          />
          <text x={isoPoint(160, 0, 82).x + 8} y={isoPoint(160, 0, 82).y + 4} fill="#fcd34d" fontSize="12">
            FCAW / GMAW / EGW
          </text>
        </g>
      )}

      <text x={isoPoint(40, 0, 84).x} y={isoPoint(40, 0, 84).y} fill="#bfdbfe" fontSize="13" fontWeight="600">
        Block A
      </text>
      <text x={isoPoint(180, 0, 84).x} y={isoPoint(180, 0, 84).y} fill="#bfdbfe" fontSize="13" fontWeight="600">
        Block B
      </text>

      <line
        x1={isoPoint(48, 8, 75).x}
        y1={isoPoint(48, 8, 75).y}
        x2={isoPoint(10, 55, 75).x}
        y2={isoPoint(10, 55, 75).y - 18}
        stroke="#94a3b8"
        strokeWidth="1.4"
      />
      <text x={isoPoint(10, 55, 75).x - 6} y={isoPoint(10, 55, 75).y - 24} fill="#94a3b8" fontSize="11">
        Longitudinal-Joints (Q.1 / Q.2 concept)
      </text>

      <line
        x1={isoPoint(125, 30, 70).x}
        y1={isoPoint(125, 30, 70).y}
        x2={isoPoint(185, 78, 75).x}
        y2={isoPoint(185, 78, 75).y - 24}
        stroke="#67e8f9"
        strokeWidth="1.4"
      />
      <text x={isoPoint(185, 78, 75).x + 2} y={isoPoint(185, 78, 75).y - 30} fill="#67e8f9" fontSize="11">
        Transverse-Butt-Joints (Q.3 / Q.4 concept)
      </text>
    </svg>
  );
}

function viewAnchorPosition(view, anchor) {
  if (view === "A") {
    if (anchor === "coaming") return "left-[50%] top-[16%]";
    if (anchor === "deck") return "left-[20%] top-[56%]";
    return "left-[34%] top-[28%]";
  }
  if (anchor === "seam") return "left-[56%] top-[26%]";
  if (anchor === "intersections") return "left-[57%] top-[20%]";
  if (anchor === "process") return "left-[66%] top-[14%]";
  return "left-[52%] top-[26%]";
}

function nodeTone(nodeKind) {
  if (nodeKind === "question") {
    return "border-cyan-400/45 bg-cyan-400/10";
  }
  if (nodeKind === "terminal") {
    return "border-emerald-400/45 bg-emerald-400/10";
  }
  return "border-amber-400/45 bg-amber-400/10";
}

export default function LloydsRulesVibeCodingApp() {
  const [grade, setGrade] = useState("EH36");
  const [path, setPath] = useState([FLOWS.EH36.root]);
  const [transitions, setTransitions] = useState([]);

  const flow = FLOWS[grade];
  const nodes = flow.nodes;
  const activeNodeId = path[path.length - 1];
  const activeNode = nodes[activeNodeId];
  const visual = activeNode.visual;
  const ActiveModeIcon = getModeIcon(visual.mode);

  const breadcrumb = useMemo(() => {
    return path.map((nodeId, index) => {
      if (index === path.length - 1) return null;
      return transitions[index] ?? null;
    });
  }, [path, transitions]);

  const onGradeChange = (nextGrade) => {
    setGrade(nextGrade);
    setPath([FLOWS[nextGrade].root]);
    setTransitions([]);
  };

  const goTo = (nextId, choiceLabel) => {
    if (!nextId || !nodes[nextId]) return;
    const from = path[path.length - 1];
    setPath((prev) => [...prev, nextId]);
    setTransitions((prev) => [...prev, { from, to: nextId, choice: choiceLabel }]);
  };

  const handleUndo = () => {
    if (path.length <= 1) return;
    setPath((prev) => prev.slice(0, -1));
    setTransitions((prev) => prev.slice(0, -1));
  };

  const handleReset = () => {
    setPath([flow.root]);
    setTransitions([]);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 rounded-2xl border border-slate-800 bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 p-5 shadow-2xl shadow-black/40">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/35 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-cyan-300">
                <Sparkles size={14} />
                Lloyd's Register - Vibe Coding Visualizer
              </div>
              <h1 className="text-2xl font-bold text-slate-100 md:text-3xl">
                Containership Hatch Coaming Thick Plate Crack Propagation Prevention
              </h1>
              <p className="max-w-3xl text-sm text-slate-400 md:text-base">
                Interactive decision wizard + synchronized engineering visualizer. View A reproduces a clean 2D section
                concept. View B renders a newly generated CAD-style isometric block-joint model using pure inline SVG
                geometry.
              </p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-sm text-slate-300">
              <div className="mb-1 flex items-center gap-2 text-slate-200">
                <Ship size={16} className="text-cyan-300" />
                Active Grade: <span className={`font-semibold ${GRADE_META[grade].text}`}>{grade}</span>
              </div>
              <div className="text-xs text-slate-400">Part 4 / Chapter 8 / Section 2.3 (thick plate requirements)</div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(320px,430px),1fr]">
          <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-xl shadow-black/35">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-100">
                  <Workflow size={18} className="text-cyan-300" />
                  Interactive Flowchart Wizard
                </h2>
                <p className="text-xs text-slate-400">Nodes reveal step-by-step based on Yes / No decisions.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleUndo}
                  disabled={path.length <= 1}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1.5 text-xs text-slate-300 transition hover:border-slate-500 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <Undo2 size={14} />
                  Undo
                </button>
                <button
                  onClick={handleReset}
                  className="rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1.5 text-xs text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
                >
                  Restart
                </button>
              </div>
            </div>

            <div className="mb-4 grid grid-cols-3 gap-2">
              {Object.keys(FLOWS).map((g) => {
                const isActive = g === grade;
                const m = GRADE_META[g];
                return (
                  <button
                    key={g}
                    onClick={() => onGradeChange(g)}
                    className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                      isActive
                        ? `bg-gradient-to-br ${m.accent} ${m.text} ${m.border} ring-1 ${m.ring}`
                        : "border-slate-700 bg-slate-800/70 text-slate-300 hover:border-slate-500 hover:text-slate-100"
                    }`}
                  >
                    {g}
                  </button>
                );
              })}
            </div>

            <div className="mb-3 rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-xs text-slate-400">
              Revealed nodes: <span className="font-semibold text-slate-200">{path.length}</span>
            </div>

            <div className="max-h-[68vh] space-y-2 overflow-y-auto pr-1">
              <AnimatePresence initial={false}>
                {path.map((nodeId, index) => {
                  const node = nodes[nodeId];
                  const isActive = index === path.length - 1;
                  const edge = breadcrumb[index];
                  const isQuestion = node.kind === "question";
                  const canContinue = node.kind !== "question" && !!node.next;
                  const isTerminal = node.kind === "terminal";

                  return (
                    <motion.div
                      key={nodeId}
                      layout
                      initial={{ opacity: 0, y: 18, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -10, scale: 0.98 }}
                      transition={{ duration: 0.28, ease: "easeOut" }}
                      className="relative"
                    >
                      <div className={`rounded-xl border p-3 ${nodeTone(node.kind)} ${isActive ? "ring-1 ring-cyan-300/45" : ""}`}>
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">{node.step}</div>
                          <div className="text-[11px] text-slate-400">Node {index + 1}</div>
                        </div>
                        <h3 className="text-sm font-semibold text-slate-100">{node.title}</h3>
                        <p className="mt-1 text-xs leading-relaxed text-slate-300">{node.detail}</p>

                        {isActive && (
                          <div className="mt-3">
                            {isQuestion && (
                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  onClick={() => goTo(node.yes, "Yes")}
                                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/25"
                                >
                                  <CheckCircle2 size={14} />
                                  Yes
                                </button>
                                <button
                                  onClick={() => goTo(node.no, "No")}
                                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/25"
                                >
                                  <XCircle size={14} />
                                  No
                                </button>
                              </div>
                            )}

                            {canContinue && (
                              <button
                                onClick={() => goTo(node.next, "Next")}
                                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-3 py-2 text-xs font-semibold text-cyan-300 transition hover:bg-cyan-500/25"
                              >
                                Continue
                                <ArrowRight size={14} />
                              </button>
                            )}

                            {isTerminal && (
                              <button
                                onClick={handleReset}
                                className="inline-flex w-full items-center justify-center rounded-lg border border-slate-600 bg-slate-800/70 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-400 hover:text-slate-100"
                              >
                                Restart {grade} Branch
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {index < path.length - 1 && (
                        <div className="mx-auto my-1.5 flex w-full items-center justify-center">
                          <div className={`rounded-full border px-2 py-0.5 text-[11px] ${choiceTone(edge?.choice || "Next")}`}>
                            {edge?.choice || "Next"}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </section>

          <section className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-xl shadow-black/35">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-100">
                  <Layers3 size={18} className="text-cyan-300" />
                  Dynamic Structural Visualizer
                </h2>
                <p className="text-xs text-slate-400">
                  Auto-switches between View A (2D section) and View B (3D isometric block joint).
                </p>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs text-slate-300">
                <div className="mb-1 inline-flex items-center gap-2 font-semibold text-slate-100">
                  <ActiveModeIcon size={14} className="text-cyan-300" />
                  Active Node
                </div>
                <div>{activeNode.step}</div>
              </div>
            </div>

            <div className="relative rounded-xl border border-slate-800 bg-slate-950/80 p-2">
              <AnimatePresence mode="wait">
                {visual.view === "A" ? (
                  <motion.div
                    key="view-a"
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.28 }}
                    className="aspect-[16/10] w-full"
                  >
                    <TwoDSectionView mode={visual.mode} />
                  </motion.div>
                ) : (
                  <motion.div
                    key="view-b"
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.28 }}
                    className="aspect-[16/10] w-full"
                  >
                    <ThreeDIsometricView mode={visual.mode} />
                  </motion.div>
                )}
              </AnimatePresence>

              <motion.div
                key={`${visual.view}-${visual.mode}-${activeNode.id}`}
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.22 }}
                className={`pointer-events-none absolute ${viewAnchorPosition(visual.view, visual.anchor)}`}
              >
                <div className="max-w-xs rounded-lg border border-cyan-300/40 bg-slate-900/90 px-3 py-2 text-xs text-cyan-100 shadow-lg shadow-cyan-900/30 backdrop-blur">
                  {visual.tooltip}
                </div>
              </motion.div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                <h3 className="mb-2 text-sm font-semibold text-slate-100">View Legend</h3>
                {visual.view === "A" ? (
                  <ul className="space-y-1.5 text-xs text-slate-300">
                    <li className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-cyan-300" />
                      Hatch coaming top plate / side coaming plate
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
                      Upper deck + sheer strake
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                      Longitudinal members
                    </li>
                  </ul>
                ) : (
                  <ul className="space-y-1.5 text-xs text-slate-300">
                    <li className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-slate-400" />
                      <span className="font-medium">Longitudinal-Joints</span> (Q.1 / Q.2 concept)
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-cyan-300" />
                      <span className="font-medium">Transverse-Butt-Joints</span> (Q.3 / Q.4 concept)
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-rose-300" />
                      Enhanced NDE / CTOD intersection checks
                    </li>
                  </ul>
                )}
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-xs text-slate-300">
                <h3 className="mb-2 text-sm font-semibold text-slate-100">Current Focus</h3>
                <p className="leading-relaxed">
                  <span className="font-semibold text-slate-100">{activeNode.title}.</span> {activeNode.detail}
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

