import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { on, once } from 'node:events';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { Aedes } from 'aedes';
import { deleteApp } from 'firebase/app';
import { get, goOffline, push, ref } from 'firebase/database';
import { openDatabase } from './firebase-client.mjs';
import { BASE, COMMAND_MAX_AGE_MS, connectMqtt, subscribe } from './mqtt-device.mjs';

if (!process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.FIREBASE_DATABASE_EMULATOR_HOST) {
  throw new Error('Run this test under Firebase emulators:exec --project demo-aquanode --only auth,database');
}

const broker = await Aedes.createBroker();
const server = createServer(broker.handle);
server.listen(0, '127.0.0.1');
await once(server, 'listening');
process.env.AQUANODE_MQTT_URL = 'mqtt://127.0.0.1:' + server.address().port;
Object.assign(process.env, {
  AQUANODE_EMAIL: 'bridge@example.test',
  AQUANODE_PASSWORD: 'emu-bridge-password',
  AQUANODE_TEAM_EMAIL: 'team@example.test',
  AQUANODE_TEAM_PASSWORD: 'emu-team-password',
});

const children = [];
let db;
let client;

function start(script, stdout = 'inherit') {
  const child = spawn(process.execPath, [fileURLToPath(new URL(script, import.meta.url))], {
    stdio: ['ignore', stdout, 'inherit'],
    env: process.env,
  });
  children.push(child);
  return child;
}

async function waitFor(description, check) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await sleep(125);
  }
  throw new Error('Timed out waiting for ' + description);
}

try {
  db = await openDatabase(process.env.AQUANODE_TEAM_EMAIL, process.env.AQUANODE_TEAM_PASSWORD);
  const path = (name) => ref(db, BASE + name);
  const manualFeeds = async () => Object.values((await get(path('events'))).val() || {})
    .filter((event) => event.type === 'fed' && event.reason === 'manual').length;

  const bridge = start('./mqtt-bridge.mjs', 'pipe');
  let bridgeOutput = '';
  bridge.stdout.on('data', (chunk) => {
    process.stdout.write(chunk);
    bridgeOutput += chunk;
  });
  await waitFor('bridge subscription', () => bridgeOutput.includes('[bridge] connected'));
  bridge.stdout.removeAllListeners('data');
  bridge.stdout.pipe(process.stdout, { end: false });
  start('./fake-device.mjs');
  await waitFor('simulated data in Firebase', async () => {
    const [status, latest] = await Promise.all([get(path('status')), get(path('latest'))]);
    return status.val()?.fw === 'fake-0.2-mqtt' && latest.exists();
  });
  const smoke = start('./smoke-test.mjs');
  const [code] = await once(smoke, 'exit');
  assert.equal(code, 0, 'Dashboard API smoke test');

  const feedsBefore = await manualFeeds();
  client = connectMqtt('smoke');
  await once(client, 'connect');
  await subscribe(client, ['command-results']);
  async function publishAndWait(command, status) {
    const ack = (async () => {
      for await (const [, body] of on(client, 'message', { signal: AbortSignal.timeout(5000) })) {
        const reply = JSON.parse(body);
        if (reply.id === command.id) return reply.status;
      }
    })();
    await client.publishAsync(BASE + 'commands', JSON.stringify(command), { qos: 1 });
    assert.equal(await ack, status);
  }

  const ts = Date.now();
  const row = await push(path('commands'), { type: 'feed_now', ts, status: 'pending' });
  await waitFor('Feed Now acknowledgment in Firebase', async () => (await get(row)).val()?.status === 'done');
  await publishAndWait({ id: row.key, type: 'feed_now', ts }, 'done');
  assert.equal(await manualFeeds(), feedsBefore + 1);
  console.log('PASS  duplicate MQTT Feed Now has one feed event');

  const staleTs = Date.now() - COMMAND_MAX_AGE_MS - 1000;
  const stale = await push(path('commands'), { type: 'feed_now', ts: staleTs, status: 'pending' });
  await waitFor('expired Command in Firebase', async () => (await get(stale)).val()?.status === 'expired');
  await publishAndWait({ id: stale.key, type: 'feed_now', ts: staleTs }, 'expired');
  assert.equal(await manualFeeds(), feedsBefore + 1);
  console.log('PASS  stale Feed Now expires in the bridge and at the device');
} finally {
  if (client) await client.endAsync();
  if (db) {
    goOffline(db);
    await deleteApp(db.app);
  }
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill();
  }
  await new Promise((resolve) => broker.close(resolve));
  await new Promise((resolve) => server.close(resolve));
}

// The Firebase SDK can keep background timers alive after the emulated clients close.
process.exit(0);
