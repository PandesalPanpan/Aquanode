// Unit check for the reading-interval limits shared by the Dashboard and the simulator.
// Usage: node interval-test.mjs   (no emulators or hardware needed)
import assert from 'node:assert/strict';
import { cleanIntervalSec, READING_INTERVAL } from '../web/src/data/defaults.js';

const cases = [
  [10, 10], [2, 2], [3600, 3600], // valid values pass through
  [1, 2], [0, 2], [-5, 2], [0.5, 2], // too short: clamp to 2 s
  [3601, 3600], [100000, 3600], // too long: clamp to 1 hour (firmware stores it in a uint16_t)
  [7.4, 7], [7.6, 8], ['15', 15], // round to whole seconds; numeric strings are fine
  [null, 10], [undefined, 10], ['', 10], ['abc', 10], [NaN, 10], [Infinity, 10], // unusable: default 10 s
];
for (const [input, expected] of cases) {
  assert.equal(cleanIntervalSec(input), expected, `cleanIntervalSec(${String(input)})`);
}
assert.deepEqual(READING_INTERVAL, { min: 2, max: 3600, fallback: 10 });
console.log(`PASS  ${cases.length} reading-interval cases`);
