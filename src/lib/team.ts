/**
 * Firestore operations for teams, invite codes, and share tokens.
 *
 * Implements issues #74 (team creation), #75 (invite links), #78 (share links).
 *
 * Data model:
 *   teams/{teamId}           — { name, createdBy, createdAt, members: { [uid]: { role } }, inviteCode }
 *   users/{userId}           — { teamId, role } cached fields updated on join/create
 *   sharedPlays/{shareToken} — { playId, createdBy, snapshot: Play }
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  serverTimestamp,
  Timestamp,
  type DocumentData,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Play, Role } from "./types";
import { serialisePlayForShare } from "./db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TeamDoc {
  id: string;
  name: string;
  createdBy: string;
  createdAt: Date;
  members: Record<string, { role: Role }>;
  inviteCode: string;
}

export interface ShareToken {
  shareToken: string;
  playId: string;
  createdBy: string;
  snapshot: Play;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a random invite code (6 uppercase chars). */
function randomInviteCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

/** Generate a random share token (16 chars). */
function randomShareToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(10)))
    .map((b) => b.toString(36))
    .join("")
    .slice(0, 16);
}

function deserialiseTeam(id: string, data: DocumentData): TeamDoc {
  return {
    id,
    name: data.name as string,
    createdBy: data.createdBy as string,
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(),
    members: (data.members ?? {}) as Record<string, { role: Role }>,
    inviteCode: data.inviteCode as string,
  };
}

// ---------------------------------------------------------------------------
// Team CRUD (#74)
// ---------------------------------------------------------------------------

/**
 * Create a new team and add the creator as admin.
 * Also updates the user's document with the new teamId.
 */
export async function createTeam(name: string, userId: string): Promise<TeamDoc> {
  const teamId = doc(collection(db, "teams")).id;
  const inviteCode = randomInviteCode();

  const teamData = {
    name: name.trim(),
    createdBy: userId,
    createdAt: serverTimestamp(),
    inviteCode,
    members: {
      [userId]: { role: "admin" as Role },
    },
  };

  await setDoc(doc(db, "teams", teamId), teamData);

  // Cache teamId + role on the user's own document
  await updateDoc(doc(db, "users", userId), { teamId, role: "admin" });

  return {
    id: teamId,
    name: name.trim(),
    createdBy: userId,
    createdAt: new Date(),
    members: { [userId]: { role: "admin" } },
    inviteCode,
  };
}

/**
 * Load a team by its ID. Returns null if not found.
 */
export async function loadTeam(teamId: string): Promise<TeamDoc | null> {
  const snap = await getDoc(doc(db, "teams", teamId));
  if (!snap.exists()) return null;
  return deserialiseTeam(snap.id, snap.data());
}

// ---------------------------------------------------------------------------
// Invite links (#75)
// ---------------------------------------------------------------------------

/**
 * Look up a team by invite code and add the user as a viewer.
 * Returns the team document on success.
 */
export async function joinTeamByInviteCode(
  inviteCode: string,
  userId: string,
): Promise<TeamDoc> {
  // Find team with this invite code
  const q = query(collection(db, "teams"), where("inviteCode", "==", inviteCode.toUpperCase()));
  const snap = await getDocs(q);

  if (snap.empty) {
    throw new Error("Invalid invite code. Please check and try again.");
  }

  const teamDoc = snap.docs[0];
  const team = deserialiseTeam(teamDoc.id, teamDoc.data());

  // Already a member — return without modifying
  if (team.members[userId]) return team;

  // Add the user with viewer role
  await updateDoc(doc(db, "teams", team.id), {
    [`members.${userId}`]: { role: "viewer" as Role },
  });

  // Cache teamId + role on user doc
  await updateDoc(doc(db, "users", userId), { teamId: team.id, role: "viewer" });

  return {
    ...team,
    members: { ...team.members, [userId]: { role: "viewer" } },
  };
}

/**
 * Return the user's cached teamId and role from their user document.
 * Returns null if the user has no team.
 */
export async function loadUserTeamInfo(
  userId: string,
): Promise<{ teamId: string; role: Role } | null> {
  const snap = await getDoc(doc(db, "users", userId));
  if (!snap.exists()) return null;
  const data = snap.data();
  if (!data.teamId) return null;
  return { teamId: data.teamId as string, role: (data.role ?? "viewer") as Role };
}

// ---------------------------------------------------------------------------
// Share tokens (#78)
// ---------------------------------------------------------------------------

/**
 * Create a share token for a play. Stores a snapshot of the play so the
 * read-only view works even without the viewer having Firestore access to
 * the original play document.
 */
export async function createShareToken(play: Play, createdBy: string): Promise<string> {
  const shareToken = randomShareToken();
  await setDoc(doc(db, "sharedPlays", shareToken), {
    playId: play.id,
    createdBy,
    snapshot: serialisePlayForShare(play),
    createdAt: serverTimestamp(),
  });
  return shareToken;
}

/**
 * Load a shared play snapshot by its token.
 * Returns null if the token does not exist.
 */
export async function loadSharedPlay(shareToken: string): Promise<Play | null> {
  const snap = await getDoc(doc(db, "sharedPlays", shareToken));
  if (!snap.exists()) return null;
  const data = snap.data();
  // The snapshot is stored as a plain object; deserialise dates
  const snapshot = data.snapshot as unknown as Play;
  return {
    ...snapshot,
    createdAt:
      data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(),
    updatedAt: new Date(),
  };
}
