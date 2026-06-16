import { NextRequest, NextResponse } from 'next/server';
import { getFineDocumentRecord, updateFineDocumentRecord } from '@/lib/fine/store';

export const runtime = 'nodejs';

interface ResumeRequestBody {
  actor?: string;
  reason?: string;
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

  let body: ResumeRequestBody = {};
  try {
    body = (await req.json()) as ResumeRequestBody;
  } catch {
    // empty body allowed
  }

  const actor = body.actor ?? record.uploadedBy;
  const reason = body.reason?.trim() || 'manual_resume_requested';
  const nextStatus = record.extraction ? 'extracted' : 'uploaded';

  const updated = await updateFineDocumentRecord(id, (existing) => ({
    ...existing,
    status: nextStatus,
    auditLog: [
      ...existing.auditLog,
      {
        at: new Date().toISOString(),
        action: 'document_resumed',
        actor,
        details: {
          reason,
          nextStatus,
        },
      },
    ],
  }));

  return NextResponse.json({
    id: updated.id,
    status: updated.status,
    reason,
  });
}
