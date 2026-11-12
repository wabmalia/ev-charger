import { useState } from 'preact/hooks';
import { getState, remove, save, updateSettings } from './store';
import { uid, type Charge, type Meter } from './types';
import { Field, fromLocalInput, money, n2s, num, NumInput, parseNum, toLocalInput } from './ui';

export type Mode = 'start' | 'finish' | 'log' | 'edit';

const OTHER = '';

export function newCharge(): Charge {
  const { data, settings } = getState();
  const vehicles = data.vehicles.filter((v) => !v.deleted);
  const meters = data.meters.filter((m) => !m.deleted);
  const vehicleId = vehicles.find((v) => v.id === settings.lastVehicleId)?.id ?? vehicles[0]?.id ?? '';
  const meter = meters.find((m) => m.id === settings.lastMeterId) ?? meters[0] ?? null;
  return {
    id: uid(), updatedAt: 0, deleted: false, vehicleId, meterId: meter?.id ?? null, status: 'active',
    startedAt: Date.now(), endedAt: null, startPct: null, endPct: null,
    meterStart: meter?.lastReading ?? null, meterEnd: null, kwh: null, pricePerKwh: null, cost: null,
    odometerKm: null, location: '', notes: '',
  };
}

function lastOdometer(vehicleId: string): number | null {
  const list = getState().data.charges
    .filter((c) => !c.deleted && c.vehicleId === vehicleId && c.odometerKm != null)
    .sort((a, b) => b.startedAt - a.startedAt);
  return list[0]?.odometerKm ?? null;
}

export function ChargeForm(props: { mode: Mode; charge: Charge; onDone: () => void }) {
  const { data } = getState();
  const { mode } = props;
  const c0 = props.charge;
  const vehicles = data.vehicles.filter((v) => !v.deleted || v.id === c0.vehicleId);
  const meters = data.meters.filter((m) => !m.deleted || m.id === c0.meterId);

  const [vehicleId, setVehicleId] = useState(c0.vehicleId);
  const [meterId, setMeterId] = useState(c0.meterId ?? OTHER);
  const [location, setLocation] = useState(c0.location);
  const [startedAt, setStartedAt] = useState(toLocalInput(c0.startedAt));
  const [endedAt, setEndedAt] = useState(toLocalInput(c0.endedAt ?? (mode === 'finish' || mode === 'log' ? Date.now() : null)));
  const [startPct, setStartPct] = useState(n2s(c0.startPct));
  const [endPct, setEndPct] = useState(n2s(c0.endPct));
  const [meterStart, setMeterStart] = useState(n2s(c0.meterStart));
  const [meterEnd, setMeterEnd] = useState(n2s(c0.meterEnd));
  const [kwh, setKwh] = useState(n2s(c0.kwh));
  const [price, setPrice] = useState(n2s(c0.pricePerKwh));
  const [cost, setCost] = useState(n2s(c0.cost));
  const [odo, setOdo] = useState(n2s(c0.odometerKm));
  const [notes, setNotes] = useState(c0.notes);
  const [error, setError] = useState('');

  const meter: Meter | undefined = meters.find((m) => m.id === meterId);
  const vehicle = vehicles.find((v) => v.id === vehicleId);
  const showEnd = mode !== 'start';

  const ms = parseNum(meterStart);
  const me = parseNum(meterEnd);
  const meterKwh = ms != null && me != null && me >= ms ? Math.round((me - ms) * 1000) / 1000 : null;
  const sp = parseNum(startPct);
  const ep = parseNum(endPct);
  const batteryKwh = vehicle?.batteryKwh && sp != null && ep != null && ep > sp ? ((ep - sp) / 100) * vehicle.batteryKwh : null;
  const effKwh = parseNum(kwh) ?? meterKwh;
  // A finished charge keeps the rate it was saved with: the meter's current rate is only
  // suggested for new or in-progress charges, never applied when editing an old one.
  const defaultPrice = mode !== 'edit' || c0.status === 'active' ? (meter?.pricePerKwh ?? null) : null;
  const effPrice = parseNum(price) ?? defaultPrice;
  const computedCost = effKwh != null && effPrice != null ? effKwh * effPrice : null;
  const odoHint = lastOdometer(vehicleId);

  function pickMeter(id: string) {
    setMeterId(id);
    const m = meters.find((x) => x.id === id);
    if (m && !meterStart && m.lastReading != null) setMeterStart(String(m.lastReading));
  }

  function submit(e: Event) {
    e.preventDefault();
    const start = fromLocalInput(startedAt);
    const end = showEnd ? fromLocalInput(endedAt) : null;
    if (!vehicleId) return setError('Pick a car first.');
    if (start == null) return setError('Start time is required.');
    if (end != null && end < start) return setError('End time is before the start.');
    if (showEnd && ms != null && me != null && me < ms) return setError('Meter at end is lower than at start.');
    for (const [label, v] of [['Start %', sp], ['End %', ep]] as const) {
      if (v != null && (v < 0 || v > 100)) return setError(`${label} must be between 0 and 100.`);
    }
    const rec: Charge = {
      ...c0,
      vehicleId,
      meterId: meterId || null,
      location: meterId ? '' : location.trim(),
      startedAt: start,
      endedAt: end,
      status: mode === 'start' || (mode === 'edit' && c0.status === 'active' && end == null) ? 'active' : 'done',
      startPct: sp,
      endPct: showEnd ? ep : null,
      meterStart: ms,
      meterEnd: showEnd ? me : null,
      kwh: showEnd ? effKwh : null,
      pricePerKwh: showEnd ? effPrice : (parseNum(price) ?? null),
      cost: showEnd ? parseNum(cost) : null,
      odometerKm: parseNum(odo),
      notes: notes.trim(),
    };
    save('charges', rec);
    // Keep the electric board counter current.
    const reading = rec.meterEnd ?? rec.meterStart;
    if (meter && reading != null && (meter.lastReading == null || reading > meter.lastReading)) {
      save('meters', { ...meter, lastReading: reading });
    }
    updateSettings({ lastVehicleId: vehicleId, lastMeterId: meterId || null });
    props.onDone();
  }

  function del() {
    if (confirm('Delete this charge?')) {
      remove('charges', c0);
      props.onDone();
    }
  }

  return (
    <form class="form" onSubmit={submit}>
      <div class="grid">
        {vehicles.length > 1 && (
          <Field label="Car" wide>
            <select value={vehicleId} onChange={(e) => setVehicleId((e.target as HTMLSelectElement).value)}>
              {vehicles.map((v) => <option value={v.id}>{v.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Where" wide>
          <div class="chips">
            {meters.map((m) => (
              <button type="button" class={meterId === m.id ? 'chip on' : 'chip'} onClick={() => pickMeter(m.id)}>{m.name}</button>
            ))}
            <button type="button" class={meterId === OTHER ? 'chip on' : 'chip'} onClick={() => setMeterId(OTHER)}>Other / public</button>
          </div>
        </Field>
        {meterId === OTHER && (
          <Field label="Location" wide>
            <input value={location} placeholder="e.g. Supercharger, work, friend's" onInput={(e) => setLocation((e.target as HTMLInputElement).value)} />
          </Field>
        )}

        <Field label="Start %">
          <NumInput value={startPct} onInput={setStartPct} placeholder="20" autoFocus={mode === 'start'} />
        </Field>
        {showEnd && (
          <Field label="End %">
            <NumInput value={endPct} onInput={setEndPct} placeholder="80" autoFocus={mode === 'finish'} />
          </Field>
        )}

        {meterId !== OTHER && (
          <>
            <Field label="Meter at start" hint={meter?.lastReading != null ? `last: ${num(meter.lastReading, 2)}` : undefined}>
              <NumInput value={meterStart} onInput={setMeterStart} placeholder="kWh" />
            </Field>
            {showEnd && (
              <Field label="Meter at end">
                <NumInput value={meterEnd} onInput={setMeterEnd} placeholder="kWh" />
              </Field>
            )}
          </>
        )}

        {showEnd && (
          <>
            <Field
              label="kWh charged"
              hint={meterKwh != null ? 'from meter readings' : batteryKwh != null ? `≈ ${num(batteryKwh)} kWh into the battery` : undefined}
            >
              <NumInput value={kwh} onInput={setKwh} placeholder={meterKwh != null ? String(meterKwh) : 'kWh'} />
            </Field>
            <Field label="Price / kWh" hint={defaultPrice != null && !price ? 'current meter rate' : undefined}>
              <NumInput value={price} onInput={setPrice} placeholder={defaultPrice != null ? String(defaultPrice) : '0.00'} />
            </Field>
            <Field label="Total cost" hint={cost ? 'overrides kWh × price' : 'leave empty to compute'}>
              <NumInput value={cost} onInput={setCost} placeholder={computedCost != null ? computedCost.toFixed(2) : '0.00'} />
            </Field>
          </>
        )}

        <Field label="Odometer (km)" hint={odoHint != null ? `last: ${num(odoHint, 0)}` : undefined}>
          <NumInput value={odo} onInput={setOdo} placeholder="optional" />
        </Field>

        <Field label="Started">
          <input type="datetime-local" value={startedAt} onInput={(e) => setStartedAt((e.target as HTMLInputElement).value)} />
        </Field>
        {showEnd && (
          <Field label="Finished">
            <input type="datetime-local" value={endedAt} onInput={(e) => setEndedAt((e.target as HTMLInputElement).value)} />
          </Field>
        )}

        <Field label="Notes" wide>
          <input value={notes} onInput={(e) => setNotes((e.target as HTMLInputElement).value)} placeholder="optional" />
        </Field>
      </div>

      {showEnd && (
        <p class="summary">
          {num(effKwh, 2, 'kWh')} · {money(parseNum(cost) ?? computedCost)}
        </p>
      )}
      {error && <p class="error">{error}</p>}
      <div class="actions">
        {mode === 'edit' && <button type="button" class="ghost danger" onClick={del}>Delete</button>}
        <button type="submit" class="primary">
          {mode === 'start' ? 'Start charging' : mode === 'finish' ? 'Finish charge' : 'Save'}
        </button>
      </div>
    </form>
  );
}

