/**
 * Tests for export.ts — text helpers shared by the exporters.
 */

import { describe, it, expect } from "vitest";
import { asciiPunctuation, exportFileBase, fitText, needsRasterText, startsRightToLeft } from "@/lib/export";

describe("exportFileBase", () => {
  it("keeps letters and digits, dashes the spaces, drops the rest", () => {
    expect(exportFileBase("Horns Flare #2 (v3)")).toBe("Horns-Flare-2-v3");
    expect(exportFileBase("  a/b\\c:d*e?  ")).toBe("abcde");
  });

  it("keeps Hebrew titles instead of emptying them", () => {
    expect(exportFileBase("הורנס Flare")).toBe("הורנס-Flare");
    expect(exportFileBase("מכבי קדימה")).toBe("מכבי-קדימה");
  });

  it("treats any whitespace or dash as a word break", () => {
    expect(exportFileBase("Horns\u00a0Flare")).toBe("Horns-Flare");
    expect(exportFileBase("Horns\tFlare\nv2")).toBe("Horns-Flare-v2");
    expect(exportFileBase("Horns–Flare — v2")).toBe("Horns-Flare-v2");
  });

  it("falls back to 'play' when nothing usable is left", () => {
    expect(exportFileBase("???")).toBe("play");
    expect(exportFileBase("")).toBe("play");
    expect(exportFileBase(null)).toBe("play");
  });
});

describe("needsRasterText", () => {
  it("is false for Latin-1 text, which jsPDF's built-in fonts can draw", () => {
    expect(needsRasterText("Horns Flare 2-3 (v2) café")).toBe(false);
    expect(needsRasterText("Écran · 1")).toBe(false);
  });

  it("is true for Hebrew, other scripts and typographic punctuation", () => {
    expect(needsRasterText("הורנס")).toBe(true);
    expect(needsRasterText("Flare הורנס")).toBe(true);
    expect(needsRasterText("плей")).toBe(true);
    expect(needsRasterText("Horns — Flare")).toBe(true);
  });
});

describe("asciiPunctuation", () => {
  it("makes auto-typed punctuation drawable as real PDF text", () => {
    const title = "Coach’s “Flare” — v2…";
    expect(asciiPunctuation(title)).toBe("Coach's \"Flare\" - v2...");
    expect(needsRasterText(asciiPunctuation(title))).toBe(false);
  });

  it("leaves Hebrew alone", () => {
    expect(asciiPunctuation("הורנס")).toBe("הורנס");
  });
});

describe("startsRightToLeft", () => {
  it("follows the first strong character, like dir=auto", () => {
    expect(startsRightToLeft("הורנס Flare")).toBe(true);
    expect(startsRightToLeft("Flare הורנס")).toBe(false);
    expect(startsRightToLeft("(2) הורנס")).toBe(true);
    expect(startsRightToLeft("123")).toBe(false);
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

  it("does not leave a space before the ellipsis", () => {
    expect(fitText("Horns Flare", 7, width)).toBe("Horns…");
  });

  it("never splits a letter from its marks", () => {
    // שׁ = shin + shin dot (two code points, one character)
    expect(fitText("שׁשׁשׁ", 2, (t) => Array.from(t.replace(/\u05c1/g, "")).length)).toBe("שׁ…");
  });

  it("always keeps at least one character", () => {
    expect(fitText("Horns", 0, width)).toBe("H…");
  });
});
