import { mergeTable, type RemoteRec } from './merge';
import { fromRow, toRow } from './rows';
import { getState, setState, updateSettings } from './store';
import { SCHEMA, TABLES, type Base, type Table } from './types';

/**
 * Google sign-in uses the OAuth implicit flow with a full-page redirect instead of a
 * popup, because popups are unreliable in installed iOS/Android PWAs.
 * The token lasts ~1h; everything works offline in between and syncs later.
 */
// `email` (basic, non-sensitive) lets us remember which account to use for silent sign-in.
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets email';
const TOKEN_KEY = 'ev-charger:token';
const STATE_KEY = 'ev-charger:oauth-state';
const HINT_KEY = 'ev-charger:login-hint';
/** Set by an explicit sign-out: no silent sign-in until the user signs in themselves. */
const NO_SILENT_KEY = 'ev-charger:no-silent';
/** One silent attempt per app opening (sessionStorage lives as long as the app/tab). */
const SILENT_TRIED_KEY = 'ev-charger:silent-tried';
const API = 'https://sheets.googleapis.com/v4/spreadsheets';

export function clientId(): string {
  return getState().settings.clientId || import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
}

export function redirectUri(): string {
  return location.origin + location.pathname;
}

export function token(): string | null {
  try {
    const t = JSON.parse(localStorage.getItem(TOKEN_KEY) ?? 'null') as { v: string; exp: number } | null;
    return t && t.exp > Date.now() + 60_000 ? t.v : null;
  } catch {
    return null;
  }
}

function authorize(silent: boolean) {
  const st = (silent ? 's:' : 'i:') + crypto.randomUUID();
  sessionStorage.setItem(STATE_KEY, st);
  const p = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: 'token',
    scope: SCOPE,
    include_granted_scopes: 'true',
    state: st,
  });
  if (silent) p.set('prompt', 'none');
  const hint = localStorage.getItem(HINT_KEY);
  if (hint) p.set('login_hint', hint);
  location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${p}`);
}

export function signIn() {
  authorize(false);
}

export function signOut() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(HINT_KEY);
  localStorage.setItem(NO_SILENT_KEY, '1');
}

/**
 * On app open: if a sheet is connected but the ~1h Google session has expired, ask Google for a
 * new one without showing anything (prompt=none). Google redirects straight back; if it can't do
 * it silently, handleRedirect swallows the error and the app shows "Sign in to sync" as before.
 * Returns true when it navigated away.
 */
export function trySilentSignIn(): boolean {
  if (!getState().settings.spreadsheetId || token() || !clientId() || !navigator.onLine) return false;
  if (localStorage.getItem(NO_SILENT_KEY) || sessionStorage.getItem(SILENT_TRIED_KEY)) return false;
  sessionStorage.setItem(SILENT_TRIED_KEY, '1');
  authorize(true);
  return true;
}

/** Pick the token up from the URL fragment after the redirect. Returns an error message, if any. */
export function handleRedirect(): string | null {
  if (!location.hash.includes('access_token') && !location.hash.includes('error')) return null;
  const p = new URLSearchParams(location.hash.slice(1));
  history.replaceState(null, '', location.pathname + location.search);
  const expected = sessionStorage.getItem(STATE_KEY);
  const silent = expected?.startsWith('s:') ?? false;
  if (p.get('error')) return silent ? null : `Google sign-in failed: ${p.get('error')}`;
  if (p.get('state') !== expected) return silent ? null : 'Google sign-in failed: state mismatch';
  const v = p.get('access_token')!;
  const exp = Date.now() + Number(p.get('expires_in') ?? 3600) * 1000;
  localStorage.setItem(TOKEN_KEY, JSON.stringify({ v, exp }));
  if (!silent) localStorage.removeItem(NO_SILENT_KEY);
  rememberAccount(v);
  return null;
}

/** Remember the signed-in account's email as a login hint for silent sign-in (stays on this device). */
function rememberAccount(accessToken: string) {
  fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((info: { email?: string } | null) => {
      if (info?.email) localStorage.setItem(HINT_KEY, info.email);
    })
    .catch(() => {});
}

class AuthError extends Error {}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const t = token();
  if (!t) throw new AuthError('Not signed in');
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', ...init.headers },
  });
  if (res.status === 401) {
    signOut();
    throw new AuthError('Google session expired, sign in again');
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? `Google Sheets error ${res.status}`);
  }
  return (await res.json()) as T;
}

export function isAuthError(e: unknown) {
  return e instanceof AuthError;
}

/** Accepts a sheet URL or a bare id. */
export function parseSpreadsheetId(input: string): string | null {
  const m = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1]!;
  return /^[a-zA-Z0-9_-]{20,}$/.test(input.trim()) ? input.trim() : null;
}

export function sheetUrl(id: string) {
  return `https://docs.google.com/spreadsheets/d/${id}/edit`;
}

export async function createSpreadsheet(): Promise<string> {
  const res = await api<{ spreadsheetId: string }>('', {
    method: 'POST',
    body: JSON.stringify({
      properties: { title: 'EV Charger data' },
      sheets: TABLES.map((t) => ({ properties: { title: SCHEMA[t].sheet, gridProperties: { frozenRowCount: 1 } } })),
    }),
  });
  return res.spreadsheetId;
}

async function ensureTabs(id: string) {
  const meta = await api<{ sheets: { properties: { title: string } }[] }>(`/${id}?fields=sheets.properties.title`);
  const have = new Set(meta.sheets.map((s) => s.properties.title));
  const missing = TABLES.filter((t) => !have.has(SCHEMA[t].sheet));
  if (!missing.length) return;
  await api(`/${id}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      requests: missing.map((t) => ({
        addSheet: { properties: { title: SCHEMA[t].sheet, gridProperties: { frozenRowCount: 1 } } },
      })),
    }),
  });
}

let running: Promise<void> | null = null;

/** Pull the sheet, merge, push local changes. Safe to call often. */
export function sync(): Promise<void> {
  running ??= doSync().finally(() => (running = null));
  return running;
}

async function doSync() {
  const id = getState().settings.spreadsheetId;
  if (!id || !token()) return;
  await ensureTabs(id);

  const ranges = TABLES.map((t) => `ranges=${encodeURIComponent(`${SCHEMA[t].sheet}!A1:ZZ`)}`).join('&');
  const got = await api<{ valueRanges: { values?: unknown[][] }[] }>(
    `/${id}/values:batchGet?${ranges}&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,
  );

  // Snapshot what is dirty now; edits made while syncing stay dirty.
  const before = getState();
  const data = { ...before.data };
  const writes: { range: string; values: unknown[][] }[] = [];
  const appends: { table: Table; values: unknown[][] }[] = [];

  TABLES.forEach((table, i) => {
    const values = got.valueRanges[i]?.values ?? [];
    const sheetHeader = (values[0] ?? []).map(String);
    const header = [...sheetHeader, ...Object.keys(SCHEMA[table].fields).filter((f) => !sheetHeader.includes(f))];
    if (header.length !== sheetHeader.length) {
      writes.push({ range: `${SCHEMA[table].sheet}!A1`, values: [header] });
    }
    const remote: RemoteRec<Base>[] = [];
    values.slice(1).forEach((row, j) => {
      const rec = fromRow(table, header, row);
      if (rec) remote.push({ rec, row: j + 2 });
    });
    const plan = mergeTable(before.data[table] as Base[], new Set(before.dirty[table]), remote);
    for (const u of plan.updates) {
      writes.push({ range: `${SCHEMA[table].sheet}!A${u.row}`, values: [toRow(table, header, u.rec)] });
    }
    if (plan.appends.length) appends.push({ table, values: plan.appends.map((r) => toRow(table, header, r)) });
    (data as Record<Table, Base[]>)[table] = plan.local;
  });

  if (writes.length) {
    await api(`/${id}/values:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({ valueInputOption: 'RAW', data: writes }),
    });
  }
  for (const a of appends) {
    await api(
      `/${id}/values/${encodeURIComponent(`${SCHEMA[a.table].sheet}!A1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      { method: 'POST', body: JSON.stringify({ values: a.values }) },
    );
  }

  // Merge results into the *current* state, keeping any edits made during the sync.
  const now = getState();
  const next = { ...now, data: { ...now.data }, dirty: { ...now.dirty } };
  for (const table of TABLES) {
    const beforeTs = new Map((before.data[table] as Base[]).map((r) => [r.id, r.updatedAt]));
    const changedDuring = (now.data[table] as Base[]).filter((r) => beforeTs.get(r.id) !== r.updatedAt);
    const merged = new Map((data[table] as Base[]).map((r) => [r.id, r]));
    for (const r of changedDuring) merged.set(r.id, r);
    (next.data as Record<Table, Base[]>)[table] = [...merged.values()];
    next.dirty[table] = changedDuring.map((r) => r.id);
  }
  setState(next);
  updateSettings({ lastSyncAt: Date.now() });
}
