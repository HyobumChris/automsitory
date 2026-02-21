# 과속과징금 문서 Draft 자동화 가이드

## 목적

업로드된 과속/과징금 문서에서 다음 항목을 추출합니다.

- 차량번호
- 납부기한
- 위반사항

추출값을 차량번호-직원이메일 매핑과 결합하여 Outlook Draft를 자동 생성합니다.

> 정책: 자동 발송 금지. 시스템은 Draft만 생성하며, 사용자가 Outlook에서 수동 발송해야 합니다.

---

## 화면 경로

- `/fine-draft`

---

## 워크플로우

1. **매핑 반입**
   - CSV 업로드(텍스트 입력) 후 보안 승인 체크
   - 포맷 검증(차량번호 형식/이메일 형식/중복)
2. **문서 업로드**
   - PDF/JPG/PNG 파일 업로드
3. **필드 추출**
   - Azure Document Intelligence OCR 실행
   - 환경 미설정 시 `rawTextOverride`로 테스트 가능
   - 템플릿 프로파일 자동 판별:
     - `template_a_municipal_notice`
     - `generic_fallback`
4. **수동 검토**
   - 차량번호/납부기한/위반사항 수정
5. **Draft 생성**
   - Microsoft Graph로 Outlook Draft 생성 + 원본 첨부
6. **감사로그 확인**
   - 업로드/추출/드래프트 생성 이력 확인

---

## CSV 포맷

권장 헤더:

```csv
vehicle_number,email,employee_id,employee_name,status,updated_at
231하1342,hyo-bum.bae@lr.org,E0001,Bae Hyobum,active,2026-02-21T09:00:00Z
```

최소 요구 컬럼:

- `vehicle_number`
- `email`

---

## 환경 변수

### Azure OCR

```bash
AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT=
AZURE_DOCUMENT_INTELLIGENCE_KEY=
AZURE_DOCUMENT_INTELLIGENCE_API_VERSION=2024-11-30
```

### Microsoft Graph (Draft 생성 전용)

```bash
MS365_TENANT_ID=
MS365_CLIENT_ID=
MS365_CLIENT_SECRET=
MS365_MAILBOX_USER_ID=
```

필수 권한(앱 권한): `Mail.ReadWrite`

> `sendMail` API는 구현하지 않았으며 자동 발송은 지원하지 않습니다.

---

## 개발/검증 명령

```bash
npm run test
npm run build
```

---

## 주요 API

- `POST /api/fine-mappings/import`
- `GET /api/fine-mappings`
- `POST /api/fine-documents/upload`
- `POST /api/fine-documents/:id/extract`
- `POST /api/fine-documents/:id/draft`
- `GET /api/fine-documents/:id`
