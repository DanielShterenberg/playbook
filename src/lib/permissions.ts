/**
 * Who may edit a play — the client half of the plays rule in firestore.rules.
 *
 * Admins and editors edit the team's plays; everyone edits the plays they
 * created themselves, so a viewer's own play is not read-only. Solo users
 * (no team, no role) edit everything they can open.
 */

import type { Play, Role } from "./types";

export function canEditPlay(role: Role | null | undefined, play: Pick<Play, "createdBy"> | null | undefined, uid: string | null | undefined): boolean {
  if (role !== "viewer") return true;
  return Boolean(play && uid && play.createdBy === uid);
}

/** Viewers keep their new plays personal; only admins and editors add plays to the team. */
export function canAddToTeam(role: Role | null | undefined): boolean {
  return role === "admin" || role === "editor";
}

/** The roles an admin can give a member from the team page; admin is not handed out. */
export const ASSIGNABLE_ROLES = ["viewer", "editor"] as const satisfies readonly Role[];
