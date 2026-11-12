import { useEffect, useState } from 'preact/hooks';
import type { Base, Data, Table } from './types';

export interface Settings {
  currency: string;
  spreadsheetId: string | null;
  /** Optional override of the build-time Google OAuth client id. */
  clientId: string;
  lastVehicleId: string | null;
  lastMeterId: string | null;
  lastSyncAt: number | null;
}

export interface State {
  data: Data;
  dirty: Record<Table, string[]>;
  settings: Settings;
}

const KEY = 'ev-charger:v1';

const empty: State = {
  data: { vehicles: [], meters: [], charges: [] },
  dirty: { vehicles: [], meters: [], charges: [] },
  settings: {
    currency: 'EUR', spreadsheetId: null, clientId: '', lastVehicleId: null, lastMeterId: null, lastSyncAt: null,
  },
};

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(empty);
    const s = JSON.parse(raw) as Partial<State>;
    return {
      data: { ...empty.data, ...s.data },
      dirty: { ...empty.dirty, ...s.dirty },
      settings: { ...empty.settings, ...s.settings },
    };
  } catch {
    return structuredClone(empty);
  }
}

let state = load();
const listeners = new Set<() => void>();

export function getState(): State {
  return state;
}

export function setState(next: State) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage full or blocked: keep in memory */
  }
  listeners.forEach((l) => l());
}

export function useStore(): State {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return state;
}

/** Insert or replace a record, mark it for sync. */
export function save<T extends Base>(table: Table, rec: T) {
  const r = { ...rec, updatedAt: Date.now() };
  const list = state.data[table] as unknown as T[];
  const i = list.findIndex((x) => x.id === r.id);
  const nextList = i >= 0 ? list.map((x, j) => (j === i ? r : x)) : [...list, r];
  const dirty = state.dirty[table].includes(r.id) ? state.dirty[table] : [...state.dirty[table], r.id];
  setState({
    ...state,
    data: { ...state.data, [table]: nextList },
    dirty: { ...state.dirty, [table]: dirty },
  });
  scheduleSync();
}

export function remove<T extends Base>(table: Table, rec: T) {
  save(table, { ...rec, deleted: true });
}

export function updateSettings(p: Partial<Settings>) {
  setState({ ...state, settings: { ...state.settings, ...p } });
}

export function markAllDirty() {
  setState({
    ...state,
    dirty: {
      vehicles: state.data.vehicles.map((r) => r.id),
      meters: state.data.meters.map((r) => r.id),
      charges: state.data.charges.map((r) => r.id),
    },
  });
}

/**
 * Point this device at a sheet.
 * - 'upload' (a sheet we just created): everything on this device is pushed to it.
 * - 'replace' (an existing sheet): local data is dropped and the sheet's data is pulled in,
 *   so the sheet stays the single source of truth.
 */
export function connectSheet(id: string, mode: 'upload' | 'replace') {
  if (mode === 'replace') {
    setState({
      ...state,
      data: structuredClone(empty.data),
      dirty: structuredClone(empty.dirty),
      settings: { ...state.settings, spreadsheetId: id, lastSyncAt: null, lastVehicleId: null, lastMeterId: null },
    });
  } else {
    updateSettings({ spreadsheetId: id, lastSyncAt: null });
    markAllDirty();
  }
}

/** Confirm before an existing sheet replaces what's on this device (true = go ahead). */
export function confirmReplaceLocal(): boolean {
  const live = (list: { deleted: boolean }[]) => list.filter((r) => !r.deleted).length;
  const charges = live(state.data.charges);
  const other = live(state.data.vehicles) + live(state.data.meters);
  if (!charges && !other) return true;
  const what = charges ? `${charges} charge${charges === 1 ? '' : 's'}` : 'cars and meters';
  return confirm(
    `This phone has ${what} saved locally. Opening this sheet replaces them with the sheet's data.\n\n` +
    'If you want to keep them, cancel and use Backup JSON first, or create a new sheet instead.',
  );
}

export function pendingCount(s: State = state): number {
  return s.dirty.vehicles.length + s.dirty.meters.length + s.dirty.charges.length;
}

let syncHook: (() => void) | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
export function onScheduleSync(fn: () => void) {
  syncHook = fn;
}
function scheduleSync() {
  clearTimeout(timer);
  timer = setTimeout(() => syncHook?.(), 1500);
}

/** Replace everything (JSON import). */
export function importData(data: Data) {
  setState({ ...state, data });
  markAllDirty();
  scheduleSync();
}
