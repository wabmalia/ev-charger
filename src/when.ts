/** Splitting/combining a charge's start and end into one date + two times (local time). */

const pad = (n: number) => String(n).padStart(2, '0');

export function toDateInput(t: number | null): string {
  if (t == null) return '';
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toTimeInput(t: number | null): string {
  if (t == null) return '';
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function at(date: string, time: string): number | null {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  if (!y || !m || !d || hh == null || mm == null || Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return new Date(y, m - 1, d, hh, mm).getTime();
}

/**
 * Start and end from a date and optional times.
 * - No date: no start/end at all (the charge is undated).
 * - Date without a start time: the start is midday, so the day never shifts across time zones.
 * - An end time earlier than the start time means the charge ended the next day.
 */
export function combineWhen(date: string, start: string, end: string): { startedAt: number | null; endedAt: number | null } {
  if (!date) return { startedAt: null, endedAt: null };
  const startedAt = at(date, start || '12:00');
  let endedAt = end ? at(date, end) : null;
  if (startedAt != null && endedAt != null && endedAt < startedAt) endedAt += 86400000;
  return { startedAt, endedAt };
}
