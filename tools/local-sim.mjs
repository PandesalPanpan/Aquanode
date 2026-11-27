// Full local AquaNode with no hardware and no cloud: loopback MQTT broker + bridge + simulated ESP32,
// against the Firebase emulators. Keeps running until Ctrl+C.
// Usage (from the repo root):
//   firebase emulators:exec --project demo-aquanode --only auth,database "node tools/local-sim.mjs"
//   then in another terminal: $env:VITE_AQUANODE_EMULATORS='1'; npm --prefix web run dev
//   and sign in as team@example.test / emu-team-password
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { Aedes } from 'aedes';
import { openDatabase } from './firebase-client.mjs';

if (!process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.FIREBASE_DATABASE_EMULATOR_HOST) {
  throw new Error('Run this under: firebase emulators:exec --project demo-aquanode --only auth,database');
}

const broker = await Aedes.createBroker();
const server = createServer(broker.handle);
server.listen(0, '127.0.0.1');
await once(server, 'listening');
Object.assign(process.env, {
  AQUANODE_MQTT_URL: 'mqtt://127.0.0.1:' + server.address().port,
  AQUANODE_EMAIL: 'bridge@example.test',
  AQUANODE_PASSWORD: 'emu-bridge-password',
  AQUANODE_TEAM_EMAIL: 'team@example.test',
  AQUANODE_TEAM_PASSWORD: 'emu-team-password',
});
await openDatabase(process.env.AQUANODE_TEAM_EMAIL, process.env.AQUANODE_TEAM_PASSWORD); // creates the sign-in

const children = ['./mqtt-bridge.mjs', './fake-device.mjs'].map((script) =>
  spawn(process.execPath, [fileURLToPath(new URL(script, import.meta.url))], { stdio: ['ignore', 'inherit', 'inherit'], env: process.env }));
console.log('[sim] running. Dashboard sign-in: team@example.test / emu-team-password');

const stop = () => { for (const c of children) c.kill(); server.close(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
await new Promise(() => {}); // run until stopped
