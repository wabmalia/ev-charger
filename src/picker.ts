import { clientId, token } from './google';

/**
 * Google Picker: with the `drive.file` scope the app can only open sheets it created or that the
 * user picked here, so picking a sheet is how it gets permission to an existing one (for example
 * a sheet a partner shared). The picker is an in-page overlay, so it also works in installed PWAs.
 *
 * Needs a browser API key (public, restricted to the Picker API and this site's referrers) and the
 * Cloud project number, which is the numeric prefix of the OAuth client id.
 */
const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY ?? '';

declare const gapi: { load(lib: string, opts: { callback: () => void; onerror: () => void }): void };

export function pickerAvailable(): boolean {
  return !!API_KEY;
}

let loading: Promise<void> | null = null;

function loadPicker(): Promise<void> {
  loading ??= new Promise<void>((resolve, reject) => {
    const fail = () => {
      loading = null;
      reject(new Error('Could not load the Google file picker. Check your connection and try again.'));
    };
    const s = document.createElement('script');
    s.src = 'https://apis.google.com/js/api.js';
    s.onload = () => gapi.load('picker', { callback: resolve, onerror: fail });
    s.onerror = fail;
    document.head.append(s);
  });
  return loading;
}

/**
 * Let the user pick a spreadsheet. With `fileId` the picker shows only that sheet, so the user is
 * just confirming access to it. Resolves to the picked id, or null if they cancelled.
 */
export async function pickSheet(fileId?: string): Promise<string | null> {
  const t = token();
  if (!t) throw new Error('Sign in with Google first.');
  if (!API_KEY) throw new Error('This build has no Google API key for the file picker (see the README).');
  await loadPicker();
  const g = (window as any).google.picker;
  return new Promise((resolve) => {
    const view = new g.DocsView(g.ViewId.SPREADSHEETS).setMode(g.DocsViewMode.LIST);
    if (fileId) view.setFileIds(fileId);
    new g.PickerBuilder()
      .addView(view)
      .setOAuthToken(t)
      .setDeveloperKey(API_KEY)
      .setAppId(clientId().split('-')[0])
      .setTitle(fileId ? 'Select the EV Charger sheet to allow access' : 'Choose your EV Charger sheet')
      .setCallback((d: { action: string; docs?: { id: string }[] }) => {
        if (d.action === g.Action.PICKED) resolve(d.docs?.[0]?.id ?? null);
        else if (d.action === g.Action.CANCEL) resolve(null);
      })
      .build()
      .setVisible(true);
  });
}
