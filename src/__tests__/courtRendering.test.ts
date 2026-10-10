/**
 * Tests for courtRendering.ts — the single court drawing implementation.
 *
 * Vitest runs in Node (no DOM canvas), so every test draws into a recording
 * mock CanvasRenderingContext2D that logs method calls and property writes in
 * order. Two renderers produce the same pixels if their logs are equal.
 *
 * Two layers of protection:
 *   1. A pinned digest of each log, captured while Court.tsx still had its own
 *      copy of the drawing to compare against (the legacy drawCourt entry point
 *      and that comparison are gone — issue #176); the digest keeps the drawing
 *      pinned.
 *   2. paintCourt's log is checked compositionally against the exact transform
 *      sequence Court.tsx's draw() callback had before it delegated here.
 */

import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  COLOR_COURT,
  DEFAULT_COLOR_PAINT,
  COLOR_LINE,
  COLOR_LINE_WIDTH_PX,
  drawHalfCourtInner,
  paintCourt,
} from "@/lib/courtRendering";
import { computeCourtLayout, normToCanvasPx, type CourtVariant } from "@/lib/courtLayout";
import { CENTRE_CIRCLE_RADIUS, LANE_TOP, LANE_LEFT, LANE_RIGHT } from "@/components/court/courtDimensions";
import * as courtRenderingModule from "@/lib/courtRendering";

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

  it("pinned digest", () => {
    expect(digest(log)).toMatchInlineSnapshot(`"91692997bec5569d"`);
    expect(log.length).toMatchInlineSnapshot(`67`);
  });
});

// ---------------------------------------------------------------------------
// Legacy drawCourt is gone (issue #176)
// ---------------------------------------------------------------------------

describe("legacy drawCourt", () => {
  it("is no longer exported — paintCourt is the only whole-court entry point", () => {
    expect(Object.keys(courtRenderingModule)).not.toContain("drawCourt");
    expect(typeof courtRenderingModule.paintCourt).toBe("function");
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
