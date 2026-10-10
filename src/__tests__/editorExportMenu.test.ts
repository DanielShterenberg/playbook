/**
 * ExportMenu → exportSceneAsPNG call-site pin.
 *
 * The PNG export must describe the play the same way the MP4 export does:
 * court variant, label mode, player names and team colours. Without the
 * options argument a full-court play is taped as a half-court frame.
 *
 * ExportMenu.tsx cannot be imported under Vitest (tsconfig `jsx: preserve`,
 * no DOM), so this is a static pin: the source is parsed with the TypeScript
 * compiler and the call's arguments are inspected in the AST.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const FILE = path.resolve(process.cwd(), "src/components/editor/ExportMenu.tsx");
const source = ts.createSourceFile(FILE, readFileSync(FILE, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function findCalls(name: string): ts.CallExpression[] {
  const found: ts.CallExpression[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name) {
      found.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** Object literal → { propertyName: initializer source text }. */
function objectProps(node: ts.Expression): Record<string, string> {
  if (!ts.isObjectLiteralExpression(node)) throw new Error("expected an object literal");
  const out: Record<string, string> = {};
  for (const p of node.properties) {
    if (ts.isPropertyAssignment(p)) out[p.name.getText(source)] = p.initializer.getText(source);
    else if (ts.isShorthandPropertyAssignment(p)) out[p.name.text] = p.name.text;
    else throw new Error(`unexpected property kind in options: ${p.getText(source)}`);
  }
  return out;
}

/** The enclosing useCallback's dependency identifiers. */
function enclosingCallbackDeps(node: ts.Node): string[] {
  let cur: ts.Node | undefined = node;
  while (cur) {
    if (ts.isCallExpression(cur) && ts.isIdentifier(cur.expression) && cur.expression.text === "useCallback") {
      const deps = cur.arguments[1];
      if (!deps || !ts.isArrayLiteralExpression(deps)) throw new Error("useCallback without a deps array");
      return deps.elements.map((e) => e.getText(source));
    }
    cur = cur.parent;
  }
  throw new Error("not inside useCallback");
}

describe("ExportMenu PNG export call", () => {
  const calls = findCalls("exportSceneAsPNG");

  it("has exactly one call site", () => {
    expect(calls).toHaveLength(1);
  });

  it("passes the options argument after flipped", () => {
    const args = calls[0].arguments;
    expect(args).toHaveLength(6);
    expect(args[4].getText(source)).toBe("flipped");
  });

  it("passes the play's court variant, label mode, names and team colours", () => {
    expect(objectProps(calls[0].arguments[5])).toEqual({
      variant: "currentPlay?.courtType",
      displayMode: "displayMode",
      playerNames: "playerNames",
      offenseColor: "currentPlay?.colors?.offense",
      defenseColor: "currentPlay?.colors?.defense",
    });
  });

  it("re-creates the handler when label mode or names change", () => {
    const deps = enclosingCallbackDeps(calls[0]);
    expect(deps).toEqual(expect.arrayContaining(["scene", "currentPlay", "pngResolution", "displayMode", "playerNames"]));
  });

  it("describes the play to PNG with the same option names the video export gets", () => {
    const video = findCalls("exportPlayAsVideo");
    expect(video).toHaveLength(1);
    const videoProps = objectProps(video[0].arguments[2]);
    const pngProps = objectProps(calls[0].arguments[5]);
    for (const key of ["displayMode", "playerNames", "offenseColor", "defenseColor"]) {
      expect(videoProps).toHaveProperty(key);
      expect(pngProps).toHaveProperty(key);
    }
  });
});

describe("ExportMenu PDF export call (issue #174)", () => {
  const calls = findCalls("exportPlayToPdf");

  it("has exactly one call site", () => {
    expect(calls).toHaveLength(1);
  });

  it("passes the PDF options plus label mode, names and team colours", () => {
    expect(calls[0].arguments).toHaveLength(2);
    expect(calls[0].arguments[0].getText(source)).toBe("currentPlay");
    expect(objectProps(calls[0].arguments[1])).toEqual({
      exportSteps: "pdfExportSteps",
      layout: "pdfLayout",
      displayMode: "displayMode",
      playerNames: "playerNames",
      offenseColor: "currentPlay.colors?.offense",
      defenseColor: "currentPlay.colors?.defense",
    });
  });

  it("re-creates the handler when label mode or names change", () => {
    const deps = enclosingCallbackDeps(calls[0]);
    expect(deps).toEqual(expect.arrayContaining(["currentPlay", "pdfExportSteps", "pdfLayout", "displayMode", "playerNames"]));
  });

  it("describes the play to the PDF with exactly the values the video export gets", () => {
    const videoProps = objectProps(findCalls("exportPlayAsVideo")[0].arguments[2]);
    const pdfProps = objectProps(calls[0].arguments[1]);
    for (const key of ["displayMode", "playerNames", "offenseColor", "defenseColor"]) {
      expect(pdfProps[key], key).toBe(videoProps[key]);
    }
  });

  it("offers no GIF export (exportPlayAsGIF stays uncalled until the owner decides)", () => {
    expect(findCalls("exportPlayAsGIF")).toHaveLength(0);
  });
});
