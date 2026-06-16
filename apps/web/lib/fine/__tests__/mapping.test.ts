import { beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { fineDataRootPath } from '../store';
import { importVehicleEmailMappings, lookupRecipientsByVehicleNumber, parseVehicleEmailCsv } from '../mapping';

describe('parseVehicleEmailCsv', () => {
  it('imports valid rows with header', () => {
    const csv = [
      'vehicle_number,email,employee_id,employee_name,status',
      '231하1342,hyo-bum.bae@lr.org,E1,Bae,active',
    ].join('\n');

    const { rows, report } = parseVehicleEmailCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].vehicleNumberNormalized).toBe('231하1342');
    expect(report.importedRows).toBe(1);
    expect(report.rejectedRows).toBe(0);
  });

  it('rejects invalid email rows', () => {
    const csv = '231하1342,not-an-email';
    const { rows, report } = parseVehicleEmailCsv(csv);
    expect(rows).toHaveLength(0);
    expect(report.rejectedRows).toBe(1);
    expect(report.errors[0]).toContain('invalid email');
  });

  it('imports duplicate vehicle rows and reports duplicates', () => {
    const csv = [
      'vehicle_number,email,employee_id,employee_name,status',
      '231하1342,hyo-bum.bae@lr.org,E1,Bae,active',
      '231하1342,other.user@lr.org,E2,Other,active',
    ].join('\n');
    const { rows, report } = parseVehicleEmailCsv(csv);
    expect(rows).toHaveLength(2);
    expect(report.importedRows).toBe(2);
    expect(report.rejectedRows).toBe(0);
    expect(report.duplicateVehicleNumbers).toContain('231하1342');
  });
});

describe('lookupRecipientsByVehicleNumber', () => {
  beforeEach(async () => {
    await fs.rm(fineDataRootPath(), { recursive: true, force: true });
  });

  it('returns active conflict candidates when duplicate vehicle mappings exist', async () => {
    await importVehicleEmailMappings(
      [
        'vehicle_number,email,employee_id,employee_name,status',
        '231하1342,hyo-bum.bae@lr.org,E1,Bae,active',
        '231하1342,other.user@lr.org,E2,Other,active',
      ].join('\n'),
    );
    const lookup = await lookupRecipientsByVehicleNumber('231하1342');
    expect(lookup.active).toHaveLength(2);
    expect(lookup.inactive).toHaveLength(0);
  });
});
