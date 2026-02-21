import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as importPost } from '@/app/api/fine-mappings/import/route';

describe('mapping import route security', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects when token is required but missing', async () => {
    vi.stubEnv('MAPPING_IMPORT_APPROVAL_TOKEN', 'approved-token');
    const request = new NextRequest('http://localhost/api/fine-mappings/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        csvText: 'vehicle_number,email\n231하1342,hyo-bum.bae@lr.org',
        securityApproved: true,
      }),
    });
    const response = await importPost(request);
    expect(response.status).toBe(403);
  });

  it('accepts when token is required and provided', async () => {
    vi.stubEnv('MAPPING_IMPORT_APPROVAL_TOKEN', 'approved-token');
    const request = new NextRequest('http://localhost/api/fine-mappings/import', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-security-approval-token': 'approved-token',
      },
      body: JSON.stringify({
        csvText: 'vehicle_number,email\n231하1342,hyo-bum.bae@lr.org',
        securityApproved: true,
      }),
    });
    const response = await importPost(request);
    expect(response.status).toBe(200);
  });
});
