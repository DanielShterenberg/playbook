/**
 * Court palettes and label contrast (theme foundation).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  contrastText,
  DARK_COURT_PALETTE,
  LIGHT_COURT_PALETTE,
  TOKEN_TEXT_DARK,
  TOKEN_TEXT_LIGHT,
} from "@/lib/courtPalette";
import { renderSceneToCtx } from "@/lib/frameRenderer";
import { computeCourtLayout } from "@/lib/courtLayout";
import type { Scene } from "@/lib/types";

type LogEntry = [op: string, ...args: unknown[]];

function record(fn: (ctx: CanvasRenderingContext2D) => void): LogEntry[] {
  const log: LogEntry[] = [];
  const ctx = new Proxy(
    {},
    {
      get: (_t, prop: string) => (...args: unknown[]) => {
        log.push([prop, ...args]);
      },
      set: (_t, prop: string, value) => {
        log.push([`set ${prop}`, value]);
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  fn(ctx);
  return log;
}

// drawBall builds its seams with Path2D, which Node does not have.
if (typeof (globalThis as { Path2D?: unknown }).Path2D === "undefined") {
  (globalThis as { Path2D?: unknown }).Path2D = class {
    constructor(public d?: string) {}
  };
}

const scene = {
  id: "s",
  order: 0,
  players: {
    offense: [{ position: 1, x: 0.5, y: 0.3, visible: true }],
    defense: [{ position: 1, x: 0.5, y: 0.5, visible: true }],
  },
  ball: { x: 0.2, y: 0.2, attachedTo: null },
  timingGroups: [],
} as unknown as Scene;

const fills = (log: LogEntry[]) => log.filter((e) => e[0] === "set fillStyle").map((e) => String(e[1]));
const strokes = (log: LogEntry[]) => log.filter((e) => e[0] === "set strokeStyle").map((e) => String(e[1]));

describe("contrastText", () => {
  it("dark ink on light fills, white on dark fills", () => {
    expect(contrastText("#FF7A1A")).toBe(TOKEN_TEXT_DARK);
    expect(contrastText("#E8ECF1")).toBe(TOKEN_TEXT_DARK);
    expect(contrastText("#FFFFFF")).toBe(TOKEN_TEXT_DARK);
    expect(contrastText("#fff")).toBe(TOKEN_TEXT_DARK);
    expect(contrastText("#141A23")).toBe(TOKEN_TEXT_LIGHT);
    expect(contrastText("#1E3A5F")).toBe(TOKEN_TEXT_LIGHT);
    expect(contrastText("#000")).toBe(TOKEN_TEXT_LIGHT);
  });

  it("falls back to white for anything that is not a hex colour", () => {
    expect(contrastText("rebeccapurple")).toBe(TOKEN_TEXT_LIGHT);
    expect(contrastText("")).toBe(TOKEN_TEXT_LIGHT);
  });

  it("every default token fill gets a label that contrasts with it", () => {
    for (const p of [LIGHT_COURT_PALETTE, DARK_COURT_PALETTE]) {
      expect(contrastText(p.offenseFill)).toBe(TOKEN_TEXT_DARK);
    }
    expect(contrastText(LIGHT_COURT_PALETTE.defenseFill)).toBe(TOKEN_TEXT_LIGHT);
    expect(contrastText(DARK_COURT_PALETTE.defenseFill)).toBe(TOKEN_TEXT_DARK);
  });
});

describe("frame painter palette", () => {
  const layout = computeCourtLayout(636, "half");

  it("defaults to the light palette — exports are light in either theme", () => {
    const byDefault = record((ctx) => renderSceneToCtx(ctx, layout, scene, [], false));
    const light = record((ctx) => renderSceneToCtx(ctx, layout, scene, [], false, { palette: LIGHT_COURT_PALETTE }));
    expect(byDefault).toEqual(light);
    expect(fills(byDefault)).toContain(LIGHT_COURT_PALETTE.floor);
    expect(fills(byDefault)).not.toContain(DARK_COURT_PALETTE.floor);
  });

  it("a dark palette recolours court, tokens and ball without changing the geometry", () => {
    const light = record((ctx) => renderSceneToCtx(ctx, layout, scene, [], false));
    const dark = record((ctx) => renderSceneToCtx(ctx, layout, scene, [], false, { palette: DARK_COURT_PALETTE }));
    const geometry = (log: LogEntry[]) => log.filter((e) => e[0] !== "set fillStyle" && e[0] !== "set strokeStyle");
    expect(geometry(dark)).toEqual(geometry(light));
    const d = DARK_COURT_PALETTE;
    for (const c of [d.oob, d.floor, d.paint, d.offenseFill, d.defenseFill, d.ball, TOKEN_TEXT_DARK]) expect(fills(dark)).toContain(c);
    for (const c of [d.line, d.tokenStroke, d.ballSeam, d.ballHighlight]) expect(strokes(dark)).toContain(c);
    expect(fills(dark)).not.toContain(LIGHT_COURT_PALETTE.floor);
  });

  it("team colours override the palette's fills, and the label follows the fill", () => {
    const log = record((ctx) =>
      renderSceneToCtx(ctx, layout, scene, [], false, { offenseColor: "#0F172A", defenseColor: "#FDE68A", palette: DARK_COURT_PALETTE }),
    );
    expect(fills(log)).toContain("#0F172A");
    expect(fills(log)).toContain("#FDE68A");
    expect(fills(log)).not.toContain(DARK_COURT_PALETTE.offenseFill);
    expect(fills(log)).not.toContain(DARK_COURT_PALETTE.defenseFill);
    expect(fills(log)).toContain(TOKEN_TEXT_LIGHT); // on #0F172A
    expect(fills(log)).toContain(TOKEN_TEXT_DARK); // on #FDE68A
  });
});

describe("exports never pass a palette", () => {
  it("exportPNG / exportVideo / exportPdf / exportGIF do not reference one", () => {
    for (const f of ["exportPNG.ts", "exportVideo.ts", "exportPdf.ts", "exportGIF.ts"]) {
      const src = readFileSync(path.resolve(process.cwd(), "src/lib", f), "utf8");
      expect(src, f).not.toMatch(/CourtPalette|courtPalette|useTheme|COURT_PALETTE/);
    }
  });

  it("the theme lives outside the editor store (a toggle must not be an undo step)", () => {
    const store = readFileSync(path.resolve(process.cwd(), "src/lib/store.ts"), "utf8");
    expect(store).not.toMatch(/theme/i);
  });
});
