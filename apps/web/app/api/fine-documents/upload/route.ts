import { NextRequest, NextResponse } from 'next/server';
import { createFineDocumentRecord } from '@/lib/fine/store';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const uploadedBy = String(form.get('uploadedBy') ?? 'unknown-user');
    const file = form.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file is required.' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const record = await createFineDocumentRecord({
      originalFileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      uploadedBy,
      fileBuffer: Buffer.from(arrayBuffer),
    });

    return NextResponse.json({
      id: record.id,
      status: record.status,
      uploadedAt: record.uploadedAt,
      originalFileName: record.originalFileName,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
