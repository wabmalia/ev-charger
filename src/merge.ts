import type { Base } from './types';

export interface RemoteRec<T extends Base> {
  rec: T;
  /** 1-based sheet row number. */
  row: number;
}

export interface MergePlan<T extends Base> {
  /** New local state for the table. */
  local: T[];
  /** Existing sheet rows to overwrite. */
  updates: { row: number; rec: T }[];
  /** Records to append to the sheet. */
  appends: T[];
}

/**
 * Merge local records with the sheet.
 * - Clean local records always take the sheet's version (the sheet is the source of
 *   truth, so manual edits in the sheet win).
 * - Dirty local records win when they are at least as new as the sheet's version.
 * - Clean local records missing from the sheet are dropped (row deleted by hand).
 */
export function mergeTable<T extends Base>(local: T[], dirty: Set<string>, remote: RemoteRec<T>[]): MergePlan<T> {
  const remoteById = new Map(remote.map((r) => [r.rec.id, r]));
  const localById = new Map(local.map((r) => [r.id, r]));
  const out: T[] = [];
  const updates: MergePlan<T>['updates'] = [];
  const appends: T[] = [];

  for (const r of remote) {
    const l = localById.get(r.rec.id);
    if (l && dirty.has(l.id) && l.updatedAt >= r.rec.updatedAt) {
      out.push(l);
      updates.push({ row: r.row, rec: l });
    } else {
      out.push(r.rec);
    }
  }
  for (const l of local) {
    if (remoteById.has(l.id)) continue;
    if (dirty.has(l.id)) {
      out.push(l);
      appends.push(l);
    }
  }
  return { local: out, updates, appends };
}
