import { describe, expect, it } from 'vitest';
import { rateHistory } from './metrics';
import type { Charge } from './types';

const ch = (day: number, price: number | null, meterId = 'm'): Charge => ({
  id: String(day), updatedAt: 0, deleted: false, vehicleId: 'v', meterId, status: 'done',
  startedAt: Date.UTC(2026, 0, day), sortAt: Date.UTC(2026, 0, day), endedAt: null, startPct: null, endPct: null, meterStart: null,
  meterEnd: null, kwh: 10, pricePerKwh: price, cost: null, odometerKm: null, location: '', notes: '',
});

describe('rateHistory', () => {
  it('groups consecutive charges by rate, newest first, per meter', () => {
    const r = rateHistory([ch(1, 0.2), ch(5, 0.2), ch(9, 0.1675), ch(10, 0.3, 'other'), ch(12, null)], 'm');
    expect(r.map((x) => [x.price, x.count])).toEqual([[0.1675, 1], [0.2, 2]]);
    expect(r[1]!.to).toBe(Date.UTC(2026, 0, 5));
  });
});
