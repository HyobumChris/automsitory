import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { Anchor, Ship, Eye, Layers, Box } from 'lucide-react';
import { GRADE_INFO, buildGradeFlow } from './data/flowNodes';
import { useFlowEngine, validateFlow } from './hooks/useFlowEngine';
import CrossSectionView from './components/CrossSectionView';
import IsometricView from './components/IsometricView';
import FlowchartPanel from './components/FlowchartPanel';

const GRADES = ['EH36', 'EH40', 'EH47'];

export default function App() {
  const [selectedGrade, setSelectedGrade] = useState('EH40');

  const flow = useMemo(() => buildGradeFlow(selectedGrade), [selectedGrade]);

  if (import.meta.env.DEV) {
    validateFlow(flow, selectedGrade);
  }

  const {
    activeNodeId, activeNode, transitions,
    canUndo, reset, undo, goYes, goNo, goNext,
  } = useFlowEngine(flow);

  const handleGradeChange = useCallback((grade) => {
    setSelectedGrade(grade);
  }, []);

  const viewConfig = useMemo(() => {
    if (!activeNode) return { view: 'A', highlights: [], highlightColor: '#60a5fa', tooltip: '' };
    return {
      view: activeNode.view || 'A',
      highlights: activeNode.highlights || [],
      highlightColor: activeNode.highlightColor || '#60a5fa',
      tooltip: activeNode.tooltip || '',
    };
  }, [activeNode]);

  return (
    <div className="h-screen w-screen flex flex-col bg-marine-900 text-slate-200 overflow-hidden">
      {/* ═══ HEADER ═══ */}
      <header className="shrink-0 border-b border-slate-700/40 bg-gradient-to-r from-marine-800/90 via-marine-800/70 to-marine-800/90 backdrop-blur-md">
        <div className="flex items-center justify-between px-4 py-2 lg:px-5">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600/20 to-cyan-600/10 border border-blue-500/25 shadow-lg shadow-blue-900/20">
              <Anchor size={17} className="text-blue-400" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-[13px] font-extrabold text-slate-100 tracking-tight leading-tight">
                Lloyd&apos;s Register Rules
              </h1>
              <p className="text-[9px] text-slate-500 leading-tight tracking-wide">
                Hatch Coaming Crack Propagation Prevention — Ch.8 §8.2
              </p>
            </div>
          </div>

          {/* Grade selector */}
          <LayoutGroup>
            <div className="flex items-center gap-0.5 bg-slate-800/50 rounded-xl p-1 border border-slate-700/40">
              {GRADES.map((grade) => {
                const active = grade === selectedGrade;
                const info = GRADE_INFO[grade];
                return (
                  <motion.button
                    key={grade}
                    onClick={() => handleGradeChange(grade)}
                    className={`relative px-4 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                      active ? 'text-white' : 'text-slate-400 hover:text-slate-200'
                    }`}
                    whileHover={{ scale: active ? 1 : 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    {active && (
                      <motion.div
                        layoutId="gradeSelector"
                        className="absolute inset-0 rounded-lg"
                        style={{
                          background: `linear-gradient(135deg, ${info.color}22, ${info.color}11)`,
                          border: `1px solid ${info.color}44`,
                        }}
                        transition={{ type: 'spring', damping: 28, stiffness: 350 }}
                      />
                    )}
                    <span className="relative z-10">{grade}</span>
                  </motion.button>
                );
              })}
            </div>
          </LayoutGroup>

          {/* Grade description */}
          <div className="hidden lg:flex items-center gap-2 text-[11px] text-slate-500">
            <Ship size={14} className="text-slate-600" />
            <span>{GRADE_INFO[selectedGrade]?.desc}</span>
          </div>
        </div>
      </header>

      {/* ═══ MAIN CONTENT ═══ */}
      <div className="flex-1 flex overflow-hidden">
        {/* ─── LEFT: Flowchart Wizard ─── */}
        <div className="w-[360px] lg:w-[400px] shrink-0 border-r border-slate-700/30 bg-marine-800/30 flex flex-col">
          <FlowchartPanel
            activeNodeId={activeNodeId}
            activeNode={activeNode}
            transitions={transitions}
            canUndo={canUndo}
            onGoYes={goYes}
            onGoNo={goNo}
            onGoNext={goNext}
            onReset={reset}
            onUndo={undo}
          />
        </div>

        {/* ─── RIGHT: Dynamic Visualizer ─── */}
        <div className="flex-1 flex flex-col overflow-hidden bg-gradient-to-b from-marine-900 to-marine-800/30">
          {/* View mode indicator */}
          <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-slate-700/20 bg-marine-800/20">
            <div className="flex items-center gap-2.5">
              <AnimatePresence mode="wait">
                {viewConfig.view === 'A' ? (
                  <motion.div key="icon-a" initial={{ opacity: 0, scale: 0.5, rotate: -45 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} exit={{ opacity: 0, scale: 0.5, rotate: 45 }} className="flex items-center gap-2">
                    <Eye size={13} className="text-purple-400" />
                    <span className="text-[11px] font-semibold text-slate-400">View A — 2D Cross-Section (Fig 8.2.1)</span>
                  </motion.div>
                ) : (
                  <motion.div key="icon-b" initial={{ opacity: 0, scale: 0.5, rotate: 45 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} exit={{ opacity: 0, scale: 0.5, rotate: -45 }} className="flex items-center gap-2">
                    <Box size={13} className="text-cyan-400" />
                    <span className="text-[11px] font-semibold text-slate-400">View B — 3D Isometric Block Joint</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Active highlights indicator */}
            {viewConfig.highlights.length > 0 && (
              <motion.div
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-semibold tracking-wide"
                style={{
                  backgroundColor: viewConfig.highlightColor + '12',
                  color: viewConfig.highlightColor,
                  border: `1px solid ${viewConfig.highlightColor}30`,
                }}
              >
                <motion.div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: viewConfig.highlightColor }}
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
                ACTIVE
              </motion.div>
            )}
          </div>

          {/* SVG View Area */}
          <div className="flex-1 relative overflow-hidden flex items-center justify-center p-3 lg:p-5">
            <AnimatePresence mode="wait">
              {viewConfig.view === 'A' ? (
                <motion.div
                  key={`view-a-${activeNodeId}`}
                  initial={{ opacity: 0, scale: 0.94, x: -30 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.94, x: 30 }}
                  transition={{ duration: 0.45, ease: [0.25, 0.8, 0.25, 1] }}
                  className="w-full h-full max-w-[820px] max-h-[580px]"
                >
                  <CrossSectionView
                    highlights={viewConfig.highlights}
                    highlightColor={viewConfig.highlightColor}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key={`view-b-${activeNodeId}`}
                  initial={{ opacity: 0, scale: 0.94, x: 30 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.94, x: -30 }}
                  transition={{ duration: 0.45, ease: [0.25, 0.8, 0.25, 1] }}
                  className="w-full h-full max-w-[820px] max-h-[580px]"
                >
                  <IsometricView
                    highlights={viewConfig.highlights}
                    highlightColor={viewConfig.highlightColor}
                    tooltip={viewConfig.tooltip}
                    showBlockShift={viewConfig.highlights.includes('block-shift')}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Floating context bar */}
            {activeNode && (
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeNodeId}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.35, delay: 0.15 }}
                  className="absolute bottom-3 left-3 right-3 lg:bottom-5 lg:left-5 lg:right-5"
                >
                  <div className="bg-marine-800/85 backdrop-blur-md border border-slate-700/40 rounded-xl px-4 py-2.5 flex items-center gap-3 shadow-xl shadow-black/20">
                    <motion.div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: viewConfig.highlightColor }}
                      animate={{ opacity: [0.4, 1, 0.4] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    />
                    <p className="text-[11px] text-slate-400 line-clamp-1 flex-1 leading-snug">
                      <span className="text-slate-300 font-semibold">{activeNode.title}</span>
                      <span className="mx-1.5 text-slate-600">|</span>
                      {activeNode.text}
                    </p>
                    <span className="text-[9px] text-slate-600 shrink-0 font-semibold tracking-wider">
                      {selectedGrade}
                    </span>
                  </div>
                </motion.div>
              </AnimatePresence>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
