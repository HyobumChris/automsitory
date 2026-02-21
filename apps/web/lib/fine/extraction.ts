import type { ExtractedField, FineExtraction, OcrSource } from '@/lib/fine/types';
import { coerceIsoDate, normalizeVehicleNumber } from '@/lib/fine/normalization';

const VEHICLE_NUMBER_PATTERN = /\d{2,3}[가-힣]\d{4}/g;
const DATE_PATTERN = /20\d{2}[.\-/년\s]+\d{1,2}[.\-/월\s]+\d{1,2}/g;

function clampConfidence(input: number): number {
  if (input < 0) {
    return 0;
  }
  if (input > 1) {
    return 1;
  }
  return Math.round(input * 100) / 100;
}

function buildField(value: string, confidence: number, sourceText: string): ExtractedField {
  return {
    value: value.trim(),
    confidence: clampConfidence(confidence),
    sourceText: sourceText.trim(),
  };
}

function linesNearKeyword(lines: string[], keywordRegex: RegExp): string[] {
  const indexes = lines
    .map((line, idx) => (keywordRegex.test(line) ? idx : -1))
    .filter((idx) => idx >= 0);

  const nearby = new Set<string>();
  indexes.forEach((idx) => {
    for (let cursor = Math.max(0, idx - 1); cursor <= Math.min(lines.length - 1, idx + 1); cursor += 1) {
      nearby.add(lines[cursor]);
    }
  });
  return Array.from(nearby);
}

function extractVehicleNumber(lines: string[]): ExtractedField {
  const anchored = linesNearKeyword(lines, /(차량번호|자동차등록번호)/);
  for (const line of [...anchored, ...lines]) {
    const match = line.match(VEHICLE_NUMBER_PATTERN)?.[0];
    if (match) {
      return buildField(normalizeVehicleNumber(match), anchored.includes(line) ? 0.97 : 0.9, line);
    }
  }
  return buildField('', 0, '');
}

function extractPaymentDeadline(lines: string[]): ExtractedField {
  const anchored = linesNearKeyword(lines, /(납부기한|기한내|납기내|가산금)/);
  for (const line of [...anchored, ...lines]) {
    const match = line.match(DATE_PATTERN)?.[0];
    if (match) {
      const iso = coerceIsoDate(match);
      if (iso) {
        return buildField(iso, anchored.includes(line) ? 0.95 : 0.86, line);
      }
    }
  }
  return buildField('', 0, '');
}

function extractViolationDetails(lines: string[]): ExtractedField {
  const anchored = linesNearKeyword(lines, /(위반내용|위반사항|주정차|단속장소|단속일시)/);
  for (const line of anchored) {
    const cleaned = line.replace(/\s+/g, ' ').trim();
    if (cleaned.length >= 5) {
      return buildField(cleaned, 0.9, line);
    }
  }

  for (const line of lines) {
    if (/(위반|주정차|신호위반|속도위반)/.test(line)) {
      const cleaned = line.replace(/\s+/g, ' ').trim();
      return buildField(cleaned, 0.75, line);
    }
  }

  return buildField('', 0, '');
}

export function extractFineFields(rawText: string, ocrSource: OcrSource): FineExtraction {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const vehicleNumber = extractVehicleNumber(lines);
  const paymentDeadline = extractPaymentDeadline(lines);
  const violationDetails = extractViolationDetails(lines);
  const confidenceValues = [vehicleNumber.confidence, paymentDeadline.confidence, violationDetails.confidence];
  const overallConfidence = clampConfidence(
    confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length,
  );

  return {
    ocrSource,
    rawText,
    vehicleNumber,
    paymentDeadline,
    violationDetails,
    overallConfidence,
    requiresHumanReview:
      overallConfidence < 0.9 ||
      vehicleNumber.confidence < 0.9 ||
      paymentDeadline.confidence < 0.85 ||
      violationDetails.confidence < 0.75,
  };
}
