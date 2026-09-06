/* 90-app.js — application shell: page layout, menu bar, toolbar, dialogs (weld, wedge, options,
 * step wedge, help/about/keys, export), status bar, keyboard shortcuts, persistence and boot.
 * SPEC §7, §8, §9/§14.10, §10, §15.9. Classic script; nothing touches the DOM at load time (§15.12).
 */
// SPEC NOTES (decisions where the spec is silent or ambiguous)
// - style.css lives at ut-simulator/style.css (where index.html / build.py reference it), not under src/.
// - Layout classes on #main: `.block` (plan view hidden → cross-section fills the main area, instrument
//   column keeps its width), `.no-ruler`, `.plot` (cv-plotter shown instead of cv-plan in iow mode),
//   `.usk7` (instrument column shrinks to max-content because the USK7 floats). Hidden views come from
//   UT.modes.hiddenViews() (fallback: a local copy of §14.7) plus display.plan === false.
// - Menu "Zero Probe ▸ Single/Twin Crystal" sets probe.crystal AND selects the 0° probe when another
//   angle is active (the item is a "zero probe" chooser); the tick reflects probe.crystal.
// - "Adjust Angle in Wedge (Shoe)" tick = an angle probe (wedge) is in use. The dialog applies the wedge
//   angle live while the slider moves; a refracted angle within 0.05° of 45/60/70 snaps to the preset.
//   Below the 1st critical angle the compression wave is used (mode 'comp'), between the critical angles
//   the shear wave; beyond the 2nd critical angle the probe is left at 90° shear (surface wave) with a warning.
// - Colour code submenus behave like radio items; picking the ticked one switches back to 'none'.
// - Step Wedge menu: two fixed step sets, Custom… (dialog), Auto Cal (UT.modes.autoCal.start) and Exit.
// - Weld dialog: for pipes T is kept equal to WT; OD inch dropdown maps 4/6/8/10/12 → 114.3/168.3/219.1/273.1/323.9 mm.
//   Applying re-enters the current weld-based mode (weld/tofd/aut/trade keep their mode, keepProbe: true).
// - `Pos:` shows the probe x in the current units (mm integer/0.5 steps, inch 2 dp). Cursor depth is shown as
//   `Depth = y.ymm` (or `Depth: y.y` in TOFD mode) whenever state.cursor.y is a number.
// - Status left/mid are written through UT.status only when the text changed (avoids state churn).
// - Persistence restores probe/display/weldOpts/utSet/lang wholesale (merged over the defaults) and the
//   listed instrument keys; `freeze`/`peakMem`/`page` are never persisted.
// - File ▸ New asks for confirmation; File ▸ Load restores the saved setup and re-enters weld mode.
// - Export dialog offers the A-scan (default), cross-section and plan canvases as PNG data URLs in an <img>.
// - Reset Layout closes every floating window, restores display defaults and re-shows the USK7 / 3D windows.
// - Keyboard: ▲▼◀▶ go to UT.instruments.handleKey first (it returns false unless the instrument has focus).
(function (UT) {
  'use strict';
  const M = UT.math;
  const app = {};
  const mem = {
    built: false, booted: false, els: {}, tb: {}, openMenu: null, lang: 'en', saveTimer: null,
    lastLeft: '', lastMid: '', resizeObs: null, suspendSave: false,
  };
  const OD_INCH = { 4: 114.3, 6: 168.3, 8: 219.1, 10: 273.1, 12: 323.9 };
  const STORE_KEY = 'utsim.v1';
  const PERSIST_KEYS = ['probe', 'instrument', 'display', 'defects', 'weldOpts', 'utSet'];
  const INSTR_KEYS = ['gain', 'refGain', 'range', 'delay', 'reject', 'damping', 'rectify', 'gates', 'dac', 'cal', 'trig'];
  const RANGE_PRESETS = [50, 100, 200, 400];
  const MODE_TB = { v2: 'v2', v1: 'v1', dac: 'dac', iow: 'plot', tky: 'tky', tofd: 'tofd', aut: 'aut' };
  // fallback copy of §14.7 (used only when UT.modes is missing)
  const HIDDEN_FALLBACK = { v1: ['plan', 'ruler', 'compass'], v2: ['plan', 'ruler', 'compass'], tky: ['plan', 'ruler', 'compass'], iow: ['plan', 'compass'] };

  // ------------------------------------------------------------------ small helpers
  function st() { return UT.state; }
  function has(path) {
    let o = UT;
    for (const k of path.split('.')) { if (!o || o[k] === undefined || o[k] === null) return null; o = o[k]; }
    return o;
  }
  /** Call UT.<path>(...args) when it exists; returns undefined otherwise (never throws). */
  function call(path, args) {
    const fn = has(path);
    if (typeof fn !== 'function') return undefined;
    const parent = has(path.split('.').slice(0, -1).join('.')) || UT;
    try { return fn.apply(parent, args || []); } catch (e) { console.error('[UT.app] ' + path, e); return undefined; }
  }
  /**
   * Normalise a defect list for state.defects: UT.specimens.normaliseDefects (up to 16, duplicate n possible)
   * then the §15.8 rule also enforced by UT.modes.setDefects: at most 8 defects with unique slots n = 1..8
   * (a taken / invalid n moves to the next free slot, the rest are dropped). Used wherever 90-app writes
   * state.defects without going through UT.modes.setDefects (boot restore, preset fallback).
   */
  function limitDefectSlots(arr) {
    const list = has('specimens.normaliseDefects') ? UT.specimens.normaliseDefects(arr) : (Array.isArray(arr) ? arr : []);
    const out = [];
    const taken = function (n) { return out.some(function (d) { return d.n === n; }); };
    for (const d of list) {
      let n = Number.isInteger(d.n) && d.n >= 1 && d.n <= 8 && !taken(d.n) ? d.n : 0;
      if (!n) for (let k = 1; k <= 8; k++) if (!taken(k)) { n = k; break; }
      if (!n) break;
      out.push(n === d.n ? d : Object.assign({}, d, { n }));
    }
    return out;
  }
  function t(key) { return UT.i18n && UT.i18n.t ? UT.i18n.t(key) : key; }
  function h(tag, attrs, kids) { return UT.dom.h(tag, attrs, kids); }
  function doc() { return typeof document === 'undefined' ? null : document; }
  function byId(id) { const d = doc(); return d ? d.getElementById(id) : null; }
  function winApi(name) { return UT.dom.wins[name] || null; }
  function winOpen(name) { const w = winApi(name); return !!(w && w.isOpen()); }
  function fmtNum(v, dp) { const n = +v; return Number.isInteger(n) ? String(n) : n.toFixed(dp === undefined ? 1 : dp); }
  function scanRange() {
    const sp = st().specimen;
    const ss = sp && sp.scanSurface ? sp.scanSurface : { xMin: -150, xMax: 150 };
    return ss;
  }

  /**
   * Confirm dialog → Promise<boolean> (UT.dom.confirm resolves true on OK, false on Cancel/close).
   */
  function confirmDlg(message, opts) { return UT.dom.confirm(message, opts); }

  // ------------------------------------------------------------------ Korean labels
  const KO = {
    'New': '새로 만들기', 'Save Setup': '설정 저장', 'Load Setup': '설정 불러오기', 'Export A-scan PNG': 'A-스캔 PNG 내보내기', 'Print': '인쇄',
    'Adjust Angle in Wedge (Shoe)': '웨지(슈) 내 각도 조정', 'Zero Probe - Twin or Single Crystal': '수직 탐촉자 - 이중/단일 진동자',
    'Single Crystal': '단일 진동자', 'Twin Crystal': '이중 진동자', 'Pulse Echo': '펄스 에코', 'Through Transmission': '투과법',
    'Tandem (pitch catch)': '탠덤 (피치 캐치)', '2.5 MHz Frequency': '2.5 MHz 주파수', '5 MHz Frequency': '5 MHz 주파수',
    'Probe Diameter 10mm': '진동자 직경 10mm', 'Probe Diameter 5mm': '진동자 직경 5mm', 'Phased Array Probe': '위상 배열 탐촉자',
    'Colour Code Display': '색상 코드 표시', 'Mode Propagation': '전파 모드', 'Geometry': '형상', 'Number of Skips': '스킵 수',
    'Single Line Beam': '단일선 빔', 'Focus Beam': '집속 빔',
    'Steps 5-25 mm (5 mm)': '스텝 5-25 mm (5 mm)', 'Steps 10-50 mm (10 mm)': '스텝 10-50 mm (10 mm)', 'Custom Steps...': '사용자 스텝...',
    'Auto Cal': '자동 교정', 'Exit Step Wedge': '스텝 웨지 종료',
    'Weld Settings...': '용접부 설정...', 'Presets': '프리셋', 'Pipe': '파이프', 'TKY Joint': 'TKY 이음',
    'Defect Editor...': '결함 편집기...', 'Add Preset': '프리셋 결함 추가', 'Delete All Defects': '모든 결함 삭제', 'Hide Defects': '결함 숨기기',
    'Import Defects...': '결함 가져오기...', 'Export Defects...': '결함 내보내기...', 'Lamination Check': '라미네이션 검사', 'Trade Test...': '실기 시험...',
    'UT Set': 'UT 장비', 'Units': '단위', 'Colour Code': '색상 코드', 'None': '없음', 'Show Plan View': '평면도 표시', 'Show 3D Window': '3D 창 표시',
    'Show Legend': '범례 표시', 'Language': '언어', 'Options...': '옵션...', 'Reset Layout': '레이아웃 초기화',
    'About UTsim...': 'UTsim 정보...', 'Quick Guide...': '빠른 안내...', 'Keyboard Shortcuts...': '키보드 단축키...', 'Lessons...': '레슨...',
    'Use mouse button on the Plotter to plot Beam Spread. Draw on Block to mark 10% Beam Edge': '플로터 위에서 마우스로 빔 확산을 플롯하고, 블록 위에 그려 10% 빔 에지를 표시하세요',
  };

  // ------------------------------------------------------------------ toolbar icons (inline SVG strings)
  function svg(inner) { return '<svg viewBox="0 0 24 22" xmlns="http://www.w3.org/2000/svg">' + inner + '<\/svg>'; }
  function sq(col) { return svg('<rect x="7" y="4" width="11" height="11" fill="' + col + '" stroke="#333" stroke-width="1"/>'); }
  const ICONS = {
    0: sq('#ff00ff'), 45: sq('#ffff00'), 60: sq('#00c000'), 70: sq('#0000ff'),
    v2: svg('<path d="M3 5 h18 v10 H12 A9 9 0 0 1 3 6 Z" fill="#9a9a9a" stroke="#333"/>'),
    v1: svg('<path d="M3 4 h18 v12 h-11 A7 7 0 0 1 3 9 Z" fill="#9a9a9a" stroke="#333"/><circle cx="16" cy="10" r="2" fill="#dde" stroke="#333"/>'),
    dac: svg('<rect x="3" y="3" width="18" height="15" fill="#e8f4ff" stroke="#333"/><polyline points="5,14 9,7 13,10 17,12 20,15" fill="none" stroke="#0040ff" stroke-width="1.5"/><path d="M5 16 Q12 4 20 6" fill="none" stroke="#e00" stroke-width="1"/>'),
    plot: svg('<rect x="3" y="3" width="18" height="15" fill="#ffffb0" stroke="#333"/><line x1="6" y1="15" x2="18" y2="6" stroke="#333" stroke-width="2"/>'),
    damp: svg('<polyline points="2,17 7,17 9,3 11,17 13,10 15,17 17,14 19,17 22,17" fill="none" stroke="#c000c0" stroke-width="1.6"/>'),
    size: svg('<rect x="3" y="4" width="18" height="6" fill="#4a7fe0" stroke="#333"/><rect x="3" y="12" width="12" height="6" fill="#8fb4ff" stroke="#333"/>'),
    defect: svg('<path d="M4 15 l4 -9 l3 6 l3 -8 l4 11" fill="none" stroke="#e00000" stroke-width="2.2"/><line x1="3" y1="18" x2="21" y2="18" stroke="#333"/>'),
    hide: svg('<path d="M6 14 l3 -6 l3 5 l3 -7" fill="none" stroke="#e00000" stroke-width="1.6"/><line x1="4" y1="4" x2="20" y2="17" stroke="#333" stroke-width="1.5"/>'),
    clear: svg('<rect x="4" y="9" width="12" height="7" fill="#f7c" stroke="#333" transform="rotate(-30 10 12)"/><rect x="13" y="6" width="6" height="7" fill="#fff" stroke="#333" transform="rotate(-30 16 9)"/>'),
    beam: svg('<rect x="3" y="3" width="18" height="15" fill="#111" stroke="#333"/><line x1="5" y1="5" x2="19" y2="16" stroke="#fff" stroke-width="1.5"/>'),
    rad: svg('<circle cx="12" cy="11" r="9" fill="#ffd800" stroke="#333"/><path d="M12 11 L12 2 A9 9 0 0 1 19.8 6.5 Z M12 11 L4.2 6.5 A9 9 0 0 0 4.2 15.5 Z M12 11 L19.8 15.5 A9 9 0 0 1 12 20 Z" fill="#111"/><circle cx="12" cy="11" r="2" fill="#ffd800"/>'),
    pipe: svg('<path d="M3 17 Q7 3 12 10 T21 5" fill="none" stroke="#1040ff" stroke-width="2"/><line x1="3" y1="18" x2="21" y2="18" stroke="#333"/>'),
    tky: svg('<path d="M12 19 V11 L5 3 M12 11 L19 3" fill="none" stroke="#f0c000" stroke-width="3"/>'),
    tofd: svg('<rect x="2" y="7" width="7" height="7" fill="#7b7b7b" stroke="#333"/><rect x="15" y="7" width="7" height="7" fill="#7b7b7b" stroke="#333"/><path d="M9 11 Q12 19 15 11" fill="none" stroke="#0040ff"/>'),
    aut: svg('<rect x="3" y="3" width="5" height="15" fill="#ff5050"/><rect x="9.5" y="3" width="5" height="15" fill="#00c0ff"/><rect x="16" y="3" width="5" height="15" fill="#40e040"/>'),
  };

  // ------------------------------------------------------------------ actions used by toolbar & menus
  function setAngle(angle) {
    const preset = has('probe.presets') ? UT.probe.presets[angle] : null;
    UT.setIn('probe', { angle, mode: preset ? preset.mode : (angle === 0 ? 'comp' : 'shear') });
  }
  function toggleMode(name) {
    if (has('modes.toggle')) return call('modes.toggle', [name]);
    console.warn('[UT.app] UT.modes missing; cannot toggle mode ' + name);
    return undefined;
  }
  function enterMode(name, opts) {
    if (has('modes.enter')) return call('modes.enter', [name, opts]);
    if (name === 'weld' && has('specimens.plateWeld')) {
      const o = st().weldOpts || {};
      const spec = o.pipe && UT.specimens.pipeWeld ? UT.specimens.pipeWeld(o) : UT.specimens.plateWeld(o);
      UT.set({ mode: 'weld', specimen: spec });
      return spec;
    }
    return undefined;
  }
  function currentMode() { return st().mode || 'weld'; }
  function reenterWeldLike() {
    const m = currentMode();
    enterMode(m === 'tofd' || m === 'aut' || m === 'trade' ? m : 'weld', { keepProbe: true });
  }
  function togglePipe() {
    const pipe = !(st().weldOpts && st().weldOpts.pipe);
    UT.setIn('weldOpts', { pipe }, { noRender: true });
    reenterWeldLike();
    syncPipe3d();
  }
  /**
   * One rule for the 3-D window: 64-view-3d shows it when display.pipe3d && (pipe || weld mode) and
   * re-syncs itself on every 'display' / 'weldOpts' / 'specimen' / 'mode' state event, so after a
   * weldOpts / mode change the app only needs the fallback (window without 64-view-3d).
   */
  function syncPipe3d() {
    if (has('views.pipe3d.open')) return;
    const s = st();
    if (winApi('pipe3d')) showPipe3d(!!(s.weldOpts && s.weldOpts.pipe) && s.display.pipe3d !== false);
  }
  function showPipe3d(show) {
    const v = has('views.pipe3d');
    if (v) {
      if (show && typeof v.open === 'function') return v.open();
      if (!show && typeof v.close === 'function') return v.close();
      if (v.window && typeof v.window[show ? 'show' : 'hide'] === 'function') return v.window[show ? 'show' : 'hide']();
    }
    const w = winApi('pipe3d');
    if (w) show ? w.show() : w.hide();
    return undefined;
  }
  function clearAll() {
    call('ascan.clearPeak');
    UT.setIn('tofd', { scan: null }, { noRender: true });
    UT.setIn('aut', { scan: null }, { noRender: true });
    UT.setIn('plot', { points: [], edgeMarks: [] }, { noRender: true });
    UT.setIn('sizing', { marks: [] });
    call('views.plan.clearTrail');
  }
  function toggleWindowOf(path) {
    const v = has(path);
    if (!v) { console.warn('[UT.app] ' + path + ' not available'); return; }
    if (typeof v.toggle === 'function') return v.toggle();
    if (v.window && typeof v.window.toggle === 'function') return v.window.toggle();
    if (typeof v.open === 'function') return v.open();
    return undefined;
  }
  function setUtSet(name) {
    if (st().utSet === name) { if (name === 'usk7') call('instruments.setSkin', [name]); return; }
    UT.set({ utSet: name });
  }
  function setDisplay(patch) { UT.setIn('display', patch); }
  function cycleRange() {
    const r = st().instrument.range;
    let i = RANGE_PRESETS.findIndex(function (p) { return p > r + 1e-6; });
    if (i < 0) i = 0;
    UT.setIn('instrument', { range: RANGE_PRESETS[i] });
  }
  function addPresetDefect(key) {
    if (has('test.addPreset')) return call('test.addPreset', [key]);
    const presets = has('specimens.defectPresets');
    if (!presets || !presets[key] || !st().specimen) return null;
    const d = presets[key](st().specimen);
    const defects = st().defects.slice();
    d.n = defects.length + 1;
    defects.push(d);
    UT.set({ defects: limitDefectSlots(defects) });
    return d;
  }

  // ------------------------------------------------------------------ toolbar model
  // Each entry: id (button id 'tb-<id>'), label (visible), tip (EN description) + ko (Korean) → tooltip (§8/§12).
  const TOOLBAR = [
    { id: '0', label: '0°', tip: '0° compression-wave probe (single/twin crystal)', ko: '0° 수직 탐촉자 (종파)', action: function () { setAngle(0); }, active: function () { return st().probe.angle === 0; } },
    { id: '45', label: '45°', tip: '45° shear-wave angle probe', ko: '45° 사각 탐촉자 (횡파)', action: function () { setAngle(45); }, active: function () { return st().probe.angle === 45; } },
    { id: '60', label: '60°', tip: '60° shear-wave angle probe', ko: '60° 사각 탐촉자 (횡파)', action: function () { setAngle(60); }, active: function () { return st().probe.angle === 60; } },
    { id: '70', label: '70°', tip: '70° shear-wave angle probe', ko: '70° 사각 탐촉자 (횡파)', action: function () { setAngle(70); }, active: function () { return st().probe.angle === 70; } },
    { gap: true },
    { id: 'v2', label: 'V2', tip: 'V2 (A4) calibration block: 25/50 mm radii, 5 mm hole', ko: 'V2 교정 시험편: 25/50 mm 반경, 5 mm 구멍', action: function () { toggleMode('v2'); }, active: function () { return currentMode() === 'v2'; } },
    { id: 'v1', label: 'V1', tip: 'V1 (A2) calibration block: 100 mm radius, 25/100 mm faces, 50 mm hole', ko: 'V1 교정 시험편: 100 mm 반경, 25/100 mm 면', action: function () { toggleMode('v1'); }, active: function () { return currentMode() === 'v1'; } },
    { id: 'dac', label: 'DAC', tip: 'record a distance-amplitude curve on the SDH block', ko: 'SDH 시험편에서 DAC 곡선 기록', action: function () { toggleMode('dac'); }, active: function () { return currentMode() === 'dac'; } },
    { gap: true },
    { id: 'plot', label: 'PLOT', tip: 'beam-spread plotting card on the IOW block (20 dB drop)', ko: 'IOW 시험편에서 빔 확산 플롯 (20 dB 드롭)', action: function () { toggleMode('iow'); }, active: function () { return currentMode() === 'iow'; } },
    { id: 'damp', label: 'DAMP', tip: 'toggle probe damping (shorter pulse, lower amplitude)', ko: '탐촉자 댐핑 켜기/끄기 (펄스 폭 감소)', action: function () { UT.setIn('instrument', { damping: !st().instrument.damping }); }, active: function () { return !!st().instrument.damping; } },
    { id: 'size', label: 'SIZE', tip: 'defect sizing panel: 6 dB / 20 dB drop, Mark L / Mark R', ko: '결함 크기 측정 패널: 6 dB / 20 dB 드롭', action: function () { toggleWindowOf('views.sizing'); }, active: function () { return winOpen('size'); } },
    { gap: true },
    { id: 'defect', label: 'DEFECT', tip: 'open the defect editor (position, length, height, type; draw with the brush)', ko: '결함 편집기 열기 (위치·길이·높이·종류, 브러시로 그리기)', action: function () { toggleWindowOf('modes.defectEditor'); }, active: function () { return winOpen('defects'); } },
    { id: 'hide', label: 'HIDE', tip: 'hide defects and beam for blind practice', ko: '결함과 빔 숨기기 (블라인드 연습)', action: function () { setDisplay({ hide: !st().display.hide }); }, active: function () { return !!st().display.hide; } },
    { id: 'clear', label: 'CLEAR', tip: 'clear peak memory, scans, plots and marks (defects are kept)', ko: '피크 메모리·스캔·플롯·마크 지우기 (결함은 유지)', action: clearAll, active: function () { return false; } },
    { gap: true },
    { id: 'beam', label: 'BEAM', tip: 'show / hide the sound beam', ko: '음향 빔 표시/숨기기', action: function () { setDisplay({ beam: !st().display.beam }); }, active: function () { return !!st().display.beam; } },
    { id: 'rad', label: 'RAD', tip: 'radiograph strip of the weld (compare with UT)', ko: '용접부 방사선 투과 사진 표시', action: function () { toggleWindowOf('views.radiograph'); }, active: function () { return winOpen('rad'); } },
    { gap: true },
    { id: 'pipe', label: 'PIPE', tip: 'switch plate weld ⇄ pipe circumferential weld (OD/WT in the Weld dialog)', ko: '평판 ⇄ 파이프 원주 용접부 전환 (Weld 대화상자의 OD/WT)', action: togglePipe, active: function () { return !!(st().weldOpts && st().weldOpts.pipe); } },
    { id: 'tky', label: 'TKY', tip: 'TKY tubular joint: brace / chord geometry', ko: 'TKY 관 이음: 브레이스/코드 형상', action: function () { toggleMode('tky'); }, active: function () { return currentMode() === 'tky'; } },
    { id: 'tofd', label: 'TOFD', tip: 'Time-of-Flight Diffraction: RF A-scan, D-scan, PCS', ko: 'TOFD (비행시간 회절법): RF A-스캔, D-스캔, PCS', action: function () { toggleMode('tofd'); }, active: function () { return currentMode() === 'tofd'; } },
    { id: 'aut', label: 'AUT', tip: 'Automated UT: strip charts, gates, colour map', ko: '자동 초음파 탐상: 스트립 차트, 게이트, 컬러 맵', action: function () { toggleMode('aut'); }, active: function () { return currentMode() === 'aut'; } },
  ];
  /** Tooltip text for a toolbar button: label — EN description / KO (KO first when the UI language is Korean). */
  function tbTitle(def) {
    const en = def.tip || '', ko = def.ko || '';
    const parts = mem.lang === 'ko' ? [ko, en] : [en, ko];
    return def.label + (parts[0] ? ' — ' + parts[0] : '') + (parts[1] ? ' / ' + parts[1] : '');
  }
  const TB_IDS = TOOLBAR.filter(function (b) { return !b.gap; }).map(function (b) { return 'tb-' + b.id; });

  /** Whether a toolbar button is enabled in the current mode (§14.7). */
  function toolbarEnabled(id) {
    if (has('modes.isToolbarEnabled')) { try { return !!UT.modes.isToolbarEnabled(id); } catch (e) { return true; } }
    const en = has('modes.enabled');
    const row = en && en[currentMode()];
    if (row && Array.isArray(row.disabledToolbar)) return row.disabledToolbar.indexOf(id) < 0;
    if (row && Array.isArray(row.toolbar)) return row.toolbar.indexOf(id) >= 0;
    return true;
  }
  /** Whether a menu-bar entry is enabled in the current mode (§14.7). */
  function menuEnabled(id) {
    if (has('modes.isMenuEnabled')) { try { return !!UT.modes.isMenuEnabled(id); } catch (e) { return true; } }
    const en = has('modes.enabled');
    const row = en && en[currentMode()];
    if (row && Array.isArray(row.disabledMenus)) return row.disabledMenus.indexOf(id) < 0;
    if (row && Array.isArray(row.menus)) return row.menus.indexOf(id) >= 0;
    return true;
  }
  function activateToolbar(id) {
    const def = TOOLBAR.find(function (b) { return !b.gap && 'tb-' + b.id === id; });
    if (!def) return false;
    if (!toolbarEnabled(id)) return false;
    try { def.action(); } catch (e) { console.error('[UT.app] toolbar ' + id, e); }
    refreshToolbar();
    return true;
  }
  function refreshToolbar() {
    if (!mem.built) return;
    for (const def of TOOLBAR) {
      if (def.gap) continue;
      const el = mem.tb['tb-' + def.id];
      if (!el) continue;
      let active = false;
      try { active = !!def.active(); } catch (e) { active = false; }
      el.classList.toggle('active', active);
      el.classList.toggle('disabled', !toolbarEnabled('tb-' + def.id));
    }
    for (const id of Object.keys(mem.els.menus || {})) {
      mem.els.menus[id].classList.toggle('disabled', !menuEnabled(id));
    }
  }

  // ------------------------------------------------------------------ menu model
  function sepItem() { return { sep: true }; }
  function radioProbe(key, field, value) {
    return { key, action: function () { const p = {}; p[field] = value; UT.setIn('probe', p); }, check: function () { return st().probe[field] === value; } };
  }
  function menuModel() {
    const s = st();
    const presetNames = has('specimens.defectPresetNames') || [];
    return [
      { id: 'menu-file', key: 'File', items: [
        { key: 'New', action: fileNew },
        { key: 'Save Setup', action: function () { app.saveNow(); UT.dom.alert('Setup saved to this browser (localStorage).\n설정이 브라우저에 저장되었습니다.', 'Save Setup'); } },
        { key: 'Load Setup', action: fileLoad },
        sepItem(),
        { key: 'Export A-scan PNG', action: function () { openExport('cv-ascan'); } },
        { key: 'Print', action: function () { try { window.print(); } catch (e) { /* ignore */ } } },
      ] },
      { id: 'menu-probes', key: 'Probes', items: [
        { key: 'Adjust Angle in Wedge (Shoe)', action: openWedge, check: function () { return st().probe.angle !== 0; } },
        { key: 'Zero Probe - Twin or Single Crystal', sub: [
          { key: 'Single Crystal', action: function () { zeroProbe('single'); }, check: function () { return st().probe.crystal !== 'twin'; } },
          { key: 'Twin Crystal', action: function () { zeroProbe('twin'); }, check: function () { return st().probe.crystal === 'twin'; } },
        ] },
        radioProbe('Pulse Echo', 'method', 'pe'),
        radioProbe('Through Transmission', 'method', 'tt'),
        radioProbe('Tandem (pitch catch)', 'method', 'tandem'),
        radioProbe('2.5 MHz Frequency', 'freq', 2.5),
        radioProbe('5 MHz Frequency', 'freq', 5),
        radioProbe('Probe Diameter 10mm', 'diameter', 10),
        radioProbe('Probe Diameter 5mm', 'diameter', 5),
        { key: 'Phased Array Probe', action: function () { UT.setIn('probe', { method: st().probe.method === 'pa' ? 'pe' : 'pa' }); }, check: function () { return st().probe.method === 'pa'; } },
        { key: 'Colour Code Display', sub: [
          { key: 'Mode Propagation', action: function () { setDisplay({ colourCode: st().display.colourCode === 'propagation' ? 'none' : 'propagation' }); }, check: function () { return st().display.colourCode === 'propagation'; } },
          { key: 'Geometry', action: function () { setDisplay({ colourCode: st().display.colourCode === 'geometry' ? 'none' : 'geometry' }); }, check: function () { return st().display.colourCode === 'geometry'; } },
        ] },
        { key: 'Number of Skips', sub: [1, 2, 3, 4].map(function (n) {
          return { key: String(n), action: function () { setDisplay({ skips: n }); }, check: function () { return st().display.skips === n; } };
        }) },
        { key: 'Single Line Beam', action: function () { setDisplay({ singleLine: !st().display.singleLine }); }, check: function () { return !!st().display.singleLine; } },
        { key: 'Focus Beam', action: function () { setDisplay({ focus: !st().display.focus }); }, check: function () { return !!st().display.focus; } },
      ] },
      { id: 'menu-stepwedge', key: 'Step Wedge', items: [
        { key: 'Steps 5-25 mm (5 mm)', action: function () { enterStep([5, 10, 15, 20, 25], 40); }, check: function () { return stepIs([5, 10, 15, 20, 25]); } },
        { key: 'Steps 10-50 mm (10 mm)', action: function () { enterStep([10, 20, 30, 40, 50], 40); }, check: function () { return stepIs([10, 20, 30, 40, 50]); } },
        { key: 'Custom Steps...', action: openStepWedge },
        sepItem(),
        { key: 'Auto Cal', action: function () { if (currentMode() !== 'step') enterStep([5, 10, 15, 20, 25], 40); call('modes.autoCal.start'); }, enabled: function () { return !!has('modes.autoCal.start'); } },
        { key: 'Exit Step Wedge', action: function () { enterMode('weld', { keepProbe: false }); }, enabled: function () { return currentMode() === 'step'; } },
      ] },
      { id: 'menu-weld', key: 'Weld', items: [
        { key: 'Weld Settings...', action: openWeld },
        { key: 'Presets', sub: WELD_PRESETS.map(function (p) {
          return { key: p.key, action: function () { UT.setIn('weldOpts', Object.assign({}, UT.defaultState().weldOpts, p.opts), { noRender: true }); reenterWeldLike(); syncPipe3d(); } };
        }) },
        sepItem(),
        { key: 'Pipe', action: togglePipe, check: function () { return !!(s.weldOpts && s.weldOpts.pipe); } },
        { key: 'TKY Joint', action: function () { toggleMode('tky'); }, check: function () { return currentMode() === 'tky'; } },
      ] },
      { id: 'menu-defects', key: 'Defects', items: [
        { key: 'Defect Editor...', action: function () { toggleWindowOf('modes.defectEditor'); }, check: function () { return winOpen('defects'); } },
        { key: 'Add Preset', sub: presetNames.map(function (p) { return { key: p.label, action: function () { addPresetDefect(p.key); } }; }), enabled: function () { return presetNames.length > 0; } },
        { key: 'Delete All Defects', action: function () { confirmDlg('Delete all defects?', { title: 'ERASE ALL DEFECTS' }).then(function (ok) { if (ok) UT.set({ defects: [] }); }); }, enabled: function () { return !st().trade.active; } },
        { key: 'Hide Defects', action: function () { setDisplay({ hide: !st().display.hide }); }, check: function () { return !!st().display.hide; } },
        sepItem(),
        { key: 'Import Defects...', action: openImportDefects, enabled: function () { return !st().trade.active; } },
        { key: 'Export Defects...', action: openExportDefects },
        sepItem(),
        { key: 'Lamination Check', action: function () { toggleMode('lamination'); }, check: function () { return currentMode() === 'lamination'; } },
        { key: 'Trade Test...', action: function () { if (has('modes.tradeTest')) toggleWindowOf('modes.tradeTest'); else toggleMode('trade'); }, check: function () { return currentMode() === 'trade'; } },
      ] },
      { id: 'menu-options', key: 'Options', items: [
        { key: 'UT Set', sub: [
          { key: 'EPOCH 600', action: function () { setUtSet('epoch600'); }, check: function () { return st().utSet === 'epoch600'; } },
          { key: 'EPOCH 4', action: function () { setUtSet('epoch4'); }, check: function () { return st().utSet === 'epoch4'; } },
          { key: 'USK7', action: function () { setUtSet('usk7'); }, check: function () { return st().utSet === 'usk7'; } },
        ] },
        { key: 'Units', sub: [
          { key: 'mm', action: function () { setDisplay({ units: 'mm' }); }, check: function () { return st().display.units !== 'inch'; } },
          { key: 'inch', action: function () { setDisplay({ units: 'inch' }); }, check: function () { return st().display.units === 'inch'; } },
        ] },
        { key: 'Colour Code', sub: [
          { key: 'None', action: function () { setDisplay({ colourCode: 'none' }); }, check: function () { return !st().display.colourCode || st().display.colourCode === 'none'; } },
          { key: 'Mode Propagation', action: function () { setDisplay({ colourCode: 'propagation' }); }, check: function () { return st().display.colourCode === 'propagation'; } },
          { key: 'Geometry', action: function () { setDisplay({ colourCode: 'geometry' }); }, check: function () { return st().display.colourCode === 'geometry'; } },
        ] },
        { key: 'Show Plan View', action: function () { setDisplay({ plan: !st().display.plan }); applyLayout(); }, check: function () { return st().display.plan !== false; } },
        { key: 'Show 3D Window', action: function () { const v = !st().display.pipe3d; setDisplay({ pipe3d: v }); syncPipe3d(); }, check: function () { return st().display.pipe3d !== false; } },
        { key: 'Show Legend', action: function () { setDisplay({ legend: !st().display.legend }); }, check: function () { return st().display.legend !== false; } },
        { key: 'Language', sub: [
          { key: 'English', action: function () { app.setLang('en'); }, check: function () { return mem.lang === 'en'; } },
          { key: 'Korean (한국어)', action: function () { app.setLang('ko'); }, check: function () { return mem.lang === 'ko'; } },
        ] },
        sepItem(),
        { key: 'Options...', action: openOptions },
        { key: 'Reset Layout', action: resetLayout },
      ] },
      { id: 'menu-help', key: 'Help', items: [
        { key: 'About UTsim...', action: openAbout },
        { key: 'Quick Guide...', action: openGuide },
        { key: 'Keyboard Shortcuts...', action: openKeys },
        sepItem(),
        { key: 'Lessons...', action: function () { toggleWindowOf('modes.lessonsWindow'); }, enabled: function () { return !!has('modes.lessonsWindow'); } },
      ] },
    ];
  }
  const WELD_PRESETS = [
    { key: 'Plate 12 mm Single-V', opts: { T: 12, type: 'single-v', bevel: 30, rootGap: 2, rootFace: 1.5, capWidth: 12, capHeight: 1.5, rootHeight: 1, pipe: false } },
    { key: 'Plate 20 mm Single-V', opts: { T: 20, type: 'single-v', pipe: false } },
    { key: 'Plate 25 mm Double-V', opts: { T: 25, type: 'double-v', bevel: 30, rootGap: 2, rootFace: 2, capWidth: 18, capHeight: 2, rootHeight: 2, pipe: false } },
    { key: 'Plate 40 mm Double-V', opts: { T: 40, type: 'double-v', bevel: 25, rootGap: 3, rootFace: 3, capWidth: 26, capHeight: 2.5, rootHeight: 2.5, pipe: false } },
    { key: 'Pipe 6 inch WT 20', opts: { T: 20, wt: 20, od: 168.3, pipe: true } },
    { key: 'Pipe 8 inch WT 25', opts: { T: 25, wt: 25, od: 219.1, pipe: true, capWidth: 18 } },
    { key: 'Pipe 12 inch WT 30', opts: { T: 30, wt: 30, od: 323.9, pipe: true, capWidth: 20 } },
  ];
  function zeroProbe(crystal) {
    const patch = { crystal };
    if (st().probe.angle !== 0 && toolbarEnabled('tb-0')) { patch.angle = 0; patch.mode = 'comp'; }
    UT.setIn('probe', patch);
  }
  function stepIs(steps) {
    const sp = st().specimen;
    return currentMode() === 'step' && !!sp && Array.isArray(sp.steps) && sp.steps.join(',') === steps.join(',');
  }
  function enterStep(steps, stepLen) { enterMode('step', { specimenOpts: { steps, stepLen: stepLen || 40 } }); }
  /** Parse a comma/space separated list of step thicknesses ("5,10,15") → sorted positive numbers. */
  function parseSteps(text) {
    const out = String(text || '').split(/[\s,;]+/).map(parseFloat).filter(function (v) { return Number.isFinite(v) && v > 0; });
    out.sort(function (a, b) { return a - b; });
    return out.filter(function (v, i) { return i === 0 || v !== out[i - 1]; });
  }

  // ------------------------------------------------------------------ menu DOM
  function buildMenuBar() {
    const bar = h('div', { id: 'menubar' });
    mem.els.menus = {};
    for (const top of menuModel()) {
      const item = h('div', { id: top.id, class: 'menu-item', dataset: { key: top.key } }, [h('span', { class: 'menu-label', dataset: { key: top.key } }, t(top.key))]);
      item.addEventListener('mousedown', function (e) {
        e.preventDefault(); e.stopPropagation();
        if (item.classList.contains('open')) closeMenus(); else openMenu(item, top.id);
      });
      item.addEventListener('mouseenter', function () { if (mem.openMenu && mem.openMenu !== item) openMenu(item, top.id); });
      bar.appendChild(item);
      mem.els.menus[top.id] = item;
    }
    return bar;
  }
  function openMenu(item, id) {
    closeMenus();
    if (!menuEnabled(id)) return;
    const top = menuModel().find(function (m) { return m.id === id; });
    if (!top) return;
    const drop = h('div', { class: 'menu-drop', dataset: { menu: top.key } }, top.items.map(renderEntry));
    item.appendChild(drop);
    item.classList.add('open');
    mem.openMenu = item;
  }
  function renderEntry(it) {
    if (it.sep) return h('div', { class: 'menu-sep' });
    const enabled = it.enabled ? !!it.enabled() : true;
    let checked = false;
    try { checked = it.check ? !!it.check() : false; } catch (e) { checked = false; }
    const el = h('div', { class: 'menu-entry' + (it.sub ? ' has-sub' : '') + (enabled ? '' : ' disabled'), dataset: { key: it.key } }, [
      h('span', { class: 'm-check' }, checked ? '✓' : ''),
      h('span', { class: 'm-label', dataset: { key: it.key } }, t(it.key)),
      it.sub ? h('span', { class: 'm-arrow' }, '▶') : null,
      it.sub ? h('div', { class: 'menu-sub', dataset: { menu: it.key } }, it.sub.map(renderEntry)) : null,
    ]);
    if (!it.sub) {
      el.addEventListener('mousedown', function (e) { e.stopPropagation(); e.preventDefault(); });
      el.addEventListener('mouseup', function (e) {
        e.stopPropagation();
        if (!enabled) return;
        closeMenus();
        try { it.action && it.action(); } catch (err) { console.error('[UT.app] menu ' + it.key, err); }
        refreshToolbar();
      });
    } else {
      el.addEventListener('mousedown', function (e) { e.stopPropagation(); e.preventDefault(); el.classList.add('hover'); });
    }
    return el;
  }
  function closeMenus() {
    if (!mem.openMenu) return;
    mem.openMenu.classList.remove('open');
    const drop = mem.openMenu.querySelector('.menu-drop');
    if (drop) mem.openMenu.removeChild(drop);
    mem.openMenu = null;
  }
  /**
   * Resolve a label path ('Probes/Number of Skips/2') in the menu model and run its action synchronously.
   * @param {string} path exact English labels (data-key), '/'-separated
   * @returns {boolean} false when missing or disabled
   */
  function menuByPath(path) {
    const parts = String(path || '').split('/').map(function (s) { return s.trim(); }).filter(Boolean);
    if (!parts.length) return false;
    const top = menuModel().find(function (m) { return m.key === parts[0]; });
    if (!top || !menuEnabled(top.id)) return false;
    let items = top.items, it = null;
    for (let i = 1; i < parts.length; i++) {
      it = (items || []).find(function (x) { return !x.sep && x.key === parts[i]; });
      if (!it) return false;
      if (it.enabled && !it.enabled()) return false;
      items = it.sub;
    }
    if (!it || typeof it.action !== 'function') return false;
    closeMenus();
    try { it.action(); } catch (e) { console.error('[UT.app] menu ' + path, e); return false; }
    refreshToolbar();
    return true;
  }

  // ------------------------------------------------------------------ layout
  /**
   * Build the whole page into #app (title bar, menu bar, toolbar, main grid, status bar). Idempotent.
   * @returns {HTMLElement} the #app element
   */
  function buildLayout() {
    const d = doc();
    if (!d) return null;
    let root = d.getElementById('app');
    if (!root) { root = h('div', { id: 'app' }); d.body.appendChild(root); }
    if (mem.built) return root;
    root.textContent = '';
    mem.els.app = root;
    root.appendChild(h('div', { id: 'titlebar' }, [
      h('span', { class: 'tb-icon' }),
      h('span', { class: 'tb-name' }, 'UTsim — UTman-style Ultrasonic Simulator'),
      h('span', { class: 'tb-sub' }, '|  NDT Verification and Coaching'),
      h('span', { class: 'tb-ver' }, 'v' + UT.VERSION + '  ·  inspired by UTman / utsim.co.uk'),
    ]));
    root.appendChild(buildMenuBar());
    // toolbar
    const tb = h('div', { id: 'toolbar' });
    for (const def of TOOLBAR) {
      if (def.gap) { tb.appendChild(h('span', { class: 'tb-gap' })); continue; }
      const id = 'tb-' + def.id;
      const btn = h('button', { id, class: 'tb-btn', type: 'button', title: tbTitle(def), dataset: { key: def.label } }, [
        h('span', { class: 'tb-ico', html: ICONS[def.id] || '' }),
        h('span', { class: 'tb-lbl' }, def.label),
      ]);
      btn.addEventListener('click', function (e) { e.preventDefault(); closeMenus(); activateToolbar(id); });
      tb.appendChild(btn);
      mem.tb[id] = btn;
    }
    root.appendChild(tb);
    // main grid
    const cvPlan = h('canvas', { id: 'cv-plan' });
    const cvPlotter = h('canvas', { id: 'cv-plotter' });
    const cvRuler = h('canvas', { id: 'cv-ruler' });
    const cvCross = h('canvas', { id: 'cv-cross' });
    const instrument = h('div', { id: 'instrument', tabindex: '0' });
    const main = h('div', { id: 'main' }, [
      instrument,
      h('div', { id: 'plan-area' }, [cvPlan, cvPlotter]),
      h('div', { id: 'ruler-area' }, [cvRuler]),
      h('div', { id: 'cross-area' }, [cvCross]),
    ]);
    root.appendChild(main);
    Object.assign(mem.els, { main, instrument, cvPlan, cvPlotter, cvRuler, cvCross });
    // status bar
    const sb = h('div', { id: 'statusbar' }, [
      h('span', { class: 'sb-panel sb-left' }, ''),
      h('span', { class: 'sb-mid' }),
      h('span', { class: 'sb-panel sb-right' }, ''),
    ]);
    sb.querySelector('.sb-mid').style.display = 'contents';
    root.appendChild(sb);
    mem.els.statusbar = sb;
    mem.built = true;
    bindGlobalEvents();
    applyLayout();
    refreshToolbar();
    return root;
  }
  function hiddenViews() {
    let hidden = [];
    if (has('modes.hiddenViews')) { try { hidden = UT.modes.hiddenViews() || []; } catch (e) { hidden = []; } }
    else {
      const en = has('modes.enabled');
      const row = en && en[currentMode()];
      hidden = row && Array.isArray(row.hidden) ? row.hidden.slice() : (HIDDEN_FALLBACK[currentMode()] || []).slice();
    }
    if (st().display.plan === false && hidden.indexOf('plan') < 0) hidden.push('plan');
    return hidden;
  }
  /** Apply mode-dependent layout classes (#main.block/.no-ruler/.plot/.usk7) and request a render. */
  function applyLayout() {
    const main = mem.els.main;
    if (!main) return;
    const mode = currentMode();
    const hidden = hiddenViews();
    const plot = mode === 'iow';
    main.classList.toggle('plot', plot);
    main.classList.toggle('tall', ['iow', 'dac', 'step', 'lamination'].indexOf(mode) >= 0);
    main.classList.toggle('block', !plot && hidden.indexOf('plan') >= 0);
    main.classList.toggle('no-ruler', hidden.indexOf('ruler') >= 0);
    main.classList.toggle('usk7', st().utSet === 'usk7');
    UT.requestRender();
  }
  function bindGlobalEvents() {
    const d = doc();
    d.addEventListener('mousedown', function (e) { if (mem.openMenu && !mem.openMenu.contains(e.target)) closeMenus(); });
    d.addEventListener('keydown', onKey);
    if (typeof ResizeObserver === 'function') {
      mem.resizeObs = new ResizeObserver(function () { UT.requestRender(); UT.bus.emit('resize', { w: mem.els.app.clientWidth, h: mem.els.app.clientHeight }); });
      mem.resizeObs.observe(mem.els.app);
    } else {
      window.addEventListener('resize', function () { UT.requestRender(); UT.bus.emit('resize', { w: mem.els.app.clientWidth, h: mem.els.app.clientHeight }); });
    }
    UT.bus.on('render', onRender);
    UT.bus.on('status', renderStatus);
    UT.bus.on('state', onState);
    UT.bus.on('mode', function () { applyLayout(); refreshToolbar(); });
    UT.bus.on('win:show', function (w) { keepBelowToolbar(w); bindWinClamp(w); clampToViewport(w); refreshToolbar(); });
    UT.bus.on('win:hide', refreshToolbar);
    UT.bus.on('win:close', refreshToolbar);
    UT.bus.on('resize', function () { for (const k of Object.keys(UT.dom.wins)) { const w = UT.dom.wins[k]; if (w && w.isOpen()) clampToViewport(w); } });
  }
  /**
   * Keep a floating window inside the viewport: the full window where it fits, otherwise at least the
   * title bar (≥ 40 px of it horizontally) stays reachable; never above the toolbar.
   */
  function clampToViewport(w) {
    if (!w || !w.el || !w.isOpen() || typeof window === 'undefined') return;
    const el = w.el, vw = window.innerWidth, vh = window.innerHeight;
    if (!(vw > 0 && vh > 0)) return;
    const r = el.getBoundingClientRect();
    const tb = mem.built && !el.classList.contains('modal') ? byId('toolbar') : null;
    const minTop = tb ? Math.round(tb.getBoundingClientRect().bottom + 2) : 0;
    const titleH = Math.max(20, (el.firstChild && el.firstChild.offsetHeight) || 0);
    const maxLeft = Math.max(0, vw - r.width);
    const maxTop = Math.max(minTop, vh - r.height);
    const left = M.clamp(el.offsetLeft, Math.min(0, vw - 40 - r.width), Math.min(maxLeft, vw - 40));
    const top = M.clamp(el.offsetTop, minTop, Math.max(minTop, Math.min(maxTop, vh - titleH)));
    if (left !== el.offsetLeft) el.style.left = Math.floor(left) + 'px';
    if (top !== el.offsetTop) el.style.top = Math.floor(top) + 'px';
  }
  /** Wrap 00-core's title-bar drag (frozen) with a viewport clamp: our listeners run after core's. */
  function bindWinClamp(w) {
    if (!w || !w.el || w.el.dataset.clampBound) return;
    w.el.dataset.clampBound = '1';
    const title = w.el.querySelector('.win-title');
    if (!title) return;
    let dragging = false;
    title.addEventListener('mousedown', function (e) { if (e.button === 0 && !(e.target && e.target.classList && e.target.classList.contains('win-close'))) dragging = true; });
    window.addEventListener('mousemove', function () { if (dragging) clampToViewport(w); });
    window.addEventListener('mouseup', function () { if (dragging) { dragging = false; clampToViewport(w); } });
  }
  /** Floating (non-modal) windows never cover the menu bar / toolbar: nudge them below the toolbar. */
  function keepBelowToolbar(w) {
    if (!w || !w.el || !mem.built || w.el.classList.contains('modal')) return;
    const tb = byId('toolbar');
    if (!tb) return;
    const limit = tb.getBoundingClientRect().bottom + 2;
    const r = w.el.getBoundingClientRect();
    if (r.top < limit) w.el.style.top = Math.round(limit) + 'px';
  }
  function onState(ev) {
    const keys = (ev && ev.keys) || [];
    if (keys.indexOf('cursor') >= 0) { updateMid(); }
    if (keys.indexOf('status') >= 0 || (keys.length === 1 && keys[0] === 'cursor')) return;
    if (keys.indexOf('utSet') >= 0) { call('instruments.setSkin', [st().utSet]); applyLayout(); }
    if (keys.indexOf('mode') >= 0 || keys.indexOf('display') >= 0) applyLayout();
    refreshToolbar();
    scheduleSave(keys);
  }

  // ------------------------------------------------------------------ status bar
  function midParts(frame) {
    const s = st(), p = s.probe, ins = s.instrument;
    const inch = s.display.units === 'inch';
    const parts = [];
    parts.push(inch ? 'Pos: ' + (p.x / 25.4).toFixed(2) + ' in' : 'Pos: ' + fmtNum(p.x) + ' mm');
    parts.push(inch ? 'Range ' + (ins.range / 25.4).toFixed(2) + 'in' : 'Range ' + (+ins.range).toFixed(1) + 'mm');
    parts.push('AMP= ' + fmtNum(s.mode === 'tofd' && s.tofd && Number.isFinite(s.tofd.gainDb) ? s.tofd.gainDb : ins.gain) + 'dB');
    let extra = '';
    if (has('modes.statusMid')) { try { extra = UT.modes.statusMid() || ''; } catch (e) { extra = ''; } }
    else if (s.specimen && s.specimen.pipe) extra = 'WT ' + s.specimen.pipe.wt + 'mm  Dia ' + s.specimen.pipe.odInch + 'inch';
    for (const seg of String(extra).split(/\s{3,}|\s\|\s/)) if (seg.trim()) parts.push(seg.trim());
    const c = s.cursor;
    if (c && typeof c.y === 'number' && !Number.isNaN(c.y)) {
      parts.push(s.mode === 'tofd' ? 'Depth: ' + c.y.toFixed(1) : (inch ? 'Depth = ' + (c.y / 25.4).toFixed(3) + 'in' : 'Depth = ' + c.y.toFixed(1) + 'mm'));
    }
    void frame;
    return parts;
  }
  function leftText(frame) {
    if (frame && frame.derived && frame.derived.statusLine) return frame.derived.statusLine;
    const d = has('probe.derive') ? call('probe.derive', [st().probe, st().specimen]) : null;
    return d && d.statusLine ? d.statusLine : '';
  }
  function updateMid() {
    const mid = midParts(UT.frame).join(' | ');
    if (mid !== mem.lastMid) { mem.lastMid = mid; UT.status({ mid }); }
  }
  function onRender(frame) {
    const left = leftText(frame);
    const mid = midParts(frame).join(' | ');
    if (left !== mem.lastLeft || mid !== mem.lastMid) {
      mem.lastLeft = left; mem.lastMid = mid;
      UT.status({ left, mid });
    } else if (mem.els.statusbar && !mem.els.statusbar.firstChild.textContent) renderStatus(st().status);
  }
  /** Render state.status (left physics line, middle sunken panels, right hint) into #statusbar. */
  function renderStatus(status) {
    const sb = mem.els.statusbar;
    if (!sb) return;
    const s = status || st().status || {};
    const left = sb.querySelector('.sb-left'), mid = sb.querySelector('.sb-mid'), right = sb.querySelector('.sb-right');
    if (left.textContent !== (s.left || '')) left.textContent = s.left || '';
    const segs = Array.isArray(s.segments) && s.segments.length ? s.segments.map(String) : String(s.mid || '').split(' | ').filter(Boolean);
    const key = segs.join('');
    if (mid.dataset.key !== key) {
      mid.dataset.key = key;
      mid.textContent = '';
      for (const seg of segs) mid.appendChild(h('span', { class: 'sb-panel' }, seg));
    }
    const rt = s.right ? t(s.right) : '';
    if (right.textContent !== rt) right.textContent = rt;
    right.classList.toggle('empty', !rt);
  }

  // ------------------------------------------------------------------ keyboard
  function onKey(ev) {
    const tag = ev.target && ev.target.tagName ? ev.target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || (ev.target && ev.target.isContentEditable)) return;
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const key = ev.key;
    if (key === 'Escape') { if (mem.openMenu) { closeMenus(); ev.preventDefault(); return; } if (UT.dom.closeTopWindow()) ev.preventDefault(); return; }
    if (key.indexOf('Arrow') === 0 || key === 'Enter') {
      let used = false;
      try { used = !!(has('instruments.handleKey') && UT.instruments.handleKey(ev)); } catch (e) { used = false; }
      if (used) return;
    }
    const s = st(), p = s.probe;
    const stepX = ev.shiftKey ? 10 : 1;
    switch (key) {
      case 'ArrowLeft': case 'ArrowRight': {
        if (s.editing && s.editing.defect) return;
        const ss = scanRange();
        const x = M.clamp(p.x + (key === 'ArrowLeft' ? -stepX : stepX), ss.xMin, ss.xMax);
        UT.setIn('probe', { x: +x.toFixed(1) });
        break;
      }
      case 'ArrowUp': case 'ArrowDown': {
        const L = (s.specimen && s.specimen.L) || 300;
        let z = p.z + (key === 'ArrowUp' ? -stepX : stepX);
        if (s.specimen && s.specimen.pipe) z = ((z % L) + L) % L; else z = M.clamp(z, 0, L);
        UT.setIn('probe', { z: +z.toFixed(1) });
        break;
      }
      case '+': case '=': UT.setIn('instrument', { gain: M.clamp(s.instrument.gain + (ev.shiftKey ? 6 : 1), 0, 110) }); break;
      case '-': case '_': UT.setIn('instrument', { gain: M.clamp(s.instrument.gain - (ev.shiftKey ? 6 : 1), 0, 110) }); break;
      case 'r': case 'R': cycleRange(); break;
      case 'f': case 'F': UT.setIn('instrument', { freeze: !s.instrument.freeze }); break;
      case 'p': case 'P': UT.setIn('instrument', { peakMem: !s.instrument.peakMem }); break;
      case 'h': case 'H': activateToolbar('tb-hide'); break;
      case 'b': case 'B': activateToolbar('tb-beam'); break;
      case '1': activateToolbar('tb-0'); break;
      case '2': activateToolbar('tb-45'); break;
      case '3': activateToolbar('tb-60'); break;
      case '4': activateToolbar('tb-70'); break;
      default: return;
    }
    ev.preventDefault();
    refreshToolbar();
  }

  // ------------------------------------------------------------------ dialogs
  function dialog(name, title, w, build, extra) {
    const win = UT.dom.win(Object.assign({ name, title, w, x: extra && extra.x, y: extra && extra.y }, extra || {}));
    win.setContent(function () { return build(win); });
    win.show();
    return win;
  }
  /**
   * Numeric dialog field: like UT.dom.field but the handler only ever sees a finite value clamped to
   * [min, max]; a blank / NaN / out-of-range entry is flagged (class 'invalid', red outline) and NOT
   * committed, and the visible value is normalised to the clamped one on blur ('change').
   * @param {string} label
   * @param {{value:number, min?:number, max?:number, step?:number, unit?:string, onchange?:function}} o
   */
  function numField(label, o) {
    const lo = o.min === undefined ? -Infinity : o.min, hi = o.max === undefined ? Infinity : o.max;
    const onchange = o.onchange;
    const check = function (v) { return { ok: Number.isFinite(v), v: Number.isFinite(v) ? M.clamp(v, lo, hi) : NaN }; };
    const f = UT.dom.field(label, Object.assign({ type: 'number', event: 'input' }, o, {
      onchange: function (v, e) {
        const c = check(v);
        f.input.classList.toggle('invalid', !c.ok || c.v !== v);
        if (c.ok && onchange) onchange(c.v, e);
      },
    }));
    f.input.addEventListener('change', function () {
      const c = check(parseFloat(f.input.value));
      if (!c.ok) return; // stays flagged; the dialog's Apply falls back to the previous value
      f.input.value = c.v;
      f.input.classList.remove('invalid');
      if (onchange) onchange(c.v);
    });
    if (o.unit) f.appendChild(h('span', { class: 'fld-unit' }, o.unit));
    return f;
  }
  const DLG_CSS = '.fld-input.invalid { outline: 2px solid #e00000; background: #ffe6e6; } .dlg-msg { color: #b00000; min-height: 1.2em; margin: 2px 0; font-size: 12px; }';
  function inchOf(od) { for (const k of Object.keys(OD_INCH)) if (Math.abs(OD_INCH[k] - od) < 0.05) return k; return 'custom'; }

  /** Weld dialog (thickness, type, bevel, root, cap, plate length, pipe OD/WT). Numeric entries are
   * validated against WELD_RANGES on Apply/OK: blank/NaN falls back to the previously applied value,
   * out-of-range values are clamped (§8 Weld menu; the specimen can never be rebuilt from NaN). */
  function openWeld() {
    UT.dom.injectCss && UT.dom.injectCss('app-dlg', DLG_CSS);
    dialog('weld', 'Weld', 640, function (win) {
      const prev = Object.assign({}, UT.defaultState().weldOpts, st().weldOpts || {});
      const o = Object.assign({}, prev);
      const fields = {};
      const set = function (k) { return function (v) { o[k] = v; }; };
      const nf = function (k, label, opts) { fields[k] = numField(label, Object.assign({ value: o[k], min: WELD_RANGES[k][0], max: WELD_RANGES[k][1], onchange: set(k) }, opts || {})); return fields[k]; };
      const odMm = nf('od', 'OD (mm)', { step: 0.1, onchange: function (v) { o.od = v; odIn.input.value = inchOf(v); } });
      const odIn = UT.dom.field('OD (inch)', { tag: 'select', type: 'text', value: inchOf(o.od), options: [4, 6, 8, 10, 12].map(function (i) { return { value: String(i), label: i + ' inch (' + OD_INCH[i] + ' mm)' }; }).concat([{ value: 'custom', label: 'custom (mm)' }]), onchange: function (v) { if (OD_INCH[v]) { o.od = OD_INCH[v]; odMm.input.value = o.od; } } });
      const wt = nf('wt', 'Wall thickness WT', { step: 0.5, unit: 'mm' });
      const pipeChk = UT.dom.field('Pipe (circumferential weld)', { type: 'checkbox', value: !!o.pipe, onchange: function (v) { o.pipe = v; pipeBox.classList.toggle('disabled', !v); } });
      const pipeBox = h('div', { class: 'dlg-section' + (o.pipe ? '' : ' disabled') }, [h('span', { class: 'dlg-legend' }, 'Pipe'), odIn, odMm, wt]);
      const msg = h('div', { class: 'dlg-msg' }, '');
      /** Validate the draft: non-finite → previously applied value, numbers clamped; refresh the inputs; report. */
      const validate = function () {
        const bad = [];
        for (const k of Object.keys(fields)) {
          const raw = parseFloat(fields[k].input.value);
          o[k] = Number.isFinite(raw) ? raw : prev[k]; // blank / NaN → previously applied value
          if (!Number.isFinite(raw)) bad.push(fields[k].querySelector('.fld-label').textContent + ' (' + WELD_RANGES[k][0] + '…' + WELD_RANGES[k][1] + ')');
          else if (raw !== M.clamp(raw, WELD_RANGES[k][0], WELD_RANGES[k][1])) bad.push(fields[k].querySelector('.fld-label').textContent + ' → ' + M.clamp(raw, WELD_RANGES[k][0], WELD_RANGES[k][1]));
        }
        const v = coerceLike(prev, o, WELD_RANGES, { type: WELD_TYPES });
        if (!v.pipe) v.wt = v.T; else v.T = v.wt;
        for (const k of Object.keys(fields)) { fields[k].input.value = v[k]; fields[k].input.classList.remove('invalid'); }
        odIn.input.value = inchOf(v.od);
        msg.textContent = bad.length ? 'Invalid entries were reset / clamped: ' + bad.join(', ') + '  (잘못된 값은 이전 값으로 되돌리거나 범위로 제한했습니다)' : '';
        Object.assign(o, v);
        return v;
      };
      const apply = function () {
        const v = validate();
        Object.assign(prev, v);
        UT.setIn('weldOpts', Object.assign({}, v), { noRender: true });
        reenterWeldLike();
        syncPipe3d();
      };
      return h('div', {}, [
        h('div', { class: 'fld-grid' }, [
          nf('T', 'Thickness T', { step: 0.5, unit: 'mm', onchange: function (v) { o.T = v; if (!o.pipe) o.wt = v; } }),
          UT.dom.field('Weld type', { tag: 'select', type: 'text', value: o.type, options: [{ value: 'single-v', label: 'Single-V' }, { value: 'double-v', label: 'Double-V' }, { value: 'none', label: 'No weld (plain plate)' }], onchange: set('type') }),
          nf('bevel', 'Bevel angle', { step: 1, unit: '°' }),
          nf('rootGap', 'Root gap', { step: 0.5, unit: 'mm' }),
          nf('rootFace', 'Root face', { step: 0.5, unit: 'mm' }),
          nf('capWidth', 'Cap width', { step: 1, unit: 'mm' }),
          nf('capHeight', 'Cap height', { step: 0.5, unit: 'mm' }),
          nf('rootHeight', 'Root height', { step: 0.5, unit: 'mm' }),
          nf('L', 'Plate length L', { step: 10, unit: 'mm' }),
        ]),
        pipeChk, pipeBox, msg,
        h('div', { class: 'dlg-note' }, '용접부 두께·형상·파이프 치수를 설정합니다. Apply/OK re-builds the specimen (defects are kept).'),
        h('div', { class: 'btn-row' }, [
          UT.dom.button('Apply', apply), UT.dom.button('OK', function () { apply(); win.close(); }, { class: 'btn primary' }), UT.dom.button('Cancel', function () { win.close(); }),
        ]),
      ]);
    });
  }

  /** Snell helper for the wedge dialog: wedge angle → {refracted, mode, beyond}. */
  function wedgeToRefracted(wedgeDeg, vW, mat) {
    const vC = (mat && mat.vComp) || UT.consts.V_COMP_STEEL, vS = (mat && mat.vShear) || UT.consts.V_SHEAR_STEEL;
    const crit = UT.probe.criticalAngles(vW, mat);
    if (wedgeDeg <= 0.001) return { refracted: 0, mode: 'comp', crit, beyond: false };
    if (wedgeDeg < crit.first) { const a = M.snellAngle(wedgeDeg, vW, vC); return { refracted: a === null ? 89.9 : a, mode: 'comp', crit, beyond: false, shearToo: M.snellAngle(wedgeDeg, vW, vS) }; }
    if (wedgeDeg < crit.second) { const a = M.snellAngle(wedgeDeg, vW, vS); return { refracted: a === null ? 89.9 : a, mode: 'shear', crit, beyond: false }; }
    return { refracted: 90, mode: 'shear', crit, beyond: true };
  }
  /** Probe patch for a refracted angle: snaps to the 45/60/70 presets, else a custom angle (0.1° steps). */
  function probePatchFor(refracted, mode) {
    let a = +refracted.toFixed(1);
    for (const p of [45, 60, 70]) if (Math.abs(refracted - p) < 0.05) a = p;
    if (a <= 0.05) return { angle: 0, mode: 'comp' };
    return { angle: a, mode: mode === 'comp' ? 'comp' : 'shear' };
  }
  /** "Adjust Angle in Wedge (Shoe)" dialog: wedge angle ↔ refracted angle with both critical angles. */
  function openWedge() {
    dialog('wedge', 'Adjust Angle in Wedge (Shoe)', 460, function (win) {
      const p = st().probe;
      const mat = st().specimen && st().specimen.material;
      const s = { vW: p.wedgeVel || UT.consts.V_PERSPEX, wedge: 0 };
      const d0 = has('probe.derive') ? UT.probe.derive(p, st().specimen) : null;
      s.wedge = d0 ? +d0.wedgeAngle.toFixed(1) : 0;
      const readout = h('div', { class: 'wedge-readout' }, '');
      const scale = h('div', { class: 'wedge-scale' });
      const slider = UT.dom.field('Angle in wedge (shoe)', { type: 'range', value: s.wedge, min: 0, max: 80, step: 0.1, event: 'input', onchange: function (v) { s.wedge = parseFloat(v); fromWedge(true); } });
      const refIn = UT.dom.field('Refracted angle in steel', { type: 'number', value: 0, min: 0, max: 89, step: 0.5, event: 'input', onchange: function (v) { if (Number.isFinite(v)) fromRefracted(v); } });
      const matSel = UT.dom.field('Wedge material', { tag: 'select', type: 'text', value: String(s.vW), options: [{ value: '2.74', label: 'Perspex 2740 m/s' }, { value: '2.33', label: 'Rexolite 2330 m/s' }, { value: '2.35', label: 'Polystyrene 2350 m/s' }], onchange: function (v) { s.vW = parseFloat(v); fromWedge(true); } });
      const setProbe = function (r) {
        const patch = probePatchFor(r.beyond ? 90 : r.refracted, r.mode);
        patch.wedgeVel = s.vW;
        UT.setIn('probe', patch);
        refreshToolbar();
      };
      const show = function (r) {
        const crit = r.crit;
        const pct = function (a) { return M.clamp(a / 80 * 100, 0, 100); };
        scale.textContent = '';
        scale.style.background = 'linear-gradient(90deg,#cfe8ff 0 ' + pct(crit.first) + '%,#d8f5d0 ' + pct(crit.first) + '% ' + pct(crit.second) + '%,#f5d0d0 ' + pct(crit.second) + '%)';
        scale.appendChild(h('span', { style: { left: pct(crit.first / 2) + '%' } }, 'compression'));
        scale.appendChild(h('span', { style: { left: pct((crit.first + crit.second) / 2) + '%' } }, 'shear'));
        scale.appendChild(h('span', { style: { left: pct((crit.second + 80) / 2) + '%' } }, 'surface'));
        scale.appendChild(h('div', { class: 'crit', style: { left: pct(crit.first) + '%' } }));
        scale.appendChild(h('div', { class: 'crit', style: { left: pct(crit.second) + '%' } }));
        const vC = ((mat && mat.vComp) || UT.consts.V_COMP_STEEL) * 1000, vS = ((mat && mat.vShear) || UT.consts.V_SHEAR_STEEL) * 1000;
        readout.textContent =
          'Wedge angle            : ' + s.wedge.toFixed(1) + '°   (wedge velocity ' + Math.round(s.vW * 1000) + ' m/s)\n' +
          '1st critical angle     : ' + crit.first.toFixed(1) + '°   (compression wave, ' + Math.round(vC) + ' m/s)\n' +
          '2nd critical angle     : ' + crit.second.toFixed(1) + '°   (shear wave, ' + Math.round(vS) + ' m/s)\n' +
          (r.beyond ? 'Beyond 2nd critical: surface (Rayleigh) wave only — no bulk wave in steel\n'
            : (r.mode === 'comp' ? 'Compression wave angle : ' + r.refracted.toFixed(1) + '°' + (r.shearToo !== null && r.shearToo !== undefined ? '   (shear also present at ' + r.shearToo.toFixed(1) + '°)' : '') + '\n'
              : 'Shear wave angle       : ' + r.refracted.toFixed(1) + '°   (compression wave totally reflected)\n')) +
          'sin(θ wedge)/v wedge = sin(θ steel)/v steel   (Snell)';
        readout.classList.toggle('dlg-warn', !!r.beyond);
      };
      const fromWedge = function (apply) {
        const r = wedgeToRefracted(s.wedge, s.vW, mat);
        refIn.input.value = r.beyond ? 90 : r.refracted.toFixed(1);
        slider.input.value = s.wedge;
        show(r);
        if (apply) setProbe(r);
      };
      const fromRefracted = function (a) {
        const mode = a > 0 && st().probe.mode === 'comp' && a < 90 ? 'comp' : 'shear';
        s.wedge = +UT.probe.wedgeAngleFor(M.clamp(a, 0, 89.9), mode, s.vW, mat).toFixed(1);
        const r = wedgeToRefracted(s.wedge, s.vW, mat);
        slider.input.value = s.wedge;
        show(r);
        setProbe(r);
      };
      const presetBtn = function (a) { return UT.dom.button(a + '°', function () { setAngle(a); s.wedge = +UT.probe.derive(st().probe, st().specimen).wedgeAngle.toFixed(1); fromWedge(false); }, { class: 'btn small' }); };
      fromWedge(false);
      return h('div', {}, [
        matSel, slider, scale, refIn, readout,
        h('div', { class: 'dlg-note' }, '슬라이더로 웨지 각도를 바꾸면 스넬의 법칙에 따라 강재 내 굴절각과 파 모드(종파/횡파)가 즉시 바뀝니다. 상태 표시줄의 물리 라인을 확인하세요.'),
        h('div', { class: 'btn-row' }, [presetBtn(0), presetBtn(45), presetBtn(60), presetBtn(70), UT.dom.button('Close', function () { win.close(); }, { class: 'btn primary' })]),
      ]);
    });
  }

  /** Options dialog (UT set, units, colour code, skips, view toggles, language). */
  function openOptions() {
    dialog('options', 'Options', 400, function (win) {
      const s = st();
      const sel = function (label, value, options, onchange) { return UT.dom.field(label, { tag: 'select', type: 'text', value, options, onchange }); };
      const chk = function (label, value, onchange) { return UT.dom.field(label, { type: 'checkbox', value, onchange }); };
      return h('div', {}, [
        sel('UT Set', s.utSet, [{ value: 'epoch600', label: 'EPOCH 600' }, { value: 'epoch4', label: 'EPOCH 4 (ASME text screen)' }, { value: 'usk7', label: 'Krautkrämer USK 7 (analogue)' }], setUtSet),
        sel('Units', s.display.units || 'mm', [{ value: 'mm', label: 'mm' }, { value: 'inch', label: 'inch' }], function (v) { setDisplay({ units: v }); }),
        sel('Colour code', s.display.colourCode || 'none', [{ value: 'none', label: 'None' }, { value: 'propagation', label: 'Mode propagation (leg colours)' }, { value: 'geometry', label: 'Geometry (last surface)' }], function (v) { setDisplay({ colourCode: v }); }),
        sel('Number of skips', String(s.display.skips || 3), [1, 2, 3, 4].map(function (n) { return { value: String(n), label: String(n) }; }), function (v) { setDisplay({ skips: parseInt(v, 10) }); }),
        chk('Show plan view', s.display.plan !== false, function (v) { setDisplay({ plan: v }); applyLayout(); }),
        chk('Show 3D window', s.display.pipe3d !== false, function (v) { setDisplay({ pipe3d: v }); syncPipe3d(); }),
        chk('Show legend', s.display.legend !== false, function (v) { setDisplay({ legend: v }); }),
        chk('Show beam', s.display.beam !== false, function (v) { setDisplay({ beam: v }); }),
        chk('Auto trig (angle/thickness follow probe)', s.display.autoTrig !== false, function (v) { setDisplay({ autoTrig: v }); }),
        sel('Language / 언어', mem.lang, [{ value: 'en', label: 'English' }, { value: 'ko', label: '한국어 (Korean)' }], function (v) { app.setLang(v); }),
        h('div', { class: 'btn-row' }, [UT.dom.button('Reset Layout', resetLayout), UT.dom.button('Close', function () { win.close(); }, { class: 'btn primary' })]),
      ]);
    });
  }

  /** Step wedge dialog: choose a step set and enter step mode. */
  function openStepWedge() {
    dialog('stepwedge', 'Step Wedge', 380, function (win) {
      const s = { choice: 'a', custom: '5, 10, 15, 20, 25', stepLen: 40 };
      const sp = st().specimen;
      if (currentMode() === 'step' && sp && Array.isArray(sp.steps)) { s.custom = sp.steps.join(', '); s.choice = 'c'; }
      const radio = function (val, label) {
        const inp = h('input', { type: 'radio', name: 'stepset', value: val, checked: s.choice === val ? true : null, onchange: function () { s.choice = val; } });
        return h('label', { class: 'fld' }, [inp, h('span', {}, label)]);
      };
      const customIn = UT.dom.field('Custom steps (mm)', { type: 'text', value: s.custom, event: 'input', onchange: function (v) { s.custom = v; s.choice = 'c'; win.body.querySelector('input[value=c]').checked = true; } });
      const lenIn = numField('Step length', { value: s.stepLen, min: 10, max: 200, step: 5, unit: 'mm', onchange: function (v) { s.stepLen = v; } });
      const ok = function () {
        const steps = s.choice === 'a' ? [5, 10, 15, 20, 25] : s.choice === 'b' ? [10, 20, 30, 40, 50] : parseSteps(s.custom);
        if (steps.length < 2) { UT.dom.alert('Enter at least two step thicknesses, e.g. 5, 10, 15, 20, 25', 'Step Wedge'); return; }
        win.close();
        enterStep(steps, s.stepLen);
      };
      return h('div', {}, [
        radio('a', 'Steps 5, 10, 15, 20, 25 mm'), radio('b', 'Steps 10, 20, 30, 40, 50 mm'), radio('c', 'Custom'),
        customIn, lenIn,
        h('div', { class: 'dlg-note' }, '스텝 웨지(계단 시험편)를 선택하고 0° 탐촉자로 범위/영점 교정(Auto Cal)을 연습합니다.'),
        h('div', { class: 'btn-row' }, [UT.dom.button('OK', ok, { class: 'btn primary' }), UT.dom.button('Cancel', function () { win.close(); })]),
      ]);
    });
  }

  function textWin(name, title, w, nodes) { dialog(name, title, w, function (win) { return h('div', { class: 'dlg-text' }, nodes.concat([h('div', { class: 'btn-row' }, [UT.dom.button('Close', function () { win.close(); }, { class: 'btn primary' })])])); }); }
  function openAbout() {
    textWin('about', 'About UTsim', 520, [
      h('h3', {}, 'UTsim v' + UT.VERSION + ' — UTman-style Ultrasonic Weld Testing Simulator'),
      h('p', {}, 'An independent, open re-implementation inspired by the UTman ultrasonic simulator (utsim.co.uk) by Paul Rawlinson. Not affiliated with, endorsed by, or derived from the original software; all code and artwork are original and drawn with Canvas 2D/CSS.'),
      h('p', { class: 'ko' }, 'UTsim은 Paul Rawlinson의 UTman 초음파 시뮬레이터(utsim.co.uk)에서 영감을 받아 독립적으로 재구현한 교육용 소프트웨어입니다. 원저작자와 무관하며, 모든 코드는 새로 작성되었습니다.'),
      h('p', {}, 'Physics: 2-D polygon ray tracing (fan of 21 rays, up to 4 skips), Snell refraction in the Perspex wedge, near field / beam spread, DAC, TOFD tip diffraction, AUT strip charts. Instruments: EPOCH 600, EPOCH 4 and USK 7 skins.'),
      h('p', {}, 'Single-file HTML, no network, no external libraries. Settings persist in this browser only.'),
    ]);
  }
  function openGuide() {
    textWin('guide', 'Quick Guide / 빠른 안내', 600, [
      h('h3', {}, '1. Layout / 화면 구성'),
      h('p', {}, 'Left: the flaw detector (EPOCH 600 by default). Right: plan view with the skew compass. Below: the X ruler and the cross-section with the probe, beam and defects. Status bar: wedge/refracted angle physics line, probe position, range, gain and hints.'),
      h('p', { class: 'ko' }, '왼쪽은 탐상기(EPOCH 600), 오른쪽은 평면도(스큐 나침반 포함), 아래는 X 눈금자와 단면도입니다. 상태 표시줄에 웨지 각도·굴절각·위치·범위·감도가 표시됩니다.'),
      h('h3', {}, '2. Moving the probe / 탐촉자 이동'),
      h('p', {}, 'Left-drag in the cross-section or plan view (Shift-drag = along the weld). Arrow keys move 1 mm (Shift 10 mm). Drag the red needle of the compass to skew the probe.'),
      h('p', { class: 'ko' }, '단면도나 평면도에서 마우스 왼쪽 버튼으로 드래그하세요(Shift+드래그 = 용접선 방향). 화살표 키 1 mm(Shift 10 mm). 나침반 바늘을 끌면 스큐가 바뀝니다.'),
      h('h3', {}, '3. Instrument / 탐상기'),
      h('p', {}, 'Click a softkey (Gain, Range, Delay, …) then use ▲▼ or the mouse wheel over the instrument. The dB softkeys set 10/20/30/40/60 dB. RANGE cycles 50/100/200/400 mm. GATES selects gate 1/2. PEAK MEM, Freeze, Auto Cal on the step wedge.'),
      h('p', { class: 'ko' }, '소프트키(Gain, Range, Delay …)를 누른 뒤 ▲▼ 또는 마우스 휠로 값을 바꿉니다. dB 소프트키는 감도를 10/20/30/40/60 dB로 설정합니다.'),
      h('h3', {}, '4. Toolbar / 도구 모음'),
      h('p', {}, '0°/45°/60°/70° probes · V2/V1 calibration blocks · DAC bar (record points, draw curves) · PLOT beam spread on the IOW block · DAMP · SIZE (6 dB / 20 dB drop) · DEFECT editor (draw with the mouse) · HIDE (blind practice) · CLEAR · BEAM · RAD radiograph · PIPE (plate ⇄ pipe + 3D window) · TKY · TOFD · AUT.'),
      h('p', { class: 'ko' }, '0°/45°/60°/70° 탐촉자 · V2/V1 교정 시험편 · DAC · PLOT(빔 확산) · DAMP · SIZE(6/20 dB 드롭) · DEFECT(결함 그리기) · HIDE(블라인드 연습) · CLEAR · BEAM · RAD(방사선 필름) · PIPE(3D 창) · TKY · TOFD · AUT.'),
      h('h3', {}, '5. Lessons & Trade Test / 레슨과 실기 시험'),
      h('p', {}, 'Help ▸ Lessons lists the 22 UTman video lessons; each loads its scenario and shows the steps. Defects ▸ Trade Test hides random defects for you to find, size and report.'),
      h('p', { class: 'ko' }, '도움말 ▸ 레슨에서 22개의 UTman 영상 레슨 시나리오를 불러올 수 있습니다. 결함 ▸ 실기 시험은 숨겨진 결함을 찾아 보고하고 채점합니다.'),
    ]);
  }
  function openKeys() {
    const rows = [
      ['← / →', 'Move probe 1 mm (Shift: 10 mm) / 탐촉자 이동'], ['↑ / ↓', 'Move probe along the weld (z) / 용접선 방향 이동'],
      ['+ / −', 'Gain ±1 dB (Shift: ±6 dB) / 감도'], ['R', 'Range 50 → 100 → 200 → 400 mm / 범위'], ['F', 'Freeze / 화면 고정'], ['P', 'Peak memory / 피크 메모리'],
      ['H', 'Hide defects & beam / 결함·빔 숨기기'], ['B', 'Beam on/off / 빔 표시'], ['1 2 3 4', 'Probe 0° / 45° / 60° / 70° / 탐촉자 선택'], ['Esc', 'Close the top window or menu / 창 닫기'],
      ['▲▼◀▶ (instrument focused)', 'Adjust the selected instrument parameter / 선택한 파라미터 조정'], ['Mouse wheel', 'Over the cross-section: gain ±1 dB; over the instrument: selected parameter'],
    ];
    textWin('keys', 'Keyboard Shortcuts', 520, [h('table', {}, rows.map(function (r) { return h('tr', {}, [h('td', {}, h('kbd', {}, r[0])), h('td', {}, r[1])]); }))]);
  }
  /** Export dialog: shows a canvas as a PNG data URL inside an <img> (no download links). */
  function openExport(canvasId) {
    dialog('export', 'Export PNG', 760, function (win) {
      const img = h('img', { class: 'export-img', alt: 'export' });
      const note = h('div', { class: 'dlg-note' }, 'Right-click the image and choose "Save image as…" / 이미지를 우클릭하여 저장하세요.');
      const load = function (id) {
        const cv = byId(id);
        if (!cv || typeof cv.toDataURL !== 'function') { note.textContent = 'Canvas #' + id + ' is not available.'; img.removeAttribute('src'); return; }
        try { img.src = cv.toDataURL('image/png'); note.textContent = 'Right-click the image and choose "Save image as…" / 이미지를 우클릭하여 저장하세요.  (' + id + ')'; }
        catch (e) { note.textContent = 'Export failed: ' + e.message; }
      };
      load(canvasId || 'cv-ascan');
      return h('div', {}, [
        h('div', { class: 'btn-row left' }, [
          UT.dom.button('A-scan', function () { load('cv-ascan'); }, { class: 'btn small' }),
          UT.dom.button('Cross section', function () { load('cv-cross'); }, { class: 'btn small' }),
          UT.dom.button('Plan view', function () { load('cv-plan'); }, { class: 'btn small' }),
        ]),
        img, note,
        h('div', { class: 'btn-row' }, [UT.dom.button('Close', function () { win.close(); }, { class: 'btn primary' })]),
      ]);
    });
  }
  function openExportDefects() {
    dialog('export-defects', 'Export Defects', 520, function (win) {
      const ta = h('textarea', { class: 'dlg-textarea', readonly: true });
      ta.value = JSON.stringify(st().defects, null, 1);
      return h('div', {}, [h('div', { class: 'dlg-note' }, 'Copy this JSON to keep the defects (Defects ▸ Import Defects… pastes it back). / JSON을 복사해 두세요.'), ta,
        h('div', { class: 'btn-row' }, [UT.dom.button('Select all', function () { ta.select(); }), UT.dom.button('Close', function () { win.close(); }, { class: 'btn primary' })])]);
    });
  }
  function openImportDefects() {
    dialog('import-defects', 'Import Defects', 520, function (win) {
      const ta = h('textarea', { class: 'dlg-textarea', placeholder: '[ { "type": "planar", "pts": [ {"x": 0, "y": 17}, {"x": 0, "y": 20} ], "zFrom": 120, "zTo": 150 } ]' });
      const doImport = function () {
        try {
          const arr = JSON.parse(ta.value);
          if (!Array.isArray(arr)) throw new Error('expected a JSON array');
          if (has('modes.setDefects')) UT.modes.setDefects(arr);
          else UT.set({ defects: limitDefectSlots(arr) });
          win.close();
        } catch (e) { UT.dom.alert('Invalid defect JSON: ' + e.message, 'Import Defects'); }
      };
      return h('div', {}, [h('div', { class: 'dlg-note' }, 'Paste defect JSON (as produced by Export Defects / Save Def). / 결함 JSON을 붙여넣으세요.'), ta,
        h('div', { class: 'btn-row' }, [UT.dom.button('Import', doImport, { class: 'btn primary' }), UT.dom.button('Cancel', function () { win.close(); })])]);
    });
  }

  // ------------------------------------------------------------------ file menu / layout reset
  function fileNew() {
    confirmDlg('Reset everything to the default setup? (defects, probe, instrument, weld)', { title: 'New' }).then(function (ok) {
      if (!ok) return;
      try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
      mem.suspendSave = true;
      const def = UT.defaultState();
      UT.set(def, { noRender: true });
      mem.suspendSave = false;
      enterMode('weld', { keepProbe: false });
      if (!st().specimen) enterMode('weld');
      call('instruments.setSkin', [st().utSet]);
      applyLayout();
      refreshToolbar();
      UT.renderNow();
    });
  }
  function fileLoad() {
    const patch = restore();
    if (!patch) { UT.dom.alert('No saved setup found in this browser.\n저장된 설정이 없습니다.', 'Load Setup'); return; }
    UT.set(patch, { noRender: true });
    enterMode('weld', { keepProbe: true });
    call('instruments.setSkin', [st().utSet]);
    applyLayout();
    refreshToolbar();
    UT.renderNow();
  }
  function resetLayout() {
    for (const k of Object.keys(UT.dom.wins)) { const w = UT.dom.wins[k]; if (w && w.isOpen() && !w.el.classList.contains('modal')) { try { w.close(); } catch (e) { /* ignore */ } } }
    const d = UT.defaultState().display;
    setDisplay({ plan: d.plan, pipe3d: d.pipe3d, legend: d.legend, beam: d.beam, hide: false });
    if (st().utSet === 'usk7') call('instruments.setSkin', ['usk7']);
    syncPipe3d();
    applyLayout();
    refreshToolbar();
  }

  // ------------------------------------------------------------------ language
  /**
   * Switch UI language ('en' | 'ko'): relabels the menus, re-renders the status hints, emits 'lang'.
   * @param {string} lang
   */
  function setLang(lang) {
    const l = lang === 'ko' ? 'ko' : 'en';
    mem.lang = l;
    if (UT.i18n) UT.i18n.lang = l;
    const d = doc();
    if (d && mem.built) {
      for (const el of d.querySelectorAll('#menubar [data-key].menu-label')) el.textContent = t(el.dataset.key);
      for (const def of TOOLBAR) if (!def.gap && mem.tb['tb-' + def.id]) mem.tb['tb-' + def.id].title = tbTitle(def);
      closeMenus();
      renderStatus(st().status);
    }
    UT.bus.emit('lang', l);
    scheduleSave(['lang']);
  }

  // ------------------------------------------------------------------ persistence
  /** Build the JSON-serialisable persistence record for a state (pure; used by saveNow and __selftest). */
  function buildSavePatch(s, lang) {
    const ins = {};
    for (const k of INSTR_KEYS) if (s.instrument && s.instrument[k] !== undefined) ins[k] = s.instrument[k];
    return UT.clone({ v: 1, probe: s.probe, instrument: ins, display: s.display, defects: s.defects || [], weldOpts: s.weldOpts, utSet: s.utSet, lang: lang || 'en' });
  }
  /** Finite number from a stored value (number or numeric string), else `def`. */
  function num(v, def) {
    const n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? +v : NaN);
    return Number.isFinite(n) ? n : def;
  }
  /** Finite number clamped to [lo, hi]; non-numeric → `def` (then clamped). */
  function numIn(v, def, lo, hi) { return M.clamp(num(v, def), lo, hi); }
  // Stored-record validation ranges (same limits as the Weld / wedge dialogs and instrument softkeys).
  const WELD_RANGES = { T: [3, 100], L: [50, 2000], bevel: [0, 60], rootGap: [0, 10], rootFace: [0, 10], capWidth: [0, 60], capHeight: [0, 10], rootHeight: [0, 10], od: [25, 2000], wt: [3, 100] };
  const WELD_TYPES = ['single-v', 'double-v', 'none'];
  const PROBE_RANGES = { angle: [0, 89.9], freq: [0.5, 20], diameter: [1, 50], wedgeVel: [1, 6], x: [-3000, 3000], z: [-5000, 5000], skew: [-360, 360], paFrom: [0, 89.9], paTo: [0, 89.9], paStep: [0.1, 10] };
  const PROBE_ENUMS = { mode: ['shear', 'comp'], crystal: ['single', 'twin'], method: ['pe', 'tt', 'tandem', 'pa'], surface: ['chord', 'brace'] };
  const DISPLAY_RANGES = { skips: [1, 12] };
  const DISPLAY_ENUMS = { units: ['mm', 'inch'] };
  const RECTIFY = ['full', 'rf', 'pos', 'neg'];
  /**
   * Coerce `rec` onto the shape of `def`: every key of `def` keeps its default type (boolean → !!,
   * number → finite & clamped to ranges[k], string → one of enums[k] when given), unknown keys are dropped.
   */
  function coerceLike(def, rec, ranges, enums) {
    const out = {};
    const src = rec && typeof rec === 'object' ? rec : {};
    for (const k of Object.keys(def)) {
      const d = def[k], v = src[k];
      if (typeof d === 'boolean') out[k] = v === undefined ? d : !!v;
      else if (typeof d === 'number') { const r = (ranges && ranges[k]) || [-1e6, 1e6]; out[k] = numIn(v, d, r[0], r[1]); }
      else if (typeof d === 'string') out[k] = typeof v === 'string' && (!enums || !enums[k] || enums[k].indexOf(v) >= 0) && v.length <= 40 ? v : d;
      else out[k] = v === undefined ? d : v;
    }
    return out;
  }
  function coerceGate(g, d) {
    const s = g && typeof g === 'object' ? g : {};
    return { on: s.on === undefined ? !!d.on : !!s.on, start: numIn(s.start, d.start, -50, 1000), width: numIn(s.width, d.width, 0, 1000), level: numIn(s.level, d.level, 0, 100), alarm: !!s.alarm };
  }
  /** Turn a stored record into a UT.set patch (validated, merged over the defaults); null when unusable. */
  function patchFromRecord(rec) {
    if (!rec || typeof rec !== 'object' || rec.v !== 1) return null;
    const def = UT.defaultState();
    const patch = {};
    if (rec.probe && typeof rec.probe === 'object') {
      const pr = coerceLike(def.probe, rec.probe, PROBE_RANGES, PROBE_ENUMS);
      pr.side = num(rec.probe.side, 1) < 0 ? -1 : 1;
      if (pr.angle === 0) pr.mode = 'comp';
      patch.probe = pr;
    }
    if (rec.instrument && typeof rec.instrument === 'object') {
      const ins = Object.assign({}, def.instrument);
      const ri = rec.instrument;
      for (const k of INSTR_KEYS) if (ri[k] !== undefined) ins[k] = ri[k];
      ins.gain = numIn(ins.gain, def.instrument.gain, 0, 110);
      ins.refGain = numIn(ins.refGain, ins.gain, 0, 110);
      ins.range = numIn(ins.range, def.instrument.range, 10, 1000);
      ins.delay = numIn(ins.delay, def.instrument.delay, -50, 1000);
      ins.reject = numIn(ins.reject, def.instrument.reject, 0, 80);
      ins.damping = !!ins.damping;
      if (RECTIFY.indexOf(ins.rectify) < 0) ins.rectify = def.instrument.rectify;
      const defGates = def.instrument.gates;
      ins.gates = (Array.isArray(ins.gates) && ins.gates.length >= 2 ? ins.gates : defGates).map(function (g, i) { return coerceGate(g, defGates[Math.min(i, defGates.length - 1)]); });
      const dac = ins.dac && typeof ins.dac === 'object' ? ins.dac : def.instrument.dac;
      ins.dac = {
        points: (Array.isArray(dac.points) ? dac.points : []).filter(function (p) { return p && Number.isFinite(p.path) && Number.isFinite(p.ampPct); }).map(function (p) { return { path: p.path, ampPct: p.ampPct }; }),
        on: !!dac.on, refDb: Number.isFinite(dac.refDb) ? M.clamp(dac.refDb, 0, 110) : null, curves: dac.curves === undefined ? true : !!dac.curves,
      };
      const cal = ins.cal && typeof ins.cal === 'object' ? ins.cal : def.instrument.cal;
      ins.cal = { vel: Number.isFinite(cal.vel) ? M.clamp(cal.vel, 1, 10) : null, zero: numIn(cal.zero, 0, -50, 50) };
      ins.trig = coerceLike(def.instrument.trig, ins.trig, { angle: [0, 89.9], thick: [1, 1000], xValue: [-3000, 3000] });
      patch.instrument = ins;
    }
    if (rec.display && typeof rec.display === 'object') patch.display = coerceLike(def.display, rec.display, DISPLAY_RANGES, DISPLAY_ENUMS);
    if (Array.isArray(rec.defects)) patch.defects = limitDefectSlots(rec.defects);
    if (rec.weldOpts && typeof rec.weldOpts === 'object') patch.weldOpts = coerceLike(def.weldOpts, rec.weldOpts, WELD_RANGES, { type: WELD_TYPES });
    if (rec.utSet === 'epoch600' || rec.utSet === 'epoch4' || rec.utSet === 'usk7') patch.utSet = rec.utSet;
    if (rec.lang === 'ko' || rec.lang === 'en') patch.__lang = rec.lang;
    return patch;
  }
  function restore() {
    try {
      if (typeof localStorage === 'undefined') return null;
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      const patch = patchFromRecord(JSON.parse(raw));
      if (patch && patch.__lang) { mem.lang = patch.__lang; if (UT.i18n) UT.i18n.lang = patch.__lang; delete patch.__lang; }
      return patch;
    } catch (e) { console.warn('[UT.app] restore failed', e); return null; }
  }
  /** Write the persistence record now (no debounce). Skipped while a trade test is active. */
  function saveNow() {
    if (mem.saveTimer) { clearTimeout(mem.saveTimer); mem.saveTimer = null; }
    if (st().trade && st().trade.active) return false;
    try {
      if (typeof localStorage === 'undefined') return false;
      localStorage.setItem(STORE_KEY, JSON.stringify(buildSavePatch(st(), mem.lang)));
      return true;
    } catch (e) { console.warn('[UT.app] save failed', e); return false; }
  }
  function scheduleSave(keys) {
    if (mem.suspendSave || !mem.booted) return;
    if (!keys.some(function (k) { return PERSIST_KEYS.indexOf(k) >= 0 || k === 'lang'; })) return;
    if (st().trade && st().trade.active) return;
    if (mem.saveTimer) clearTimeout(mem.saveTimer);
    mem.saveTimer = setTimeout(function () { mem.saveTimer = null; saveNow(); }, 500);
  }

  // ------------------------------------------------------------------ boot
  function runSelftests() {
    const out = {};
    for (const k of Object.keys(UT)) {
      const m = UT[k];
      if (m && typeof m.__selftest === 'function') { try { out[k] = m.__selftest(); } catch (e) { out[k] = ['exception ' + e.message]; } }
      if (k === 'views' && m) for (const v of Object.keys(m)) if (m[v] && typeof m[v].__selftest === 'function') { try { out['views.' + v] = m[v].__selftest(); } catch (e) { out['views.' + v] = ['exception ' + e.message]; } }
    }
    for (const k of Object.keys(out)) console.log('[selftest] ' + k + ': ' + (out[k].length ? 'FAIL ' + JSON.stringify(out[k]) : 'ok'));
    return out;
  }
  /**
   * Boot sequence (§15.9): restore → buildLayout → instruments.mount → view inits → enter weld → renderNow.
   * Safe to call once; guarded against missing modules.
   */
  function boot() {
    if (mem.booted) return;
    UT.i18n && UT.i18n.add && UT.i18n.add('ko', KO);
    let patch = null;
    try { patch = restore(); } catch (e) { patch = null; }
    if (patch) { try { UT.set(patch, { silent: true, noRender: true }); } catch (e) { console.warn('[UT.app] restore apply failed', e); } }
    buildLayout();
    try { if (has('instruments.mount')) UT.instruments.mount(mem.els.instrument); } catch (e) { console.error('[UT.app] instruments.mount', e); }
    try { if (has('views.cross.init')) UT.views.cross.init(mem.els.cvCross); } catch (e) { console.error('[UT.app] views.cross.init', e); }
    try { if (has('views.cross.initRuler')) UT.views.cross.initRuler(mem.els.cvRuler); } catch (e) { console.error('[UT.app] views.cross.initRuler', e); }
    try { if (has('views.plan.init')) UT.views.plan.init(mem.els.cvPlan); } catch (e) { console.error('[UT.app] views.plan.init', e); }
    try { if (has('views.plotter.init')) UT.views.plotter.init(mem.els.cvPlotter); } catch (e) { console.error('[UT.app] views.plotter.init', e); }
    try { if (has('views.pipe3d.init')) UT.views.pipe3d.init(); } catch (e) { console.error('[UT.app] views.pipe3d.init', e); }
    mem.booted = true;
    try { enterMode('weld', { keepProbe: true }); } catch (e) { console.error('[UT.app] modes.enter', e); }
    if (!st().specimen && has('specimens.plateWeld')) {
      const o = st().weldOpts || {};
      UT.set({ specimen: o.pipe && UT.specimens.pipeWeld ? UT.specimens.pipeWeld(o) : UT.specimens.plateWeld(o) }, { noRender: true });
    }
    syncPipe3d();
    applyLayout();
    refreshToolbar();
    try { UT.renderNow(); } catch (e) { console.error('[UT.app] renderNow', e); }
    renderStatus(st().status);
    if (typeof location !== 'undefined' && location.hash === '#selftest') runSelftests();
  }

  // ------------------------------------------------------------------ public API + test API
  Object.assign(app, {
    boot, buildLayout, setLang, saveNow, applyLayout, refreshToolbar, menuByPath, activateToolbar, runSelftests,
    toolbarIds: TB_IDS, restore, patchFromRecord, buildSavePatch, parseSteps, wedgeToRefracted, probePatchFor, OD_INCH,
    openWeld, openWedge, openOptions, openStepWedge, openAbout, openGuide, openKeys, openExport, closeMenus,
    /** Headless self test (pure helpers only). */
    __selftest() {
      const f = [];
      try {
        const probes = menuModel().find(function (m) { return m.id === 'menu-probes'; }).items.map(function (i) { return i.key; });
        const want = ['Adjust Angle in Wedge (Shoe)', 'Zero Probe - Twin or Single Crystal', 'Pulse Echo', 'Through Transmission', 'Tandem (pitch catch)', '2.5 MHz Frequency', '5 MHz Frequency', 'Probe Diameter 10mm', 'Probe Diameter 5mm', 'Phased Array Probe', 'Colour Code Display', 'Number of Skips', 'Single Line Beam', 'Focus Beam'];
        if (probes.join('|') !== want.join('|')) f.push('Probes menu order: ' + probes.join('|'));
        const ids = menuModel().map(function (m) { return m.id; }).join(',');
        if (ids !== 'menu-file,menu-probes,menu-stepwedge,menu-weld,menu-defects,menu-options,menu-help') f.push('menu ids ' + ids);
        if (TB_IDS.length !== 19 || TB_IDS[0] !== 'tb-0' || TB_IDS[18] !== 'tb-aut') f.push('toolbar ids ' + TB_IDS.join(','));
        const rec = buildSavePatch(UT.defaultState(), 'ko');
        if (rec.v !== 1 || rec.instrument.freeze !== undefined || rec.instrument.gain !== 30 || rec.lang !== 'ko') f.push('buildSavePatch');
        const p = patchFromRecord(rec);
        if (!p || p.instrument.gain !== 30 || p.utSet !== 'epoch600' || p.__lang !== 'ko' || !p.probe) f.push('patchFromRecord');
        if (patchFromRecord({ v: 2 }) !== null || patchFromRecord('x') !== null) f.push('patchFromRecord rejects');
        const bad = patchFromRecord({ v: 1, weldOpts: { T: 1e7, L: 'huge', bevel: -5, type: 'zigzag', pipe: 1, W: 1e9 }, instrument: { range: 0, delay: 'x', reject: -3, rectify: 'odd', gates: [{ start: 'a' }, null, { on: 1, level: 500 }], cal: { vel: 'v', zero: 1e9 } }, probe: { angle: 'x', x: 1e9, side: -2, method: 'bogus' }, display: { skips: 99, units: 'furlong', plan: 0 } });
        const bw = bad.weldOpts, bi = bad.instrument, bp = bad.probe, bd = bad.display;
        if (bw.T !== 100 || bw.L !== 300 || bw.bevel !== 0 || bw.type !== 'single-v' || bw.pipe !== true || bw.W !== undefined) f.push('patchFromRecord weldOpts ' + JSON.stringify(bw));
        if (bi.range !== 10 || bi.delay !== 0 || bi.reject !== 0 || bi.rectify !== 'full' || bi.gates.length !== 3 || bi.gates[0].start !== 10 || bi.gates[1].on !== false || bi.gates[2].level !== 100 || bi.cal.vel !== null || bi.cal.zero !== 50) f.push('patchFromRecord instrument ' + JSON.stringify(bi));
        if (bp.angle !== 60 || bp.x !== 3000 || bp.side !== -1 || bp.method !== 'pe') f.push('patchFromRecord probe ' + JSON.stringify(bp));
        if (bd.skips !== 12 || bd.units !== 'mm' || bd.plan !== false) f.push('patchFromRecord display ' + JSON.stringify(bd));
        if (parseSteps('25, 5,10 ,15;20 20').join(',') !== '5,10,15,20,25') f.push('parseSteps');
        const r = wedgeToRefracted(47.1, 2.74, null);
        if (r.mode !== 'shear' || Math.abs(r.refracted - 60) > 0.2) f.push('wedge 47.1 -> ' + r.refracted + ' ' + r.mode);
        const rc = wedgeToRefracted(20, 2.74, null);
        if (rc.mode !== 'comp' || Math.abs(rc.refracted - 47.4) > 0.3) f.push('wedge 20 comp -> ' + rc.refracted);
        if (!wedgeToRefracted(70, 2.74, null).beyond) f.push('beyond 2nd critical');
        if (Math.abs(r.crit.first - 27.7) > 0.1 || Math.abs(r.crit.second - 57.7) > 0.1) f.push('critical angles');
        if (probePatchFor(60.02, 'shear').angle !== 60 || probePatchFor(55.26, 'shear').angle !== 55.3 || probePatchFor(0, 'comp').mode !== 'comp') f.push('probePatchFor');
        if (OD_INCH[6] !== 168.3 || inchOf(219.1) !== '8' || inchOf(200) !== 'custom') f.push('OD table');
        const mid = midParts(null);
        if (!/^Pos: /.test(mid[0]) || !/^Range /.test(mid[1]) || !/^AMP= /.test(mid[2])) f.push('midParts ' + mid.join('|'));
        if (KO['Adjust Angle in Wedge (Shoe)'] === undefined) f.push('KO dictionary');
      } catch (e) { f.push('exception ' + (e && e.message)); }
      return f;
    },
  });
  UT.app = app;

  Object.assign(UT.test, {
    /** Click a toolbar button by id ('tb-60'); false when missing or disabled. */
    click(id) { return activateToolbar(String(id).indexOf('tb-') === 0 ? String(id) : 'tb-' + id); },
    /** Run a menu item by its English label path; false when missing or disabled. */
    menu(path) { return menuByPath(path); },
  });

  if (typeof document !== 'undefined' && document && typeof document.addEventListener === 'function') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { boot(); });
    else setTimeout(boot, 0);
  }
})(window.UT = window.UT || {});
