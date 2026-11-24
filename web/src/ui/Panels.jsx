import { useEffect, useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, ReferenceArea, ResponsiveContainer, Tooltip } from 'recharts';
import * as T from '../data/transport.js';
import { outOfRange } from '../data/defaults.js';
import { READINGS, clarityWord, describeEvent, dayLabel, timeOfDay, since } from './words.js';
import { useTween } from './hooks.js';

// ---------- Readings ----------
const SCALE = { ph: [4, 10], tempC: [15, 35], turbidityNTU: [0, 200] };

function Reading({ r, value, safe }) {
  const tw = useTween(value);
  const shown = Number.isFinite(tw) ? tw : value;
  const state = outOfRange(r.key, value, safe);
  const range = safe?.[r.key] || {};
  const [lo, hi] = SCALE[r.key];
  const pct = (v) => `${Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100))}%`;
  const bandLo = range.min ?? lo, bandHi = range.max ?? hi;
  const isClarity = r.key === 'turbidityNTU';
  const tone = value == null ? 'none' : state ? 'warn' : 'good';
  return (
    <article className={`reading tone-${tone}`}>
      <h3>{r.card}</h3>
      <p className={`reading-value ${isClarity ? 'is-word' : ''}`}>
        {value == null ? '—' : isClarity ? clarityWord(value, range.max) : Number(shown).toFixed(r.digits)}
        {!isClarity && value != null && <span className="reading-unit">{r.unit === 'pH' ? ' pH' : ` ${r.unit}`}</span>}
      </p>
      <p className="reading-state">
        {value == null ? 'No reading yet' : state ? 'Needs attention' : 'Healthy'}
      </p>
      <div className="gauge" role="img" aria-label={`${r.name}: healthy range ${bandLo} to ${bandHi}`}>
        <span className="gauge-band" style={{ left: pct(bandLo), width: `calc(${pct(bandHi)} - ${pct(bandLo)})` }} />
        {value != null && <span className="gauge-dot" style={{ left: pct(shown) }} />}
      </div>
      <p className="fine gauge-legend">
        {isClarity && value != null ? `${Math.round(value)} NTU now, limit ${range.max ?? '—'}` : <>Healthy: {range.min != null && range.max != null ? `${range.min} to ${range.max}` : range.max != null ? `under ${range.max}` : `above ${range.min}`} {r.unit}</>}
      </p>
    </article>
  );
}

export function Readings({ latest, safe }) {
  return (
    <section className="readings" aria-label="Water readings">
      {READINGS.map((r) => <Reading key={r.key} r={r} value={latest?.[r.key]} safe={safe} />)}
    </section>
  );
}

// ---------- Actions ----------
export function Actions({ status, online, feedPulse, toast }) {
  const [feedWait, setFeedWait] = useState(null);   // timestamp of click
  const [pumpWant, setPumpWant] = useState(null);   // desired pump state
  const pumpOn = !!status?.pumpOn;

  useEffect(() => { if (feedWait && feedPulse && feedPulse.at >= feedWait) setFeedWait(null); }, [feedPulse, feedWait]);
  useEffect(() => { if (pumpWant !== null && pumpOn === pumpWant) setPumpWant(null); }, [pumpOn, pumpWant]);
  useEffect(() => {
    if (!feedWait) return;
    const t = setTimeout(() => { setFeedWait(null); toast('AquaNode didn’t confirm the feeding. Check that it’s online.'); }, 12000);
    return () => clearTimeout(t);
  }, [feedWait]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (pumpWant === null) return;
    const t = setTimeout(() => { setPumpWant(null); toast('AquaNode didn’t confirm the pump change. Check that it’s online.'); }, 12000);
    return () => clearTimeout(t);
  }, [pumpWant]); // eslint-disable-line react-hooks/exhaustive-deps

  const feed = async () => { setFeedWait(Date.now()); await T.sendCommand('feed_now'); };
  const pump = async () => { const want = !pumpOn; setPumpWant(want); await T.sendCommand(want ? 'pump_on' : 'pump_off'); };

  return (
    <section className="actions" aria-label="Controls">
      <button className="action action-feed" onClick={feed} disabled={!!feedWait}>
        <span className="action-title">{feedWait ? 'Feeding…' : 'Feed the fish'}</span>
        <span className="action-sub">
          {feedWait ? 'Waiting for the feeder to turn' : status?.lastFeedTs ? `Last fed ${since(status.lastFeedTs)}` : 'Drops one portion of food now'}
        </span>
      </button>
      <button className={`action action-pump ${pumpOn ? 'is-running' : ''}`} onClick={pump} disabled={pumpWant !== null} aria-pressed={pumpOn}>
        <span className="action-title">
          {pumpWant !== null ? (pumpWant ? 'Starting pump…' : 'Stopping pump…') : pumpOn ? 'Stop the pump' : 'Start the pump'}
        </span>
        <span className="action-sub">{pumpOn ? 'Water is flowing to the plants' : 'The pump is resting'}</span>
      </button>
      {!online && <p className="actions-note">AquaNode is offline. Buttons work again once it reconnects; requests older than 5 minutes are dropped.</p>}
    </section>
  );
}

// ---------- Timeline ----------
const dur = (ms) => { const s = Math.round(ms / 1000); return s < 90 ? `${s} seconds` : `${Math.round(s / 60)} minutes`; };

// Collapse "pump on" + "pump off" into one line so the list stays readable.
function mergeEvents(events) {
  const out = [];
  let open = null;
  for (const e of events) {               // oldest -> newest
    if (e.type === 'pump_on') {
      if (open) continue;                 // already running: ignore repeated "start"
      open = { ...e, kind: 'pump' }; out.push(open); continue;
    }
    if (e.type === 'pump_off') {
      if (!open) continue;                // stop without a known start: nothing useful to show
      open.text = `${open.reason === 'manual' ? 'You ran the water pump' : 'The water pump ran'} for ${dur(e.ts - open.ts)}`;
      open = null; continue;
    }
    out.push({ ...e, ...describeEvent(e) });
  }
  if (open) open.text = open.reason === 'manual' ? 'You started the water pump. It is running now' : 'The water pump is running now';
  return out;
}

export function Timeline({ events, now }) {
  const [all, setAll] = useState(false);
  const merged = useMemo(() => mergeEvents(events).reverse(), [events]);
  const shown = all ? merged : merged.slice(0, 8);
  const groups = useMemo(() => {
    const out = [];
    shown.forEach((e) => {
      const label = dayLabel(e.ts, now);
      if (!out.length || out.at(-1).label !== label) out.push({ label, items: [] });
      out.at(-1).items.push(e);
    });
    return out;
  }, [shown, now]);
  return (
    <section className="panel timeline">
      <h2>What AquaNode has been doing</h2>
      {!merged.length && <p className="empty">Nothing yet. Feed the fish or start the pump and it shows up here.</p>}
      {groups.map((g) => (
        <div key={g.label}>
          <h3 className="day">{g.label}</h3>
          <ol>
            {g.items.map((e) => (
              <li key={e.id} className={`ev ev-${e.kind}`}>
                <time>{timeOfDay(e.ts)}</time>
                <span>{e.text}</span>
              </li>
            ))}
          </ol>
        </div>
      ))}
      {merged.length > 8 && <button type="button" className="more" onClick={() => setAll(!all)}>{all ? 'Show less' : `Show earlier (${merged.length - 8})`}</button>}
    </section>
  );
}

// ---------- History ----------
const STROKE = { ph: '#C9A3DA', tempC: '#E8B04A', turbidityNTU: '#6FC3C9' };
export function History({ readings, safe, intervalSec = 10 }) {
  const [key, setKey] = useState('ph');
  const r = READINGS.find((x) => x.key === key);
  const range = safe?.[key] || {};
  const data = [];
  const clean = [...new Map(readings.filter((x) => x[key] != null && x.ts).map((x) => [x.ts, x])).values()].sort((a, b) => a.ts - b.ts);
  clean.forEach((x, i, arr) => {
    // break the line where the device was off, instead of drawing a fake flat stretch
    if (i && x.ts - arr[i - 1].ts > intervalSec * 3000 + 5000) data.push({ ts: arr[i - 1].ts + 1, v: null });
    data.push({ ts: x.ts, v: x[key] });
  });
  const vals = data.map((d) => d.v).filter((v) => v != null);
  const lo0 = Math.min(...vals, range.min ?? Infinity), hi0 = Math.max(...vals, range.max ?? -Infinity);
  const pad = Math.max((hi0 - lo0) * 0.4, key === 'ph' ? 0.3 : key === 'tempC' ? 1 : 5);
  const domain = [Math.max(0, +(lo0 - pad).toFixed(1)), +(hi0 + pad).toFixed(1)];
  const ticks = [...new Set([domain[0], range.min, range.min != null && range.max != null ? +((range.min + range.max) / 2).toFixed(r.digits) : null, range.max, domain[1]].filter((v) => v != null && v >= domain[0] && v <= domain[1]))].sort((a, b) => a - b);
  return (
    <section className="panel history">
      <div className="panel-head">
        <h2>Water over time</h2>
        <div className="tabs" role="tablist" aria-label="Choose a reading" onKeyDown={(e) => {
          if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
          const i = READINGS.findIndex((x) => x.key === key);
          const n = READINGS[(i + (e.key === 'ArrowRight' ? 1 : READINGS.length - 1)) % READINGS.length];
          setKey(n.key);
          e.currentTarget.querySelector(`[data-k="${n.key}"]`)?.focus();
        }}>
          {READINGS.map((x) => (
            <button key={x.key} data-k={x.key} tabIndex={key === x.key ? 0 : -1} role="tab" aria-selected={key === x.key} className={key === x.key ? 'is-on' : ''} onClick={() => setKey(x.key)}>{x.name}</button>
          ))}
        </div>
      </div>
      <p className="hint">{r.hint}</p>
      {vals.length < 2 ? <p className="empty">The chart fills in as readings arrive.</p> : (
        <div className="chart" role="img" aria-label={`${r.name} over time. The green band is the healthy range.`}>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }} accessibilityLayer={false}>
              <defs>
                <linearGradient id={`g-${key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={STROKE[key]} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={STROKE[key]} stopOpacity={0} />
                </linearGradient>
              </defs>
              <ReferenceArea y1={range.min ?? 0} y2={range.max} fill="#7FB069" fillOpacity={0.12} ifOverflow="hidden" />
              <XAxis dataKey="ts" type="number" domain={['dataMin', 'dataMax']} tickFormatter={timeOfDay} stroke="#8DA39A" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} minTickGap={48} tickMargin={8} />
              <YAxis stroke="#8DA39A" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} domain={domain} ticks={ticks} width={52} tickMargin={6} allowDecimals tickFormatter={(v) => +v.toFixed(r.digits)} />
              <Tooltip
                labelFormatter={(ts) => timeOfDay(ts)}
                formatter={(v) => [`${Number(v).toFixed(r.digits)} ${r.unit}`, r.name]}
                contentStyle={{ background: '#22302D', border: '1px solid #33453F', borderRadius: 10, color: '#EEF3EA' }}
              />
              <Area type="monotone" dataKey="v" stroke={STROKE[key]} strokeWidth={2.5} fill={`url(#g-${key})`} isAnimationActive={false} connectNulls={false} />
            </AreaChart>
          </ResponsiveContainer>
          <p className="fine">The green band is the healthy range. Gaps mean AquaNode was off.</p>
        </div>
      )}
    </section>
  );
}

// ---------- Settings, written as sentences ----------
const PORTIONS = [{ label: 'Small', deg: 45 }, { label: 'Medium', deg: 90 }, { label: 'Large', deg: 135 }];

function Num({ value, onChange, label, step = 'any', min, max, width = 3.5 }) {
  return (
    <input className="inline-num" type="number" inputMode="decimal" aria-label={label} step={step} min={min} max={max}
      style={{ width: `${width}ch` }} value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} />
  );
}

export function SettingsSentences({ settings, toast }) {
  const [draft, setDraft] = useState(null);
  const s = draft ?? settings;
  const set = (path, value) => {
    const next = structuredClone(s);
    const keys = path.split('.');
    let o = next;
    keys.slice(0, -1).forEach((k) => { o = o[k] ??= {}; });
    o[keys.at(-1)] = value;
    setDraft(next);
  };
  const times = Array.isArray(s.feed.times) ? s.feed.times : [];
  const save = async () => {
    const clean = { ...s, feed: { ...s.feed, times: [...new Set(times.filter(Boolean))].sort() } };
    await T.saveSettings(clean);
    setDraft(null);
    toast('Changes saved. AquaNode picks them up within 15 seconds.');
  };
  const portion = PORTIONS.reduce((a, p) => (Math.abs(p.deg - s.feed.sweepDeg) < Math.abs(a.deg - s.feed.sweepDeg) ? p : a));

  return (
    <section className="panel settings">
      <h2>How AquaNode looks after your tank</h2>
      <p className="hint">Tap any highlighted value to change it. Nothing changes on the device until you save.</p>

      <div className="rule">
        <h3>Water pump</h3>
        <p>
          <Toggle on={s.pump.enabled} onChange={(v) => set('pump.enabled', v)} label="Run the pump automatically" />{' '}
          {s.pump.enabled ? <>Run the pump for <Num value={s.pump.onMin} onChange={(v) => set('pump.onMin', v)} label="Minutes the pump runs" min={0} /> minutes, then rest for <Num value={s.pump.offMin} onChange={(v) => set('pump.offMin', v)} label="Minutes the pump rests" min={0} /> minutes.</>
            : <>The pump only runs when you start it.</>}
        </p>
      </div>

      <div className="rule">
        <h3>Feeding</h3>
        <p>
          <Toggle on={s.feed.enabled} onChange={(v) => set('feed.enabled', v)} label="Feed automatically" />{' '}
          {s.feed.enabled ? 'Feed the fish every day at' : 'Automatic feeding is off.'}
        </p>
        {s.feed.enabled && (
          <div className="times">
            {times.map((t, i) => (
              <span className="time-chip" key={i}>
                <input type="time" value={t} aria-label={`Feeding time ${i + 1}`} onChange={(e) => set('feed.times', times.map((x, j) => (j === i ? e.target.value : x)))} />
                <button type="button" aria-label={`Remove ${t}`} onClick={() => set('feed.times', times.filter((_, j) => j !== i))}>×</button>
              </span>
            ))}
            {times.length < 8 && <button type="button" className="add-time" onClick={() => set('feed.times', [...times, '12:00'])}>Add a time</button>}
          </div>
        )}
        <p>
          Give a{' '}
          <span className="segmented" role="radiogroup" aria-label="Food portion">
            {PORTIONS.map((p) => (
              <button type="button" role="radio" aria-checked={portion.label === p.label} key={p.label} className={portion.label === p.label ? 'is-on' : ''} onClick={() => set('feed.sweepDeg', p.deg)}>{p.label}</button>
            ))}
          </span>{' '}
          portion each time.
        </p>
        <p>
          <Toggle on={s.feed.skipIfTurbid} onChange={(v) => set('feed.skipIfTurbid', v)} label="Skip feeding when the water is cloudy" />{' '}
          Skip feeding when the water is cloudy, so leftover food doesn’t make it worse.
        </p>
      </div>

      <div className="rule">
        <h3>Healthy ranges</h3>
        <p>Warn me if acidity leaves <Num value={s.safe.ph?.min} onChange={(v) => set('safe.ph.min', v)} label="Lowest healthy pH" step="0.1" /> to <Num value={s.safe.ph?.max} onChange={(v) => set('safe.ph.max', v)} label="Highest healthy pH" step="0.1" /> pH.</p>
        <p>Warn me if the water is colder than <Num value={s.safe.tempC?.min} onChange={(v) => set('safe.tempC.min', v)} label="Lowest healthy temperature" step="0.5" /> °C or warmer than <Num value={s.safe.tempC?.max} onChange={(v) => set('safe.tempC.max', v)} label="Highest healthy temperature" step="0.5" /> °C.</p>
        <p>Call the water cloudy above <Num value={s.safe.turbidityNTU?.max} onChange={(v) => set('safe.turbidityNTU.max', v)} label="Cloudiness limit in NTU" width={4.5} /> NTU <span className="fine">(a measure of cloudiness; tap water is under 5)</span>.</p>
      </div>

      <div className="rule">
        <h3>Checking the water</h3>
        <p>Check the water every <Num value={s.readingIntervalSec} onChange={(v) => set('readingIntervalSec', v)} label="Seconds between readings" min={2} /> seconds.</p>
      </div>

      <div className={`savebar ${draft ? 'is-dirty' : ''}`} aria-hidden={!draft}>
        <span>You have unsaved changes.</span>
        <button type="button" className="ghost" onClick={() => setDraft(null)} tabIndex={draft ? 0 : -1}>Discard</button>
        <button type="button" className="primary" onClick={save} tabIndex={draft ? 0 : -1}>Save changes</button>
      </div>
    </section>
  );
}

function Toggle({ on, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={!!on} aria-label={label} className={`toggle ${on ? 'is-on' : ''}`} onClick={() => onChange(!on)}>
      <span />
    </button>
  );
}
