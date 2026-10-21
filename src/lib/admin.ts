/**
 * The app owner's view of everything: every team, person, play, share link
 * and comment, and deleting what should not be there (the /admin page).
 *
 * The Firestore rules decide who that is (isAppOwner: a verified sign-in
 * email); isAppOwner below only decides whether the app shows the page.
 *
 * Deleting a play also deletes its share links (they are frozen copies that
 * stay public otherwise) and its comments. Deleting a team deletes its plays
 * the same way, its join requests and its invite code; its members' apps
 * notice and drop the team.
 */

import { collection, deleteDoc, doc, getDocs, limit, orderBy, query, Timestamp, where } from "firebase/firestore";
import { db } from "./firebase";
import { deserialisePlay } from "./db";
import { deserialiseComment } from "./comments";
import { deserialiseTeam, type TeamDoc } from "./team";
import type { Comment, Play } from "./types";

/** Must match isAppOwner() in firestore.rules. */
export const APP_OWNER_EMAIL = "15daniel10@gmail.com";

/** The newest comments the page loads. */
export const ADMIN_COMMENT_LIMIT = 300;

export function isAppOwner(user: { email: string | null; emailVerified: boolean } | null | undefined): boolean {
  return Boolean(user && user.emailVerified && user.email?.toLowerCase() === APP_OWNER_EMAIL);
}

export interface AdminUser {
  uid: string;
  email: string;
  name: string;
  createdAt: Date | null;
}

export interface AdminShare {
  token: string;
  playId: string;
  createdBy: string;
  title: string;
  teamName: string | null;
  createdAt: Date | null;
}

export interface AdminData {
  teams: TeamDoc[];
  users: AdminUser[];
  plays: Play[];
  shares: AdminShare[];
  comments: Comment[];
}

const dateOf = (v: unknown): Date | null => (v instanceof Timestamp ? v.toDate() : null);
const textOf = (v: unknown): string => (typeof v === "string" ? v : "");

export async function loadAdminData(): Promise<AdminData> {
  const [teams, users, plays, shares, comments] = await Promise.all([
    getDocs(collection(db, "teams")),
    getDocs(collection(db, "users")),
    getDocs(collection(db, "plays")),
    getDocs(collection(db, "sharedPlays")),
    getDocs(query(collection(db, "comments"), orderBy("createdAt", "desc"), limit(ADMIN_COMMENT_LIMIT))),
  ]);
  return {
    teams: teams.docs.map((d) => deserialiseTeam(d.id, d.data())),
    users: users.docs.map((d) => {
      const u = d.data();
      return { uid: d.id, email: textOf(u.email), name: textOf(u.displayName), createdAt: dateOf(u.createdAt) };
    }),
    plays: plays.docs.map((d) => deserialisePlay(d.id, d.data())),
    shares: shares.docs.map((d) => {
      const s = d.data();
      const snapshot = (s.snapshot ?? {}) as { title?: unknown };
      return {
        token: d.id,
        playId: textOf(s.playId),
        createdBy: textOf(s.createdBy),
        title: textOf(snapshot.title),
        teamName: textOf(s.teamName) || null,
        createdAt: dateOf(s.createdAt),
      };
    }),
    comments: comments.docs.map((d) => deserialiseComment(d.id, d.data())),
  };
}

/** Who someone is, for the lists: name, else email, else their user id. */
export function personLabel(uid: string, users: AdminUser[], teams: TeamDoc[]): string {
  const user = users.find((u) => u.uid === uid);
  if (user && (user.name || user.email)) return user.name || user.email;
  for (const team of teams) {
    const m = team.members[uid];
    if (m && (m.name || m.email)) return (m.name || m.email) as string;
  }
  return uid;
}

/** The team each user is in (the members map is the truth). */
export function teamOfUser(uid: string, teams: TeamDoc[]): TeamDoc | null {
  return teams.find((t) => Boolean(t.members[uid])) ?? null;
}

/** Plays per team id ("" = personal plays). */
export function playCounts(plays: Play[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const p of plays) counts.set(p.teamId ?? "", (counts.get(p.teamId ?? "") ?? 0) + 1);
  return counts;
}

export async function deleteShare(token: string): Promise<void> {
  await deleteDoc(doc(db, "sharedPlays", token));
}

/** Delete a play with its share links and its comments. */
export async function deletePlayEverywhere(playId: string): Promise<void> {
  const [shares, comments] = await Promise.all([
    getDocs(query(collection(db, "sharedPlays"), where("playId", "==", playId))),
    getDocs(query(collection(db, "comments"), where("playId", "==", playId))),
  ]);
  await Promise.all([...shares.docs, ...comments.docs].map((d) => deleteDoc(d.ref)));
  await deleteDoc(doc(db, "plays", playId));
}

/** Delete a team with its plays (and their links and comments), requests and invite code. */
export async function deleteTeamEverywhere(team: TeamDoc, plays: Play[]): Promise<void> {
  for (const play of plays.filter((p) => p.teamId === team.id)) await deletePlayEverywhere(play.id);
  const requests = await getDocs(collection(db, "teams", team.id, "requests"));
  await Promise.all(requests.docs.map((d) => deleteDoc(d.ref)));
  if (team.inviteCode) await deleteDoc(doc(db, "invites", team.inviteCode));
  await deleteDoc(doc(db, "teams", team.id));
}
