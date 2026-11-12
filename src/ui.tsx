import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';
import { getState } from './store';

/** `maxDigits` > `digits` shows extra decimals only when present (e.g. kWh prices like 0.1675). */
export function money(n: number | null | undefined, digits = 2, maxDigits = digits): string {
  if (n == null) return '–';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency', currency: getState().settings.currency || 'EUR',
      minimumFractionDigits: digits, maximumFractionDigits: maxDigits,
    }).format(n);
  } catch {
    return n.toFixed(maxDigits);
  }
}

export function num(n: number | null | undefined, digits = 1, unit = ''): string {
  if (n == null || !Number.isFinite(n)) return '–';
  const s = n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  return unit ? `${s} ${unit}` : s;
}

export function dateLabel(t: number): string {
  return new Date(t).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function timeLabel(t: number): string {
  return new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function duration(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(m / 60);
  return h ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
}

export function toLocalInput(t: number | null): string {
  if (t == null) return '';
  const d = new Date(t - new Date(t).getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

export function fromLocalInput(s: string): number | null {
  if (!s) return null;
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Parse a number typed by a human, accepting comma decimals. */
export function parseNum(s: string): number | null {
  const t = s.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function Field(props: { label: string; hint?: string; children: ComponentChildren; wide?: boolean }) {
  return (
    <label class={props.wide ? 'field wide' : 'field'}>
      <span class="label">{props.label}</span>
      {props.children}
      {props.hint && <span class="hint">{props.hint}</span>}
    </label>
  );
}

export function NumInput(props: {
  value: string; onInput: (v: string) => void; placeholder?: string; step?: string; autoFocus?: boolean;
}) {
  return (
    <input
      type="text"
      inputMode="decimal"
      value={props.value}
      placeholder={props.placeholder}
      autoFocus={props.autoFocus}
      onInput={(e) => props.onInput((e.target as HTMLInputElement).value)}
    />
  );
}

export function Sheet(props: { title: string; onClose: () => void; children: ComponentChildren }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose();
    addEventListener('keydown', k);
    document.body.classList.add('locked');
    return () => {
      removeEventListener('keydown', k);
      document.body.classList.remove('locked');
    };
  }, []);
  return (
    <div class="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <div class="sheet" role="dialog" aria-label={props.title}>
        <header class="sheet-head">
          <h2>{props.title}</h2>
          <button class="icon" aria-label="Close" onClick={props.onClose}>✕</button>
        </header>
        <div class="sheet-body">{props.children}</div>
      </div>
    </div>
  );
}

export const n2s = (n: number | null | undefined) => (n == null ? '' : String(n));
