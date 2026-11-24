import { useEffect, useState } from 'react';
import { LineChart, Line, YAxis, ReferenceArea, ResponsiveContainer, Tooltip } from 'recharts';
import * as T from './data/transport.js';
import { DEFAULT_SETTINGS, METRICS, outOfRange } from './data/defaults.js';

// ---------- helpers ----------
function useSub(subscribe, deps = []) {
  const [v, setV] = useState(null);
  useEffect(() => subscribe(setV), deps); // eslint-disable-line react-hooks/exhaustive-deps
  return v;
}
function useNow(ms = 5000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}
const ago = (ts, now) => {
  if (!ts) return '—';
  const s = Math.max(0, Math.round((now - ts) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`;
};
const clock = (ts) => new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const labelOf = (k) => METRICS.find((m) => m.key === k)?.label ?? k;

// ---------- app ----------
export default function App() {
  const [user, setUser] = useState(undefined);
  useEffect(() => T.onAuth(setUser), []);
  if (user === undefined) return <div className="center muted">Loading…</div>;
  return user ? <Dashboard user={user} /> : <Login />;
}

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    try { await T.signIn(email, password); } catch (x) { setErr(x.code?.replace('auth/', '') || x.message); }
  };
  return (
    <form className="login card" onSubmit={submit}>
      <h1>AquaNode</h1>
      <p className="muted">Aquaponics balancer · sign in</p>
      <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      {err && <p className="bad">{err}</p>}
      <button className="primary">Sign in</button>
    </form>
  );
}

function Dashboard({ user }) {
  const now = useNow();
  const status = useSub(T.subscribeStatus);
  const latest = useSub(T.subscribeLatest);
  const settingsRaw = useSub(T.subscribeSettings);
  const readings = useSub((cb) => T.subscribeReadings(180, cb)) ?? [];
  const alerts = useSub((cb) => T.subscribeAlerts(20, cb)) ?? [];
  const events = useSub((cb) => T.subscribeEvents(30, cb)) ?? [];
  const settings = { ...DEFAULT_SETTINGS, ...(settingsRaw || {}) };

  const staleAfter = (settings.readingIntervalSec * 3 + 5) * 1000;
  const online = status?.online && now - (status.lastSeen || 0) < staleAfter;

  return (
    <div className="wrap">
      <header>
        <div>
          <h1>AquaNode</h1>
          <span className={`pill ${online ? 'ok' : 'bad'}`}>{online ? 'Online' : 'Offline'}</span>
          <span className="muted small"> last seen {ago(status?.lastSeen, now)}</span>
        </div>
        <div className="small muted">
          {user.email} · <button className="link" onClick={T.signOut}>Sign out</button>
        </div>
      </header>

      <section className="grid3">
        {METRICS.map((m) => (
          <MetricTile key={m.key} m={m} value={latest?.[m.key]} readings={readings} safe={settings.safe} extra={m.key === 'turbidityNTU' && latest?.turbidityV != null ? `${latest.turbidityV} V` : null} />
        ))}
      </section>

      <section className="grid2">
        <Controls status={status} online={online} now={now} />
        <Alerts alerts={alerts} />
      </section>

      <section className="grid2">
        <SettingsForm settings={settings} />
        <Events events={events} />
      </section>
    </div>
  );
}

function MetricTile({ m, value, readings, safe, extra }) {
  const state = outOfRange(m.key, value, safe);
  const range = safe?.[m.key] || {};
  const data = readings.map((r) => ({ ts: r.ts, v: r[m.key] }));
  return (
    <div className={`card tile ${state ? 'alert' : ''}`}>
      <div className="row">
        <span className="muted">{m.label}</span>
        <span className={`pill ${value == null ? '' : state ? 'bad' : 'ok'}`}>{value == null ? 'no data' : state ? `too ${state}` : 'safe'}</span>
      </div>
      <div className="big">
        {value == null ? '—' : Number(value).toFixed(m.digits)} <small>{m.unit}</small>
      </div>
      <div className="muted small">
        Safe: {range.min ?? '—'} – {range.max ?? '—'} {m.unit} {extra && `· ${extra}`}
      </div>
      <div className="spark">
        <ResponsiveContainer width="100%" height={70}>
          <LineChart data={data}>
            <YAxis hide domain={['auto', 'auto']} />
            <ReferenceArea y1={range.min ?? 0} y2={range.max ?? undefined} fill="#2fd3a3" fillOpacity={0.08} />
            <Tooltip labelFormatter={(_, p) => (p?.[0] ? clock(p[0].payload.ts) : '')} formatter={(v) => [Number(v).toFixed(m.digits), m.label]} contentStyle={{ background: '#0f2a30', border: 'none' }} />
            <Line type="monotone" dataKey="v" dot={false} stroke={state ? '#ff6b6b' : '#5ad1e6'} strokeWidth={2} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Controls({ status, online, now }) {
  const [busy, setBusy] = useState('');
  const send = async (type) => {
    setBusy(type);
    try { await T.sendCommand(type); } finally { setTimeout(() => setBusy(''), 1500); }
  };
  return (
    <div className="card">
      <h2>Controls</h2>
      {!online && <p className="bad small">Device offline: commands will run when it reconnects.</p>}
      <div className="row">
        <span>Pump</span>
        <span className={`pill ${status?.pumpOn ? 'ok' : ''}`}>{status?.pumpOn ? 'Running' : 'Off'}</span>
      </div>
      <div className="btns">
        <button onClick={() => send('pump_on')} disabled={!!busy}>{busy === 'pump_on' ? 'Sent…' : 'Pump on'}</button>
        <button onClick={() => send('pump_off')} disabled={!!busy}>{busy === 'pump_off' ? 'Sent…' : 'Pump off'}</button>
      </div>
      <div className="row">
        <span>Feeder</span>
        <span className="muted small">last fed {ago(status?.lastFeedTs, now)}</span>
      </div>
      <div className="btns">
        <button className="primary" onClick={() => send('feed_now')} disabled={!!busy}>{busy === 'feed_now' ? 'Sent…' : 'Feed now'}</button>
      </div>
    </div>
  );
}

function Alerts({ alerts }) {
  return (
    <div className="card">
      <h2>Alerts</h2>
      {alerts.length === 0 && <p className="muted small">No alerts. Water is within Safe Ranges.</p>}
      <ul className="list">
        {[...alerts].reverse().map((a) => (
          <li key={a.id}>
            <span className="bad">{labelOf(a.metric)} {a.value}</span>
            <span className="muted small"> (safe {a.min ?? '—'}–{a.max ?? '—'}) · {clock(a.ts)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const EVENT_LABEL = { fed: '🐟 Fed', feed_skipped: '⏭️ Feed skipped', pump_on: '💧 Pump on', pump_off: '⏹️ Pump off', boot: '🔌 Device booted' };
function Events({ events }) {
  return (
    <div className="card">
      <h2>Activity</h2>
      {events.length === 0 && <p className="muted small">No activity yet.</p>}
      <ul className="list">
        {[...events].reverse().map((e) => (
          <li key={e.id} className={e.type === 'feed_skipped' ? 'warn' : ''}>
            {EVENT_LABEL[e.type] ?? e.type}
            {e.reason && <span className="muted small"> · {e.reason}</span>}
            <span className="muted small"> · {clock(e.ts)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SettingsForm({ settings }) {
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState('');
  const s = d ?? settings;
  const edit = (path, value) => {
    const next = structuredClone(s);
    const keys = path.split('.');
    let o = next;
    keys.slice(0, -1).forEach((k) => { o = o[k] ??= {}; });
    o[keys.at(-1)] = value;
    setD(next);
  };
  const num = (path) => ({
    type: 'number', step: 'any',
    value: path.split('.').reduce((o, k) => o?.[k], s) ?? '',
    onChange: (e) => edit(path, e.target.value === '' ? null : Number(e.target.value)),
  });
  const save = async (e) => {
    e.preventDefault();
    const times = String(s.feed.times ?? '').split(/[,\s]+/).filter(Boolean);
    if (times.some((t) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(t))) return setMsg('Feed times must be HH:MM, e.g. 08:00, 18:00');
    await T.saveSettings({ ...s, feed: { ...s.feed, times } });
    setD(null);
    setMsg('Saved. Device applies it on next sync.');
    setTimeout(() => setMsg(''), 4000);
  };
  return (
    <form className="card settings" onSubmit={save}>
      <h2>Settings</h2>
      <fieldset>
        <legend>Pump cycle</legend>
        <label><input type="checkbox" checked={!!s.pump.enabled} onChange={(e) => edit('pump.enabled', e.target.checked)} /> Timer enabled</label>
        <label>On (min) <input {...num('pump.onMin')} min="0" /></label>
        <label>Off (min) <input {...num('pump.offMin')} min="0" /></label>
      </fieldset>
      <fieldset>
        <legend>Feeding</legend>
        <label><input type="checkbox" checked={!!s.feed.enabled} onChange={(e) => edit('feed.enabled', e.target.checked)} /> Schedule enabled</label>
        <label>Times <input value={Array.isArray(s.feed.times) ? s.feed.times.join(', ') : s.feed.times} onChange={(e) => edit('feed.times', e.target.value)} placeholder="08:00, 18:00" /></label>
        <label>Servo sweep (°) <input {...num('feed.sweepDeg')} min="0" max="180" /></label>
        <label><input type="checkbox" checked={!!s.feed.skipIfTurbid} onChange={(e) => edit('feed.skipIfTurbid', e.target.checked)} /> Skip feeding when water is cloudy</label>
      </fieldset>
      <fieldset>
        <legend>Safe Ranges</legend>
        <label>pH min <input {...num('safe.ph.min')} /></label>
        <label>pH max <input {...num('safe.ph.max')} /></label>
        <label>Temp min °C <input {...num('safe.tempC.min')} /></label>
        <label>Temp max °C <input {...num('safe.tempC.max')} /></label>
        <label>Turbidity max NTU <input {...num('safe.turbidityNTU.max')} /></label>
      </fieldset>
      <fieldset>
        <legend>Device</legend>
        <label>Reading every (s) <input {...num('readingIntervalSec')} min="2" /></label>
      </fieldset>
      <div className="btns">
        <button className="primary" disabled={!d}>Save settings</button>
        {d && <button type="button" onClick={() => setD(null)}>Discard</button>}
        {msg && <span className="small muted">{msg}</span>}
      </div>
    </form>
  );
}
