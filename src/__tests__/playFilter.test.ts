/**
 * Tests for playFilter.ts — the playbook grid's search + chip filtering.
 */

import { describe, it, expect } from "vitest";
import { effectivePlayFilter, filterPlays, isPersonalPlay } from "@/lib/playFilter";
import type { Category } from "@/lib/types";

const play = (title: string, category: Category, teamId: string, day: number) => ({
  title,
  category,
  teamId,
  updatedAt: new Date(2026, 0, day),
});

const PLAYS = [
  play("Horns Flare", "offense", "t1", 1),
  play("2-3 Zone", "defense", "t1", 3),
  play("Five Out", "offense", "", 2),
];

describe("isPersonalPlay", () => {
  it("is a play without a team, owned by a team member", () => {
    expect(isPersonalPlay({ teamId: "" }, "t1")).toBe(true);
    expect(isPersonalPlay({ teamId: "t1" }, "t1")).toBe(false);
  });

  it("is never true for a user without a team", () => {
    expect(isPersonalPlay({ teamId: "" }, null)).toBe(false);
  });
});

describe("filterPlays", () => {
  const titles = (opts: Parameters<typeof filterPlays>[1]) => filterPlays(PLAYS, opts).map((p) => p.title);

  it("lists everything, most recently updated first", () => {
    expect(titles({ search: "", filter: "all", teamId: "t1" })).toEqual(["2-3 Zone", "Five Out", "Horns Flare"]);
  });

  it("filters by category", () => {
    expect(titles({ search: "", filter: "offense", teamId: "t1" })).toEqual(["Five Out", "Horns Flare"]);
  });

  it("Personal lists exactly the plays that carry the Personal badge", () => {
    const shown = filterPlays(PLAYS, { search: "", filter: "personal", teamId: "t1" });
    expect(shown).toEqual(PLAYS.filter((p) => isPersonalPlay(p, "t1")));
    expect(shown.map((p) => p.title)).toEqual(["Five Out"]);
  });

  it("a stale Personal selection outside a team shows everything, not nothing", () => {
    expect(effectivePlayFilter("personal", null)).toBe("all");
    expect(titles({ search: "", filter: "personal", teamId: null })).toHaveLength(3);
  });

  it("combines the title search (case-insensitive, trimmed) with the chip", () => {
    expect(titles({ search: " FIVE ", filter: "offense", teamId: "t1" })).toEqual(["Five Out"]);
    expect(titles({ search: "zone", filter: "offense", teamId: "t1" })).toEqual([]);
  });
});
