/**
 * Tests for export.ts — text helpers shared by the exporters.
 */

import { describe, it, expect } from "vitest";
import { exportFileBase, fitText, needsRasterText } from "@/lib/export";

describe("exportFileBase", () => {
  it("keeps letters and digits, dashes the spaces, drops the rest", () => {
    expect(exportFileBase("Horns Flare #2 (v3)")).toBe("Horns-Flare-2-v3");
    expect(exportFileBase("  a/b\\c:d*e?  ")).toBe("abcde");
  });

  it("keeps Hebrew titles instead of emptying them", () => {
    expect(exportFileBase("הורנס Flare")).toBe("הורנס-Flare");
    expect(exportFileBase("מכבי קדימה")).toBe("מכבי-קדימה");
  });

  it("falls back to 'play' when nothing usable is left", () => {
    expect(exportFileBase("???")).toBe("play");
    expect(exportFileBase("")).toBe("play");
    expect(exportFileBase(null)).toBe("play");
  });
});

describe("needsRasterText", () => {
  it("is false for text jsPDF's built-in fonts can draw", () => {
    expect(needsRasterText("Horns Flare — no, plain: Horns Flare 2-3")).toBe(true); // em dash is outside Latin-1
    expect(needsRasterText("Horns Flare 2-3 (v2) café")).toBe(false);
  });

  it("is true for Hebrew and other scripts", () => {
    expect(needsRasterText("הורנס")).toBe(true);
    expect(needsRasterText("Flare הורנס")).toBe(true);
    expect(needsRasterText("Écran · 1")).toBe(false); // É and · are Latin-1
    expect(needsRasterText("плей")).toBe(true);
  });
});

describe("fitText", () => {
  const width = (t: string) => t.length; // one unit per character

  it("returns text that already fits unchanged", () => {
    expect(fitText("Flare", 5, width)).toBe("Flare");
  });

  it("cuts with the ellipsis so the result fits", () => {
    expect(fitText("Horns Flare", 6, width)).toBe("Horns…");
    expect(fitText("Horns Flare", 8, width, "...")).toBe("Horns...");
  });

  it("always keeps at least one character", () => {
    expect(fitText("Horns", 0, width)).toBe("H…");
  });
});
