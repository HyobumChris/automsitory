# UTsim — UTman-style Ultrasonic Weld Testing Simulator (single-file HTML)

**초음파 용접부 탐상 훈련 시뮬레이터** — YouTube 재생목록 *"UTman Ultrasonic Sim"* (Paul Rawlinson, utsim.co.uk)에
소개된 UTman 소프트웨어를 참고하여 **HTML 파일 하나**로 다시 구현한 독립 프로젝트입니다.
서버·설치·인터넷 없이 브라우저에서 `utman_simulator.html` 파일을 열면 바로 동작합니다.

**v2** (2026-09): 물리(피스톤 지향성·모드 변환·표면파·재질·집속·TCG·DGS·TOFD/PA/AUT v2·B-scan), 훈련(25개 코칭 레슨·에코 퀴즈·실기시험 v2·규격 판정·절차서·랜덤 연습·사이징 v2), 충실도(용접 개선 5종·EPOCH Pulsar/Rcvr·데이터로거·경보음), 사용성(완전 한국어화·터치/반응형·시나리오 공유 링크·용어집/둘러보기·접근성), 엔지니어링(인수검사 러너·CI)까지 전면 확장되었습니다. 상세는 `SPEC-v2.md`, 변경 이력은 `CHANGELOG.md`.

> This is an independent re-implementation inspired by UTman / UTsim (© Paul Rawlinson). It shares no
> code or assets with the original; the physics, drawings and instrument skins were written from scratch.

## 실행 (How to run)

```bash
# 1) 이미 빌드된 단일 파일을 브라우저로 열기
open ../utman_simulator.html            # macOS
start ..\utman_simulator.html           # Windows

# 2) 소스에서 다시 빌드 (Python 3 표준 라이브러리만 사용)
cd ut-simulator
python3 build.py                        # -> ../utman_simulator.html

# 3) 개발용: index.html을 그대로 열면 src/*.js 를 개별 로드
```

## 화면 구성 (Layout)

```
 메뉴  File · Probes · Step Wedge · Weld · Defects · Tools · Options · Help   (Tools = v2)
 툴바  0° 45° 60° 70° | V2 V1 DAC | PLOT DAMP SIZE | DEFECT HIDE CLEAR | BEAM RAD | PIPE TKY TOFD AUT
 ┌────────────────────┬────────────────────────────────────────────┐
 │ 탐상기 (EPOCH 600 / │ PLAN VIEW (평면도) — 결함, 탐촉자, 빔, 스큐 다이얼 │
 │ EPOCH 4 / USK7)     │                                            │
 ├────────────────────┴────────────────────────────────────────────┤
 │ X 눈금자   ·   CROSS SECTION (단면도: 용접부·빔 경로·결함·탐촉자)     │
 ├──────────────────────────────────────────────────────────────────┤
 │ 상태 표시줄: 웨지각/속도 · Pos · Range · AMP · 힌트                   │
 └──────────────────────────────────────────────────────────────────┘
 + 떠 있는 창: 3D Pipe, Defects, TOFD, AUT, Beam Plotting, Radiograph, Sizing, Trade Test, Lessons …
 + v2 창: Probe library · Material · Focus · PA(S/E/C) · DGS · Evaluation · Procedures · Standards notes · B-scan · Echo dynamic ·
          Datalogger · Quiz · Scoreboard · Report · Practice · Scenario · Share · Glossary · Quick tour · 터치 바
```

## 재생목록 22개 영상 ↔ 기능 대응 (Lessons)

`Help ▸ Lessons` 창에서 각 영상에 해당하는 시나리오를 한 번에 불러올 수 있습니다.

| # | 영상 제목 | 시뮬레이터 기능 |
|---|---|---|
| 1 | UTman Functions | 메뉴·툴바 전체 |
| 2 | Basic UT controls Range X shift Amplitude | Range / X-shift(Delay) / AMP(Gain) / Suppression |
| 3 | Zero Probe | 0° 수직 탐촉자, 단일/이중 진동자, 초기 펄스·불감대, 다중 저면 에코 |
| 4 | Angle Probe using the V1 calibration block | IIW V1 블록 (100 mm 반경 100/200/300, 25 mm 두께 25/50/75/100, 1.5 mm 구멍, 퍼스펙스) |
| 5, 17 | Lamination Check | 라미네이션 판재 0° 주사, 저면 에코 소실 |
| 6, 19 | Angle Probe using the V2 calibration block | V2 블록 (25/100/175 · 50/125/200) |
| 7 | Making Sense of Amplitude | dB 산술, 기준 게인 소프트키, 포화 % 판독 |
| 8 | TKY Variable configuration Welds | T/K/Y 조인트, 브레이스 각도 조절 (ADJUST MODE) |
| 9 | Plotting Beam Spread at 20% | A5/IOW 블록 + 빔 플로팅 카드, 20 dB 강하 빔 폭 |
| 10, 16 | Drawing Defects I / II | 결함 편집기: 단면 브러시 드로잉, 파이프 서클뷰, 1–8번 결함, LENGTH/SEPARATION |
| 11, 22 | How to use the EPOCH / UTman600 | Olympus EPOCH 600 스킨 (게이트, 판독값, 소프트키 페이지, Peak Mem, Freeze) |
| 12 | EPOCH AUTO Calibration | 스텝 웨지 2점 오토 캘리브레이션 (속도·제로) |
| 13 | TOFD | 2탐촉자 TOFD, 측면파/저면파/팁 회절, D-scan 이미지 |
| 14 | Shear wave and Compression wave | 스넬 법칙 웨지각 계산기, 임계각, 모드 전환 |
| 15 | UTman software utsim | 전체 레이아웃, 3D 파이프 창 |
| 18 | AUT | 자동 주사 스트립 차트, 게이트 패널, 컬러맵 |
| 20 | Angleprobe Calibration | DAC 블록, DAC 기록/곡선(−6/−14 dB), DAC % 판독 |
| 21 | Trade Test with UTman software | 실기 시험: 숨겨진 결함, 보고서 작성, 채점 |
| 23 (v2) | Weld preparations & mode conversion | K/J/백킹바/필릿 T/노즐 개선, 모드 변환 의사 지시 판별 |
| 24 (v2) | Standards & procedures | ISO 11666 / ASME / AWS 판정, 절차서 적용, 전달 손실 보정 |
| 25 (v2) | Sensitivity drift & re-check | 기준 감도 재확인(±4 dB 규칙), 재주사 결정 |

v2 레슨은 단계별 **자동 판정**(상태/전이/객관식/수치 입력), 힌트, *Do it for me*, 진행 배지를 갖춘 코칭 방식이며,
`Help ▸ Echo quiz…` 에서 에코 판별 퀴즈(형상 에코 / 결함 / 의사 지시 + 조치 문항)를 풀 수 있습니다.

## 물리 모델 요약 (Physics)

* 스넬 법칙: 퍼스펙스 2740 m/s ↔ 강 횡파 3240 / 종파 5900 m/s (60° → 웨지각 47.1°)
* 근거리 음장 N = D²f/4v, 빔 확산 6 dB / 20 dB (sin θ = 0.51·λ/D, 1.08·λ/D)
* 2-D 다각형 광선 추적: 반사·스킵·코너 반사·형상 에코(캡/루트)·라미네이션 차폐가 **하나의 규칙**(탐촉자로 되돌아오는 광선만 에코)에서 자연히 나옵니다
* V1 반경 다중 에코, V2 25/100/175 수열, 루트 균열 코너 에코, SDH 위치·깊이 판독 (SP / SD / DP, 다리 접기)
* TOFD: t = (√((x−xt)²+y²) + √((x−xr)²+y²))/v + 2·wd, 깊이 역산
* **v2** 피스톤(Bessel) 지향성 |2J₁(x)/x| 로 부채꼴 광선 가중 (−6 dB 0.51 λ/a, −20 dB 0.87 λ/a, 첫 널 1.22 λ/a, 사이드로브 −17.6 dB), 직사각 진동자 근거리음장 계수 k
* **v2** 모드 변환(S↔L, 임계각 33.3°) 을 표면·결함면에서 추적 → 시간 기반 에코 배치, 왕복 경로 의사 지시; 표면파(레일리, vR ≈ 0.926 vS) + 손가락 감쇠 도구
* **v2** 재질 라이브러리(탄소강·오스테나이트·알루미늄·구리·티타늄·주철·퍼스펙스: 속도, 편도 감쇠 L/S, 그래스, 이방성 용접금속), 전달 손실 보정
* **v2** 집속 탐촉자(F ≤ N, 집속 이득 Gf), TCG(DAC 기반 에코별 이득), Pulsar 에너지/댐핑/PRF·Rcvr 필터가 실제 신호에 작용
* **v2** DGS/AVG 선도와 등가 반사체 크기(ERS, 원판 법칙 2π·G²/A²), 평저공(FBH) 대비 시험편
* **v2** TOFD: 모드 변환 저면파(페르마 최소 24.77 µs @ PCS 60/T 20)와 S-S 복제, 불감대(측면파 7.3 mm), PCS 최적화, 쌍곡선 커서, 스트레이트닝
* **v2** 위상배열: 초점 법칙(웨지 보정), S-scan/E-scan/C-scan, 각도별 TCG; AUT 6채널 C-scan 맵, 적응 스텝; B-scan·에코 다이내믹 창
* 모든 값은 mm · µs · dB, 테스트 API `window.UT.test` 로 검증 가능 (SPEC §11, SPEC-v2 §7/§9)

## 훈련 기능 v2 (Training)

* **실기 시험 v2** (`Defects ▸ Trade Test…`): 난이도표(basic/intermediate/advanced — 결함 수·최소 크기·시편·개선·재질·함정·제한시간), 시드 기반 재현,
  기록 가능성 필터(−14 dB 미만 결함은 채점 제외), 1:1 매칭, 속성별 채점(검출/종류/길이/깊이/높이), 오검 −15, 치명 누락(FAIL), 합격 70 %,
  커버리지 추적기(평면도 녹색 띠), 타이머 자동 제출, 이력 30건·스코어보드, 보고서 템플릿(인쇄), **시험 공유**(시드만 담긴 링크 + 코드 잠금 + 서명된 결과 토큰).
* **규격 판정** (`Tools ▸ Evaluation (standards)…`): ISO 17640 / ISO 11666 (AL2·AL3) / ASME VIII App. 12 / AWS D1.1 Table 8.2 규칙을 데이터로 내장(편집 가능),
  판정 = not-recordable / accept / reject (+ 등급·기록 여부), *Why?* 셀에 사용된 수치·규칙 표시. 규칙은 "예시적 전사 — 최신판 대조 필요" 주석을 달고 있습니다.
* **절차서** (`Tools ▸ Procedures ▸`): iso-B-plate20 · asme-pipe-6in · aws-d11-70 — 허용 탐촉자·기준 시험편·감도·전달 보정을 한 번에 적용, 시험 중 탐촉자 잠금.
* **랜덤 연습** (`Defects ▸ Random practice…`): 타이머 없는 실기, Hint / Reveal one / Check row.
* **사이징 v2**: 6 dB · 20 dB(z-면 보정) · 최대 진폭 · 평가 레벨 고정법(ISO) · 팁 회절 높이, 공개 후 측정값 vs 실제값 표.
* **시나리오** (`File ▸ Save/Load scenario…`, `Share link…`): 5개 슬롯 + JSON, `#scn=` URL 공유(딜레이트 압축), 제목/메모/작성자, 시험 모드 옵션.
* **한국어 완전 대응** (`Options ▸ Language`): 단일 사전(92-i18n-ko), 실시간 전환, KS B 0817 용어 규칙, 용어집(`Help ▸ Glossary…`), 둘러보기(`Help ▸ Quick tour`).
* **터치·접근성**: 포인터 이벤트, 터치 바(자동 반복), 1280×760 설계 상자 자동 스케일, ARIA 메뉴/툴바, F10·Alt+문자 메뉴 탐색, 고대비, 경보음(옵션).

## 개발 (Development)

```
ut-simulator/
  SPEC.md          모듈 계약 · 물리 공식 · UI 명세 · 수용 기준 (구현의 단일 진실 원천)
  build.py         src/*.js + style.css 를 하나의 HTML 로 인라인
  index.html       개발용 페이지
  SPEC-v2.md       v2 프로그램 명세 (기능 P1–P12 · T1–T7 · F1–F4 · U1–U5 · E1–E6, 상태, 물리, 인수검사 V2-1…27)
  CHANGELOG.md     변경 이력
  src/00-core.js … 94-scenario.js, style.css   (20개 모듈: 45-standards, 56-pa, 82-lessons, 84-trade, 92-i18n-ko, 94-scenario 는 v2 신규)
  tools/node-load.mjs  Node 에서 모듈을 로드해 셀프테스트 (DOM 없이 물리 검증)
  tools/smoke.mjs      Playwright 헤드리스 스모크 테스트 (툴바 전체 클릭 + 물리 프로브)
  tools/integ.mjs      전체 통합 드라이브 (툴바·73개 메뉴·21개 창·드래그·키보드·스캔·레슨·수용 기준)
  tools/qa-helpers.mjs Playwright 부팅/오류 수집 헬퍼 (QA 스크립트 공용)
  tools/acceptance.mjs v1 14개 + v2 인수검사를 헤드리스 Chromium 에서 실행, JSON 보고서, 실패 시 exit 1 (CI 가 실행)
  ../.github/workflows/utsim-ci.yml  셀프테스트 → 빌드 → 인수검사 (push / pull_request)
```

```bash
node tools/node-load.mjs --selftest                    # 20개 모듈 셀프테스트
NODE_PATH=/opt/node22/lib/node_modules node tools/acceptance.mjs --json /tmp/acceptance.json   # v1+v2 인수검사
NODE_PATH=/opt/node22/lib/node_modules node tools/smoke.mjs ../utman_simulator.html
NODE_PATH=/opt/node22/lib/node_modules node tools/integ.mjs --shots /tmp/utsim-shots
```

빌드 결과물은 약 1.8 MB(주석 포함, 미압축 — 단일 파일의 가독성을 의도)의 단일 HTML이며 외부 리소스를 참조하지 않습니다. `docs/utman_simulator.html` 에도 같은 파일이 쓰입니다. 브라우저에서
`utman_simulator.html#selftest` 로 열면 콘솔에 모든 모듈의 셀프테스트 결과가 출력됩니다.

### 검증 결과 (Acceptance checks, SPEC §11.1)

| # | 검사 | 결과 |
|---|---|---|
| 1 | V1 25 mm 면 0° → 25/50/75/100 mm 저면 에코, 초기 펄스(단일 진동자만) | ✓ |
| 2 | V1 100 mm 반경 0°/45°/60°/70° → 100/200/300; V2 → 25/100/175, 50/125/200 | ✓ |
| 3 | 웨지각 45°→36.7°, 60°→47.1°, 70°→52.6° | ✓ |
| 4–5 | IOW 13 mm SDH: 60° x=262.5 에서 음향거리 26.0, SD 22.5, DP 13.0 최대 | ✓ |
| 6–7 | +6 dB = 진폭 2배; Range/Delay ↔ 화면 눈금 매핑 | ✓ |
| 8 | 루트 균열 코너 에코 40.0 mm (x≈34.6), ±15 mm 이동 시 소실 | ✓ |
| 9 | 측벽 융합불량: 60° 2번째 다리에서 최대, 45° 대비 ≥ 6 dB 우세 | ✓ |
| 10 | 라미네이션 에코 + 저면 에코 소실 | ✓ |
| 11 | TOFD 측면파 18.93 µs / 저면파 20.98 µs, 팁 회절 신호 위치 | ✓ |
| 12 | AUT 게이트 1 초과 구간이 결함 z 범위와 일치 | ✓ |
| 13 | Trade Test: seed 재현성, 정답 제출 시 100점 | ✓ |
| 14 | 빌드 < 900 KB, 외부 참조 없음, 콘솔 오류 0, 툴바 전체 정상 | ✓ |

### 검증 결과 v2 (Acceptance checks, SPEC-v2 §9)

<!-- V2-ACCEPTANCE-TABLE -->
(최종 검증 후 갱신)
<!-- /V2-ACCEPTANCE-TABLE -->

## 키보드 (Keyboard)

`← →` 탐촉자 1 mm (Shift ×10) · `↑ ↓` 용접선 방향 이동 · `+ −` 게인 1 dB (Shift 6 dB) · `R` 레인지 순환 ·
`F` Freeze · `P` Peak Mem · `H` 결함 숨김 · `B` 빔 표시 · `1–4` 탐촉자 각도 · `Esc` 창 닫기 · `D` 손가락 감쇠 도구 · `F10` / `Alt+문자` 메뉴 · 방향키로 메뉴 탐색

## 라이선스 / 크레딧

이 저장소의 코드는 프로젝트 라이선스를 따릅니다. "UTman", "UTsim"은 원저작자(Paul Rawlinson)의 소프트웨어 명칭이며,
본 프로젝트는 교육 목적의 독립 구현입니다. Olympus EPOCH, Krautkrämer USK 7 은 각 사의 상표입니다.
