// Shared defaults + device id. Mirrors docs/PLAN.md "Data model". Timestamps (ts) are epoch milliseconds.
export const DEVICE_ID = 'bench-01';

export const DEFAULT_SETTINGS = {
  readingIntervalSec: 10,
  pump: { enabled: true, onMin: 15, offMin: 45 },
  feed: { enabled: true, times: ['08:00', '18:00'], sweepDeg: 90, skipIfTurbid: true },
  safe: {
    ph: { min: 6.8, max: 7.6 },
    tempC: { min: 22, max: 28 },
    turbidityNTU: { max: 50 },
  },
};

export const METRICS = [
  { key: 'ph', label: 'pH', unit: '', digits: 2 },
  { key: 'tempC', label: 'Temperature', unit: '°C', digits: 1 },
  { key: 'turbidityNTU', label: 'Turbidity', unit: 'NTU', digits: 0 },
];

// Returns null if in range, else 'low' | 'high'.
export function outOfRange(metric, value, safe) {
  const r = safe?.[metric];
  if (!r || value == null) return null;
  if (r.min != null && value < r.min) return 'low';
  if (r.max != null && value > r.max) return 'high';
  return null;
}
