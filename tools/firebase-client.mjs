import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { connectDatabaseEmulator, getDatabase } from 'firebase/database';

const config = JSON.parse(readFileSync(new URL('../web/firebase-config.json', import.meta.url)));

export async function openDatabase(email, password) {
  if (!email || !password) throw new Error('Firebase email and password are required');
  const { FIREBASE_AUTH_EMULATOR_HOST: authHost, FIREBASE_DATABASE_EMULATOR_HOST: dbHost } = process.env;
  if (Boolean(authHost) !== Boolean(dbHost)) throw new Error('Configure both Firebase emulators together');

  const app = initializeApp(authHost ? { ...config, projectId: 'demo-aquanode', databaseURL: 'https://demo-aquanode-default-rtdb.firebaseio.com' } : config);
  const auth = getAuth(app);
  const db = getDatabase(app);
  if (authHost) {
    connectAuthEmulator(auth, 'http://' + authHost, { disableWarnings: true });
    const dbUrl = new URL('http://' + dbHost);
    connectDatabaseEmulator(db, dbUrl.hostname, Number(dbUrl.port));
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      return db;
    } catch (error) {
      if (error.code !== 'auth/email-already-in-use') throw error;
    }
  }
  await signInWithEmailAndPassword(auth, email, password);
  return db;
}
