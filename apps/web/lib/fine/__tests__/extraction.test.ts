import { describe, expect, it } from 'vitest';
import { extractFineFields } from '../extraction';

const SAMPLE_NOTICE_TEXT = `
과태료 고지서
차량번호 231하1342
위반내용 주정차 위반
납부기한 2026.02.06
`;

describe('extractFineFields', () => {
  it('extracts key fields from notice text', () => {
    const extraction = extractFineFields(SAMPLE_NOTICE_TEXT, 'manual_override');
    expect(extraction.vehicleNumber.value).toBe('231하1342');
    expect(extraction.paymentDeadline.value).toBe('2026-02-06');
    expect(extraction.violationDetails.value).toContain('위반');
  });

  it('marks incomplete extraction as review required', () => {
    const extraction = extractFineFields('빈 문서', 'manual_override');
    expect(extraction.requiresHumanReview).toBe(true);
    expect(extraction.overallConfidence).toBeLessThan(0.9);
  });
});
