"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { subscribeToComments } from "@/lib/comments";

const NONE: Record<string, number> = {};

/**
 * Open (unresolved) comment counts per scene id for a play, live.
 * Used by the scene strip dots and the header badge, so both are right from
 * the moment the editor opens. Empty while signed out or with no play.
 * Each caller holds its own listener; Firestore serves identical queries from
 * one server stream.
 */
export function useOpenCommentCounts(playId: string | undefined): Record<string, number> {
  const { user } = useAuth();
  const [counts, setCounts] = useState<Record<string, number>>(NONE);
  const uid = user?.uid;

  useEffect(() => {
    // Another play's counts (or a signed-out user's) must not linger.
    setCounts(NONE);
    if (!playId || !uid) return;
    return subscribeToComments(playId, (comments) => {
      const next: Record<string, number> = {};
      for (const c of comments) {
        if (c.sceneId && !c.resolved) next[c.sceneId] = (next[c.sceneId] ?? 0) + 1;
      }
      setCounts(next);
    });
  }, [playId, uid]);

  return counts;
}
