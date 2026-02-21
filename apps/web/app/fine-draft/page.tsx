'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FineDocumentRecord, FineExtraction, MappingImportReport } from '@/lib/fine/types';

interface DraftApiResponse {
  id: string;
  status: string;
  recipientEmail: string;
  selectedFields: {
    vehicleNumber: string;
    paymentDeadline: string;
    violationDetails: string;
  };
  draftResult: {
    draftId: string;
    webLink: string | null;
    mode: 'mock' | 'live';
    sendPolicy: 'manual_only';
  };
}

interface DraftErrorResponse {
  error?: string;
  errorCode?: string;
  candidates?: Array<{
    email: string;
    employeeId: string;
    employeeName: string;
    status: string;
  }>;
}

interface QueueRecord {
  id: string;
  status: string;
  originalFileName: string;
  uploadedBy: string;
  uploadedAt: string;
  recipientEmail: string | null;
  overallConfidence: number | null;
  requiresHumanReview: boolean | null;
  draftMode: string | null;
}

export default function FineDraftPage() {
  const [uploadedBy, setUploadedBy] = useState('ops-team');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [rawTextOverride, setRawTextOverride] = useState('');
  const [extraction, setExtraction] = useState<FineExtraction | null>(null);
  const [formVehicleNumber, setFormVehicleNumber] = useState('');
  const [formPaymentDeadline, setFormPaymentDeadline] = useState('');
  const [formViolationDetails, setFormViolationDetails] = useState('');
  const [holdReason, setHoldReason] = useState('');
  const [resumeReason, setResumeReason] = useState('');
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [draftResult, setDraftResult] = useState<DraftApiResponse | null>(null);
  const [recipientCandidates, setRecipientCandidates] = useState<DraftErrorResponse['candidates']>([]);
  const [selectedRecipientEmail, setSelectedRecipientEmail] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [working, setWorking] = useState(false);
  const [documentRecord, setDocumentRecord] = useState<FineDocumentRecord | null>(null);

  const [csvText, setCsvText] = useState(
    'vehicle_number,email,employee_id,employee_name,status\n231하1342,hyo-bum.bae@lr.org,E0001,Bae Hyobum,active',
  );
  const [securityApproved, setSecurityApproved] = useState(false);
  const [approvalToken, setApprovalToken] = useState('');
  const [mappingReport, setMappingReport] = useState<MappingImportReport | null>(null);
  const [mappingStats, setMappingStats] = useState<{ total: number; active: number; inactive: number } | null>(null);
  const [queueSummary, setQueueSummary] = useState<Record<string, number>>({});
  const [queueRecords, setQueueRecords] = useState<QueueRecord[]>([]);

  const canExtract = Boolean(documentId);
  const canCreateDraft = Boolean(documentId && extraction);

  const confidenceBadge = useMemo(() => {
    if (!extraction) {
      return null;
    }
    const score = Math.round(extraction.overallConfidence * 100);
    if (score >= 90) return { label: '높음', className: 'bg-emerald-500/20 text-emerald-300' };
    if (score >= 75) return { label: '보통', className: 'bg-amber-500/20 text-amber-300' };
    return { label: '낮음', className: 'bg-rose-500/20 text-rose-300' };
  }, [extraction]);

  useEffect(() => {
    const run = async () => {
      const response = await fetch('/api/fine-mappings');
      if (!response.ok) {
        return;
      }
      setMappingStats(await response.json());
    };
    void run();
  }, []);

  const refreshQueue = async () => {
    const response = await fetch('/api/fine-documents?limit=12');
    if (!response.ok) {
      return;
    }
    const payload = (await response.json()) as {
      summary: Record<string, number>;
      records: QueueRecord[];
    };
    setQueueSummary(payload.summary);
    setQueueRecords(payload.records);
  };

  useEffect(() => {
    void refreshQueue();
  }, []);

  const refreshDocumentRecord = async (id: string) => {
    const response = await fetch(`/api/fine-documents/${id}`);
    if (!response.ok) {
      return;
    }
    const payload = (await response.json()) as FineDocumentRecord;
    setDocumentRecord(payload);
    await refreshQueue();
  };

  const onUpload = async () => {
    if (!selectedFile) {
      setStatusMessage('업로드할 파일을 선택하세요.');
      return;
    }

    setWorking(true);
    setStatusMessage('');
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('uploadedBy', uploadedBy);
      const response = await fetch('/api/fine-documents/upload', {
        method: 'POST',
        body: formData,
      });
      const payload = await response.json();
      if (!response.ok) {
        setStatusMessage(payload.error ?? '업로드 실패');
        return;
      }
      setDocumentId(payload.id);
      setDraftResult(null);
      setRecipientCandidates([]);
      setSelectedRecipientEmail('');
      setExtraction(null);
      setReviewConfirmed(false);
      setDocumentRecord(null);
      await refreshDocumentRecord(payload.id);
      setStatusMessage(`업로드 완료. 문서 ID: ${payload.id}`);
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setWorking(false);
    }
  };

  const onExtract = async () => {
    if (!documentId) {
      return;
    }
    setWorking(true);
    setStatusMessage('');
    try {
      const response = await fetch(`/api/fine-documents/${documentId}/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actor: uploadedBy,
          rawTextOverride: rawTextOverride.trim() || undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setStatusMessage(payload.error ?? '추출 실패');
        return;
      }
      setExtraction(payload.extraction as FineExtraction);
      setFormVehicleNumber(payload.extraction.vehicleNumber.value);
      setFormPaymentDeadline(payload.extraction.paymentDeadline.value);
      setFormViolationDetails(payload.extraction.violationDetails.value);
      setRecipientCandidates([]);
      setSelectedRecipientEmail('');
      setReviewConfirmed(!payload.extraction.requiresHumanReview);
      await refreshDocumentRecord(documentId);
      setStatusMessage('필드 추출 완료. 필요한 경우 값을 수정한 뒤 Draft를 생성하세요.');
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setWorking(false);
    }
  };

  const onCreateDraft = async () => {
    if (!documentId) {
      return;
    }
    setWorking(true);
    setStatusMessage('');
    try {
      const response = await fetch(`/api/fine-documents/${documentId}/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actor: uploadedBy,
          recipientEmailOverride: selectedRecipientEmail || undefined,
          confirmHumanReview: reviewConfirmed,
          overrideFields: {
            vehicleNumber: formVehicleNumber,
            paymentDeadline: formPaymentDeadline,
            violationDetails: formViolationDetails,
          },
        }),
      });
      const payload = (await response.json()) as DraftApiResponse | DraftErrorResponse;
      if (!response.ok) {
        const errorPayload = payload as DraftErrorResponse;
        if (errorPayload.errorCode === 'RECIPIENT_CONFLICT' && errorPayload.candidates?.length) {
          setRecipientCandidates(errorPayload.candidates);
          if (!selectedRecipientEmail) {
            setSelectedRecipientEmail(errorPayload.candidates[0].email);
          }
          setStatusMessage('동일 차량번호에 다수 수신자가 있어 선택이 필요합니다.');
          return;
        }
        if (errorPayload.errorCode === 'HUMAN_REVIEW_REQUIRED') {
          setStatusMessage('신뢰도 미달 문서입니다. 수동 검토 확인 후 Draft를 생성하세요.');
          return;
        }
        if (errorPayload.candidates?.length) {
          setRecipientCandidates(errorPayload.candidates);
        }
        setStatusMessage(errorPayload.error ?? 'Draft 생성 실패');
        return;
      }
      setRecipientCandidates([]);
      setDraftResult(payload as DraftApiResponse);
      await refreshDocumentRecord(documentId);
      setStatusMessage('Draft 생성 완료. 정책상 실제 발송은 Outlook에서 수동으로 진행해야 합니다.');
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setWorking(false);
    }
  };

  const onHoldDocument = async () => {
    if (!documentId) {
      return;
    }
    setWorking(true);
    setStatusMessage('');
    try {
      const response = await fetch(`/api/fine-documents/${documentId}/hold`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actor: uploadedBy,
          reason: holdReason || undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setStatusMessage(payload.error ?? '보류 처리 실패');
        return;
      }
      await refreshDocumentRecord(documentId);
      setStatusMessage('문서를 보류 상태로 전환했습니다. 사유를 확인 후 재처리하세요.');
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setWorking(false);
    }
  };

  const onResumeDocument = async () => {
    if (!documentId) {
      return;
    }
    setWorking(true);
    setStatusMessage('');
    try {
      const response = await fetch(`/api/fine-documents/${documentId}/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actor: uploadedBy,
          reason: resumeReason || undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setStatusMessage(payload.error ?? '보류 해제 실패');
        return;
      }
      await refreshDocumentRecord(documentId);
      setStatusMessage('문서 보류가 해제되었습니다. 다시 추출/검토를 진행하세요.');
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setWorking(false);
    }
  };

  const onImportMappings = async () => {
    setWorking(true);
    setStatusMessage('');
    try {
      const response = await fetch('/api/fine-mappings/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(approvalToken ? { 'x-security-approval-token': approvalToken } : {}),
        },
        body: JSON.stringify({
          csvText,
          securityApproved,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setStatusMessage(payload.error ?? '매핑 업로드 실패');
        return;
      }
      setMappingReport(payload.report as MappingImportReport);
      const statsResponse = await fetch('/api/fine-mappings');
      if (statsResponse.ok) {
        setMappingStats(await statsResponse.json());
      }
      setStatusMessage('차량번호-이메일 매핑 반입 완료');
      await refreshQueue();
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setWorking(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#0b1220] text-slate-100">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold">과속과징금 문서 Draft 자동화 (MS365)</h1>
          <p className="text-sm text-slate-400">
            업로드 → OCR 추출 → 차량번호 매핑 → Outlook Draft 생성. 실제 발송은 반드시 사람이 수행합니다.
          </p>
        </header>

        <section className="bg-slate-900/70 border border-slate-700 rounded-xl p-4 space-y-4">
          <h2 className="text-lg font-semibold">1) 차량번호 - 이메일 매핑 반입</h2>
          <label className="block text-sm text-slate-300">
            CSV 텍스트
            <textarea
              className="mt-1 w-full min-h-32 rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
              value={csvText}
              onChange={(event) => setCsvText(event.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={securityApproved}
              onChange={(event) => setSecurityApproved(event.target.checked)}
            />
            보안 승인 완료 (실데이터 반입 가능)
          </label>
          <label className="block text-sm text-slate-300">
            보안 승인 토큰(선택, 서버 설정 시 필수)
            <input
              className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
              value={approvalToken}
              onChange={(event) => setApprovalToken(event.target.value)}
              placeholder="x-security-approval-token"
            />
          </label>
          <button
            type="button"
            onClick={onImportMappings}
            disabled={working}
            className="rounded-lg bg-cyan-600 hover:bg-cyan-500 px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            매핑 반입
          </button>

          {mappingStats && (
            <p className="text-xs text-slate-400">
              현재 매핑: 총 {mappingStats.total}건 / 활성 {mappingStats.active}건 / 비활성 {mappingStats.inactive}건
            </p>
          )}
          {mappingReport && (
            <div className="text-xs text-slate-300 bg-slate-950 border border-slate-700 rounded-lg p-3 space-y-1">
              <p>반입 {mappingReport.importedRows}건, 거절 {mappingReport.rejectedRows}건</p>
              {mappingReport.errors.length > 0 && <p>오류: {mappingReport.errors.join(' | ')}</p>}
              {mappingReport.duplicateVehicleNumbers.length > 0 && (
                <p>중복 차량번호: {mappingReport.duplicateVehicleNumbers.join(', ')}</p>
              )}
            </div>
          )}
        </section>

        <section className="bg-slate-900/70 border border-slate-700 rounded-xl p-4 space-y-4">
          <h2 className="text-lg font-semibold">2) 과징금 문서 업로드 및 추출</h2>

          <label className="block text-sm text-slate-300">
            작업자 식별자
            <input
              className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
              value={uploadedBy}
              onChange={(event) => setUploadedBy(event.target.value)}
            />
          </label>

          <label className="block text-sm text-slate-300">
            문서 파일(PDF/JPG/PNG)
            <input
              type="file"
              className="mt-1 block w-full text-sm text-slate-300"
              onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
            />
          </label>

          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={onUpload}
              disabled={working}
              className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              업로드
            </button>
            <button
              type="button"
              onClick={onExtract}
              disabled={!canExtract || working}
              className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              추출 실행
            </button>
          </div>

          <label className="block text-sm text-slate-300">
            OCR 대체 텍스트 (Azure OCR 미설정 환경 테스트용, 선택)
            <textarea
              className="mt-1 w-full min-h-28 rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-xs"
              value={rawTextOverride}
              onChange={(event) => setRawTextOverride(event.target.value)}
            />
          </label>

          {documentId && <p className="text-xs text-slate-400">문서 ID: {documentId}</p>}
        </section>

        <section className="bg-slate-900/70 border border-slate-700 rounded-xl p-4 space-y-4">
          <h2 className="text-lg font-semibold">3) 추출값 검토 후 Draft 생성</h2>
          {extraction && confidenceBadge && (
            <div className="text-xs flex items-center gap-3">
              <span className={`px-2 py-1 rounded ${confidenceBadge.className}`}>
                신뢰도 {Math.round(extraction.overallConfidence * 100)}% ({confidenceBadge.label})
              </span>
              <span className="text-slate-400">
                {extraction.requiresHumanReview ? '수동 검토 필요' : '자동 검토 통과'}
              </span>
              <span className="text-slate-400">프로파일: {extraction.profile}</span>
            </div>
          )}
          {extraction?.requiresHumanReview && (
            <label className="flex items-center gap-2 text-sm text-amber-200">
              <input
                type="checkbox"
                checked={reviewConfirmed}
                onChange={(event) => setReviewConfirmed(event.target.checked)}
              />
              추출값 수동 검토 완료 (확인 후에만 Draft 생성)
            </label>
          )}
          {extraction && extraction.matchedAnchors.length > 0 && (
            <p className="text-xs text-slate-400">
              템플릿 앵커 감지: {extraction.matchedAnchors.join(', ')}
            </p>
          )}

          <div className="grid md:grid-cols-3 gap-3">
            <label className="text-sm text-slate-300">
              차량번호
              <input
                className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
                value={formVehicleNumber}
                onChange={(event) => setFormVehicleNumber(event.target.value)}
              />
            </label>
            <label className="text-sm text-slate-300">
              납부기한
              <input
                className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
                value={formPaymentDeadline}
                onChange={(event) => setFormPaymentDeadline(event.target.value)}
              />
            </label>
            <label className="text-sm text-slate-300">
              위반사항
              <input
                className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
                value={formViolationDetails}
                onChange={(event) => setFormViolationDetails(event.target.value)}
              />
            </label>
          </div>

          <button
            type="button"
            onClick={onCreateDraft}
            disabled={!canCreateDraft || working}
            className="rounded-lg bg-violet-600 hover:bg-violet-500 px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            Outlook Draft 생성
          </button>
          <div className="grid md:grid-cols-[1fr_auto] gap-2 items-end">
            <label className="text-sm text-slate-300">
              보류 사유
              <input
                className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
                value={holdReason}
                onChange={(event) => setHoldReason(event.target.value)}
                placeholder="예: 수신자 확인 필요"
              />
            </label>
            <button
              type="button"
              onClick={onHoldDocument}
              disabled={!documentId || working}
              className="rounded-lg bg-amber-600 hover:bg-amber-500 px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              보류 처리
            </button>
          </div>
          <div className="grid md:grid-cols-[1fr_auto] gap-2 items-end">
            <label className="text-sm text-slate-300">
              보류 해제 사유
              <input
                className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
                value={resumeReason}
                onChange={(event) => setResumeReason(event.target.value)}
                placeholder="예: 자료 확인 완료"
              />
            </label>
            <button
              type="button"
              onClick={onResumeDocument}
              disabled={!documentId || working}
              className="rounded-lg bg-teal-600 hover:bg-teal-500 px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              보류 해제
            </button>
          </div>

          {recipientCandidates && recipientCandidates.length > 0 && (
            <label className="block text-sm text-slate-300">
              충돌 수신자 선택
              <select
                className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
                value={selectedRecipientEmail}
                onChange={(event) => setSelectedRecipientEmail(event.target.value)}
              >
                {recipientCandidates.map((candidate) => (
                  <option key={`${candidate.email}-${candidate.employeeId}`} value={candidate.email}>
                    {candidate.email} ({candidate.employeeName || candidate.employeeId || 'unknown'})
                  </option>
                ))}
              </select>
            </label>
          )}

          {draftResult && (
            <div className="text-xs bg-slate-950 border border-slate-700 rounded-lg p-3 space-y-1">
              <p>수신자: {draftResult.recipientEmail}</p>
              <p>Draft ID: {draftResult.draftResult.draftId}</p>
              <p>모드: {draftResult.draftResult.mode}</p>
              <p>발송 정책: {draftResult.draftResult.sendPolicy} (자동 발송 금지)</p>
              {draftResult.draftResult.webLink && (
                <a
                  className="text-cyan-300 underline"
                  href={draftResult.draftResult.webLink}
                  target="_blank"
                  rel="noreferrer"
                >
                  Outlook에서 Draft 열기
                </a>
              )}
            </div>
          )}
        </section>

        {statusMessage && (
          <p className="text-sm rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2">
            {statusMessage}
          </p>
        )}

        <section className="bg-slate-900/70 border border-slate-700 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">5) 운영 모니터링</h2>
            <button
              type="button"
              onClick={() => {
                void refreshQueue();
              }}
              className="rounded-lg bg-slate-700 hover:bg-slate-600 px-3 py-1.5 text-xs"
            >
              새로고침
            </button>
          </div>
          <p className="text-xs text-slate-400">
            상태 집계: uploaded {queueSummary.uploaded ?? 0} / extracted {queueSummary.extracted ?? 0} / on_hold{' '}
            {queueSummary.on_hold ?? 0} / draft_created {queueSummary.draft_created ?? 0}
          </p>
          <div className="max-h-72 overflow-auto rounded-lg border border-slate-700 bg-slate-950">
            <table className="w-full text-xs">
              <thead className="text-slate-300 border-b border-slate-700">
                <tr>
                  <th className="text-left px-3 py-2">문서</th>
                  <th className="text-left px-3 py-2">상태</th>
                  <th className="text-left px-3 py-2">신뢰도</th>
                  <th className="text-left px-3 py-2">수신자</th>
                  <th className="text-left px-3 py-2">업로드</th>
                </tr>
              </thead>
              <tbody>
                {queueRecords.map((record) => (
                  <tr key={record.id} className="border-b border-slate-800">
                    <td className="px-3 py-2">
                      <div className="text-slate-200">{record.originalFileName}</div>
                      <div className="text-slate-500">{record.id}</div>
                    </td>
                    <td className="px-3 py-2">{record.status}</td>
                    <td className="px-3 py-2">
                      {record.overallConfidence !== null ? `${Math.round(record.overallConfidence * 100)}%` : '-'}
                    </td>
                    <td className="px-3 py-2">{record.recipientEmail ?? '-'}</td>
                    <td className="px-3 py-2">
                      <div>{record.uploadedBy}</div>
                      <div className="text-slate-500">{record.uploadedAt}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {documentRecord && (
          <section className="bg-slate-900/70 border border-slate-700 rounded-xl p-4 space-y-3">
            <h2 className="text-lg font-semibold">4) 감사 추적 로그</h2>
            <p className="text-xs text-slate-400">
              상태: {documentRecord.status} / 업로드: {documentRecord.originalFileName}
            </p>
            <div className="max-h-60 overflow-auto rounded-lg border border-slate-700 bg-slate-950">
              <table className="w-full text-xs">
                <thead className="text-slate-300 border-b border-slate-700">
                  <tr>
                    <th className="text-left px-3 py-2">시각</th>
                    <th className="text-left px-3 py-2">행위</th>
                    <th className="text-left px-3 py-2">작업자</th>
                    <th className="text-left px-3 py-2">상세</th>
                  </tr>
                </thead>
                <tbody>
                  {documentRecord.auditLog.map((entry, idx) => (
                    <tr key={`${entry.at}-${idx}`} className="border-b border-slate-800 align-top">
                      <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{entry.at}</td>
                      <td className="px-3 py-2">{entry.action}</td>
                      <td className="px-3 py-2">{entry.actor}</td>
                      <td className="px-3 py-2 text-slate-400 break-all">
                        {entry.details ? JSON.stringify(entry.details) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
