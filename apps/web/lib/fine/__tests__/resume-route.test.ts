import { beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { NextRequest } from 'next/server';
import { createFineDocumentRecord, fineDataRootPath, getFineDocumentRecord } from '@/lib/fine/store';
import { POST as holdPost } from '@/app/api/fine-documents/[id]/hold/route';
import { POST as resumePost } from '@/app/api/fine-documents/[id]/resume/route';

describe('resume route', () => {
  beforeEach(async () => {
    await fs.rm(fineDataRootPath(), { recursive: true, force: true });
  });

  it('resumes on_hold document back to uploaded when extraction missing', async () => {
    const record = await createFineDocumentRecord({
      originalFileName: 'notice.txt',
      mimeType: 'text/plain',
      uploadedBy: 'tester',
      fileBuffer: Buffer.from('sample', 'utf-8'),
    });

    const holdRequest = new NextRequest('http://localhost/api/fine-documents/hold', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: 'auditor', reason: 'manual check' }),
    });
    await holdPost(holdRequest, { params: Promise.resolve({ id: record.id }) });

    const resumeRequest = new NextRequest('http://localhost/api/fine-documents/resume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: 'auditor', reason: 'resolved' }),
    });
    const response = await resumePost(resumeRequest, { params: Promise.resolve({ id: record.id }) });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { status: string };
    expect(payload.status).toBe('uploaded');

    const updated = await getFineDocumentRecord(record.id);
    expect(updated?.status).toBe('uploaded');
    expect(updated?.auditLog[updated.auditLog.length - 1].action).toBe('document_resumed');
  });
});
