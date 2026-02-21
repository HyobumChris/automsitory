# Fine Draft App UAT Checklist

## 공통 준비

- `/fine-draft` 접속
- 테스트 매핑 반입:
  - `231하1342,hyo-bum.bae@lr.org`
- 테스트 문서(또는 rawTextOverride) 준비

---

## 1. 기본 Happy Path

1. 문서 업로드
2. 필드 추출 실행
3. 추출값 검토
4. Draft 생성

**기대 결과**
- 상태가 `draft_created`
- 수신자 이메일 자동 매핑됨
- Draft 정책이 `manual_only`

---

## 2. 낮은 신뢰도 수동 확인 게이트

1. OCR 품질이 낮은 텍스트로 추출 실행
2. 수동 검토 체크 없이 Draft 생성 시도

**기대 결과**
- Draft 생성 거부 (`HUMAN_REVIEW_REQUIRED`)

3. `수동 검토 완료` 체크 후 재시도

**기대 결과**
- Draft 생성 성공

---

## 3. 다중 수신자 충돌

1. 동일 차량번호로 active 수신자 2명 이상 반입
2. Draft 생성 시도

**기대 결과**
- 수신자 충돌 안내
- 후보 선택 UI 노출

3. 후보 선택 후 Draft 재시도

**기대 결과**
- 선택한 이메일로 Draft 생성

---

## 4. 보류/보류해제

1. 문서를 `보류 처리`
2. 운영 모니터링/감사로그 확인

**기대 결과**
- 상태 `on_hold`
- 감사로그 `document_on_hold`

3. `보류 해제` 실행

**기대 결과**
- 상태가 `uploaded` 또는 `extracted`로 복귀
- 감사로그 `document_resumed`

---

## 5. 보관 정책 정리(Purge)

1. 오래된 레코드(테스트 데이터) 준비
2. 정리 일수 + 대상 상태 지정 후 purge 실행

**기대 결과**
- 삭제 건수 표시
- 운영 모니터링 목록에서 대상 레코드 제거

---

## 6. 보안 토큰 검증

1. `MAPPING_IMPORT_APPROVAL_TOKEN` 설정 후 매핑 반입(토큰 없이)
2. `PURGE_API_TOKEN` 설정 후 purge 실행(토큰 없이)

**기대 결과**
- 각각 403 차단

토큰 제공 후 재시도:

**기대 결과**
- 정상 처리
