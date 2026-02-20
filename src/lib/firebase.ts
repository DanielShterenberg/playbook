/**
 * Firebase SDK initialisation.
 *
 * Implements issue #45: Firebase project setup.
 *
 * All config values come from NEXT_PUBLIC_FIREBASE_* environment variables.
 * Copy .env.example → .env.local and fill in your project credentials.
 *
 * getApps() guard prevents double-initialisation in Next.js hot-reload.
 */

import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Guard: skip initialisation during SSR / next build when env vars are absent.
// All Firebase consumers are "use client" components — they never execute on
// the server, so exporting null here is safe. The real instances are created
// only when a browser environment with valid env vars is detected.
const canInit = !!firebaseConfig.apiKey;

/* eslint-disable @typescript-eslint/no-explicit-any */
const app    = canInit ? (getApps().length === 0 ? initializeApp(firebaseConfig) : getApp()) : null as any;
export const auth    = canInit ? getAuth(app)      : null as any;
export const db      = canInit ? getFirestore(app)  : null as any;
export const storage = canInit ? getStorage(app)    : null as any;
/* eslint-enable @typescript-eslint/no-explicit-any */

// Enable offline persistence so plays are viewable without a connection.
// Wrapped in try/catch because it fails in SSR and on the second tab
// (IndexedDB can only be held by one tab at a time).
if (typeof window !== "undefined" && canInit) {
  enableIndexedDbPersistence(db).catch(() => {
    // Persistence unavailable — continue without it (multi-tab or private mode).
  });
}

export default app;
