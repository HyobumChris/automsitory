const PRIMARY_PLATE_PATTERN = /^\d{2,3}[가-힣]\d{4}$/;
const REGION_PREFIX_PATTERN = /^[가-힣]{2}\d{2}[가-힣]\d{4}$/;

export function normalizeVehicleNumber(vehicleNumber: string): string {
  return vehicleNumber.replace(/[\s-]/g, '').trim();
}

export function isLikelyKoreanPlateNumber(vehicleNumber: string): boolean {
  const normalized = normalizeVehicleNumber(vehicleNumber);
  return PRIMARY_PLATE_PATTERN.test(normalized) || REGION_PREFIX_PATTERN.test(normalized);
}

export function coerceIsoDate(input: string): string | null {
  const trimmed = input.trim();
  const match = trimmed.match(/(20\d{2})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const monthPadded = String(month).padStart(2, '0');
  const dayPadded = String(day).padStart(2, '0');
  return `${year}-${monthPadded}-${dayPadded}`;
}
