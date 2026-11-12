import qrcode from 'qrcode-generator';
import { useMemo, useState } from 'preact/hooks';
import { redirectUri, sheetUrl } from './google';

export function inviteUrl(spreadsheetId: string) {
  return `${redirectUri()}?sheet=${encodeURIComponent(spreadsheetId)}`;
}

/** QR code as an SVG path, dark modules on a white tile so any camera can read it. */
function Qr(props: { text: string }) {
  const { d, size } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(props.text);
    qr.make();
    const n = qr.getModuleCount();
    let path = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) path += `M${c + 4},${r + 4}h1v1h-1z`;
    return { d: path, size: n + 8 };
  }, [props.text]);
  return (
    <svg class="qr" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="QR code with the invite link" shape-rendering="crispEdges">
      <rect width={size} height={size} fill="#ffffff" />
      <path d={d} fill="#0f1113" />
    </svg>
  );
}

export function InviteSection(props: { spreadsheetId: string }) {
  const url = inviteUrl(props.spreadsheetId);
  const [msg, setMsg] = useState('');
  const local = /^(localhost|127\.|192\.168\.|10\.)/.test(location.hostname);
  return (
    <div class="invite">
      <h3 class="section-title">Share with someone</h3>
      <ol class="steps">
        <li>
          <a href={sheetUrl(props.spreadsheetId)} target="_blank" rel="noopener">Open the sheet</a> and use Google's
          <b> Share</b> to give their Google account <b>Editor</b> access.
        </li>
        <li>On their phone, scan this code or open the link, then sign in with Google.</li>
      </ol>
      <Qr text={url} />
      {local && <p class="muted small">This is a local address, so it only works on this network. Share from the published app for a link that works anywhere.</p>}
      <div class="actions wrap">
        {typeof navigator.share === 'function' && (
          <button class="secondary" onClick={() => navigator.share({ title: 'EV Charger', text: 'Join our EV Charger log', url }).catch(() => {})}>
            Send link…
          </button>
        )}
        <button class="ghost" onClick={async () => {
          try { await navigator.clipboard.writeText(url); setMsg('Link copied.'); } catch { setMsg(url); }
        }}>Copy link</button>
      </div>
      {msg && <p class="muted small">{msg}</p>}
    </div>
  );
}
