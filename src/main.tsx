import { render } from 'preact';
import { App } from './app';
import './styles.css';

render(<App />, document.getElementById('app')!);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// Detect an installed iOS app whose web view ends above the home bar (see styles.css).
function checkViewport() {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;padding-bottom:env(safe-area-inset-bottom)';
  document.body.appendChild(probe);
  const inset = parseFloat(getComputedStyle(probe).paddingBottom) || 0;
  probe.remove();
  const portrait = innerHeight > innerWidth;
  const screenH = portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
  const short = matchMedia('(display-mode: standalone)').matches && inset > 0 && screenH - innerHeight >= inset;
  document.documentElement.classList.toggle('short-viewport', short);
}
checkViewport();
addEventListener('resize', checkViewport);
