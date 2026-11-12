import { describe, expect, it } from 'vitest';
import { combineWhen, toDateInput, toTimeInput } from './when';

describe('combineWhen', () => {
  it('no date means undated', () => {
    expect(combineWhen('', '21:00', '06:00')).toEqual({ startedAt: null, endedAt: null });
  });
  it('same-day times', () => {
    const r = combineWhen('2026-03-01', '10:00', '13:30');
    expect(r.endedAt! - r.startedAt!).toBe(3.5 * 3600000);
  });
  it('end before start rolls over to the next day', () => {
    const r = combineWhen('2026-03-01', '21:00', '06:00');
    expect(r.endedAt! - r.startedAt!).toBe(9 * 3600000);
  });
  it('date only starts at midday, no end', () => {
    const r = combineWhen('2026-03-01', '', '');
    expect(new Date(r.startedAt!).getHours()).toBe(12);
    expect(r.endedAt).toBeNull();
  });
  it('round-trips through the input formats', () => {
    const t = new Date(2026, 2, 1, 21, 5).getTime();
    expect(combineWhen(toDateInput(t), toTimeInput(t), '').startedAt).toBe(t);
  });
});
