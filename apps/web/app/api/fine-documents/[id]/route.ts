import { NextRequest, NextResponse } from 'next/server';
import { getFineDocumentRecord } from '@/lib/fine/store';

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const record = await getFineDocumentRecord(id);
  if (!record) {
    return NextResponse.json({ error: 'document not found' }, { status: 404 });
  }
  return NextResponse.json(record);
}
