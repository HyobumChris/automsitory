import { createElement, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion'; // eslint-disable-line no-unused-vars
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

function resolveIcon(node) {
  if (node.icon && ICON_MAP[node.icon]) return ICON_MAP[node.icon];
  if (node.type === 'question') return HelpCircle;
  if (node.type === 'terminal') return CheckCircle2;
  return Info;
}

function renderIcon(node, props) {
  return createElement(resolveIcon(node), props);
}

function TypeBadge({ type }) {
  const cfg = {
    question: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/25', label: 'Decision' },
    info: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20', label: 'Requirement' },
    terminal: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20', label: 'Final' },
  }[type] || { bg: 'bg-slate-500/10', text: 'text-slate-400', border: 'border-slate-500/20', label: type };
  return (
    <span className={`text-[9px] px-1.5 py-px rounded border font-semibold uppercase tracking-widest ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      {cfg.label}
    </span>
  );
}

function HistoryNode({ nodeId, answer, index }) {
  const node = FLOW_NODES[nodeId];
  if (!node) return null;

  return (
    <motion.div
      initial={{ opacity: 0, x: -15 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
      className="relative pl-8 pb-1.5"
    >
      {/* Vertical connector */}
      <div className="absolute left-[14px] top-0 bottom-0 w-px bg-gradient-to-b from-slate-600/40 to-slate-700/20" />
      {/* Dot */}
      <div className="absolute left-[10px] top-[10px] w-[9px] h-[9px] rounded-full border-[1.5px] border-slate-600/60 bg-slate-800/80" />

      <div className="bg-slate-800/20 rounded-lg px-3 py-2 border border-slate-700/20 hover:border-slate-600/30 transition-colors">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-[9px] text-slate-600 font-mono w-4">{String(index + 1).padStart(2, '0')}</span>
          {renderIcon(node, { size: 11, className: 'text-slate-500 shrink-0' })}
          <span className="text-[10px] text-slate-500 font-medium truncate flex-1">{node.title}</span>
          {answer && answer !== 'next' && (
            <span className={`text-[9px] font-bold px-1.5 py-px rounded ${
              answer === 'yes'
                ? 'bg-emerald-900/40 text-emerald-500 border border-emerald-700/30'
                : 'bg-red-900/40 text-red-400 border border-red-700/30'
            }`}>
              {answer.toUpperCase()}
            </span>
          )}
          {answer === 'next' && (
            <ChevronRight size={10} className="text-slate-600" />
          )}
        </div>
        <p className="text-[10px] text-slate-500 leading-snug line-clamp-1 pl-5">{node.text}</p>
      </div>
    </motion.div>
  );
}

function ActiveNode({ nodeId, onChoice }) {
  const node = FLOW_NODES[nodeId];
  if (!node) return null;

  const borderMap = {
    question: 'border-blue-500/50 shadow-blue-500/10',
    info: 'border-amber-500/40 shadow-amber-500/8',
    terminal: 'border-emerald-500/40 shadow-emerald-500/8',
  };

  const iconColor = node.highlightColor || '#60a5fa';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', damping: 22, stiffness: 220 }}
      className="relative pl-8 pt-1"
    >
      {/* Connector line */}
      <div className="absolute left-[14px] top-0 h-4 w-px bg-slate-600/30" />
      {/* Active dot with pulse */}
      <motion.div
        className="absolute left-[8px] top-[14px] w-[13px] h-[13px] rounded-full border-2 bg-marine-900"
        style={{ borderColor: iconColor }}
        animate={{ boxShadow: [`0 0 0 0px ${iconColor}33`, `0 0 0 6px ${iconColor}00`] }}
        transition={{ duration: 1.8, repeat: Infinity }}
      />

      <div className={`bg-slate-800/50 backdrop-blur-sm rounded-xl p-4 border-2 shadow-lg ${borderMap[node.type] || borderMap.info}`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: iconColor + '18' }}>
              {renderIcon(node, { size: 15, style: { color: iconColor } })}
            </div>
            <span className="text-[13px] font-bold text-slate-200 leading-tight">{node.title}</span>
          </div>
          <TypeBadge type={node.type} />
        </div>

        {/* Description */}
        <p className="text-[12px] text-slate-300 leading-relaxed mb-3.5 pl-0.5">{node.text}</p>

        {/* View indicator chip */}
        <div className="flex items-center gap-1.5 mb-3 px-2 py-1 rounded-md bg-slate-700/20 border border-slate-700/30 w-fit">
          <motion.div
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: node.view === 'A' ? '#a78bfa' : '#22d3ee' }}
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <span className="text-[9px] text-slate-500 font-medium tracking-wide">
            {node.view === 'A' ? '2D CROSS-SECTION' : '3D ISOMETRIC'}
          </span>
        </div>

        {/* Action buttons */}
        {node.type === 'question' && (
          <div className="flex gap-2.5">
            <motion.button
              whileHover={{ scale: 1.03, backgroundColor: 'rgba(16, 185, 129, 0.2)' }}
              whileTap={{ scale: 0.96 }}
              onClick={() => onChoice('yes')}
              className="flex-1 py-2.5 rounded-lg bg-emerald-600/12 hover:bg-emerald-600/20 text-emerald-400 font-bold text-xs border border-emerald-600/25 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 size={13} /> YES
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.03, backgroundColor: 'rgba(239, 68, 68, 0.15)' }}
              whileTap={{ scale: 0.96 }}
              onClick={() => onChoice('no')}
              className="flex-1 py-2.5 rounded-lg bg-red-600/10 hover:bg-red-600/18 text-red-400 font-bold text-xs border border-red-600/25 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <AlertTriangle size={13} /> NO
            </motion.button>
          </div>
        )}

        {node.type === 'info' && node.next && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => onChoice('next')}
            className="w-full py-2.5 rounded-lg bg-blue-600/12 hover:bg-blue-600/22 text-blue-400 font-bold text-xs border border-blue-600/25 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            Continue <ChevronRight size={13} />
          </motion.button>
        )}

        {node.type === 'terminal' && (
          <div className="text-center py-2.5 text-xs text-emerald-400 font-semibold bg-emerald-900/15 rounded-lg border border-emerald-700/25 flex items-center justify-center gap-2">
            <CheckCircle2 size={14} />
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
      requestAnimationFrame(() => {
        scrollRef.current.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: 'smooth',
        });
      });
    }
  }, [currentNodeId, history.length]);

  const currentNode = FLOW_NODES[currentNodeId];

  return (
    <div className="flex flex-col h-full">
      {/* Panel header */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-slate-700/40 bg-marine-800/50">
        <div className="flex items-center gap-2">
          <ArrowDown size={13} className="text-blue-400" />
          <span className="text-xs font-bold text-slate-300 tracking-tight">Decision Flowchart</span>
        </div>
        <motion.button
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          onClick={onReset}
          className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300 px-2 py-1 rounded-md hover:bg-slate-700/40 transition-all cursor-pointer"
        >
          <RotateCcw size={11} /> Reset
        </motion.button>
      </div>

      {/* Progress bar */}
      <div className="shrink-0 px-4 py-2 bg-slate-800/20 border-b border-slate-700/20">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-widest">
            Step {history.length + 1}
          </span>
          <span className="text-[10px] text-slate-600">
            {history.length} completed {currentNode?.type === 'terminal' ? '(done)' : ''}
          </span>
        </div>
        <div className="w-full h-1 bg-slate-700/30 rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: currentNode?.type === 'terminal' ? '#10b981' : '#3b82f6' }}
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(((history.length + 1) / 8) * 100, 100)}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>
      </div>

      {/* Scrollable flow */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
        <AnimatePresence mode="sync">
          {history.map((entry, i) => (
            <HistoryNode
              key={`h-${i}-${entry.nodeId}`}
              nodeId={entry.nodeId}
              answer={entry.answer}
              index={i}
            />
          ))}
        </AnimatePresence>

        <ActiveNode
          key={currentNodeId}
          nodeId={currentNodeId}
          onChoice={onChoice}
        />

        {/* Bottom spacer for scroll */}
        <div className="h-4" />
      </div>
    </div>
  );
}
