"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { subscribeToComments } from "@/lib/comments";

export interface OpenCommentCounts {
  /** Open comments per scene id (the scene strip dots). */
  byScene: Record<string, number>;
  /** Every open comment on the play, play-level ones included (the header badge). */
  total: number;
}

const NONE: OpenCommentCounts = { byScene: {}, total: 0 };

function sameCounts(a: OpenCommentCounts, b: OpenCommentCounts): boolean {
  const keys = Object.keys(a.byScene);
  return (
    a.total === b.total &&
    keys.length === Object.keys(b.byScene).length &&
    keys.every((k) => a.byScene[k] === b.byScene[k])
  );
}

/**
 * Open (unresolved) comment counts for a play, live. Used by the scene strip
 * dots and the header badge, so both are right from the moment the editor
 * opens. Empty while signed out or with no play.
 *
 * Each caller holds its own listener; Firestore serves identical queries from
 * one server stream. A snapshot that changes no count (a reply, an edit) does
 * not re-render the caller.
 */
export function useOpenCommentCounts(playId: string | undefined): OpenCommentCounts {
  const { user } = useAuth();
  const [counts, setCounts] = useState<OpenCommentCounts>(NONE);
  const uid = user?.uid;

  useEffect(() => {
    // Another play's counts (or a signed-out user's) must not linger.
    setCounts(NONE);
    if (!playId || !uid) return;
    return subscribeToComments(playId, (comments) => {
      const next: OpenCommentCounts = { byScene: {}, total: 0 };
      for (const c of comments) {
        if (c.resolved) continue;
        next.total += 1;
        if (c.sceneId) next.byScene[c.sceneId] = (next.byScene[c.sceneId] ?? 0) + 1;
      }
      setCounts((prev) => (sameCounts(prev, next) ? prev : next));
    });
  }, [playId, uid]);

  return counts;
}
