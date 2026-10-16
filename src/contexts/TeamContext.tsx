"use client";

/**
 * TeamContext — provides the current team, the signed-in user's role in it,
 * and a join request they are waiting on.
 *
 * Implements issue #76: role-based UI enforcement.
 *
 * The user's own document says which team to look at (teamId) and which team
 * they asked to join (pendingTeamId). The team document is followed live and
 * is the truth: the role comes from its members map, and a user who is not in
 * it — removed by an admin — has no team (the stale teamId is forgotten).
 * A pending request is followed too: once an admin approves it the team is
 * recorded on the user's document and loaded.
 *
 * Usage:
 *   const { teamId, role, team, pending } = useTeam();
 *
 * role === null  → user has no team (solo user; all edit actions allowed)
 * role === "admin" | "editor" → full edit access
 * role === "viewer" → read-only; edit tools hidden
 */

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import {
  completeJoin,
  forgetTeam,
  loadUserTeamInfo,
  subscribeToMyRequest,
  subscribeToTeam,
  updateOwnMemberProfile,
  type JoinRequestStatus,
  type TeamDoc,
} from "@/lib/team";
import type { Role } from "@/lib/types";

/** A team the user asked to join and is not (yet) in. */
export interface PendingTeam {
  teamId: string;
  teamName: string;
  status: Exclude<JoinRequestStatus, "approved">;
}

interface TeamContextValue {
  teamId: string | null;
  role: Role | null;
  team: TeamDoc | null;
  /** A join request the user is waiting on, or was declined. */
  pending: PendingTeam | null;
  /** True until it is known whether the signed-in user has a team. */
  loading: boolean;
  /** Re-read the user's team (call after creating a team or asking to join one). */
  refresh: () => void;
}

const TeamContext = createContext<TeamContextValue>({
  teamId: null,
  role: null,
  team: null,
  pending: null,
  loading: true,
  refresh: () => {},
});

export function TeamProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [info, setInfo] = useState<{ teamId: string | null; pendingTeamId: string | null; pendingTeamName: string | null } | null>(null);
  const [team, setTeam] = useState<TeamDoc | null>(null);
  // The team id the subscription has answered for (a team, or "not a member").
  const [settledTeamId, setSettledTeamId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingTeam | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  // The user's own document: which team, which request.
  useEffect(() => {
    setInfo(null);
    setTeam(null);
    setPending(null);
    if (!uid) return;
    let cancelled = false;
    loadUserTeamInfo(uid)
      .then((i) => {
        if (!cancelled) setInfo(i);
      })
      .catch(() => {
        if (!cancelled) setInfo({ teamId: null, pendingTeamId: null, pendingTeamName: null });
      });
    return () => {
      cancelled = true;
    };
  }, [uid, tick]);

  // The team, live. Refused by the server, or confirmed without the user in
  // its members = not in the team, and the stale pointer is forgotten. An
  // answer from the offline cache never drops the team (it may be incomplete).
  const teamId = info?.teamId ?? null;
  useEffect(() => {
    if (!uid || !teamId) return;
    const dropTeam = () => {
      setTeam(null);
      setSettledTeamId(teamId);
      setInfo((i) => (i ? { ...i, teamId: null } : i));
      void forgetTeam(uid).catch(() => {});
    };
    return subscribeToTeam(
      teamId,
      (t, confirmed) => {
        if (t && t.members[uid]) {
          setTeam(t);
          setSettledTeamId(teamId);
        } else if (confirmed) dropTeam();
      },
      dropTeam,
    );
  }, [uid, teamId]);

  // Keep the member's own name and email in the team document.
  const entry = uid ? team?.members[uid] : undefined;
  useEffect(() => {
    if (!uid || !team || !entry || !user) return;
    void updateOwnMemberProfile(team.id, uid, entry, { name: user.displayName, email: user.email }).catch(() => {});
  }, [uid, team, entry, user]);

  // A request waiting for an admin: approved → record the team and load it.
  const pendingTeamId = teamId ? null : (info?.pendingTeamId ?? null);
  const pendingTeamName = info?.pendingTeamName ?? "";
  useEffect(() => {
    if (!uid || !pendingTeamId) {
      setPending(null);
      return;
    }
    return subscribeToMyRequest(pendingTeamId, uid, (request) => {
      if (request?.status === "approved") {
        setPending(null);
        // On failure nothing changes; the next load tries again (no retry loop).
        void completeJoin(uid, pendingTeamId).then(refresh, () => {});
      } else if (request) {
        setPending({ teamId: pendingTeamId, teamName: pendingTeamName, status: request.status });
      } else {
        setPending(null);
      }
    });
  }, [uid, pendingTeamId, pendingTeamName, refresh]);

  const role = uid && team ? (team.members[uid]?.role ?? null) : null;
  const loading = Boolean(uid) && (info === null || (teamId !== null && settledTeamId !== teamId));

  return (
    <TeamContext.Provider value={{ teamId: team ? team.id : null, role, team, pending, loading, refresh }}>
      {children}
    </TeamContext.Provider>
  );
}

export function useTeam(): TeamContextValue {
  return useContext(TeamContext);
}
