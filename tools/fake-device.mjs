// Fake ESP32: simulates AquaNode firmware so the Dashboard can be built and tested without hardware.
// Usage: set AQUANODE_MQTT_URL and broker credentials, then npm run fake
// Options: $env:SIM_FAST="1"  -> pump minutes run as seconds (quick demo)
// Keys while running:  c = toggle cloudy water (to demo the Skip-Feed Rule)   f = force a scheduled feed now   q = quit
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { DEVICE_ID, DEFAULT_SETTINGS, METRICS, outOfRange, mergeSettings } from '../web/src/data/defaults.js';
import { BASE, COMMAND_TYPES, connectMqtt, expired, subscribe, validId } from './mqtt-device.mjs';

const FAST = process.env.SIM_FAST === '1';
const MIN = FAST ? 1000 : 60_000;
const client = connectMqtt('simulator');
const bootId = randomBytes(8).toString('hex');
let sequence = 0;
const log = (...a) => console.log(new Date().toLocaleTimeString(), ...a);

function publish(topic, data) {
  if (!client.connected) return;
  return client.publishAsync(BASE + topic, JSON.stringify(data), { qos: 1 });
}

const sampleId = () => bootId + (++sequence).toString(16);
const event = (type, extra = {}) => {
  log('event:', type, extra.reason ?? '');
  return publish('events', { id: sampleId(), type, ts: Date.now(), ...extra });
};

let settings = DEFAULT_SETTINGS;
let readingTimer;
const status = { online: true, pumpOn: false, lastFeedTs: null, fw: 'fake-0.2-mqtt' };
const pushStatus = () => publish('status', { ...status, lastSeen: Date.now() });
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
  await publish('readings', { id: sampleId(), ...rd });
  await pushStatus();
  for (const { key } of METRICS) {
    const out = outOfRange(key, rd[key], settings.safe);
    if (out && !alerted[key]) {
      const range = settings.safe[key];
      await publish('alerts', { id: sampleId(), metric: key, value: rd[key], min: range.min ?? null, max: range.max ?? null, ts: rd.ts });
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
  if (!settings.pump.enabled) { if (status.pumpOn) setPump(false, 'pump disabled').catch(report); return; }
  if (Date.now() >= phaseEnd) setPump(!status.pumpOn, 'timer').catch(report);
}, 1000);

// ---- Feeder (schedule + Skip-Feed Rule) ----
async function feed(reason) {
  status.lastFeedTs = Date.now();
  log(`feeder portion ${settings.feed.portion ?? 2}`);
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
  if (settings.feed.times?.includes(hhmm) && key !== lastSlot) { lastSlot = key; scheduledFeed(hhmm).catch(report); }
}, 1000);

const handled = new Map();

async function handleCommand({ id, type, ts }) {
  if (!validId(id) || !COMMAND_TYPES.has(type)) return;
  for (const [key, entry] of handled) {
    if (expired(entry.ts)) handled.delete(key);
  }
  let command = handled.get(id);
  if (!command) {
    command = { ts, result: executeCommand(type, ts) };
    handled.set(id, command);
  }
  const result = await command.result;
  await publish('command-results', { id, status: result, doneTs: Date.now() });
}

async function executeCommand(type, ts) {
  if (expired(ts)) return 'expired';
  log('command:', type);
  try {
    if (type === 'pump_on') await setPump(true, 'manual');
    else if (type === 'pump_off') await setPump(false, 'manual');
    else await feed('manual');
    return 'done';
  } catch (error) {
    report(error);
    return 'uncertain';
  }
}

function report(error) {
  log(error.message);
}

async function handleMessage(topic, message) {
  const payload = JSON.parse(message);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return;
  if (topic === BASE + 'settings') {
    settings = mergeSettings(payload);
    log('settings applied');
    scheduleReadings();
  } else if (topic === BASE + 'commands') {
    await handleCommand(payload);
  }
}

client.on('message', (topic, message) => handleMessage(topic, message).catch(report));
client.on('connect', () => subscribe(client, ['settings', 'commands']).catch(report));
await once(client, 'connect');
await event('boot');
await takeReading();
scheduleReadings();
log('Fake ' + DEVICE_ID + ' running. Keys: c=cloudy  f=scheduled feed now  q=quit');
// ---- Keyboard controls ----
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', async (k) => {
    if (k === 'c') { cloudy = !cloudy; log(`water is now ${cloudy ? 'CLOUDY' : 'clear'}`); }
    if (k === 'f') scheduledFeed('manual-test').catch(report);
    if (k === 'q' || k === '\u0003') {
      await client.endAsync();

      process.exit(0);
    }
  });
}
