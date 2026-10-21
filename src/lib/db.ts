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
  updateDoc,
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

/**
 * Serialise a play for storage in the sharedPlays snapshot field.
 * Unlike serialisePlay, this returns a plain JS object (not Firestore DocumentData)
 * so it can be stored as a nested map inside another document.
 */
export function serialisePlayForShare(play: Play): Record<string, unknown> {
  return {
    ...play,
    createdAt: play.createdAt instanceof Date ? play.createdAt.toISOString() : String(play.createdAt),
    updatedAt: play.updatedAt instanceof Date ? play.updatedAt.toISOString() : String(play.updatedAt),
  };
}

/**
 * Strip client-side Date objects before writing to Firestore. `archived` is
 * left out: it is written on its own (setPlayArchived) and a save from an
 * editor holding an older copy must not undo an archive or a restore.
 */
function serialisePlay(play: Play): DocumentData {
  const fields: Partial<Play> = { ...play };
  delete fields.archived;
  return {
    ...fields,
    // Dates → let Firestore manage them as server timestamps on first write;
    // subsequent saves keep the original createdAt and bump updatedAt.
    createdAt: play.createdAt instanceof Date ? Timestamp.fromDate(play.createdAt) : play.createdAt,
    updatedAt: serverTimestamp(),
  };
}

/** Convert Firestore document data back to a typed Play. */
export function deserialisePlay(id: string, data: DocumentData): Play {
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
 * Save (create or overwrite) a play document in Firestore: every field of
 * the play is written whole, except `archived` (see serialisePlay).
 */
export async function savePlay(play: Play): Promise<void> {
  const ref = doc(db, "plays", play.id);
  const data = serialisePlay(play);
  // Every written field is replaced whole; fields not written (`archived`) are kept.
  await setDoc(ref, data, { mergeFields: Object.keys(data) });
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

/**
 * Transfer a personal play to a team by setting its teamId field.
 * The play owner (admin/editor) must have write access to the document.
 */
export async function addPlayToTeam(playId: string, teamId: string): Promise<void> {
  await updateDoc(doc(db, "plays", playId), { teamId });
}

/** Archive or restore a play. Only the flag is written; the play is untouched. */
export async function setPlayArchived(playId: string, archived: boolean): Promise<void> {
  await updateDoc(doc(db, "plays", playId), { archived });
}
