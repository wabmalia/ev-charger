export interface Base {
  id: string;
  /** ms epoch of the last edit, used for last-write-wins sync. */
  updatedAt: number;
  deleted: boolean;
}

export interface Vehicle extends Base {
  name: string;
  /** Usable battery capacity, used to estimate energy from % and charging losses. */
  batteryKwh: number | null;
  notes: string;
}

export interface Meter extends Base {
  name: string;
  pricePerKwh: number | null;
  /** Latest known reading of the electric board counter (kWh). */
  lastReading: number | null;
  notes: string;
}

export type ChargeStatus = 'active' | 'done';

export interface Charge extends Base {
  vehicleId: string;
  /** Null means a charger without a tracked meter (public charger, friend's house...). */
  meterId: string | null;
  status: ChargeStatus;
  startedAt: number;
  endedAt: number | null;
  startPct: number | null;
  endPct: number | null;
  meterStart: number | null;
  meterEnd: number | null;
  kwh: number | null;
  pricePerKwh: number | null;
  /** Explicit total cost, overrides kwh * price (e.g. public charger receipts). */
  cost: number | null;
  odometerKm: number | null;
  location: string;
  notes: string;
}

export type Table = 'vehicles' | 'meters' | 'charges';

export interface Data {
  vehicles: Vehicle[];
  meters: Meter[];
  charges: Charge[];
}

type FieldType = 'string' | 'number' | 'bool' | 'date';

/**
 * Column layout of every table. The Google Sheet uses these names as its
 * header row, so the sheet stays readable and new fields can be added later
 * (missing columns get appended to the header on the next sync).
 */
export const SCHEMA: Record<Table, { sheet: string; fields: Record<string, FieldType> }> = {
  vehicles: {
    sheet: 'Vehicles',
    fields: { id: 'string', name: 'string', batteryKwh: 'number', notes: 'string', updatedAt: 'date', deleted: 'bool' },
  },
  meters: {
    sheet: 'Meters',
    fields: {
      id: 'string', name: 'string', pricePerKwh: 'number', lastReading: 'number', notes: 'string',
      updatedAt: 'date', deleted: 'bool',
    },
  },
  charges: {
    sheet: 'Charges',
    fields: {
      id: 'string', vehicleId: 'string', meterId: 'string', status: 'string',
      startedAt: 'date', endedAt: 'date', startPct: 'number', endPct: 'number',
      meterStart: 'number', meterEnd: 'number', kwh: 'number', pricePerKwh: 'number',
      cost: 'number', odometerKm: 'number', location: 'string', notes: 'string',
      updatedAt: 'date', deleted: 'bool',
    },
  },
};

export const TABLES: Table[] = ['vehicles', 'meters', 'charges'];

export function uid(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

/** Total cost of a charge: explicit cost, else kWh x price. */
export function chargeCost(c: Charge): number | null {
  if (c.cost != null) return c.cost;
  if (c.kwh != null && c.pricePerKwh != null) return c.kwh * c.pricePerKwh;
  return null;
}
