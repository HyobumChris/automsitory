# 비파괴검사(NDT) 교육자료 — 스테인리스강 파이프 용접부 PAUT

> **출처**: HSHI SUS PIPE PAUT PROCEDURE (HS-G612-019, Rev.5, 2026-05-06)
> Phased Array Ultrasonic Testing procedure for Stainless steel Pipe welds
> Hull Quality Management Department, HD Hyundai Samho
>
> 본 자료는 사내 절차서에서 **비파괴검사(NDT) 관련 항목만 추출**하여 교육용으로 재구성한 것입니다.
> 실제 작업 시에는 반드시 최신본 원본 절차서 및 적용 Class Rule을 따라야 합니다.

---

## 1. 교육 개요

본 자료는 스테인리스강(S304/S316) 배관 용접부의 위상배열 초음파탐상(PAUT, Phased Array Ultrasonic Testing) 검사를 수행하는 NDT 검사원·검사보조·QC 담당자를 대상으로 한다.

### 1.1 학습 목표
- PAUT 의 적용 범위, 기법(TFM/PWI, DMA/DLA)의 차이를 구분할 수 있다.
- NDT 인원·장비·기준시험편(reference block) 요구사항을 설명할 수 있다.
- 보정(Calibration) → 점검(Checking) → 검사(Scanning) → 평가(Evaluation) → 기록(Reporting)의 전체 흐름을 이해한다.
- 결함 평가/합격 기준(ISO 19285 / ISO 4761)을 적용할 수 있다.

### 1.2 적용 범위 (Scope)
- **모재**: Stainless steel (S304 / S316)
- **용접 프로세스**: GTAW, FCAW (Full penetration butt welds)
- **형상**: Pipe + Pipe / Elbow / Tee / Reducer / Flange 등
- **두께/직경**: NPS 2"~32" (50A~800A), Schedule 10/40/80, 두께 ~6mm 이하 및 5mm 초과로 구분
- **스캐닝 방식**: Encoded Semi-Auto

---

## 2. NDT 일반 — 용어와 정의 (Terms & Definitions)

| 용어 | 정의 |
|---|---|
| **NDT / NDE** | Non-Destructive Testing / Examination — 시험체를 파괴하지 않고 결함을 검출하는 검사법 |
| **PAUT** | Phased Array Ultrasonic Testing — 다수의 진동자를 위상 제어하여 빔 각도/초점을 전자적으로 조향하는 초음파 검사 |
| **TFM / FMC** | Total Focusing Method / Full Matrix Capture — 전체 송수신 조합 데이터를 수집하여 모든 픽셀에 초점을 합성하는 영상화 기법 |
| **PWI** | Plane Wave Imaging — 평면파 송신 기반 고속 영상화 기법 |
| **DMA / DLA** | Dual Matrix / Dual Linear Array — 송수신 분리형 프로브, 스테인리스 등 거친 결정립에 대한 침투력 향상 |
| **Dual-element probe** | 송신·수신 진동자가 분리·전기/음향적으로 격리된 프로브 |
| **Phased array image** | 위상배열 작동으로 수집된 정보로 만들어진 1차원 또는 2차원 영상 |
| **Phased array indication** | PA 영상에서 추가 평가가 필요한 패턴 또는 외란 |
| **Phased array set-up** | 주파수/소자크기/빔각/파동모드/프로브 위치/개수로 정의되는 프로브 배치 |
| **Probe position (PP)** | 웨지 전면에서 용접 중심선까지의 거리 |
| **ROI** | Region of Interest — 픽셀 격자로 분할된 영상화 대상 영역, 각 픽셀에 위상배열 빔포밍 초점 적용 |
| **Scan increment** | 스캔 방향(기계적/전자적)에서 연속된 데이터 수집점 간 거리 |
| **Skewed scan** | 사선 각도로 수행되는 스캔 (전자적 또는 프로브 방향으로 구현) |
| **SNR** | Signal to Noise Ratio — 원하는 신호 대 배경 잡음의 비 |
| **True depth** | 웨지 바닥과 평행한 시험체 내부 거리 |
| **HAZ** | Heat Affected Zone — 용접 열영향부 |
| **SDH** | Side Drilled Hole — 측면 천공 인공결함 |
| **FSH** | Full Screen Height — A-Scan 전체 화면 높이 |
| **DAC** | Distance Amplitude Correction — 거리진폭보정 곡선 |

---

## 3. 참조 표준 (Reference Documents)

NDT 교육생이 반드시 알아야 할 핵심 표준 목록.

| 표준 | 제목 |
|---|---|
| **ASME BPVC Sec. V (2021)** | Nondestructive Examination |
| **EN 16018 (2011)** | NDT — Terminology — Terms used in ultrasonic testing with phased arrays |
| **IACS UR W34 (2019)** | Advanced non-destructive testing of materials and welds |
| **ISO 11666 (2018)** | NDT of welds — UT — Acceptance levels |
| **ISO 13588 (2019)** | NDT of welds — UT — Use of automated phased array technology |
| **ISO 18563-1 (2015)** | NDT — Characterization & verification of UT PA equipment — **Part 1: Instruments** |
| **ISO 18563-2 (2017)** | 〃 — **Part 2: Probes** |
| **ISO 18563-3 (2015)** | 〃 — **Part 3: Combined systems** |
| **ISO 19285 (2016)** | NDT of welds — PA technique — **Acceptance criteria** |
| **ISO 20601 (2018)** | NDT of welds — UT — Automated PA technology for **thin-walled** steel components |
| **ISO 22825 (2017)** | NDT of welds — UT — Testing of welds in **austenitic steel and Ni-based alloys** |
| **ISO 23864 (2021)** | NDT of welds — UT — Automated **TFM** and related technologies |
| **ISO 23865 (2021)** | NDT — UT — General use of **FMC/TFM** and related technologies |
| **ISO 4761 (2022)** | NDT of welds — UT-PA for **thin-walled** steel components — Acceptance levels |
| **ISO 9712 (2012)** | NDT — **Qualification and certification of NDT personnel** |
| **Class Rule** | LR / DNV (DNV-CG0051) / ABS / BV / KR / NK |

---

## 4. PAUT 기법 분류 (Application by Thickness)

| 적용 | Parent material **>5mm** | Parent material **≤6mm** |
|---|---|---|
| Ultrasonic Technique | Technique 1 (DMA/DLA) | **TFM/PWI** (Direct + Multiple Indirect imaging path) |
| Testing Level | Testing Level D | Testing Level D |
| Acceptance Level | **AL2 (ISO 19285)** | **AL1 (ISO 4761)** |
| Scanning Method | Semi-Auto | Semi-Auto |

> 검사 체적 = 용접부 + 양측 HAZ 포함.

---

## 5. NDT 인원 자격 (Personnel Qualification)

> NDT 교육의 핵심 — 자격 없는 인원의 검사는 무효이다.

- **PAUT Operator / Interpreter**
  - **ISO 9712 Level 2 이상**, 제3자 인증 필수.
  - 데모(qualification through demonstration)를 통한 추가 운용자격 필요.
  - **TFM/PWI 기법** 운용자는 TFM 기법에 대한 익숙함과 실무 경험 필수. TFM 데모 합격자는 별도 교육 면제 가능.
- **Scanning Assistant**
  - 데이터 영상 취득을 보조하는 인원.
  - **SNT-TC-1A Level 2** 적용.
- 보고서 검토(Reviewer)는 **Level III** 가 일반적이다 (보고서 양식상).

---

## 6. 장비 요구사항 (Equipment)

### 6.1 Phased Array Instrument (ISO 18563-1)
- Pulse-echo 방식, **1 dB 이상** 분해능의 gain/attenuation 조절.
- 다중 독립 pulser/receiver 채널.
- **A-Scan 디지털화 ≥ 프로브 공칭 주파수의 6배**.
- 각 각도별 동일 음향 경로 진폭 응답 균등화 기능.
- 펄싱/수신 주파수 **1 ~ 10 MHz**.
- 대역폭은 프로브 중심 주파수의 **최소 2배**, HPF/LPF 적절 설정.
- 보정과 생산검사에 사용하는 **장비/기법/Focal Law는 동일**해야 함.

#### 승인 장비 (Table 2)
| 항목 | 모델 | 제조사 |
|---|---|---|
| Flaw Detector | Omni Scan X3/X4, Topaz 64/128, Gekko 64/128 | Evident(Olympus), Eddyfi(Zetec) |
| Data Collection SW | Omni Scan MXU, Ultravision3, Weldsight, Capture | 〃 |
| Data Analysis SW | Tomoview, Omni Scan, Ultravision3, Weldsight, Capture | 〃 |

> TFM 적용 시 **128 TFM 모델** 필요.

### 6.2 PAUT Probes
- 스테인리스강 적용을 위해 침투력 강화형 사용: **DMA, DLA, 2D Matrix, Linear(CCEV)** 등.
- 입상(granular) 재질에서 종파/횡파 송수신 능력 필수.

| Part No. | 종류 | Freq (MHz) | Elements | Pitch (mm) | Aperture (mm) |
|---|---|---|---|---|---|
| 4DM16X2-A27 | Dual Matrix | 4 | Dual 32 | 1.0 | 16×6 |
| 5DL16-12X5-A25 | Dual Linear | 5 | Dual 16 | 0.75 | 12×5 |
| AM5M9X7E | 2D Matrix | 5 | 63 (9×7) | 1.1 | 9.9×7.7 |
| EKFX-LA5/32 | Linear CCEV-A15 | 5 | 32 | 0.25 | 8 |
| EK25-DLA5/32 | Dual Linear | 5 | Dual 16 | 0.75 | 12 |
| EK11-LA5/64 | Linear A11 | 5 | 64 | 0.3 | 19.2 |

### 6.3 Wedges (ISO 18563-2)
- 파이프 외경에 맞는 곡률, **웨지-파이프 갭 ≤ 0.5mm**.
- 플랜지 용접부 검사: **Aqualene 등 유연성 Gel wedge** 사용. 플랜지 넥 스캔이 가능하면 Perspex 사용 가능.

### 6.4 Scanner & Encoder
- Chain / Belt / Manual 스캐너 사용. 기계식 홀더로 프로브 간격 고정 및 스캔축 정렬.
- **Encoder**: 미니 휠 타입, **스캔 분해능 ≥ 1.0 mm**.
- **Encoder 보정**: 500 mm 측정 시 시스템 출력 **±1% (±5 mm) 이내**. 이를 초과하면 수리/교체.

---

## 7. 검사 준비 (Preparation for Testing)

1. **검사 체적(Volume)**
   - 모재 두께 **<8mm**: 용접 양측 **1.25t** 이상 (예: 3.8t → 4.75mm, 7.9t → 9.9mm).
   - 모재 두께 **≥8mm**: 용접 양측 **≥10 mm**.
2. **표면 상태**: 녹·스케일·스패터·노치 등 제거. 프로브와 표면의 갭은 **≤0.5 mm**.
3. **온도**: 일반 프로브/접촉매질 사용 시 표면 **0 ~ 50 ℃**, 범위 외에는 장비 적합성 검증.
4. **Couplant**: 보정과 검사에서 동일. **물 또는 CMC** 권장. 염화물·황화물 등 모재 손상 물질 함량 규제 준수.
5. **검사 셋업 검증**: 기준시험편/검증블록 사용. **Amplitude encoding ≥ 200%** 설정.

---

## 8. 기준시험편 (Reference Blocks)

- **곡률**: 기준블록 직경의 **0.9 ~ 1.5배** 곡률 범위 검사 가능 (ISO 13588/23864).
- **재질**: 시험체와 유사 (음속·결정립·표면조건). 두께는 시험체의 **±10% 또는 ±3 mm 중 큰 값** 이내 (ISO 22825).
- **기준 반사체**:
  - **t ≤ 6mm**: 외부 노치 + 내부 노치 + SDH (또는 SNR 양호 시 노치만). 크기/길이 공차 ±10%.
  - **t > 5mm**: **1.5 mm SDH** in fusion line / weld center line. 깊이는 **1/4t, 1/2t, 3/4t**.

---

## 9. 보정 (Calibration) — NDT 핵심 절차

검사 전 **속도(Velocity) → 웨지지연(Wedge Delay) → 감도(Sensitivity)** 순서로 보정.

### 9.1 Velocity Calibration
| 적용 | 기법 | 방법 | Velocity |
|---|---|---|---|
| t ≤ 6mm | TFM/PWI | 용접부 중앙 SDH 영상 위치로 보정 | Fixed **3,023 m/s** |
| t > 5mm | DMA/DLA | IIW 블록 수동 UT 측정 후 장비 반영 | Fixed **5,700 m/s** |

> 스테인리스강은 모재와 용접금속 간 음속 차이가 발생할 수 있다.

### 9.2 Wedge Calibration
- 기준 SDH(1.0mm) 또는 노치로 envelope 형성 → 공차 확인 → 웨지 지연 검증.
- TFM은 웨지 정보로 imaging path의 비행시간 계산.

### 9.3 Sensitivity Calibration
- **각 zone별** 중앙 각도로 보정.
- 모든 zone을 기준 반사체에서 **80% FSH** 로 보정 (Reference sensitivity).
- TFM: Direct (T-T) **필수** + Indirect (TT-TT 또는 TT-T 또는 TTT-TT) 중 1개 추가.
- DMA/DLA: 모재 <7mm 시 **2개 zone**, 이상 시 **3개 zone**.

### 9.4 Region of Interest (ROI)
- **Width**: weld + HAZ 충분히 포함. t<8mm 시 양측 1.25t 이상.
- **Height**: 용접 보강부 + 두께(루트 포함) 완전 커버. Direct (T-T)는 모재의 **2.5배 이상**.

### 9.5 Signal to Noise Ratio (SNR)
- 기준 신호 대비 영상에서 **최소 6 dB (가능하면 12 dB)**.
- **<6 dB** 시 다른 NDT 기법 고려 필요. 기하학적 신호는 SNR 계산에서 제외.

---

## 10. 셋팅 점검 (Checking of the Setting)

### 10.1 Element Check (ISO 18563-3)
- 웨지 없이 보정블록 측면 30mm 에 프로브 위치, 각 소자 단독 송수신.
- Dead element 판정:  ΔSel = 20 log(Ael / Amean)
  - 보정기능 有: **ΔSel < −12 dB**
  - 보정기능 無: **ΔSel < −9 dB**
- **합격 기준**: 동일 active aperture 내 dead element **16개 중 최대 1개**, 인접 dead 금지. 16개 미만 사용 시 dead element 불허(데모로 입증된 경우 예외).

### 10.2 Amplification System Linearity (ISO 18563-3)
| Gain | 화면 진폭 (%FSH) | 허용 범위 (%FSH) |
|---|---|---|
| +2 dB | 101 | 95 minimum |
| 0 (G0) | 80 | Reference |
| −6 dB | 40 | 37 ~ 43 |
| −12 dB | 20 | 17 ~ 23 |

### 10.3 Setting Re-check 주기
- **최소 4시간마다** 또는 단일 검사 완료 시 점검.
- 초기 셋팅과 동일 기준블록(또는 전달특성이 알려진 소형 블록)으로 점검.

**Sensitivity 보정 조치 (Table 8)**

| 편차 | 조치 |
|---|---|
| ≤ 4 dB | 조치 불필요, 소프트웨어 보정 가능 |
| > 4 dB | 측정 chain 전체 점검, 결함 없으면 셋팅 재보정 + 마지막 유효 점검 이후 검사 **전량 재검사** |

**Range 보정 조치**

| 편차 | 조치 |
|---|---|
| ≤ 0.5 mm 또는 깊이의 2% 중 큰 값 | 조치 불필요 |
| 초과 | 셋팅 재보정 + 마지막 유효 점검 이후 검사 전량 재검사 |

### 10.4 Grid Verification (TFM)
- ROI 셋팅을 검사와 동일하게 적용, **ROI offset만 변경**.
- 수직열 SDH에 3 위치 클램핑: 중앙 / 좌측 2mm / 우측 2mm.
- 최대 진폭 SDH를 **80% FSH** 로 설정.
- Offset 증분 (5 MHz / λ=0.6 mm → **0.03 mm**)으로 **20회** 영상화·기록.

---

## 11. 재보정 사유 (Re-calibration Triggers)

다음 중 하나라도 발생 시 **시스템 재보정**:
1. 프로브, 웨지, 케이블 또는 케이블 길이 변경
2. 초음파 장비 변경
3. 검사 인원 변경
4. 전원 종류 변경
5. A-Scan 최대 진폭이 화면 스케일 범위를 초과 시 → **재보정 + 재검사**

---

## 12. 모재 검사 (Testing of Base Material)

- 일반적으로 라미네이션 사전 검사 불요(용접 검사 시 검출됨).
- 그러나 모재 불연속이 검사 영역에 영향을 줄 수 있으므로 별도 수행 가능.
- **ASTM A578** 준수, 합격 기준은 HSHI/제강사 계약 또는 Class 규정 따름.

| 항목 | 사양 |
|---|---|
| Scanning | Manual |
| Probe | MSEB 4 (4 MHz, 0°) |
| Sensitivity | 1st Back-wall **80%** |
| Testing Volume | 용접부 양측 **≥10 mm** |

---

## 13. 용접부 검사 (Weld Testing)

### 13.1 Sectorial-scan 기법
- 용접 중심선과 평행하게 직선 라인 스캔.
- 의심 영역/표면 불규칙 발견 시 **Appendix B의 Manual Shear wave UT** 추가 적용.

### 13.2 Scan Increment
| 모재 두께 | Scan Increment |
|---|---|
| ≤ 6 mm | **≤ 0.5 mm** |
| 6 ~ 10 mm | **≤ 1 mm** |
| 10 ~ 150 mm | **≤ 2 mm** |

### 13.3 Scanning Speed
- 영상 품질 확보 가능한 속도. Missing scan line은 속도 과다의 증거.
- **최대 150 mm/sec**.

### 13.4 데이터 취득 품질
- Missing line **≤ 5%**, 인접 라인 누락 금지.
- 누락 라인 폭 **≤ 1.0 mm**, 100 mm 구간당 누락 **≤ 2.0 mm**.
- **Coupling loss ≤ 20% (2 dB) FSH**.

---

## 14. 데이터 저장 (Data Storage)

- 컴퓨터 기반 데이터 취득 장치 사용.
- 모든 A-Scan 데이터와 셋업 파라미터 저장:
  - **Data Folder**: Project ID >> Inspection date + Report Number
  - **File Name**: Joint ID (Piece Number)
- 자기/광 매체에 **5년간 보관**.

---

## 15. 지시 평가 (Evaluation of Indications)

### 15.1 기하학적 지시 (Geometric Indication)
- 용접 보강부, 루트 형상, 금속조직 변화에 의한 지시는 결함 합격기준과 비교하지 않음.
- 분류 절차:
  1. 절차서에 따라 반사체 영역 해석.
  2. 지시 좌표 도시·검증, 단면 표시(루트·카운터보어 포함).
  3. 제작/용접 도면 검토.
  4. 필요 시 대체 NDT (다른 빔 각도, RT, ID/OD profiling 등) 적용.

### 15.2 Flaw Sizing — 12 dB drop 기법
- 결함 양단에서 **80% → 20% FSH** 로 진폭이 떨어지는 점 사이 거리를 결함 길이로 측정.

### 15.3 Discontinuity Grouping (ISO 19258 Tech.1 AL2)
두 불연속을 **하나로 간주**하는 조건:
- 길이 방향 거리 **dx < 더 긴 결함의 2배 길이**
- 폭/두께 방향 **dy, dz < 두께의 1/2 이거나 10 mm 중 작은 값**

조합 길이 **l₁₂ = l₁ + l₂ + dx**.

기록 레벨 이상 모든 개별 합격 불연속의 누적 길이는 임의 용접 길이 구간에서 모재 두께의 **6배의 20% 이하**.

---

## 16. 합격 기준 (Acceptance Criteria)

> ISO 19285 AL2 (DMA/DLA) & ISO 4761 AL1 (TFM/PWI)

| | TFM / PWI (ISO 4761 AL1) | | | DMA / DLA (ISO 19285 AL2) | |
|---|---|---|---|---|---|
| Flaw length | l ≤ 4 mm | 4 < l ≤ 6 mm | l > 6 mm | l ≤ THK | l > THK |
| Evaluation level | −12 dB (DAC 20%) | −12 dB (DAC 20%) | −12 dB (DAC 20%) | −14 dB (DAC 16%) | −14 dB (DAC 16%) |
| Recording level | −6 dB (DAC 40%) | −6 dB (DAC 40%) | −12 dB (DAC 20%) | −8 dB (DAC 32%) | −14 dB (DAC 16%) |
| Acceptance level | +6 dB (DAC 160%) | +2 dB (DAC 100%) | −10 dB (DAC 25%) | −4 dB (DAC 50%) | −10 dB (DAC 25%) |

---

## 17. 보충 검사 (Supplementary Inspection)

- **IGF Code** 적용 시: PAUT가 RT를 대체할 수 있으며, **선정된 위치에서 보충 RT** 수행하여 결과 검증.
- **Trigger Level RT**: 스테인리스 GTAW 용접에서 PAUT가 RT 대체 적용 시, 용접사/숍 단위로 결함율 기준의 trigger 설정. 주간 고결함율 또는 체적 결함 반복 시 추가 RT.
- 보충 NDE 방법과 범위는 Class와 조선소가 프로젝트 특성·계약 코드를 고려하여 협의.

---

## 18. 보고서 (Report)

검사 보고서에 최소한 포함되어야 할 항목:

- 적용 표준, NDT 절차, 합격 기준 참조
- 대상물 및 도면 참조
- 검사 장소 및 일자
- 재질 종류·치수
- PWHT 정보 (해당 시)
- 검사 영역 위치, 이음 종류
- 용접 프로세스
- **PAUT 운용자 정보 (성명, 자격 등급)**
- 계약 요구사항 (주문번호, 사양, 특약 등)
- 검출된 결함 위치·정보를 보여주는 스케치/사진/비디오/서술
- 검사 범위
- 각 기법별 파라미터 기술
- 합격 레벨 참조한 검사 결과
- **검사 책임자 서명**

---

## 19. 보충 NDT — Manual Shear Wave UT (Appendix B)

| 항목 | 사양 |
|---|---|
| 적용 | 스캐닝/해석 중 의심 영역 또는 표면 불규칙 발견 시 |
| 참조 절차 | LNG Fuel tank special agreement for UT by angular shear wave for Austenitic steels and Ni-based alloy |
| Calibration block | IIW Block |
| Reference block | 측면 fusion line의 1.5Φ SDH |
| 장비 | Pulse-echo UT 장비 (A-Scan) |
| Transducer | **2 ~ 5 MHz, 각도 70°/60°/45°** |
| Couplant | CMC 또는 Water |
| Sensitivity | 80% FSH |
| Scanning | 양측 한 면에서 0.5 ~ 1 Skip, **scanning sensitivity = ref + 6 dB** |
| Acceptance | **ISO 11666 Technique 1 — AL2** |

---

## 20. 교육생 자가점검 체크리스트

검사 착수 전 다음을 점검하라.

- [ ] 본인의 ISO 9712 Level 2 자격 및 PAUT 데모 수행 이력 확인
- [ ] 적용 절차서 Revision 최신본 확인 (현재 Rev.5)
- [ ] 적용 Class Rule (LR/DNV/ABS/BV/KR/NK) 확인
- [ ] 적용 기법 결정: 두께 ≤6 mm → TFM/PWI / >5 mm → DMA/DLA
- [ ] 기준시험편 선정 (재질·두께·곡률·반사체)
- [ ] 장비/프로브/웨지 ISO 18563 시리즈 적합성 확인
- [ ] Couplant 적합성 (염화물·황화물 등 함량) 확인
- [ ] 표면 상태 (스패터/녹/노치 제거, 갭 ≤0.5 mm)
- [ ] 온도 0 ~ 50 ℃
- [ ] Velocity → Wedge → Sensitivity 순 보정 완료
- [ ] Element check (dead element 기준 통과)
- [ ] Amplification linearity 점검
- [ ] SNR ≥ 6 dB (가능하면 12 dB)
- [ ] Encoder 보정 (±1% / 500 mm)
- [ ] 검사 후 데이터 저장 (5년 보관)
- [ ] 보고서 필수 항목 누락 여부

---

## 21. 용어 약어 정리 (Abbreviations Quick Reference)

| 약어 | 풀이름 |
|---|---|
| NDT / NDE | Non-Destructive Testing / Examination |
| UT / PAUT | Ultrasonic Testing / Phased Array UT |
| TFM / FMC | Total Focusing Method / Full Matrix Capture |
| PWI | Plane Wave Imaging |
| DMA / DLA | Dual Matrix Array / Dual Linear Array |
| HAZ | Heat Affected Zone |
| ROI | Region of Interest |
| SDH | Side Drilled Hole |
| FSH | Full Screen Height |
| DAC | Distance Amplitude Correction |
| SNR | Signal to Noise Ratio |
| AL | Acceptance Level |
| RT | Radiographic Testing |
| GTAW | Gas Tungsten Arc Welding |
| FCAW | Flux-Cored Arc Welding |
| CTOD | Crack Tip Opening Displacement |
| IIW | International Institute of Welding (calibration block) |
| IGF Code | International Code of Safety for Ships using Gases or other Low-flashpoint Fuels |
| PWHT | Post Weld Heat Treatment |

---

*본 교육자료는 HS-G612-019 Rev.5 절차서의 NDT 관련 내용을 학습 목적으로 추출·정리한 것입니다. 실제 검사·평가·합격 판정은 원본 절차서, 최신 ISO/Class 규정, 그리고 인증된 NDT 인력의 판단에 따라야 합니다.*
