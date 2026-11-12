import { useEffect, useState } from 'preact/hooks';
import { ChargeCard } from './chargeCard';
import { ChargeForm, type Mode } from './chargeForm';
import { computeMetrics } from './metrics';
import { InstallBanner } from './install';
import { MeterForm, VehicleForm } from './setup';
import { useStore } from './store';
import { chargeCost, sortKey, type Charge } from './types';
import { duration, EditTag, money, num, PencilIcon, Sheet, timeLabel } from './ui';

export interface FormState { mode: Mode; charge: Charge }

export function Home(props: {
  openForm: (f: FormState) => void;
  startAnother: () => void;
  go: (v: 'history' | 'stats') => void;
}) {
  const { data } = useStore();
  const [edit, setEdit] = useState<Charge | null>(null);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const vehicles = data.vehicles.filter((v) => !v.deleted);
  const meters = data.meters.filter((m) => !m.deleted);
  const charges = data.charges.filter((c) => !c.deleted);
  const active = charges.filter((c) => c.status === 'active').sort((a, b) => sortKey(b) - sortKey(a));
  const done = charges.filter((c) => c.status === 'done').sort((a, b) => sortKey(b) - sortKey(a));
  const vName = (id: string) => data.vehicles.find((v) => v.id === id)?.name ?? 'Car';
  const where = (c: Charge) => data.meters.find((m) => m.id === c.meterId)?.name ?? (c.location || 'Other');

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const month = done.filter((c) => sortKey(c) >= monthStart);
  const monthKwh = month.reduce((a, c) => a + (c.kwh ?? 0), 0);
  const monthCost = month.reduce((a, c) => a + (chargeCost(c) ?? 0), 0);
  const m = computeMetrics(charges, data.vehicles, where);

  if (!vehicles.length) return <Onboarding />;

  return (
    <div class="stack">
      {active.map((c) => (
        <section class="card live">
          <div class="live-head">
            <span class="pulse" aria-hidden="true" />
            <div class="grow">
              <div class="eyebrow">Charging{vehicles.length > 1 ? ` · ${vName(c.vehicleId)}` : ''} · {where(c)}</div>
              <div class="big">{duration(Date.now() - sortKey(c))}</div>
              <div class="muted small">
                since {timeLabel(sortKey(c))}
                {c.startPct != null && ` · from ${c.startPct}%`}
                {c.meterStart != null && ` · meter ${num(c.meterStart, 2)}`}
              </div>
            </div>
            <button class="link edit-link" onClick={() => props.openForm({ mode: 'edit', charge: c })}><PencilIcon /> Edit</button>
          </div>
          {active.length > 1 && (
            <div class="actions">
              <button class="ghost" onClick={() => props.openForm({ mode: 'finish', charge: c })}>Finish this charge</button>
            </div>
          )}
        </section>
      ))}
      <InstallBanner />
      {active.length > 0 && vehicles.length > 1 && active.length < vehicles.length && (
        <button class="link left" onClick={props.startAnother}>+ Start a charge for another car</button>
      )}

      <section>
        <div class="row section-head">
          <h3 class="section-title">Overview</h3>
          {done.length > 0 && <button class="link" onClick={() => props.go('stats')}>All stats ›</button>}
        </div>
        <div class="tiles">
          <div class="tile">
            <span class="tile-label">This month</span>
            <span class="tile-value">{money(monthCost)}</span>
            <span class="tile-sub">{num(monthKwh, 1, 'kWh')} · {month.length} {month.length === 1 ? 'charge' : 'charges'}</span>
          </div>
          <div class="tile">
            <span class="tile-label">Avg price</span>
            <span class="tile-value">{m.avgPrice != null ? money(m.avgPrice, 2, 4) : '–'}</span>
            <span class="tile-sub">per kWh</span>
          </div>
          <div class="tile">
            <span class="tile-label">Consumption</span>
            <span class="tile-value">{num(m.kwhPer100km, 1, 'kWh')}</span>
            <span class="tile-sub">per 100 km{m.pctPer100km != null ? ` · ${num(m.pctPer100km, 0)}% battery` : ''}</span>
          </div>
          <div class="tile">
            <span class="tile-label">Cost per 100 km</span>
            <span class="tile-value">{m.costPer100km != null ? money(m.costPer100km) : '–'}</span>
            <span class="tile-sub">{m.kmDriven ? `${num(m.kmDriven, 0)} km tracked` : 'add odometer readings'}</span>
          </div>
        </div>
      </section>

      <section>
        <div class="row section-head">
          <h3 class="section-title">Latest charges</h3>
          {done.length > 0 && <button class="link" onClick={() => props.go('history')}>History ›</button>}
        </div>
        {done.length ? (
          <div class="cards">
            {done.slice(0, 3).map((c) => (
              <ChargeCard
                charge={c}
                where={where(c)}
                car={vehicles.length > 1 ? vName(c.vehicleId) : undefined}
                onEdit={() => setEdit(c)}
              />
            ))}
          </div>
        ) : (
          <p class="muted small">No charges yet. Use the buttons below to start or log one.</p>
        )}
      </section>

      {meters.length > 0 && <MeterBoard />}

      {edit && (
        <Sheet title="Edit charge" onClose={() => setEdit(null)}>
          <ChargeForm mode="edit" charge={edit} onDone={() => setEdit(null)} />
        </Sheet>
      )}
    </div>
  );
}

function MeterBoard() {
  const { data } = useStore();
  const [edit, setEdit] = useState<string | null>(null);
  const meters = data.meters.filter((m) => !m.deleted);
  const m = meters.find((x) => x.id === edit);
  return (
    <section>
      <h3 class="section-title">Electric boards</h3>
      <div class="meters">
        {meters.map((x) => (
          <button class="meter" onClick={() => setEdit(x.id)}>
            <span class="meter-head"><span class="meter-name">{x.name}</span><EditTag /></span>
            <span class="meter-reading">{x.lastReading != null ? num(x.lastReading, 2) : '–'}<small> kWh</small></span>
            <span class="muted">{x.pricePerKwh != null ? `${money(x.pricePerKwh, 2, 4)} / kWh` : 'no price set'}</span>
          </button>
        ))}
      </div>
      {m && (
        <Sheet title={m.name} onClose={() => setEdit(null)}>
          <MeterForm meter={m} onDone={() => setEdit(null)} />
        </Sheet>
      )}
    </section>
  );
}

function Onboarding() {
  return (
    <div class="stack">
      <section class="card">
        <h2>Welcome 👋</h2>
        <p class="muted">
          Add your car to start logging charges. Everything is stored on this device and, once you connect
          Google in Settings (⚙ at the top), synced to a Google Sheet you can share.
        </p>
        <VehicleForm onDone={() => {}} />
      </section>
    </div>
  );
}
