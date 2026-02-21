import { NextRequest, NextResponse } from 'next/server';
import { getFineDocumentRecord, updateFineDocumentRecord } from '@/lib/fine/store';

export const runtime = 'nodejs';

interface HoldRequestBody {
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

  let body: HoldRequestBody = {};
  try {
    body = (await req.json()) as HoldRequestBody;
  } catch {
    // allow empty request body
  }

  const actor = body.actor ?? record.uploadedBy;
  const reason = body.reason?.trim() || 'manual_hold_requested';

  const updated = await updateFineDocumentRecord(id, (existing) => ({
    ...existing,
    status: 'on_hold',
    auditLog: [
      ...existing.auditLog,
      {
        at: new Date().toISOString(),
        action: 'document_on_hold',
        actor,
        details: {
          reason,
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
