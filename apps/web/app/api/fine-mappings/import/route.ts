import { NextRequest, NextResponse } from 'next/server';
import { importVehicleEmailMappings } from '@/lib/fine/mapping';

export const runtime = 'nodejs';

interface ImportRequestBody {
  csvText: string;
  securityApproved: boolean;
}

export async function POST(req: NextRequest) {
  let body: ImportRequestBody;
  try {
    body = (await req.json()) as ImportRequestBody;
  } catch {
    return NextResponse.json({ error: 'invalid json body' }, { status: 400 });
  }

  if (!body.securityApproved) {
    return NextResponse.json(
      { error: 'securityApproved must be true before importing vehicle/email mappings.' },
      { status: 403 },
    );
  }
  if (!body.csvText || body.csvText.trim().length === 0) {
    return NextResponse.json({ error: 'csvText is required.' }, { status: 400 });
  }

  const report = await importVehicleEmailMappings(body.csvText);
  return NextResponse.json({
    report,
  });
}
