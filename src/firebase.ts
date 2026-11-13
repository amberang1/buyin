import { initializeApp } from 'firebase/app';
import { initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, signInAnonymously, type User } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);


export const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
let initialization: Promise<User> | undefined;
export function ensureAnonymousUser(): Promise<User> {
  if (!initialization) {
    initialization = (async () => {
      await auth.authStateReady();
      return auth.currentUser || (await signInAnonymously(auth)).user;
    })().catch(error => { initialization = undefined; throw error; });
  }
  return initialization;
}
