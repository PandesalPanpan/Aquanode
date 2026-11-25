// The Dashboard uses Firebase for sign-in, history, and messaging with the MQTT bridge.
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword, signOut as fbSignOut, onAuthStateChanged } from 'firebase/auth';
import { connectDatabaseEmulator, getDatabase, ref, onValue, query, orderByChild, limitToLast, push, set } from 'firebase/database';
import config from '../../firebase-config.json';
import { DEVICE_ID } from './defaults.js';

const useEmulators = import.meta.env.DEV && import.meta.env.VITE_AQUANODE_EMULATORS === '1';
const app = initializeApp(useEmulators
  ? { ...config, projectId: 'demo-aquanode', databaseURL: 'https://demo-aquanode-default-rtdb.firebaseio.com' }
  : config);
const auth = getAuth(app);
const db = getDatabase(app);
if (useEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectDatabaseEmulator(db, '127.0.0.1', 9000);
}
const base = `aquanode/${DEVICE_ID}`;
const r = (p) => ref(db, `${base}/${p}`);

export const signIn = (email, password) => signInWithEmailAndPassword(auth, email, password);
export const signOut = () => fbSignOut(auth);
export const onAuth = (cb) => onAuthStateChanged(auth, cb);

const valueOf = (path, cb) => onValue(r(path), (s) => cb(s.val()));
const listOf = (path, n, cb) =>
  onValue(query(r(path), orderByChild('ts'), limitToLast(n)), (s) => {
    const out = [];
    s.forEach((c) => { out.push({ id: c.key, ...c.val() }); });
    cb(out);
  });

// Each subscribe* returns an unsubscribe function.
export const subscribeStatus = (cb) => valueOf('status', cb);
export const subscribeLatest = (cb) => valueOf('latest', cb);
export const subscribeSettings = (cb) => valueOf('settings', cb);
export const subscribeReadings = (n, cb) => listOf('readings', n, cb);
export const subscribeAlerts = (n, cb) => listOf('alerts', n, cb);
export const subscribeEvents = (n, cb) => listOf('events', n, cb);

export const saveSettings = (settings) => set(r('settings'), settings);
export const sendCommand = (type) => push(r('commands'), { type, ts: Date.now(), status: 'pending' });
