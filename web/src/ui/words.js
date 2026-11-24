// Plain-language copy for non-technical viewers. Technical names stay in small print only.
import { outOfRange } from '../data/defaults.js';

export const READINGS = [
  {
    key: 'ph', name: 'Acidity', unit: 'pH', digits: 1,
    hint: 'Fish and plants share this water. Most do best between 6.8 and 7.6.',
    low: 'The water is too acidic for the fish.',
    high: 'The water is too alkaline for the plants.',
  },
  {
    key: 'tempC', name: 'Temperature', unit: '°C', digits: 1,
    hint: 'Warm-water fish like tilapia and guppies prefer 22 to 28 °C.',
    low: 'The water is too cold for the fish.',
    high: 'The water is too warm for the fish.',
  },
  {
    key: 'turbidityNTU', name: 'Clarity', unit: 'NTU', digits: 0,
    hint: 'Cloudy water usually means leftover food or a dirty filter.',
    low: '',
    high: 'The water is getting cloudy. Feed less or clean the filter.',
  },
];

export function clarityWord(ntu, max = 50) {
  if (ntu == null) return '—';
  if (ntu <= max * 0.4) return 'Crystal clear';
  if (ntu <= max) return 'Clear';
  if (ntu <= max * 2) return 'Cloudy';
  return 'Very cloudy';
}

export function issuesOf(latest, safe) {
  if (!latest) return [];
  return READINGS.flatMap((r) => {
    const out = outOfRange(r.key, latest[r.key], safe);
    return out ? [{ key: r.key, name: r.name, dir: out, message: r[out] }] : [];
  });
}

export function headline({ online, latest, issues, lastSeen, now }) {
  if (!latest && !lastSeen) return { tone: 'idle', title: 'Waiting for AquaNode', sub: 'Plug in the device. Readings appear here as soon as it connects.' };
  if (!online) return { tone: 'off', title: 'AquaNode is not responding', sub: `Last heard from ${since(lastSeen, now)}. Check its power and Wi-Fi.` };
  if (issues.length === 1) return { tone: 'warn', title: issues[0].message, sub: `Everything else looks fine. Checked ${since(latest?.ts, now)}.` };
  if (issues.length > 1) return { tone: 'warn', title: `${issues.length} things need your attention`, sub: issues.map((i) => i.message).join(' ') };
  return { tone: 'good', title: 'Your fish and plants are doing well', sub: `All readings are in the healthy range. Checked ${since(latest?.ts, now)}.` };
}

export function since(ts, now = Date.now()) {
  if (!ts) return 'never';
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s} seconds ago`;
  const m = Math.round(s / 60);
  if (m < 60) return m === 1 ? 'a minute ago' : `${m} minutes ago`;
  const h = Math.round(m / 60);
  if (h < 24) return h === 1 ? 'an hour ago' : `${h} hours ago`;
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export const timeOfDay = (ts) => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export function dayLabel(ts, now = Date.now()) {
  const d = new Date(ts), n = new Date(now);
  const key = (x) => x.toDateString();
  if (key(d) === key(n)) return 'Today';
  const y = new Date(n); y.setDate(n.getDate() - 1);
  if (key(d) === key(y)) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

// Event -> { text, kind } in plain language
export function describeEvent(e) {
  const manual = e.reason === 'manual';
  switch (e.type) {
    case 'fed': return { kind: 'feed', text: manual ? 'You fed the fish' : 'The fish were fed on schedule' };
    case 'feed_skipped': return { kind: 'skip', text: 'Feeding was skipped because the water was cloudy', detail: e.reason };
    case 'pump_on': return { kind: 'pump', text: manual ? 'You started the water pump' : 'The water pump started' };
    case 'pump_off': return { kind: 'pump-off', text: manual ? 'You stopped the water pump' : 'The water pump is resting' };
    case 'boot': return { kind: 'boot', text: 'AquaNode switched on' };
    default: return { kind: 'other', text: e.type };
  }
}

export function authError(code = '') {
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) return 'That email and password don’t match. Check both and try again.';
  if (code.includes('too-many-requests')) return 'Too many attempts. Wait a minute, then try again.';
  if (code.includes('network')) return 'No internet connection. Reconnect and try again.';
  return 'Sign-in didn’t work. Try again in a moment.';
}
