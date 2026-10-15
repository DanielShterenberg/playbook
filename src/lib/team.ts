/**
 * Firestore operations for teams, join requests, invite codes, and share tokens.
 *
 * Implements issues #74 (team creation), #75 (invite links), #78 (share links).
 *
 * Data model:
 *   teams/{teamId}                 — { name, createdBy, createdAt, inviteCode,
 *                                      members: { [uid]: { role, name?, email? } } }
 *                                    The members map is the truth for who is in
 *                                    the team and with which role (the rules read it).
 *   teams/{teamId}/requests/{uid}  — { uid, name, email, status, createdAt }: a
 *                                    join request from the invite link, approved
 *                                    or declined by an admin
 *   invites/{inviteCode}           — { teamId, teamName }: lets someone outside
 *                                    the team find it from the link
 *   users/{userId}                 — { teamId, pendingTeamId?, pendingTeamName? }:
 *                                    where the app looks first; checked against
 *                                    the members map on every load
 *   sharedPlays/{shareToken}       — { playId, createdBy, snapshot: Play, teamName? }
 *
 * Joining: the invite link files a request (requestToJoin); an admin approves
 * it (approveRequest adds the member) or declines it; the requester's app sees
 * the approval and records the team on their own user document (completeJoin).
 */

import {
  collection,
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  serverTimestamp,
  Timestamp,
  type DocumentData,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Play, Role } from "./types";
import { serialisePlayForShare } from "./db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A member's entry in the team document. Name and email are written by the member's own app. */
export interface TeamMemberEntry {
  role: Role;
  name?: string;
  email?: string;
}

export interface TeamDoc {
  id: string;
  name: string;
  createdBy: string;
  createdAt: Date;
  members: Record<string, TeamMemberEntry>;
  inviteCode: string;
}

export type JoinRequestStatus = "pending" | "approved" | "declined";

export interface JoinRequest {
  uid: string;
  name: string;
  email: string;
  status: JoinRequestStatus;
  createdAt: Date;
}

/** What the signed-in user's own document says about their team. */
export interface UserTeamInfo {
  teamId: string | null;
  pendingTeamId: string | null;
  pendingTeamName: string | null;
}

/** Longest name / email copied into a team document or a request. */
const PROFILE_MAX = 100;

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

function cleanProfile(value: string | null | undefined): string {
  return (value ?? "").trim().slice(0, PROFILE_MAX);
}

function deserialiseTeam(id: string, data: DocumentData): TeamDoc {
  return {
    id,
    name: data.name as string,
    createdBy: data.createdBy as string,
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(),
    members: (data.members ?? {}) as Record<string, TeamMemberEntry>,
    inviteCode: data.inviteCode as string,
  };
}

function deserialiseRequest(data: DocumentData): JoinRequest {
  return {
    uid: data.uid as string,
    name: (data.name as string) ?? "",
    email: (data.email as string) ?? "",
    status: (data.status as JoinRequestStatus) ?? "pending",
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(),
  };
}

// ---------------------------------------------------------------------------
// Team CRUD (#74)
// ---------------------------------------------------------------------------

/**
 * Upsert the invite document (code → team) so that someone outside the team
 * can find it from the link. Admins only (rules). Idempotent.
 */
export async function ensureInviteDoc(inviteCode: string, teamId: string, teamName: string): Promise<void> {
  await setDoc(doc(db, "invites", inviteCode.toUpperCase()), { teamId, teamName: teamName.trim().slice(0, 80) }, { merge: true });
}

/**
 * Create a new team and add the creator as admin.
 * Also updates the user's document with the new teamId.
 */
export async function createTeam(
  name: string,
  user: { uid: string; displayName: string | null; email: string | null },
): Promise<TeamDoc> {
  const teamId = doc(collection(db, "teams")).id;
  const inviteCode = randomInviteCode();
  const member: TeamMemberEntry = { role: "admin", name: cleanProfile(user.displayName), email: cleanProfile(user.email) };

  const teamData = {
    name: name.trim(),
    createdBy: user.uid,
    createdAt: serverTimestamp(),
    inviteCode,
    members: { [user.uid]: member },
  };

  await setDoc(doc(db, "teams", teamId), teamData);

  // Write invite lookup document so new users can find the team from the link
  await ensureInviteDoc(inviteCode, teamId, name);

  // Record the team on the user's own document
  await setDoc(doc(db, "users", user.uid), { teamId, role: "admin" }, { merge: true });

  return {
    id: teamId,
    name: name.trim(),
    createdBy: user.uid,
    createdAt: new Date(),
    members: { [user.uid]: member },
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

/**
 * Follow a team document. `onError` fires when it can no longer be read — the
 * user is not (or no longer) a member.
 */
export function subscribeToTeam(
  teamId: string,
  onTeam: (team: TeamDoc | null) => void,
  onError: () => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, "teams", teamId),
    (snap) => onTeam(snap.exists() ? deserialiseTeam(snap.id, snap.data()) : null),
    () => onError(),
  );
}

/** Keep the signed-in member's own name and email in the members map current. */
export async function updateOwnMemberProfile(
  teamId: string,
  uid: string,
  entry: TeamMemberEntry,
  profile: { name: string | null; email: string | null },
): Promise<void> {
  const name = cleanProfile(profile.name);
  const email = cleanProfile(profile.email);
  if (entry.name === name && entry.email === email) return;
  await updateDoc(doc(db, "teams", teamId), { [`members.${uid}`]: { role: entry.role, name, email } });
}

/** Remove a member (admins only). Their own app notices and drops the team. */
export async function removeMember(teamId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, "teams", teamId), { [`members.${uid}`]: deleteField() });
}

// ---------------------------------------------------------------------------
// Joining: invite link → request → approval
// ---------------------------------------------------------------------------

export type RequestToJoinResult =
  | { status: "member"; teamId: string }
  | { status: "other-team" }
  | { status: "pending"; teamId: string; teamName: string };

/**
 * Redeem an invite link: file a join request for the team the code points
 * to (or find that the user is already in it). A user is in one team at a time.
 */
export async function requestToJoin(
  inviteCode: string,
  user: { uid: string; displayName: string | null; email: string | null },
  currentTeamId: string | null,
): Promise<RequestToJoinResult> {
  const inviteSnap = await getDoc(doc(db, "invites", inviteCode.toUpperCase()));
  if (!inviteSnap.exists()) {
    throw new Error("This invite link is not valid. Ask the team admin for a new one.");
  }
  const teamId = inviteSnap.data().teamId as string;
  const teamName = ((inviteSnap.data().teamName as string | undefined) ?? "").trim() || "the team";

  if (currentTeamId === teamId) return { status: "member", teamId };
  if (currentTeamId) return { status: "other-team" };

  await setDoc(doc(db, "teams", teamId, "requests", user.uid), {
    uid: user.uid,
    name: cleanProfile(user.displayName),
    email: cleanProfile(user.email),
    status: "pending",
    createdAt: serverTimestamp(),
  });
  await setDoc(doc(db, "users", user.uid), { pendingTeamId: teamId, pendingTeamName: teamName }, { merge: true });
  return { status: "pending", teamId, teamName };
}

/** Follow the signed-in user's own request to a team (null: there is none). */
export function subscribeToMyRequest(
  teamId: string,
  uid: string,
  onRequest: (request: JoinRequest | null) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, "teams", teamId, "requests", uid),
    (snap) => onRequest(snap.exists() ? deserialiseRequest(snap.data()) : null),
    () => onRequest(null),
  );
}

/** Follow a team's pending requests (admins). */
export function subscribeToPendingRequests(
  teamId: string,
  onRequests: (requests: JoinRequest[]) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, "teams", teamId, "requests"), where("status", "==", "pending")),
    (snap) =>
      onRequests(
        snap.docs.map((d) => deserialiseRequest(d.data())).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
      ),
    (err) => {
      console.warn(`Join requests unavailable for team ${teamId}: ${err.code}`);
      onRequests([]);
    },
  );
}

/** Approve a request: the requester becomes a viewer (admins only). */
export async function approveRequest(teamId: string, request: JoinRequest): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(db, "teams", teamId), {
    [`members.${request.uid}`]: { role: "viewer", name: request.name, email: request.email },
  });
  batch.update(doc(db, "teams", teamId, "requests", request.uid), { status: "approved" });
  await batch.commit();
}

/** Decline a request (admins only). The requester can ask again from the link. */
export async function declineRequest(teamId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, "teams", teamId, "requests", uid), { status: "declined" });
}

/** The user's own document: their team, and a team they asked to join. */
export async function loadUserTeamInfo(userId: string): Promise<UserTeamInfo> {
  const snap = await getDoc(doc(db, "users", userId));
  const data = snap.exists() ? snap.data() : {};
  return {
    teamId: (data.teamId as string | undefined) || null,
    pendingTeamId: (data.pendingTeamId as string | undefined) || null,
    pendingTeamName: (data.pendingTeamName as string | undefined) || null,
  };
}

/** Record an approved join on the user's own document. */
export async function completeJoin(userId: string, teamId: string): Promise<void> {
  await setDoc(
    doc(db, "users", userId),
    { teamId, role: "viewer", pendingTeamId: deleteField(), pendingTeamName: deleteField() },
    { merge: true },
  );
}

/** Forget a team the user is no longer in (removed by an admin). */
export async function forgetTeam(userId: string): Promise<void> {
  await setDoc(doc(db, "users", userId), { teamId: deleteField(), role: deleteField() }, { merge: true });
}

/** Forget a declined request, so the app stops showing it. */
export async function forgetPendingTeam(userId: string): Promise<void> {
  await setDoc(doc(db, "users", userId), { pendingTeamId: deleteField(), pendingTeamName: deleteField() }, { merge: true });
}

// ---------------------------------------------------------------------------
// Share tokens (#78)
// ---------------------------------------------------------------------------

/** A team name as stored on / read from a share link: trimmed, bounded text, or null. */
function cleanTeamName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value.trim().slice(0, 80) || null;
}

/**
 * Create a share token for a play. Stores a snapshot of the play so the
 * read-only view works even without the viewer having Firestore access to
 * the original play document.
 */
export async function createShareToken(
  play: Play,
  createdBy: string,
  teamName?: string | null,
): Promise<string> {
  const shareToken = randomShareToken();
  const name = cleanTeamName(teamName);
  await setDoc(doc(db, "sharedPlays", shareToken), {
    playId: play.id,
    createdBy,
    snapshot: serialisePlayForShare(play),
    // Shown under the title in the public viewer, which cannot read teams/.
    ...(name ? { teamName: name } : {}),
    createdAt: serverTimestamp(),
  });
  return shareToken;
}

export interface SharedPlay {
  play: Play;
  /** Name of the team the play belonged to when shared; null for personal plays and older links. */
  teamName: string | null;
}

/**
 * Load a shared play snapshot by its token.
 * Returns null if the token does not exist.
 */
export async function loadSharedPlay(shareToken: string): Promise<SharedPlay | null> {
  const snap = await getDoc(doc(db, "sharedPlays", shareToken));
  if (!snap.exists()) return null;
  const data = snap.data();
  // The snapshot is stored as a plain object; deserialise dates
  const snapshot = data.snapshot as unknown as Play;
  return {
    play: {
      ...snapshot,
      createdAt:
        data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(),
      updatedAt: new Date(),
    },
    teamName: cleanTeamName(data.teamName),
  };
}
