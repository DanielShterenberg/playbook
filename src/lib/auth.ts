/**
 * Firebase Auth helpers — implements issue #73.
 *
 * Provides thin wrappers around the Firebase Auth SDK so the rest of the app
 * never imports from "firebase/auth" directly.  Each function also ensures a
 * matching Firestore user document exists after sign-in / sign-up.
 */

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  updateProfile,
  type UserCredential,
} from "firebase/auth";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./firebase";

const googleProvider = new GoogleAuthProvider();

// ---------------------------------------------------------------------------
// Internal: ensure user document exists in Firestore
// ---------------------------------------------------------------------------

async function ensureUserDocument(
  uid: string,
  email: string | null,
  displayName: string | null,
  photoURL?: string | null,
): Promise<void> {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      email:       email ?? "",
      displayName: displayName ?? "",
      photoURL:    photoURL ?? null,
      teamId:      null,
      createdAt:   serverTimestamp(),
    });
  }
}

// ---------------------------------------------------------------------------
// Public auth actions
// ---------------------------------------------------------------------------

/**
 * Sign in with email and password.
 * Throws a Firebase AuthError on failure (caller should handle and display).
 */
export async function signInWithEmail(
  email: string,
  password: string,
): Promise<UserCredential> {
  return signInWithEmailAndPassword(auth, email, password);
}

/**
 * Create a new account with email, password, and display name.
 * Also creates the Firestore user document.
 */
export async function signUpWithEmail(
  email: string,
  password: string,
  displayName: string,
): Promise<UserCredential> {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName });
  await ensureUserDocument(cred.user.uid, email, displayName);
  return cred;
}

/**
 * Sign in with Google via popup.
 * Creates a Firestore user document on first sign-in.
 */
export async function signInWithGoogle(): Promise<UserCredential> {
  const cred = await signInWithPopup(auth, googleProvider);
  await ensureUserDocument(
    cred.user.uid,
    cred.user.email,
    cred.user.displayName,
    cred.user.photoURL,
  );
  return cred;
}

/** Sign out the current user. */
export async function signOut(): Promise<void> {
  return firebaseSignOut(auth);
}

/**
 * Map a Firebase Auth error code to a human-readable message.
 * Only covers the most common codes — falls back to the raw message.
 */
export function authErrorMessage(code: string): string {
  const map: Record<string, string> = {
    "auth/invalid-credential":       "Incorrect email or password.",
    "auth/user-not-found":           "No account found with that email.",
    "auth/wrong-password":           "Incorrect password.",
    "auth/email-already-in-use":     "An account with that email already exists.",
    "auth/weak-password":            "Password must be at least 6 characters.",
    "auth/invalid-email":            "Please enter a valid email address.",
    "auth/too-many-requests":        "Too many attempts. Please try again later.",
    "auth/popup-closed-by-user":     "Sign-in popup closed before completing.",
    "auth/network-request-failed":   "Network error. Check your connection.",
  };
  return map[code] ?? "Something went wrong. Please try again.";
}
