// Contents of the "Step Wedge" and "Weld" menus (classic Windows dropdowns).

const BLOCK_ITEMS = [
  { modeId: 'basic', label: 'Flat Plate 25 mm (기본 조작)' },
  { modeId: 'zero', label: '0° Probe Zero — Plate 25 mm (0° 탐상)' },
  { modeId: 'lam', label: 'Plate 12 mm — Lamination (라미네이션)' },
  { modeId: 'spread', label: 'Plate 25 mm — Beam Spread 20% (빔 확산)' },
  { modeId: 'v1', label: 'V1 / IIW Block (V1 교정)' },
  { modeId: 'v2', label: 'V2 Block (V2 교정)' },
  { modeId: 'asme', label: 'ASME Basic Block — DAC/TCG (ASME 교정)' },
]

const WELD_ITEMS = [
  { modeId: 'weld', label: 'Single-V Butt Weld (용접부 결함)' },
  { modeId: 'pipe', label: 'Pipe Circumferential Weld (배관 원주 용접부)' },
  { modeId: 'dac', label: 'DAC Exercise — SDH Plate (DAC)' },
  { modeId: 'tofd', label: 'TOFD Pair (시간비행회절)' },
  { modeId: 'aut', label: 'AUT Automated Scan (자동 주사)' },
  { modeId: 'tky', label: 'T / K / Y Joint (TKY)' },
]

function Item({ checked, disabled, onClick, children }) {
  return (
    <button type="button" className="menu-item" disabled={disabled} onClick={onClick}>
      <span className="check">{checked ? '✓' : ''}</span>
      {children}
    </button>
  )
}

export default function SpecimenSelector({ section, modeId, specimen, specimenParams, dispatch }) {
  const items = section === 'weld' ? WELD_ITEMS : BLOCK_ITEMS
  const setModeParam = (targetMode, key, value) => {
    if (modeId !== targetMode) dispatch({ type: 'SET_MODE', modeId: targetMode })
    dispatch({ type: 'SET_SPECIMEN_PARAM', key, value })
  }
  return (
    <div>
      {items.map((it) => (
        <Item key={it.modeId} checked={modeId === it.modeId} onClick={() => dispatch({ type: 'SET_MODE', modeId: it.modeId })}>
          {it.label}
        </Item>
      ))}

      {section !== 'weld' && specimen.faces && (
        <>
          <div className="menu-sep" />
          {Object.entries(specimen.faces).map(([key, f]) => (
            <Item
              key={key}
              checked={(specimenParams.face ?? specimen.defaultFace) === key}
              onClick={() => dispatch({ type: 'SET_SPECIMEN_PARAM', key: 'face', value: key })}
            >
              Face: {f.label}
            </Item>
          ))}
        </>
      )}

      {section !== 'weld' && specimen.type === 'asme' && (
        <>
          <div className="menu-sep" />
          <Item disabled>Block thickness T (시험편 두께)</Item>
          {specimen.thicknessOptions.map((v) => (
            <Item key={v} checked={(specimenParams.thickness ?? specimen.thickness) === v} onClick={() => setModeParam('asme', 'thickness', v)}>
              T = {v} mm (SDH {v / 4}/{v / 2}/{(3 * v) / 4})
            </Item>
          ))}
        </>
      )}

      {section === 'weld' && (
        <>
          <div className="menu-sep" />
          <Item disabled>Weld plate thickness (판 두께)</Item>
          {[10, 15, 20, 25, 30, 35, 40].map((v) => (
            <Item key={v} checked={specimen.type === 'weld' && (specimenParams.thickness ?? specimen.thickness) === v} onClick={() => setModeParam('weld', 'thickness', v)}>
              {v} mm
            </Item>
          ))}
          <div className="menu-sep" />
          <Item disabled>Pipe OD / wall (배관 외경/두께)</Item>
          {(specimen.type === 'pipe' ? specimen : { odOptionsIn: [6, 8, 12] }).odOptionsIn.map((v) => (
            <Item key={'od' + v} checked={specimen.type === 'pipe' && (specimenParams.odIn ?? specimen.odIn) === v} onClick={() => setModeParam('pipe', 'odIn', v)}>
              OD {v}" (C = {Math.round(Math.PI * v * 25.4)} mm)
            </Item>
          ))}
          {(specimen.type === 'pipe' ? specimen.wtOptions : [10, 12, 15, 20, 25]).map((v) => (
            <Item key={'wt' + v} checked={specimen.type === 'pipe' && (specimenParams.wt ?? specimen.wt) === v} onClick={() => setModeParam('pipe', 'wt', v)}>
              WT {v} mm
            </Item>
          ))}
          {specimen.type === 'tky' && (
            <>
              <div className="menu-sep" />
              <Item disabled>Brace angle (브레이스 각도)</Item>
              {[30, 45, 60, 75, 90].map((v) => (
                <Item key={v} checked={(specimenParams.braceAngle ?? specimen.braceAngle) === v} onClick={() => dispatch({ type: 'SET_SPECIMEN_PARAM', key: 'braceAngle', value: v })}>
                  {v}°
                </Item>
              ))}
              <div className="menu-sep" />
              <Item disabled>Scan surface (탐상면)</Item>
              <Item checked={(specimenParams.scanSurface ?? 'main') === 'main'} onClick={() => dispatch({ type: 'SET_SPECIMEN_PARAM', key: 'scanSurface', value: 'main' })}>
                Main plate — t={specimen.mainThickness}mm
              </Item>
              <Item checked={specimenParams.scanSurface === 'brace'} onClick={() => dispatch({ type: 'SET_SPECIMEN_PARAM', key: 'scanSurface', value: 'brace' })}>
                Brace — t={specimen.braceThickness}mm
              </Item>
            </>
          )}
        </>
      )}
    </div>
  )
}
