// Contents of the "Step Wedge" and "Weld" menus (classic Windows dropdowns).

const BLOCK_ITEMS = [
  { modeId: 'basic', label: 'Flat Plate 25 mm (기본 조작)' },
  { modeId: 'zero', label: '0° Probe Zero — Plate 25 mm (0° 탐상)' },
  { modeId: 'lam', label: 'Plate 12 mm — Lamination (라미네이션)' },
  { modeId: 'spread', label: 'Plate 25 mm — Beam Spread 20% (빔 확산)' },
  { modeId: 'v1', label: 'V1 / IIW Block (V1 교정)' },
  { modeId: 'v2', label: 'V2 Block (V2 교정)' },
]

const WELD_ITEMS = [
  { modeId: 'weld', label: 'Single-V Butt Weld (용접부 결함)' },
  { modeId: 'dac', label: 'DAC Exercise — SDH Plate (DAC)' },
  { modeId: 'tofd', label: 'TOFD Pair (시간비행회절)' },
  { modeId: 'aut', label: 'AUT Automated Scan (자동 주사)' },
  { modeId: 'tky', label: 'T / K / Y Joint (TKY)' },
]

export default function SpecimenSelector({ section, modeId, specimen, specimenParams, dispatch }) {
  const items = section === 'weld' ? WELD_ITEMS : BLOCK_ITEMS
  const setThickness = (v) => {
    if (specimen.type !== 'weld') dispatch({ type: 'SET_MODE', modeId: 'weld' })
    dispatch({ type: 'SET_SPECIMEN_PARAM', key: 'thickness', value: v })
  }
  return (
    <div>
      {items.map((it) => (
        <button key={it.modeId} type="button" className="menu-item" onClick={() => dispatch({ type: 'SET_MODE', modeId: it.modeId })}>
          <span className="check">{modeId === it.modeId ? '✓' : ''}</span>
          {it.label}
        </button>
      ))}
      {section !== 'weld' && specimen.type === 'v1' && (
        <>
          <div className="menu-sep" />
          {Object.entries(specimen.faces).map(([key, f]) => (
            <button key={key} type="button" className="menu-item" onClick={() => dispatch({ type: 'SET_SPECIMEN_PARAM', key: 'face', value: key })}>
              <span className="check">{(specimenParams.face ?? specimen.defaultFace) === key ? '✓' : ''}</span>
              Face: {f.label}
            </button>
          ))}
        </>
      )}
      {section === 'weld' && (
        <>
          <div className="menu-sep" />
          <button type="button" className="menu-item" disabled>
            Plate thickness (판 두께)
          </button>
          {[10, 15, 20, 25, 30, 35, 40].map((v) => (
            <button key={v} type="button" className="menu-item" onClick={() => setThickness(v)}>
              <span className="check">{specimen.type === 'weld' && (specimenParams.thickness ?? specimen.thickness) === v ? '✓' : ''}</span>
              {v} mm
            </button>
          ))}
          {specimen.type === 'tky' && (
            <>
              <div className="menu-sep" />
              <button type="button" className="menu-item" disabled>
                Brace angle (브레이스 각도)
              </button>
              {[30, 45, 60, 75, 90].map((v) => (
                <button key={v} type="button" className="menu-item" onClick={() => dispatch({ type: 'SET_SPECIMEN_PARAM', key: 'braceAngle', value: v })}>
                  <span className="check">{(specimenParams.braceAngle ?? specimen.braceAngle) === v ? '✓' : ''}</span>
                  {v}°
                </button>
              ))}
            </>
          )}
        </>
      )}
    </div>
  )
}
