import { PROBES } from '../data/probes.js'

// Contents of the "Probes" menu (classic Windows dropdown).
export default function ProbeSelector({ probeId, probeDir, dispatch }) {
  return (
    <div>
      {PROBES.map((p) => (
        <button
          key={p.id}
          type="button"
          className="menu-item"
          onClick={() => dispatch({ type: 'SET_PROBE', probeId: p.id })}
        >
          <span className="check">{p.id === probeId ? '✓' : ''}</span>
          {p.name} — {p.nameKo}
        </button>
      ))}
      <div className="menu-sep" />
      <button type="button" className="menu-item" onClick={() => dispatch({ type: 'FLIP_PROBE' })}>
        <span className="check" />
        Flip scan direction (주사 방향 반전) — now {probeDir > 0 ? '→' : '←'}
      </button>
    </div>
  )
}
