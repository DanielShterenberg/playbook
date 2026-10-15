/**
 * Archiving writes one field (setPlayArchived); a play save from an editor
 * holding an older copy must not write `archived` back (owner request: archive).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const dbSrc = readFileSync(path.resolve(process.cwd(), "src/lib/db.ts"), "utf8");

describe("saving a play keeps its archived flag", () => {
  it("serialisePlay leaves `archived` out", () => {
    const fn = dbSrc.slice(dbSrc.indexOf("function serialisePlay("), dbSrc.indexOf("function deserialisePlay("));
    expect(fn).toMatch(/delete fields\.archived;/);
  });

  it("savePlay writes only the fields it sends (mergeFields), so the stored flag survives", () => {
    const fn = dbSrc.slice(dbSrc.indexOf("export async function savePlay("), dbSrc.indexOf("export async function loadPlay("));
    expect(fn).toMatch(/setDoc\(ref, data, \{ mergeFields: Object\.keys\(data\) \}\)/);
  });

  it("setPlayArchived writes the flag alone", () => {
    const fn = dbSrc.slice(dbSrc.indexOf("export async function setPlayArchived("));
    expect(fn).toMatch(/updateDoc\(doc\(db, "plays", playId\), \{ archived \}\)/);
  });
});
