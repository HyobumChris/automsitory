import { beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { NextRequest } from 'next/server';
import { fineDataRootPath, getFineDocumentRecord } from '@/lib/fine/store';
import { POST as importPost } from '@/app/api/fine-mappings/import/route';
import { POST as uploadPost } from '@/app/api/fine-documents/upload/route';
import { POST as extractPost } from '@/app/api/fine-documents/[id]/extract/route';
import { POST as draftPost } from '@/app/api/fine-documents/[id]/draft/route';
import { GET as getDocument } from '@/app/api/fine-documents/[id]/route';

describe('fine API e2e route flow', () => {
  beforeEach(async () => {
    await fs.rm(fineDataRootPath(), { recursive: true, force: true });
  });

  it('runs mapping import -> upload -> extract -> draft end-to-end', async () => {
    const mappingRequest = new NextRequest('http://localhost/api/fine-mappings/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        securityApproved: true,
        csvText: 'vehicle_number,email\n231하1342,hyo-bum.bae@lr.org',
      }),
    });
    const mappingResponse = await importPost(mappingRequest);
    expect(mappingResponse.status).toBe(200);

    const formData = new FormData();
    formData.append('uploadedBy', 'qa-tester');
    formData.append(
      'file',
      new File(
        ['sample notice payload'],
        'notice.txt',
        {
          type: 'text/plain',
        },
      ),
    );
    const uploadRequest = new NextRequest('http://localhost/api/fine-documents/upload', {
      method: 'POST',
      body: formData,
    });
    const uploadResponse = await uploadPost(uploadRequest);
    expect(uploadResponse.status).toBe(200);
    const uploadPayload = (await uploadResponse.json()) as { id: string; status: string };
    expect(uploadPayload.status).toBe('uploaded');

    const extractRequest = new NextRequest(`http://localhost/api/fine-documents/${uploadPayload.id}/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actor: 'qa-tester',
        rawTextOverride: '차량번호 231하1342\n위반내용 주정차 위반\n납부기한 2026.02.06',
      }),
    });
    const extractResponse = await extractPost(extractRequest, {
      params: Promise.resolve({ id: uploadPayload.id }),
    });
    expect(extractResponse.status).toBe(200);

    const draftRequest = new NextRequest(`http://localhost/api/fine-documents/${uploadPayload.id}/draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: 'qa-tester' }),
    });
    const draftResponse = await draftPost(draftRequest, {
      params: Promise.resolve({ id: uploadPayload.id }),
    });
    expect(draftResponse.status).toBe(200);
    const draftPayload = (await draftResponse.json()) as {
      status: string;
      recipientEmail: string;
      draftResult: { mode: string; sendPolicy: string };
    };
    expect(draftPayload.status).toBe('draft_created');
    expect(draftPayload.recipientEmail).toBe('hyo-bum.bae@lr.org');
    expect(draftPayload.draftResult.mode).toBe('mock');
    expect(draftPayload.draftResult.sendPolicy).toBe('manual_only');

    const getResponse = await getDocument(
      new NextRequest(`http://localhost/api/fine-documents/${uploadPayload.id}`),
      { params: Promise.resolve({ id: uploadPayload.id }) },
    );
    expect(getResponse.status).toBe(200);

    const stored = await getFineDocumentRecord(uploadPayload.id);
    expect(stored?.status).toBe('draft_created');
  });
});
