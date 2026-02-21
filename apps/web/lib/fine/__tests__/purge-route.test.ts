import { beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import { NextRequest } from 'next/server';
import { createFineDocumentRecord, fineDataRootPath, updateFineDocumentRecord } from '@/lib/fine/store';
import { POST as purgePost } from '@/app/api/fine-documents/purge/route';
import { GET as listDocuments } from '@/app/api/fine-documents/route';

describe('purge route', () => {
  beforeEach(async () => {
    vi.unstubAllEnvs();
    await fs.rm(fineDataRootPath(), { recursive: true, force: true });
  });

  it('purges old records by status filter', async () => {
    const oldRecord = await createFineDocumentRecord({
      originalFileName: 'old.txt',
      mimeType: 'text/plain',
      uploadedBy: 'ops',
      fileBuffer: Buffer.from('old', 'utf-8'),
    });
    await updateFineDocumentRecord(oldRecord.id, (record) => ({
      ...record,
      status: 'on_hold',
      uploadedAt: '2024-01-01T00:00:00.000Z',
    }));

    const newRecord = await createFineDocumentRecord({
      originalFileName: 'new.txt',
      mimeType: 'text/plain',
      uploadedBy: 'ops',
      fileBuffer: Buffer.from('new', 'utf-8'),
    });
    await updateFineDocumentRecord(newRecord.id, (record) => ({
      ...record,
      status: 'on_hold',
      uploadedAt: new Date().toISOString(),
    }));

    const purgeRequest = new NextRequest('http://localhost/api/fine-documents/purge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        olderThanDays: 30,
        statuses: ['on_hold'],
      }),
    });
    const purgeResponse = await purgePost(purgeRequest);
    expect(purgeResponse.status).toBe(200);
    const payload = (await purgeResponse.json()) as { purgedCount: number; purgedIds: string[] };
    expect(payload.purgedCount).toBe(1);
    expect(payload.purgedIds).toContain(oldRecord.id);

    const listResponse = await listDocuments(new NextRequest('http://localhost/api/fine-documents?limit=10'));
    const listPayload = (await listResponse.json()) as { records: Array<{ id: string }> };
    expect(listPayload.records.map((row) => row.id)).not.toContain(oldRecord.id);
    expect(listPayload.records.map((row) => row.id)).toContain(newRecord.id);
  });

  it('supports dryRun mode without deleting candidates', async () => {
    const oldRecord = await createFineDocumentRecord({
      originalFileName: 'old-dryrun.txt',
      mimeType: 'text/plain',
      uploadedBy: 'ops',
      fileBuffer: Buffer.from('old', 'utf-8'),
    });
    await updateFineDocumentRecord(oldRecord.id, (record) => ({
      ...record,
      status: 'on_hold',
      uploadedAt: '2024-01-01T00:00:00.000Z',
    }));

    const dryRunRequest = new NextRequest('http://localhost/api/fine-documents/purge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        olderThanDays: 30,
        statuses: ['on_hold'],
        dryRun: true,
      }),
    });
    const dryRunResponse = await purgePost(dryRunRequest);
    expect(dryRunResponse.status).toBe(200);
    const dryPayload = (await dryRunResponse.json()) as { dryRun: boolean; candidateCount: number; candidateIds: string[] };
    expect(dryPayload.dryRun).toBe(true);
    expect(dryPayload.candidateCount).toBe(1);
    expect(dryPayload.candidateIds).toContain(oldRecord.id);

    const listResponse = await listDocuments(new NextRequest('http://localhost/api/fine-documents?limit=10'));
    const listPayload = (await listResponse.json()) as { records: Array<{ id: string }> };
    expect(listPayload.records.map((row) => row.id)).toContain(oldRecord.id);
  });

  it('requires token when PURGE_API_TOKEN is configured', async () => {
    vi.stubEnv('PURGE_API_TOKEN', 'secret-token');

    const purgeRequest = new NextRequest('http://localhost/api/fine-documents/purge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        olderThanDays: 1,
      }),
    });
    const blocked = await purgePost(purgeRequest);
    expect(blocked.status).toBe(403);

    const allowedRequest = new NextRequest('http://localhost/api/fine-documents/purge', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-purge-token': 'secret-token',
      },
      body: JSON.stringify({
        olderThanDays: 1,
      }),
    });
    const allowed = await purgePost(allowedRequest);
    expect(allowed.status).toBe(200);
  });
});
