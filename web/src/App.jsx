import { useCallback, useEffect, useState } from 'react';
import * as T from './data/transport.js';
import { mergeSettings } from './data/defaults.js';
import { useSub, useNow, useNewEvents } from './ui/hooks.js';
import { headline, issuesOf, since, authError } from './ui/words.js';
import TankScene from './ui/TankScene.jsx';
import { Readings, Actions, Timeline, History, SettingsSentences } from './ui/Panels.jsx';

export default function App() {
  const [user, setUser] = useState(undefined);
  useEffect(() => T.onAuth(setUser), []);
  if (user === undefined) return <div className="boot" aria-busy="true" />;
  return user ? <Dashboard user={user} /> : <Login />;
}

function Logo() {
  return (
    <span className="logo">
      <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3c5 6 9 11 9 16a9 9 0 0 1-18 0c0-5 4-10 9-16z" /><path className="leaf" d="M16 21c0-5 3-8 8-9-1 5-4 8-8 9z" /></svg>
      AquaNode
    </span>
  );
}

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try { await T.signIn(email, password); } catch (x) { setErr(authError(x.code)); setBusy(false); }
  };
  return (
    <main className="login">
      <div className="login-bg" aria-hidden="true" />
      <form className="login-card" onSubmit={submit}>
        <Logo />
        <h1>Sign in to see your tank</h1>
        <p>Use the account your team set up for AquaNode.</p>
        <label>Email<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {err && <p className="form-error" role="alert">{err}</p>}
        <button className="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </main>
  );
}

function Dashboard({ user }) {
  const now = useNow(5000);
  const status = useSub(T.subscribeStatus);
  const latest = useSub(T.subscribeLatest);
  const settingsRaw = useSub(T.subscribeSettings);
  const readings = useSub((cb) => T.subscribeReadings(240, cb)) ?? [];
  const events = useSub((cb) => T.subscribeEvents(40, cb));
  const settings = mergeSettings(settingsRaw);
  const feedPulse = useNewEvents(events, ['fed', 'feed_skipped']);

  const [toastMsg, setToastMsg] = useState(null);
  const toast = useCallback((text) => setToastMsg({ text, id: Date.now() }), []);
  useEffect(() => { if (!toastMsg) return; const t = setTimeout(() => setToastMsg(null), 5000); return () => clearTimeout(t); }, [toastMsg]);
  useEffect(() => { if (feedPulse?.type === 'feed_skipped') toast('Feeding skipped: the water is too cloudy right now.'); }, [feedPulse, toast]);

  const staleAfter = (settings.readingIntervalSec * 3 + 10) * 1000;
  const loading = status === null && latest === null;
  const online = !!status?.online && now - (status?.lastSeen || 0) < staleAfter;
  const issues = issuesOf(latest, settings.safe);
  const head = headline({ online, latest, issues, lastSeen: status?.lastSeen, now });
  const ntuMax = settings.safe?.turbidityNTU?.max ?? 50;
  const murk = latest?.turbidityNTU == null ? 0 : Math.max(0, Math.min(0.8, (latest.turbidityNTU - ntuMax * 0.3) / (ntuMax * 2.2)));

  return (
    <>
      <header className="topbar">
        <Logo />
        <span className={`conn ${online ? 'is-on' : ''}`}>
          <i aria-hidden="true" />{online ? 'Connected' : status?.lastSeen ? `Offline since ${since(status.lastSeen, now)}` : 'Not connected yet'}
        </span>
        <button className="ghost small" onClick={T.signOut} title={user.email}>Sign out</button>
      </header>

      <section className={`hero tone-${head.tone}`}>
        <TankScene pumpOn={!!status?.pumpOn && online} feedPulse={feedPulse} murk={murk} offline={!online && !loading} />
        <div className="hero-scrim" aria-hidden="true" />
        <div className="hero-copy" aria-live="polite">
          <h1>{head.title}</h1>
          <p>{head.sub}</p>
        </div>
      </section>

      <main className="page">
        <Readings latest={latest} safe={settings.safe} />
        <Actions status={status} online={online} feedPulse={feedPulse} toast={toast} />
        <div className="columns">
          <History readings={readings} safe={settings.safe} intervalSec={settings.readingIntervalSec} />
          <Timeline events={events ?? []} now={now} />
        </div>
        <SettingsSentences settings={settings} toast={toast} />
        <footer className="foot">
          <p>AquaNode, an automated aquaponics balancer. Embedded Systems final project.</p>
          <p className="fine">Placeholder photo: “Nature Aquarium Aquascape”, Wikimedia Commons, public domain (CC0). To be replaced with a photo of our own tank.</p>
        </footer>
      </main>

      <div className="toast-wrap" aria-live="polite">
        {toastMsg && <div className="toast" key={toastMsg.id}>{toastMsg.text}</div>}
      </div>
    </>
  );
}
