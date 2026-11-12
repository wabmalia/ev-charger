import { useState } from 'preact/hooks';
import { ChargeForm } from './chargeForm';
import { monthKey } from './metrics';
import { useStore } from './store';
import { chargeCost, sortKey, type Charge } from './types';
import { dateLabel, duration, money, num, Sheet } from './ui';

export function History() {
  const { data } = useStore();
  const [edit, setEdit] = useState<Charge | null>(null);
  const [vehicle, setVehicle] = useState('');
  const vehicles = data.vehicles.filter((v) => !v.deleted);
  const charges = data.charges
    .filter((c) => !c.deleted && c.status === 'done' && (!vehicle || c.vehicleId === vehicle))
    .sort((a, b) => sortKey(b) - sortKey(a));
  const where = (c: Charge) => data.meters.find((m) => m.id === c.meterId)?.name ?? (c.location || 'Other');
  const vName = (id: string) => data.vehicles.find((v) => v.id === id)?.name ?? '';

  const groups: { key: string; items: Charge[] }[] = [];
  for (const c of charges) {
    // Undated charges sit in the month of their position in the log; the row says "No date".
    const k = monthKey(sortKey(c));
    if (groups.at(-1)?.key !== k) groups.push({ key: k, items: [] });
    groups.at(-1)!.items.push(c);
  }

  if (!charges.length && !vehicle) return <p class="empty">No charges yet. Start or log one with the buttons below.</p>;

  return (
    <div class="stack">
      {vehicles.length > 1 && (
        <div class="chips">
          <button class={!vehicle ? 'chip on' : 'chip'} onClick={() => setVehicle('')}>All cars</button>
          {vehicles.map((v) => <button class={vehicle === v.id ? 'chip on' : 'chip'} onClick={() => setVehicle(v.id)}>{v.name}</button>)}
        </div>
      )}
      {groups.map((g) => {
        const kwh = g.items.reduce((a, c) => a + (c.kwh ?? 0), 0);
        const cost = g.items.reduce((a, c) => a + (chargeCost(c) ?? 0), 0);
        const [y, m] = g.key.split('-').map(Number);
        const label = new Date(y!, m! - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
        return (
          <section>
            <h3 class="section-title row">
              <span>{label}</span>
              <span class="muted">{num(kwh, 1, 'kWh')} · {money(cost)}</span>
            </h3>
            <ul class="list">
              {g.items.map((c) => (
                <li>
                  <button class="list-row" onClick={() => setEdit(c)}>
                    <div>
                      <div class="row-title">{dateLabel(c.startedAt)}</div>
                      <div class="muted small">
                        {where(c)}
                        {vehicles.length > 1 && ` · ${vName(c.vehicleId)}`}
                        {c.startPct != null && c.endPct != null && ` · ${c.startPct}→${c.endPct}%`}
                        {c.startedAt != null && c.endedAt != null && ` · ${duration(c.endedAt - c.startedAt)}`}
                      </div>
                    </div>
                    <div class="right">
                      <div class="row-title">{num(c.kwh, 2, 'kWh')}</div>
                      <div class="muted small">{money(chargeCost(c))}</div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {edit && (
        <Sheet title="Edit charge" onClose={() => setEdit(null)}>
          <ChargeForm mode="edit" charge={edit} onDone={() => setEdit(null)} />
        </Sheet>
      )}
    </div>
  );
}
