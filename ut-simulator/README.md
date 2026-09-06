# UTsim — UTman-style Ultrasonic Weld Testing Simulator (single-file HTML)

**초음파 용접부 탐상 훈련 시뮬레이터** — YouTube 재생목록 *"UTman Ultrasonic Sim"* (Paul Rawlinson, utsim.co.uk)에
소개된 UTman 소프트웨어를 참고하여 **HTML 파일 하나**로 다시 구현한 독립 프로젝트입니다.
서버·설치·인터넷 없이 브라우저에서 `utman_simulator.html` 파일을 열면 바로 동작합니다.

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
 메뉴  File · Probes · Step Wedge · Weld · Defects · Options · Help
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

## 물리 모델 요약 (Physics)

* 스넬 법칙: 퍼스펙스 2740 m/s ↔ 강 횡파 3240 / 종파 5900 m/s (60° → 웨지각 47.1°)
* 근거리 음장 N = D²f/4v, 빔 확산 6 dB / 20 dB (sin θ = 0.51·λ/D, 1.08·λ/D)
* 2-D 다각형 광선 추적: 반사·스킵·코너 반사·형상 에코(캡/루트)·라미네이션 차폐가 **하나의 규칙**(탐촉자로 되돌아오는 광선만 에코)에서 자연히 나옵니다
* V1 반경 다중 에코, V2 25/100/175 수열, 루트 균열 코너 에코, SDH 위치·깊이 판독 (SP / SD / DP, 다리 접기)
* TOFD: t = (√((x−xt)²+y²) + √((x−xr)²+y²))/v + 2·wd, 깊이 역산
* 모든 값은 mm · µs · dB, 테스트 API `window.UT.test` 로 검증 가능 (SPEC §11)

## 개발 (Development)

```
ut-simulator/
  SPEC.md          모듈 계약 · 물리 공식 · UI 명세 · 수용 기준 (구현의 단일 진실 원천)
  build.py         src/*.js + style.css 를 하나의 HTML 로 인라인
  index.html       개발용 페이지
  src/00-core.js … 90-app.js, style.css
  tools/smoke.mjs  Playwright 헤드리스 스모크 테스트
  tools/node-load.mjs  Node 에서 물리 모듈만 로드해 검증
```

```bash
node tools/node-load.mjs --selftest                    # 모듈 셀프테스트
NODE_PATH=/opt/node22/lib/node_modules node tools/smoke.mjs ../utman_simulator.html
```

## 키보드 (Keyboard)

`← →` 탐촉자 1 mm (Shift ×10) · `↑ ↓` 용접선 방향 이동 · `+ −` 게인 1 dB (Shift 6 dB) · `R` 레인지 순환 ·
`F` Freeze · `P` Peak Mem · `H` 결함 숨김 · `B` 빔 표시 · `1–4` 탐촉자 각도 · `Esc` 창 닫기

## 라이선스 / 크레딧

이 저장소의 코드는 프로젝트 라이선스를 따릅니다. "UTman", "UTsim"은 원저작자(Paul Rawlinson)의 소프트웨어 명칭이며,
본 프로젝트는 교육 목적의 독립 구현입니다. Olympus EPOCH, Krautkrämer USK 7 은 각 사의 상표입니다.
