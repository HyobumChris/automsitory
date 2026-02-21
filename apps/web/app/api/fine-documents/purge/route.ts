import { NextRequest, NextResponse } from 'next/server';
import { purgeFineDocumentRecords } from '@/lib/fine/store';

export const runtime = 'nodejs';

interface PurgeRequestBody {
  olderThanDays?: number;
  statuses?: string[];
}

export async function POST(req: NextRequest) {
  const requiredToken = process.env.PURGE_API_TOKEN;
  if (requiredToken) {
    const providedToken = req.headers.get('x-purge-token');
    if (!providedToken || providedToken !== requiredToken) {
      return NextResponse.json({ error: 'Valid purge token is required.' }, { status: 403 });
    }
  }

  let body: PurgeRequestBody = {};
  try {
    body = (await req.json()) as PurgeRequestBody;
  } catch {
    // empty body allowed
  }

  const olderThanDays = Number.isFinite(body.olderThanDays)
    ? Math.max(0, Math.floor(body.olderThanDays as number))
    : 30;
  const statuses = Array.isArray(body.statuses) ? body.statuses.filter((status) => typeof status === 'string') : [];

  const result = await purgeFineDocumentRecords({
    olderThanDays,
    statuses: statuses.length > 0 ? statuses : undefined,
  });

  return NextResponse.json({
    purgedCount: result.purgedCount,
    purgedIds: result.purgedIds,
    olderThanDays,
    statuses: statuses.length > 0 ? statuses : 'ALL',
  });
}
