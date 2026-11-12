import { chargeCost, type Charge } from './types';
import { dateLabel, duration, EditTag, money, num } from './ui';

/** One finished charge as a tappable card (used on the landing screen and in History). */
export function ChargeCard(props: { charge: Charge; where: string; car?: string; onEdit: () => void }) {
  const c = props.charge;
  const hasPct = c.startPct != null && c.endPct != null;
  const meta = [
    props.where,
    props.car,
    c.startedAt != null && c.endedAt != null ? duration(c.endedAt - c.startedAt) : null,
  ].filter(Boolean).join(' · ');
  return (
    <button class="charge-card" onClick={props.onEdit}>
      <div class="cc-head">
        <span class="cc-date">{dateLabel(c.startedAt)}</span>
        <EditTag />
      </div>
      <div class="cc-main">
        <span class="cc-kwh">{num(c.kwh, 2)}<small> kWh</small></span>
        <span class="cc-cost">{money(chargeCost(c))}</span>
      </div>
      {hasPct && (
        <div class="cc-battery">
          <div class="cc-bar" aria-hidden="true">
            <div class="cc-fill" style={{ left: `${c.startPct}%`, width: `${Math.max(0, c.endPct! - c.startPct!)}%` }} />
          </div>
          <span class="cc-pct">{c.startPct} → {c.endPct}%</span>
        </div>
      )}
      <div class="muted small cc-meta">{meta}</div>
    </button>
  );
}
