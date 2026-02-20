"use client";

/**
 * TeamContext — provides the current team and the signed-in user's role.
 *
 * Implements issue #76: role-based UI enforcement.
 *
 * After auth resolves, fetches the user's cached teamId + role from Firestore.
 * Re-fetches when the user changes (sign-in / sign-out).
 *
 * Usage:
 *   const { teamId, role, team } = useTeam();
 *
 * role === null  → user has no team (solo user; all edit actions allowed)
 * role === "admin" | "editor" → full edit access
 * role === "viewer" → read-only; edit tools hidden
 */

import { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import { loadUserTeamInfo, loadTeam, type TeamDoc } from "@/lib/team";
import type { Role } from "@/lib/types";

interface TeamContextValue {
  teamId: string | null;
  role: Role | null;
  team: TeamDoc | null;
  /** Re-fetch team info (call after creating or joining a team). */
  refresh: () => void;
}

const TeamContext = createContext<TeamContextValue>({
  teamId: null,
  role: null,
  team: null,
  refresh: () => {},
});

export function TeamProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [teamId, setTeamId] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [team, setTeam] = useState<TeamDoc | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!user) {
      setTeamId(null);
      setRole(null);
      setTeam(null);
      return;
    }

    let cancelled = false;

    const fetchTeam = async () => {
      try {
        const info = await loadUserTeamInfo(user.uid);
        if (cancelled) return;

        if (!info) {
          setTeamId(null);
          setRole(null);
          setTeam(null);
          return;
        }

        setTeamId(info.teamId);
        setRole(info.role);

        const teamDoc = await loadTeam(info.teamId);
        if (cancelled) return;
        setTeam(teamDoc);
      } catch {
        // Silently fall through — user may not have a team
        if (!cancelled) {
          setTeamId(null);
          setRole(null);
          setTeam(null);
        }
      }
    };

    void fetchTeam();
    return () => { cancelled = true; };
  }, [user, tick]);

  function refresh() {
    setTick((t) => t + 1);
  }

  return (
    <TeamContext.Provider value={{ teamId, role, team, refresh }}>
      {children}
    </TeamContext.Provider>
  );
}

export function useTeam(): TeamContextValue {
  return useContext(TeamContext);
}
