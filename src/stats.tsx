import { useState } from 'preact/hooks';
import { computeMetrics, MIN_STRETCH_KM, stretchRange, type MonthPoint, type Stretch } from './metrics';
import { useStore } from './store';
import { sortKey } from './types';
import { money, num } from './ui';

type Period = 'all' | '12m' | 'year';

export function Stats() {
  const { data } = useStore();
  const [period, setPeriod] = useState<Period>('all');
  const [vehicle, setVehicle] = useState('');
  const [measure, setMeasure] = useState<'cost' | 'kwh'>('cost');
  const vehicles = data.vehicles.filter((v) => !v.deleted);

  const now = new Date();
  const from = period === 'year' ? new Date(now.getFullYear(), 0, 1).getTime()
    : period === '12m' ? new Date(now.getFullYear() - 1, now.getMonth() + 1, 1).getTime() : 0;
  const charges = data.charges.filter((c) => sortKey(c) >= from && (!vehicle || c.vehicleId === vehicle));
  const m = computeMetrics(charges, data.vehicles, (c) =>
    data.meters.find((x) => x.id === c.meterId)?.name ?? (c.location || 'Other / public'));

  if (!data.charges.some((c) => !c.deleted && c.status === 'done')) {
    return <p class="empty">Stats show up after your first finished charge.</p>;
  }

  const tiles: [string, string, string?][] = [
    ['Total spent', money(m.cost), `${m.count} charges`],
    ['Energy', num(m.kwh, 0, 'kWh'), m.avgKwh != null ? `${num(m.avgKwh, 1)} kWh / charge` : undefined],
    ['Avg price', m.avgPrice != null ? money(m.avgPrice, 2, 4) : '–', 'per kWh paid'],
    ['Consumption', num(m.kwhPer100km, 1, 'kWh'), `per 100 km${m.pctPer100km != null ? ` · ${num(m.pctPer100km, 0)}% battery` : ''}`],
    ['Cost per 100 km', m.costPer100km != null ? money(m.costPer100km) : '–', m.kmDriven ? `${num(m.kmDriven, 0)} km tracked` : 'needs odometer on 2+ charges'],
    ['Charge every', m.avgDaysBetween != null ? `${num(m.avgDaysBetween, 1)} days` : '–', m.avgPctAdded != null ? `+${num(m.avgPctAdded, 0)}% on average` : undefined],
    ['Avg duration', m.avgHours != null ? `${num(m.avgHours, 1)} h` : '–'],
    ['Charging efficiency', m.chargingEfficiency != null ? `${num(m.chargingEfficiency * 100, 0)}%` : '–', m.chargingEfficiency != null ? 'battery gain ÷ meter kWh' : 'needs battery size + %'],
  ];

  return (
    <div class="stack">
      <div class="chips">
        {(['all', '12m', 'year'] as Period[]).map((p) => (
          <button class={period === p ? 'chip on' : 'chip'} onClick={() => setPeriod(p)}>
            {{ all: 'All time', '12m': 'Last 12 months', year: 'This year' }[p]}
          </button>
        ))}
        {vehicles.length > 1 && (
          <select class="chip-select" value={vehicle} onChange={(e) => setVehicle((e.target as HTMLSelectElement).value)}>
            <option value="">All cars</option>
            {vehicles.map((v) => <option value={v.id}>{v.name}</option>)}
          </select>
        )}
      </div>

      <section class="tiles">
        {tiles.map(([label, value, sub]) => (
          <div class="tile">
            <span class="tile-label">{label}</span>
            <span class="tile-value">{value}</span>
            {sub && <span class="tile-sub">{sub}</span>}
          </div>
        ))}
      </section>

      <ConsumptionRange stretches={m.stretches} battery={m.batteryKwh} />

      {m.months.length > 0 && (
        <section class="card">
          <div class="row">
            <h3 class="section-title">Per month</h3>
            <div class="seg">
              <button class={measure === 'cost' ? 'on' : ''} onClick={() => setMeasure('cost')}>Cost</button>
              <button class={measure === 'kwh' ? 'on' : ''} onClick={() => setMeasure('kwh')}>kWh</button>
            </div>
          </div>
          <MonthChart months={m.months.slice(-12)} measure={measure} />
          {m.undated > 0 && (
            <p class="muted small">Includes {m.undated} {m.undated === 1 ? 'charge' : 'charges'} without a date, placed by {m.undated === 1 ? 'its' : 'their'} position in your log.</p>
          )}
        </section>
      )}

      {m.byLocation.length > 1 && (
        <section class="card">
          <h3 class="section-title">Where you charge</h3>
          <ul class="bars">
            {m.byLocation.map((l) => (
              <li>
                <div class="row"><span>{l.name}</span><span class="muted small">{num(l.kwh, 0, 'kWh')} · {money(l.cost)} · {l.count}×</span></div>
                <div class="bar-track"><div class="bar-fill" style={{ width: `${(l.kwh / (m.kwh || 1)) * 100}%` }} /></div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <details class="card">
        <summary>Monthly table</summary>
        <table class="table">
          <thead><tr><th>Month</th><th>Charges</th><th>kWh</th><th>Cost</th><th>per kWh</th></tr></thead>
          <tbody>
            {[...m.months].reverse().map((p) => (
              <tr><td>{p.month}</td><td>{p.count}</td><td>{num(p.kwh, 1)}</td><td>{money(p.cost)}</td><td>{p.kwh ? money(p.cost / p.kwh, 2, 4) : '–'}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function MonthChart(props: { months: MonthPoint[]; measure: 'cost' | 'kwh' }) {
  const [hover, setHover] = useState<number | null>(null);
  const { months, measure } = props;
  const vals = months.map((p) => p[measure]);
  const max = Math.max(...vals, 0) || 1;
  const W = 320;
  const H = 140;
  const gap = 4;
  const bw = Math.min(36, Math.max(4, (W - gap * (months.length - 1)) / months.length));
  const x0 = (W - (bw * months.length + gap * (months.length - 1))) / 2;
  const fmt = (v: number) => (measure === 'cost' ? money(v) : num(v, 1, 'kWh'));
  const label = (k: string) => {
    const [y, m] = k.split('-').map(Number);
    return new Date(y!, m! - 1, 1).toLocaleDateString(undefined, { month: 'short' });
  };
  const sel = hover ?? months.length - 1;
  const p = months[sel]!;
  return (
    <div class="chart">
      <div class="chart-readout">
        <span class="muted small">{new Date(p.month + '-01T00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
        <b>{fmt(p[measure])}</b>
        <span class="muted small">{p.count} {p.count === 1 ? 'charge' : 'charges'}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H + 18}`} role="img" aria-label={`${measure} per month`} onMouseLeave={() => setHover(null)}>
        <line x1="0" x2={W} y1={H} y2={H} class="axis" />
        {months.map((pt, i) => {
          const h = Math.max(pt[measure] > 0 ? 2 : 0, (pt[measure] / max) * (H - 8));
          const x = x0 + i * (bw + gap);
          const r = Math.min(4, bw / 2, h);
          return (
            <g onMouseEnter={() => setHover(i)} onClick={() => setHover(i)}>
              <rect x={x - gap / 2} y={0} width={bw + gap} height={H + 18} fill="transparent" />
              <path
                class={i === sel ? 'bar sel' : 'bar'}
                d={`M${x},${H} V${H - h + r} Q${x},${H - h} ${x + r},${H - h} H${x + bw - r} Q${x + bw},${H - h} ${x + bw},${H - h + r} V${H} Z`}
              />
              {(months.length <= 6 || i % 2 === (months.length - 1) % 2) && (
                <text x={x + bw / 2} y={H + 14} class="tick">{label(pt.month)}</text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/**
 * Best / typical / worst consumption from individual drives between charges, with the range
 * each implies on a full battery, and a strip of every measured drive.
 */
function ConsumptionRange(props: { stretches: Stretch[]; battery: number | null }) {
  const r = stretchRange(props.stretches);
  const [sel, setSel] = useState<number | null>(null);
  if (!r) {
    return (
      <section class="card">
        <h3 class="section-title">Consumption range</h3>
        <p class="muted small">
          Needs drives of {MIN_STRETCH_KM} km or more between two charges that both have the odometer, the end % of the
          first and the start % of the next.
        </p>
      </section>
    );
  }
  const cap = props.battery;
  const cols: [string, number][] = [['Best', r.min], ['Typical', r.median], ['Worst', r.max]];
  const lo = Math.floor(r.min - 1);
  const hi = Math.ceil(r.max + 1);
  const x = (v: number) => ((v - lo) / (hi - lo || 1)) * 100;
  const pick = sel != null ? props.stretches[sel] : null;
  // Stack dots that would overlap into rows (a light beeswarm) so every drive stays visible.
  const rowEnd: number[] = [];
  const rows: number[] = [];
  props.stretches
    .map((s, i) => ({ i, px: x(s.kwhPer100km) }))
    .sort((p, q) => p.px - q.px)
    .forEach(({ i, px }) => {
      let row = rowEnd.findIndex((end) => px - end >= 4.5);
      if (row < 0) row = rowEnd.push(-Infinity) - 1;
      rowEnd[row] = px;
      rows[i] = row;
    });
  const nRows = Math.max(1, rowEnd.length);
  function pickNearest(e: MouseEvent) {
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const v = lo + ((e.clientX - box.left) / box.width) * (hi - lo);
    let best = 0;
    props.stretches.forEach((s, i) => {
      if (Math.abs(s.kwhPer100km - v) < Math.abs(props.stretches[best]!.kwhPer100km - v)) best = i;
    });
    setSel(sel === best ? null : best);
  }
  return (
    <section class="card">
      <h3 class="section-title">Consumption range</h3>
      <div class="range-cols">
        {cols.map(([label, v]) => (
          <div>
            <span class="tile-label">{label}</span>
            <span class="range-value">{num(v, 1)}<small> kWh</small></span>
            <span class="tile-sub">
              {cap ? `${num((v / cap) * 100, 0)}% · ≈${num((cap / v) * 100, 0)} km range` : 'per 100 km'}
            </span>
          </div>
        ))}
      </div>
      <div
        class="strip"
        style={{ height: `${nRows * 14 + 22}px` }}
        role="img"
        aria-label={`${r.count} drives between ${num(r.min, 1)} and ${num(r.max, 1)} kWh per 100 km`}
        onClick={pickNearest}
      >
        <div class="strip-track" />
        <div class="strip-median" style={{ left: `${x(r.median)}%` }} />
        {props.stretches.map((s, i) => (
          <span
            class={sel === i ? 'strip-dot on' : 'strip-dot'}
            style={{ left: `${x(s.kwhPer100km)}%`, bottom: `${10 + rows[i]! * 14}px` }}
          />
        ))}
      </div>
      <div class="strip-axis"><span>{lo}</span><span>kWh / 100 km</span><span>{hi}</span></div>
      <p class="muted small">
        {pick
          ? `${num(pick.kwhPer100km, 1)} kWh/100 km: ${num(pick.km, 0)} km using ${num(pick.pct, 0)}% of the battery.`
          : `From ${r.count} drives between charges (${MIN_STRETCH_KM} km or more), using the battery % and odometer at each end. Tap a dot for details.`}
      </p>
    </section>
  );
}
