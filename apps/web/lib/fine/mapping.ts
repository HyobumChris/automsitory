import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fineDataRootPath } from '@/lib/fine/store';
import { isLikelyKoreanPlateNumber, normalizeVehicleNumber } from '@/lib/fine/normalization';
import type { MappingImportReport, VehicleEmailMappingRow } from '@/lib/fine/types';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAPPINGS_PATH = path.join(fineDataRootPath(), 'vehicle-email-mappings.json');

async function readMappings(): Promise<VehicleEmailMappingRow[]> {
  try {
    const raw = await fs.readFile(MAPPINGS_PATH, 'utf-8');
    return JSON.parse(raw) as VehicleEmailMappingRow[];
  } catch {
    return [];
  }
}

async function writeMappings(rows: VehicleEmailMappingRow[]): Promise<void> {
  await fs.mkdir(path.dirname(MAPPINGS_PATH), { recursive: true });
  await fs.writeFile(MAPPINGS_PATH, JSON.stringify(rows, null, 2), 'utf-8');
}

function splitCsvLine(line: string): string[] {
  return line.split(',').map((token) => token.trim());
}

export function parseVehicleEmailCsv(csvText: string): {
  rows: VehicleEmailMappingRow[];
  report: MappingImportReport;
} {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const report: MappingImportReport = {
    totalRows: lines.length,
    importedRows: 0,
    rejectedRows: 0,
    duplicateVehicleNumbers: [],
    errors: [],
  };

  if (lines.length === 0) {
    report.errors.push('CSV is empty.');
    return { rows: [], report };
  }

  const firstColumns = splitCsvLine(lines[0]).map((column) => column.toLowerCase());
  const hasHeader = firstColumns.includes('vehicle_number') || firstColumns.includes('email');
  const rowsToParse = hasHeader ? lines.slice(1) : lines;

  const imported: VehicleEmailMappingRow[] = [];
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  rowsToParse.forEach((line, index) => {
    const columns = splitCsvLine(line);
    const rowNumber = hasHeader ? index + 2 : index + 1;

    const vehicleNumberRaw = columns[0] ?? '';
    const email = columns[1] ?? '';
    const employeeId = columns[2] ?? '';
    const employeeName = columns[3] ?? '';
    const status = (columns[4] ?? 'active').toLowerCase() === 'inactive' ? 'inactive' : 'active';
    const updatedAt = columns[5] ?? new Date().toISOString();

    if (!vehicleNumberRaw || !email) {
      report.errors.push(`Row ${rowNumber}: vehicle_number and email are required.`);
      return;
    }

    const vehicleNumberNormalized = normalizeVehicleNumber(vehicleNumberRaw);
    if (!isLikelyKoreanPlateNumber(vehicleNumberNormalized)) {
      report.errors.push(`Row ${rowNumber}: invalid vehicle number format (${vehicleNumberRaw}).`);
      return;
    }
    if (!EMAIL_PATTERN.test(email)) {
      report.errors.push(`Row ${rowNumber}: invalid email format (${email}).`);
      return;
    }

    if (seen.has(vehicleNumberNormalized)) {
      duplicates.add(vehicleNumberNormalized);
    }
    seen.add(vehicleNumberNormalized);

    imported.push({
      vehicleNumber: vehicleNumberRaw,
      vehicleNumberNormalized,
      email,
      employeeId,
      employeeName,
      status,
      updatedAt,
    });
  });

  report.importedRows = imported.length;
  report.rejectedRows = rowsToParse.length - imported.length;
  report.duplicateVehicleNumbers = Array.from(duplicates);

  return { rows: imported, report };
}

export async function importVehicleEmailMappings(csvText: string): Promise<MappingImportReport> {
  const { rows, report } = parseVehicleEmailCsv(csvText);
  if (rows.length > 0) {
    await writeMappings(rows);
  }
  return report;
}

export async function findRecipientByVehicleNumber(
  vehicleNumber: string,
): Promise<VehicleEmailMappingRow | null> {
  const normalized = normalizeVehicleNumber(vehicleNumber);
  const rows = await readMappings();
  return rows.find((row) => row.vehicleNumberNormalized === normalized && row.status === 'active') ?? null;
}

export async function lookupRecipientsByVehicleNumber(
  vehicleNumber: string,
): Promise<{ active: VehicleEmailMappingRow[]; inactive: VehicleEmailMappingRow[] }> {
  const normalized = normalizeVehicleNumber(vehicleNumber);
  const rows = await readMappings();
  const matches = rows.filter((row) => row.vehicleNumberNormalized === normalized);
  return {
    active: matches.filter((row) => row.status === 'active'),
    inactive: matches.filter((row) => row.status === 'inactive'),
  };
}

export async function mappingStats(): Promise<{ total: number; active: number; inactive: number }> {
  const rows = await readMappings();
  const active = rows.filter((row) => row.status === 'active').length;
  const inactive = rows.length - active;
  return {
    total: rows.length,
    active,
    inactive,
  };
}
