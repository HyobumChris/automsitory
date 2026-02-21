import { NextRequest, NextResponse } from 'next/server';
import { listFineDocumentRecords, summarizeFineDocumentStatuses } from '@/lib/fine/store';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const limitRaw = req.nextUrl.searchParams.get('limit') ?? '20';
  const statusFilter = req.nextUrl.searchParams.get('status');
  const limitParsed = Number(limitRaw);
  const limit = Number.isFinite(limitParsed) && limitParsed > 0 ? Math.floor(limitParsed) : 20;

  const records = await listFineDocumentRecords(limit);
  const filtered = statusFilter ? records.filter((record) => record.status === statusFilter) : records;
  const summary = await summarizeFineDocumentStatuses();

  return NextResponse.json({
    summary,
    count: filtered.length,
    records: filtered.map((record) => ({
      id: record.id,
      status: record.status,
      originalFileName: record.originalFileName,
      uploadedBy: record.uploadedBy,
      uploadedAt: record.uploadedAt,
      recipientEmail: record.recipientEmail,
      overallConfidence: record.extraction?.overallConfidence ?? null,
      requiresHumanReview: record.extraction?.requiresHumanReview ?? null,
      draftMode: record.draftResult?.mode ?? null,
    })),
  });
}
