// Smoke test: signs in as the TEAM user (like the Dashboard), checks live data, sends commands + a settings change,
// and verifies the device (fake or real) handled them. Usage: set AQUANODE_TEAM_EMAIL / AQUANODE_TEAM_PASSWORD, then `node smoke-test.mjs`.
import { ref, get, push, update, goOffline } from 'firebase/database';
import { openDatabase } from './firebase-client.mjs';
import { BASE } from './mqtt-device.mjs';

const db = await openDatabase(process.env.AQUANODE_TEAM_EMAIL, process.env.AQUANODE_TEAM_PASSWORD);
const r = (p) => ref(db, BASE + p);
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${detail}`); if (!ok) fails++; };

const status = (await get(r('status'))).val();
check('device online', status?.online && Date.now() - status.lastSeen < 60_000, `lastSeen ${status && Math.round((Date.now() - status.lastSeen) / 1000)}s ago`);
const latest = (await get(r('latest'))).val();
check('latest reading', latest && ['ph', 'tempC', 'turbidityNTU'].every((k) => typeof latest[k] === 'number'), JSON.stringify(latest));
const nReadings = (await get(r('readings'))).size;
check('readings history', nReadings > 0, `${nReadings} readings`);

for (const type of ['feed_now', 'pump_on', 'pump_off']) {
  const cmd = await push(r('commands'), { type, ts: Date.now(), status: 'pending' });
  await sleep(3000);
  const c = (await get(cmd)).val();
  check(`command ${type}`, c.status === 'done', c.doneTs ? `${c.doneTs - c.ts} ms` : '');
}
check('pump state follows command', (await get(r('status/pumpOn'))).val() === false);

const before = (await get(r('settings/readingIntervalSec'))).val();
await update(r('settings'), { readingIntervalSec: 5 });
await sleep(12_000);
const recent = Object.values((await get(r('readings'))).val() || {}).map((x) => x.ts).sort().slice(-3);
const gap = (recent[2] - recent[1]) / 1000;
check('settings change applied', gap < 7, `reading gap ${gap.toFixed(1)}s after setting 5s`);
await update(r('settings'), { readingIntervalSec: before ?? 10 });

const events = Object.values((await get(r('events'))).val() || {}).map((e) => e.type);
check('events logged', ['boot', 'fed', 'pump_on', 'pump_off'].every((t) => events.includes(t)), [...new Set(events)].join(','));

goOffline(db);
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
