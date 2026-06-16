import { beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { NextRequest } from 'next/server';
import { createFineDocumentRecord, fineDataRootPath, getFineDocumentRecord } from '@/lib/fine/store';
import { POST as holdPost } from '@/app/api/fine-documents/[id]/hold/route';

describe('hold route', () => {
  beforeEach(async () => {
    await fs.rm(fineDataRootPath(), { recursive: true, force: true });
  });

  it('marks document as on_hold and records audit reason', async () => {
    const record = await createFineDocumentRecord({
      originalFileName: 'notice.txt',
      mimeType: 'text/plain',
      uploadedBy: 'tester',
      fileBuffer: Buffer.from('sample', 'utf-8'),
    });

    const request = new NextRequest('http://localhost/api/fine-documents/test/hold', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: 'auditor', reason: 'recipient_conflict' }),
    });

    const beforeHold = await getFineDocumentRecord(record.id);
    expect(beforeHold).not.toBeNull();

    const response = await holdPost(request, {
      params: Promise.resolve({ id: record.id }),
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { status: string };
    expect(payload.status).toBe('on_hold');

    const updated = await getFineDocumentRecord(record.id);
    expect(updated?.status).toBe('on_hold');
    const lastAudit = updated?.auditLog[updated.auditLog.length - 1];
    expect(lastAudit?.action).toBe('document_on_hold');
  });
});
