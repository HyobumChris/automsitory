import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Anchor, Ship, Eye, Layers } from 'lucide-react';
import { FLOW_NODES, GRADE_STARTS, GRADE_INFO } from './data/flowNodes';
import CrossSectionView from './components/CrossSectionView';
import IsometricView from './components/IsometricView';
import FlowchartPanel from './components/FlowchartPanel';

const GRADES = ['EH36', 'EH40', 'EH47'];

export default function App() {
  const [selectedGrade, setSelectedGrade] = useState('EH40');
  const [currentNodeId, setCurrentNodeId] = useState(GRADE_STARTS['EH40']);
  const [history, setHistory] = useState([]);

  const currentNode = useMemo(() => FLOW_NODES[currentNodeId], [currentNodeId]);

  const handleGradeChange = useCallback((grade) => {
    setSelectedGrade(grade);
    setCurrentNodeId(GRADE_STARTS[grade]);
    setHistory([]);
  }, []);

  const handleChoice = useCallback((choice) => {
    const node = FLOW_NODES[currentNodeId];
    if (!node) return;

    let nextId = null;
    let answer = choice;

    if (node.type === 'question') {
      nextId = choice === 'yes' ? node.yes : node.no;
    } else if (node.type === 'info' && node.next) {
      nextId = node.next;
      answer = 'next';
    }

    if (nextId && FLOW_NODES[nextId]) {
      setHistory(prev => [...prev, { nodeId: currentNodeId, answer }]);
      setCurrentNodeId(nextId);
    }
  }, [currentNodeId]);

  const handleReset = useCallback(() => {
    setCurrentNodeId(GRADE_STARTS[selectedGrade]);
    setHistory([]);
  }, [selectedGrade]);

  const viewConfig = useMemo(() => {
    if (!currentNode) return { view: 'A', highlights: [], highlightColor: '#60a5fa', tooltip: '' };
    return {
      view: currentNode.view || 'A',
      highlights: currentNode.highlights || [],
      highlightColor: currentNode.highlightColor || '#60a5fa',
      tooltip: currentNode.tooltip || '',
    };
  }, [currentNode]);

  return (
    <div className="h-screen w-screen flex flex-col bg-marine-900 text-slate-200 overflow-hidden">
      {/* ═══ TOP HEADER BAR ═══ */}
      <header className="shrink-0 border-b border-slate-700/50 bg-marine-800/80 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 py-2.5 lg:px-6">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30">
              <Anchor size={16} className="text-blue-400" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-100 tracking-tight leading-tight">
                Lloyd&apos;s Register Rules
              </h1>
              <p className="text-[10px] text-slate-500 leading-tight">
                Hatch Coaming Crack Propagation Prevention — Table 8.2.1
              </p>
            </div>
          </div>

          {/* Grade selector */}
          <div className="flex items-center gap-1 bg-slate-800/60 rounded-lg p-1 border border-slate-700/50">
            {GRADES.map((grade) => {
              const active = grade === selectedGrade;
              const info = GRADE_INFO[grade];
              return (
                <motion.button
                  key={grade}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => handleGradeChange(grade)}
                  className={`relative px-3 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                    active
                      ? 'text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {active && (
                    <motion.div
                      layoutId="activeGrade"
                      className="absolute inset-0 rounded-md"
                      style={{ backgroundColor: info.color + '33', borderColor: info.color + '66', borderWidth: 1 }}
                      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    />
                  )}
                  <span className="relative z-10">{grade}</span>
                </motion.button>
              );
            })}
          </div>

          {/* Grade info */}
          <div className="hidden md:flex items-center gap-2 text-xs text-slate-500">
            <Ship size={14} />
            <span>{GRADE_INFO[selectedGrade]?.desc}</span>
          </div>
        </div>
      </header>

      {/* ═══ MAIN CONTENT ═══ */}
      <div className="flex-1 flex overflow-hidden">
        {/* ─── LEFT PANEL: Flowchart Wizard ─── */}
        <div className="w-[380px] shrink-0 border-r border-slate-700/50 bg-marine-800/40 flex flex-col">
          <FlowchartPanel
            currentNodeId={currentNodeId}
            history={history}
            onChoice={handleChoice}
            onReset={handleReset}
          />
        </div>

        {/* ─── RIGHT PANEL: Dynamic Visualizer ─── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* View indicator bar */}
          <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-slate-700/30 bg-marine-800/30">
            <div className="flex items-center gap-2">
              {viewConfig.view === 'A' ? (
                <Eye size={14} className="text-purple-400" />
              ) : (
                <Layers size={14} className="text-cyan-400" />
              )}
              <span className="text-xs font-semibold text-slate-400">
                {viewConfig.view === 'A' ? 'View A — 2D Cross-Section (Fig 8.2.1)' : 'View B — 3D Isometric Block Joint'}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {viewConfig.highlights.length > 0 && (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
                  style={{ backgroundColor: viewConfig.highlightColor + '20', color: viewConfig.highlightColor, borderColor: viewConfig.highlightColor + '40', borderWidth: 1 }}
                >
                  <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: viewConfig.highlightColor }} />
                  {viewConfig.highlights.join(', ')}
                </div>
              )}
            </div>
          </div>

          {/* SVG Visualizer with AnimatePresence */}
          <div className="flex-1 relative overflow-hidden flex items-center justify-center p-4 lg:p-6">
            <AnimatePresence mode="wait">
              {viewConfig.view === 'A' ? (
                <motion.div
                  key="view-a"
                  initial={{ opacity: 0, scale: 0.92, rotateY: -15 }}
                  animate={{ opacity: 1, scale: 1, rotateY: 0 }}
                  exit={{ opacity: 0, scale: 0.92, rotateY: 15 }}
                  transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
                  className="w-full h-full max-w-3xl max-h-[560px]"
                >
                  <CrossSectionView
                    highlights={viewConfig.highlights}
                    highlightColor={viewConfig.highlightColor}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="view-b"
                  initial={{ opacity: 0, scale: 0.92, rotateY: 15 }}
                  animate={{ opacity: 1, scale: 1, rotateY: 0 }}
                  exit={{ opacity: 0, scale: 0.92, rotateY: -15 }}
                  transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
                  className="w-full h-full max-w-3xl max-h-[560px]"
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

            {/* Floating current-step context */}
            {currentNode && (
              <motion.div
                key={currentNodeId}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute bottom-4 left-4 right-4 lg:left-6 lg:right-6"
              >
                <div className="bg-marine-800/90 backdrop-blur-sm border border-slate-700/50 rounded-lg px-4 py-2 flex items-center gap-3">
                  <div
                    className="w-2 h-2 rounded-full shrink-0 animate-pulse"
                    style={{ backgroundColor: viewConfig.highlightColor }}
                  />
                  <p className="text-xs text-slate-400 line-clamp-1 flex-1">
                    <span className="text-slate-300 font-medium">{currentNode.title}:</span>{' '}
                    {currentNode.text}
                  </p>
                  <span className="text-[10px] text-slate-600 shrink-0">
                    {selectedGrade}
                  </span>
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
