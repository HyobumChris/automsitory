import { beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { NextRequest } from 'next/server';
import { createFineDocumentRecord, fineDataRootPath, updateFineDocumentRecord } from '../store';
import { POST as holdPost } from '@/app/api/fine-documents/[id]/hold/route';
import { GET as documentsGet } from '@/app/api/fine-documents/route';

describe('documents queue route', () => {
  beforeEach(async () => {
    await fs.rm(fineDataRootPath(), { recursive: true, force: true });
  });

  it('returns queue summary including on_hold status', async () => {
    const first = await createFineDocumentRecord({
      originalFileName: 'notice-a.txt',
      mimeType: 'text/plain',
      uploadedBy: 'user-a',
      fileBuffer: Buffer.from('A', 'utf-8'),
    });
    const second = await createFineDocumentRecord({
      originalFileName: 'notice-b.txt',
      mimeType: 'text/plain',
      uploadedBy: 'user-b',
      fileBuffer: Buffer.from('B', 'utf-8'),
    });

    await updateFineDocumentRecord(second.id, (record) => ({
      ...record,
      status: 'draft_created',
    }));

    const holdRequest = new NextRequest('http://localhost/api/fine-documents/hold', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: 'auditor', reason: 'manual check' }),
    });
    await holdPost(holdRequest, { params: Promise.resolve({ id: first.id }) });

    const queueResponse = await documentsGet(
      new NextRequest('http://localhost/api/fine-documents?limit=10'),
    );
    expect(queueResponse.status).toBe(200);
    const payload = (await queueResponse.json()) as {
      summary: Record<string, number>;
      records: Array<{ id: string }>;
    };

    expect(payload.summary.on_hold).toBe(1);
    expect(payload.summary.draft_created).toBe(1);
    expect(payload.records.length).toBe(2);
  });
});
