import { readFileSync } from 'node:fs';
import { connect } from 'mqtt';
import { DEVICE_ID } from '../web/src/data/defaults.js';

export const BASE = 'aquanode/' + DEVICE_ID + '/';
export const COMMAND_MAX_AGE_MS = 5 * 60_000;
export const COMMAND_TYPES = new Set(['pump_on', 'pump_off', 'feed_now']);
export const COMMAND_RESULTS = new Set(['done', 'expired', 'uncertain', 'failed']);
export const validId = (id) => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,24}$/.test(id);
export function expired(ts, now = Date.now()) {
  return !Number.isSafeInteger(ts) || now - ts >= COMMAND_MAX_AGE_MS || ts - now > 30_000;
}

export function connectMqtt(role) {
  const { AQUANODE_MQTT_URL: url, AQUANODE_MQTT_USERNAME: username,
    AQUANODE_MQTT_PASSWORD: password, AQUANODE_MQTT_CA_FILE: caFile } = process.env;
  if (!url) throw new Error('Set AQUANODE_MQTT_URL');
  const endpoint = new URL(url);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname);
  if (endpoint.protocol !== 'mqtts:' && !(local && endpoint.protocol === 'mqtt:')) {
    throw new Error('Use mqtts:// for a remote broker');
  }
  const client = connect(url, {
    username, password, clientId: 'aquanode-' + role + '-' + DEVICE_ID,
    ...(caFile && { ca: readFileSync(caFile) }),
    reconnectPeriod: 2000, resubscribe: false,
  });
  client.on('error', (error) => console.error('[mqtt]', error.message));
  return client;
}

// The bridge subscribes again on each clean session so it can wait for SUBACK.
export async function subscribe(client, topics) {
  const grants = await client.subscribeAsync(topics.map((topic) => BASE + topic), { qos: 1 });
  if (grants.length !== topics.length || grants.some(({ qos }) => qos === 128)) {
    throw new Error('Broker denied a subscription');
  }
}
