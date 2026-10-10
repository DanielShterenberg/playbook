/**
 * Tests for courtRendering.ts — the single court drawing implementation.
 *
 * Vitest runs in Node (no DOM canvas), so every test draws into a recording
 * mock CanvasRenderingContext2D that logs method calls and property writes in
 * order. Two renderers produce the same pixels if their logs are equal.
 *
 * Three layers of protection:
 *   1. drawCourt here ≡ drawCourt exported by Court.tsx (while Court.tsx still
 *      has its own copy this is an independent oracle; once Court.tsx
 *      re-exports the shared one it is trivially true, and if it stops
 *      exporting drawCourt the comparison is skipped — both are fine).
 *   2. A pinned digest of each log, captured while (1) was an independent
 *      check — this keeps the drawing pinned after Court.tsx's copy is gone.
 *   3. paintCourt's log is checked compositionally against the exact
 *      transform sequence of Court.tsx's draw() callback (lines 375–422).
 */

import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  COLOR_COURT,
  DEFAULT_COLOR_PAINT,
  COLOR_LINE,
  COLOR_LINE_WIDTH_PX,
  drawHalfCourtInner,
  drawCourt,
  paintCourt,
} from "@/lib/courtRendering";
import { computeCourtLayout, normToCanvasPx, type CourtVariant } from "@/lib/courtLayout";
import { CENTRE_CIRCLE_RADIUS, LANE_TOP, LANE_LEFT, LANE_RIGHT } from "@/components/court/courtDimensions";
import * as courtDimensions from "@/components/court/courtDimensions";
import * as courtLayoutModule from "@/lib/courtLayout";
import * as courtRenderingModule from "@/lib/courtRendering";
import * as tokenSizingModule from "@/lib/tokenSizing";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";

// ---------------------------------------------------------------------------
// Court.tsx oracle
//
// Court.tsx cannot be imported directly here: the project tsconfig sets
// jsx: "preserve" (required by Next.js), which Vite cannot parse in a Node
// test run. Instead the file's source is transpiled on the fly with the
// TypeScript compiler and evaluated with its imports wired to the real
// modules. Nothing is rendered — only the exported drawCourt is used.
//
// If Court.tsx stops exporting drawCourt, or gains an import this loader does
// not know, the oracle resolves to null and the comparisons are skipped; the
// pinned digests below still guard the drawing.
// ---------------------------------------------------------------------------

type DrawCourtFn = typeof drawCourt;

function loadCourtTsxDrawCourt(): DrawCourtFn | null {
  try {
    const file = path.resolve(process.cwd(), "src/components/court/Court.tsx");
    const js = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
      fileName: file,
    }).outputText;
    const nodeRequire = createRequire(file);
    const shim = (id: string): unknown => {
      if (id === "./courtDimensions" || id === "@/components/court/courtDimensions") return courtDimensions;
      if (id === "@/lib/courtLayout") return courtLayoutModule;
      if (id === "@/lib/courtRendering") return courtRenderingModule;
      if (id === "@/lib/tokenSizing") return tokenSizingModule;
      if (id.startsWith(".") || id.startsWith("@/")) throw new Error(`unmapped import ${id}`);
      return nodeRequire(id);
    };
    const mod: { exports: Record<string, unknown> } = { exports: {} };
    new Function("require", "module", "exports", js)(shim, mod, mod.exports);
    return typeof mod.exports.drawCourt === "function" ? (mod.exports.drawCourt as DrawCourtFn) : null;
  } catch {
    return null;
  }
}

const courtTsxDrawCourt = loadCourtTsxDrawCourt();

// ---------------------------------------------------------------------------
// Recording mock context
// ---------------------------------------------------------------------------

type LogEntry = [op: string, ...args: unknown[]];

/** A CanvasRenderingContext2D stand-in that records every call and property write. */
function createRecordingCtx(): { ctx: CanvasRenderingContext2D; log: LogEntry[] } {
  const log: LogEntry[] = [];
  const props: Record<string, unknown> = {};
  const ctx = new Proxy(
    {},
    {
      get(_t, name) {
        if (typeof name !== "string") return undefined;
        if (name in props) return props[name];
        return (...args: unknown[]) => {
          log.push([name, ...args]);
        };
      },
      set(_t, name, value) {
        if (typeof name === "string") {
          props[name] = value;
          log.push([`set ${name}`, value]);
        }
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  return { ctx, log };
}

/** A canvas stand-in whose getContext("2d") returns the given context. */
function fakeCanvas(ctx: CanvasRenderingContext2D): HTMLCanvasElement {
  return { getContext: () => ctx } as unknown as HTMLCanvasElement;
}

function record(fn: (ctx: CanvasRenderingContext2D) => void): LogEntry[] {
  const { ctx, log } = createRecordingCtx();
  fn(ctx);
  return log;
}

/** Stable short digest of a log (numbers rounded to 1e-6 to be engine-proof). */
function digest(log: LogEntry[]): string {
  const json = JSON.stringify(log, (_k, v) => (typeof v === "number" ? Math.round(v * 1e6) / 1e6 : v));
  return createHash("sha256").update(json).digest("hex").slice(0, 16);
}

const ops = (log: LogEntry[]) => log.map((e) => e[0]);

// ---------------------------------------------------------------------------
// Mock sanity
// ---------------------------------------------------------------------------

describe("recording ctx", () => {
  it("logs calls and property writes in order", () => {
    const log = record((ctx) => {
      ctx.save();
      ctx.fillStyle = "#123456";
      ctx.fillRect(1, 2, 3, 4);
      ctx.setLineDash([1, 2]);
      ctx.restore();
    });
    expect(log).toEqual([
      ["save"],
      ["set fillStyle", "#123456"],
      ["fillRect", 1, 2, 3, 4],
      ["setLineDash", [1, 2]],
      ["restore"],
    ]);
  });
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe("colours", () => {
  it("are the editor's", () => {
    expect(COLOR_COURT).toBe("#F0C878");
    expect(DEFAULT_COLOR_PAINT).toBe("#E07B39");
    expect(COLOR_LINE).toBe("#FFFFFF");
    expect(COLOR_LINE_WIDTH_PX).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// drawHalfCourtInner
// ---------------------------------------------------------------------------

describe("drawHalfCourtInner", () => {
  const W = 754;
  const H = 709;
  const log = record((ctx) => drawHalfCourtInner(ctx, W, H));

  it("fills the floor then the paint, in that order", () => {
    expect(log.slice(0, 4)).toEqual([
      ["set fillStyle", COLOR_COURT],
      ["fillRect", 0, 0, W, H],
      ["set fillStyle", DEFAULT_COLOR_PAINT],
      ["fillRect", LANE_LEFT * W, LANE_TOP * H, LANE_RIGHT * W - LANE_LEFT * W, H - LANE_TOP * H],
    ]);
  });

  it("uses the given paint colour", () => {
    const custom = record((ctx) => drawHalfCourtInner(ctx, W, H, "#112233"));
    expect(custom[2]).toEqual(["set fillStyle", "#112233"]);
    // nothing else changes
    expect(custom.filter((_, i) => i !== 2)).toEqual(log.filter((_, i) => i !== 2));
  });

  it("balances save/restore and leaves the dash pattern reset", () => {
    const o = ops(log);
    expect(o.filter((x) => x === "save").length).toBe(o.filter((x) => x === "restore").length);
    const dashes = log.filter((e) => e[0] === "setLineDash");
    expect(dashes[dashes.length - 1]).toEqual(["setLineDash", []]);
  });

  it("draws 3-point arc counter-clockwise and FT / restricted arcs clockwise", () => {
    const arcs = log.filter((e) => e[0] === "arc");
    // centre-circle, 3pt, restricted, FT upper, FT lower, rim
    expect(arcs.length).toBe(6);
    expect(arcs[1][3]).toBe(23.75);
    expect(arcs[1][6]).toBe(true);
    expect(arcs[2].slice(3)).toEqual([4, Math.PI, 0, false]);
    expect(arcs[3].slice(3)).toEqual([6, Math.PI, 0, false]);
    expect(arcs[4].slice(3)).toEqual([6, 0, Math.PI, false]);
  });

  it("never touches global canvas state (no clearRect, no canvas sizing)", () => {
    expect(ops(log)).not.toContain("clearRect");
  });

  it.skipIf(!courtTsxDrawCourt)("equals Court.tsx drawCourt('half') minus its leading clearRect", () => {
    const reference = record((ctx) => courtTsxDrawCourt!(fakeCanvas(ctx), W, H, "half"));
    expect(reference[0]).toEqual(["clearRect", 0, 0, W, H]);
    expect(log).toEqual(reference.slice(1));
  });

  it("pinned digest", () => {
    expect(digest(log)).toMatchInlineSnapshot(`"91692997bec5569d"`);
    expect(log.length).toMatchInlineSnapshot(`67`);
  });
});

// ---------------------------------------------------------------------------
// drawCourt (legacy whole-canvas entry point used by exportPdf)
// ---------------------------------------------------------------------------

describe("drawCourt", () => {
  const cases: Array<{ w: number; h: number; variant: CourtVariant; paint?: string }> = [
    { w: 800, h: 752, variant: "half" },
    { w: 800, h: 752, variant: "half", paint: "#0055AA" },
    { w: 800, h: 1504, variant: "full" },
    { w: 800, h: 1504, variant: "full", paint: "#0055AA" },
    { w: 452, h: 425, variant: "half" },
    { w: 377, h: 709, variant: "full" },
  ];

  it.skipIf(!courtTsxDrawCourt)("produces the same call log as Court.tsx's exported drawCourt", () => {
    for (const c of cases) {
      const mine = record((ctx) => drawCourt(fakeCanvas(ctx), c.w, c.h, c.variant, c.paint));
      const reference = record((ctx) => courtTsxDrawCourt!(fakeCanvas(ctx), c.w, c.h, c.variant, c.paint));
      expect(mine.length).toBeGreaterThan(50);
      expect(mine).toEqual(reference);
    }
  });

  it("half: clearRect then one half court over the whole canvas", () => {
    const log = record((ctx) => drawCourt(fakeCanvas(ctx), 800, 752, "half"));
    const inner = record((ctx) => drawHalfCourtInner(ctx, 800, 752));
    expect(log).toEqual([["clearRect", 0, 0, 800, 752], ...inner]);
  });

  it("half: ignores paintColor (faithful to Court.tsx, which does not forward it)", () => {
    const a = record((ctx) => drawCourt(fakeCanvas(ctx), 800, 752, "half"));
    const b = record((ctx) => drawCourt(fakeCanvas(ctx), 800, 752, "half", "#0055AA"));
    expect(b).toEqual(a);
  });

  it("full: two mirrored halves around the centre line, then centre line + circle", () => {
    const w = 800;
    const h = 1504;
    const halfH = h / 2;
    const inner = record((ctx) => drawHalfCourtInner(ctx, w, halfH, "#0055AA"));
    const scaleY = halfH / w;
    const log = record((ctx) => drawCourt(fakeCanvas(ctx), w, h, "full", "#0055AA"));
    expect(log).toEqual([
      ["clearRect", 0, 0, w, h],
      ["save"],
      ["translate", 0, halfH],
      ...inner,
      ["restore"],
      ["save"],
      ["translate", 0, halfH],
      ["scale", 1, -1],
      ...inner,
      ["restore"],
      ["set strokeStyle", COLOR_LINE],
      ["set lineWidth", COLOR_LINE_WIDTH_PX],
      ["set lineCap", "round"],
      ["beginPath"],
      ["moveTo", 0, halfH],
      ["lineTo", w, halfH],
      ["stroke"],
      ["save"],
      ["scale", 1, scaleY],
      ["beginPath"],
      ["arc", w * 0.5, halfH / scaleY, w * CENTRE_CIRCLE_RADIUS, 0, Math.PI * 2],
      ["restore"],
      ["stroke"],
    ]);
  });

  it("does nothing when the canvas has no 2d context", () => {
    const canvas = { getContext: () => null } as unknown as HTMLCanvasElement;
    expect(() => drawCourt(canvas, 800, 752, "half")).not.toThrow();
  });

  it("pinned digests", () => {
    const d = (c: (typeof cases)[number]) =>
      digest(record((ctx) => drawCourt(fakeCanvas(ctx), c.w, c.h, c.variant, c.paint)));
    expect(d(cases[0])).toMatchInlineSnapshot(`"e6eb2bf89aeb76ce"`);
    expect(d(cases[3])).toMatchInlineSnapshot(`"69a234e114aba61c"`);
  });
});

// ---------------------------------------------------------------------------
// paintCourt — the body of Court.tsx's draw() callback
// ---------------------------------------------------------------------------

describe("paintCourt", () => {
  /**
   * Expected log = Court.tsx draw() lines 375–422 transcribed op by op, with
   * the half-court markings substituted by drawHalfCourtInner's own log, and
   * wrapped in the one save/restore pair paintCourt adds.
   */
  function expectedLog(totalWidth: number, variant: CourtVariant, flipped: boolean, paintColor?: string): LogEntry[] {
    const { oobLeft, innerW, innerH, oobBot } = computeCourtLayout(totalWidth);
    const cssWidth = totalWidth;
    const cssHeight = variant === "full" ? innerH * 2 + oobBot : innerH + oobBot;
    const inner = record((ctx) => drawHalfCourtInner(ctx, innerW, innerH, paintColor));
    const out: LogEntry[] = [["save"]];
    if (flipped) {
      out.push(["translate", 0, cssHeight], ["scale", 1, -1]);
    }
    out.push(["set fillStyle", COLOR_COURT], ["fillRect", 0, 0, cssWidth, cssHeight]);
    if (variant === "full") {
      const scaleY = innerH / innerW;
      out.push(
        ["save"],
        ["translate", oobLeft, innerH + oobBot],
        ...inner,
        ["restore"],
        ["save"],
        ["translate", oobLeft, innerH + oobBot],
        ["scale", 1, -1],
        ...inner,
        ["restore"],
        ["set strokeStyle", COLOR_LINE],
        ["set lineWidth", COLOR_LINE_WIDTH_PX],
        ["set lineCap", "round"],
        ["beginPath"],
        ["moveTo", oobLeft, innerH + oobBot],
        ["lineTo", oobLeft + innerW, innerH + oobBot],
        ["stroke"],
        ["save"],
        ["scale", 1, scaleY],
        ["beginPath"],
        ["arc", oobLeft + innerW * 0.5, (innerH + oobBot) / scaleY, innerW * CENTRE_CIRCLE_RADIUS, 0, Math.PI * 2],
        ["restore"],
        ["stroke"],
      );
    } else {
      out.push(["save"], ["translate", oobLeft, 0], ...inner, ["restore"]);
    }
    out.push(["restore"]);
    return out;
  }

  const paint = (totalWidth: number, variant: CourtVariant, flipped: boolean, paintColor?: string) =>
    record((ctx) => paintCourt(ctx, computeCourtLayout(totalWidth, variant), { flipped, paintColor }));

  it("reproduces Court.tsx draw()'s call sequence for half/full × normal/flipped", () => {
    for (const w of [375, 480, 800, 1280]) {
      for (const variant of ["half", "full"] as const) {
        for (const flipped of [false, true]) {
          expect(paint(w, variant, flipped)).toEqual(expectedLog(w, variant, flipped));
        }
      }
    }
  });

  it("flipped half court uses translate(0, innerH + oobBot) then scale(1, -1) — decision #170", () => {
    const layout = computeCourtLayout(800);
    const log = paint(800, "half", true);
    expect(log.slice(0, 5)).toEqual([
      ["save"],
      ["translate", 0, layout.innerH + layout.oobBot],
      ["scale", 1, -1],
      ["set fillStyle", COLOR_COURT],
      ["fillRect", 0, 0, 800, layout.innerH + layout.oobBot],
    ]);
    expect(log.slice(5, 7)).toEqual([["save"], ["translate", layout.oobLeft, 0]]);
  });

  it("flipped half court: markings sit oobBot below tokens with the same normY (the editor's frame)", () => {
    // Markings: y_canvas = totalHeight - normY * innerH = oobBot + (1 - normY) * innerH
    // Tokens:   normToCanvasPx → (1 - normY) * innerH
    const layout = computeCourtLayout(800);
    const log = paint(800, "half", true);
    const flipTranslateY = log[1][2] as number;
    for (const normY of [0, LANE_TOP, 0.5, 1]) {
      const markingY = flipTranslateY - normY * layout.innerH;
      const tokenY = normToCanvasPx(0.5, normY, layout, true).y;
      expect(markingY - tokenY).toBeCloseTo(layout.oobBot, 8);
    }
  });

  it("not flipped: no flip transform; floor fill is the first drawing op", () => {
    const log = paint(800, "half", false);
    expect(log.slice(0, 3)).toEqual([
      ["save"],
      ["set fillStyle", COLOR_COURT],
      ["fillRect", 0, 0, 800, 759],
    ]);
    expect(log.filter((e) => e[0] === "scale" && e[1] === 1 && e[2] === -1)).toEqual([]);
  });

  it("full court fills 2 × innerH + oobBot", () => {
    const log = paint(800, "full", false);
    expect(log[2]).toEqual(["fillRect", 0, 0, 800, 1468]);
  });

  it("options default to not flipped / default paint", () => {
    const layout = computeCourtLayout(800);
    expect(record((ctx) => paintCourt(ctx, layout))).toEqual(paint(800, "half", false));
    expect(record((ctx) => paintCourt(ctx, layout, {}))).toEqual(paint(800, "half", false));
  });

  it("forwards paintColor to both halves", () => {
    for (const variant of ["half", "full"] as const) {
      const log = paint(800, variant, true, "#0055AA");
      expect(log).toEqual(expectedLog(800, variant, true, "#0055AA"));
      const paints = log.filter((e) => e[0] === "set fillStyle" && e[1] === "#0055AA");
      expect(paints.length).toBe(variant === "full" ? 2 : 1);
      expect(log.some((e) => e[0] === "set fillStyle" && e[1] === DEFAULT_COLOR_PAINT)).toBe(false);
    }
  });

  it("is wrapped in exactly one outer save/restore so the flip cannot leak to token drawing", () => {
    for (const variant of ["half", "full"] as const) {
      for (const flipped of [false, true]) {
        const log = paint(800, variant, flipped);
        expect(log[0]).toEqual(["save"]);
        expect(log[log.length - 1]).toEqual(["restore"]);
        let depth = 0;
        log.forEach((e, i) => {
          if (e[0] === "save") depth++;
          if (e[0] === "restore") depth--;
          // depth only returns to 0 at the very last op
          if (i < log.length - 1) expect(depth).toBeGreaterThan(0);
        });
        expect(depth).toBe(0);
      }
    }
  });

  it("issues no clearRect and no resolution scaling (caller owns canvas setup)", () => {
    const log = paint(800, "full", true);
    expect(ops(log)).not.toContain("clearRect");
    expect(ops(log)).not.toContain("setTransform");
    expect(ops(log)).not.toContain("resetTransform");
  });

  it("pinned digests", () => {
    expect(digest(paint(800, "half", false))).toMatchInlineSnapshot(`"90e715875e3a1b2f"`);
    expect(digest(paint(800, "half", true))).toMatchInlineSnapshot(`"90aaf4633968afde"`);
    expect(digest(paint(800, "full", false))).toMatchInlineSnapshot(`"430a4f62b2cb595b"`);
    expect(digest(paint(800, "full", true))).toMatchInlineSnapshot(`"4499c41c009306d2"`);
  });
});
