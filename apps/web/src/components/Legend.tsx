'use client';

import { ColorsConfig, MEASURE_LABELS, DEFAULT_COLORS } from '@/lib/types';

interface LegendProps {
  activeMeasures: number[];
  visibleMeasures: Set<number>;
  onToggle: (mid: number) => void;
  colors: ColorsConfig;
}

export default function Legend({ activeMeasures, visibleMeasures, onToggle, colors }: LegendProps) {
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
        MEASURE LEGEND (click to toggle visibility)
      </div>
      <div className="legend">
        {activeMeasures.map(mid => {
          const cfg = colors.measures[String(mid)];
          const color = cfg?.hex || DEFAULT_COLORS[mid] || '#888';
          const label = cfg?.label || MEASURE_LABELS[mid] || `Measure ${mid}`;
          const visible = visibleMeasures.has(mid);
          return (
            <div
              key={mid}
              className={`legend-item ${!visible ? 'disabled' : ''}`}
              onClick={() => onToggle(mid)}
            >
              <div className="legend-swatch" style={{ background: color }} />
              <span>{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
