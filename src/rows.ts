import { SCHEMA, type Base, type Table } from './types';

type Cell = string | number | boolean | null;

/** Serialise a record into a sheet row following `header` order. */
export function toRow(table: Table, header: string[], rec: Base): Cell[] {
  const fields = SCHEMA[table].fields;
  const r = rec as unknown as Record<string, unknown>;
  return header.map((col) => {
    const type = fields[col];
    const v = r[col];
    if (!type || v == null) return '';
    if (type === 'date') return new Date(v as number).toISOString();
    if (type === 'bool') return v ? 'TRUE' : '';
    return v as Cell;
  });
}

/** Parse a sheet row back into a record. Unknown columns are ignored. */
export function fromRow(table: Table, header: string[], row: unknown[]): Base | null {
  const fields = SCHEMA[table].fields;
  const out: Record<string, unknown> = {};
  for (const [name, type] of Object.entries(fields)) {
    const i = header.indexOf(name);
    const raw = i >= 0 ? row[i] : undefined;
    const empty = raw == null || raw === '';
    if (type === 'string') out[name] = empty ? (name.endsWith('Id') ? null : '') : String(raw);
    else if (type === 'bool') out[name] = raw === true || String(raw).toUpperCase() === 'TRUE';
    else if (type === 'number') {
      const n = empty ? NaN : typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.'));
      out[name] = Number.isFinite(n) ? n : null;
    } else {
      out[name] = empty ? null : parseDate(raw);
    }
  }
  if (!out.id) return null;
  if (out.updatedAt == null) out.updatedAt = 0;
  if (table === 'charges') {
    if (out.startedAt == null) return null;
    if (out.status !== 'active') out.status = 'done';
    if (out.vehicleId == null) out.vehicleId = '';
  }
  return out as unknown as Base;
}

function parseDate(raw: unknown): number | null {
  if (typeof raw === 'number') {
    // Google Sheets serial date (days since 1899-12-30), if someone typed a date in the sheet.
    if (raw < 1e7) return Math.round((raw - 25569) * 86400000);
    return raw;
  }
  const t = Date.parse(String(raw));
  return Number.isNaN(t) ? null : t;
}
