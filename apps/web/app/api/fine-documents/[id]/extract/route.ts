import { NextRequest, NextResponse } from 'next/server';
import { extractFineFields } from '@/lib/fine/extraction';
import { extractRawTextFromDocument } from '@/lib/fine/ocr';
import { getFineDocumentRecord, readStoredDocumentFile, updateFineDocumentRecord } from '@/lib/fine/store';
import type { OcrSource } from '@/lib/fine/types';

export const runtime = 'nodejs';

interface ExtractRequestBody {
  rawTextOverride?: string;
  actor?: string;
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

  let requestBody: ExtractRequestBody = {};
  try {
    requestBody = (await req.json()) as ExtractRequestBody;
  } catch {
    // no-op: empty body allowed
  }

  try {
    let rawText: string;
    let source: OcrSource;

    if (requestBody.rawTextOverride && requestBody.rawTextOverride.trim().length > 0) {
      rawText = requestBody.rawTextOverride;
      source = 'manual_override';
    } else {
      const fileBytes = await readStoredDocumentFile(id);
      const ocrResult = await extractRawTextFromDocument({
        fileBytes,
        mimeType: record.mimeType,
        fileName: record.originalFileName,
      });
      rawText = ocrResult.rawText;
      source = ocrResult.source;
    }

    const extraction = extractFineFields(rawText, source);
    const actor = requestBody.actor ?? record.uploadedBy;

    const updated = await updateFineDocumentRecord(id, (existing) => ({
      ...existing,
      status: 'extracted',
      extraction,
      auditLog: [
        ...existing.auditLog,
        {
          at: new Date().toISOString(),
          action: 'fields_extracted',
          actor,
          details: {
            ocrSource: source,
            overallConfidence: extraction.overallConfidence,
            requiresHumanReview: extraction.requiresHumanReview,
          },
        },
      ],
    }));

    return NextResponse.json({
      id: updated.id,
      status: updated.status,
      extraction: updated.extraction,
    });
  } catch (error) {
    return NextResponse.json(
      { error: String(error), hint: 'If Azure OCR is not configured, send rawTextOverride in request body.' },
      { status: 422 },
    );
  }
}
