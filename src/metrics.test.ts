import { describe, expect, it } from 'vitest';
import { computeMetrics } from './metrics';
import type { Charge, Vehicle } from './types';

const v: Vehicle = { id: 'v', name: 'Car', batteryKwh: 50, notes: '', updatedAt: 0, deleted: false };
let n = 0;
const ch = (day: number, p: Partial<Charge>): Charge => ({
  id: String(n++), updatedAt: 0, deleted: false, vehicleId: 'v', meterId: 'm', status: 'done',
  startedAt: Date.UTC(2026, 0, day, 20), sortAt: Date.UTC(2026, 0, day, 20), endedAt: Date.UTC(2026, 0, day, 24), startPct: null, endPct: null,
  meterStart: null, meterEnd: null, kwh: null, pricePerKwh: 0.2, cost: null, odometerKm: null,
  location: '', notes: '', ...p,
});

describe('computeMetrics', () => {
  const charges = [
    ch(1, { kwh: 20, odometerKm: 1000, startPct: 40, endPct: 76 }), // 18 kWh in battery / 20 => 0.9
    ch(5, { kwh: 30, odometerKm: 1150 }),
    ch(9, { kwh: 10, cost: 5, odometerKm: 1200, meterId: null }),
    ch(10, { kwh: 99, deleted: true }),
    ch(11, { kwh: 99, status: 'active' }),
  ];
  const m = computeMetrics(charges, [v], (c) => (c.meterId ? 'Home' : 'Public'));

  it('totals only finished, non-deleted charges', () => {
    expect(m.count).toBe(3);
    expect(m.kwh).toBe(60);
    expect(m.cost).toBeCloseTo(4 + 6 + 5);
    expect(m.avgPrice).toBeCloseTo(15 / 60);
  });

  it('computes consumption from odometer readings', () => {
    expect(m.kmDriven).toBe(200);
    expect(m.kwhPer100km).toBeCloseTo((40 / 200) * 100);
    expect(m.costPer100km).toBeCloseTo((11 / 200) * 100);
  });

  it('computes charging efficiency, gaps and location split', () => {
    expect(m.chargingEfficiency).toBeCloseTo(0.9);
    expect(m.avgDaysBetween).toBeCloseTo(4);
    expect(m.avgHours).toBeCloseTo(4);
    expect(m.byLocation.map((l) => l.name)).toEqual(['Home', 'Public']);
    expect(m.months).toEqual([{ month: '2026-01', kwh: 60, cost: 15, count: 3 }]);
  });
});

describe('undated charges', () => {
  const list = [
    ch(1, { kwh: 10 }),
    ch(3, { kwh: 20, startedAt: null }), // sortAt keeps it between day 1 and day 5
    ch(5, { kwh: 30 }),
  ];
  const m = computeMetrics(list, [v], () => 'Home');

  it('counts them in totals and places them in a month by their position', () => {
    expect(m.count).toBe(3);
    expect(m.kwh).toBe(60);
    expect(m.undated).toBe(1);
    expect(m.months[0]).toMatchObject({ kwh: 60, count: 3 });
    expect(m.avgDaysBetween).toBeCloseTo(2); // day 1 to day 5, 3 charges
  });
});

describe('consumption stretches', () => {
  // 50 kWh battery. Charge 1 ends at 80% at 1000 km; charge 2 starts at 40% at 1200 km:
  // 40% of 50 kWh = 20 kWh over 200 km = 10 kWh/100km.
  const list = [
    ch(1, { kwh: 20, endPct: 80, startPct: 40, odometerKm: 1000 }),
    ch(4, { kwh: 25, startPct: 40, endPct: 90, odometerKm: 1200 }),
    ch(6, { kwh: 10, startPct: 70, endPct: 90, odometerKm: 1350 }), // 20% = 10 kWh / 150 km = 6.67
    ch(7, { kwh: 2, startPct: 85, endPct: 90, odometerKm: 1360 }), // 10 km: too short, skipped
  ];
  const m = computeMetrics(list, [v], () => 'Home');

  it('measures each stretch from end % to the next start %', () => {
    expect(m.stretches.map((s) => +s.kwhPer100km.toFixed(2))).toEqual([10, 6.67]);
  });

  it('gives consumption as % of the battery', () => {
    expect(m.batteryKwh).toBe(50);
    expect(m.pctPer100km).toBeCloseTo((m.kwhPer100km! / 50) * 100);
  });

  it('summarises best / typical / worst', async () => {
    const { stretchRange } = await import('./metrics');
    expect(stretchRange(m.stretches)).toMatchObject({ min: expect.closeTo(6.67, 2), max: 10, count: 2 });
  });
});
