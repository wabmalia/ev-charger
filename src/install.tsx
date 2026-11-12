import { useEffect, useState } from 'preact/hooks';

/**
 * iOS Safari has no install prompt: the user must use Share → Add to Home Screen, so we
 * explain that. Chromium browsers fire `beforeinstallprompt`, which we turn into a button.
 */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'ev-charger:install-dismissed';
let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e as InstallPromptEvent;
  listeners.forEach((l) => l());
});
addEventListener('appinstalled', () => {
  deferred = null;
  listeners.forEach((l) => l());
});

export const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

export const isIOS = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function useInstall() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return {
    canPrompt: !!deferred,
    prompt: async () => {
      if (!deferred) return;
      await deferred.prompt();
      await deferred.userChoice;
      deferred = null;
      listeners.forEach((l) => l());
    },
  };
}

function ShareIcon() {
  return (
    <svg class="inline-icon" viewBox="0 0 24 24" aria-label="Share">
      <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M6 11H5v10h14V11h-1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

function openShare() {
  navigator.share?.({ title: 'EV Charger', url: location.origin + location.pathname }).catch(() => {});
}

export function InstallSteps() {
  const { canPrompt, prompt } = useInstall();
  if (canPrompt) {
    return (
      <div class="actions wrap">
        <button class="primary" onClick={prompt}>Install app</button>
      </div>
    );
  }
  if (isIOS()) {
    const canShare = typeof navigator.share === 'function';
    return (
      <>
        <ol class="steps">
          <li>
            {canShare ? 'Open the share menu with the button below' : <>Tap <ShareIcon /> <b>Share</b> in Safari's toolbar</>}.
          </li>
          <li>Scroll down and tap <b>Add to Home Screen</b>.</li>
          <li>Make sure <b>Open as Web App</b> is on, then tap <b>Add</b>.</li>
        </ol>
        {canShare && (
          <>
            <div class="actions wrap">
              <button class="primary" onClick={openShare}><ShareIcon /> Share…</button>
            </div>
            <p class="muted small">
              No "Add to Home Screen" in that menu? Use <ShareIcon /> Share in Safari's toolbar instead.
            </p>
          </>
        )}
      </>
    );
  }
  return (
    <p class="muted small">
      Use your browser menu and choose <b>Install app</b> or <b>Add to Home screen</b>.
    </p>
  );
}

/** Settings card: hidden once the app runs installed. */
export function InstallCard() {
  if (isStandalone()) return null;
  return (
    <section class="card install">
      <h3 class="section-title">Install on this phone</h3>
      <InstallSteps />
    </section>
  );
}

/** One-time tip on the landing screen; also available any time in Settings. */
export function InstallBanner() {
  const { canPrompt } = useInstall();
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
  });
  if (dismissed || isStandalone() || !(canPrompt || isIOS())) return null;
  return (
    <section class="card install">
      <div class="row">
        <h3 class="section-title">Install EV Charger on this phone</h3>
        <button class="icon" aria-label="Dismiss" onClick={() => {
          try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
          setDismissed(true);
        }}>✕</button>
      </div>
      <InstallSteps />
    </section>
  );
}
