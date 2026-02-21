import { beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { createFineDocumentRecord, fineDataRootPath, readStoredDocumentFile, updateFineDocumentRecord } from '../store';
import { importVehicleEmailMappings, findRecipientByVehicleNumber } from '../mapping';
import { extractFineFields } from '../extraction';
import { createOutlookDraft } from '../graph';
import { buildDraftBody, buildDraftSubject } from '../templates';

describe('fine draft workflow', () => {
  beforeEach(async () => {
    await fs.rm(fineDataRootPath(), { recursive: true, force: true });
  });

  it('completes upload → extraction → recipient mapping → draft creation', async () => {
    const csv = 'vehicle_number,email\n231하1342,hyo-bum.bae@lr.org';
    const report = await importVehicleEmailMappings(csv);
    expect(report.importedRows).toBe(1);

    const record = await createFineDocumentRecord({
      originalFileName: 'notice.txt',
      mimeType: 'text/plain',
      uploadedBy: 'tester',
      fileBuffer: Buffer.from('dummy', 'utf-8'),
    });
    expect(record.status).toBe('uploaded');

    const extraction = extractFineFields(
      '차량번호 231하1342\n위반내용 주정차 위반\n납부기한 2026.02.06',
      'manual_override',
    );

    await updateFineDocumentRecord(record.id, (existing) => ({
      ...existing,
      status: 'extracted',
      extraction,
    }));

    const recipient = await findRecipientByVehicleNumber(extraction.vehicleNumber.value);
    expect(recipient?.email).toBe('hyo-bum.bae@lr.org');

    const subject = buildDraftSubject({
      vehicleNumber: extraction.vehicleNumber.value,
      paymentDeadline: extraction.paymentDeadline.value,
    });
    const body = buildDraftBody({
      recipientEmail: recipient!.email,
      vehicleNumber: extraction.vehicleNumber.value,
      paymentDeadline: extraction.paymentDeadline.value,
      violationDetails: extraction.violationDetails.value,
    });
    const attachmentBytes = await readStoredDocumentFile(record.id);
    const draft = await createOutlookDraft({
      recipientEmail: recipient!.email,
      subject,
      bodyText: body,
      attachment: {
        fileName: 'notice.txt',
        mimeType: 'text/plain',
        fileBytes: attachmentBytes,
      },
    });

    expect(draft.sendPolicy).toBe('manual_only');
    expect(draft.mode).toBe('mock');
  });
});
