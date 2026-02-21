import { describe, expect, it } from 'vitest';
import { parseVehicleEmailCsv } from '../mapping';

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
});
