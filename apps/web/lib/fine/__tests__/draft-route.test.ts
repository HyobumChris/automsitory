import { beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { NextRequest } from 'next/server';
import { POST as draftPost } from '@/app/api/fine-documents/[id]/draft/route';
import { extractFineFields } from '../extraction';
import { importVehicleEmailMappings } from '../mapping';
import { createFineDocumentRecord, fineDataRootPath, getFineDocumentRecord, updateFineDocumentRecord } from '../store';

describe('draft route recipient conflict handling', () => {
  beforeEach(async () => {
    await fs.rm(fineDataRootPath(), { recursive: true, force: true });
  });

  it('returns RECIPIENT_CONFLICT when multiple active recipients exist', async () => {
    await importVehicleEmailMappings(
      [
        'vehicle_number,email,employee_id,employee_name,status',
        '231하1342,hyo-bum.bae@lr.org,E1,Bae,active',
        '231하1342,other.user@lr.org,E2,Other,active',
      ].join('\n'),
    );

    const record = await createFineDocumentRecord({
      originalFileName: 'notice.txt',
      mimeType: 'text/plain',
      uploadedBy: 'tester',
      fileBuffer: Buffer.from('raw notice', 'utf-8'),
    });
    await updateFineDocumentRecord(record.id, (existing) => ({
      ...existing,
      status: 'extracted',
      extraction: extractFineFields('차량번호 231하1342\n위반내용 주정차 위반\n납부기한 2026.02.06', 'manual_override'),
    }));

    const request = new NextRequest('http://localhost/api/fine-documents/id/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: 'tester' }),
    });
    const response = await draftPost(request, { params: Promise.resolve({ id: record.id }) });
    expect(response.status).toBe(409);
    const payload = (await response.json()) as { errorCode?: string; candidates?: unknown[] };
    expect(payload.errorCode).toBe('RECIPIENT_CONFLICT');
    expect(payload.candidates?.length).toBe(2);
  });

  it('creates draft when recipientEmailOverride resolves conflict', async () => {
    await importVehicleEmailMappings(
      [
        'vehicle_number,email,employee_id,employee_name,status',
        '231하1342,hyo-bum.bae@lr.org,E1,Bae,active',
        '231하1342,other.user@lr.org,E2,Other,active',
      ].join('\n'),
    );

    const record = await createFineDocumentRecord({
      originalFileName: 'notice.txt',
      mimeType: 'text/plain',
      uploadedBy: 'tester',
      fileBuffer: Buffer.from('raw notice', 'utf-8'),
    });
    await updateFineDocumentRecord(record.id, (existing) => ({
      ...existing,
      status: 'extracted',
      extraction: extractFineFields('차량번호 231하1342\n위반내용 주정차 위반\n납부기한 2026.02.06', 'manual_override'),
    }));

    const request = new NextRequest('http://localhost/api/fine-documents/id/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actor: 'tester',
        recipientEmailOverride: 'other.user@lr.org',
      }),
    });
    const response = await draftPost(request, { params: Promise.resolve({ id: record.id }) });
    expect(response.status).toBe(200);

    const updated = await getFineDocumentRecord(record.id);
    expect(updated?.status).toBe('draft_created');
    expect(updated?.recipientEmail).toBe('other.user@lr.org');
  });
});
