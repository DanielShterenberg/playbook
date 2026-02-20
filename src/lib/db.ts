/**
 * Firestore CRUD operations for plays.
 *
 * Implements issue #68: auto-save play to Firestore.
 *
 * Data model:
 *   plays/{playId}  — one document per play, owned by a team or user.
 *
 * All Dates are stored as Firestore Timestamps and converted back on read.
 * Scene/annotation data is stored as plain JSON-compatible nested maps.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
  Timestamp,
  type DocumentData,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Play } from "./types";

// ---------------------------------------------------------------------------
// Serialisation helpers
// ---------------------------------------------------------------------------

/** Strip client-side Date objects before writing to Firestore. */
function serialisePlay(play: Play): DocumentData {
  return {
    ...play,
    // Dates → let Firestore manage them as server timestamps on first write;
    // subsequent saves keep the original createdAt and bump updatedAt.
    createdAt: play.createdAt instanceof Date ? Timestamp.fromDate(play.createdAt) : play.createdAt,
    updatedAt: serverTimestamp(),
  };
}

/** Convert Firestore document data back to a typed Play. */
function deserialisePlay(id: string, data: DocumentData): Play {
  return {
    ...(data as Omit<Play, "id" | "createdAt" | "updatedAt">),
    id,
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(),
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : new Date(),
  } as Play;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Save (create or overwrite) a play document in Firestore.
 * Uses setDoc with merge:false so the full document is always up to date.
 */
export async function savePlay(play: Play): Promise<void> {
  const ref = doc(db, "plays", play.id);
  await setDoc(ref, serialisePlay(play));
}

/**
 * Load a single play by ID. Returns null if not found.
 */
export async function loadPlay(playId: string): Promise<Play | null> {
  const snap = await getDoc(doc(db, "plays", playId));
  if (!snap.exists()) return null;
  return deserialisePlay(snap.id, snap.data());
}

/**
 * Delete a play document from Firestore.
 */
export async function deletePlay(playId: string): Promise<void> {
  await deleteDoc(doc(db, "plays", playId));
}

/**
 * Load all plays for a given team.
 * Returns an empty array if the team has no plays yet.
 */
export async function loadPlaysForTeam(teamId: string): Promise<Play[]> {
  const q = query(collection(db, "plays"), where("teamId", "==", teamId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => deserialisePlay(d.id, d.data()));
}

/**
 * Load all plays created by a specific user (for users without a team).
 */
export async function loadPlaysForUser(userId: string): Promise<Play[]> {
  const q = query(collection(db, "plays"), where("createdBy", "==", userId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => deserialisePlay(d.id, d.data()));
}
