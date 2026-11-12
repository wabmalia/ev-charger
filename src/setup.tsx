import { useState } from 'preact/hooks';
import {
  clientId, createSpreadsheet, parseSpreadsheetId, redirectUri, sheetUrl, signIn, signOut, token,
} from './google';
import { getState, importData, markAllDirty, pendingCount, remove, save, updateSettings, useStore } from './store';
import { chargeCost, uid, type Charge, type Data, type Meter, type Vehicle } from './types';
import { Field, money, n2s, num, NumInput, parseNum, Sheet } from './ui';

export function Setup(props: { onSync: () => void; syncError: string }) {
  const { data } = useStore();
  const [editV, setEditV] = useState<Vehicle | null>(null);
  const [editM, setEditM] = useState<Meter | null>(null);
  const vehicles = data.vehicles.filter((v) => !v.deleted);
  const meters = data.meters.filter((m) => !m.deleted);

  return (
    <div class="stack">
      <section class="card">
        <div class="row"><h3 class="section-title">Cars</h3><button class="link" onClick={() => setEditV(newVehicle())}>+ Add</button></div>
        <ul class="list">
          {vehicles.map((v) => (
            <li><button class="list-row" onClick={() => setEditV(v)}>
              <span class="row-title">{v.name}</span>
              <span class="muted small">{v.batteryKwh ? `${num(v.batteryKwh)} kWh battery` : 'battery size not set'}</span>
            </button></li>
          ))}
        </ul>
      </section>

      <section class="card">
        <div class="row"><h3 class="section-title">Electric boards</h3><button class="link" onClick={() => setEditM(newMeter())}>+ Add</button></div>
        <p class="muted small">A meter you read before and after charging. Its price is suggested on new charges.</p>
        <ul class="list">
          {meters.map((m) => (
            <li><button class="list-row" onClick={() => setEditM(m)}>
              <span class="row-title">{m.name}</span>
              <span class="muted small">{m.pricePerKwh != null ? `${money(m.pricePerKwh, 2, 4)} / kWh` : 'no price'} · {m.lastReading != null ? num(m.lastReading, 2) : '–'} kWh</span>
            </button></li>
          ))}
        </ul>
      </section>

      <SyncCard onSync={props.onSync} error={props.syncError} />
      <DataCard />

      {editV && <Sheet title={editV.name || 'New car'} onClose={() => setEditV(null)}><VehicleForm vehicle={editV} onDone={() => setEditV(null)} /></Sheet>}
      {editM && <Sheet title={editM.name || 'New electric board'} onClose={() => setEditM(null)}><MeterForm meter={editM} onDone={() => setEditM(null)} /></Sheet>}
    </div>
  );
}

const newVehicle = (): Vehicle => ({ id: uid(), updatedAt: 0, deleted: false, name: '', batteryKwh: null, notes: '' });
const newMeter = (): Meter => ({ id: uid(), updatedAt: 0, deleted: false, name: '', pricePerKwh: null, lastReading: null, notes: '' });

export function VehicleForm(props: { vehicle?: Vehicle; onDone: () => void }) {
  const v0 = props.vehicle ?? newVehicle();
  const [name, setName] = useState(v0.name);
  const [battery, setBattery] = useState(n2s(v0.batteryKwh));
  const [notes, setNotes] = useState(v0.notes);
  const exists = getState().data.vehicles.some((v) => v.id === v0.id);
  return (
    <form class="form" onSubmit={(e) => {
      e.preventDefault();
      if (!name.trim()) return;
      save('vehicles', { ...v0, name: name.trim(), batteryKwh: parseNum(battery), notes: notes.trim() });
      props.onDone();
    }}>
      <div class="grid">
        <Field label="Name" wide><input value={name} placeholder="e.g. Blue Zoe" required onInput={(e) => setName((e.target as HTMLInputElement).value)} /></Field>
        <Field label="Usable battery (kWh)" hint="optional, enables % based estimates" wide><NumInput value={battery} onInput={setBattery} placeholder="52" /></Field>
        <Field label="Notes" wide><input value={notes} onInput={(e) => setNotes((e.target as HTMLInputElement).value)} /></Field>
      </div>
      <div class="actions">
        {exists && <button type="button" class="ghost danger" onClick={() => {
          if (confirm(`Remove ${v0.name}? Its charges are kept.`)) { remove('vehicles', v0); props.onDone(); }
        }}>Remove</button>}
        <button class="primary" type="submit">Save</button>
      </div>
    </form>
  );
}

export function MeterForm(props: { meter: Meter; onDone: () => void }) {
  const m0 = props.meter;
  const [name, setName] = useState(m0.name);
  const [price, setPrice] = useState(n2s(m0.pricePerKwh));
  const [reading, setReading] = useState(n2s(m0.lastReading));
  const [notes, setNotes] = useState(m0.notes);
  const exists = getState().data.meters.some((m) => m.id === m0.id);
  return (
    <form class="form" onSubmit={(e) => {
      e.preventDefault();
      if (!name.trim()) return;
      save('meters', { ...m0, name: name.trim(), pricePerKwh: parseNum(price), lastReading: parseNum(reading), notes: notes.trim() });
      props.onDone();
    }}>
      <div class="grid">
        <Field label="Name" wide><input value={name} placeholder="e.g. Home" required onInput={(e) => setName((e.target as HTMLInputElement).value)} /></Field>
        <Field label="Price per kWh" hint="for new charges, past ones keep their rate"><NumInput value={price} onInput={setPrice} placeholder="0.18" /></Field>
        <Field label="Current reading (kWh)"><NumInput value={reading} onInput={setReading} placeholder="12345.6" /></Field>
        <Field label="Notes" wide><input value={notes} onInput={(e) => setNotes((e.target as HTMLInputElement).value)} placeholder="tariff, contract..." /></Field>
      </div>
      <RateHistory meterId={m0.id} />
      <div class="actions">
        {exists && <button type="button" class="ghost danger" onClick={() => {
          if (confirm(`Remove ${m0.name}? Its charges are kept.`)) { remove('meters', m0); props.onDone(); }
        }}>Remove</button>}
        <button class="primary" type="submit">Save</button>
      </div>
    </form>
  );
}

/** Rates this meter has actually been charged at, derived from its charges (newest first). */
export function rateHistory(charges: Charge[], meterId: string) {
  const list = charges
    .filter((c) => !c.deleted && c.status === 'done' && c.meterId === meterId && c.pricePerKwh != null)
    .sort((a, b) => a.startedAt - b.startedAt);
  const out: { price: number; from: number; to: number; count: number }[] = [];
  for (const c of list) {
    const last = out.at(-1);
    if (last && last.price === c.pricePerKwh) {
      last.to = c.startedAt;
      last.count++;
    } else out.push({ price: c.pricePerKwh!, from: c.startedAt, to: c.startedAt, count: 1 });
  }
  return out.reverse();
}

function RateHistory(props: { meterId: string }) {
  const { data } = useStore();
  const rates = rateHistory(data.charges, props.meterId);
  if (!rates.length) return null;
  const d = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  return (
    <div class="rates">
      <h3 class="section-title">Rates charged here</h3>
      <ul class="list">
        {rates.map((r) => (
          <li class="list-row static">
            <span class="row-title">{money(r.price, 2, 4)} / kWh</span>
            <span class="muted small">{r.from === r.to ? d(r.from) : `${d(r.from)} – ${d(r.to)}`} · {r.count}×</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SyncCard(props: { onSync: () => void; error: string }) {
  const s = useStore();
  const { spreadsheetId, lastSyncAt } = s.settings;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [link, setLink] = useState('');
  const [cid, setCid] = useState(s.settings.clientId);
  const signedIn = !!token();
  const pending = pendingCount(s);

  async function connect(id: string) {
    updateSettings({ spreadsheetId: id });
    markAllDirty();
    props.onSync();
  }

  if (!clientId()) {
    return (
      <section class="card">
        <h3 class="section-title">Sync with Google Sheets</h3>
        <p class="muted small">
          This build has no Google OAuth client id. Create one (see the README) with this redirect URI and paste it below:
        </p>
        <code class="block">{redirectUri()}</code>
        <Field label="OAuth client id" wide>
          <input value={cid} onInput={(e) => setCid((e.target as HTMLInputElement).value)} placeholder="xxxx.apps.googleusercontent.com" />
        </Field>
        <div class="actions"><button class="primary" onClick={() => updateSettings({ clientId: cid.trim() })}>Save</button></div>
      </section>
    );
  }

  return (
    <section class="card">
      <h3 class="section-title">Sync with Google Sheets</h3>
      {!signedIn ? (
        <>
          <p class="muted small">
            {spreadsheetId
              ? `Signed out. ${pending ? `${pending} change(s) waiting. ` : ''}Sign in again to sync.`
              : 'Data lives in a Google Sheet in your Drive. Share the sheet with your partner and they can log charges too.'}
          </p>
          <div class="actions"><button class="primary" onClick={signIn}>Sign in with Google</button></div>
        </>
      ) : !spreadsheetId ? (
        <>
          <p class="muted small">Create a fresh sheet, or paste the link of one that was shared with you.</p>
          <div class="actions">
            <button class="primary" disabled={busy} onClick={async () => {
              setBusy(true);
              try { await connect(await createSpreadsheet()); } catch (e) { setMsg(String((e as Error).message)); }
              setBusy(false);
            }}>Create a new sheet</button>
          </div>
          <Field label="…or use an existing sheet" wide>
            <input value={link} onInput={(e) => setLink((e.target as HTMLInputElement).value)} placeholder="https://docs.google.com/spreadsheets/d/…" />
          </Field>
          <div class="actions">
            <button class="secondary" onClick={() => {
              const id = parseSpreadsheetId(link);
              id ? connect(id) : setMsg("That doesn't look like a Google Sheets link.");
            }}>Use this sheet</button>
          </div>
        </>
      ) : (
        <>
          <p class="muted small">
            {lastSyncAt ? `Last synced ${new Date(lastSyncAt).toLocaleString()}` : 'Not synced yet'}
            {pending ? ` · ${pending} change(s) pending` : ''}
          </p>
          <div class="actions wrap">
            <a class="button ghost" href={sheetUrl(spreadsheetId)} target="_blank" rel="noopener">Open sheet</a>
            <button class="ghost" onClick={async () => {
              const url = `${redirectUri()}?sheet=${spreadsheetId}`;
              try { await navigator.clipboard.writeText(url); setMsg('Invite link copied. Share the sheet with them in Google too.'); }
              catch { setMsg(url); }
            }}>Copy invite link</button>
            <button class="primary" onClick={props.onSync}>Sync now</button>
          </div>
          <div class="actions wrap">
            <button class="link" onClick={() => { if (confirm('Disconnect this sheet? Local data is kept.')) updateSettings({ spreadsheetId: null }); }}>Disconnect sheet</button>
            <button class="link" onClick={() => { signOut(); updateSettings({}); }}>Sign out</button>
          </div>
        </>
      )}
      {(msg || props.error) && <p class={props.error ? 'error' : 'muted small'}>{props.error || msg}</p>}
    </section>
  );
}

function download(name: string, type: string, body: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([body], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function DataCard() {
  const s = useStore();
  const [cur, setCur] = useState(s.settings.currency);
  const stamp = new Date().toISOString().slice(0, 10);

  function csv() {
    const { data } = getState();
    const rows = [['date', 'end', 'car', 'where', 'start_pct', 'end_pct', 'meter_start', 'meter_end', 'kwh', 'price_per_kwh', 'cost', 'odometer_km', 'notes']];
    for (const c of data.charges.filter((x) => !x.deleted).sort((a, b) => a.startedAt - b.startedAt)) {
      rows.push([
        new Date(c.startedAt).toISOString(), c.endedAt ? new Date(c.endedAt).toISOString() : '',
        data.vehicles.find((v) => v.id === c.vehicleId)?.name ?? '',
        data.meters.find((m) => m.id === c.meterId)?.name ?? c.location,
        n2s(c.startPct), n2s(c.endPct), n2s(c.meterStart), n2s(c.meterEnd), n2s(c.kwh), n2s(c.pricePerKwh),
        n2s(chargeCost(c)), n2s(c.odometerKm), c.notes,
      ]);
    }
    download(`ev-charges-${stamp}.csv`, 'text/csv', rows.map((r) => r.map((v) => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v).join(',')).join('\n'));
  }

  return (
    <section class="card">
      <h3 class="section-title">Preferences & data</h3>
      <div class="grid">
        <Field label="Currency" hint="ISO code, e.g. EUR, GBP, USD">
          <input value={cur} maxLength={3} onInput={(e) => setCur((e.target as HTMLInputElement).value.toUpperCase())}
            onBlur={() => /^[A-Z]{3}$/.test(cur) && updateSettings({ currency: cur })} />
        </Field>
      </div>
      <div class="actions wrap">
        <button class="ghost" onClick={csv}>Export CSV</button>
        <button class="ghost" onClick={() => download(`ev-charger-backup-${stamp}.json`, 'application/json', JSON.stringify(getState().data, null, 2))}>Backup JSON</button>
        <label class="button ghost">
          Restore JSON
          <input type="file" accept="application/json" hidden onChange={async (e) => {
            const f = (e.target as HTMLInputElement).files?.[0];
            if (!f) return;
            try {
              const d = JSON.parse(await f.text()) as Data;
              if (!Array.isArray(d.charges) || !Array.isArray(d.vehicles) || !Array.isArray(d.meters)) throw new Error();
              if (confirm(`Load ${d.charges.length} charges from this backup?`)) importData(d);
            } catch { alert('Not a valid backup file.'); }
          }} />
        </label>
      </div>
    </section>
  );
}
