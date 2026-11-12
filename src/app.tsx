import { useEffect, useState } from 'preact/hooks';
import { handleRedirect, isAuthError, sync, token } from './google';
import { History } from './history';
import { Home } from './home';
import { Setup } from './setup';
import { Stats } from './stats';
import { getState, onScheduleSync, pendingCount, updateSettings, useStore } from './store';

type Tab = 'home' | 'history' | 'stats' | 'setup';
const TABS: [Tab, string, string][] = [
  ['home', 'Charge', '⚡'],
  ['history', 'History', '☰'],
  ['stats', 'Stats', '▤'],
  ['setup', 'Setup', '⚙'],
];

// Runs once on load: OAuth redirect result and ?sheet= invite links.
const bootError = handleRedirect();
const invite = new URLSearchParams(location.search).get('sheet');
if (invite) {
  history.replaceState(null, '', location.pathname);
  const cur = getState().settings.spreadsheetId;
  if (!cur || (cur !== invite && confirm('Switch to the shared sheet from this link?'))) {
    updateSettings({ spreadsheetId: invite });
  }
}

export function App() {
  const s = useStore();
  const [tab, setTab] = useState<Tab>(() => (bootError || invite ? 'setup' : 'home'));
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState(bootError ?? '');

  async function runSync() {
    if (!getState().settings.spreadsheetId || !token()) return;
    setSyncing(true);
    try {
      await sync();
      setSyncError('');
    } catch (e) {
      setSyncError(isAuthError(e) ? 'Google session expired. Sign in again in Setup.' : String((e as Error).message));
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
    : !token() ? 'Signed out'
    : pending ? `${pending} pending` : 'Synced';

  return (
    <div class="app">
      <header class="topbar">
        <h1>EV Charger</h1>
        <button class={`status ${syncError ? 'bad' : syncing ? 'busy' : ''}`} onClick={() => (connected && token() ? runSync() : setTab('setup'))}>
          {status}
        </button>
      </header>
      <main>
        {tab === 'home' && <Home />}
        {tab === 'history' && <History />}
        {tab === 'stats' && <Stats />}
        {tab === 'setup' && <Setup onSync={runSync} syncError={syncError} />}
      </main>
      <nav class="tabbar">
        {TABS.map(([id, label, icon]) => (
          <button class={tab === id ? 'on' : ''} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined}>
            <span class="tab-icon" aria-hidden="true">{icon}</span>
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
