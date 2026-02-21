import { describe, expect, it } from 'vitest';
import { FINE_DRAFT_POLICY } from '../policy';

describe('FINE_DRAFT_POLICY', () => {
  it('enforces manual send policy with MS365 defaults', () => {
    expect(FINE_DRAFT_POLICY.emailProvider).toBe('microsoft_graph');
    expect(FINE_DRAFT_POLICY.sendPolicy).toBe('manual_only');
    expect(FINE_DRAFT_POLICY.ocrEngine).toBe('azure_document_intelligence');
  });

  it('defines retention defaults for purge operations', () => {
    expect(FINE_DRAFT_POLICY.retention.defaultPurgeDays).toBeGreaterThan(0);
    expect(FINE_DRAFT_POLICY.retention.defaultPurgeStatuses).toContain('on_hold');
  });
});
