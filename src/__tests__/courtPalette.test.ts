/**
 * Court palettes and label contrast (theme foundation).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  contrastText,
  customTeamColor,
  DARK_COURT_PALETTE,
  LIGHT_COURT_PALETTE,
  TOKEN_TEXT_DARK,
  TOKEN_TEXT_LIGHT,
} from "@/lib/courtPalette";
import { renderSceneToCtx } from "@/lib/frameRenderer";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
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

  it("understands hex with alpha and rgb(); falls back to white for anything else", () => {
    expect(contrastText("#FFFFFFFF")).toBe(TOKEN_TEXT_DARK);
    expect(contrastText("#ffff")).toBe(TOKEN_TEXT_DARK);
    expect(contrastText("rgb(253, 230, 138)")).toBe(TOKEN_TEXT_DARK);
    expect(contrastText("rgba(20,26,35,1)")).toBe(TOKEN_TEXT_LIGHT);
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

describe("customTeamColor — stored defaults are not custom colours", () => {
  it("missing, current defaults and the pre-redesign defaults all mean none", () => {
    for (const c of [undefined, null, "", "#E07B39", "#1E3A5F", "#e07b39", " #1e3a5f ", "#FF7A1A", "#141A23"]) {
      expect(customTeamColor(c), String(c)).toBeUndefined();
    }
  });

  it("a real choice is kept as stored", () => {
    expect(customTeamColor("#3B82F6")).toBe("#3B82F6");
    expect(customTeamColor("#0f766e")).toBe("#0f766e");
  });

  it("a play that stored the old defaults is painted with the palette, in both themes", () => {
    const layout = computeCourtLayout(636, "half");
    const old = { offenseColor: "#E07B39", defenseColor: "#1E3A5F" };
    for (const palette of [LIGHT_COURT_PALETTE, DARK_COURT_PALETTE]) {
      const stored = record((ctx) => renderSceneToCtx(ctx, layout, scene, [], false, { ...old, palette }));
      const none = record((ctx) => renderSceneToCtx(ctx, layout, scene, [], false, { palette }));
      expect(stored).toEqual(none);
    }
  });

  it("every renderer resolves team colours through it", () => {
    for (const f of ["src/components/players/PlayerToken.tsx", "src/components/court/CourtThumbnail.tsx", "src/lib/frameRenderer.ts"]) {
      const src = readFileSync(path.resolve(process.cwd(), f), "utf8");
      expect(src, f).toMatch(/customTeamColor\(offenseColor\w*\) \?\? palette\.offenseFill/);
      expect(src, f).toMatch(/customTeamColor\(defenseColor\w*\) \?\? palette\.defenseFill/);
    }
  });
});

describe("dark annotation tints (globals.css) cover every colour AnnotationLayer draws", () => {
  it("each stroke / fill literal in the annotation layer has a dark override, same case", () => {
    const layer = readFileSync(path.resolve(process.cwd(), "src/components/annotations/AnnotationLayer.tsx"), "utf8");
    const css = readFileSync(path.resolve(process.cwd(), "src/app/globals.css"), "utf8");
    const rendered = layer.slice(layer.indexOf("function RenderedAnnotation("), layer.indexOf("function findNearestPlayer("));
    // Selection chrome (#3B82F6 handles, #fff badge text) reads on both floors and is not tinted.
    const UNTINTED = new Set(["#3B82F6", "#fff"]);
    const used = new Set<string>();
    for (const m of Array.from(rendered.matchAll(/\b(stroke|fill)="(#[0-9A-Fa-f]{3,6})"/g))) {
      if (!UNTINTED.has(m[2])) used.add(`${m[1]}="${m[2]}"`);
    }
    expect(used.size).toBeGreaterThanOrEqual(10);
    for (const attr of Array.from(used)) {
      expect(css, attr).toContain(`[data-theme="dark"] .annotation-layer [${attr}]`);
    }
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

  it("the theme module does not touch the editor store (a toggle must not be an undo step)", () => {
    for (const f of ["src/lib/theme.ts", "src/hooks/useTheme.ts"]) {
      const src = readFileSync(path.resolve(process.cwd(), f), "utf8");
      expect(src, f).not.toMatch(/from "@\/lib\/store"|useStore/);
    }
  });
});

describe("theme init script — stored choice, else the device setting", () => {
  function run(stored: string | null, deviceDark: boolean, storageThrows = false): string | undefined {
    const dataset: { theme?: string } = {};
    const localStorage = {
      getItem: () => {
        if (storageThrows) throw new Error("blocked");
        return stored;
      },
    };
    const matchMedia = () => ({ matches: deviceDark });
    new Function("localStorage", "matchMedia", "document", THEME_INIT_SCRIPT)(localStorage, matchMedia, { documentElement: { dataset } });
    return dataset.theme;
  }

  it("a stored choice wins over the device", () => {
    expect(run("dark", false)).toBe("dark");
    expect(run("light", true)).toBe("light");
  });

  it("no stored choice (or a junk value) follows the device", () => {
    expect(run(null, true)).toBe("dark");
    expect(run(null, false)).toBe("light");
    expect(run("purple", true)).toBe("dark");
  });

  it("never throws when storage is blocked — the page stays light", () => {
    expect(run(null, true, true)).toBeUndefined();
  });
});
