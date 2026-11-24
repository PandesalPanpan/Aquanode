// Fake ESP32: simulates AquaNode firmware so the Dashboard can be built and tested without hardware.
// Usage (PowerShell):  $env:AQUANODE_EMAIL="you+device@gmail.com"; $env:AQUANODE_PASSWORD="..."; npm run fake
// Options: $env:SIM_FAST="1"  -> pump minutes run as seconds (quick demo)
// Keys while running:  c = toggle cloudy water (to demo the Skip-Feed Rule)   f = force a scheduled feed now   q = quit
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  getDatabase, ref, onValue, set, update, push, get, query, orderByChild, equalTo, onChildAdded,
  onDisconnect, goOffline,
} from 'firebase/database';

const config = JSON.parse(readFileSync(new URL('../web/firebase-config.json', import.meta.url)));
const { DEVICE_ID, DEFAULT_SETTINGS, METRICS, outOfRange, mergeSettings } = await import('../web/src/data/defaults.js');

const { AQUANODE_EMAIL: email, AQUANODE_PASSWORD: password } = process.env;
if (!email || !password) {
  console.error('Set AQUANODE_EMAIL and AQUANODE_PASSWORD (the device user) first.');
  process.exit(1);
}
const FAST = process.env.SIM_FAST === '1';
const MIN = FAST ? 1000 : 60_000;

const app = initializeApp(config);
await signInWithEmailAndPassword(getAuth(app), email, password);
const db = getDatabase(app);
const base = `aquanode/${DEVICE_ID}`;
const r = (p) => ref(db, `${base}/${p}`);
const log = (...a) => console.log(new Date().toLocaleTimeString(), ...a);
const event = (type, extra = {}) => { log('event:', type, extra.reason ?? ''); return push(r('events'), { type, ts: Date.now(), ...extra }); };

// ---- Settings (write defaults if none exist yet) ----
let settings = DEFAULT_SETTINGS;
let readingTimer; // declared before the settings listener, which calls scheduleReadings()
if (!(await get(r('settings'))).exists()) await set(r('settings'), DEFAULT_SETTINGS);
onValue(r('settings'), (s) => {
  if (!s.exists()) return;
  settings = mergeSettings(s.val());
  log('settings applied', JSON.stringify(settings));
  scheduleReadings();
});

// ---- Status / presence ----
await onDisconnect(r('status')).update({ online: false });
const status = { online: true, pumpOn: false, lastFeedTs: null, fw: 'fake-0.1', lastSeen: Date.now() };
const pushStatus = () => update(r('status'), { ...status, lastSeen: Date.now() });
await pushStatus();
await event('boot');

// ---- Simulated water ----
let cloudy = false;
const water = { ph: 7.2, tempC: 25.5, turbidityNTU: 12 };
const drift = (v, target, noise, pull = 0.05) => v + (target - v) * pull + (Math.random() - 0.5) * noise;
function sample() {
  water.ph = drift(water.ph, 7.2, 0.08);
  water.tempC = drift(water.tempC, 25.5, 0.15);
  water.turbidityNTU = Math.max(0, drift(water.turbidityNTU, cloudy ? 120 : 12, 3, cloudy ? 0.3 : 0.1));
  // SEN0189-style: voltage falls as turbidity rises (rough, for realism only)
  const turbidityV = +(4.2 - water.turbidityNTU / 1000).toFixed(3);
  return { ph: +water.ph.toFixed(2), tempC: +water.tempC.toFixed(2), turbidityNTU: +water.turbidityNTU.toFixed(1), turbidityV, ts: Date.now() };
}

// ---- Readings + Alerts ----
const alerted = {};
async function takeReading() {
  const rd = sample();
  await Promise.all([set(r('latest'), rd), push(r('readings'), rd), pushStatus()]);
  for (const { key } of METRICS) {
    const out = outOfRange(key, rd[key], settings.safe);
    if (out && !alerted[key]) {
      const range = settings.safe[key];
      await push(r('alerts'), { metric: key, value: rd[key], min: range.min ?? null, max: range.max ?? null, ts: rd.ts });
      log(`ALERT ${key}=${rd[key]} (${out})`);
    }
    alerted[key] = !!out;
  }
}
function scheduleReadings() {
  clearInterval(readingTimer);
  readingTimer = setInterval(() => takeReading().catch((e) => log('reading failed', e.message)), (settings.readingIntervalSec || 10) * 1000);
}

// ---- Pump (timer cycle + manual override) ----
let phaseEnd = Date.now();
async function setPump(on, why) {
  status.pumpOn = on;
  const p = settings.pump;
  phaseEnd = Date.now() + (on ? p.onMin : p.offMin) * MIN;
  await pushStatus();
  await event(on ? 'pump_on' : 'pump_off', { reason: why });
}
setInterval(() => {
  if (!settings.pump.enabled) { if (status.pumpOn) setPump(false, 'pump disabled'); return; }
  if (Date.now() >= phaseEnd) setPump(!status.pumpOn, 'timer');
}, 1000);

// ---- Feeder (schedule + Skip-Feed Rule) ----
async function feed(reason) {
  status.lastFeedTs = Date.now();
  log(`servo sweep ${settings.feed.sweepDeg}°`);
  await pushStatus();
  await event('fed', { reason });
}
async function scheduledFeed(slot) {
  const f = settings.feed;
  const turb = water.turbidityNTU, max = settings.safe.turbidityNTU?.max;
  if (f.skipIfTurbid && max != null && turb > max) {
    return event('feed_skipped', { reason: `turbidity ${turb.toFixed(0)} NTU > ${max} at ${slot}` });
  }
  return feed(`schedule ${slot}`);
}
let lastSlot = '';
setInterval(() => {
  if (!settings.feed.enabled) return;
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const key = `${now.toDateString()} ${hhmm}`;
  if (settings.feed.times?.includes(hhmm) && key !== lastSlot) { lastSlot = key; scheduledFeed(hhmm); }
}, 1000);

// ---- Commands from the Dashboard ----
onChildAdded(query(r('commands'), orderByChild('status'), equalTo('pending')), async (snap) => {
  const { type, ts } = snap.val();
  if (Date.now() - ts > 5 * 60_000) { // stale (sent while device was offline) — never feed/pump hours late
    log('command expired:', type);
    return update(snap.ref, { status: 'expired', doneTs: Date.now() });
  }
  log('command:', type);
  if (type === 'pump_on') await setPump(true, 'manual');
  else if (type === 'pump_off') await setPump(false, 'manual');
  else if (type === 'feed_now') await feed('manual');
  await update(snap.ref, { status: 'done', doneTs: Date.now() });
});

await takeReading();
scheduleReadings();
log(`Fake ${DEVICE_ID} running${FAST ? ' (SIM_FAST)' : ''}. Keys: c=cloudy  f=scheduled feed now  q=quit`);

// ---- Keyboard controls ----
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', async (k) => {
    if (k === 'c') { cloudy = !cloudy; log(`water is now ${cloudy ? 'CLOUDY' : 'clear'}`); }
    if (k === 'f') scheduledFeed('manual-test');
    if (k === 'q' || k === '\u0003') {
      await update(r('status'), { online: false });
      goOffline(db);
      process.exit(0);
    }
  });
}
