import { NextResponse } from 'next/server';
import { mappingStats } from '@/lib/fine/mapping';

export const runtime = 'nodejs';

export async function GET() {
  const stats = await mappingStats();
  return NextResponse.json(stats);
}
