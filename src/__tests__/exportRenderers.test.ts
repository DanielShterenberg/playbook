/**
 * Tests for the export pipeline (GIF / MP4 / PNG / PDF).
 *
 * Every exporter must render a scene with the shared contracts:
 *   - court:     paintCourt (courtRendering.ts)
 *   - positions: normToCanvasPx (courtLayout.ts)
 *   - sizes:     computeTokenSizes (tokenSizing.ts)
 *
 * Vitest runs in Node (no DOM canvas), so each exporter exposes a pure seam
 * that draws on a given 2D context; the tests drive it with a recording mock
 * that logs method calls and property writes in order.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { computeCourtLayout, normToCanvasPx, type CourtLayout, type CourtVariant } from "@/lib/courtLayout";
import { FT_CIRCLE_CENTER_Y } from "@/components/court/courtDimensions";
import { paintCourt } from "@/lib/courtRendering";
import { computeTokenSizes } from "@/lib/tokenSizing";
import { renderSceneToCtx, renderFrame, annotationScale, RESOLUTION_WIDTH } from "@/lib/exportGIF";
import { renderPNGToCanvas } from "@/lib/exportPNG";
import { drawPdfSceneOnCanvas, PDF_EXPORT_W } from "@/lib/exportPdf";
import { videoFrameSize } from "@/lib/exportVideo";
import type { Annotation, Scene } from "@/lib/types";

// ---------------------------------------------------------------------------
// Recording mock context (same shape as the one in courtRendering.test.ts)
// ---------------------------------------------------------------------------

type LogEntry = [op: string, ...args: unknown[]];

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

function fakeCanvas(ctx: CanvasRenderingContext2D, width = 0, height = 0): HTMLCanvasElement {
  return { width, height, getContext: () => ctx } as unknown as HTMLCanvasElement;
}

function record(fn: (ctx: CanvasRenderingContext2D) => void): LogEntry[] {
  const { ctx, log } = createRecordingCtx();
  fn(ctx);
  return log;
}

const FULL_CIRCLE = Math.PI * 2;
const hasArc = (log: LogEntry[], x: number, y: number, r: number) =>
  log.some((e) => e[0] === "arc" && e[1] === x && e[2] === y && e[3] === r && e[4] === 0 && e[5] === FULL_CIRCLE);

// drawBall builds its seams with Path2D, which Node does not have.
beforeAll(() => {
  if (typeof (globalThis as { Path2D?: unknown }).Path2D === "undefined") {
    (globalThis as { Path2D?: unknown }).Path2D = class {
      constructor(public d?: string) {}
    };
  }
});

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const ann = (id: string, type: Annotation["type"], extra: Partial<Annotation> = {}): Annotation => ({
  id,
  type,
  from: { x: 0.2, y: 0.3 },
  to: { x: 0.7, y: 0.8 },
  fromPlayer: null,
  toPlayer: null,
  controlPoints: [],
  ...extra,
});

const ANNOTATIONS: Annotation[] = [
  ann("a1", "movement"),
  ann("a2", "pass", { controlPoints: [{ x: 0.5, y: 0.2 }] }),
  ann("a3", "cut", { waypoints: [{ x: 0.4, y: 0.6 }] }),
  ann("a4", "screen"),
];

function makeScene(attached: boolean): Scene {
  return {
    id: "s1",
    order: 1,
    duration: 1000,
    note: "",
    players: {
      offense: [
        { position: 1, x: 0.5, y: 0.25, visible: true },
        { position: 2, x: 0.1, y: 0.9, visible: true },
        { position: 3, x: 0.9, y: 0.05, visible: false },
      ],
      defense: [
        { position: 1, x: 0.45, y: 0.4, visible: true },
        { position: 4, x: 0.8, y: 0.95, visible: true },
      ],
    },
    ball: { x: 0.3, y: 0.6, attachedTo: attached ? { side: "offense", position: 2 } : null },
    timingGroups: [
      { step: 1, duration: 800, annotations: ANNOTATIONS.slice(0, 2) },
      { step: 2, duration: 800, annotations: ANNOTATIONS.slice(2) },
    ],
  };
}

const VARIANTS: CourtVariant[] = ["half", "full"];
const CASES = VARIANTS.flatMap((variant) => [false, true].map((flipped) => ({ variant, flipped })));

/** Asserts that every visible token of `scene` is drawn where the shared contracts say. */
function expectTokens(log: LogEntry[], scene: Scene, layout: CourtLayout, flipped: boolean): void {
  const sizes = computeTokenSizes(layout.innerW);
  for (const side of ["offense", "defense"] as const) {
    for (const p of scene.players[side]) {
      const c = normToCanvasPx(p.x, p.y, layout, flipped);
      expect(hasArc(log, c.x, c.y, sizes.playerR), `${side} ${p.position}`).toBe(p.visible);
    }
  }
  const ball = scene.ball;
  let expected = normToCanvasPx(ball.x, ball.y, layout, flipped);
  if (ball.attachedTo) {
    const holder = scene.players[ball.attachedTo.side].find((p) => p.position === ball.attachedTo!.position)!;
    const h = normToCanvasPx(holder.x, holder.y, layout, flipped);
    // Screen space: always above the holder, never negated when flipped.
    expected = { x: h.x, y: h.y + sizes.ballAttachOffsetY };
    expect(sizes.ballAttachOffsetY).toBeLessThan(0);
  }
  expect(hasArc(log, expected.x, expected.y, sizes.ballR), "ball").toBe(true);
}

// ---------------------------------------------------------------------------
// GIF / MP4 frame
// ---------------------------------------------------------------------------

describe("GIF/MP4 frame (renderSceneToCtx)", () => {
  for (const width of [480, 800]) {
    for (const { variant, flipped } of CASES) {
      for (const attached of [false, true]) {
        const name = `${width}px ${variant} ${flipped ? "flipped" : "normal"} ${attached ? "ball attached" : "free ball"}`;
        const layout = computeCourtLayout(width, variant);
        const scene = makeScene(attached);

        it(`${name}: court is exactly paintCourt, drawn first`, () => {
          const court = record((ctx) => paintCourt(ctx, layout, { flipped }));
          const log = record((ctx) => renderSceneToCtx(ctx, layout, scene, ANNOTATIONS, flipped));
          expect(log.slice(0, court.length)).toEqual(court);
          // …and the court is painted once: no second floor fill afterwards.
          expect(log.slice(court.length).some((e) => e[0] === "fillRect")).toBe(false);
        });

        it(`${name}: tokens at normToCanvasPx with tokenSizing radii`, () => {
          const log = record((ctx) => renderSceneToCtx(ctx, layout, scene, ANNOTATIONS, flipped));
          expectTokens(log, scene, layout, flipped);
        });
      }
    }
  }

  it("annotation endpoints use normToCanvasPx (flipped: no oobBot compensation)", () => {
    const layout = computeCourtLayout(800, "half");
    const a = ann("m", "movement");
    for (const flipped of [false, true]) {
      const court = record((ctx) => paintCourt(ctx, layout, { flipped }));
      const log = record((ctx) => renderSceneToCtx(ctx, layout, makeScene(false), [a], flipped)).slice(court.length);
      const f = normToCanvasPx(a.from.x, a.from.y, layout, flipped);
      const t = normToCanvasPx(a.to.x, a.to.y, layout, flipped);
      const i = log.findIndex((e) => e[0] === "moveTo");
      expect(log[i]).toEqual(["moveTo", f.x, f.y]);
      expect(log[i + 1]).toEqual(["lineTo", t.x, t.y]);
    }
  });

  it("annotation strokes scale with annotationScale(totalWidth)", () => {
    expect(annotationScale(480)).toBe(1);
    expect(annotationScale(800)).toBe(800 / 480);
    const layout = computeCourtLayout(800, "half");
    const court = record((ctx) => paintCourt(ctx, layout, {}));
    const log = record((ctx) => renderSceneToCtx(ctx, layout, makeScene(false), [ann("m", "movement")], false)).slice(court.length);
    expect(log.find((e) => e[0] === "set lineWidth")).toEqual(["set lineWidth", 2.5 * annotationScale(800)]);
  });

  it("restores the context state it changes", () => {
    const layout = computeCourtLayout(480, "half");
    const log = record((ctx) => renderSceneToCtx(ctx, layout, makeScene(true), ANNOTATIONS, true));
    const count = (op: string) => log.filter((e) => e[0] === op).length;
    expect(count("save")).toBe(count("restore"));
  });

  it("renderFrame builds the layout from the canvas width and variant", () => {
    for (const { variant, flipped } of CASES) {
      const scene = makeScene(true);
      const layout = computeCourtLayout(480, variant);
      const expected = record((ctx) => renderSceneToCtx(ctx, layout, scene, ANNOTATIONS, flipped));
      const { ctx, log } = createRecordingCtx();
      renderFrame(fakeCanvas(ctx, 480, layout.totalHeight), scene, ANNOTATIONS, 480, layout.totalHeight, flipped, "numbers", {}, undefined, undefined, variant);
      expect(log).toEqual(expected);
    }
  });
});

// ---------------------------------------------------------------------------
// MP4 / WebM frame size
// ---------------------------------------------------------------------------

describe("defender tokens read like the editor's (PlayerToken.tsx)", () => {
  const layout = computeCourtLayout(480, "half");
  const court = record((ctx) => paintCourt(ctx, layout, { flipped: false }));
  const scene = makeScene(false);
  const texts = (log: LogEntry[]) => log.filter((e) => e[0] === "fillText").map((e) => e[1]);

  it("GIF/MP4/PNG frame: plain numbers in \"numbers\" mode, no X mark", () => {
    const log = record((ctx) => renderSceneToCtx(ctx, layout, scene, [], false)).slice(court.length);
    expect(texts(log).some((t) => /^X\d/.test(String(t)))).toBe(false);
    // The X was two straight strokes; with no annotations nothing else draws a lineTo.
    expect(log.some((e) => e[0] === "lineTo")).toBe(false);
  });

  it("PDF: plain numbers on both sides", () => {
    const log = record((ctx) => drawPdfSceneOnCanvas(fakeCanvas(ctx), scene, "half", false)).slice(court.length);
    expect(texts(log).some((t) => /^X\d/.test(String(t)))).toBe(false);
    expect(texts(log).filter((t) => /^[1-5]$/.test(String(t))).length).toBe(
      [...scene.players.offense, ...scene.players.defense].filter((p) => p.visible).length,
    );
  });
});

describe("video frame size", () => {
  it("is the shared layout's size for both encoder paths", () => {
    for (const res of ["sd", "hd"] as const) {
      for (const variant of VARIANTS) {
        const layout = computeCourtLayout(RESOLUTION_WIDTH[res], variant);
        const size = videoFrameSize(res, variant);
        expect(size.width).toBe(layout.totalWidth);
        expect(size.height).toBe(layout.totalHeight);
        // H.264 needs even dimensions: at most one row/column is cropped.
        expect(size.encW % 2).toBe(0);
        expect(size.encH % 2).toBe(0);
        expect(size.width - size.encW).toBeLessThanOrEqual(1);
        expect(size.height - size.encH).toBeLessThanOrEqual(1);
        // The layout is derived from encW, so it must not change the geometry.
        expect(computeCourtLayout(size.encW, variant)).toEqual(layout);
      }
    }
  });

  it("half-court sizes are unchanged from before the unification", () => {
    expect(videoFrameSize("sd", "half")).toMatchObject({ width: 480, height: 455 });
    expect(videoFrameSize("hd", "half")).toMatchObject({ width: 800, height: 759 });
  });
});

// ---------------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------------

describe("PNG (renderPNGToCanvas)", () => {
  for (const { variant, flipped } of CASES) {
    for (const res of [1, 2, 3]) {
      it(`${variant} ${flipped ? "flipped" : "normal"} @${res}x is a GIF frame of the same width, scaled`, () => {
        const scene = makeScene(true);
        const all = scene.timingGroups.flatMap((g) => g.annotations);
        const layout = computeCourtLayout(800, variant);
        const frame = record((ctx) => renderSceneToCtx(ctx, layout, scene, all, flipped));

        const { ctx, log } = createRecordingCtx();
        const canvas = fakeCanvas(ctx);
        renderPNGToCanvas(canvas, scene, 800, res, flipped, { variant });

        expect(canvas.width).toBe(Math.round(layout.totalWidth * res));
        expect(canvas.height).toBe(Math.round(layout.totalHeight * res));
        expect(log).toEqual([["scale", res, res], ...frame]);
        expectTokens(log, scene, layout, flipped);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

describe("PDF (drawPdfSceneOnCanvas)", () => {
  it("frame is the shared editor layout at the PDF width (OOB margins included)", () => {
    for (const variant of VARIANTS) {
      const layout = computeCourtLayout(PDF_EXPORT_W, variant);
      const canvas = fakeCanvas(createRecordingCtx().ctx);
      drawPdfSceneOnCanvas(canvas, makeScene(false), variant, false);
      expect(canvas.width).toBe(layout.totalWidth);
      expect(canvas.height).toBe(layout.totalHeight);
      expect(layout.oobLeft).toBeGreaterThan(0);
      expect(layout.oobBot).toBeGreaterThan(0);
    }
  });

  for (const { variant, flipped } of CASES) {
    for (const attached of [false, true]) {
      const name = `${variant} ${flipped ? "flipped" : "normal"} ${attached ? "ball attached" : "free ball"}`;
      const layout = computeCourtLayout(PDF_EXPORT_W, variant);
      const scene = makeScene(attached);

      it(`${name}: court is exactly paintCourt, drawn first`, () => {
        const court = record((ctx) => paintCourt(ctx, layout, { flipped }));
        const { ctx, log } = createRecordingCtx();
        drawPdfSceneOnCanvas(fakeCanvas(ctx), scene, variant, flipped);
        expect(log.slice(0, court.length)).toEqual(court);
        expect(log.slice(court.length).some((e) => e[0] === "fillRect")).toBe(false);
      });

      it(`${name}: tokens at normToCanvasPx with tokenSizing radii`, () => {
        const { ctx, log } = createRecordingCtx();
        drawPdfSceneOnCanvas(fakeCanvas(ctx), scene, variant, flipped);
        expectTokens(log, scene, layout, flipped);
      });
    }
  }

  // Decision 2 (issue #170): the PDF uses the editor's flip frame. A player
  // standing on the free-throw line is measured against the FT marking, using
  // the flip transform the PDF actually issued.
  describe("flip frame matches the editor (player on the FT line vs the FT marking)", () => {
    /** y of the player's token minus y of the near-end FT line, in canvas px. */
    function ftOffset(variant: CourtVariant, flipped: boolean): { px: number; layout: CourtLayout } {
      const layout = computeCourtLayout(PDF_EXPORT_W, variant);
      const scene = makeScene(false);
      scene.players.offense = [{ position: 1, x: 0.5, y: FT_CIRCLE_CENTER_Y, visible: true }];
      scene.players.defense = [];
      scene.timingGroups = [];
      const { ctx, log } = createRecordingCtx();
      drawPdfSceneOnCanvas(fakeCanvas(ctx), scene, variant, flipped);

      // Whole-canvas flip: the first translate with x = 0 followed by scale(1,-1).
      const ti = log.findIndex((e, i) => e[0] === "translate" && e[1] === 0 && log[i + 1]?.[0] === "scale" && log[i + 1]?.[2] === -1);
      expect(ti > -1, "flip transform issued").toBe(flipped);
      // Unflipped y of the near-end FT line, as paintCourt draws it.
      const unflipped = layout.playAreaOffsetY + FT_CIRCLE_CENTER_Y * layout.innerH;
      const markingY = flipped ? (log[ti][2] as number) - unflipped : unflipped;

      const { playerR } = computeTokenSizes(layout.innerW);
      const token = log.find((e) => e[0] === "arc" && e[3] === playerR && e[5] === FULL_CIRCLE)!;
      return { px: (token[2] as number) - markingY, layout };
    }

    it("normal: the player sits on the marking (half and full)", () => {
      for (const variant of VARIANTS) expect(ftOffset(variant, false).px).toBeCloseTo(0, 9);
    });

    it("half flipped: the player sits oobBot above the marking, as in the editor", () => {
      const { px, layout } = ftOffset("half", true);
      expect(px).toBeCloseTo(-layout.oobBot, 9);
      // Same offset relative to the court width as the editor at its own width
      // (579 px canvas in the director's drill), up to pixel rounding.
      const editor = computeCourtLayout(579, "half");
      expect(px / layout.innerW).toBeCloseTo(-editor.oobBot / editor.innerW, 2);
      // …and nowhere near the old no-OOB frame, which had it at ~0.
      expect(Math.abs(px / layout.innerW)).toBeGreaterThan(0.06);
    });

    it("full flipped: tokens stay in the bottom band, markings flip about totalHeight", () => {
      const { px, layout } = ftOffset("full", true);
      // marking: totalHeight - (innerH + oobBot + ft*innerH); token: (1-ft)*innerH + innerH + oobBot
      expect(px).toBeCloseTo(layout.innerH + layout.oobBot, 9);
    });

    it("relative offset equals the GIF/MP4/PNG frame at the same width", () => {
      for (const { variant, flipped } of CASES) {
        const layout = computeCourtLayout(PDF_EXPORT_W, variant);
        const scene = makeScene(true);
        const pdf = record((ctx) => drawPdfSceneOnCanvas(fakeCanvas(ctx), scene, variant, flipped));
        const gif = record((ctx) => renderSceneToCtx(ctx, layout, scene, [], flipped));
        const court = record((ctx) => paintCourt(ctx, layout, { flipped }));
        // Identical court prefix, and both pass the same token-position check.
        expect(pdf.slice(0, court.length)).toEqual(gif.slice(0, court.length));
        expectTokens(pdf, scene, layout, flipped);
        expectTokens(gif, scene, layout, flipped);
      }
    });
  });

  it("token sizes come from the inner court width, like every other renderer", () => {
    const layout = computeCourtLayout(PDF_EXPORT_W, "half");
    const sizes = computeTokenSizes(layout.innerW);
    const scene = makeScene(false);
    const court = record((ctx) => paintCourt(ctx, layout, {}));
    const log = record((ctx) => drawPdfSceneOnCanvas(fakeCanvas(ctx), scene, "half", false)).slice(court.length);
    const radii = new Set(log.filter((e) => e[0] === "arc" && e[5] === FULL_CIRCLE).map((e) => e[3]));
    expect(Array.from(radii).sort()).toEqual([sizes.ballR, sizes.playerR].sort());
  });

  it("annotations live in the play area and respect maxStep", () => {
    for (const { variant, flipped } of CASES) {
      const frame = computeCourtLayout(PDF_EXPORT_W, variant);
      const scene = makeScene(false);
      const first = scene.timingGroups[0].annotations[0];
      const f = normToCanvasPx(first.from.x, first.from.y, frame, flipped);
      const t = normToCanvasPx(first.to.x, first.to.y, frame, flipped);
      const { ctx, log } = createRecordingCtx();
      drawPdfSceneOnCanvas(fakeCanvas(ctx), scene, variant, flipped, 1);
      const i = log.findIndex((e) => e[0] === "moveTo" && e[1] === f.x && e[2] === f.y);
      expect(i).toBeGreaterThan(-1);
      expect(log[i + 1]).toEqual(["lineTo", t.x, t.y]);
      // step 2's cut (dash 4×/3× line width) is not drawn at maxStep = 1
      const all = record((c) => drawPdfSceneOnCanvas(fakeCanvas(c), scene, variant, flipped));
      expect(all.length).toBeGreaterThan(log.length);
    }
  });

  it("has no private frame: no computePdfFrame, no legacy drawCourt", () => {
    const src = readFileSync(path.resolve(process.cwd(), "src/lib/exportPdf.ts"), "utf8");
    expect(src).not.toMatch(/computePdfFrame|drawCourt\b|oobBot/);
    expect(src).toMatch(/computeCourtLayout\(EXPORT_W, courtType\)/);
    expect(src).toMatch(/paintCourt\(ctx, layout, \{ flipped \}\)/);
  });
});

// ---------------------------------------------------------------------------
// No exporter keeps its own court / layout / sizing copy
// ---------------------------------------------------------------------------

describe("exporter sources", () => {
  const read = (f: string) => readFileSync(path.resolve(process.cwd(), "src/lib", f), "utf8");
  const files = ["exportGIF.ts", "exportPNG.ts", "exportVideo.ts", "exportPdf.ts"];

  it.each(files)("%s has no court-drawing, layout or sizing copy", (file) => {
    const src = read(file);
    expect(src).not.toMatch(/drawCourtOnCanvas|drawHalfCourtInner/);
    expect(src).not.toMatch(/function\s+computeCourtLayout/);
    expect(src).not.toMatch(/components\/court\/Court"/); // court drawing comes from src/lib
    expect(src).not.toMatch(/COLOR_COURT|COLOR_PAINT|COLOR_LINE/);
    expect(src).not.toMatch(/OOB_SIDE_FRAC|OOB_BOTTOM_FRAC|-\s*oobBot/);
    expect(src).not.toMatch(/const\s+(PLAYER_RADIUS|BALL_RADIUS|PLAYER_R|BALL_R)\b/);
    expect(src).not.toMatch(/\*\s*0\.03\b|\*\s*0\.02\b|\*\s*0\.016\b/);
    expect(src).not.toMatch(/toX\s*=|toY\s*=/);
  });

  it("exportVideo takes the layout from courtLayout, not exportGIF", () => {
    const src = read("exportVideo.ts");
    expect(src).toMatch(/import\s*\{[^}]*computeCourtLayout[^}]*\}\s*from\s*"@\/lib\/courtLayout"/);
    expect(src).not.toMatch(/computeCourtLayout[^;]*from\s*"\.\/exportGIF"/);
  });

  it("no exporter negates the ball attach offset when flipped", () => {
    for (const file of files) {
      expect(read(file)).not.toMatch(/flipped\s*\?\s*-\s*ballAttachOffsetY/);
    }
  });
});
