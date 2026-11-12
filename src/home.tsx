import { useEffect, useState } from 'preact/hooks';
import { ChargeForm, newCharge, type Mode } from './chargeForm';
import { MeterForm, VehicleForm } from './setup';
import { useStore } from './store';
import { chargeCost, type Charge } from './types';
import { dateLabel, duration, money, num, Sheet, timeLabel } from './ui';

export function Home() {
  const { data } = useStore();
  const [form, setForm] = useState<{ mode: Mode; charge: Charge } | null>(null);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const vehicles = data.vehicles.filter((v) => !v.deleted);
  const meters = data.meters.filter((m) => !m.deleted);
  const charges = data.charges.filter((c) => !c.deleted);
  const active = charges.filter((c) => c.status === 'active').sort((a, b) => b.startedAt - a.startedAt);
  const done = charges.filter((c) => c.status === 'done').sort((a, b) => b.startedAt - a.startedAt);
  const last = done[0];
  const vName = (id: string) => vehicles.find((v) => v.id === id)?.name ?? 'Car';
  const where = (c: Charge) => meters.find((m) => m.id === c.meterId)?.name ?? (c.location || 'Other');

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const month = done.filter((c) => c.startedAt >= monthStart);
  const monthKwh = month.reduce((a, c) => a + (c.kwh ?? 0), 0);
  const monthCost = month.reduce((a, c) => a + (chargeCost(c) ?? 0), 0);

  if (!vehicles.length) return <Onboarding />;

  return (
    <div class="stack">
      {active.map((c) => (
        <section class="card live">
          <div class="live-head">
            <span class="pulse" aria-hidden="true" />
            <div>
              <div class="eyebrow">Charging{vehicles.length > 1 ? ` · ${vName(c.vehicleId)}` : ''} · {where(c)}</div>
              <div class="big">{duration(Date.now() - c.startedAt)}</div>
              <div class="muted">
                since {timeLabel(c.startedAt)}
                {c.startPct != null && ` · from ${c.startPct}%`}
                {c.meterStart != null && ` · meter ${num(c.meterStart, 2)}`}
              </div>
            </div>
          </div>
          <div class="actions">
            <button class="ghost" onClick={() => setForm({ mode: 'edit', charge: c })}>Edit</button>
            <button class="primary" onClick={() => setForm({ mode: 'finish', charge: c })}>Finish charge</button>
          </div>
        </section>
      ))}

      <div class="cta">
        <button class="primary big-btn" onClick={() => setForm({ mode: 'start', charge: newCharge() })}>⚡ Start a charge</button>
        <button class="secondary big-btn" onClick={() => setForm({ mode: 'log', charge: { ...newCharge(), status: 'done' } })}>
          Log a finished charge
        </button>
      </div>

      <section class="tiles">
        <div class="tile"><span class="tile-label">This month</span><span class="tile-value">{money(monthCost)}</span><span class="tile-sub">{num(monthKwh, 1, 'kWh')} · {month.length} charges</span></div>
        <div class="tile">
          <span class="tile-label">Last charge</span>
          <span class="tile-value">{last ? num(last.kwh, 1, 'kWh') : '–'}</span>
          <span class="tile-sub">{last ? `${dateLabel(last.startedAt)} · ${money(chargeCost(last))}` : 'nothing yet'}</span>
        </div>
      </section>

      {meters.length > 0 && <MeterBoard />}
      {form && (
        <Sheet
          title={{ start: 'Start a charge', finish: 'Finish charge', log: 'Log a charge', edit: 'Edit charge' }[form.mode]}
          onClose={() => setForm(null)}
        >
          <ChargeForm mode={form.mode} charge={form.charge} onDone={() => setForm(null)} />
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
            <span class="meter-name">{x.name}</span>
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
          Google in <b>Setup</b>, synced to a Google Sheet you can share.
        </p>
        <VehicleForm onDone={() => {}} />
      </section>
    </div>
  );
}
