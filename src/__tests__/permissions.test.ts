import { describe, expect, it } from "vitest";
import { ASSIGNABLE_ROLES, canAddToTeam, canEditPlay } from "@/lib/permissions";

describe("canEditPlay", () => {
  const mine = { createdBy: "me" };
  const theirs = { createdBy: "coach" };

  it("lets admins, editors and solo users edit any play they open", () => {
    for (const role of ["admin", "editor", null, undefined] as const) {
      expect(canEditPlay(role, theirs, "me")).toBe(true);
    }
  });

  it("lets a viewer edit only the plays they created", () => {
    expect(canEditPlay("viewer", mine, "me")).toBe(true);
    expect(canEditPlay("viewer", theirs, "me")).toBe(false);
  });

  it("keeps a viewer read-only until the play and the user are known", () => {
    expect(canEditPlay("viewer", null, "me")).toBe(false);
    expect(canEditPlay("viewer", mine, null)).toBe(false);
    expect(canEditPlay("viewer", { createdBy: "" }, "")).toBe(false);
  });
});

describe("canAddToTeam", () => {
  it("is admins and editors only", () => {
    expect(canAddToTeam("admin")).toBe(true);
    expect(canAddToTeam("editor")).toBe(true);
    expect(canAddToTeam("viewer")).toBe(false);
    expect(canAddToTeam(null)).toBe(false);
  });
});

describe("ASSIGNABLE_ROLES", () => {
  it("never hands out admin from the team page", () => {
    expect(ASSIGNABLE_ROLES).toEqual(["viewer", "editor"]);
  });
});
