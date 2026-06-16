# Lloyd's Register 해치코밍 크랙 방지 시각화

## 🚢 Container Ship Hatch Coaming Crack Arrest Visualization

로이드선급룰(Lloyd's Register Rules) 중 컨테이너선 해치코밍 크랙 방지책을 엔지니어들이 쉽게 이해할 수 있도록 만든 **인터랙티브 웹 기반 시각화 도구**입니다.

---

## 📋 개요 (Overview)

이 프로젝트는 다음 내용을 시각화합니다:

- **Table 8.2.1**: 해치코밍 측판 두께별 예방 조치
- **Table 8.2.2**: BCA(Brittle Crack Arrest) 강재 요구사항
- **인터랙티브 다이어그램**: 해치코밍 구조 및 부재별 상세 정보
- **핵심 요약**: 두께별 요구사항 플로우차트

---

## 🚀 사용 방법 (How to Use)

### 방법 1: 브라우저에서 직접 열기

```bash
# 파일을 웹 브라우저로 열기
open hatch_coaming_visualization.html

# 또는 브라우저에서 직접 파일 경로 입력
file:///path/to/hatch_coaming_visualization.html
```

### 방법 2: 로컬 서버로 실행

```bash
# Python 3가 설치된 경우
python3 -m http.server 8000

# 브라우저에서 접속
http://localhost:8000/hatch_coaming_visualization.html
```

### 방법 3: Live Server (VS Code)

1. VS Code에서 `hatch_coaming_visualization.html` 파일 열기
2. 우클릭 → "Open with Live Server"

---

## 💡 주요 기능 (Key Features)

### 1. 인터랙티브 다이어그램
- **마우스 호버**: 구조 부재 위에 마우스를 올리면 상세 정보 표시
- **클릭 지원**: 모바일/태블릿에서도 사용 가능
- **시각적 하이라이트**: 선택된 부재 강조 표시

### 2. 상세 테이블
- **Table 8.2.1**: 두께별 예방 조치 매트릭스
- **Table 8.2.2**: BCA 강재 등급 및 항복응력 요구사항
- **컬러 코딩**:
  - 🟢 BCA1 강재 (녹색 배경)
  - 🟡 BCA2 강재 (노란색 배경)

### 3. 두께별 분류
- **t ≤ 50mm**: 기본 예방 조치
- **50mm < t ≤ 80mm**: BCA1 강재 + 강화된 용접 관리
- **80mm < t ≤ 100mm**: BCA2 강재 + 추가 검사

### 4. 핵심 요약 플로우차트
- 두께 측정부터 요구사항까지 한눈에 파악
- 엔지니어링 의사결정 지원

---

## 📚 기술 정보 (Technical Information)

### BCA 강재란? (What is BCA Steel?)

**BCA (Brittle Crack Arrest)** = 취성균열 정지용 강재

- **BCA1**: 표준 크랙 방지 강재
  - 중간 두께 부재(50-80mm)용
  - 항복응력: 390-460 N/mm²

- **BCA2**: 고성능 크랙 방지 강재
  - 두꺼운 부재(80-100mm)용
  - 더 높은 인성(toughness) 요구
  - 항복응력: 390-460 N/mm²

### 예방 조치 상세 (Preventative Measures Detail)

- **(a)**: 재료 요구사항 (Material requirements)
- **(b)**: 용접 상세 (Welding details)
- **(c)**: 비파괴검사 (Non-destructive testing)
- **(d)**: 추가 검사 요구사항 (Additional inspection requirements)

---

## 🎨 시각화 특징 (Visualization Features)

### 반응형 디자인
- 데스크톱, 태블릿, 모바일 완전 지원
- 자동 레이아웃 조정

### 색상 체계
- **파란색 계열**: 해치코밍 측판
- **녹색**: 상갑판
- **주황색**: 코밍 상부
- **보라색 그라디언트**: 헤더 배경

### 애니메이션
- 페이드인 효과
- 호버 시 확대 효과
- 부드러운 전환 효과

---

## 📖 참고 자료 (References)

- **Lloyd's Register Rules for Ships**
- Part 3, Chapter 8 - Container Ships
- Section 8.2 - Hatch Coaming Crack Arrest Measures

---

## 🔧 기술 스택 (Tech Stack)

- **HTML5**: 구조
- **CSS3**: 스타일링 및 애니메이션
- **JavaScript**: 인터랙티브 기능
- **순수 바닐라 코드**: 외부 라이브러리 불필요

---

## 🎯 대상 사용자 (Target Users)

- 조선 엔지니어
- 선급 검사관
- 구조 설계 엔지니어
- 해양 공학 학생
- 품질 관리 담당자

---

## 📝 라이선스 (License)

이 시각화 도구는 교육 및 엔지니어링 참고 목적으로 제작되었습니다.

---

## 🤝 기여 (Contributing)

개선 사항이나 오류 발견 시 이슈를 등록해주세요.

---

## 📧 연락처 (Contact)

문의사항이 있으시면 프로젝트 리포지토리를 통해 연락주세요.

---

**Made with ❤️ for Marine Engineers**

*해양 엔지니어를 위한 시각화 도구*
