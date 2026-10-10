/**
 * Thumbnails (PlayCard / SceneStrip mini courts) — issue #175.
 *
 * A thumbnail is the editor's picture seen through the play-area window: the
 * same court frame (flip transform included), the same norm→pixel mapping and
 * the same token ratios, with no out-of-bounds margin around it.
 *
 *   1. computeThumbnailLayout / thumbnailBallRadius — pure, tested directly.
 *   2. CourtThumbnail.tsx — cannot be imported under Vitest (jsx: preserve), so
 *      its source is transpiled with the TypeScript compiler, evaluated with
 *      its imports wired to the real modules and rendered to static SVG markup
 *      with react-dom/server. The assertions read the markup.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";
import * as courtLayoutModule from "@/lib/courtLayout";
import * as tokenSizingModule from "@/lib/tokenSizing";
import * as courtRenderingModule from "@/lib/courtRendering";
import * as courtDimensions from "@/components/court/courtDimensions";
import {
  computeCourtLayout,
  computeThumbnailLayout,
  normToCanvasPx,
  OOB_BOTTOM_FRAC,
  type CourtVariant,
} from "@/lib/courtLayout";
import { FT_CIRCLE_CENTER_Y } from "@/components/court/courtDimensions";
import {
  BALL_RADIUS_RATIO,
  ballRadius,
  thumbnailBallAttachOffsetY,
  thumbnailBallRadius,
  thumbnailDotRadius,
} from "@/lib/tokenSizing";
import type { Scene } from "@/lib/types";

// ---------------------------------------------------------------------------
// Component loader
// ---------------------------------------------------------------------------

type ThumbnailProps = {
  scene: Scene;
  width: number;
  variant?: CourtVariant;
  flipped?: boolean;
  offenseColor?: string;
  defenseColor?: string;
  lineWidth?: number;
  outlineWidth?: number;
  basketRadius?: number;
  cornerRadius?: number;
  fluid?: boolean;
};

const FILE = path.resolve(process.cwd(), "src/components/court/CourtThumbnail.tsx");
const nodeRequire = createRequire(FILE);

function loadComponent(): (props: ThumbnailProps) => unknown {
  const js = ts.transpileModule(readFileSync(FILE, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
    fileName: FILE,
  }).outputText;
  const shim = (id: string): unknown => {
    if (id === "@/lib/courtLayout") return courtLayoutModule;
    if (id === "@/lib/tokenSizing") return tokenSizingModule;
    if (id === "@/lib/courtRendering") return courtRenderingModule;
    if (id === "./courtDimensions" || id === "@/components/court/courtDimensions") return courtDimensions;
    if (id.startsWith(".") || id.startsWith("@/")) throw new Error(`unmapped import ${id}`);
    return nodeRequire(id);
  };
  const mod: { exports: Record<string, unknown> } = { exports: {} };
  new Function("require", "module", "exports", js)(shim, mod, mod.exports);
  return mod.exports.default as (props: ThumbnailProps) => unknown;
}

const CourtThumbnail = loadComponent();
const { createElement } = nodeRequire("react") as typeof import("react");
const { renderToStaticMarkup } = nodeRequire("react-dom/server") as typeof import("react-dom/server");

const render = (props: ThumbnailProps): string =>
  renderToStaticMarkup(createElement(CourtThumbnail as never, props as never));

// ---------------------------------------------------------------------------
// Markup helpers
// ---------------------------------------------------------------------------

type Attrs = Record<string, string>;

function tags(svg: string, name: string): Attrs[] {
  const out: Attrs[] = [];
  for (const m of Array.from(svg.matchAll(new RegExp(`<${name}\\b([^>]*)>`, "g")))) {
    const attrs: Attrs = {};
    for (const a of Array.from(m[1].matchAll(/([\w:-]+)="([^"]*)"/g))) attrs[a[1]] = a[2];
    out.push(attrs);
  }
  return out;
}

const circlesFilled = (svg: string, fill: string) => tags(svg, "circle").filter((c) => c.fill === fill);
const at = (c: Attrs) => ({ x: Number(c.cx), y: Number(c.cy), r: Number(c.r) });
const transforms = (svg: string) => tags(svg, "g").map((g) => g.transform).filter(Boolean);

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const OFF = "#E07B39";
const DEF = "#1E3A5F";
const BALL = "#E05C00";

function makeScene(attachedTo: Scene["ball"]["attachedTo"] = null): Scene {
  return {
    id: "s1",
    order: 1,
    duration: 1000,
    note: "",
    players: {
      offense: [
        { position: 1, x: 0.5, y: FT_CIRCLE_CENTER_Y, visible: true },
        { position: 2, x: 0.1, y: 0.9, visible: true },
        { position: 3, x: 0.9, y: 0.05, visible: false },
      ],
      defense: [
        { position: 1, x: 0.45, y: 0.4, visible: true },
        { position: 4, x: 0.8, y: 0.95, visible: true },
      ],
    },
    ball: { x: 0.3, y: 0.6, attachedTo },
    timingGroups: [],
  };
}

const base = { offenseColor: OFF, defenseColor: DEF };
const PAINT = "#E07B39";
const VARIANTS: CourtVariant[] = ["half", "full"];
const CASES = VARIANTS.flatMap((variant) => [false, true].map((flipped) => ({ variant, flipped })));
const WIDTHS = [200, 120, 80];

// ---------------------------------------------------------------------------
// computeThumbnailLayout
// ---------------------------------------------------------------------------

describe("computeThumbnailLayout", () => {
  it("has no side out-of-bounds margin: the width is the inner court width", () => {
    for (const w of WIDTHS) {
      for (const variant of VARIANTS) {
        const l = computeThumbnailLayout(w, variant);
        expect(l.variant).toBe(variant);
        expect(l.totalWidth).toBe(w);
        expect(l.oobLeft).toBe(0);
        expect(l.playAreaOffsetX).toBe(0);
        expect(l.innerW).toBe(w);
        expect(l.playAreaWidth).toBe(w);
      }
    }
  });

  it("keeps the thumbnails' existing sizes (200×188, 120×113, 80×75)", () => {
    expect(computeThumbnailLayout(200).innerH).toBe(188);
    expect(computeThumbnailLayout(120).innerH).toBe(113);
    expect(computeThumbnailLayout(80).innerH).toBe(75);
  });

  it("has the editor's frame otherwise: same oobBot ratio, heights and play-area offset", () => {
    for (const w of WIDTHS) {
      const half = computeThumbnailLayout(w, "half");
      expect(half.oobBot).toBeCloseTo(half.innerH * OOB_BOTTOM_FRAC, 12);
      expect(half.totalHeight).toBe(half.innerH + half.oobBot);
      expect(half.playAreaOffsetY).toBe(0);
      expect(half.playAreaHeight).toBe(half.innerH);

      const full = computeThumbnailLayout(w, "full");
      expect(full.totalHeight).toBe(2 * full.innerH + full.oobBot);
      expect(full.playAreaOffsetY).toBe(full.innerH + full.oobBot);
    }
    // Same proportions as the real editor canvas, up to its pixel rounding.
    const editor = computeCourtLayout(800, "full");
    const thumb = computeThumbnailLayout(200, "full");
    expect(thumb.oobBot / thumb.innerH).toBeCloseTo(editor.oobBot / editor.innerH, 2);
    expect(thumb.playAreaOffsetY / thumb.innerH).toBeCloseTo(editor.playAreaOffsetY / editor.innerH, 2);
  });

  it("normToCanvasPx maps the unit square onto the play-area window, flipped or not", () => {
    for (const { variant, flipped } of CASES) {
      const l = computeThumbnailLayout(200, variant);
      const a = normToCanvasPx(0, 0, l, flipped);
      const b = normToCanvasPx(1, 1, l, flipped);
      expect(Math.min(a.x, b.x)).toBe(0);
      expect(Math.max(a.x, b.x)).toBe(200);
      expect(Math.min(a.y, b.y)).toBe(l.playAreaOffsetY);
      expect(Math.max(a.y, b.y)).toBe(l.playAreaOffsetY + l.innerH);
    }
  });
});

// ---------------------------------------------------------------------------
// Ball radius
// ---------------------------------------------------------------------------

describe("thumbnailBallRadius", () => {
  it("uses the editor's 2% ratio with a legibility floor", () => {
    expect(thumbnailBallRadius(200)).toBe(4);
    expect(thumbnailBallRadius(200) / 200).toBeCloseTo(BALL_RADIUS_RATIO, 10);
    expect(thumbnailBallRadius(120)).toBe(3);
    expect(thumbnailBallRadius(80)).toBe(3);
  });

  it("matches the editor radius wherever the editor is above its own minimum", () => {
    for (let w = 350; w <= 2000; w += 7) expect(thumbnailBallRadius(w)).toBe(ballRadius(w));
  });

  it("is always smaller than the player dot", () => {
    for (let w = 40; w <= 400; w += 5) expect(thumbnailBallRadius(w)).toBeLessThan(thumbnailDotRadius(w));
  });
});

// ---------------------------------------------------------------------------
// CourtThumbnail markup
// ---------------------------------------------------------------------------

describe("CourtThumbnail", () => {
  it("is an SVG of the play-area window: width × innerH, no out-of-bounds margin", () => {
    for (const w of WIDTHS) {
      for (const { variant, flipped } of CASES) {
        const l = computeThumbnailLayout(w);
        const [svg] = tags(render({ ...base, scene: makeScene(), width: w, variant, flipped }), "svg");
        expect(svg.width).toBe(String(w));
        expect(svg.height).toBe(String(l.innerH));
        expect(svg.viewBox).toBe(`0 0 ${w} ${l.innerH}`);
      }
    }
  });

  it("places visible players at normToCanvasPx with the shared dot radius; hidden players are not drawn", () => {
    for (const w of WIDTHS) {
      for (const { variant, flipped } of CASES) {
        const scene = makeScene();
        const l = computeThumbnailLayout(w);
        const shown = variant === "half" && flipped; // full-court thumbnails ignore the flip (#173)
        const svg = render({ ...base, scene, width: w, variant, flipped });
        for (const [side, fill] of [["offense", OFF], ["defense", DEF]] as const) {
          const dots = circlesFilled(svg, fill).map(at);
          const visible = scene.players[side].filter((p) => p.visible);
          expect(dots.length, `${side} ${w} ${variant} ${flipped}`).toBe(visible.length);
          for (const p of visible) {
            const c = normToCanvasPx(p.x, p.y, l, shown);
            expect(dots.some((d) => Math.abs(d.x - c.x) < 1e-9 && Math.abs(d.y - c.y) < 1e-9 && d.r === thumbnailDotRadius(w))).toBe(true);
          }
        }
      }
    }
  });

  it("draws defense under offense under the ball, like the editor", () => {
    const svg = render({ ...base, scene: makeScene(), width: 200 });
    const order = tags(svg, "circle").map((c) => c.fill).filter((f) => [OFF, DEF, BALL].includes(f));
    expect(order).toEqual([DEF, DEF, OFF, OFF, BALL]);
  });

  it("draws a free ball at its own position", () => {
    for (const w of WIDTHS) {
      for (const { variant, flipped } of CASES) {
        const scene = makeScene();
        const l = computeThumbnailLayout(w);
        const shown = variant === "half" && flipped; // full-court thumbnails ignore the flip (#173)
        const balls = circlesFilled(render({ ...base, scene, width: w, variant, flipped }), BALL).map(at);
        const c = normToCanvasPx(scene.ball.x, scene.ball.y, l, shown);
        expect(balls).toEqual([{ x: c.x, y: c.y, r: thumbnailBallRadius(w) }]);
      }
    }
  });

  it("draws an attached ball above its holder in screen space — never negated when flipped", () => {
    for (const w of WIDTHS) {
      for (const { variant, flipped } of CASES) {
        for (const attachedTo of [{ side: "offense", position: 2 }, { side: "defense", position: 4 }] as const) {
          const scene = makeScene(attachedTo);
          const l = computeThumbnailLayout(w);
        const shown = variant === "half" && flipped; // full-court thumbnails ignore the flip (#173)
          const holder = scene.players[attachedTo.side].find((p) => p.position === attachedTo.position)!;
          const h = normToCanvasPx(holder.x, holder.y, l, shown);
          const offset = thumbnailBallAttachOffsetY(thumbnailDotRadius(w), thumbnailBallRadius(w));
          expect(offset).toBeLessThan(0);
          const balls = circlesFilled(render({ ...base, scene, width: w, variant, flipped }), BALL).map(at);
          // …kept inside the frame when the holder stands at its top edge.
          const r = thumbnailBallRadius(w);
          const y = Math.max(l.playAreaOffsetY + r, h.y + offset);
          expect(balls).toEqual([{ x: h.x, y, r }]);
        }
      }
    }
  });

  it("falls back to the free position when the holder does not exist; tolerates a scene without a ball", () => {
    const scene = makeScene({ side: "offense", position: 5 });
    const l = computeThumbnailLayout(200);
    const c = normToCanvasPx(scene.ball.x, scene.ball.y, l, false);
    expect(circlesFilled(render({ ...base, scene, width: 200 }), BALL).map(at)).toEqual([{ x: c.x, y: c.y, r: 4 }]);

    const noBall = { ...makeScene(), ball: undefined } as unknown as Scene;
    expect(circlesFilled(render({ ...base, scene: noBall, width: 200 }), BALL)).toEqual([]);
  });

  describe("court frame = paintCourt's transforms (the editor's)", () => {
    it("half, not flipped: no transform at all", () => {
      expect(transforms(render({ ...base, scene: makeScene(), width: 200 }))).toEqual([]);
    });

    it("half, flipped: translate(0, innerH + oobBot) scale(1, -1) — markings sit oobBot below tokens", () => {
      for (const w of WIDTHS) {
        const l = computeThumbnailLayout(w);
        const svg = render({ ...base, scene: makeScene(), width: w, flipped: true });
        expect(transforms(svg)).toEqual([`translate(0 ${l.innerH + l.oobBot}) scale(1 -1)`]);

        // A player stored on the FT line: marking y − token y = oobBot, the
        // editor's flipped frame (courtLayout.ts FLIPPED CONVENTION).
        const markingY = l.totalHeight - FT_CIRCLE_CENTER_Y * l.innerH;
        const tokenY = normToCanvasPx(0.5, FT_CIRCLE_CENTER_Y, l, true).y;
        expect(markingY - tokenY).toBeCloseTo(l.oobBot, 9);
        const o1 = circlesFilled(svg, OFF).map(at).find((d) => d.x === w / 2)!;
        expect(o1.y).toBeCloseTo(tokenY, 9);

        // Same offset relative to the court as the real editor canvas.
        const editor = computeCourtLayout(800);
        expect((markingY - tokenY) / l.innerW).toBeCloseTo(editor.oobBot / editor.innerW, 2);
      }
    });

    // Review item 2 / issue #173: the editor's flipped full-court frame puts
    // players at the centre line, away from the basket. Until that is decided a
    // full-court thumbnail stays coherent: the near end, never flipped — exactly
    // the picture of a half-court thumbnail of the same scene.
    it("full court: one half court, no transform, flipped or not — identical to the unflipped half-court thumbnail", () => {
      for (const w of WIDTHS) {
        const half = render({ ...base, scene: makeScene({ side: "offense", position: 2 }), width: w });
        for (const flipped of [false, true]) {
          const full = render({ ...base, scene: makeScene({ side: "offense", position: 2 }), width: w, variant: "full", flipped });
          expect(transforms(full)).toEqual([]);
          expect(full).toBe(half);
        }
      }
    });

    it("full court flipped: a player stored near the basket is drawn near the basket", () => {
      const scene = makeScene();
      scene.players.offense = [{ position: 1, x: 0.5, y: 0.85, visible: true }];
      scene.players.defense = [];
      const l = computeThumbnailLayout(200);
      const svg = render({ ...base, scene, width: 200, variant: "full", flipped: true });
      const [dot] = circlesFilled(svg, OFF).map(at);
      const basket = tags(svg, "circle").filter((c) => c.fill === "none").map(at)[0];
      expect(Math.abs(dot.y - basket.y)).toBeLessThan(0.05 * l.innerH);
    });

    it("flipping never rewrites a path: the arcs are the same strings, only the group transform changes", () => {
      for (const w of WIDTHS) {
        const paths = (flipped: boolean) => tags(render({ ...base, scene: makeScene(), width: w, flipped }), "path").map((p) => p.d);
        expect(paths(true)).toEqual(paths(false));
        expect(paths(false).length).toBe(4); // centre circle, three-point line, FT circle, restricted area
        // The verified flags (CLAUDE.md): 3-point / FT / restricted arcs are "0 0 1", centre circle "0 0 0".
        expect(paths(false).filter((d) => / 0 0 1 /.test(d)).length).toBe(3);
        expect(paths(false).filter((d) => / 0 0 0 /.test(d)).length).toBe(1);
      }
    });
  });

  // Review item 8
  it("emits each marking once: one lane rect (fill + outline), four paths, no group for an unflipped court", () => {
    for (const variant of VARIANTS) {
      const svg = render({ ...base, scene: makeScene(), width: 120, variant });
      const rects = tags(svg, "rect");
      expect(rects.length).toBe(3); // floor, lane, frame
      const lane = rects.filter((r) => r.fill === PAINT);
      expect(lane.length).toBe(1);
      expect(lane[0].stroke).toBeDefined();
      expect(tags(svg, "path").length).toBe(4);
      expect(tags(svg, "g").length).toBe(0);
      expect(tags(svg, "line").length).toBe(3); // half-court line, baseline, backboard
    }
  });

  // Review item 3: a default offense dot is the lane's colour; its outline must
  // survive at 4 px radius.
  it("outlines every dot with a 1.5 px light ring at every size, so an orange dot reads on the orange lane", () => {
    for (const w of WIDTHS) {
      const scene = makeScene();
      scene.players.offense[0] = { position: 1, x: 0.5, y: 0.8, visible: true }; // inside the lane
      const svg = render({ scene, width: w, lineWidth: 0.8 });
      const dots = [...circlesFilled(svg, OFF), ...circlesFilled(svg, DEF)];
      expect(dots.length).toBe(4);
      for (const d of dots) {
        expect(Number(d["stroke-width"])).toBe(1.5);
        expect(d.stroke.toUpperCase()).toBe("#FFFFFF");
      }
      // the ring is at least a third of the smallest dot's radius
      expect(1.5 / thumbnailDotRadius(w)).toBeGreaterThanOrEqual(0.25);
    }
  });

  it("uses the given colours and stroke scale", () => {
    const svg = render({ scene: makeScene(), width: 120, offenseColor: "#3B82F6", defenseColor: "#0F766E", lineWidth: 0.8, outlineWidth: 1, basketRadius: 3, cornerRadius: 3 });
    expect(circlesFilled(svg, "#3B82F6").length).toBe(2);
    expect(circlesFilled(svg, "#0F766E").length).toBe(2);
    expect(tags(svg, "rect").some((r) => r.fill === "#F0C878")).toBe(true);
    expect(tags(svg, "path").every((p) => p["stroke-width"] === "0.8")).toBe(true);
    expect(tags(svg, "circle").some((c) => c.fill === "none" && c.r === "3")).toBe(true);
  });

  // Review item 7: the lane is the editor's paint, whatever the team colours;
  // without team colours the dots are the editor's defaults.
  it("paints the lane with the editor's default paint, never the offense colour", () => {
    for (const offenseColor of [undefined, "#7C3AED"]) {
      const rects = tags(render({ scene: makeScene(), width: 200, offenseColor }), "rect");
      expect(rects.filter((r) => r.fill === PAINT).length).toBe(1);
      expect(rects.some((r) => r.fill === "#7C3AED")).toBe(false);
    }
    // so custom offense dots stay visible inside the lane
    const svg = render({ scene: makeScene(), width: 200, offenseColor: "#7C3AED" });
    expect(circlesFilled(svg, "#7C3AED").length).toBe(2);
  });

  it("defaults to the editor's team colours (#E07B39 offense, #1E3A5F defense)", () => {
    const svg = render({ scene: makeScene(), width: 120 });
    expect(circlesFilled(svg, "#E07B39").length).toBe(2);
    expect(circlesFilled(svg, "#1E3A5F").length).toBe(2);
    expect(svg).not.toMatch(/#3B82F6/i);
  });

  // Review item 6
  describe("attached ball stays with its holder and inside the frame", () => {
    const inside = (b: { x: number; y: number; r: number }, w: number, top: number, h: number) =>
      b.x - b.r >= -1e-9 && b.x + b.r <= w + 1e-9 && b.y - b.r >= top - 1e-9 && b.y + b.r <= top + h + 1e-9;

    it("the gap between holder and ball is under 1 px at every thumbnail size", () => {
      for (const w of WIDTHS) {
        const scene = makeScene({ side: "offense", position: 2 });
        const l = computeThumbnailLayout(w);
        const h = normToCanvasPx(0.1, 0.9, l, false);
        const [b] = circlesFilled(render({ ...base, scene, width: w }), BALL).map(at);
        const gap = h.y - b.y - thumbnailDotRadius(w) - b.r;
        expect(gap).toBeGreaterThan(0);
        expect(gap).toBeLessThan(1);
      }
    });

    it("a holder at the top edge (either orientation, either variant) keeps the ball in the viewBox", () => {
      for (const w of WIDTHS) {
        for (const { variant, flipped } of CASES) {
          for (const y of [0, 0.01, 0.99, 1]) {
            const scene = makeScene({ side: "offense", position: 2 });
            scene.players.offense[1] = { position: 2, x: 0.5, y, visible: true };
            const l = computeThumbnailLayout(w);
            const [b] = circlesFilled(render({ ...base, scene, width: w, variant, flipped }), BALL).map(at);
            expect(inside(b, w, l.playAreaOffsetY, l.innerH), `${w} ${variant} ${flipped} y=${y}`).toBe(true);
            expect(b.x).toBe(w / 2);
          }
        }
      }
    });

    it("an unclamped ball is exactly at the scaled offset (clamping only acts at the edge)", () => {
      const scene = makeScene({ side: "defense", position: 1 });
      const l = computeThumbnailLayout(120);
      const h = normToCanvasPx(0.45, 0.4, l, false);
      const [b] = circlesFilled(render({ ...base, scene, width: 120 }), BALL).map(at);
      expect(b.y).toBe(h.y + thumbnailBallAttachOffsetY(4, 3));
    });

    it("a ball attached to a hidden player is drawn above that player's position — as the editor and the exports do", () => {
      // CourtWithPlayers.getEffectiveBallPx looks the holder up in the pixel
      // state without checking visibility, and the store keeps attachedTo when
      // a player is hidden, so the editor shows the ball there too.
      const scene = makeScene({ side: "offense", position: 3 }); // offense 3 is hidden
      const l = computeThumbnailLayout(200);
      const h = normToCanvasPx(0.9, 0.05, l, false);
      const svg = render({ ...base, scene, width: 200 });
      expect(circlesFilled(svg, OFF).length).toBe(2); // holder itself not drawn
      const [b] = circlesFilled(svg, BALL).map(at);
      expect(b.x).toBe(h.x);
      expect(b.y).toBe(Math.max(b.r, h.y + thumbnailBallAttachOffsetY(6, 4)));
    });
  });

  it("takes court and token colours from the shared modules (no hex literals of its own)", () => {
    const src = readFileSync(FILE, "utf8");
    expect(src).not.toMatch(/["'`]#[0-9A-Fa-f]{3,8}["'`]/);
    expect(src).toMatch(/import \{[^}]*COLOR_COURT[^}]*\} from "@\/lib\/courtRendering"/);
    expect(src).toMatch(/COLOR_LINE/);
    expect(src).toMatch(/DEFAULT_COLOR_PAINT/);
  });
});
