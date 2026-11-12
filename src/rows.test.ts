import { describe, expect, it } from 'vitest';
import { fromRow, toRow } from './rows';
import { SCHEMA, type Charge } from './types';

describe('rows', () => {
  const header = Object.keys(SCHEMA.charges.fields);
  const c: Charge = {
    id: 'abc', updatedAt: Date.UTC(2026, 0, 2), deleted: false, vehicleId: 'v1', meterId: null,
    status: 'done', startedAt: Date.UTC(2026, 0, 1, 20), endedAt: Date.UTC(2026, 0, 2, 6),
    startPct: 20, endPct: 80, meterStart: 1000, meterEnd: 1030.5, kwh: 30.5, pricePerKwh: 0.2,
    cost: null, odometerKm: 12000, location: 'Home', notes: '',
  };

  it('round-trips a charge', () => {
    expect(fromRow('charges', header, toRow('charges', header, c))).toEqual(c);
  });

  it('reads rows with shuffled/extra columns and comma decimals', () => {
    const h = ['notes', 'id', 'kwh', 'startedAt', 'whatever'];
    const r = fromRow('charges', h, ['hi', 'x', '12,5', '2026-03-01T10:00:00Z', 'ignored']) as Charge;
    expect(r.kwh).toBe(12.5);
    expect(r.notes).toBe('hi');
    expect(r.status).toBe('done');
    expect(r.meterId).toBeNull();
  });

  it('skips rows without id', () => {
    expect(fromRow('vehicles', ['id', 'name'], ['', 'Car'])).toBeNull();
  });
});
