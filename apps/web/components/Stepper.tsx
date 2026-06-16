'use client';

interface StepperProps {
  steps: string[];
  currentStep: number;
  onStepClick: (idx: number) => void;
}

export default function Stepper({ steps, currentStep, onStepClick }: StepperProps) {
  return (
    <nav className="flex items-center gap-1 overflow-x-auto pb-2">
      {steps.map((label, idx) => {
        const isActive = idx === currentStep;
        const isDone = idx < currentStep;
        return (
          <button
            key={idx}
            onClick={() => onStepClick(idx)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap
              ${isActive ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' : ''}
              ${isDone ? 'bg-slate-700 text-green-400 hover:bg-slate-600' : ''}
              ${!isActive && !isDone ? 'bg-slate-800 text-slate-400 hover:bg-slate-700' : ''}
            `}
          >
            <span className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold
              ${isActive ? 'bg-white text-blue-600' : ''}
              ${isDone ? 'bg-green-500/20 text-green-400' : ''}
              ${!isActive && !isDone ? 'bg-slate-700 text-slate-500' : ''}
            `}>
              {isDone ? '✓' : idx + 1}
            </span>
            {label}
          </button>
        );
      })}
    </nav>
  );
}
