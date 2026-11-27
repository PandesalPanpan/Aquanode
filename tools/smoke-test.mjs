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

// Reading interval: change it like the Dashboard does, then measure the gaps between the Readings that follow.
// Checks both directions (faster and slower) so a device that ignores the setting can't pass by luck.
async function readingGapsAfter(sec) {
  const changedAt = Date.now();
  await update(r('settings'), { readingIntervalSec: sec });
  const deadline = changedAt + sec * 4000 + 8000;
  let ts = [];
  while (Date.now() < deadline) {
    await sleep(500);
    ts = Object.values((await get(r('readings'))).val() || {}).map((x) => x.ts).filter((t) => t > changedAt).sort((a, b) => a - b);
    if (ts.length >= 4) break;
  }
  return ts.slice(1).map((t, i) => (t - ts[i]) / 1000); // only Readings taken after the change
}
const before = (await get(r('settings/readingIntervalSec'))).val();
for (const sec of [2, 6]) {
  const gaps = (await readingGapsAfter(sec)).slice(-2);
  const ok = gaps.length === 2 && gaps.every((g) => Math.abs(g - sec) < 1);
  check(`reading interval ${sec}s applied`, ok, `gaps ${gaps.map((g) => g.toFixed(1) + 's').join(', ') || 'none'}`);
}
await update(r('settings'), { readingIntervalSec: before ?? 10 });

const events = Object.values((await get(r('events'))).val() || {}).map((e) => e.type);
check('events logged', ['boot', 'fed', 'pump_on', 'pump_off'].every((t) => events.includes(t)), [...new Set(events)].join(','));

goOffline(db);
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
