import { useEffect, useState } from 'preact/hooks';
import { ChargeForm, newCharge } from './chargeForm';
import { handleRedirect, isAuthError, sync, token } from './google';
import { History } from './history';
import { Home, type FormState } from './home';
import { Setup } from './setup';
import { Stats } from './stats';
import { confirmReplaceLocal, getState, onScheduleSync, pendingCount, connectSheet, useStore } from './store';
import { sortKey, type Charge } from './types';
import { duration, PencilIcon, Sheet, timeLabel } from './ui';

type View = 'home' | 'history' | 'stats' | 'setup';
const TITLES: Record<View, string> = { home: 'EV Charger', history: 'History', stats: 'Stats', setup: 'Settings' };

// Runs once on load: OAuth redirect result and ?sheet= invite links.
const bootError = handleRedirect();
const invite = new URLSearchParams(location.search).get('sheet');
if (invite) {
  history.replaceState(null, '', location.pathname);
  const cur = getState().settings.spreadsheetId;
  if (cur !== invite && (!cur || confirm('Switch to the shared sheet from this link?')) && confirmReplaceLocal()) {
    connectSheet(invite, 'replace');
  }
}

export function App() {
  const s = useStore();
  const [view, setView] = useState<View>(() => (bootError || invite ? 'setup' : 'home'));
  const [form, setForm] = useState<FormState | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState(bootError ?? '');

  // Sub-screens push a history entry so the phone's back gesture returns home.
  function go(v: View) {
    if (v === view) return;
    if (v === 'home') return history.back();
    history.pushState({ view: v }, '');
    setView(v);
    scrollTo(0, 0);
  }
  useEffect(() => {
    const pop = (e: PopStateEvent) => setView((e.state as { view?: View } | null)?.view ?? 'home');
    addEventListener('popstate', pop);
    if (view !== 'home') {
      history.replaceState(null, '');
      history.pushState({ view }, '');
    }
    return () => removeEventListener('popstate', pop);
  }, []);

  // Keep the ongoing-charge timer in the action bar current.
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  async function runSync() {
    if (!getState().settings.spreadsheetId || !token()) return;
    setSyncing(true);
    try {
      await sync();
      setSyncError('');
    } catch (e) {
      setSyncError(isAuthError(e) ? 'Google session expired. Sign in again in Settings.' : String((e as Error).message));
    }
    setSyncing(false);
  }

  useEffect(() => {
    onScheduleSync(runSync);
    runSync();
    const vis = () => document.visibilityState === 'visible' && runSync();
    document.addEventListener('visibilitychange', vis);
    addEventListener('online', runSync);
    return () => {
      document.removeEventListener('visibilitychange', vis);
      removeEventListener('online', runSync);
    };
  }, []);

  const pending = pendingCount(s);
  const connected = !!s.settings.spreadsheetId;
  const status = !connected ? 'Local only'
    : syncing ? 'Syncing…'
    : syncError ? 'Sync issue'
    : !token() ? 'Sign in to sync'
    : pending ? `${pending} pending` : 'Synced';
  // Outside Settings the pill only appears when sync needs attention or is working.
  const needsAttention = connected && (syncing || !!syncError || !token() || pending > 0);
  const showStatus = view === 'setup' || needsAttention;

  const hasVehicle = s.data.vehicles.some((v) => !v.deleted);
  const active = s.data.charges
    .filter((c) => !c.deleted && c.status === 'active')
    .sort((a, b) => sortKey(b) - sortKey(a));
  const showBar = hasVehicle && view !== 'setup';
  const liveVehicles = s.data.vehicles.filter((v) => !v.deleted);
  const hasMany = liveVehicles.length > 1;
  const vName = (id: string) => s.data.vehicles.find((v) => v.id === id)?.name ?? 'Car';
  const whereName = (c: Charge) => s.data.meters.find((m) => m.id === c.meterId)?.name ?? (c.location || 'Other');

  // Start defaults to a car that isn't already charging.
  function startCharge() {
    const c = newCharge();
    const busy = new Set(active.map((a) => a.vehicleId));
    if (busy.has(c.vehicleId)) {
      const free = s.data.vehicles.find((v) => !v.deleted && !busy.has(v.id));
      if (free) c.vehicleId = free.id;
    }
    setForm({ mode: 'start', charge: c });
  }

  return (
    <div class={showBar ? 'app with-bar' : 'app'}>
      <header class="topbar">
        {view === 'home' ? (
          <h1>EV Charger</h1>
        ) : (
          <button class="back" onClick={() => go('home')} aria-label="Back">‹ <span>{TITLES[view]}</span></button>
        )}
        <div class="top-actions">
          {showStatus && (
            <button class={`status ${syncError || (connected && !token()) ? 'bad' : syncing ? 'busy' : ''}`} onClick={() => (connected && token() ? runSync() : go('setup'))}>
              {status}
            </button>
          )}
          {view !== 'setup' && (
            <button class="settings-btn" onClick={() => go('setup')}>
              <span aria-hidden="true">⚙</span> Settings
            </button>
          )}
        </div>
      </header>
      <main>
        {view === 'home' && <Home go={go} />}
        {view === 'history' && <History />}
        {view === 'stats' && <Stats />}
        {view === 'setup' && <Setup onSync={runSync} syncError={syncError} />}
      </main>

      {showBar && (
        <nav class="actionbar" aria-label="Charge actions">
          {active.map((c) => (
            <div class="live-strip">
              <span class="pulse small" aria-hidden="true" />
              <div class="live-text">
                <span class="live-time">{duration(Date.now() - sortKey(c))}</span>
                <span class="muted small">
                  {[
                    hasMany ? vName(c.vehicleId) : null,
                    whereName(c),
                    `since ${timeLabel(sortKey(c))}`,
                    c.startPct != null ? `from ${c.startPct}%` : null,
                  ].filter(Boolean).join(' · ')}
                </span>
              </div>
              {active.length > 1 && (
                <button class="link" onClick={() => setForm({ mode: 'finish', charge: c })}>Finish</button>
              )}
              <button class="edit-tag" onClick={() => setForm({ mode: 'edit', charge: c })}><PencilIcon /> Edit</button>
            </div>
          ))}
          {active.length > 0 && hasMany && active.length < liveVehicles.length && (
            <button class="link left" onClick={startCharge}>+ Start a charge for another car</button>
          )}
          <div class="bar-buttons">
          {active.length ? (
            <button class="primary main live-btn" onClick={() => setForm({ mode: 'finish', charge: active[0]! })}>
              <span class="pulse small" aria-hidden="true" /> Finish charging
            </button>
          ) : (
            <button class="primary main" onClick={startCharge}>
              <svg class="bolt" viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 2 5 13.5h5.5L9.5 22 19 9.5h-5.8z" fill="currentColor" /></svg>
              Start charge
            </button>
          )}
          <button class="secondary side" onClick={() => setForm({ mode: 'log', charge: { ...newCharge(), status: 'done' } })}>
            + Log
          </button>
          </div>
        </nav>
      )}

      {form && (
        <Sheet
          title={{ start: 'Start a charge', finish: 'Finish charging', log: 'Log a past charge', edit: 'Edit charge' }[form.mode]}
          onClose={() => setForm(null)}
        >
          <ChargeForm mode={form.mode} charge={form.charge} onDone={() => setForm(null)} />
        </Sheet>
      )}
    </div>
  );
}
