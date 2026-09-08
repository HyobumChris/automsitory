/* 92-i18n-ko.js — U1 Korean dictionary (SPEC-v2 §5.3, single owner), glossary data (§5.6) and quick-tour text,
 * plus UT.test.untranslated() (§5.3.4). Registers with UT.i18n.add('ko', {...}) at load time — allowed by §5.3/§15.12
 * because it touches no DOM. Runs AFTER every UI file (index.html order 00 … 90, 92, 94) so nothing here depends on
 * anything but UT.i18n / UT.test from core. Terminology follows §5.3.6 (KS B 0817 / industry usage):
 *   기준 감도 (reference level/sensitivity), 게인(이득), 에코 높이 (% FSH), 지시 / 불연속 / 결함, 슬래그 혼입, 빔 노정 (SP),
 *   표면 거리, 깊이, 스킵 (0.5 스킵 / 1 스킵), IIW 표준 시험편 (STB-A1) / 소형 표준 시험편 (STB-A3), 대비 시험편, 횡공 / 평저공,
 *   토우(지단), 덧살(여성), 이면 비드, 형상 에코, 의사 지시, 모드 변환, 표면파(레일리파), 불감대, 근거리 음장, 측정 범위(레인지),
 *   지연(X-시프트), 리젝션(억제), 게이트 경보, 전달 손실 보정, 기록/평가/기준 레벨, 허용 수준, 판정 (합격/불합격/기록/기록 불요),
 *   높이(두께 방향 치수), 주사, 접촉 매질, 감쇠, 6 dB 드롭법, 단부 에코법(팁 회절).
 */
// SPEC NOTES (decisions where SPEC-v2 is silent or ambiguous)
// - Keys are copied VERBATIM from the source files (90's v2 menu items use the Unicode ellipsis '…', v1 items '...').
//   Placeholders {n} are kept intact; Korean word order sometimes moves them.
// - Product names / legends (EPOCH 600, USK7, IIW, TOFD, DAC, AUT, PA, ASME, ISO, AWS, V1, V2, TKY, PLOT, DAMP …) are
//   deliberately kept in Latin script inside translations, as on the real instruments and in Korean procedure text.
// - Menu keys stay English data-keys (§5.3.3); their labels are translated through this table.
// - The tour array carries both `selector` (task wording) and `target` (what 90-app reads); 90 shows ko/en by mem.lang.
// - v3 QA r1 / V3-64: the failing `text === key` element was the F33 dialog TITLE 'HIDE' (80-modes), not the toolbar —
//   90-app renders toolbar legends from `def.label` with no data-i18n, so a Korean value for 'HIDE' translates the
//   dialog title and the lessons quiz choice while PLOT / DAMP / CLEAR / BEAM / HIDE stay Latin on the toolbar, as
//   in the original. Short legends that double as prose therefore read '한국어 (LATIN)' — the convention already used
//   by 'English': '영어 (English)'. The unlock twin of that dialog ('SHOW DEFECTS' + its two lines) is translated too.
// - v3 QA r1 / V3-64 (cont.): the F19 ttinfo line 'SHIFT and LEFT or RIGHT CURSOR KEY TO MOVE RECEIVER PROBE' is
//   translated here once and reaches both surfaces that show it — the ttinfo dialog (90-app) and the status-bar
//   right hint, which 90 renders through t(). A sweep of every t('…') literal in src/*.js against this table then
//   found three more v3 strings with no entry — the plotting-card captions '{a} degree' and
//   'Beam spread half angle BS = {bs}°' (66-view-plotter draws them on the canvas, so untranslated() cannot see
//   them) and the F29 defect-editor caption '{p}  Defect Num {n}, DRAW DEFECT ON CROSS SECTION BELOW'; all three
//   are added below. Latin card/product tokens (BS, VOL / LOF via {p}) stay Latin per the note above.
// - v3 QA r3 / Keyboard Shortcuts: 90-app's openKeys() builds the description column out of keys the dictionary already
//   carries for other surfaces, so every row is translated today (V2-18 / V3-64 green). Eight of those keys are BUTTON or
//   MENU labels ('Freeze', 'Peak memory', 'Beam on/off', 'Finger damping tool', 'Range 50 → 100 → 200 → 400 mm',
//   'Scale Mode', 'About', 'Delete'), which read as names rather than as descriptions of what the key does. Purpose-written
//   English keys + Korean wordings for exactly those eight are registered above (step 1 of a two-step change); 90-app may
//   swap openKeys() over to them at any time (step 2, its own file) and the shared keys stay valid meanwhile. The rows that
//   quote the original UTman wording verbatim (F19 receiver move, F27 editor F1 sheet, F51 teaching aid) keep their shared
//   keys on purpose — the same sentence is shown by the ttinfo dialogs, and §3–§6 require the original wording there.
//   Those twelve rows (8 rephrased + 4 verbatim) are every Keyboard Shortcuts row whose description reuses a key another
//   surface also shows; step 1 is therefore complete on the dictionary side.
// - v3 QA r3 (round 3 re-check): step 2 (openKeys() swapping to the purpose-written keys) lives in 90-app.js and is NOT
//   mine to make, so this file only widens the safety net: the dictionary now also carries 'Turn the finger damping tool
//   on or off' (D toggles, it does not merely open, so an accurate rewrite would say so), 'Select the 0° / 45° / 60° / 70°
//   probe' and 'Hide or show the defects and the beam' (the two remaining label-shaped rows, unique to openKeys()).
//   Every one of these is ADDITIVE — no existing key was renamed or removed — so 90-app can adopt any of them, one row
//   at a time, and V2-18 / V3-64 stay green at every intermediate state. Until it does, they are dictionary entries with
//   no live twin, which untranslated() never inspects (it walks the DOM, not the table).
// - v3 QA r3: the dictionary entry 'Close the USK 7 window' was dropped — no source string carries it any more (70's OFF
//   key falls back to TIPS.ON, 'Switch the set on / off (the trace is blanked while it is off)'). Its live twin
//   'Re-open the USK 7 window' ('Show USK 7') stays.
// - untranslated(): exemptions exactly per §5.3.4 — the two short-token regexes, the product-name set (whole key equals
//   a product name, or the key is made only of product names / digits / punctuation), `.no-i18n` subtrees,
//   `#statusbar .sb-left`, and probe library `name` strings (UT.probe.library[].name / label). Returns [] when lang != 'ko'.
(function (UT) {
  'use strict';

  const KO = {
    // ------------------------------------------------------------------ core / menu bar (90-app menus, §8)
    'File': '파일', 'Probes': '탐촉자', 'Step Wedge': '스텝 웨지', 'Weld': '용접부', 'Defects': '결함', 'Tools': '도구', 'Options': '옵션', 'Help': '도움말',
    'New': '새로 만들기', 'Load Setup': '설정 불러오기', 'Save Setup': '설정 저장', 'Print': '인쇄', 'Print report': '보고서 인쇄',
    'Export A-scan PNG': 'A-스캔 PNG 내보내기', 'Save scenario…': '시나리오 저장…', 'Load scenario…': '시나리오 불러오기…', 'Share link…': '공유 링크…',
    'Probe library…': '탐촉자 라이브러리…', 'Adjust Angle in Wedge (Shoe)': '쐐기(슈) 내 각도 조정', 'Zero Probe - Twin or Single Crystal': '수직 탐촉자 - 이중/단일 진동자',
    'Single Crystal': '단일 진동자', 'Twin Crystal': '이중 진동자', 'Pulse Echo': '펄스 에코', 'Through Transmission': '투과법', 'Tandem (pitch catch)': '탠덤 (피치 캐치)',
    '2.5 MHz Frequency': '주파수 2.5 MHz', '5 MHz Frequency': '주파수 5 MHz', 'Probe Diameter 10mm': '진동자 지름 10 mm', 'Probe Diameter 5mm': '진동자 지름 5 mm',
    'Phased Array Probe': '위상배열 탐촉자', 'Phased Array Probe…': '위상배열 탐촉자…', 'Focus Beam': '빔 집속', 'Focus Beam…': '빔 집속…',
    'Colour Code Display': '색상 코드 표시', 'Colour Code': '색상 코드', 'Number of Skips': '스킵 수', 'Single Line Beam': '단일선 빔',
    'Mode conversion': '모드 변환', 'Surface wave': '표면파', 'Side lobes': '사이드 로브', 'Finger damping tool': '손가락 감쇠 도구',
    'Steps 5-25 mm (5 mm)': '스텝 5-25 mm (5 mm)', 'Steps 10-50 mm (10 mm)': '스텝 10-50 mm (10 mm)', 'Custom Steps...': '사용자 정의 스텝...',
    'Auto Cal': '자동 교정', 'Exit Step Wedge': '스텝 웨지 나가기', 'FBH block': '평저공 시험편',
    'Weld Settings...': '용접부 설정...', 'Weld…': '용접부…', 'Material…': '재질…', 'Presets': '프리셋', 'Pipe': '파이프', 'TKY Joint': 'TKY 이음',
    'Plate': '평판', 'T-joint': 'T형 이음', 'T-joint: plate chord with an angled brace (modelled)': 'T형 이음: 평판 코드에 경사 브레이스 (모델링됨)',
    '{kind} joint is not modelled in this version — only the T-joint geometry is available': '{kind} 이음은 이 버전에서 모델링되지 않습니다 — T형 이음 형상만 사용할 수 있습니다',
    'Defect Editor...': '결함 편집기...', 'Add Preset': '프리셋 추가', 'Delete All Defects': '모든 결함 삭제', 'Hide Defects': '결함 숨기기',
    'Import Defects...': '결함 가져오기...', 'Export Defects...': '결함 내보내기...', 'Lamination Check': '라미네이션 검사', 'Trade Test...': '실기 시험...', 'Trade Test…': '실기 시험…',
    'Random practice…': '무작위 연습…',
    'DGS diagram…': 'DGS 선도…', 'Evaluation (standards)…': '평가 (규격)…', 'Procedures': '절차서', 'No procedure': '절차서 없음', 'Procedures window…': '절차서 창…',
    'B-scan window': 'B-스캔 창', 'Echo dynamic window': '에코 다이내믹 창', 'Datalogger…': '데이터로거…', 'Sizing…': '크기 측정…',
    'UT Set': 'UT 세트', 'EPOCH 600': 'EPOCH 600', 'EPOCH 4': 'EPOCH 4', 'USK7': 'USK7', 'Units': '단위', 'mm': 'mm', 'inch': '인치',
    'None': '없음', 'Mode Propagation': '모드 전파', 'Geometry': '형상', 'Show Plan View': '평면도 표시', 'Show 3D Window': '3D 창 표시', 'Show Legend': '범례 표시',
    'Language': '언어', 'English': '영어 (English)', 'Korean (한국어)': '한국어', 'Korean': '한국어',
    'Sound alarm': '소리 경보', 'Touch bar': '터치 바', 'auto': '자동', 'on': '켬', 'off': '끔', 'High contrast': '고대비', 'Auto-scale layout': '레이아웃 자동 크기 조정',
    'Show dead zones': '불감대 표시', 'Options...': '옵션...', 'Reset Layout': '레이아웃 초기화',
    'About UTsim...': 'UTsim 정보...', 'Quick Guide...': '빠른 안내...', 'Keyboard Shortcuts...': '키보드 단축키...', 'Quick tour': '둘러보기',
    'Glossary…': '용어집…', 'Standards notes…': '규격 참고 사항…', 'Lessons...': '레슨...', 'Lessons…': '레슨…', 'Echo quiz…': '에코 퀴즈…',
    // weld presets
    'Plate 12 mm Single-V': '평판 12 mm 단일 V', 'Plate 20 mm Single-V': '평판 20 mm 단일 V', 'Plate 25 mm Double-V': '평판 25 mm 양면 V (X)', 'Plate 40 mm Double-V': '평판 40 mm 양면 V (X)',
    'Plate 20 mm Single-bevel (K)': '평판 20 mm 단일 베벨 (K)', 'Plate 25 mm Single-V with backing bar': '평판 25 mm 단일 V + 배킹 바', 'Fillet T-joint web 12': '필릿 T 이음 웨브 12',
    'Pipe 6 inch WT 20': '파이프 6인치 두께 20', 'Pipe 8 inch WT 25': '파이프 8인치 두께 25', 'Pipe 12 inch WT 30': '파이프 12인치 두께 30',

    // ------------------------------------------------------------------ toolbar (90-app) labels + tooltips
    '0°': '0°', '45°': '45°', '60°': '60°', '70°': '70°', 'V2': 'V2', 'V1': 'V1', 'DAC': 'DAC', 'PLOT': 'PLOT', 'DAMP': 'DAMP', 'SIZE': 'SIZE', 'DEFECT': 'DEFECT',
    // 'HIDE' is BOTH a toolbar legend (90-app renders `def.label` raw, with no data-i18n — it stays Latin like
    // PLOT / DAMP / CLEAR) and the TITLE of the F33 key dialog (80-modes) plus a lesson-quiz choice, which are
    // translated through this key; the Latin token is kept in parentheses so the quiz still names the button.
    'HIDE': '숨기기 (HIDE)', 'CLEAR': 'CLEAR', 'BEAM': 'BEAM', 'RAD': 'RAD', 'PIPE': 'PIPE', 'TKY': 'TKY', 'TOFD': 'TOFD', 'AUT': 'AUT',
    '0° compression probe': '0° 수직(종파) 탐촉자', '45° shear probe': '45° 사각(횡파) 탐촉자', '60° shear probe': '60° 사각(횡파) 탐촉자', '70° shear probe': '70° 사각(횡파) 탐촉자',
    'V2 calibration block': 'V2 소형 표준 시험편 (STB-A3)', 'V1 calibration block': 'IIW V1 표준 시험편 (STB-A1)', 'DAC block (SDH)': 'DAC 대비 시험편 (횡공)',
    'Plot beam spread (IOW block)': '빔 확산 플롯 (IOW 시험편)', 'Damping': '감쇠', 'Sizing (6 dB / 20 dB drop)': '크기 측정 (6 dB / 20 dB 드롭)',
    'Defect editor': '결함 편집기', 'Hide defects and beam': '결함과 빔 숨기기', 'Clear plotting': '플로팅 지우기', 'Beam on/off': '빔 켬/끔', 'Radiograph': '방사선 투과 필름',
    'Plate ⇄ pipe': '평판 ⇄ 파이프', 'TKY joint': 'TKY 이음', 'TOFD mode': 'TOFD 모드', 'AUT mode': 'AUT 모드',
    // touch bar (90)
    '◀': '◀', '▶': '▶', '▲': '▲', '▼': '▼', '−': '−', '+': '+', 'Range': '측정 범위', 'Freeze': '프리즈', 'Peak': '피크', 'Hide': '숨김', 'Mark L': '왼쪽 표시', 'Mark R': '오른쪽 표시', 'Row+': '행 추가',
    'Probe left (x −)': '탐촉자 왼쪽으로 (x −)', 'Probe right (x +)': '탐촉자 오른쪽으로 (x +)', 'Probe along the weld (z −)': '용접선 방향 이동 (z −)', 'Probe along the weld (z +)': '용접선 방향 이동 (z +)',
    'Gain −1 dB': '게인 −1 dB', 'Gain +1 dB': '게인 +1 dB', 'Range 50 → 100 → 200 → 400 mm': '측정 범위 50 → 100 → 200 → 400 mm', 'Freeze the A-scan': 'A-스캔 프리즈', 'Peak memory': '피크 메모리',
    'Sizing: mark the left drop point': '크기 측정: 왼쪽 드롭 지점 표시', 'Sizing: mark the right drop point': '크기 측정: 오른쪽 드롭 지점 표시',
    'Trade test: add a report row from the readouts': '실기 시험: 판독값으로 보고서 행 추가', 'Step {n} mm': '스텝 {n} mm', 'Step size for ◀ ▶ ▲ ▼': '◀ ▶ ▲ ▼ 이동 간격',

    // status bar mid row, built by 90's midParts() (§5.3.6: range = 측정 범위, gain = 게인, depth = 깊이).
    // The {x}/{r}/{g}/{d} placeholders must survive verbatim (core's t() substitutes them) and no value may
    // contain ' | ' — 90 joins and splits the mid segments on that separator.
    'Pos: {x} mm': '위치: {x} mm', 'Pos: {x} in': '위치: {x} in',
    'Range {r}mm': '측정 범위 {r}mm', 'Range {r}in': '측정 범위 {r}in',
    'AMP= {g}dB': '게인= {g}dB',
    'Depth = {d}mm': '깊이 = {d}mm', 'Depth = {d}in': '깊이 = {d}in', 'Depth: {d}': '깊이: {d}',

    // ------------------------------------------------------------------ status hints (core / 80 / 90)
    'LEFT mouse button/drag to move the UT Probe': '마우스 왼쪽 버튼 드래그로 탐촉자를 이동하세요',
    'LEFT mouse button/drag to draw defect.': '마우스 왼쪽 버튼 드래그로 결함을 그리세요.',
    'Set Amplitude and press record button, then draw curves': '에코 높이를 맞춘 뒤 Record를 누르고 커브를 그리세요',
    'Lessons': '레슨', 'Trade Test': '실기 시험', 'Start': '시작', 'Reveal': '정답 공개', 'Submit': '제출',
    'Ready': '준비', 'Time': '시간', 'Note': '메모', 'note': '메모', 'Ref': '기준', 'Probe': '탐촉자', 'Gain': '게인', 'Instrument': '탐상기', 'Specimen': '시험체', 'Physics': '물리',
    'Readouts': '판독값', 'Material': '재질', 'Parent material': '모재', 'Evaluation': '평가', 'Inspection report': '검사 보고서', 'side': '면', 'Weld preparation': '개선 형상',

    // ------------------------------------------------------------------ 90-app dialogs (weld / wedge / options / step wedge / help / export / probelib / material / focus / glossary / tour)
    'OK': '확인', 'Cancel': '취소', 'Close': '닫기', 'Apply': '적용', 'Back': '뒤로', 'Next': '다음', 'Finish': '마침', 'Skip': '건너뛰기', 'Import': '가져오기', 'Select all': '모두 선택',
    'A-scan': 'A-스캔', 'Cross section': '단면도', 'Plan view': '평면도', 'Export PNG': 'PNG 내보내기', 'Export Defects': '결함 내보내기', 'Import Defects': '결함 가져오기',
    'Weld Settings': '용접부 설정', 'Adjust Angle': '각도 조정', 'Step Wedge...': '스텝 웨지...', 'About UTsim': 'UTsim 정보', 'Quick Guide': '빠른 안내', 'Keyboard Shortcuts': '키보드 단축키',
    'Probe library': '탐촉자 라이브러리', 'Focus': '집속', 'Glossary': '용어집', 'Search': '검색', 'Term': '용어', 'Lessons ': '레슨',
    'Search term (KO / EN)': '용어 검색 (한국어 / 영어)', '{n} terms': '{n}개 용어', 'Open lesson {n}': '레슨 {n} 열기',
    'Pipe (circumferential weld)': '파이프 (원주 용접부)', 'OD (inch)': '외경 (인치)', 'Backing bar (25 × 6 mm under the root)': '배킹 바 (루트 아래 25 × 6 mm)',
    'Weld metal': '용착 금속', 'Wedge material': '쐐기 재질', 'Angle in wedge (shoe)': '쐐기(슈) 내 각도', 'Refracted angle in steel': '강 내 굴절각',
    'Custom steps (mm)': '사용자 정의 스텝 (mm)', 'Step length': '스텝 길이', 'Steps 5, 10, 15, 20, 25 mm': '스텝 5, 10, 15, 20, 25 mm', 'Steps 10, 20, 30, 40, 50 mm': '스텝 10, 20, 30, 40, 50 mm', 'Custom': '사용자 정의',
    'Focused probe (geometric focus)': '집속 탐촉자 (기하학적 집속)', 'Focal depth F (mm)': '집속 깊이 F (mm)', 'N (mm)': 'N (mm)', 'Freq': '주파수', 'Maker': '제조사', 'Name': '이름', 'Crystal (mm)': '진동자 (mm)', 'Angle': '각도', 'Mode': '모드',
    'Thickness (mm)': '두께 (mm)', 'Thickness T (mm)': '두께 T (mm)', 'Bevel angle (°)': '개선각 (°)', 'Root gap (mm)': '루트 간격 (mm)', 'Root face (mm)': '루트면 (mm)', 'Cap width (mm)': '덧살 폭 (mm)', 'Cap height (mm)': '덧살 높이 (mm)', 'Root height (mm)': '이면 비드 높이 (mm)',
    'Web thickness (mm)': '웨브 두께 (mm)', 'Branch OD (mm)': '분기관 외경 (mm)', 'Transfer loss (dB)': '전달 손실 (dB)', 'Preparation': '개선 형상',
    'Wall thickness (mm)': '두께 (mm)', 'Pipe OD (inch)': '파이프 외경 (인치)',
    'same as parent': '모재와 동일', 'same as parent (carbon)': '모재와 동일 (탄소강)', 'austenitic (attenuating, coarse grain)': '오스테나이트계 (감쇠 큼, 조대 결정립)',
    'Perspex 2740 m/s': '퍼스펙스 2740 m/s', 'Polystyrene 2350 m/s': '폴리스티렌 2350 m/s', 'Rexolite 2330 m/s': '렉솔라이트 2330 m/s', 'custom (mm)': '사용자 정의 (mm)',
    'compression': '종파', 'shear': '횡파', 'surface': '표면파', 'anisotropic': '이방성',
    'Delete all defects?': '모든 결함을 삭제할까요?', 'ERASE ALL DEFECTS': '모든 결함 삭제',
    'Reset everything to the default setup? (defects, probe, instrument, weld)': '모든 설정(결함, 탐촉자, 탐상기, 용접부)을 기본값으로 되돌릴까요?',
    'No saved setup found in this browser.': '이 브라우저에 저장된 설정이 없습니다.', 'Setup saved to this browser (localStorage).': '설정을 이 브라우저(localStorage)에 저장했습니다.',
    'Invalid entries were reset / clamped: {list}': '잘못된 항목을 초기화/제한했습니다: {list}',
    'Enter at least two step thicknesses, e.g. 5, 10, 15, 20, 25': '스텝 두께를 두 개 이상 입력하세요. 예: 5, 10, 15, 20, 25',
    'Choose a step wedge (stepped reference block) and practise range / zero calibration with the 0° probe (Auto Cal).': '스텝 웨지(계단형 대비 시험편)를 선택하고 0° 탐촉자로 측정 범위 / 영점 교정(자동 교정)을 연습하세요.',
    'Weld thickness, preparation and pipe dimensions. Apply/OK re-builds the specimen (defects are kept).': '용접부 두께, 개선 형상, 파이프 치수. 적용/확인을 누르면 시험체를 다시 만듭니다(결함은 유지).',
    "Moving the slider changes the refracted angle and the wave mode (compression / shear) in steel by Snell's law. Watch the physics line in the status bar.": '슬라이더를 움직이면 스넬의 법칙에 따라 강 내 굴절각과 파 모드(종파 / 횡파)가 바뀝니다. 상태 표시줄의 물리 라인을 확인하세요.',
    'Near field N = {n} mm ({mode} {a}°, {f} MHz, crystal {c} mm)': '근거리 음장 N = {n} mm ({mode} {a}°, {f} MHz, 진동자 {c} mm)',
    'N = near field of the selected wave mode; θ6 / θ20 = pulse-echo half angles (−6 / −20 dB). Custom angles: Probes ▸ Adjust Angle in Wedge (Shoe).': 'N = 선택한 파 모드의 근거리 음장; θ6 / θ20 = 펄스 에코 반각 (−6 / −20 dB). 임의 각도: 탐촉자 ▸ 쐐기(슈) 내 각도 조정.',
    'Focus replaces the angular fan by 41 aperture rays aimed at F along the centre ray; focal gain Gf = 1 + (min(N/F, 3) − 1)·exp(−((s − F)/(0.25 F))²). Beyond F the beam diverges again.': '집속을 켜면 각도 팬 대신 중심선의 F를 향한 41개의 개구 광선을 사용합니다. 집속 이득 Gf = 1 + (min(N/F, 3) − 1)·exp(−((s − F)/(0.25 F))²). F를 지나면 빔이 다시 퍼집니다.',
    'F > near field: no focusing effect': 'F > 근거리 음장: 집속 효과 없음', 'Focusing needs a refracted angle ≤ 70°.': '집속은 굴절각 70° 이하에서만 가능합니다.',
    'One-way attenuation at 5 MHz (scales with (f/5)^1.5); grass scales with (f/5)². Changing the material re-builds the specimen and the readouts use its velocities.': '5 MHz에서의 편도 감쇠((f/5)^1.5에 비례); 임상 에코는 (f/5)²에 비례. 재질을 바꾸면 시험체를 다시 만들고 판독값에 그 재질의 음속을 사용합니다.',
    'Paste defect JSON (as produced by Export Defects / Save Def).': '결함 JSON(결함 내보내기 / Save Def로 만든 것)을 붙여 넣으세요.',
    'Copy this JSON to keep the defects (Defects ▸ Import Defects… pastes it back).': '이 JSON을 복사해 결함을 보관하세요(결함 ▸ 결함 가져오기…로 다시 붙여 넣습니다).',
    'Exam locked: defects are hidden until the test is revealed.': '시험 잠금: 정답 공개 전까지 결함이 숨겨집니다.',
    'Invalid defect JSON: {msg}': '잘못된 결함 JSON: {msg}', 'Defect JSON': '결함 JSON',
    'Right-click the image and choose "Save image as…"': '이미지를 마우스 오른쪽 버튼으로 클릭하고 "이미지를 다른 이름으로 저장…"을 선택하세요',
    'Canvas #{id} is not available.': '캔버스 #{id}를 사용할 수 없습니다.', 'Export failed: {msg}': '내보내기 실패: {msg}',
    'An independent, open re-implementation inspired by the UTman ultrasonic simulator (utsim.co.uk) by Paul Rawlinson. Not affiliated with, endorsed by, or derived from the original software; all code and artwork are original and drawn with Canvas 2D/CSS.': 'Paul Rawlinson의 UTman 초음파 시뮬레이터(utsim.co.uk)에서 영감을 받아 독립적으로 재구현한 공개 소프트웨어입니다. 원저작자와 제휴·승인·파생 관계가 없으며, 모든 코드와 그림은 Canvas 2D/CSS로 새로 작성했습니다.',
    'Physics: 2-D polygon ray tracing (piston-directivity fan of 41 rays with side lobes, mode conversion, surface waves, up to 4 skips), Snell refraction in the Perspex wedge, near field / beam spread, DAC / TCG / DGS, TOFD with mode-converted signals, phased array, AUT strip charts. Instruments: EPOCH 600, EPOCH 4 and USK 7 skins.': '물리: 2차원 다각형 광선 추적(피스톤 지향성 41개 광선 팬, 사이드 로브, 모드 변환, 표면파, 최대 4 스킵), 퍼스펙스 쐐기의 스넬 굴절, 근거리 음장 / 빔 확산, DAC / TCG / DGS, 모드 변환 신호를 포함한 TOFD, 위상배열, AUT 스트립 차트. 탐상기: EPOCH 600, EPOCH 4, USK 7 스킨.',
    'Single-file HTML, no network, no external libraries. Settings persist in this browser only.': '단일 HTML 파일, 네트워크·외부 라이브러리 없음. 설정은 이 브라우저에만 저장됩니다.',
    '1. Layout': '1. 화면 구성', '2. Moving the probe': '2. 탐촉자 이동', '3. Instrument': '3. 탐상기', '4. Toolbar': '4. 도구 모음', '5. Probes, Weld, Tools': '5. 탐촉자, 용접부, 도구', '6. Lessons, quiz & trade test': '6. 레슨, 퀴즈, 실기 시험',
    'Left: the flaw detector (EPOCH 600 by default). Right: plan view with the skew compass. Below: the X ruler and the cross-section with the probe, beam and defects. Status bar: wedge/refracted angle physics line, probe position, range, gain and hints.': '왼쪽: 탐상기(기본 EPOCH 600). 오른쪽: 스큐 나침반이 있는 평면도. 아래: X 눈금자와 탐촉자·빔·결함이 표시되는 단면도. 상태 표시줄: 쐐기각/굴절각 물리 라인, 탐촉자 위치, 측정 범위, 게인, 힌트.',
    'Left-drag in the cross-section or plan view (Shift-drag = along the weld). Arrow keys move 1 mm (Shift 10 mm). Drag the red needle of the compass to skew the probe. On touch screens use the touch bar (Options ▸ Touch bar).': '단면도나 평면도에서 왼쪽 버튼 드래그(Shift+드래그 = 용접선 방향). 화살표 키 1 mm(Shift 10 mm). 나침반의 빨간 바늘을 끌면 탐촉자가 스큐됩니다. 터치 화면에서는 터치 바(옵션 ▸ 터치 바)를 사용하세요.',
    'Click a softkey (Gain, Range, Delay, …) then use ▲▼ or the mouse wheel over the instrument. The dB softkeys set 10/20/30/40/60 dB. RANGE cycles 50/100/200/400 mm. GATES selects gate 1/2. PEAK MEM, Freeze, Auto Cal on the step wedge. 2ND F + GATES = AUTO 80 %, SAVE → Datalogger, 2ND F + ❄ = Compare.': '소프트키(Gain, Range, Delay …)를 누른 뒤 탐상기 위에서 ▲▼ 또는 마우스 휠을 사용하세요. dB 소프트키는 10/20/30/40/60 dB로 설정합니다. RANGE는 50/100/200/400 mm 순환, GATES는 게이트 1/2 선택. PEAK MEM, 프리즈, 스텝 웨지에서 자동 교정. 2ND F + GATES = AUTO 80 %, SAVE → 데이터로거, 2ND F + ❄ = 비교.',
    '0°/45°/60°/70° probes · V2/V1 calibration blocks · DAC bar (record points, draw curves) · PLOT beam spread on the IOW block · DAMP · SIZE (6 dB / 20 dB drop) · DEFECT editor (draw with the mouse) · HIDE (blind practice) · CLEAR · BEAM · RAD radiograph · PIPE (plate ⇄ pipe + 3D window) · TKY · TOFD · AUT.': '0°/45°/60°/70° 탐촉자 · V2/V1 표준 시험편 · DAC(점 기록, 커브 그리기) · PLOT IOW 시험편 빔 확산 · DAMP · SIZE(6 dB / 20 dB 드롭) · DEFECT 편집기(마우스로 그리기) · HIDE(블라인드 연습) · CLEAR · BEAM · RAD 방사선 필름 · PIPE(평판 ⇄ 파이프 + 3D 창) · TKY · TOFD · AUT.',
    'Probes ▸ Probe library chooses named probes (MWB, WB, A430S …); Focus Beam focuses inside the near field; Mode conversion / Surface wave / Side lobes switch the v2 physics. Weld ▸ Weld… selects the preparation (single-V, double-V, K, J, backing bar, fillet T, nozzle) and Material… the parent material. Tools ▸ DGS diagram, Evaluation (ISO 11666 / ASME / AWS), Procedures, B-scan, Echo dynamic, Datalogger, Sizing.': '탐촉자 ▸ 탐촉자 라이브러리에서 실제 탐촉자(MWB, WB, A430S …)를 고릅니다. 빔 집속은 근거리 음장 안에서 집속하고, 모드 변환 / 표면파 / 사이드 로브는 v2 물리를 켜고 끕니다. 용접부 ▸ 용접부…에서 개선 형상(단일 V, 양면 V, K, J, 배킹 바, 필릿 T, 노즐)을, 재질…에서 모재를 고릅니다. 도구 ▸ DGS 선도, 평가(ISO 11666 / ASME / AWS), 절차서, B-스캔, 에코 다이내믹, 데이터로거, 크기 측정.',
    'Help ▸ Lessons lists 25 guided lessons with automatic step checks, hints and "Do it for me". Help ▸ Echo quiz asks you to identify gated echoes. Defects ▸ Trade Test hides random defects for you to find, size and report (timer, scoreboard, printable report); Random practice is the same without a timer. File ▸ Share link… encodes the whole scenario into a URL.': '도움말 ▸ 레슨에 자동 단계 확인, 힌트, "대신 해 주기"가 있는 25개의 안내 레슨이 있습니다. 도움말 ▸ 에코 퀴즈는 게이트 안의 에코를 맞히는 문제입니다. 결함 ▸ 실기 시험은 무작위 결함을 숨겨 찾고, 크기를 재고, 보고하게 합니다(타이머, 점수판, 인쇄용 보고서). 무작위 연습은 타이머 없이 같은 방식입니다. 파일 ▸ 공유 링크…는 시나리오 전체를 URL로 만듭니다.',
    'Move probe 1 mm (Shift: 10 mm)': '탐촉자 1 mm 이동 (Shift: 10 mm)', 'Move probe along the weld (z)': '용접선 방향(z)으로 탐촉자 이동', 'Gain ±1 dB (Shift: ±6 dB)': '게인 ±1 dB (Shift: ±6 dB)',
    'Hide defects & beam': '결함과 빔 숨기기', 'Probe 0° / 45° / 60° / 70°': '탐촉자 0° / 45° / 60° / 70°', 'Close the top window, menu or tour': '맨 위 창, 메뉴 또는 둘러보기 닫기',
    'Open the menu bar (arrows navigate, Enter activates)': '메뉴 바 열기 (화살표로 이동, Enter로 실행)', 'Open the File / Probes / Step Wedge / Weld / Defects / Tools / Options / Help menu': '파일 / 탐촉자 / 스텝 웨지 / 용접부 / 결함 / 도구 / 옵션 / 도움말 메뉴 열기',
    'Adjust the selected instrument parameter': '선택한 탐상기 파라미터 조정', 'Over the cross-section: gain ±1 dB; over the instrument: selected parameter': '단면도 위: 게인 ±1 dB; 탐상기 위: 선택한 파라미터',
    // v3 QA r3 — purpose-written wordings for the Keyboard Shortcuts rows whose description column currently reuses a
    // BUTTON / MENU label ('Freeze', 'Peak memory', 'Beam on/off', 'Finger damping tool', 'Range 50 → …', 'Scale Mode',
    // 'About', 'Delete'). Registered first so 90-app's openKeys() can switch to these keys without ever passing through a
    // state where V2-18 / V3-64 see an untranslated key; the shared keys above stay in place either way (see SPEC NOTES).
    // The rows that quote the original verbatim (F19 receiver, F27 editor, F51 teaching aid) are NOT rephrased.
    'Cycle the range 50 → 100 → 200 → 400 mm': '측정 범위를 50 → 100 → 200 → 400 mm로 순환',
    'Freeze the A-scan (press F again to release it)': 'A-스캔 프리즈 (F를 다시 누르면 해제)',
    'Peak memory — hold the envelope of the maximum echo height': '피크 메모리 — 최대 에코 높이 포락선 유지',
    'Show or hide the beam': '빔 표시 켜기 / 끄기',
    'Open the finger damping tool': '손가락 감쇠 도구 열기',
    'Turn the finger damping tool on or off': '손가락 감쇠 도구 켜기 / 끄기',
    'Open the Scale Mode menu': '축척 모드 메뉴 열기',
    'Open the About menu': '정보 메뉴 열기',
    'Delete the selected defect': '선택한 결함 삭제',
    // the same treatment for the two label-shaped rows that are NOT shared with another surface
    'Select the 0° / 45° / 60° / 70° probe': '0° / 45° / 60° / 70° 탐촉자 선택',
    'Hide or show the defects and the beam': '결함과 빔 숨기기 / 표시',
    // options window (90)
    'Auto trig (angle/thickness follow probe)': '자동 삼각 계산 (각도/두께가 탐촉자를 따름)', 'Colour code': '색상 코드', 'Number of skips': '스킵 수', 'Show 3D window': '3D 창 표시', 'Show beam': '빔 표시',
    'Show converted rays': '모드 변환 광선 표시', 'Show legend': '범례 표시', 'Show plan view': '평면도 표시', 'Language / 언어': '언어 / Language', 'EPOCH 4 (ASME text screen)': 'EPOCH 4 (ASME 텍스트 화면)',
    'Krautkrämer USK 7 (analogue)': 'Krautkrämer USK 7 (아날로그)', 'Geometry (last surface)': '형상 (마지막 반사면)', 'Mode propagation (leg colours)': '모드 전파 (레그별 색상)', 'auto (coarse pointer)': '자동 (터치 포인터)',
    '한국어 (Korean)': '한국어', 'Grid': '격자', 'Mirror image': '거울상', 'Legend': '범례', 'Sound': '소리', 'Layout': '레이아웃', 'Display': '표시', 'Scale': '크기 조정', 'fixed': '고정',
    // probe library / material windows (90)
    'Select a probe from the library; the toolbar angle buttons follow the same series.': '라이브러리에서 탐촉자를 선택하세요. 도구 모음의 각도 버튼도 같은 시리즈를 따릅니다.',
    'Series': '시리즈', 'Frequency (MHz)': '주파수 (MHz)', 'Crystal': '진동자', 'Wedge': '쐐기', 'Twin': '이중', 'Single': '단일', 'Method': '방법', 'Selected': '선택됨', 'Use probe': '탐촉자 사용',
    'vL (mm/µs)': 'vL (mm/µs)', 'vS (mm/µs)': 'vS (mm/µs)', 'Attenuation L (dB/mm)': '종파 감쇠 (dB/mm)', 'Attenuation S (dB/mm)': '횡파 감쇠 (dB/mm)', 'Grass': '임상 에코', 'Anisotropic': '이방성',
    'Velocity L': '종파 음속', 'Velocity S': '횡파 음속',

    // ------------------------------------------------------------------ 70-instruments (softkeys, readouts, datalog, compare, USK7)
    'Delay': '지연', 'Reject': '리젝션', 'Velocity': '음속', 'Zero': '영점', 'Thick': '두께', 'AUTO %': 'AUTO %', 'AMP': 'AMP', 'AMP (dB)': 'AMP (dB)', 'SP': 'SP', 'SD': 'SD', 'DP': 'DP', '#': '#',
    'Enter': 'Enter', 'NEXT GROUP': '다음 그룹', 'Gate1': '게이트1', 'Gate2': '게이트2', 'Gate 1': '게이트 1', 'Gate 2': '게이트 2', 'Gate': '게이트', 'Gates': '게이트', 'GATES': 'GATES',
    'Datalogger': '데이터로거', 'Datalog JSON': '데이터로그 JSON', 'Datalog JSON copied to the clipboard': '데이터로그 JSON을 클립보드에 복사했습니다',
    'Copy failed — select the text in the window and copy it manually': '복사 실패 — 창의 텍스트를 선택해 직접 복사하세요', 'Copy JSON': 'JSON 복사', 'Clear all': '모두 지우기', 'Save now': '지금 저장', 'Delete': '삭제', 'Show USK 7': 'USK 7 표시',
    'No entries yet — press SAVE on the instrument to log the current readouts.': '아직 항목이 없습니다 — 탐상기의 SAVE를 누르면 현재 판독값이 기록됩니다.', '{n} / 100 entries': '{n} / 100 항목',
    'Saved to the datalogger ({n} entries) — Tools ▸ Datalogger…': '데이터로거에 저장했습니다 ({n}개 항목) — 도구 ▸ 데이터로거…',
    'The USK 7 floats over the plan view. Read the screen — this set has no digital readouts.': 'USK 7은 평면도 위에 떠 있습니다. 화면을 직접 읽으세요 — 이 세트에는 디지털 판독값이 없습니다.', 'USK 7': 'USK 7',
    'AUTO {pct} %: gain set to {g} dB': 'AUTO {pct} %: 게인을 {g} dB로 설정', 'AUTO {pct} %: no echo in the gate': 'AUTO {pct} %: 게이트 안에 에코 없음',
    'Compare cleared': '비교 트레이스 지움', 'Compare: trace frozen in grey behind the live A-scan (2ND F + ❄ clears)': '비교: 실시간 A-스캔 뒤에 회색으로 고정한 트레이스 (2ND F + ❄로 지움)',
    'Reference gain stored: {g} — ▲▼ add scanning dB': '기준 게인 저장: {g} — ▲▼로 주사 감도 dB 추가', 'Reference gain lock off': '기준 게인 잠금 해제',
    'Damping (click to cycle)': '댐핑 (클릭하여 순환)', 'Pulser energy (click to cycle)': '펄서 에너지 (클릭하여 순환)', 'Receiver filter (click to cycle)': '수신기 필터 (클릭하여 순환)', 'Pulser energy / damping and receiver filter': '펄서 에너지 / 댐핑 및 수신기 필터',
    'Gate alarm': '게이트 경보', 'Alarm': '경보', 'TCG': 'TCG', 'TCG on': 'TCG 켬', 'Peak mem': '피크 메모리', 'Compare': '비교', 'Entry': '항목', 'Entries': '항목', 'Depth': '깊이', 'Amplitude': '에코 높이',

    // ------------------------------------------------------------------ 80-modes (defect editor, DAC, trade shell, autocal, TKY, lessons v1 window)
    'Defect {n}': '결함 {n}', 'Defect 1': '결함 1', 'Delete Defect 1': '결함 1 삭제', 'Delete Defect {n}': '결함 {n} 삭제', 'Type': '종류', 'LENGTH': '길이', 'SEPARATION': '간격', 'HEIGHT': '높이', 'APPLY TO ALL DEFECTS': '모든 결함에 적용',
    'Add preset': '프리셋 추가', 'Add row': '행 추가', 'Remove row': '행 삭제', 'Default': '기본값', 'Erase': '지우기', 'Record': '기록', 'Draw Curves': '커브 그리기', 'Load': '불러오기', 'Load Def': '결함 불러오기', 'Save Def': '결함 저장', 'New test': '새 시험', 'Precision 1°': '정밀도 1°', 'Precision {p}': '정밀도 {p}',
    '✓': '✓', '✕': '✕', 'Capture': '캡처', 'Record the gated peak (R)': '게이트 안의 피크 기록 (R)', 'Erase all DAC points': '모든 DAC 점 지우기', 'Draw / hide the −6 dB (50 %) and −14 dB (20 %) curves': '−6 dB (50 %) / −14 dB (20 %) 커브 표시/숨기기', 'Brush size (px)': '브러시 크기 (px)',
    'ADJUST MODE': '조정 모드', 'Brace T (mm)': '브레이스 두께 (mm)', 'Chord T (mm)': '코드 두께 (mm)', 'Brace offset (mm)': '브레이스 오프셋 (mm)', 'Brace angle = {a}°': '브레이스 각도 = {a}°', 'Toe LOF': '토우 융합 불량', 'Lamination 1': '라미네이션 1', 'Lamination 2': '라미네이션 2',
    'Default toe LOF loaded (20 mm long under the toe weld)': '기본 토우 융합 불량을 불러왔습니다 (토우 용접부 아래 길이 20 mm)',
    'Defect {n} — draw it in the cross section with the LEFT mouse button': '결함 {n} — 단면도에서 마우스 왼쪽 버튼으로 그리세요', 'Maximum 8 defects': '결함은 최대 8개입니다',
    'Defect editor is locked during the Trade Test': '실기 시험 중에는 결함 편집기가 잠깁니다', 'Defects loaded': '결함을 불러왔습니다', 'Defects saved (utsim.defects) — JSON shown for copy/paste': '결함을 저장했습니다 (utsim.defects) — 복사/붙여넣기용 JSON 표시',
    'No saved defects (utsim.defects)': '저장된 결함이 없습니다 (utsim.defects)', 'Load Def: invalid JSON': '결함 불러오기: 잘못된 JSON', 'Defect JSON (Save Def writes here; paste here and press Load Def)': '결함 JSON (결함 저장 시 여기에 기록됩니다. 붙여 넣고 결함 불러오기를 누르세요)',
    'Unknown material {key}': '알 수 없는 재질 {key}', 'Unknown preset {name}': '알 수 없는 프리셋 {name}',
    'DAC: no echo above the gate level — maximise the echo first': 'DAC: 게이트 레벨 위에 에코가 없습니다 — 먼저 에코를 최대로 맞추세요', 'DAC: point refused ({pct}% at ref gain) — reduce the amplitude': 'DAC: 점 거부 ({pct} %, 기준 게인) — 에코 높이를 낮추세요',
    'DAC: record at least 2 points, then Draw Curves': 'DAC: 점을 2개 이상 기록한 뒤 커브 그리기를 누르세요', 'Ref gain: {g}   Curves: {c}': '기준 게인: {g}   커브: {c}', 'ON (−6 / −14 dB)': '켬 (−6 / −14 dB)', 'no points': '점 없음',
    'Auto Cal 1/2: Place the probe on the {d} mm step (gate 1 start below the first backwall echo), then press ✓': '자동 교정 1/2: 탐촉자를 {d} mm 스텝에 놓고(게이트 1 시작을 첫 저면 에코 앞에), ✓를 누르세요',
    'Auto Cal 2/2: Place the probe on the {d} mm step, then press ✓': '자동 교정 2/2: 탐촉자를 {d} mm 스텝에 놓고 ✓를 누르세요', 'Auto Cal done: Velocity {v} m/s, Zero {z} µs': '자동 교정 완료: 음속 {v} m/s, 영점 {z} µs',
    'Auto Cal: the second echo must be later than the first — move to the {d} mm step and press ✓': '자동 교정: 두 번째 에코가 첫 번째보다 늦어야 합니다 — {d} mm 스텝으로 옮기고 ✓를 누르세요',
    'FBH block {T} mm: ⌀2/3/4/6 at 30 mm, ⌀3 at 50 mm': '평저공 시험편 {T} mm: 30 mm 깊이에 ⌀2/3/4/6, 50 mm 깊이에 ⌀3',
    'Test #{seed}': '시험 #{seed}', 'seed': '시드', 'Optional seed (same seed = same test)': '시드 (선택, 같은 시드 = 같은 시험)', 'Press Start': '시작을 누르세요', 'Press Start first': '먼저 시작을 누르세요',
    'Trade Test started ({n} hidden defects). Fill in the report, then Submit': '실기 시험 시작 (숨겨진 결함 {n}개). 보고서를 작성한 뒤 제출하세요', 'Time left {t}': '남은 시간 {t}',
    'Trade Test score {score}% — {m}/{n} found, {f} false calls': '실기 시험 점수 {score}% — {n}개 중 {m}개 검출, 오검출 {f}건', 'SCORE {score}%   ({m} of {n} found, {tm} type correct, {f} false calls)': '점수 {score}%   ({n}개 중 {m}개 검출, 종류 정답 {tm}, 오검출 {f}건)',
    'Missed: {list}': '미검출: {list}', 'nearest hidden indication: {d} mm further along z, side {side}': '가장 가까운 숨겨진 지시: z 방향으로 {d} mm 더, {side} 면', 'True defects': '실제 결함',
    'Select a lesson and press Load': '레슨을 선택하고 불러오기를 누르세요', 'Lesson ': '레슨 ',
    'Sizing ({method} drop): length {len} mm': '크기 측정 ({method} 드롭): 길이 {len} mm', 'Mark {side} at z = {z} mm — now mark the other end': '{side} 표시 z = {z} mm — 이제 반대쪽 끝을 표시하세요', 'Edge mark {n}: stand-off {so} mm at {hole} SDH': '에지 표시 {n}: {hole} 횡공에서 스탠드오프 {so} mm',
    // lesson titles (80 lessonSetups; shown via lessons windows)
    'UTman Functions': 'UTman 기능', 'Basic UT controls Range X shift Amplitude': 'UT 기본 조작: 측정 범위, X-시프트, 에코 높이', 'Zero Probe': '수직 탐촉자', 'Angle Probe using the V1 calibration block': 'V1 표준 시험편으로 사각 탐촉자 교정',
    'Angle Probe using the V2 calibration block': 'V2 표준 시험편으로 사각 탐촉자 교정', 'Making Sense of Amplitude': '에코 높이와 dB 이해', 'TKY Variable configuration Welds': 'TKY 가변 형상 용접부', 'Plotting Beam Spread at 20%': '20 % 빔 확산 플로팅',
    'Drawing Defects II': '결함 그리기 II', 'Drawing Defects I': '결함 그리기 I', 'How to use the EPOCH': 'EPOCH 사용법', 'EPOCH AUTO Calibration': 'EPOCH 자동 교정', 'Shear wave and Compression wave': '횡파와 종파', 'UTman software utsim': 'UTman 소프트웨어 utsim',
    'Lamination Check.mpg': '라미네이션 검사 (반복)', 'Angleprobe Calibration': '사각 탐촉자 교정', 'Trade Test with UTman software': 'UTman 소프트웨어 실기 시험', 'UTman600': 'UTman 600', 'Set the reference level': '기준 감도 설정', 'Transfer correction': '전달 손실 보정', 'Sensitivity re-check': '감도 재확인',
    'Skew': '스큐', 'Plotting': '플로팅', 'Damping tool': '감쇠 도구', 'Pipe 3D': '파이프 3D', 'TOFD lesson': 'TOFD 레슨', 'AUT lesson': 'AUT 레슨',

    // ------------------------------------------------------------------ 82-lessons (window v2 + quiz)
    'Steps': '단계', 'Step {n} of {m}': '{m}단계 중 {n}단계', 'Step {n} done': '{n}단계 완료', 'Hint': '힌트', 'No hint for this step': '이 단계에는 힌트가 없습니다', 'Do it for me': '대신 해 주기', 'Next lesson': '다음 레슨',
    'Lesson {n} complete — score {s} %': '레슨 {n} 완료 — 점수 {s} %', '{x}/25 done, {y} ★': '25개 중 {x}개 완료, ★ {y}', 'Select': '선택', 'Stop': '중지', 'Answer': '답', 'Correct': '정답', 'Wrong': '오답', 'Correct action': '올바른 조작', 'Wrong action — {a}': '잘못된 조작 — {a}',
    'Echo quiz': '에코 퀴즈', 'Identify the gated echo: geometry, defect or spurious?': '게이트 안의 에코를 판별하세요: 형상, 결함, 의사 지시?', 'Question {i} of {n}': '{n}문제 중 {i}번', 'Questions': '문제 수', 'Difficulty': '난이도', 'Seed': '시드', 'Seed {s} · {d}': '시드 {s} · {d}',
    'Quiz finished: {c}/{n} correct': '퀴즈 종료: {n}문제 중 {c}개 정답', 'Score {c} correct, {w} wrong': '점수: 정답 {c}, 오답 {w}', 'Best {b} % · attempts {a}': '최고 {b} % · 시도 {a}회', 'Echoes on screen': '화면의 에코', 'No echoes on screen': '화면에 에코 없음', 'Gate this echo': '이 에코를 게이트', 'Explain': '설명',
    'easy': '쉬움', 'normal': '보통', 'hard': '어려움', 'Easy': '쉬움', 'Normal': '보통', 'Hard': '어려움', 'expert': '전문가', 'Expert': '전문가', 'Progress': '진행', 'Lesson': '레슨', 'Lesson {n}': '레슨 {n}', 'Restart': '다시 시작', 'Reset progress': '진행 초기화',
    'Backwall': '저면 에코', 'Root': '루트', 'Cap': '덧살', 'Defect': '결함', 'Spurious': '의사 지시', 'Geometry echo': '형상 에코', 'Mode-converted': '모드 변환', 'SDH': '횡공', 'Radius': '반경', 'Perspex': '퍼스펙스', 'Corner': '코너', 'Tip': '팁',
    'root': '루트', 'cap': '덧살', 'defect': '결함', 'spurious': '의사 지시', 'geometry': '형상', 'backwall': '저면 에코', 'sdh': '횡공', 'modeconv': '모드 변환', 'surface wave': '표면파', 'lateral wave': '측면파',

    // ------------------------------------------------------------------ 30-raytrace describe() categories
    'Geometry ({tag})': '형상 ({tag})', 'Mode-converted ({mode})': '모드 변환 ({mode})', 'Surface wave ({tag})': '표면파 ({tag})', 'SDH {label}': '횡공 {label}', 'Tandem: {name}': '탠덤: {name}', 'via {tag}': '{tag} 경유',
    '{label} (corner)': '{label} (코너)', '{label} (tip)': '{label} (팁)', '{name} (leg {leg})': '{name} (레그 {leg})', '{name} {path} mm': '{name} {path} mm', 'Inclined': '경사',
    'Backwall echo': '저면 에코', 'Root corner': '루트 코너', 'Cap echo': '덧살 에코', 'Root bead': '이면 비드', 'Backing bar': '배킹 바', 'Lateral wave': '측면파', 'Initial pulse': '초기 펄스',

    // ------------------------------------------------------------------ 84-trade (trade / scoreboard / report / practice)
    'Candidate name': '수험자 이름', '(no name)': '(이름 없음)', 'Please enter the candidate name first': '먼저 수험자 이름을 입력하세요', 'Time limit (min)': '제한 시간 (분)', 'min': '분', 'Practice (no timer)': '연습 (타이머 없음)', 'exam code': '시험 코드', 'exam code (optional)': '시험 코드 (선택)',
    'Exam mode': '시험 모드', 'Scoreboard': '점수판', 'Report': '보고서', 'Practice': '연습', 'Coverage': '주사 범위', 'Per-defect breakdown': '결함별 상세', 'Result token': '결과 토큰', 'Verify result': '결과 검증', 'no result yet': '아직 결과 없음', 'Row number': '행 번호',
    'Report every indication you find: z start, length, depth to the top, height, type, dB vs reference, probe angle and side. Matching is one-to-one; false calls cost 15 points; pass mark 70 %.': '발견한 모든 지시를 보고하세요: z 시작, 길이, 상단 깊이, 높이, 종류, 기준 대비 dB, 탐촉자 각도, 면. 대응은 1:1이며 오검출은 15점 감점, 합격 기준 70 %입니다.',
    'Random practice: the trade-test generator without timer or lock. Hint costs 5 % of the practice score; Reveal one shows the nearest hidden defect (non-scoring); Check row confirms a detection only.': '무작위 연습: 타이머와 잠금이 없는 실기 시험 생성기. 힌트는 연습 점수의 5 %를 감점하고, 하나 공개는 가장 가까운 숨겨진 결함을 보여 주며(채점 제외), 행 확인은 검출 여부만 확인합니다.',
    'Random practice started ({n} hidden defects). Hint, Reveal one and Check row are allowed': '무작위 연습 시작 (숨겨진 결함 {n}개). 힌트, 하나 공개, 행 확인을 사용할 수 있습니다',
    'Reveal one': '하나 공개', 'Check row': '행 확인', 'Random practice': '무작위 연습', 'Difficulty:': '난이도:', 'Hint (−5 %)': '힌트 (−5 %)',
    'PASS': '합격', 'FAIL': '불합격', 'FAIL (below {p}%)': '불합격 ({p}% 미만)', 'FAIL (critical miss)': '불합격 (치명적 미검출)', 'SCORE {score}%': '점수 {score}%', 'Missed': '미검출', 'critical': '치명적', 'false call': '오검출', 'False calls': '오검출',
    'Trade Test score {score}% — {found}/{n} found, {fc} false calls': '실기 시험 점수 {score}% — {n}개 중 {found}개 검출, 오검출 {fc}건', '{found}/{n} found, {fc} false calls, time {t}': '{n}개 중 {found}개 검출, 오검출 {fc}건, 소요 시간 {t}',
    'Time is up — the report has been submitted automatically': '시간 종료 — 보고서가 자동 제출되었습니다', 'Time used {t}': '소요 시간 {t}', '{m} minutes left': '{m}분 남음', '{m} minute left': '{m}분 남음', '{angle}° {mode} not possible in {mat} (limit {limit}°): refracted angle limited to {actual}°': '{mat}에서는 {angle}° {mode}가 불가능(한계 {limit}°): 굴절각을 {actual}°로 제한', 'Mean time to first detection': '첫 검출까지 평균 시간', 'Procedure compliance': '절차서 준수',
    'DAC block ({n} points, T {T} mm)': 'DAC 대비 시험편 ({n}점, T {T} mm)', 'ref {r} dB + {x} dB': '기준 {r} dB + {x} dB',
    // 90-app procedure lock while the trade exam runs (probe tooltips / status)
    'Not allowed by the procedure while the trade test runs': '실기 시험 중에는 절차서상 허용되지 않습니다', 'Probe {id} is not allowed by the procedure while the trade test runs': '탐촉자 {id}은(는) 실기 시험 중에 절차서상 허용되지 않습니다',
    'Revealed defect {n}: {type}, z {z0}–{z1} mm, depth {d} mm, height {h} mm, side {side}': '공개된 결함 {n}: {type}, z {z0}–{z1} mm, 깊이 {d} mm, 높이 {h} mm, {side} 면',
    'No hidden indication left — every recordable defect is already reported': '남은 숨겨진 지시가 없습니다 — 기록 대상 결함을 모두 보고했습니다', 'nearest hidden indication: {d} mm {dir} along z, side {side}': '가장 가까운 숨겨진 지시: z 방향으로 {d} mm {dir}, {side} 면', 'further': '앞쪽', 'back': '뒤쪽',
    'Row {i}: detection ✓ (defect {n})': '행 {i}: 검출 ✓ (결함 {n})', 'Row {i}: no matching hidden defect ✗': '행 {i}: 일치하는 숨겨진 결함 없음 ✗', 'below recording level': '기록 레벨 미만',
    'Valid: {name} — seed {seed}, {difficulty}, score {score}%{fail}, {t}': '유효: {name} — 시드 {seed}, {difficulty}, 점수 {score}%{fail}, {t}', 'Invalid or tampered token': '잘못되었거나 변조된 토큰', 'Wrong exam code': '잘못된 시험 코드', 'truth locked': '정답 잠금', 'unlocked': '잠금 해제',
    'Clear the trade test history?': '실기 시험 기록을 지울까요?', 'best {score}% ({date})': '최고 {score}% ({date})', 'dB vs reference': '기준 대비 dB', 'wedge': '쐐기', 'z start': 'z 시작', 'z start (mm)': 'z 시작 (mm)', 'length (mm)': '길이 (mm)', 'depth (mm)': '깊이 (mm)', 'height (mm)': '높이 (mm)', 'angle': '각도', 'Angle (°)': '각도 (°)', 'Side': '면',
    'planar': '면상', 'crack': '균열', 'lack of fusion': '융합 불량', 'incomplete penetration': '용입 부족', 'volumetric': '체적형', 'porosity': '기공', 'slag': '슬래그 혼입', 'lamination': '라미네이션',
    'Planar': '면상', 'Crack': '균열', 'Lack of fusion': '융합 불량', 'Incomplete penetration': '용입 부족', 'Volumetric': '체적형', 'Porosity': '기공', 'Slag inclusion': '슬래그 혼입', 'Lamination': '라미네이션',
    'History': '기록', 'Score': '점수', 'Found': '발견', 'Result': '결과', 'Candidate': '수험자', 'Clear history': '기록 지우기', 'Print this report': '이 보고서 인쇄', 'Verify': '검증', 'Token': '토큰', 'Paste a result token': '결과 토큰을 붙여 넣으세요',
    'Detected': '검출됨', 'Bonus': '가산점', 'Type correct': '종류 정답', 'Length': '길이', 'Height': '높이', 'Position': '위치', 'Coverage {p} %': '주사 범위 {p} %', 'Coverage: {p} % of the weld length scanned from both sides': '주사 범위: 용접선 길이의 {p} %를 양면에서 주사',
    'Timer': '타이머', 'Truth': '정답', 'Locked': '잠김', 'Report rows': '보고서 행', 'Row': '행', 'Not recordable': '기록 불요', 'recordable': '기록', 'accept': '합격', 'reject': '불합격', 'record': '기록', 'Accept': '합격', 'Disposition': '판정',

    // ------------------------------------------------------------------ 45-standards (dgs / evaluation / procedures / stdnotes)
    'DGS diagram': 'DGS 선도', 'Evaluation (standards)': '평가 (규격)', 'Standards notes': '규격 참고 사항', 'Evaluation…': '평가…', 'Procedures…': '절차서…', 'Standard': '규격', 'Testing level': '검사 레벨', 'Acceptance level': '허용 수준',
    'Thickness t (mm)': '두께 t (mm)', 'Transfer correction (dB)': '전달 손실 보정 (dB)', 'Probe angle (AWS)': '탐촉자 각도 (AWS)', 'Add from readout': '판독값에서 추가', 'Evaluate all': '모두 평가', 'Clear rows': '행 지우기', 'Why?': '이유?', 'Reset rule': '규칙 초기화', 'Apply override': '오버라이드 적용',
    'Record reference (backwall)': '기준 기록 (저면 에코)', 'Record reference (FBH)': '기준 기록 (평저공)', 'Clear procedure': '절차서 해제', 'Clear': '지우기', 'FBH diameter (mm)': '평저공 지름 (mm)', 'FBH ⌀{d} mm': '평저공 ⌀{d} mm', '⌀ mm': '⌀ mm',
    'A procedure sets the standard, the acceptance/testing level, the DAC block thickness, default gain/reference gain/range and the transfer correction in one step.': '절차서는 규격, 허용/검사 레벨, DAC 시험편 두께, 기본 게인/기준 게인/측정 범위, 전달 손실 보정을 한 번에 설정합니다.',
    'Active procedure: {id} — the toolbar and the probe library are limited to its probes during a trade test': '적용 중인 절차서: {id} — 실기 시험 중에는 도구 모음과 탐촉자 라이브러리가 절차서의 탐촉자로 제한됩니다',
    'No procedure applied (all probes allowed)': '적용된 절차서 없음 (모든 탐촉자 허용)', 'Probes: {p}': '탐촉자: {p}', 'Standard: {s}': '규격: {s}', 'Reference block: {b} — {r}': '대비 시험편: {b} — {r}', 'block thickness {T} mm': '시험편 두께 {T} mm', 'pipe OD {od} × WT {wt}': '파이프 외경 {od} × 두께 {wt}',
    'Scanning sensitivity: {s}': '주사 감도: {s}', 'reference + {db} dB': '기준 + {db} dB', 'Transfer correction: {db} dB': '전달 손실 보정: {db} dB', 'testing level {l}': '검사 레벨 {l}', 'procedure {id}': '절차서 {id}', 'length method: {m}': '길이 측정법: {m}', 'record ≥ {pct} % of reference': '기준의 {pct} % 이상 기록',
    'Blue: backwall curve. Orange: disc curves G = d/a. Green dashed: the disc curve through the gated echo. Square = reference, circle = gated echo.': '파랑: 저면 에코 곡선. 주황: 원판 곡선 G = d/a. 초록 점선: 게이트 에코를 지나는 원판 곡선. 사각형 = 기준, 원 = 게이트 에코.',
    'far-field approximation (A ≥ 1); DGS applies to the 0° probe only': '원거리 음장 근사 (A ≥ 1); DGS는 0° 탐촉자에만 적용됩니다', 'DGS applies to the 0° probe only — select the 0° probe': 'DGS는 0° 탐촉자에만 적용됩니다 — 0° 탐촉자를 선택하세요',
    'DGS diagram: normalised distance A versus echo height H in dB': 'DGS 선도: 정규화 거리 A 대 에코 높이 H (dB)', 'DGS reference recorded: {kind} at {path} mm, {pct} % at {gain} dB': 'DGS 기준 기록: {kind}, {path} mm, {pct} %, {gain} dB',
    'Reference: {kind} at {path} mm, {pct} % at {gain} dB': '기준: {kind}, {path} mm, {pct} %, {gain} dB', 'Reference: {ref}': '기준: {ref}', 'No reference recorded': '기록된 기준 없음', 'Record a reference first (backwall or FBH)': '먼저 기준(저면 에코 또는 평저공)을 기록하세요',
    'Gate an echo first (no gated peak)': '먼저 에코를 게이트하세요 (게이트 안에 피크 없음)', 'Gate an echo to read its ERS': 'ERS를 읽으려면 에코를 게이트하세요', 'ERS = {ers} mm (G {g})': 'ERS = {ers} mm (G {g})', '{db} dB vs reference, {d3} dB vs ⌀3 disc': '기준 대비 {db} dB, ⌀3 원판 대비 {d3} dB',
    'Confidence notes for the rule sets, the mode-conversion fits and the exam lock. Nothing here replaces the current edition of a standard.': '규칙 세트, 모드 변환 근사식, 시험 잠금에 대한 신뢰도 참고 사항입니다. 어떤 내용도 규격의 최신판을 대신하지 않습니다.',
    'Current values: ': '현재 값: ', 'DAC recorded ({n} points, ref {db} dB)': 'DAC 기록됨 ({n}점, 기준 {db} dB)', 'no DAC: dB vs 80 % at the reference gain {g} dB': 'DAC 없음: 기준 게인 {g} dB에서 80 % 대비 dB',
    '{n} indications evaluated: {r} reject, {a} accept': '지시 {n}개 평가: 불합격 {r}, 합격 {a}', '{n} of {m} rows evaluated: {r} reject, {a} accept, {x} not recordable': '{m}행 중 {n}행 평가: 불합격 {r}, 합격 {a}, 기록 불요 {x}', '{m} rows — press Evaluate all': '{m}행 — 모두 평가를 누르세요',
    '{note}. Standards notes: Help ▸ Standards notes': '{note}. 규격 참고 사항: 도움말 ▸ 규격 참고 사항', 'Edit rule set {id} (JSON override)': '규칙 세트 {id} 편집 (JSON 오버라이드)', 'Rule override (JSON)': '규칙 오버라이드 (JSON)', 'Invalid JSON': '잘못된 JSON', '—': '—',
    'Rule': '규칙', 'Rules': '규칙', 'Recording level': '기록 레벨', 'Evaluation level': '평가 레벨', 'Reference level': '기준 레벨', 'Length (mm)': '길이 (mm)', 'Height (mm)': '높이 (mm)', 'Depth (mm)': '깊이 (mm)', 'dB': 'dB', 'Class': '등급', 'Indication': '지시', 'Indications': '지시',
    'fixed evaluation level': '평가 레벨 고정법', '6 dB drop': '6 dB 드롭법', '50 % amplitude (ASME)': '50 % 진폭법 (ASME)', 'Procedure': '절차서', 'Reference block': '대비 시험편', 'Notes': '참고',

    // ------------------------------------------------------------------ 50-tofd
    'TOFD A-Scan': 'TOFD A-스캔', 'TOFD RF A-scan': 'TOFD RF A-스캔', 'Run Scan': '스캔 실행', 'Stop Scan': '스캔 중지', 'press Run Scan': '스캔 실행을 누르세요', 'X-Shift': 'X-시프트', 'PCS': 'PCS', 'Optimise PCS': 'PCS 최적화', 'Mode conv.': '모드 변환', 'Straighten': '직선화', 'Dead zones': '불감대',
    'LW': 'LW', 'LW dead {mm} mm': '측면파 불감대 {mm} mm', 'BW dead {mm} mm': '저면파 불감대 {mm} mm', 'd {mm} mm  z {z}': 'd {mm} mm  z {z}', 't {us} µs': 't {us} µs', 'mode conv. beyond range ▶': '모드 변환 신호는 측정 범위 밖 ▶', 'Close TOFD': 'TOFD 닫기',
    'Build the D-scan image along the weld': '용접선을 따라 D-스캔 영상을 만듭니다', 'Clear the D-scan image': 'D-스캔 영상 지우기', 'TOFD D-scan: hover for the hyperbolic cursor, click to move the probe': 'TOFD D-스캔: 마우스를 올리면 쌍곡선 커서, 클릭하면 탐촉자 이동',
    '2/3 T rule: PCS = 2·(2T/3)·tan θ': '2/3 T 규칙: PCS = 2·(2T/3)·tan θ', 'Probe angle (compression)': '탐촉자 각도 (종파)', 'Probe centre separation (mm)': '탐촉자 중심 간격 (mm)',
    'Show mode-converted signals': '모드 변환 신호 표시', 'Straighten the lateral wave': '측면파 직선화', 'Show the lateral-wave and backwall dead zones': '측면파 및 저면파 불감대 표시', 'Range (µs)': '측정 범위 (µs)', 'Amplitude (dB)': '진폭 (dB)',

    // ------------------------------------------------------------------ 55-aut
    'Chart': '차트', 'Strips': '스트립', 'Map': '맵', 'Channels': '채널', 'Speed': '속도', 'Gate on': '게이트 켬', 'Gates Same': '게이트 동일', 'Rev Map': '맵 반전', 'Transit/TOF Gate': '전파 시간/TOF 게이트', 'Leave AUT': 'AUT 나가기', 'No scan': '스캔 없음', 'Both strips': '두 스트립 모두',
    'RDT — rectified amplitude strip only': 'RDT — 정류 진폭 스트립만', 'RTD — transit time (TOF) strip only': 'RTD — 전파 시간(TOF) 스트립만', 'AMP — gain (dB)': 'AMP — 게인 (dB)', 'Level': '레벨', 'Level +1 %': '레벨 +1 %', 'Level −1 %': '레벨 −1 %',
    'Gate on / off': '게이트 켬 / 끔', 'Gate start (mm sound path)': '게이트 시작 (mm, 빔 노정)', 'Transit gate length (mm sound path)': '전파 시간 게이트 길이 (mm, 빔 노정)', 'Select gate {n}': '게이트 {n} 선택', 'Copy gate 1 settings to the other channels': '게이트 1 설정을 다른 채널에 복사', 'Reverse the colour map': '색상 맵 반전',
    'Number of AUT channels (gates scanned side by side)': 'AUT 채널 수 (나란히 주사되는 게이트)', 'Scan speed (columns per frame)': '스캔 속도 (프레임당 열 수)', 'Scan along the weld at the current probe x': '현재 탐촉자 x 위치에서 용접선을 따라 스캔', 'Clear the strip charts and the map': '스트립 차트와 맵 지우기', 'Show the {tab} tab': '{tab} 탭 표시',
    'Amplitude colour map (white ≥100 %, red, magenta, yellow, green, cyan, blue <10 %)': '에코 높이 색상 맵 (흰색 ≥100 %, 빨강, 자홍, 노랑, 초록, 청록, 파랑 <10 %)', 'Amplitude strip (white) and TOF strip (blue) along the weld — click to move the probe': '용접선을 따른 진폭 스트립(흰색)과 TOF 스트립(파랑) — 클릭하면 탐촉자 이동',
    'C-scan map: z (down) × channel (across), amplitude colour bands — click to move the probe': 'C-스캔 맵: z (아래) × 채널 (가로), 에코 높이 색상 띠 — 클릭하면 탐촉자 이동', 'Live A-scan at the probe position with the AUT gates (one colour per channel)': '탐촉자 위치의 실시간 A-스캔과 AUT 게이트 (채널별 색상)',
    'z {z} mm': 'z {z} mm', 'Ch {n}': '채널 {n}', '{n}/frame': '{n}/프레임', 'x {x} mm': 'x {x} mm', 'gain {g} dB': '게인 {g} dB', '{n} channels': '채널 {n}개', 'step {s} mm': '간격 {s} mm', '{n} columns': '{n}열',

    // ------------------------------------------------------------------ 56-pa
    'Phased array': '위상배열', 'Phased array image (click to select the angle)': '위상배열 영상 (클릭하여 각도 선택)', 'Phased array probe is off (Probes ▸ Phased Array Probe)': '위상배열 탐촉자가 꺼져 있습니다 (탐촉자 ▸ 위상배열 탐촉자)', 'Focal law': '포컬 로', 'Focal law delays': '포컬 로 지연',
    'Elements': '엘리먼트', 'Pitch': '피치', 'Pitch (mm)': '피치 (mm)', 'Frequency': '주파수', 'From': '시작', 'To': '끝', 'Step': '간격', 'Focus depth': '집속 깊이', 'Focus depth (mm)': '집속 깊이 (mm)', 'Selected angle': '선택 각도', 'E-scan angle': 'E-스캔 각도', 'Per-angle TCG': '각도별 TCG', 'Run': '실행',
    'S-scan': 'S-스캔', 'E-scan': 'E-스캔', 'C-scan': 'C-스캔', 'S': 'S', 'E': 'E', 'C': 'C', 'Sector scan': '섹터 스캔', 'Electronic scan': '전자 주사', 'Angle {a}°': '각도 {a}°', 'aperture {a} mm': '개구 {a} mm', 'invalid (beyond the critical angle)': '무효 (임계각 초과)', 'no data': '데이터 없음', 'no scan — press Run': '스캔 없음 — 실행을 누르세요',
    '{kind} at {p} mm, {pct} %': '{kind}, {p} mm, {pct} %', 'Encoded C-scan along the weld at the current probe x': '현재 탐촉자 x 위치에서 용접선을 따른 인코더 C-스캔', 'Flatten the DAC-block SDH response across the sweep': '스윕 전체에서 DAC 시험편 횡공 응답을 평탄화',
    'Number of array elements': '배열 엘리먼트 수', 'Element pitch': '엘리먼트 피치', 'Array centre frequency': '배열 중심 주파수', 'First steering angle of the sweep': '스윕의 첫 조향 각도', 'Last steering angle of the sweep': '스윕의 마지막 조향 각도', 'Angle step of the sweep': '스윕의 각도 간격',
    'Focus depth in the material (0 = unfocused; F ≤ near field)': '재질 내 집속 깊이 (0 = 비집속; F ≤ 근거리 음장)', 'Angle whose A-scan is shown on the instrument': '탐상기에 A-스캔을 표시할 각도', 'Fixed steering angle of the electronic scan (contact L)': '전자 주사의 고정 조향 각도 (접촉 종파)',

    // ------------------------------------------------------------------ 60/62/64 views
    'Finger damping: click on the scanning surface to add or remove a damper ({n}/{max})': '손가락 감쇠: 주사면을 클릭하여 댐퍼를 추가/제거하세요 ({n}/{max})', 'dead zone {mm} mm': '불감대 {mm} mm',
    'PLAN VIEW': '평면도', 'Circle-View. Position {z}': '서클 뷰. 위치 {z}', 'Plate. Position {z}': '평판. 위치 {z}', '3D Pipe': '3D 파이프', '3D Plate': '3D 평판', '3D Nozzle': '3D 노즐', '3D T-joint': '3D T 이음', '3D Block': '3D 시험편',

    // ------------------------------------------------------------------ 66-view-plotter (plotter / sizing / bscan / echodyn / radiograph)
    'Plotter': '플로터', 'Sizing': '크기 측정', 'B-scan': 'B-스캔', 'Echo dynamic': '에코 다이내믹', 'Erase Plotting': '플로팅 지우기', 'Hide Mirror Image': '거울상 숨기기', 'Show Mirror Image': '거울상 표시', 'Mark 10% Edge': '10 % 에지 표시', 'Measure tips': '팁 측정', 'Use': '사용',
    'Axis': '축', 'x (across the weld)': 'x (용접선 가로 방향)', 'z (along the weld)': 'z (용접선 방향)', 'Depth (top)': '깊이 (상단)', 'measured': '측정값', 'true': '실제값', 'no defect': '결함 없음', 'recording': '기록 중', 'paused': '일시 정지', 'max': '최대', '(reveal)': '(공개)',
    '1 indication': '지시 1개', '{n} indications': '지시 {n}개', 'indications hidden': '지시 숨김', ', circumference': ', 원주', 'Tip echoes: ': '팁 에코: ', 'Recommended by {std}: {method}': '{std} 권장: {method}',
    'Radiograph of the weld along z (0…{L} mm{circ})  —  {ind}  |  probe z = {z} mm': 'z 방향 용접부 방사선 필름 (0…{L} mm{circ})  —  {ind}  |  탐촉자 z = {z} mm',
    'Peak the echo first, then move along z and press Mark L / Mark R at the drop points.': '먼저 에코를 최대로 맞춘 뒤 z 방향으로 이동하며 드롭 지점에서 왼쪽 표시 / 오른쪽 표시를 누르세요.',
    'Sizing ({method}): length {len} mm': '크기 측정 ({method}): 길이 {len} mm', 'Tip diffraction: height {h} mm ({p1} → {p2} mm)': '팁 회절: 높이 {h} mm ({p1} → {p2} mm)', '< {p} % (ref {r} % {db} dB)': '< {p} % (기준 {r} % {db} dB)',
    'Auto sizing ({method}): max {max} % at z {z}, length {len} mm': '자동 크기 측정 ({method}): 최대 {max} % (z {z}), 길이 {len} mm', 'Auto sizing: no echo found along z': '자동 크기 측정: z 방향에서 에코를 찾지 못했습니다',
    'wz6 {a} / wz20 {b} mm @ {p} mm': 'wz6 {a} / wz20 {b} mm @ {p} mm', '{n} columns · depth 0…{d} mm · {state}': '{n}열 · 깊이 0…{d} mm · {state}', '{n} samples · max {m} % · axis {a} · {state}': '{n}개 샘플 · 최대 {m} % · 축 {a} · {state}',
    'Echo-dynamic: move the probe across the indication to classify the pattern': '에코 다이내믹: 탐촉자를 지시 위로 가로질러 움직여 패턴을 분류하세요', 'Move the probe across the indication to classify the echo-dynamic pattern': '탐촉자를 지시 위로 가로질러 움직여 에코 다이내믹 패턴을 분류하세요',
    'Echo-dynamic: pattern {p} ({name}), −6 dB width {w} mm vs beam {b} mm': '에코 다이내믹: 패턴 {p} ({name}), −6 dB 폭 {w} mm, 빔 폭 {b} mm', 'Pattern {p}: {name} — −6 dB width {w} mm, beam −6 dB width {b} mm': '패턴 {p}: {name} — −6 dB 폭 {w} mm, 빔 −6 dB 폭 {b} mm',
    'ISO 23279 echo-dynamic patterns: 1 = single sharp peak (point-like), 2 = smooth plateau wider than twice the beam (extended, smooth), 3 = ragged plateau (extended, rough).': 'ISO 23279 에코 다이내믹 패턴: 1 = 날카로운 단일 피크 (점상), 2 = 빔 폭의 2배보다 넓은 매끄러운 평탄부 (연장, 매끄러움), 3 = 들쭉날쭉한 평탄부 (연장, 거침).',
    'Move the probe along the axis with the mouse, keys or touch bar: each A-scan is stacked as a depth-coded column (amplitude colour map).': '마우스, 키, 터치 바로 축을 따라 탐촉자를 움직이세요. A-스캔마다 깊이 좌표의 열로 쌓입니다 (에코 높이 색상 맵).',
    'gate the two tip echoes of the indication and press Measure tips': '지시의 두 팁 에코를 게이트하고 팁 측정을 누르세요', 'mark the LAST position where the echo is still ≥ 80 % of its maximum': '에코가 아직 최대의 80 % 이상인 마지막 위치를 표시하세요',
    'mark where the echo falls below the evaluation level': '에코가 평가 레벨 아래로 떨어지는 위치를 표시하세요', 'mark where the echo has dropped to 10 % of its maximum': '에코가 최대의 10 %로 떨어진 위치를 표시하세요', 'mark where the echo has dropped to 50 % of its maximum': '에코가 최대의 50 %로 떨어진 위치를 표시하세요',
    'apply the recommended method': '권장 방법 적용', '6 dB': '6 dB', '20 dB': '20 dB', 'eval': '평가 레벨', 'tip': '팁 회절', 'single sharp peak': '날카로운 단일 피크', 'smooth plateau': '매끄러운 평탄부', 'ragged plateau': '들쭉날쭉한 평탄부', 'point-like': '점상', 'extended, smooth': '연장, 매끄러움', 'extended, rough': '연장, 거침',

    // ------------------------------------------------------------------ 94-scenario (scenario / share)
    'Scenario': '시나리오', 'Share link': '공유 링크', 'Saved scenarios (this browser)': '저장된 시나리오 (이 브라우저)', 'Teaching metadata': '교육 메타데이터', 'Title': '제목', 'Note (KO)': '메모 (한국어)', 'Note (EN)': '메모 (영어)', 'Author': '작성자', 'Save': '저장', 'Copy': '복사', 'Generate link': '링크 생성', 'Export JSON': 'JSON 내보내기', 'Import JSON': 'JSON 가져오기',
    'Scenario JSON': '시나리오 JSON', 'Slot {n}': '슬롯 {n}', 'Scenario {n}': '시나리오 {n}', '(empty)': '(비어 있음)', 'by {author}': '작성자 {author}', 'Scenario applied': '시나리오를 적용했습니다', 'Scenario loaded': '시나리오를 불러왔습니다', 'Invalid scenario JSON': '잘못된 시나리오 JSON',
    'Exam': '시험', 'Exam mode (seed only)': '시험 모드 (시드만)', 'Exam code (4–8 characters)': '시험 코드 (4–8자)', 'Exam title': '시험 제목', 'Candidate name required': '수험자 이름 필수', 'Reveal the truth on submit': '제출 시 정답 공개', 'Seed (blank = random)': '시드 (비우면 무작위)',
    'Exam mode: the defects are hidden until you submit': '시험 모드: 제출 전까지 결함이 숨겨집니다', 'The link carries only the seed and a code hash — the candidate cannot see the defects; the code (or the instructor) reveals them.': '링크에는 시드와 코드 해시만 들어 있습니다 — 수험자는 결함을 볼 수 없고, 코드(또는 강사)로 공개합니다.',
    'Enter an exam code of 4–8 characters': '4–8자의 시험 코드를 입력하세요', 'Generating…': '생성 중…', 'Could not build the link': '링크를 만들 수 없습니다', 'Copied to the clipboard': '클립보드에 복사했습니다', 'Copy failed — select the text and copy it manually': '복사 실패 — 텍스트를 선택해 직접 복사하세요',
    '{n} characters': '{n}자', '{n} characters · {enc}': '{n}자 · {enc}', 'compressed': '압축', 'raw': '비압축', 'exam link (no defects)': '시험 링크 (결함 제외)', 'Link': '링크', 'URL': 'URL', 'Open': '열기', 'Remove': '제거', 'Rename': '이름 바꾸기', 'Empty slot': '빈 슬롯',

    // ------------------------------------------------------------------ specimens / defect preset labels (10 + 90 preset submenu)
    'No weld (plain plate)': '용접부 없음 (평판)', 'Single-V': '단일 V', 'Double-V (X)': '양면 V (X)', 'Single-bevel (K)': '단일 베벨 (K)', 'Single-J': '단일 J', 'Single-V with backing bar': '단일 V + 배킹 바', 'Fillet T-joint (set-on)': '필릿 T 이음 (셋온)', 'Nozzle / branch (set-on)': '노즐 / 분기관 (셋온)',
    'Lack of side-wall fusion': '측벽 융합 불량', 'Root crack': '루트 균열', 'Toe crack': '토우 균열', 'Centreline crack': '중심선 균열', 'Backing bar lack of fusion': '배킹 바 융합 불량', 'Fillet toe crack': '필릿 토우 균열', 'web/plate interface': '웨브/판 경계면',
    'Lack of side-wall fusion (융합 불량)': '측벽 융합 불량', 'Porosity (기공)': '기공', 'Slag inclusion (슬래그)': '슬래그 혼입', 'Root crack (균열)': '루트 균열', 'Centreline crack (중심선 균열)': '중심선 균열', 'Incomplete penetration (용입 부족)': '용입 부족', 'Toe crack (토우 균열)': '토우 균열', 'Lamination (라미네이션)': '라미네이션',
    'Backing bar lack of fusion (배킹바 융합불량)': '배킹 바 융합 불량', 'Fillet toe crack (필릿 토우 균열)': '필릿 토우 균열',
    'Carbon steel': '탄소강', 'Austenitic stainless': '오스테나이트계 스테인리스강', 'Aluminium': '알루미늄', 'Copper': '구리', 'Titanium': '티타늄', 'Cast iron': '주철', 'Perspex (PMMA)': '퍼스펙스 (PMMA)',
    'IIW V1 calibration block': 'IIW V1 표준 시험편', 'DAC reference block': 'DAC 대비 시험편', 'A5 IOW beam profile block': 'A5 IOW 빔 프로파일 시험편', 'Step wedge': '스텝 웨지', 'FBH reference block ': '평저공 대비 시험편 ',
    'V1 block (25 mm face)': 'V1 시험편 (25 mm 면)', 'V2 block (12.5 mm face)': 'V2 시험편 (12.5 mm 면)',

    // ------------------------------------------------------------------ generic words used across windows
    'Yes': '예', 'Reset': '초기화', 'Add': '추가', 'Edit': '편집', 'Done': '완료', 'Total': '합계', 'Mean': '평균', 'Count': '개수', 'Value': '값', 'Unit': '단위', 'Description': '설명', 'Status': '상태', 'Active': '활성', 'Inactive': '비활성',
    'Left': '왼쪽', 'Right': '오른쪽', 'Top': '상단', 'Bottom': '하단', 'Front': '앞면', 'Back side': '뒷면', 'Both': '양쪽', 'x (mm)': 'x (mm)', 'z (mm)': 'z (mm)', 'x': 'x', 'z': 'z', 'Skips': '스킵', 'Skip {n}': '스킵 {n}', 'Half skip': '0.5 스킵', 'Full skip': '1 스킵', 'Leg': '레그',
    'Sound path': '빔 노정', 'Surface distance': '표면 거리', 'Beam path': '빔 노정', 'Refracted angle': '굴절각', 'Wedge angle': '쐐기각', 'Index point': '입사점', 'Near field': '근거리 음장', 'Beam spread': '빔 확산', 'Dead zone': '불감대', 'Couplant': '접촉 매질', 'Attenuation': '감쇠', 'Sensitivity': '감도',
    'Reference gain': '기준 게인', 'Scanning gain': '주사 감도', 'Reference sensitivity': '기준 감도', 'Echo height': '에코 높이', 'Echo height (%)': '에코 높이 (%)', 'Range (mm)': '측정 범위 (mm)', 'Gain (dB)': '게인 (dB)', 'Delay (mm)': '지연 (mm)', 'Reject (%)': '리젝션 (%)',
    'Reference reflector': '기준 반사체', 'Side-drilled hole': '횡공', 'Flat-bottom hole': '평저공', 'Weld toe': '토우(지단)', 'Weld cap': '덧살(여성)', 'Spurious indication': '의사 지시', 'Discontinuity': '불연속',
    'Through-wall height': '높이 (두께 방향 치수)', 'Scanning': '주사', 'Tip diffraction': '단부 에코법 (팁 회절)', '20 dB drop': '20 dB 드롭법',
    // ------------------------------------------------------------------ found by the Korean window drive (weld dialog / sizing / PA fields / trade windows / EPOCH groups)
    'Basic': '기본', 'Pulsar': '펄서', 'Pulser': '펄서', 'Rcvr': '수신기', 'Trig': '삼각법', 'Meas': '측정', 'Cal': '교정',
    'Mark threshold': '표시 기준', 'Mark L (z)': '왼쪽 표시 (z)', 'Mark R (z)': '오른쪽 표시 (z)', 'Beam width (z) at path': '빔 노정에서의 빔 폭 (z)',
    'Thickness T': '두께 T', 'Bevel angle': '개선각', 'Root gap': '루트 간격', 'Root face': '루트면', 'Cap width': '덧살 폭', 'Cap height': '덧살 높이', 'Root height': '이면 비드 높이', 'Plate length L': '판 길이 L',
    'Web thickness (fillet / nozzle)': '웨브 두께 (필릿 / 노즐)', 'Branch OD (nozzle)': '분기관 외경 (노즐)', 'Transfer loss (two-way)': '전달 손실 (왕복)', 'OD (mm)': '외경 (mm)', 'Wall thickness WT': '두께 WT',
    'Select a lesson on the left and press Start': '왼쪽에서 레슨을 선택하고 시작을 누르세요', 'dB vs ref': '기준 대비 dB', 'SP (mm)': 'SP (mm)',
    'Sectorial scan': '섹터 스캔', 'From (°)': '시작 (°)', 'To (°)': '끝 (°)', 'Step (°)': '간격 (°)', 'Selected angle (°)': '선택 각도 (°)', 'E-scan angle (°)': 'E-스캔 각도 (°)', 'Focal distance F': '집속 거리 F',
    'Trade tests': '실기 시험', 'Practice results': '연습 결과', 'Surface condition': '표면 상태', 'Remarks': '비고', 'Refresh': '새로 고침', 'Start practice': '연습 시작', 'basic': '기초', 'intermediate': '중급', 'advanced': '고급', 'Reveal all': '모두 공개',
    'Take from readout': '판독값 가져오기', 'Best {b} % · hints {h} · do-it {d} · wrong {w}': '최고 {b} % · 힌트 {h} · 대신 해 주기 {d} · 오답 {w}', 'Echoes on screen (keyboard alternative to clicking the A-scan)': '화면의 에코 (A-스캔 클릭 대신 키보드로 선택)', 'Report...': '보고서...', 'Scoreboard...': '점수판...', 'Detection': '검출', 'Points': '점수', 'From z': 'z 시작', 'Best dB': '최대 dB',
    // printable report (84, HTML built with L()=t() — no data-i18n), sizing method labels (66), rule-set names / note (45)
    'Ultrasonic examination report': '초음파 탐상 검사 보고서', 'Job / exam title': '작업 / 시험 제목', 'Date / time': '일시', 'Standard / acceptance level / testing level': '규격 / 허용 수준 / 검사 레벨', 'Probes used': '사용 탐촉자',
    'Calibration block': '표준 시험편', 'Signature': '서명', 'Date': '날짜', 'practice': '연습', 'No': '번호', 'z from datum': '기준점부터 z', 'x from weld CL': '용접 중심선부터 x', 'Depth to top': '상단 깊이', 'Max amp (% DAC / dB vs ref)': '최대 에코 높이 (% DAC / 기준 대비 dB)',
    'Angle & side': '각도 및 면', 'Classification': '분류', '3 mm SDH': '3 mm 횡공', 'AUT strip chart': 'AUT 스트립 차트', 'Side A not scanned': 'A 면 미주사', 'Side B not scanned': 'B 면 미주사', 'datum: z 0 mark': '기준점: z 0 표시', 'no indications recorded': '기록된 지시 없음', 'none recorded': '기록 없음',
    'surfaces A (side +) / B (side −)': '주사면 A (+ 면) / B (− 면)',
    '20 dB drop (z-plane corrected)': '20 dB 드롭법 (z 평면 보정)', 'Max-amplitude (echo-dynamic ends)': '최대 진폭법 (에코 다이내믹 끝점)', 'Evaluation-level drop (fixed level)': '평가 레벨 고정법', 'Tip diffraction (height)': '단부 에코법 (높이)',
    'ISO 17640 (testing)': 'ISO 17640 (검사)', 'ISO 11666 (acceptance)': 'ISO 11666 (허용 수준)', 'ASME VIII App. 12': 'ASME VIII App. 12', 'AWS D1.1 Table 8.2': 'AWS D1.1 Table 8.2',
    'Illustrative transcription — verify against the current edition': '예시용 발췌 — 규격의 최신판으로 확인하세요', 'Illustrative transcription — verify against the current edition.': '예시용 발췌 — 규격의 최신판으로 확인하세요.',
    // quiz choice labels / actions of 82 are built from their own Korean strings (dom.button(ko ? c.ko : c.en)) — identity entries keep has() true
    '저면 에코': '저면 에코', '이면 비드(형상)': '이면 비드(형상)', '덧살(형상)': '덧살(형상)', '배킹 바 에지': '배킹 바 에지', '코너 에코(루트 결함)': '코너 에코(루트 결함)', '팁 회절': '팁 회절', '결함(융합면)': '결함(융합면)',
    '모드 변환 에코': '모드 변환 에코', '표면파': '표면파', '라미네이션': '라미네이션', '횡공': '횡공', '기록': '기록', '형상 에코로 메모': '형상 에코로 메모', '무시': '무시',
    'Note as geometry echo': '형상 에코로 메모', 'Ignore': '무시', 'Root bead (geometry)': '이면 비드(형상)', 'Cap (geometry)': '덧살(형상)', 'Backing bar edge': '배킹 바 에지', 'Corner echo (root defect)': '코너 에코(루트 결함)', 'Defect (fusion face)': '결함(융합면)', 'Mode-converted echo': '모드 변환 에코',
    // ------------------------------------------------------------------ QA round 1 sweep (DAC window, defect editor, trade report, standards notes, sizing recommendation, USK7 dock)
    'Hide Curves': '커브 숨기기', 'Select Defect': '결함 선택', 'lof': '융합 불량', 'Scanning sensitivity': '주사 감도', 'not-recordable': '기록 불요',
    'Exam loaded — enter the candidate name and press Start': '시험이 로드되었습니다 — 수험자 이름을 입력하고 Start를 누르세요',
    'General': '일반', 'Exam sharing': '시험 공유', 'ASME VIII-1 App. 12 / ASME V Art. 4': 'ASME VIII-1 부록 12 / ASME V 제4장', 'AWS D1.1 Table 8.2': 'AWS D1.1 표 8.2',
    'ISO 11666:2018 Tables 2-4': 'ISO 11666:2018 표 2-4', 'ASME BPVC VIII-1 App.12 (12-3), ASME V Art.4': 'ASME BPVC VIII-1 부록 12 (12-3), ASME V 제4장',
    'AWS D1.1/D1.1M Table 8.2 (6.3 in :2010) — statically loaded': 'AWS D1.1/D1.1M 표 8.2 (2010판 6.3) — 정하중', 'statically loaded': '정하중',
    // ------------------------------------------------------------------ v3 (SPEC-v3 §10): menus §8, new windows, dialog paragraphs
    // menu bar — File / Probes / Step Wedge / Weld / Scale Mode / Tools / Options / About / Help
    'Save screen shot (PNG)': '화면 저장 (PNG)', 'Scale Mode': '축척 모드', 'About': '정보',
    'Run to UT Screen Range': 'UT 화면 범위까지', 'Half Skip': '반 스킵', 'Leg colours': '레그 색상',
    'Steps 20-8 mm (2 mm)': '스텝 20-8 mm (2 mm)', 'A5 IOW block': 'A5 IOW 시험편',
    'Root Corrosion': '루트 부식', 'Rough Surface': '표면 거칠기',
    'Misalignment': '맞댐 어긋남 (하이-로우)', 'Misalignment…': '맞댐 어긋남…',
    'Pipe Wall Thickness Variation…': '배관 두께 변동…', 'Pipe Thickness…': '배관 두께…',
    'Adjust Scale…': '축척 조정…', 'Load Pic…': '그림 불러오기…', 'Capture': '캡처',
    'Trace boundary': '경계 추적', 'Skip graduations': '스킵 눈금', 'Exit Scale Mode': '축척 모드 나가기',
    'Draw palette…': '그리기 팔레트…',
    'Show echo depth': '에코 깊이 표시', 'Show A-scan overlay text': 'A-스캔 오버레이 텍스트 표시',
    'Always Show UT Controls': 'UT 조작부 항상 표시', 'Float instrument panel': '탐상기 패널 띄우기',
    'Highlight pointer': '강조 포인터', 'UnCalibrate': '교정 해제', 'Delete EPOCH records': 'EPOCH 기록 삭제',
    'Contents': '목차', 'Demo (OK splash)': '데모 (OK 화면)',
    // procedure presets (Tools ▸ Procedures)
    'ISO 17640 level B / ISO 11666 AL2 — plate 20 mm': 'ISO 17640 레벨 B / ISO 11666 AL2 — 평판 20 mm',
    'ASME VIII App. 12 — pipe 6 in (WT 20)': 'ASME VIII 부록 12 — 배관 6 in (두께 20)',
    'AWS D1.1 — 70° statically loaded (t ≤ 20)': 'AWS D1.1 — 70° 정하중 (t ≤ 20)',
    // window: scale (85-scalemode, F41/F42)
    'ADJUST SCALE': '축척 조정', 'Load Pic': '그림 불러오기', 'Protractor': '각도기', 'Trace': '추적',
    // window: draw (86-annotate, F51)
    'Pencil': '연필', 'Line': '직선', 'Eraser': '지우개',
    'Left button draws red, right button draws blue. Arrow keys move the pen, Space draws, C clears.':
      '왼쪽 버튼은 빨간색, 오른쪽 버튼은 파란색으로 그립니다. 화살표 키로 펜을 이동, Space로 그리기, C로 지우기.',
    // window: pipethk (90-app, F47) / ttinfo (90-app, F19)
    'Pipe Thickness': '배관 두께', 'Thickness': '두께',
    'Enter Thickness between 6mm and 40mm': '6mm와 40mm 사이의 두께를 입력하세요',
    'SHIFT and LEFT or RIGHT CURSOR KEY TO MOVE RECEIVER PROBE':
      'SHIFT + 왼쪽/오른쪽 화살표 키로 수신 탐촉자를 이동합니다',
    // window: defects (80-modes) — F34 storage toggle
    'Browser storage': '브라우저 저장소',
    // window: defect-steps (80-modes, F25) — the STEP 1–5 instruction paragraphs, one key per paragraph
    'STEP 1. Draw a defect in the weld CROSS SECTION within the BLUE BOX.\nDrawing is activated by mouse click and drag over the weld.\n     Use RIGHT mouse to draw single line LOF defect. (right-click menu suppressed)\n     Use LEFT mouse to draw volumetric defects.\n     Use Alt or Ctrl with the RIGHT mouse to erase.':
      'STEP 1. 파란 상자 안의 용접부 단면도에 결함을 그립니다.\n용접부 위에서 마우스를 누른 채 끌면 그리기가 시작됩니다.\n     오른쪽 버튼: 단일선 융합 불량(LOF) 결함 (오른쪽 클릭 메뉴는 억제됨)\n     왼쪽 버튼: 체적(볼륨) 결함\n     Alt 또는 Ctrl + 오른쪽 버튼: 지우기',
    'STEP 2. Draw the defect position on the circle-view (in the gray pipe side view)\n     Eight defect regions can be drawn.\n     Select a defect via the Option buttons.':
      'STEP 2. 원형도(회색 배관 측면도)에 결함 위치를 그립니다.\n     결함 영역은 8개까지 그릴 수 있습니다.\n     옵션 버튼으로 결함을 선택합니다.',
    'STEP 3. Defects can be moved by shifted right/left cursor key to create\nlaminations.':
      'STEP 3. SHIFT + 오른쪽/왼쪽 화살표 키로 결함을 이동하여\n라미네이션을 만들 수 있습니다.',
    'STEP 4. Defect length and separation can set by entering values in the text\nboxes.':
      'STEP 4. 결함 길이와 간격은 텍스트 상자에 값을 입력하여\n설정합니다.',
    'STEP 5. Exit the draw-defect mode by clicking the OK button.':
      'STEP 5. OK 버튼을 눌러 결함 그리기 모드를 끝냅니다.',
    "To alter LOF defects use: SHIFT+ 'Z' or 'X' = Rotate, 'A' or 'S' = change size, 'Q'\nor 'W'":
      "LOF 결함 변경: SHIFT+ 'Z' 또는 'X' = 회전, 'A' 또는 'S' = 크기 변경, 'Q'\n또는 'W'",
    'All defects can be moved with: SHIFT+  LEFT or RIGHT cursor key':
      '모든 결함 이동: SHIFT + 왼쪽 또는 오른쪽 화살표 키',
    'Press F1 to redisplay these instructions': 'F1 키를 누르면 이 안내가 다시 표시됩니다',
    // v3 terminology (§10 table) — used by lessons, the glossary and window hints
    'Beam spread half angle': '빔 확산 반각', 'K factor': 'K 계수 (빔 확산 상수)',
    'Stand-off': '스탠드오프 (입사점 거리)', '20 dB drop': '20 dB 드롭 (10 % 에지)',
    'Root corrosion': '루트 부식', 'Rough surface': '표면 거칠기',
    'Wall thickness variation': '두께 변동', 'Parallel scan': '평행 주사', 'Non-parallel scan': '비평행 주사',
    'mm per pixel': '픽셀당 mm', 'Teaching aid drawing mode': '교육용 그리기 모드',
    'Turn Probe': '탐촉자 돌리기', 'Draw region': '그리기 영역 (파란 상자)',
    'Single-line LOF': '단일선 융합 불량', 'Key code': '키 코드',
    'Chord': '코드(주관)', 'Brace': '브레이스(지관)',
    'Thin standard': '얇은 기준편', 'Thick standard': '두꺼운 기준편', 'Screen shot': '화면 저장',
    // ---- v3 wave 2: the strings the feature owners actually shipped (harvested from src/*.js and from
    // untranslated() with every §8 window open). Grouped by owning module; §10 exemptions are NOT listed here
    // (instrument key legends and softkeys, the on-LCD wizard captions, the plotter degree / BS / K captions
    // and the editor's red canvas captions stay English by contract).
    // 50-tofd (F43/F44)
    'Non-Parallel Scan': '비평행 주사', 'Parallel Scan': '평행 주사', 'Show A-scan': 'A-스캔 표시',
    'Show the TOFD RF A-scan window again': 'TOFD RF A-스캔 창을 다시 표시',
    'Switch the RF A-scan off (the TOFD screen stays)': 'RF A-스캔 끄기 (TOFD 화면은 유지)',
    '2x magnifier of the D-scan around the cursor': '커서 주변 D-스캔 2배 확대',
    // 55-aut (F50) / 56-pa (F24)
    'Set Gates Same Position': '게이트 위치 동일하게 설정',
    'Shoe Stand Off (mm)': '슈 스탠드오프 (mm)', 'Shoe Height (mm)': '슈 높이 (mm)',
    'Distance from the array centre back to the beam index point on the surface': '어레이 중심에서 표면의 입사점(빔 출사점)까지의 거리',
    'Height of the array centre above the surface (the wedge path in the shoe)': '표면에서 어레이 중심까지의 높이 (슈 내부 쐐기 경로)',
    // 10-specimens / 90-app (F45 weld conditions)
    'High-low step (cap side)': '하이-로우 단차 (덧살 쪽)', 'High-low step (root side)': '하이-로우 단차 (루트 쪽)',
    'High-low step': '하이-로우 단차', 'Variation (peak to peak)': '변동량 (피크 대 피크)',
    'Pipe Wall Thickness Variation': '배관 두께 변동',
    'The plate on the +x side of the weld sits this far low. A misaligned root looks like lack of penetration — that is the exercise. 0 = aligned.':
      '용접부 +x 쪽 모재가 이만큼 낮게 놓입니다. 어긋난 루트는 용입 부족처럼 보이며, 그것을 구별하는 것이 이 연습입니다. 0 = 단차 없음.',
    'Pipes only: the wall thins and thickens along the weld, so the backwall walks as the probe travels. 0 = a constant wall.':
      '배관 전용: 용접선을 따라 두께가 얇아졌다 두꺼워지므로 탐촉자가 이동하면 저면 에코가 움직입니다. 0 = 균일한 두께.',
    // 60-view-cross (F31) / 62-view-plan (F29)
    'Draw inside the blue box — drag its edge to move the box': '파란 상자 안에 그리세요 — 상자 가장자리를 끌면 상자를 옮깁니다',
    'Circle-View. Position {z}mm': '원형도. 위치 {z}mm', 'Plate. Position {z}mm': '평판. 위치 {z}mm',
    // 70-instruments (F1/F2/F7/F40)
    'Instrument switched on': '탐상기를 켰습니다',
    'Instrument switched off — the trace is blanked; press OFF again to switch it back on':
      '탐상기를 껐습니다 — 파형이 지워집니다. OFF를 다시 누르면 켜집니다',
    'The set is out of calibration — recalibrate on V1, V2 or the step wedge':
      '교정이 해제되었습니다 — V1, V2 또는 스텝 웨지에서 다시 교정하세요',
    'EPOCH records deleted': 'EPOCH 기록을 삭제했습니다', 'Delete all stored records?': '저장된 기록을 모두 삭제할까요?',
    'LEFT mouse button/drag to draw curve': '마우스 왼쪽 버튼 드래그로 커브를 그리세요',
    'Auto Cal 2/2: press ENTER to confirm the thick standard': '자동 교정 2/2: ENTER를 눌러 두꺼운 기준편을 확정하세요',
    'Flaw detector': '탐상기',
    // 80-modes (F2/F3, F9, F11, F29, F33, F34, F47)
    'Auto Cal 1/2: gate the {d} mm backwall echo, enter the thin standard and press ✓':
      '자동 교정 1/2: {d} mm 저면 에코에 게이트를 맞추고 얇은 기준편 값을 입력한 뒤 ✓를 누르세요',
    'Auto Cal 2/2: move gate 1 onto the {d} mm backwall echo, enter the thick standard and press ✓':
      '자동 교정 2/2: 게이트 1을 {d} mm 저면 에코로 옮기고 두꺼운 기준편 값을 입력한 뒤 ✓를 누르세요',
    'Turn the probe to face the other radius': '탐촉자를 돌려 반대쪽 반경을 향하게 합니다',
    'Click to Select ASME or A5 Block': 'ASME 시험편과 A5 시험편 중에서 선택하세요',
    'ASME Block': 'ASME 시험편', 'A5 Block IOW': 'A5 IOW 시험편',
    'Calibrate for Amplitude and draw DAC': '에코 높이(감도)를 교정하고 DAC를 작성합니다',
    'Plot Beam Spread on the Plotter and check Resolution': '플로터에서 빔 확산을 그리고 분해능을 확인합니다',
    'KEY PREVENTS STUDENTS SEEING THE DEFECT': '키 코드를 걸면 교육생이 결함을 볼 수 없습니다',
    'Key code will be used to SHOW the defect': '이 키 코드를 입력해야 결함이 다시 표시됩니다',
    'NO KEY': '키 없음',
    // F33 unlock path (80-modes hideKeyAsk(false)): its own window title and two lines
    'SHOW DEFECTS': '결함 표시 (SHOW DEFECTS)',
    'Enter the key code to SHOW the defects': '결함을 다시 표시하려면 키 코드를 입력하세요',
    'The defects stay hidden until the key code matches': '키 코드가 일치할 때까지 결함은 계속 숨겨집니다',
    'Spot size (mm)': '스폿 지름 (mm)',
    'Procedure lock: only the probes of the applied procedure can be selected while the trade test runs.':
      '절차서 잠금: 실기 시험 중에는 적용된 절차서의 탐촉자만 선택할 수 있습니다.',
    'Load / Save through localStorage instead of a file': '파일 대신 브라우저 저장소(localStorage)로 불러오기/저장',
    'Use LEFT mouse button to place the DEFECT on the joint.': '마우스 왼쪽 버튼으로 이음부에 결함을 배치하세요.',
    'Click the DEFECT button to resume UT.': 'DEFECT 버튼을 누르면 UT 탐상으로 돌아갑니다.',
    // 82-lessons (F58 video → lesson map)
    'Video → lesson map': '비디오 → 레슨 대응표', 'Video': '비디오', 'Subject': '주제',
    'UTsim has no video window: the 17 original UTman videos are reproduced step by step by the 25 guided lessons (Help ▸ Lessons…) and the echo quiz.':
      'UTsim에는 비디오 창이 없습니다. 원본 UTman 비디오 17편의 내용은 25개 안내 레슨(도움말 ▸ 레슨…)과 에코 퀴즈로 단계별로 재현했습니다.',
    'Lessons {list} have no video of their own (V1 block, AUT, trade test, reference level, transfer correction, sensitivity re-check).':
      '레슨 {list}에는 대응하는 비디오가 없습니다 (V1 시험편, AUT, 실기 시험, 기준 레벨, 전달 손실 보정, 감도 재확인).',
    'Basic UT controls: Range, X-shift, Amplitude': '기본 UT 조작: 측정 범위, X-시프트, 에코 높이',
    'Plotting Beam Spread at 20 %': '20 %에서의 빔 확산 플로팅',
    'Angleprobe Calibration (DAC and beam spread)': '사각 탐촉자 교정 (DAC와 빔 확산)',
    // 84-trade
    'Report already submitted — the exam is over': '보고서를 이미 제출했습니다 — 시험이 종료되었습니다',
    // 85-scalemode (F41/F42)
    'mm/px': 'mm/픽셀', 'Finer scale': '축척 정밀하게 (mm/픽셀 감소)', 'Coarser scale': '축척 거칠게 (mm/픽셀 증가)',
    'Close the traced boundary': '추적한 경계 닫기', 'Graduation step in mm': '눈금 간격 (mm)',
    '{n} points — double-click or OK to close': '{n}개 점 — 두 번 클릭하거나 확인을 눌러 닫습니다',
    'Boundary: {n} points': '경계: {n}개 점',
    'Load a picture or pick a shape, then Trace': '그림을 불러오거나 형상을 고른 뒤 경계를 추적하세요',
    'Butt weld': '맞대기 용접부', 'Single-bevel prep': '단일 베벨 개선', 'Pipe ring': '배관 링', 'Ellipse': '타원',
    'Step wedge': '스텝 웨지', 'OK letters': 'OK 글자',
    // 86-annotate (F51)
    'TEACHING AID DRAWING MODE — LEFT mouse draws red, RIGHT mouse draws blue. SHIFT+F12 again to clear and exit.':
      '교육용 그리기 모드 — 마우스 왼쪽은 빨간색, 오른쪽은 파란색으로 그립니다. SHIFT+F12를 다시 누르면 지우고 나갑니다.',
    '... you used SHIFT F12 secret control to DRAW on screen....': '... SHIFT F12 숨은 기능으로 화면에 그리기를 켰습니다 ....',
    'press SHIFT F12 again to turn this feature off.': 'SHIFT F12를 다시 누르면 이 기능이 꺼집니다.',
    'Right Mouse Blue,  Left mouse Red.': '오른쪽 버튼은 파란색, 왼쪽 버튼은 빨간색.',
    'Ctrl+Shift+D does the same, and Tools ▸ Draw palette opens the pencil, line and eraser tools.':
      'Ctrl+Shift+D도 같은 기능이며, 도구 ▸ 그리기 팔레트에서 연필·직선·지우개 도구를 엽니다.',
    // 90-app (F54 capture, F55 Help ▸ Contents index)
    'Nothing to capture yet.': '아직 캡처할 화면이 없습니다.',
    'Help contents — the same pages the menus reach.': '도움말 목차 — 메뉴에서 열리는 것과 같은 항목입니다.',
    'Welcome': '시작하기', 'User Interface': '사용자 인터페이스', 'Amplitude Gate': '에코 높이 게이트',
    'MAPS': 'MAPS (B-스캔 맵)', 'Keys': '키 조작', 'UT Sets': 'UT 세트', 'License': '라이선스', 'Off': '끔',
    // ---- v3 wave 3: strings reached through t() at run time (harvested by wrapping UT.i18n.t and driving every
    // window, mode, menu and UT.test entry point) — status hints, tooltips, error/notice lines.
    // 45-standards / 55-aut / 56-pa
    'AWS requires 2–2.5 MHz, 15–25 mm crystals for the standard procedure': 'AWS 표준 절차는 2–2.5 MHz, 15–25 mm 진동자를 요구합니다',
    'Width': '폭', 'C-scan (encoded)': 'C-스캔 (엔코더 기록)',
    // 50-tofd tooltips (F43/F44)
    'Mode-converted backwall (L-S Fermat path), S-S replica and converted tip signals': '모드 변환 저면 (L-S 페르마 경로), S-S 복제 및 변환된 팁 신호',
    'Align the lateral wave of the D-scan to a flat line': 'D-스캔의 측면파를 수평 직선으로 정렬',
    'Shade the lateral-wave and backwall dead zones': '측면파와 저면 불감대를 음영으로 표시',
    'Press Run Scan to build the D-scan. Click on the D-scan to move the probe': 'Run Scan을 누르면 D-스캔이 만들어집니다. D-스캔을 클릭하면 탐촉자가 이동합니다',
    // 66-view-plotter status hints (F35/F36)
    'LEFT mouse button/Drag to mark points on plotter. Right button to mark Beam Spread': '마우스 왼쪽 버튼 드래그로 플로터에 점을 표시하고, 오른쪽 버튼으로 빔 확산을 표시합니다',
    'RIGHT OR LEFT mouse button/Drag to PLOT Beam Spread on Plotter. Draw on Block to mark 10% Beam Edge': '마우스 오른쪽 또는 왼쪽 버튼 드래그로 플로터에 빔 확산을 그리고, 시험편 위에 10 % 빔 에지를 표시합니다',
    'Use mouse button on the Plotter to plot Beam Spread. Draw on Block to mark 10% Beam Edge': '플로터에서 마우스 버튼으로 빔 확산을 그리고, 시험편 위에 10 % 빔 에지를 표시하세요',
    // plotting-card captions drawn on the canvas (F49 / plotting_beam_spread_at_20): the angle legend and the
    // BS read-out. '{a} degree' keeps the original's word 'degree' as 도; the BS token stays Latin (a card legend).
    'Beam spread half angle BS = {bs}°': '빔 확산 반각 BS = {bs}°', '{a} degree': '{a} 도',
    // 70-instruments (F1/F2/F5/F6 tips)
    'Switch the set on / off (the trace is blanked while it is off)': '탐상기 켜기/끄기 (꺼져 있는 동안 파형이 지워집니다)',
    'Set the range to {r} mm': '측정 범위를 {r} mm로 설정',
    'Turn {k} down ×10': '{k} 10배 낮추기', 'Turn {k} up ×10': '{k} 10배 높이기',
    'AMP — receiver gain (drag or wheel: ±0.5 dB, Shift ×10)': 'AMP — 수신 게인 (드래그 또는 휠: ±0.5 dB, Shift ×10)',
    'Confirm the thin-standard value': '얇은 기준편 값 확정', 'Confirm the thick-standard value': '두꺼운 기준편 값 확정',
    'Cancel the calibration': '교정 취소', 'Auto Cal is not available': '자동 교정을 사용할 수 없습니다',
    'Place the probe on a step, then press Auto Cal (EPOCH 600) for the two-point calibration':
      '탐촉자를 스텝 위에 놓고 Auto Cal (EPOCH 600)을 눌러 2점 교정을 실행하세요',
    // 80-modes (F9, F28, F33, F34, F41, F45, F46)
    // F29 defect-editor caption: {p} is the pending VOL / LOF prefix, {n} the defect slot (both stay verbatim).
    '{p}  Defect Num {n}, DRAW DEFECT ON CROSS SECTION BELOW': '{p}  결함 번호 {n}, 아래 단면도에 결함을 그리십시오',
    'Auto (from stroke)': '자동 (그린 획에서 판정)',
    'Eraser: drag over a defect to remove its points': '지우개: 결함 위를 끌면 점이 지워집니다',
    'LEFT or RIGHT mouse button to change probe direction': '마우스 왼쪽 또는 오른쪽 버튼으로 탐촉자 방향을 바꿉니다',
    'Drag the probe onto the top face (100mm Radius) or the front face (25mm thickness)': '탐촉자를 윗면(반경 100 mm) 또는 앞면(두께 25 mm)으로 끌어 놓으세요',
    'Drag the probe onto the top face (50mm Radius) or the front face (12.5mm thickness)': '탐촉자를 윗면(반경 50 mm) 또는 앞면(두께 12.5 mm)으로 끌어 놓으세요',
    'Drag the probe onto the top face (25mm Radius) or the front face (12.5mm thickness)': '탐촉자를 윗면(반경 25 mm) 또는 앞면(두께 12.5 mm)으로 끌어 놓으세요',
    'Adjust the brace angle in ADJUST MODE. LEFT mouse button/drag to move the UT Probe': '조정 모드에서 브레이스 각도를 맞추세요. 마우스 왼쪽 버튼 드래그로 탐촉자를 이동합니다',
    'Set the gates (Level / Width / Start) then press Run Scan': '게이트(레벨 / 폭 / 시작)를 설정한 뒤 Run Scan을 누르세요',
    // F41/F57 verbatim wording — re-keyed to match UT.modes.hints.scale (src/80-modes.js).
    'Load a picture, set the scale, then LEFT mouse button/drag to move the UT Probe': '그림을 불러오고 축척을 설정한 뒤, 마우스 왼쪽 버튼 드래그로 탐촉자를 이동합니다',
    'Plate chord: the flat chord of the v1 / v2 T-joint': '평판 코드: v1 / v2 T형 이음의 평평한 주관',
    'T-joint: curved chord of the given diameter with an angled brace': 'T형 이음: 지정한 지름의 곡면 주관에 경사진 브레이스',
    'Pipe: the complete ring, scanned on the OD': '배관: 완전한 링 — 외경 면에서 주사',
    'Defects hidden': '결함을 숨겼습니다',
    'Defects hidden — the key code is needed to show them again': '결함을 숨겼습니다 — 다시 표시하려면 키 코드가 필요합니다',
    'Wrong key code': '키 코드가 틀렸습니다', 'Could not read that file': '파일을 읽을 수 없습니다',
    // 82-lessons (v3 lesson steps)
    'Angle check on the 5 mm hole (60° graduation)': '5 mm 횡공으로 각도 확인 (60° 눈금)',
    'At the maximum the index point shows the true refracted angle on the scale.': '에코가 최대일 때 입사점이 눈금 위의 실제 굴절각을 가리킵니다.',
    'The scale value under the index point at the maximum is the true angle.': '에코가 최대일 때 입사점 아래 눈금 값이 실제 굴절각입니다.',
    // 85-scalemode (F41/F42)
    'A traced boundary needs at least 3 points': '추적한 경계에는 점이 3개 이상 필요합니다',
    'Click the boundary corners, then double-click or press OK to close it': '경계의 모서리를 차례로 클릭한 뒤, 두 번 클릭하거나 확인을 눌러 닫으세요',
    'Boundary traced — LEFT mouse button/drag to move the UT Probe': '경계를 추적했습니다 — 마우스 왼쪽 버튼 드래그로 탐촉자를 이동하세요',
    'Picture loaded — set mm per pixel, then trace the boundary': '그림을 불러왔습니다 — 픽셀당 mm를 설정한 뒤 경계를 추적하세요',
    'Screen captured — set mm per pixel, then trace the boundary': '화면을 캡처했습니다 — 픽셀당 mm를 설정한 뒤 경계를 추적하세요',
    'Only a picture file from this computer can be loaded': '이 컴퓨터에 있는 그림 파일만 불러올 수 있습니다',
    'Picture too large — use one under 4 MB': '그림이 너무 큽니다 — 4 MB 미만인 파일을 사용하세요',
    'That file could not be read as a picture': '그 파일은 그림으로 읽을 수 없습니다',
    'That screen could not be captured': '화면을 캡처할 수 없습니다',
    'There is nothing on screen to capture': '캡처할 화면 내용이 없습니다',
    'This outline is too thin to carry a pipe wall': '이 외형은 너무 얇아 배관 두께를 만들 수 없습니다',
    'Trace or choose a boundary first, then press Pipe': '먼저 경계를 추적하거나 형상을 고른 뒤 파이프를 누르세요',
    'Drag the protractor by its face to move it, by its rim to turn it (Shift = 1° steps)': '각도기는 면을 끌면 이동하고 테두리를 끌면 회전합니다 (Shift = 1° 단위)',
    // 86-annotate palette colours
    'Red': '빨간색', 'Blue': '파란색',
    // 90-app (F19/F54)
    'Could not save the screen shot': '화면을 저장하지 못했습니다',
    'Receiver off the scanning surface': '수신 탐촉자가 주사면을 벗어났습니다',
    'You can attach this file to an email and send it to other UTsim users': '이 파일을 이메일에 첨부해 다른 UTsim 사용자에게 보낼 수 있습니다',
    // ---- v3 wave 4: keys reached only while driving the 25 lessons, the echo quiz and the trade test
    'Perspex insert': '퍼스펙스 삽입물', 'point-like (slightly extended)': '점상 (약간 연장된)',
    'Corner (defect + surface)': '코너 (결함 + 표면)', 'cap-toe': '덧살 지단(토우)', 'not recordable': '기록 불요',
    'Overall layout and the Options ▸ UT Set switch': '전체 화면 구성과 옵션 ▸ UT 세트 전환',
    'DAC point {n} recorded at {path} mm, {amp}% — record another point': 'DAC {n}번째 점을 빔 노정 {path} mm, {amp}%에서 기록했습니다 — 다음 점을 기록하세요',
    'DAC point {n} recorded at {path} mm, {amp}%': 'DAC {n}번째 점을 빔 노정 {path} mm, {amp}%에서 기록했습니다',
    'DAC −6 dB (50 %) / −14 dB (20 %) curves drawn': 'DAC −6 dB (50 %) / −14 dB (20 %) 커브를 그렸습니다',
    'Trade Test: find the hidden defects, fill in the report table and press Submit': '실기 시험: 숨겨진 결함을 찾아 보고서 표를 채우고 제출을 누르세요',
    'Gate Setup': '게이트 설정',
    'UT SET: KRAUTKRÄMER USK 7 (analogue)': 'UT 세트: KRAUTKRÄMER USK 7 (아날로그)', '(analogue)': '(아날로그)', 'ASME text screen': 'ASME 텍스트 화면',
  };

  // ------------------------------------------------------------------ glossary (§5.6: {term, ko, en, defKo, defEn, see})
  const G = function (term, ko, defEn, defKo, see) { return { term, ko, en: term, defEn, defKo, see: see || [] }; };
  const glossary = [
    // the 20 binding examples of §5.6 (verbatim)
    G('Backwall echo', '저면 에코', 'Reflection from the far surface; its loss indicates a lamination or coupling problem', '뒷면(저면)에서의 반사. 소실되면 라미네이션이나 접촉 불량을 의심', [3, 5]),
    G('Angle probe', '사각 탐촉자', 'shear-wave probe with a Perspex wedge, 45/60/70°', '퍼스펙스 쐐기로 횡파를 비스듬히 입사시키는 탐촉자', [4]),
    G('Refracted angle', '굴절각', 'angle of the beam in steel (Snell)', '강 내부 빔의 각도', [14]),
    G('Index point', '입사점', 'point where the beam leaves the wedge; checked on the V1 100 mm radius', '빔이 쐐기를 떠나는 점', [4, 6]),
    G('Sensitivity / reference level', '감도 / 기준 감도', 'gain at which the reference reflector reads the reference height', '기준 반사체가 기준 높이로 읽히는 게인', [7, 20, 23]),
    G('Indication', '지시', 'any signal that needs interpretation – not yet a defect', '해석이 필요한 신호, 아직 결함이 아님', [21]),
    G('Dead zone', '불감대', 'region under the initial pulse where nothing can be detected', '초기 펄스에 가려 탐지 불가능한 영역', [3]),
    G('Near field', '근거리 음장', 'N = a²f/(4v); amplitudes are unreliable inside it', '진폭이 불안정한 근거리 영역', [9]),
    G('Beam spread', '빔 확산', 'divergence beyond the near field; plotted at 20 dB', '근거리 음장 이후의 퍼짐', [9]),
    G('Skip', '스킵', 'half skip = to the backwall, full skip = back to the surface', '0.5 스킵 = 저면까지, 1 스킵 = 다시 표면까지', [8]),
    G('DAC', '거리 진폭 보정 곡선', 'curve of the reference SDH echo vs distance', '기준 횡공의 거리별 에코 높이 곡선', [20]),
    G('TCG', '시간 보정 게인', 'gain vs time that flattens the DAC', 'DAC를 평탄하게 만드는 시간별 게인', []),
    G('SDH', '횡공', 'side-drilled hole reference reflector (3 mm, ISO)', '측면 드릴 구멍 기준 반사체', []),
    G('FBH / DGS', '평저공 / DGS 선도', 'flat-bottom hole; disc-equivalent size', '원판 등가 크기 산정', []),
    G('Corner echo', '코너 에코', 'strong echo from a surface-breaking defect and the backwall (90° corner)', '표면 개구 결함과 저면이 이루는 모서리 반사', [11]),
    G('Tip diffraction', '팁 회절(단부 에코)', 'weak echo from a crack tip; used for height', '균열 끝에서의 약한 회절 에코, 높이 측정', [13]),
    G('Mode conversion', '모드 변환', 'S↔L conversion at surfaces → spurious echoes', '표면·결함에서의 파 변환 → 의사 지시', []),
    G('Surface wave', '표면파', 'Rayleigh wave from steep wedges; damped by a finger', '손가락으로 감쇠되는 표면 진행파', []),
    G('Geometry echo', '형상 에코', 'root bead / cap / backing bar reflections – plot before calling a defect', '이면 비드·덧살·배킹 바 반사 – 결함 판정 전 플로팅', []),
    G('Transfer correction', '전달 손실 보정', 'dB added for surface/attenuation differences between block and part', '시험편과 대비 시험편의 차이를 보정하는 dB', [24]),
    // probes, wedges, beam
    G('Compression wave (L)', '종파', 'longitudinal wave: particle motion along the beam; 0° probes, 5.92 mm/µs in steel', '입자가 진행 방향으로 진동하는 파. 0° 탐촉자, 강에서 5.92 mm/µs', [3, 14]),
    G('Shear wave (S)', '횡파', 'transverse wave: particle motion across the beam; angle probes, 3.23 mm/µs in steel', '입자가 진행 방향에 수직으로 진동하는 파. 사각 탐촉자, 강에서 3.23 mm/µs', [14]),
    G('Wedge angle', '쐐기각', 'incident angle in the Perspex shoe; Snell converts it to the refracted angle in steel', '퍼스펙스 슈 안의 입사각. 스넬의 법칙으로 강 내 굴절각이 정해짐', [14]),
    G('Critical angle', '임계각', 'first critical angle: no compression wave in steel (≈ 27.6° in Perspex); second: no shear wave (≈ 57°)', '제1 임계각: 강 내 종파 소멸(퍼스펙스 ≈ 27.6°), 제2 임계각: 횡파 소멸(≈ 57°)', [14]),
    G('Twin crystal probe', '이중 진동자 탐촉자', 'separate transmitter and receiver: no initial-pulse dead zone, roof angle gives a focus zone', '송·수신 진동자 분리: 초기 펄스 불감대가 없고 루프각으로 집속 영역이 생김', [3]),
    G('Initial pulse', '초기 펄스', 'transmitter ringing at the start of the trace (single-crystal probes)', '트레이스 시작부의 송신 펄스 잔향(단일 진동자)', [3]),
    G('Focused beam', '집속 빔', 'beam narrowed to a focal depth F inside the near field', '근거리 음장 안의 집속 깊이 F에 빔을 모음', []),
    G('Side lobes', '사이드 로브', 'weak secondary beams beside the main lobe; source of spurious echoes', '주빔 옆의 약한 부빔. 의사 지시의 원인', []),
    G('Finger damping', '손가락 감쇠', 'touching the surface with a wet finger damps a surface wave – proves the echo is not a defect', '젖은 손가락으로 표면을 누르면 표면파가 감쇠됨 – 에코가 결함이 아님을 확인', []),
    G('Skew', '스큐', 'rotation of the probe about its vertical axis relative to the weld', '용접선에 대한 탐촉자의 수평 회전각', [1]),
    G('Sound path (SP)', '빔 노정', 'distance travelled by the beam from the index point to the reflector', '입사점에서 반사체까지 빔이 진행한 거리', [8]),
    G('Surface distance', '표면 거리', 'horizontal distance from the index point to the reflector (SP·sin θ)', '입사점에서 반사체까지의 수평 거리 (SP·sin θ)', [8]),
    G('Depth', '깊이', 'vertical distance of the reflector below the scanning surface (SP·cos θ)', '주사면 아래 반사체까지의 수직 거리 (SP·cos θ)', [8]),
    G('Attenuation', '감쇠', 'loss of sound energy with distance (absorption + scattering), dB/mm; large in austenitic steel', '거리에 따른 음압 손실(흡수 + 산란), dB/mm. 오스테나이트계에서 큼', [24]),
    G('Couplant', '접촉 매질', 'gel/oil that transmits sound from the probe into the part', '탐촉자와 시험체 사이에서 음파를 전달하는 젤/오일', []),
    // instrument
    G('Gain', '게인(이득)', 'amplification of the receiver in dB; +6 dB doubles the echo height', '수신기 증폭도(dB). +6 dB이면 에코 높이 2배', [7]),
    G('Range', '측정 범위(레인지)', 'sound path covered by the full screen width', '화면 전체 폭에 해당하는 빔 노정', [2]),
    G('Delay (X-shift)', '지연(X-시프트)', 'shifts the start of the trace; used to zero the probe delay', '트레이스 시작을 이동. 탐촉자 지연 영점 조정에 사용', [2]),
    G('Reject (suppression)', '리젝션(억제)', 'cuts off low-amplitude signals (grass); forbidden by most standards during evaluation', '낮은 진폭 신호(임상 에코)를 잘라냄. 평가 시 대부분의 규격에서 금지', [2]),
    G('Gate', '게이트', 'time window on the A-scan that produces the readouts and the alarm', '판독값과 경보를 만드는 A-스캔 상의 시간 창', [11]),
    G('Gate alarm', '게이트 경보', 'signal when an echo inside the gate crosses the gate level', '게이트 안의 에코가 게이트 레벨을 넘으면 발생하는 신호', [11]),
    G('Peak memory', '피크 메모리', 'envelope of the maximum echo height while scanning', '주사하는 동안의 최대 에코 높이 포락선', [11]),
    G('Freeze', '프리즈', 'holds the current A-scan on screen', '현재 A-스캔을 화면에 고정', [11]),
    G('Auto calibration', '자동 교정', 'two-point velocity and zero calibration on two known thicknesses', '두 기지 두께로 음속과 영점을 자동 교정', [12]),
    G('Echo height (% FSH)', '에코 높이 (%)', 'amplitude in percent of full screen height', '전체 화면 높이에 대한 진폭 백분율', [7]),
    G('dB drop', 'dB 드롭', '6 dB drop = half height; 20 dB drop = 10 % – used for length and beam-edge sizing', '6 dB 드롭 = 절반 높이, 20 dB 드롭 = 10 % – 길이·빔 에지 크기 측정에 사용', [9, 10]),
    G('Datalogger', '데이터로거', 'stores readouts (SP, SD, DP, dB) for the report', '보고서용 판독값(SP, SD, DP, dB)을 저장', []),
    G('Compare trace', '비교 트레이스', 'frozen reference A-scan shown in grey behind the live trace', '실시간 트레이스 뒤에 회색으로 표시되는 고정 기준 A-스캔', []),
    // calibration blocks and standards
    G('IIW V1 block', 'IIW 표준 시험편 (STB-A1)', '100 mm radius, 25 mm thickness, 1.5 mm hole, 50 mm Perspex insert – range, index and angle checks', '100 mm 반경, 25 mm 두께, 1.5 mm 구멍, 50 mm 퍼스펙스 – 측정 범위·입사점·굴절각 확인', [4]),
    G('V2 block', '소형 표준 시험편 (STB-A3)', '25 / 50 mm radii, 5 mm hole, 12.5 mm thick – portable index and angle check', '25 / 50 mm 반경, 5 mm 구멍, 12.5 mm 두께 – 휴대용 입사점·각도 확인', [6]),
    G('Reference block', '대비 시험편', 'block with SDH / FBH reflectors used to set the reference sensitivity (DAC, IOW)', '기준 감도를 설정하는 횡공/평저공이 있는 시험편 (DAC, IOW)', [20]),
    G('Step wedge', '스텝 웨지', 'stepped block for 0° range / zero calibration', '0° 측정 범위 / 영점 교정용 계단형 시험편', [12]),
    G('IOW block', 'IOW 시험편', 'Institute of Welding block with SDHs for beam-profile plotting', '빔 프로파일 플로팅용 횡공이 있는 IOW 시험편', [9]),
    G('Recording level', '기록 레벨', 'echo height above which an indication must be recorded (e.g. DAC −10 dB)', '지시를 기록해야 하는 에코 높이 (예: DAC −10 dB)', [21]),
    G('Evaluation level', '평가 레벨', 'level at which length is measured with the fixed-level method', '평가 레벨 고정법으로 길이를 재는 레벨', [21]),
    G('Acceptance level', '허용 수준', 'combination of echo height and length that decides accept / reject (ISO 11666 AL2/AL3)', '합격/불합격을 결정하는 에코 높이와 길이의 조합 (ISO 11666 AL2/AL3)', [21]),
    G('Disposition', '판정', 'accept / reject / record / not recordable', '합격 / 불합격 / 기록 / 기록 불요', [21]),
    G('Testing level', '검사 레벨', 'ISO 17640 level A–D: scanning coverage and sensitivity required', 'ISO 17640 레벨 A–D: 요구되는 주사 범위와 감도', [23]),
    G('Procedure', '절차서', 'written instruction: standard, levels, blocks, probes, gain – applied in one step here', '규격·레벨·시험편·탐촉자·게인을 정한 문서 – 여기서는 한 번에 적용', [23]),
    G('Scanning sensitivity', '주사 감도', 'reference gain plus extra dB for scanning (e.g. +6 dB), reduced back for evaluation', '기준 게인에 주사용 dB를 더한 값(예: +6 dB). 평가 시 다시 낮춤', [23]),
    G('Echo-dynamic pattern', '에코 다이내믹 패턴', 'ISO 23279: 1 point-like, 2 extended smooth, 3 extended rough – helps to classify the indication', 'ISO 23279: 1 점상, 2 연장 매끄러움, 3 연장 거침 – 지시 분류에 도움', [22]),
    // weld and defects
    G('Weld preparation', '개선 형상', 'single-V, double-V, K, J, backing bar, fillet T, nozzle – decides which geometry echoes exist', '단일 V, 양면 V, K, J, 배킹 바, 필릿 T, 노즐 – 어떤 형상 에코가 있는지 결정', [8]),
    G('Root', '루트', 'bottom of the weld; root bead, incomplete penetration and root cracks live here', '용접부 바닥. 이면 비드, 용입 부족, 루트 균열이 있는 곳', [11]),
    G('Cap (reinforcement)', '덧살(여성)', 'excess weld metal on top; gives cap echoes at the full skip', '윗면의 여분 용착 금속. 1 스킵에서 덧살 에코를 만듦', [8]),
    G('Toe', '토우(지단)', 'junction of cap and parent plate; toe cracks and toe LOF', '덧살과 모재의 경계. 토우 균열과 토우 융합 불량', [8]),
    G('Lack of fusion', '융합 불량', 'planar defect on the fusion face; best seen with the beam normal to the bevel', '융합면의 면상 결함. 개선면에 수직으로 빔을 넣으면 가장 잘 보임', [10, 19]),
    G('Incomplete penetration', '용입 부족', 'root not fused; strong corner echo from both sides', '루트가 용융되지 않음. 양쪽에서 강한 코너 에코', [11]),
    G('Porosity', '기공', 'gas pores; low, multiple, rounded echoes', '가스 기포. 낮고 여러 개인 둥근 에코', [10]),
    G('Slag inclusion', '슬래그 혼입', 'non-metallic inclusion; irregular echo that changes with probe angle', '비금속 개재물. 탐촉자 각도에 따라 변하는 불규칙한 에코', [10]),
    G('Crack', '균열', 'planar, often surface-breaking; corner echo + tip diffraction', '면상, 흔히 표면 개구. 코너 에코 + 팁 회절', [13]),
    G('Lamination', '라미네이션', 'rolling defect parallel to the plate surface; 0° echo at mid-thickness and lost backwall', '판 표면에 평행한 압연 결함. 0°에서 중간 두께 에코와 저면 에코 소실', [5]),
    G('Backing bar', '배킹 바', 'strip under the root; its echoes are geometry, not defects', '루트 아래의 판. 그 에코는 결함이 아니라 형상', [8]),
    G('Planar / volumetric', '면상 / 체적형', 'planar = crack, LOF, IP (orientation-sensitive); volumetric = porosity, slag', '면상 = 균열·융합 불량·용입 부족(방향 의존), 체적형 = 기공·슬래그', [21]),
    G('Through-wall height', '높이(두께 방향 치수)', 'vertical extent of a defect, sized by tip diffraction or 20 dB drop', '결함의 두께 방향 크기. 팁 회절이나 20 dB 드롭으로 측정', [13]),
    G('Spurious indication', '의사 지시', 'signal not from a discontinuity: mode conversion, surface wave, side lobe, geometry', '불연속에서 오지 않은 신호: 모드 변환, 표면파, 사이드 로브, 형상', [22]),
    // TOFD / PA / AUT
    G('TOFD', 'TOFD', 'time-of-flight diffraction: L-wave pitch-catch pair; lateral wave, backwall and tip signals', '비행 시간 회절법: 종파 송수신 쌍. 측면파, 저면파, 팁 신호', [13]),
    G('Lateral wave', '측면파', 'TOFD signal running just under the surface between the probes', '탐촉자 사이의 표면 바로 아래를 지나는 TOFD 신호', [13]),
    G('PCS', 'PCS (탐촉자 중심 간격)', 'probe centre separation; 2/3 T rule puts the crossing at 2/3 depth', '탐촉자 중심 간격. 2/3 T 규칙은 빔 교차점을 2/3 깊이에 둠', [13]),
    G('D-scan', 'D-스캔', 'TOFD image: A-scans stacked along the weld, time down', 'TOFD 영상: 용접선을 따라 A-스캔을 쌓고 시간은 아래로', [13]),
    G('Phased array', '위상배열', 'multi-element probe steered and focused by delay laws', '지연 법칙으로 조향·집속하는 다중 엘리먼트 탐촉자', []),
    G('Sector scan (S-scan)', '섹터 스캔', 'phased-array image over an angle sweep (e.g. 40–70°)', '각도 스윕(예: 40–70°)에 걸친 위상배열 영상', []),
    G('Focal law', '포컬 로', 'set of element delays for one angle / focus', '한 각도 / 집속에 대한 엘리먼트 지연 세트', []),
    G('AUT', 'AUT', 'automated UT: encoded scan with strip charts (amplitude, TOF) and a C-scan map', '자동 초음파 탐상: 스트립 차트(진폭, TOF)와 C-스캔 맵이 있는 인코더 스캔', []),
    G('B-scan', 'B-스캔', 'side view built from A-scans along one axis', '한 축을 따라 A-스캔을 쌓은 측면도', []),
    G('C-scan', 'C-스캔', 'plan-view map of amplitude / depth', '진폭 / 깊이의 평면 맵', []),
    // training
    G('Trade test', '실기 시험', 'timed blind test: find, size and report hidden defects; pass mark 70 %', '제한 시간 블라인드 시험: 숨겨진 결함을 찾아 크기를 재고 보고. 합격 70 %', [25]),
    G('Scenario', '시나리오', 'saved teaching set-up (specimen, defects, probe, instrument) that can be shared as a link', '링크로 공유할 수 있는 저장된 교육 설정(시험체, 결함, 탐촉자, 탐상기)', []),
    G('Share link', '공유 링크', 'URL that carries the whole scenario or a seed-only exam', '시나리오 전체 또는 시드만 담은 시험을 전달하는 URL', []),
    G('Plotting', '플로팅', 'drawing the beam path on the cross-section to locate an indication against the weld geometry', '단면도에 빔 경로를 그려 지시를 용접부 형상에 대응시키는 것', [8, 9]),
    G('Coverage', '주사 범위', 'fraction of the weld volume actually scanned from both sides', '실제로 양면에서 주사한 용접부 체적의 비율', [25]),
    // v3 (SPEC-v3 §10) — new terminology required by the beam-spread, weld-condition and scale-mode features
    G('Beam spread half angle', '빔 확산 반각', 'half the angle of the beam at the 20 dB (10 %) edge, measured on the plotting card', '플로팅 카드에서 20 dB(10 %) 에지로 측정한 빔 각도의 절반', [8]),
    G('K factor', 'K 계수 (빔 확산 상수)', 'beam-spread constant: half-width of the beam per unit beam path at a stated drop', '규정된 드롭에서 빔 경로 단위길이당 빔 반폭을 주는 빔 확산 상수', [8]),
    G('Stand-off', '스탠드오프 (입사점 거리)', 'distance from the probe index (beam exit) point to the weld centre-line on the scanning surface', '주사면에서 탐촉자 입사점부터 용접부 중심선까지의 거리', [8, 9]),
    G('Root corrosion', '루트 부식', 'bumpy, corroded root bead that returns geometry echoes easily mistaken for a root defect', '울퉁불퉁하게 부식된 이면 비드 — 루트 결함으로 오인하기 쉬운 형상 에코를 냅니다', [11]),
    G('Misalignment (high-low)', '맞댐 어긋남 (하이-로우)', 'step between the two plate surfaces at the joint; the step edge gives its own corner echo', '이음부에서 두 모재 표면 사이의 단차 — 단차 모서리가 자체 코너 에코를 냅니다', [11]),
    G('Parallel scan', '평행 주사', 'TOFD scan along the weld axis with the probe pair straddling it, as opposed to the non-parallel scan across it', '탐촉자 쌍이 용접부를 사이에 두고 용접선 방향으로 이동하는 TOFD 주사 (횡단하는 비평행 주사와 대비)', [20]),
    G('Corner echo at the scanning surface', '주사면 코너 에코', 'full corner reflection from a surface-breaking defect meeting the scanning surface at a right angle; tilting either face by α rotates the return by 2α out of the aperture', '주사면과 직각으로 만나는 표면 개구 결함의 완전한 코너 반사 — 어느 한 면이 α 기울면 반사는 2α 회전하여 개구를 벗어납니다', [12]),
    G('Scale mode', '축척 모드', 'drawing mode in which an imported picture or traced outline is calibrated in mm per pixel and used as the specimen', '불러온 그림이나 추적한 외형을 픽셀당 mm로 교정하여 시험체로 사용하는 그리기 모드', []),
    G('Protractor', '각도기', 'on-screen angle scale placed on the cross-section to measure drawn beam and defect angles', '단면도 위에 놓아 그려진 빔과 결함의 각도를 재는 화면 각도기', []),
    G('Thin/thick standard', '얇은/두꺼운 기준편', 'the two known thicknesses (or backwall paths) an auto-calibration asks for before it solves velocity and zero', '자동 교정이 속도와 제로를 풀기 전에 요구하는 두 개의 기지 두께(또는 저면 경로)', [3]),
    G('Rough surface', '표면 거칠기', 'as-welded or corroded scanning surface: it costs transfer, raises the grass and makes coupling unstable', '용접 그대로이거나 부식된 주사면 — 전달 손실이 커지고 임상 에코가 올라가며 접촉이 불안정해집니다', [11]),
    G('Wall thickness variation', '두께 변동', 'pipe wall that thins and thickens along the weld, so the backwall echo walks as the probe travels', '용접선을 따라 얇아졌다 두꺼워지는 배관 두께 — 탐촉자가 이동하면 저면 에코가 움직입니다', [11]),
    G('Teaching aid drawing mode', '교육용 그리기 모드', 'SHIFT+F12 overlay an instructor draws on: red with the left button, blue with the right', 'SHIFT+F12로 켜는 강사용 오버레이 — 왼쪽 버튼은 빨간색, 오른쪽 버튼은 파란색으로 그립니다', []),
    G('Turn probe', '탐촉자 돌리기', 'facing the probe the other way on a calibration block or across the weld, so the beam looks at the other radius / the other side', '교정 시험편이나 용접부에서 탐촉자를 반대로 돌려 반대쪽 반경 또는 반대쪽 면을 향하게 하는 것', [4, 20]),
    G('Draw region (blue box)', '그리기 영역 (파란 상자)', 'the blue rectangle beside the weld inside which defects may be drawn in the editor', '결함 편집기에서 결함을 그릴 수 있는, 용접부 옆의 파란 사각 영역', [15]),
    G('Single-line LOF', '단일선 융합 불량', 'planar lack of fusion drawn as one straight stroke: it has an angle, a height and a top depth', '한 번의 직선 획으로 그리는 면상 융합 불량 — 각도, 높이, 상단 깊이를 가집니다', [15]),
  ];

  // ------------------------------------------------------------------ quick tour (8 steps; 90 reads `target`, task wording `selector`)
  const T = function (selector, ko, en) { return { selector, target: selector, ko, en }; };
  const tour = [
    T('#toolbar', 'UTsim에 오신 것을 환영합니다. 도구 모음에서 탐촉자(0°/45°/60°/70°), 표준 시험편(V1, V2, DAC), 도구(PLOT, DAMP, SIZE), 결함 편집기, 블라인드 연습용 HIDE, BEAM, RAD, PIPE, TKY, TOFD, AUT를 선택합니다.',
      'Welcome to UTsim. The toolbar selects the probe (0°/45°/60°/70°), calibration blocks (V1, V2, DAC), tools (PLOT, DAMP, SIZE), the defect editor, HIDE for blind practice, BEAM, RAD, PIPE, TKY, TOFD and AUT.'),
    T('#instrument', '탐상기(기본 EPOCH 600)입니다. 소프트키(Gain, Range, Delay …)를 누르고 화살표나 마우스 휠로 값을 바꿉니다. 게이트, DAC/TCG, 피크 메모리, 프리즈, SAVE(데이터로거), AUTO 80 %가 모두 동작합니다.',
      'The flaw detector (EPOCH 600 by default). Click a softkey (Gain, Range, Delay …) then use the arrows or the mouse wheel. Gates, DAC/TCG, peak memory, freeze, SAVE (datalogger) and AUTO 80 % are all functional.'),
    T('#cv-plan', '평면도: 용접선 방향 위치(z), 스큐 나침반, 결함의 평면 위치를 보여 줍니다. 여기서 탐촉자를 끌어 용접선을 따라 주사합니다.',
      'Plan view: the probe position along the weld (z), the skew compass and defect footprints. Drag the probe here to scan along the weld.'),
    T('#cv-cross', '단면도: 시험체, 개선 형상, 탐촉자, 스킵을 포함한 음향 빔입니다. 탐촉자를 좌우로 끌거나 화살표 키(1 mm, Shift 10 mm)로 움직입니다. A-스캔의 에코는 강조된 빔 경로에 대응합니다.',
      'Cross-section: specimen, weld preparation, probe and the sound beam with its skips. Drag the probe left/right (arrow keys: 1 mm, Shift 10 mm). Echoes on the A-scan correspond to the highlighted ray paths.'),
    T('#menubar', '메뉴: 탐촉자(라이브러리, 쐐기각, 집속, 모드 변환, 표면파, 손가락 감쇠), 용접부(개선 형상, 재질, 프리셋), 결함, 도구(DGS, 규격 평가, 절차서, B-스캔, 에코 다이내믹, 데이터로거, 크기 측정), 옵션, 도움말. F10으로 키보드에서 메뉴 바를 엽니다.',
      'Menus: Probes (library, wedge angle, focus, mode conversion, surface wave, finger damping), Weld (preparation, material, presets), Defects, Tools (DGS, standards evaluation, procedures, B-scan, echo dynamic, datalogger, sizing), Options and Help. F10 opens the menu bar from the keyboard.'),
    T('#statusbar', '상태 표시줄: 물리 라인(쐐기각, 굴절각, 음속), 탐촉자 위치, 측정 범위, 게인, 모드별 판독값과 현재 단계의 힌트.',
      'Status bar: the physics line (wedge angle, refracted angle, velocities), probe position, range, gain, mode readouts and a hint for the current step.'),
    T('#menu-help', '도움말 ▸ 레슨: 자동 단계 확인, 힌트, "대신 해 주기"가 있는 25개의 안내 레슨. 도움말 ▸ 에코 퀴즈는 게이트 안의 에코를 판별합니다. 결함 ▸ 실기 시험 / 무작위 연습은 숨겨진 결함을 찾아 크기를 재고 보고합니다.',
      'Help ▸ Lessons: 25 guided lessons with automatic step checks, hints and "Do it for me". Help ▸ Echo quiz identifies gated echoes. Defects ▸ Trade Test / Random practice hide defects to find, size and report.'),
    T('#menu-file', '파일 ▸ 시나리오 저장 / 불러오기로 최대 5개의 설정을 보관하고, 공유 링크…는 시나리오 전체(또는 정답이 숨겨진 시험)를 URL로 만들어 학생에게 보낼 수 있습니다. 즐거운 학습 되세요!',
      'File ▸ Save scenario / Load scenario keep up to 5 setups; Share link… encodes the whole scenario (or an exam with a hidden truth) into a URL you can send to students. Enjoy!'),
  ];

  // ------------------------------------------------------------------ registration (load time, no DOM)
  // 70-instruments keypad tooltips (TIPS; title/aria-label of the skins, relabelled on 'lang'). Keep {pct}/{n}/{g}/{k} verbatim.
  UT.i18n.add('ko', {
    'Gain — select the gain (2ND F + dB = store / release the reference gain)': '게인 — 게인 선택 (2ND F + dB = 기준 게인 저장 / 해제)',
    'Save the current readouts to the datalogger': '현재 판독값을 데이터로거에 저장',
    'Step the selected parameter up (gain +0.5 dB; 2ND F + ▲ = +6 dB)': '선택한 파라미터 올리기 (게인 +0.5 dB; 2ND F + ▲ = +6 dB)',
    'Step the selected parameter down (gain −0.5 dB; 2ND F + ▼ = −6 dB)': '선택한 파라미터 내리기 (게인 −0.5 dB; 2ND F + ▼ = −6 dB)',
    'Coarse step down (gain −6 dB)': '큰 단계로 내리기 (게인 −6 dB)',
    'Coarse step up (gain +6 dB)': '큰 단계로 올리기 (게인 +6 dB)',
    'Enter — confirm (next Auto Cal step)': 'Enter — 확인 (다음 Auto Cal 단계)',
    'Freeze the A-scan (2ND F + ❄ = Compare snapshot)': 'A-스캔 정지 (2ND F + ❄ = 비교 스냅샷)',
    'Back — leave the sub-page, cancel 2ND F / Auto Cal': '뒤로 — 하위 페이지 나가기, 2ND F / Auto Cal 취소',
    'Gates — select gate 1 / 2 and open its page (2ND F + GATES = AUTO {pct} %)': '게이트 — 게이트 1 / 2 선택 및 페이지 열기 (2ND F + GATES = AUTO {pct} %)',
    'Range 50 → 100 → 200 → 400 mm (2ND F + RANGE = backwards)': '범위 50 → 100 → 200 → 400 mm (2ND F + RANGE = 역방향)',
    'Second function — latch, then press dB, GATES, ❄, RANGE or ▲▼': '2차 기능 — 래치 후 dB, GATES, ❄, RANGE 또는 ▲▼ 누름',
    'Peak memory on / off': '피크 메모리 켜기 / 끄기',
    'Power (decorative LED)': '전원 (장식용 LED)',
    'Next softkey page': '다음 소프트키 페이지',
    'Softkey page {n}': '소프트키 페이지 {n}',
    'Press softkey {n} of the current column': '현재 열의 소프트키 {n} 누름',
    'Set the gain to {g} dB': '게인을 {g} dB로 설정',
    'Gate 1 — select gate 1 (start)': '게이트 1 — 게이트 1 선택 (시작)',
    'Gate 2 — select gate 2 (start)': '게이트 2 — 게이트 2 선택 (시작)',
    'Pulser — damping on / off (2ND F + PULSER = receiver filter)': '펄서 — 댐핑 켜기 / 끄기 (2ND F + PULSER = 수신기 필터)',
    'Display — cycle the rectification': '디스플레이 — 정류 방식 순환',
    'Big readout: depth ↔ amplitude %': '큰 판독값: 깊이 ↔ 진폭 %',
    'Auto Cal — two-point velocity / zero calibration': 'Auto Cal — 2점 음속 / 영점 교정',
    'Select the zero offset': '영점 오프셋 선택',
    'Select the range (2ND F + RANGE = 50 → 100 → 200 → 400 mm)': '범위 선택 (2ND F + RANGE = 50 → 100 → 200 → 400 mm)',
    'Select the velocity': '음속 선택',
    'Select the probe angle (2ND F + ANGLE = thickness)': '탐촉자 각도 선택 (2ND F + ANGLE = 두께)',
    'Option (no function)': '옵션 (기능 없음)',
    'ID (no function)': 'ID (기능 없음)',
    'Erase the DAC curve': 'DAC 곡선 지우기',
    'Re-open the USK 7 window': 'USK 7 창 다시 열기',
    'Turn {k} down': '{k} 낮추기',
    'Turn {k} up': '{k} 높이기',
  });
  UT.i18n.add('ko', KO);
  // 82-lessons and 84-trade pass an already-translated t(key) as the window title / button / field KEY (see hand-off), so
  // under 'ko' their data-i18n holds Korean text. Identity entries for every Korean value keep UT.i18n.has() true for them
  // (§5.3.4 counts only keys with has() false); the dictionary size reported by size() counts the English keys only.
  const HANGUL = /[\uAC00-\uD7A3]/;
  /**
   * Register identity entries (Korean value → itself) for every Korean dictionary value and every lesson choice label, so
   * UT.i18n.has() stays true for the pre-translated keys 82/84 put into data-i18n. Idempotent; exposed as UT.i18nKo.init.
   * @returns {number} count of identity entries added by this call (0 when everything was already registered)
   */
  function registerIdentity() {
    const d = UT.i18n.dict('ko'), ident = {};
    for (const k of Object.keys(KO)) { const v = KO[k]; if (HANGUL.test(v) && d[v] === undefined) ident[v] = v; }
    // 82's lesson choice buttons are built from the step's own Korean text (dom.button(ko ? c.ko : c.en)); 82 loads before 92,
    // so its UT.lessons.list is readable here without any DOM. Idempotent — init() (90 boot hook) repeats it after late changes.
    const list = UT.lessons && UT.lessons.list;
    if (Array.isArray(list)) for (const l of list) for (const st of (l && l.steps) || []) for (const c of (st && st.choices) || []) { if (c && c.ko && d[c.ko] === undefined) ident[c.ko] = c.ko; }
    if (Object.keys(ident).length) UT.i18n.add('ko', ident);
    return Object.keys(ident).length;
  }
  registerIdentity();

  // ------------------------------------------------------------------ UT.test.untranslated() — SPEC-v2 §5.3.4
  const SHORT_RE = /^[\d\s.,:%°+\-/×~()a-zA-Z]{0,3}$/;
  const NUMERIC_RE = /^[\d\s.,%°:+\-/()µ]+$/;
  const PRODUCTS = ['EPOCH', 'EPOCH 600', 'EPOCH 4', 'USK7', 'USK 7', 'IIW', 'TOFD', 'DAC', 'AUT', 'PA', 'ASME', 'ISO', 'AWS', 'DGS', 'TCG', 'FBH', 'SDH', 'IOW', 'PCS', 'TKY', 'V1', 'V2', 'UTsim', 'UTman', 'UT', 'RF', 'ERS', 'USK', 'LTC', 'RDTech', 'AccRej', 'BS', 'K'];   // v3 §10: new product / abbreviation exemptions
  /** True when the key is a product name or consists only of product names, digits and punctuation (e.g. 'ISO 11666', 'EPOCH 600'). */
  function isProductName(key) {
    const k = String(key).trim();
    if (!k) return true;
    if (PRODUCTS.indexOf(k) >= 0) return true;
    const words = k.split(/[\s/·|,()+\-–—:]+/).filter(Boolean);
    return words.length > 0 && words.every(function (w) { return PRODUCTS.indexOf(w) >= 0 || /^[\d.,%°µ]+$/.test(w); });
  }
  /**
   * Probe-library names exempt from untranslated() (§5.3.4): UT.probe.library[].name / .label, trimmed.
   * @returns {Object<string, true>} set-like lookup object keyed by name (empty when the library is not loaded)
   */
  function probeNames() {
    const set = {};
    const lib = UT.probe && UT.probe.library;
    if (Array.isArray(lib)) for (const p of lib) { if (p && p.name) set[String(p.name).trim()] = true; if (p && p.label) set[String(p.label).trim()] = true; }
    return set;
  }
  /**
   * UT.test.untranslated() — SPEC-v2 §5.3.4. Scans every [data-i18n] element of the current document and returns the unique
   * keys without a Korean entry, minus the exemptions (short tokens, numerics, product names, probe-library names, `.no-i18n`
   * subtrees and the status-bar physics line). Only meaningful while UT.i18n.lang === 'ko'.
   * @returns {string[]} untranslated keys in document order ([] when lang !== 'ko' or there is no DOM)
   */
  function untranslated() {
    if (typeof document === 'undefined' || !document || UT.i18n.lang !== 'ko') return [];
    const names = probeNames();
    const seen = {}, out = [];
    const els = document.querySelectorAll('[data-i18n]');
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      const key = el.dataset.i18n;
      if (!key || seen[key]) continue;
      seen[key] = true;
      if (UT.i18n.has(key)) continue;
      if (SHORT_RE.test(key) || NUMERIC_RE.test(key)) continue;
      if (isProductName(key)) continue;
      if (names[key.trim()]) continue;
      if (el.closest && (el.closest('.no-i18n') || el.closest('#statusbar .sb-left'))) continue;
      out.push(key);
    }
    return out;
  }

  // ------------------------------------------------------------------ selftest (≥ 400 keys, no empty values, placeholders preserved, glossary / tour shape)
  function __selftest() {
    const f = [];
    const keys = Object.keys(KO);
    if (keys.length < 400) f.push('dictionary has ' + keys.length + ' keys (< 400)');
    for (const k of keys) {
      const v = KO[k];
      if (typeof v !== 'string' || !v.trim()) { f.push('empty value for ' + JSON.stringify(k)); continue; }
      const ph = (k.match(/\{\w+\}/g) || []).sort().join(',');
      const pv = (v.match(/\{\w+\}/g) || []).sort().join(',');
      if (ph !== pv) f.push('placeholder mismatch for ' + JSON.stringify(k));
    }
    const d = UT.i18n.dict('ko');
    if (!d || d['Probes'] !== '탐촉자' || d['Glossary…'] !== '용어집…') f.push('dictionary not registered');
    if (glossary.length < 60) f.push('glossary has ' + glossary.length + ' entries (< 60)');
    for (const g of glossary) if (!g.term || !g.ko || !g.en || !g.defKo || !g.defEn || !Array.isArray(g.see)) { f.push('glossary entry incomplete: ' + (g && g.term)); break; }
    if (glossary[0].ko !== '저면 에코' || glossary[19].term !== 'Transfer correction') f.push('glossary binding examples out of order');
    if (tour.length !== 8 || tour.some(function (s) { return !s.selector || !s.target || !s.ko || !s.en; })) f.push('tour steps');
    if (typeof UT.test.untranslated !== 'function') f.push('UT.test.untranslated missing');
    if (!SHORT_RE.test('mm') || !NUMERIC_RE.test('12.5 %') || !isProductName('EPOCH 600') || !isProductName('ISO 11666') || isProductName('Gain')) f.push('exemption regexes');
    const saved = UT.i18n.lang;
    if (UT.i18n.t('Defect {n}', { n: 3 }) !== 'Defect 3') f.push('en passthrough');
    UT.i18n.lang = 'ko';
    if (UT.i18n.t('Defect {n}', { n: 3 }) !== '결함 3') f.push('ko params');
    if (UT.i18n.t('Time left {t}', { t: '4:59' }) !== '남은 시간 4:59') f.push('ko template');
    UT.i18n.lang = saved;
    return f;
  }

  UT.i18nKo = { dict: KO, glossary, tour, untranslated, isProductName, PRODUCTS, init: registerIdentity, selftest: __selftest, __selftest, size() { return Object.keys(KO).length; } };
  UT.test = UT.test || {};
  Object.assign(UT.test, { untranslated });
})(window.UT = window.UT || {});
