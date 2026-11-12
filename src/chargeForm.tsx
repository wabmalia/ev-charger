import { useState } from 'preact/hooks';
import { getState, remove, save, updateSettings } from './store';
import { sortKey, uid, type Charge, type Meter } from './types';
import { combineWhen, toDateInput, toTimeInput } from './when';
import { currencySymbol, Field, money, n2s, num, NumInput, parseNum } from './ui';

export type Mode = 'start' | 'finish' | 'log' | 'edit';

const OTHER = '';

export function newCharge(): Charge {
  const { data, settings } = getState();
  const vehicles = data.vehicles.filter((v) => !v.deleted);
  const meters = data.meters.filter((m) => !m.deleted);
  const vehicleId = vehicles.find((v) => v.id === settings.lastVehicleId)?.id ?? vehicles[0]?.id ?? '';
  const meter = meters.find((m) => m.id === settings.lastMeterId) ?? meters[0] ?? null;
  const now = Date.now();
  return {
    id: uid(), updatedAt: 0, deleted: false, vehicleId, meterId: meter?.id ?? null, status: 'active',
    startedAt: now, sortAt: now, endedAt: null, startPct: null, endPct: null,
    meterStart: meter ? previousMeterEnd(meter.id) : null, meterEnd: null, kwh: null, pricePerKwh: null, cost: null,
    odometerKm: null, location: '', notes: '',
  };
}

/** Where the meter should be now: the end reading of its latest charge, else its last known reading. */
export function previousMeterEnd(meterId: string, exceptId?: string): number | null {
  const { data } = getState();
  const last = data.charges
    .filter((c) => !c.deleted && c.meterId === meterId && c.meterEnd != null && c.id !== exceptId)
    .sort((a, b) => sortKey(b) - sortKey(a))[0];
  return last?.meterEnd ?? data.meters.find((m) => m.id === meterId)?.lastReading ?? null;
}

function lastOdometer(vehicleId: string): number | null {
  const list = getState().data.charges
    .filter((c) => !c.deleted && c.vehicleId === vehicleId && c.odometerKm != null)
    .sort((a, b) => sortKey(b) - sortKey(a));
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
  // "When": one date plus optional start/end times. Finishing defaults the end time to now;
  // logging a past charge defaults to today with no times.
  const [date, setDate] = useState(toDateInput(c0.startedAt ?? (mode === 'log' ? Date.now() : null)));
  const [tStart, setTStart] = useState(mode === 'log' ? '' : toTimeInput(c0.startedAt));
  const [tEnd, setTEnd] = useState(toTimeInput(c0.endedAt ?? (mode === 'finish' ? Date.now() : null)));
  const [showNotes, setShowNotes] = useState(!!c0.notes);
  const [startPct, setStartPct] = useState(n2s(c0.startPct));
  const [endPct, setEndPct] = useState(n2s(c0.endPct));
  const [meterStart, setMeterStart] = useState(n2s(c0.meterStart));
  const [meterEnd, setMeterEnd] = useState(n2s(c0.meterEnd));
  const [kwh, setKwh] = useState(n2s(c0.kwh));
  const [price, setPrice] = useState(n2s(c0.pricePerKwh));
  const [cost, setCost] = useState(n2s(c0.cost));
  // Meters are always billed per kWh. Public chargers often just give a total, so they get a
  // toggle defaulting to Total (also shown for older meter charges that were saved with a total).
  const [toggleMode, setToggleMode] = useState<'kwh' | 'total'>(
    c0.cost == null && c0.pricePerKwh != null && mode === 'edit' ? 'kwh' : 'total',
  );
  const [odo, setOdo] = useState(n2s(c0.odometerKm));
  const [notes, setNotes] = useState(c0.notes);
  const [error, setError] = useState('');

  const meter: Meter | undefined = meters.find((m) => m.id === meterId);
  const vehicle = vehicles.find((v) => v.id === vehicleId);
  const showEnd = mode !== 'start';
  const willBeActiveNow = mode === 'edit' && c0.status === 'active';
  // Overnight charges: an end time earlier than the start rolls over to the next day.
  const preview = combineWhen(date, tStart, tEnd);
  const endsNextDay = preview.startedAt != null && preview.endedAt != null && toDateInput(preview.endedAt) !== date;
  const showToggle = meterId === OTHER || c0.cost != null;
  const priceMode = showToggle ? toggleMode : 'kwh';
  const cur = currencySymbol();

  // Meter readings only apply while a meter is selected (they stay in the inputs if you switch back).
  const onMeter = meterId !== OTHER;
  const ms = onMeter ? parseNum(meterStart) : null;
  const me = onMeter ? parseNum(meterEnd) : null;
  const meterKwh = ms != null && me != null && me >= ms ? Math.round((me - ms) * 1000) / 1000 : null;
  const sp = parseNum(startPct);
  const ep = parseNum(endPct);
  const batteryKwh = vehicle?.batteryKwh && sp != null && ep != null && ep > sp ? ((ep - sp) / 100) * vehicle.batteryKwh : null;
  // With meter readings kWh is just end - start; the field is for chargers without a meter
  // (and old records that only have a kWh figure).
  const showKwhField = meterId === OTHER || (c0.kwh != null && c0.meterEnd == null && mode === 'edit');
  const effKwh = showKwhField ? (parseNum(kwh) ?? meterKwh) : meterKwh;
  // A finished charge keeps the rate it was saved with: the meter's current rate is only
  // suggested for new or in-progress charges, never applied when editing an old one.
  const defaultPrice = mode !== 'edit' || c0.status === 'active' ? (meter?.pricePerKwh ?? null) : null;
  const effPrice = parseNum(price) ?? defaultPrice;
  const total = parseNum(cost);
  const effCost = priceMode === 'total' ? total : effKwh != null && effPrice != null ? effKwh * effPrice : null;
  const odoHint = lastOdometer(vehicleId);
  const prevEnd = meterId ? previousMeterEnd(meterId, c0.id) : null;
  const kwhShown = showEnd && showKwhField;

  // Required fields (marked *). Save stays disabled until they're filled.
  const needsStart = mode === 'start' || willBeActiveNow;
  const needsMeter = showEnd && meterId !== OTHER && !showKwhField;
  const missing = (() => {
    const m: string[] = [];
    if (!vehicleId) m.push('a car');
    if (needsStart && !date) m.push('start date');
    if (needsStart && !tStart) m.push('start time');
    if (needsMeter && ms == null) m.push('meter at start');
    if (needsMeter && me == null) m.push('meter at end');
    if (showEnd && showKwhField && effKwh == null) m.push('kWh charged');
    return m.length ? m.join(', ') : '';
  })();

  function pickMeter(id: string) {
    if (id === meterId) return;
    setMeterId(id);
    if (id && mode !== 'edit') setMeterStart(n2s(previousMeterEnd(id, c0.id)));
  }

  function submit(e: Event) {
    e.preventDefault();
    const when = combineWhen(date, tStart, showEnd ? tEnd : '');
    const start = when.startedAt;
    const end = when.endedAt;
    if (!vehicleId) return setError('Pick a car first.');
    const willBeActive = mode === 'start' || (mode === 'edit' && c0.status === 'active' && end == null);
    // Dates are optional for logged charges; a running charge needs its start for the timer.
    if (start == null && willBeActive) return setError('A running charge needs its start time.');
    if (start != null && end != null && end < start) return setError('End time is before the start.');
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
      // Keep an undated charge where it was in the sequence (or "now" for a new one).
      sortAt: start ?? end ?? c0.sortAt,
      endedAt: end,
      status: willBeActive ? 'active' : 'done',
      startPct: sp,
      endPct: showEnd ? ep : null,
      meterStart: ms,
      meterEnd: showEnd ? me : null,
      kwh: showEnd ? effKwh : null,
      pricePerKwh: showEnd && priceMode === 'kwh' ? effPrice : null,
      cost: showEnd && priceMode === 'total' ? total : null,
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
            <button type="button" class={meterId === OTHER ? 'chip on' : 'chip'} onClick={() => pickMeter(OTHER)}>Other / public</button>
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
            <Field label="Meter at start" required={needsMeter} hint={prevEnd != null ? `prev ${num(prevEnd, 2)}` : undefined}>
              <NumInput value={meterStart} onInput={setMeterStart} placeholder="kWh" />
            </Field>
            {showEnd && (
              <Field label="Meter at end" required={needsMeter} hint={meterKwh != null ? `= ${num(meterKwh, 2)} kWh` : undefined}>
                <NumInput value={meterEnd} onInput={setMeterEnd} placeholder="kWh" />
              </Field>
            )}
          </>
        )}

        {showEnd && (
          <>
            {showKwhField && (
              <Field
                label="kWh charged"
                required={showEnd}
                hint={batteryKwh != null ? `≈ ${num(batteryKwh)} in battery` : undefined}
              >
                <NumInput value={kwh} onInput={setKwh} placeholder={meterKwh != null ? String(meterKwh) : 'kWh'} />
              </Field>
            )}
            </>
        )}
        <Field label="Odometer (km)" wide={!kwhShown && showToggle} hint={odoHint != null ? `last: ${num(odoHint, 0)}` : undefined}>
          <NumInput value={odo} onInput={setOdo} placeholder="km" />
        </Field>
        {showEnd && (
          <>
            <Field
              label="Price"
              wide={showToggle}
              hint={priceMode === 'total' ? 'total paid' : defaultPrice != null && !price ? 'meter rate' : undefined}
            >
              <div class="price-row">
                {priceMode === 'kwh' ? (
                  <NumInput value={price} onInput={setPrice} placeholder={defaultPrice != null ? String(defaultPrice) : '0.00'} />
                ) : (
                  <NumInput value={cost} onInput={setCost} placeholder="0.00" />
                )}
                {showToggle ? (
                  <div class="seg" role="group" aria-label="Price type">
                    {(['total', 'kwh'] as const).map((pm) => (
                      <button type="button" class={priceMode === pm ? 'on' : ''} aria-pressed={priceMode === pm} onClick={() => setToggleMode(pm)}>
                        {pm === 'kwh' ? `${cur}/kWh` : `${cur} Total`}
                      </button>
                    ))}
                  </div>
                ) : (
                  <span class="unit">{cur}/kWh</span>
                )}
              </div>
            </Field>
          </>
        )}

        <div class={showEnd ? 'when wide' : 'when two wide'}>
          <Field label="Start date" required={needsStart}>
            <input type="date" value={date} onInput={(e) => setDate((e.target as HTMLInputElement).value)} />
          </Field>
          <Field label="Start time" required={needsStart}>
            <input type="time" value={tStart} onInput={(e) => setTStart((e.target as HTMLInputElement).value)} />
          </Field>
          {showEnd && (
            <Field label="End time" hint={endsNextDay ? 'next day' : undefined}>
              <input type="time" value={tEnd} onInput={(e) => setTEnd((e.target as HTMLInputElement).value)} />
            </Field>
          )}
        </div>

        {showNotes ? (
          <Field label="Notes" wide>
            <input value={notes} onInput={(e) => setNotes((e.target as HTMLInputElement).value)} autoFocus={!c0.notes} />
          </Field>
        ) : (
          <button type="button" class="link left wide" onClick={() => setShowNotes(true)}>+ Add note</button>
        )}
      </div>

      {showEnd && (
        <p class="summary">
          {num(effKwh, 2, 'kWh')} · {money(effCost)}
          {priceMode === 'total' && effCost != null && effKwh ? (
            <span class="muted small"> ({money(effCost / effKwh, 2, 4)}/kWh)</span>
          ) : null}
        </p>
      )}
      {error && <p class="error">{error}</p>}
      <div class="actions">
        {mode === 'edit' && <button type="button" class="ghost danger" onClick={del}>Delete</button>}
        {missing && <span class="muted small missing">Needs {missing}</span>}
        <button type="submit" class="primary" disabled={!!missing}>
          {mode === 'start' ? 'Start charging' : mode === 'finish' ? 'Finish charge' : 'Save'}
        </button>
      </div>
    </form>
  );
}

