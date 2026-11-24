import { chargeCost, type Charge } from './types';
import { dateLabel, duration, EditTag, money, num } from './ui';

/** One finished charge as a tappable card (used on the landing screen and in History). */
export function ChargeCard(props: { charge: Charge; where: string; car?: string; km?: number; onEdit: () => void }) {
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
        <span class="cc-title">
          <span class="cc-date">{dateLabel(c.startedAt)}</span>
          {meta && <span class="muted"> · {meta}</span>}
        </span>
        <EditTag />
      </div>
      <div class="cc-main">
        <span class="cc-kwh">{num(c.kwh, 2)}<small> kWh</small></span>
        <span class="cc-cost">{money(chargeCost(c))}</span>
      </div>
      {(hasPct || props.km != null) && (
        <div class="cc-battery">
          {hasPct && (
            <div class="cc-bar" aria-hidden="true">
              <div class="cc-fill" style={{ left: `${c.startPct}%`, width: `${Math.max(0, c.endPct! - c.startPct!)}%` }} />
            </div>
          )}
          <span class="cc-pct">
            {props.km != null && <span title="driven since the previous charge">{num(props.km, 0)} km</span>}
            {props.km != null && hasPct && ' · '}
            {hasPct && `${c.startPct} → ${c.endPct}%`}
          </span>
        </div>
      )}
    </button>
  );
}
