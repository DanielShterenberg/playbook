import { describe, expect, it } from "vitest";
import { APP_OWNER_EMAIL, isAppOwner, personLabel, playCounts, teamOfUser } from "@/lib/admin";
import type { TeamDoc } from "@/lib/team";
import type { Play } from "@/lib/types";

const team = (id: string, members: TeamDoc["members"]): TeamDoc => ({
  id,
  name: id.toUpperCase(),
  createdBy: "a",
  createdAt: new Date(0),
  inviteCode: "C" + id,
  members,
});

describe("isAppOwner", () => {
  it("is the owner's verified email only", () => {
    expect(isAppOwner({ email: APP_OWNER_EMAIL, emailVerified: true })).toBe(true);
    expect(isAppOwner({ email: APP_OWNER_EMAIL.toUpperCase(), emailVerified: true })).toBe(true);
    expect(isAppOwner({ email: APP_OWNER_EMAIL, emailVerified: false })).toBe(false);
    expect(isAppOwner({ email: "test@playbook.com", emailVerified: true })).toBe(false);
    expect(isAppOwner({ email: null, emailVerified: true })).toBe(false);
    expect(isAppOwner(null)).toBe(false);
  });

  it("matches the owner in firestore.rules", async () => {
    const { readFileSync } = await import("fs");
    const rules = readFileSync("firestore.rules", "utf8");
    expect(rules).toContain(`request.auth.token.email == "${APP_OWNER_EMAIL}"`);
  });
});

describe("admin lists", () => {
  const teams = [team("t1", { a: { role: "admin", name: "Ann" }, b: { role: "viewer", email: "b@x.com" } }), team("t2", { c: { role: "admin" } })];
  const users = [{ uid: "a", email: "a@x.com", name: "", createdAt: null }];

  it("names a person from their profile, else their team entry, else the id", () => {
    expect(personLabel("a", users, teams)).toBe("a@x.com");
    expect(personLabel("b", users, teams)).toBe("b@x.com");
    expect(personLabel("zz", users, teams)).toBe("zz");
  });

  it("finds a user's team from the members map", () => {
    expect(teamOfUser("b", teams)?.id).toBe("t1");
    expect(teamOfUser("c", teams)?.id).toBe("t2");
    expect(teamOfUser("zz", teams)).toBeNull();
  });

  it("counts plays per team, personal under ''", () => {
    const plays = [{ teamId: "t1" }, { teamId: "t1" }, { teamId: "" }] as Play[];
    const counts = playCounts(plays);
    expect(counts.get("t1")).toBe(2);
    expect(counts.get("")).toBe(1);
    expect(counts.get("t2")).toBeUndefined();
  });
});
