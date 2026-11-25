import { get, onValue, query, orderByChild, equalTo, ref, runTransaction, set, update } from 'firebase/database';
import { DEFAULT_SETTINGS, mergeSettings } from '../web/src/data/defaults.js';
import { openDatabase } from './firebase-client.mjs';
import { BASE, COMMAND_RESULTS, COMMAND_TYPES, connectMqtt, expired, subscribe, validId } from './mqtt-device.mjs';

const db = await openDatabase(process.env.AQUANODE_EMAIL, process.env.AQUANODE_PASSWORD);
const path = (suffix) => ref(db, BASE + suffix);
const client = connectMqtt('bridge');
const pending = new Map();
const publishing = new Set();
let subscribed = false;
let settings;

async function sendSettings() {
  if (subscribed && client.connected && settings) {
    await client.publishAsync(BASE + 'settings', JSON.stringify(settings), { qos: 1, retain: true });
  }
}

onValue(path('settings'), (snapshot) => {
  settings = mergeSettings(snapshot.val(), DEFAULT_SETTINGS);
  sendSettings().catch(report);
}, report);

onValue(query(path('commands'), orderByChild('status'), equalTo('pending')), (snapshot) => {
  pending.clear();
  snapshot.forEach((child) => { pending.set(child.key, child.val()); });
  dispatch();
}, report);

async function finishCommand(id, status, doneTs) {
  await runTransaction(path('commands/' + id), (command) =>
    command?.status === 'pending' ? { ...command, status, doneTs } : undefined);
}

function dispatch() {
  if (!subscribed || !client.connected) return;
  for (const [id, { type, ts }] of pending) {
    if (!validId(id) || publishing.has(id)) continue;
    publishing.add(id);
    let delivery;
    if (!COMMAND_TYPES.has(type)) {
      delivery = finishCommand(id, 'failed', Date.now());
    } else if (expired(ts)) {
      delivery = finishCommand(id, 'expired', Date.now());
    } else {
      delivery = client.publishAsync(BASE + 'commands', JSON.stringify({ id, type, ts }), { qos: 1 });
    }
    delivery.catch(report).finally(() => publishing.delete(id));
  }
}

client.on('connect', async () => {
  try {
    await subscribe(client, ['readings', 'status', 'alerts', 'events', 'command-results']);
    subscribed = true;
    await sendSettings();
    dispatch();
    console.log('[bridge] connected for ' + BASE);
  } catch (error) {
    report(error);
  }
});
client.on('close', () => { subscribed = false; });
setInterval(dispatch, 2000);

async function store(topic, payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return;
  const { id, ...data } = payload;
  if (topic === 'command-results') {
    if (validId(id) && COMMAND_RESULTS.has(data.status) && Number.isSafeInteger(data.doneTs)) {
      // Hydrate the transaction's cache after a bridge restart.
      if ((await get(path('commands/' + id))).exists()) await finishCommand(id, data.status, data.doneTs);
    }
    return;
  }
  if (topic === 'status') {
    if (data.online !== true || !Number.isSafeInteger(data.lastSeen) || typeof data.pumpOn !== 'boolean') return;
    await runTransaction(path('status'), (previous) =>
      previous?.lastSeen > data.lastSeen ? undefined : { ...previous, ...data });
    return;
  }
  if (!validId(id) || !Number.isSafeInteger(data.ts)) return;
  if (topic === 'readings') {
    await set(path('readings/' + id), data);
    await runTransaction(path('latest'), (latest) => latest?.ts > data.ts ? undefined : data);
  } else if (topic === 'alerts' || topic === 'events') {
    await update(path(topic), { [id]: data });
  }
}

client.on('message', (topic, message) => {
  let payload;
  try {
    payload = JSON.parse(message);
  } catch {
    return;
  }
  store(topic.slice(BASE.length), payload).catch(report);
});

function report(error) {
  console.error('[bridge]', error.message);
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    await client.endAsync();
    process.exit(0);
  });
}
