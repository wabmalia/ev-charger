import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { ChargeCard } from './chargeCard';
import { ChargeForm, type Mode } from './chargeForm';
import { computeMetrics } from './metrics';
import { InstallBanner } from './install';
import { MeterForm, VehicleForm } from './setup';
import { useStore } from './store';
import { chargeCost, sortKey, type Charge } from './types';
import { EditTag, money, num, Sheet } from './ui';

export interface FormState { mode: Mode; charge: Charge }

export function Home(props: { go: (v: 'history' | 'stats') => void }) {
  const { data } = useStore();
  const [edit, setEdit] = useState<Charge | null>(null);
  const [, tick] = useState(0);
  const latestRef = useRef<HTMLElement>(null);
  const fit = useFitCount(latestRef, data);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const vehicles = data.vehicles.filter((v) => !v.deleted);
  const meters = data.meters.filter((m) => !m.deleted);
  const charges = data.charges.filter((c) => !c.deleted);
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
      <InstallBanner />

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

      {meters.length > 0 && <MeterBoard />}

      <section ref={latestRef}>
        <div class="row section-head">
          <h3 class="section-title">Latest charges</h3>
          {done.length > 0 && <button class="link" onClick={() => props.go('history')}>History ›</button>}
        </div>
        {done.length ? (
          <div class="cards">
            {done.slice(0, fit).map((c) => (
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
      <div class="cards">
        {meters.map((x) => (
          <button class="charge-card meter" onClick={() => setEdit(x.id)}>
            <span class="cc-head"><span class="cc-title cc-date">{x.name}</span><EditTag /></span>
            <span class="cc-main">
              <span class="meter-reading">{x.lastReading != null ? num(x.lastReading, 2) : '–'}<small> kWh</small></span>
              <span class="cc-cost">{x.pricePerKwh != null ? money(x.pricePerKwh, 2, 4) : '–'}<small> /kWh</small></span>
            </span>
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

const MIN_CARDS = 1;
const MAX_CARDS = 8;

/**
 * How many charge cards fit between the top of the "Latest charges" section and the bottom
 * action bar on this screen, so taller phones show more without scrolling.
 */
function useFitCount(ref: { current: HTMLElement | null }, deps: unknown): number {
  const [n, setN] = useState(3);
  useLayoutEffect(() => {
    function measure() {
      const section = ref.current;
      if (!section) return;
      const top = section.getBoundingClientRect().top + scrollY;
      const head = (section.querySelector('.section-head') as HTMLElement | null)?.offsetHeight ?? 32;
      const bar = (document.querySelector('.actionbar') as HTMLElement | null)?.offsetHeight ?? 96;
      const card = (section.querySelector('.charge-card') as HTMLElement | null)?.offsetHeight ?? 130;
      const gap = 10;
      const room = innerHeight - top - head - 8 - bar - 16;
      setN(Math.min(MAX_CARDS, Math.max(MIN_CARDS, Math.floor((room + gap) / (card + gap)))));
    }
    measure();
    addEventListener('resize', measure);
    return () => removeEventListener('resize', measure);
  }, [deps]);
  return n;
}
