/**
 * Playbook grid filtering — which plays a search + filter chip selection shows.
 */

import type { Category, Play } from "./types";

/** A category, everything, or the member's own plays that are not in the team playbook. */
export type PlayFilter = Category | "all" | "personal";

/**
 * A play is "personal" when its owner is in a team but the play has not been
 * added to the team playbook. Without a team the word means nothing: every
 * play is the user's own.
 */
export function isPersonalPlay(play: Pick<Play, "teamId">, teamId: string | null | undefined): boolean {
  return Boolean(teamId) && !play.teamId;
}

/** The filter actually applied: "personal" falls back to "all" outside a team. */
export function effectivePlayFilter(filter: PlayFilter, teamId: string | null | undefined): PlayFilter {
  return filter === "personal" && !teamId ? "all" : filter;
}

/** Plays matching the title search and the filter chip, most recently updated first. */
export function filterPlays<P extends Pick<Play, "title" | "category" | "teamId" | "updatedAt">>(
  plays: readonly P[],
  opts: { search: string; filter: PlayFilter; teamId: string | null | undefined },
): P[] {
  const needle = opts.search.trim().toLowerCase();
  const filter = effectivePlayFilter(opts.filter, opts.teamId);
  return [...plays]
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .filter((p) => {
      if (needle && !p.title.toLowerCase().includes(needle)) return false;
      if (filter === "all") return true;
      if (filter === "personal") return isPersonalPlay(p, opts.teamId);
      return p.category === filter;
    });
}
