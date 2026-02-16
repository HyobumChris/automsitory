import { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight, RotateCcw, Info, Shield, AlertTriangle,
  CheckCircle2, Zap, ScanLine, Layers, HelpCircle, ArrowDown,
} from 'lucide-react';
import { FLOW_NODES } from '../data/flowNodes';

const ICON_MAP = {
  check: CheckCircle2,
  shield: Shield,
  alert: AlertTriangle,
  info: Info,
  zap: Zap,
  scan: ScanLine,
  layers: Layers,
};

function getNodeIcon(node) {
  if (node.icon && ICON_MAP[node.icon]) return ICON_MAP[node.icon];
  if (node.type === 'question') return HelpCircle;
  if (node.type === 'terminal') return CheckCircle2;
  return Info;
}

function NodeTypeTag({ type }) {
  const colors = {
    question: 'bg-blue-900/50 text-blue-400 border-blue-700/50',
    info: 'bg-amber-900/30 text-amber-400 border-amber-700/50',
    terminal: 'bg-emerald-900/30 text-emerald-400 border-emerald-700/50',
  };
  const labels = {
    question: 'Decision',
    info: 'Requirement',
    terminal: 'Final Step',
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium uppercase tracking-wide ${colors[type] || colors.info}`}>
      {labels[type] || type}
    </span>
  );
}

function HistoryNode({ nodeId, answer }) {
  const node = FLOW_NODES[nodeId];
  if (!node) return null;
  const Icon = getNodeIcon(node);

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 0.55, x: 0 }}
      className="relative pl-8 pb-2"
    >
      {/* Connector line */}
      <div className="absolute left-[13px] top-0 bottom-0 w-px bg-slate-700/50" />
      <div className="absolute left-[9px] top-[10px] w-[9px] h-[9px] rounded-full border-2 border-slate-600 bg-slate-800" />

      <div className="bg-slate-800/30 rounded-lg px-3 py-2 border border-slate-700/30">
        <div className="flex items-center gap-2 mb-1">
          <Icon size={12} className="text-slate-500 shrink-0" />
          <span className="text-[10px] text-slate-500 font-medium truncate">{node.title}</span>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">{node.text}</p>
        {answer && (
          <div className={`mt-1.5 inline-block text-[10px] font-bold px-2 py-0.5 rounded ${
            answer === 'yes' ? 'bg-emerald-900/40 text-emerald-400' : 'bg-red-900/40 text-red-400'
          }`}>
            {answer === 'yes' ? 'YES' : 'NO'}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function ActiveNode({ nodeId, onChoice }) {
  const node = FLOW_NODES[nodeId];
  if (!node) return null;
  const Icon = getNodeIcon(node);

  const borderColor = {
    question: 'border-blue-500/60',
    info: 'border-amber-500/50',
    terminal: 'border-emerald-500/50',
  }[node.type] || 'border-slate-600';

  const glowColor = {
    question: 'shadow-blue-500/20',
    info: 'shadow-amber-500/15',
    terminal: 'shadow-emerald-500/15',
  }[node.type] || '';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', damping: 20, stiffness: 200 }}
      className="relative pl-8"
    >
      {/* Connector */}
      <div className="absolute left-[13px] top-0 h-3 w-px bg-slate-600/50" />
      <motion.div
        className="absolute left-[7px] top-[10px] w-[13px] h-[13px] rounded-full border-2 bg-slate-900"
        style={{ borderColor: node.highlightColor || '#60a5fa' }}
        animate={{ scale: [1, 1.2, 1] }}
        transition={{ duration: 2, repeat: Infinity }}
      />

      <div className={`bg-slate-800/60 backdrop-blur rounded-xl p-4 border-2 ${borderColor} shadow-lg ${glowColor}`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Icon size={16} style={{ color: node.highlightColor || '#94a3b8' }} />
            <span className="text-sm font-semibold text-slate-200">{node.title}</span>
          </div>
          <NodeTypeTag type={node.type} />
        </div>

        <p className="text-sm text-slate-300 leading-relaxed mb-4">{node.text}</p>

        {/* View indicator */}
        <div className="flex items-center gap-1.5 mb-3 text-[10px] text-slate-500">
          <div className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
          View: {node.view === 'A' ? '2D Cross-Section' : '3D Isometric Block Joint'}
        </div>

        {/* Action buttons */}
        {node.type === 'question' && (
          <div className="flex gap-2">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => onChoice('yes')}
              className="flex-1 py-2.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 font-semibold text-sm border border-emerald-600/30 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 size={14} /> YES
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => onChoice('no')}
              className="flex-1 py-2.5 rounded-lg bg-red-600/15 hover:bg-red-600/25 text-red-400 font-semibold text-sm border border-red-600/30 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <AlertTriangle size={14} /> NO
            </motion.button>
          </div>
        )}

        {node.type === 'info' && node.next && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => onChoice('next')}
            className="w-full py-2.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 font-semibold text-sm border border-blue-600/30 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          >
            Next Step <ChevronRight size={14} />
          </motion.button>
        )}

        {node.type === 'terminal' && (
          <div className="text-center py-2 text-xs text-emerald-500 font-medium bg-emerald-900/20 rounded-lg border border-emerald-800/30">
            <CheckCircle2 size={14} className="inline mr-1.5 -mt-0.5" />
            Assessment Complete
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default function FlowchartPanel({ currentNodeId, history, onChoice, onReset }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      setTimeout(() => {
        scrollRef.current.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: 'smooth',
        });
      }, 100);
    }
  }, [currentNodeId, history]);

  return (
    <div className="flex flex-col h-full">
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <ArrowDown size={14} className="text-blue-400" />
          <span className="text-sm font-semibold text-slate-300">Decision Flowchart</span>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onReset}
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 px-2 py-1 rounded hover:bg-slate-700/50 transition-colors cursor-pointer"
        >
          <RotateCcw size={12} /> Reset
        </motion.button>
      </div>

      {/* Step counter */}
      <div className="px-4 py-2 bg-slate-800/30 border-b border-slate-700/30">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">
            Step {history.length + 1}
          </span>
          <div className="flex-1 h-px bg-slate-700/50" />
          <span className="text-[10px] text-slate-600">{history.length} completed</span>
        </div>
      </div>

      {/* Scrollable flow */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
        <AnimatePresence>
          {history.map((entry, i) => (
            <HistoryNode key={`h-${i}-${entry.nodeId}`} nodeId={entry.nodeId} answer={entry.answer} />
          ))}
        </AnimatePresence>

        <ActiveNode nodeId={currentNodeId} onChoice={onChoice} />
      </div>
    </div>
  );
}
