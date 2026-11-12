import { chargeCost, sortKey, type Charge, type Vehicle } from './types';

export interface MonthPoint {
  /** YYYY-MM */
  month: string;
  kwh: number;
  cost: number;
  count: number;
}

export interface Metrics {
  count: number;
  kwh: number;
  cost: number;
  /** Average paid per kWh, weighted by energy. */
  avgPrice: number | null;
  avgKwh: number | null;
  avgPctAdded: number | null;
  avgHours: number | null;
  avgDaysBetween: number | null;
  kmDriven: number | null;
  kwhPer100km: number | null;
  costPer100km: number | null;
  /** Energy that reached the battery / energy drawn from the meter. */
  chargingEfficiency: number | null;
  /** Per month; undated charges are placed by their position in the log. */
  months: MonthPoint[];
  /** Finished charges without a date. */
  undated: number;
  byLocation: { name: string; kwh: number; cost: number; count: number }[];
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function monthKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function computeMetrics(
  all: Charge[],
  vehicles: Vehicle[],
  locationName: (c: Charge) => string,
): Metrics {
  const charges = all
    .filter((c) => !c.deleted && c.status === 'done')
    .sort((a, b) => sortKey(a) - sortKey(b));

  let kwh = 0;
  let cost = 0;
  let pricedKwh = 0;
  let pricedCost = 0;
  const months = new Map<string, MonthPoint>();
  const locs = new Map<string, { name: string; kwh: number; cost: number; count: number }>();
  const capacity = new Map(vehicles.map((v) => [v.id, v.batteryKwh]));
  const eff: number[] = [];

  for (const c of charges) {
    const k = c.kwh ?? 0;
    const cc = chargeCost(c);
    kwh += k;
    cost += cc ?? 0;
    if (cc != null && c.kwh) {
      pricedKwh += c.kwh;
      pricedCost += cc;
    }
    // Undated charges go in the month of their place in the log (between their neighbours).
    const m = monthKey(sortKey(c));
    const mp = months.get(m) ?? { month: m, kwh: 0, cost: 0, count: 0 };
    mp.kwh += k;
    mp.cost += cc ?? 0;
    mp.count++;
    months.set(m, mp);
    const ln = locationName(c);
    const lp = locs.get(ln) ?? { name: ln, kwh: 0, cost: 0, count: 0 };
    lp.kwh += k;
    lp.cost += cc ?? 0;
    lp.count++;
    locs.set(ln, lp);

    const cap = capacity.get(c.vehicleId);
    if (cap && c.kwh && c.startPct != null && c.endPct != null && c.endPct > c.startPct) {
      const e = ((c.endPct - c.startPct) / 100) * cap / c.kwh;
      if (e > 0.5 && e <= 1.05) eff.push(e); // ignore obviously bad data
    }
  }

  const pct = charges.filter((c) => c.startPct != null && c.endPct != null).map((c) => c.endPct! - c.startPct!);
  const hours = charges
    .filter((c) => c.startedAt != null && c.endedAt != null && c.endedAt > c.startedAt)
    .map((c) => (c.endedAt! - c.startedAt!) / 3600000);
  // Days between charges: span from the first to the last dated charge, divided by the number of
  // charges in between (undated ones count, since they happened in that span).
  const datedIdx = charges.flatMap((c, i) => (c.startedAt != null ? [i] : []));
  const firstD = datedIdx[0];
  const lastD = datedIdx[datedIdx.length - 1];
  const avgDaysBetween = firstD != null && lastD != null && lastD > firstD
    ? (charges[lastD]!.startedAt! - charges[firstD]!.startedAt!) / 86400000 / (lastD - firstD)
    : null;

  // Consumption per vehicle: energy added at every charge after the first odometer
  // reading, up to the last one, divided by the distance between those readings.
  let kmDriven = 0;
  let kwhDriven = 0;
  let costDriven = 0;
  const byVehicle = new Map<string, Charge[]>();
  for (const c of charges) byVehicle.set(c.vehicleId, [...(byVehicle.get(c.vehicleId) ?? []), c]);
  for (const list of byVehicle.values()) {
    const odoIdx = list.flatMap((c, i) => (c.odometerKm != null ? [i] : []));
    if (odoIdx.length < 2) continue;
    const first = odoIdx[0]!;
    const last = odoIdx[odoIdx.length - 1]!;
    const km = list[last]!.odometerKm! - list[first]!.odometerKm!;
    if (km <= 0) continue;
    kmDriven += km;
    for (let i = first + 1; i <= last; i++) {
      kwhDriven += list[i]!.kwh ?? 0;
      costDriven += chargeCost(list[i]!) ?? 0;
    }
  }

  return {
    count: charges.length,
    kwh,
    cost,
    avgPrice: pricedKwh ? pricedCost / pricedKwh : null,
    avgKwh: charges.length ? kwh / charges.length : null,
    avgPctAdded: avg(pct),
    avgHours: avg(hours),
    avgDaysBetween,
    kmDriven: kmDriven || null,
    kwhPer100km: kmDriven ? (kwhDriven / kmDriven) * 100 : null,
    costPer100km: kmDriven ? (costDriven / kmDriven) * 100 : null,
    chargingEfficiency: avg(eff),
    months: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
    byLocation: [...locs.values()].sort((a, b) => b.kwh - a.kwh),
    undated: charges.filter((c) => c.startedAt == null).length,
  };
}

/** Rates this meter has actually been charged at, derived from its charges (newest first). */
export function rateHistory(charges: Charge[], meterId: string) {
  const list = charges
    .filter((c) => !c.deleted && c.status === 'done' && c.meterId === meterId && c.pricePerKwh != null)
    .sort((a, b) => sortKey(a) - sortKey(b));
  // from/to are the first and last *known* dates in each run (null if none are dated).
  const out: { price: number; from: number | null; to: number | null; count: number }[] = [];
  for (const c of list) {
    const last = out.at(-1);
    if (last && last.price === c.pricePerKwh) {
      if (c.startedAt != null) {
        last.from ??= c.startedAt;
        last.to = c.startedAt;
      }
      last.count++;
    } else out.push({ price: c.pricePerKwh!, from: c.startedAt, to: c.startedAt, count: 1 });
  }
  return out.reverse();
}
