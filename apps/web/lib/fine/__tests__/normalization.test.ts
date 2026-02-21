import { describe, expect, it } from 'vitest';
import { coerceIsoDate, isLikelyKoreanPlateNumber, normalizeVehicleNumber } from '../normalization';

describe('normalizeVehicleNumber', () => {
  it('removes spaces and hyphens', () => {
    expect(normalizeVehicleNumber('231 하-1342')).toBe('231하1342');
  });
});

describe('isLikelyKoreanPlateNumber', () => {
  it('accepts modern plate format', () => {
    expect(isLikelyKoreanPlateNumber('231하1342')).toBe(true);
  });

  it('rejects invalid format', () => {
    expect(isLikelyKoreanPlateNumber('ABC-1234')).toBe(false);
  });
});

describe('coerceIsoDate', () => {
  it('normalizes dotted date string', () => {
    expect(coerceIsoDate('2026.02.06')).toBe('2026-02-06');
  });

  it('returns null when not date-like', () => {
    expect(coerceIsoDate('미지정')).toBeNull();
  });
});
