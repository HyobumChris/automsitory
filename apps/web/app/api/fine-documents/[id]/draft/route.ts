import { NextRequest, NextResponse } from 'next/server';
import { findRecipientByVehicleNumber } from '@/lib/fine/mapping';
import { createOutlookDraft } from '@/lib/fine/graph';
import { buildDraftBody, buildDraftSubject } from '@/lib/fine/templates';
import { getFineDocumentRecord, readStoredDocumentFile, updateFineDocumentRecord } from '@/lib/fine/store';
import { normalizeVehicleNumber } from '@/lib/fine/normalization';

export const runtime = 'nodejs';

interface DraftRequestBody {
  actor?: string;
  overrideFields?: {
    vehicleNumber?: string;
    paymentDeadline?: string;
    violationDetails?: string;
  };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const record = await getFineDocumentRecord(id);
  if (!record) {
    return NextResponse.json({ error: 'document not found' }, { status: 404 });
  }
  if (!record.extraction) {
    return NextResponse.json({ error: 'extract step is required before draft creation.' }, { status: 409 });
  }

  let body: DraftRequestBody = {};
  try {
    body = (await req.json()) as DraftRequestBody;
  } catch {
    // empty request body allowed
  }

  const vehicleNumber = normalizeVehicleNumber(
    body.overrideFields?.vehicleNumber || record.extraction.vehicleNumber.value,
  );
  const paymentDeadline = body.overrideFields?.paymentDeadline || record.extraction.paymentDeadline.value;
  const violationDetails = body.overrideFields?.violationDetails || record.extraction.violationDetails.value;

  if (!vehicleNumber || !paymentDeadline || !violationDetails) {
    return NextResponse.json(
      {
        error: 'vehicleNumber, paymentDeadline, violationDetails are required. Provide overrideFields when OCR is incomplete.',
      },
      { status: 400 },
    );
  }

  const recipient = await findRecipientByVehicleNumber(vehicleNumber);
  if (!recipient) {
    return NextResponse.json(
      { error: `No active recipient mapping found for vehicle number ${vehicleNumber}.` },
      { status: 404 },
    );
  }

  try {
    const subject = buildDraftSubject({ vehicleNumber, paymentDeadline });
    const bodyText = buildDraftBody({
      recipientEmail: recipient.email,
      vehicleNumber,
      paymentDeadline,
      violationDetails,
    });
    const attachmentBytes = await readStoredDocumentFile(id);
    const draftResult = await createOutlookDraft({
      recipientEmail: recipient.email,
      subject,
      bodyText,
      attachment: {
        fileName: record.originalFileName,
        mimeType: record.mimeType,
        fileBytes: attachmentBytes,
      },
    });

    const actor = body.actor ?? record.uploadedBy;
    const updated = await updateFineDocumentRecord(id, (existing) => ({
      ...existing,
      status: 'draft_created',
      selectedFields: {
        vehicleNumber,
        paymentDeadline,
        violationDetails,
      },
      recipientEmail: recipient.email,
      draftResult,
      auditLog: [
        ...existing.auditLog,
        {
          at: new Date().toISOString(),
          action: 'draft_created',
          actor,
          details: {
            recipientEmail: recipient.email,
            draftId: draftResult.draftId,
            mode: draftResult.mode,
            sendPolicy: draftResult.sendPolicy,
          },
        },
      ],
    }));

    return NextResponse.json({
      id: updated.id,
      status: updated.status,
      recipientEmail: updated.recipientEmail,
      selectedFields: updated.selectedFields,
      draftResult: updated.draftResult,
      sendPolicy: 'manual_only',
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
