# App Automation — ZeroHarm 안전 체크리스트 자동화

Android 앱(ZeroHarm)을 **원터치**로 열고, 안전 체크리스트를 자동 작성/제출한 뒤, 앱을 종료하는 Python + Appium 기반 자동화 도구.

## 사전 준비

### 1. PC 환경

| 항목 | 설치 방법 |
|------|-----------|
| Python 3.10+ | https://python.org |
| Node.js 18+ | https://nodejs.org |
| Appium 2.x | `npm install -g appium` |
| UiAutomator2 드라이버 | `appium driver install uiautomator2` |
| Android SDK (adb) | Android Studio 설치 또는 platform-tools 단독 설치 |

### 2. Android 디바이스/에뮬레이터

1. **개발자 옵션 활성화**: 설정 → 휴대전화 정보 → 빌드 번호 7회 탭
2. **USB 디버깅 ON**: 설정 → 개발자 옵션 → USB 디버깅
3. USB 연결 후 `adb devices`로 디바이스 확인

### 3. Python 의존성 설치

```bash
cd app-automation
pip install -r requirements.txt
```

## 설정 (config.yaml)

### 앱 패키지명 확인

```bash
# ZeroHarm 앱이 설치된 상태에서:
adb shell pm list packages | grep -i zeroharm
# 예: package:com.zeroharm.app

# 현재 실행 중인 앱의 Activity 확인:
adb shell dumpsys activity activities | grep -i zeroharm
# 예: com.zeroharm.app/.MainActivity
```

`config.yaml`의 `app.package`와 `app.activity`를 위에서 확인한 값으로 수정.

### UI 요소 파악 (메뉴 경로 설정)

```bash
# 앱을 열고 UI 구조를 XML로 덤프:
python run.py --dump-ui

# ui_dump.xml 파일에서 메뉴 텍스트, ID 등을 확인하여
# config.yaml의 checklist.menu_path를 수정
```

### 체크리스트 모드

- `check_all`: 화면의 모든 체크박스를 자동 체크
- `by_config`: `items` 목록에 따라 개별 항목 지정 (인덱스 기반)

## 실행

```bash
# Appium 서버 시작 (별도 터미널)
appium

# 자동화 실행
python run.py

# 커스텀 설정 파일 사용
python run.py -c my_config.yaml

# 설정 확인만 (실행 안 함)
python run.py --dry-run
```

## 프로젝트 구조

```
app-automation/
├── run.py                      # 원터치 실행 진입점
├── config.yaml                 # 자동화 설정 (앱, 디바이스, 시나리오)
├── core.py                     # Appium 자동화 코어 엔진
├── requirements.txt            # Python 의존성
├── scenarios/
│   └── zeroharm_checklist.py   # ZeroHarm 체크리스트 시나리오
├── utils/
│   ├── config_loader.py        # YAML 설정 로더
│   └── logger_setup.py         # 로깅 초기화
├── screenshots/                # 스크린샷 자동 저장 (자동 생성)
└── logs/                       # 로그 파일 (자동 생성)
```

## 트러블슈팅

| 증상 | 해결 |
|------|------|
| `Could not find adb` | Android SDK platform-tools를 PATH에 추가 |
| `SessionNotCreatedException` | Appium 서버가 실행 중인지 확인 (`appium` 명령) |
| 체크박스를 못 찾음 | `--dump-ui`로 실제 UI 요소 확인 후 시나리오 수정 |
| 메뉴 텍스트 매칭 실패 | config.yaml의 `menu_path` 텍스트를 앱 언어에 맞게 수정 |
| 디바이스 연결 안 됨 | `adb devices` 확인, USB 디버깅 활성화 확인 |
