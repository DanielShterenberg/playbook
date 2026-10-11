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
import { paintCourt, COLOR_OOB } from "@/lib/courtRendering";
import { computeTokenSizes } from "@/lib/tokenSizing";
import { renderSceneToCtx, renderFrame, annotationScale, RESOLUTION_WIDTH } from "@/lib/frameRenderer";
import { renderPNGToCanvas } from "@/lib/exportPNG";
import { drawPdfSceneOnCanvas, pdfPanels, PDF_EXPORT_W, type PdfPanel } from "@/lib/exportPdf";
import { videoFrameSize, renderVideoFrame } from "@/lib/exportVideo";
import type { Annotation, Play, Scene } from "@/lib/types";

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
      // annotations are drawn after the tokens and the ball (whose highlight also uses moveTo)
      const i = log.findIndex((e) => e[0] === "moveTo" && e[1] === f.x && e[2] === f.y);
      expect(i).toBeGreaterThan(-1);
      expect(log[i + 1]).toEqual(["lineTo", t.x, t.y]);
    }
  });

  it("annotation sizes scale with the inner court width, like the tokens (design size: innerW = 600)", () => {
    expect(annotationScale(600)).toBe(1);
    expect(annotationScale(300)).toBe(0.5);
    const layout = computeCourtLayout(800, "half");
    const log = record((ctx) => renderSceneToCtx(ctx, layout, makeScene(false), [ann("m", "movement")], false));
    expect(log.filter((e) => e[0] === "set lineWidth").pop()).toEqual(["set lineWidth", 2.5 * (layout.innerW / 600)]);
    // …so an annotation keeps its size relative to a token at every resolution.
    for (const w of [480, 800, 1200, 2400]) {
      const l = computeCourtLayout(w, "half");
      expect((12 * annotationScale(l.innerW)) / (l.innerW * 0.03)).toBeCloseTo(12 / 18, 12);
    }
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
      renderFrame(fakeCanvas(ctx, 480, layout.totalHeight), scene, ANNOTATIONS, 480, layout.totalHeight, flipped, {}, variant);
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
  it("is the shared layout's size, padded UP to even dimensions (H.264) — nothing is cropped", () => {
    for (const res of ["sd", "hd"] as const) {
      for (const variant of VARIANTS) {
        const layout = computeCourtLayout(RESOLUTION_WIDTH[res], variant);
        const size = videoFrameSize(res, variant);
        // The court is laid out exactly as everywhere else…
        expect(size.width).toBe(layout.totalWidth);
        expect(size.height).toBe(layout.totalHeight);
        // …on a canvas that is even and never smaller than the layout.
        expect(size.encW % 2).toBe(0);
        expect(size.encH % 2).toBe(0);
        expect(size.encW - size.width === 0 || size.encW - size.width === 1).toBe(true);
        expect(size.encH - size.height === 0 || size.encH - size.height === 1).toBe(true);
      }
    }
  });

  it("half-court layouts are unchanged; the odd heights gain one row instead of losing one", () => {
    expect(videoFrameSize("sd", "half")).toEqual({ width: 480, height: 455, encW: 480, encH: 456 });
    expect(videoFrameSize("hd", "half")).toEqual({ width: 800, height: 759, encW: 800, encH: 760 });
    expect(videoFrameSize("sd", "full")).toEqual({ width: 480, height: 880, encW: 480, encH: 880 });
    expect(videoFrameSize("hd", "full")).toEqual({ width: 800, height: 1468, encW: 800, encH: 1468 });
  });

  it("both encoder paths size their canvas from encW × encH", () => {
    const src = readFileSync(path.resolve(process.cwd(), "src/lib/exportVideo.ts"), "utf8");
    expect(src.match(/canvas\.width\s*=\s*encW;/g)).toHaveLength(2);
    expect(src.match(/canvas\.height\s*=\s*encH;/g)).toHaveLength(2);
    expect(src).not.toMatch(/canvas\.(width|height)\s*=\s*(width|height);/);
  });
});

describe("video frame (renderVideoFrame)", () => {
  const style = { displayMode: "names" as const, playerNames: { "offense-1": "Dan" }, offenseColor: "#112233", defenseColor: "#445566" };

  for (const res of ["sd", "hd"] as const) {
    for (const { variant, flipped } of CASES) {
      it(`${res} ${variant} ${flipped ? "flipped" : "normal"}: the full layout frame, floor colour in the padding row`, () => {
        const size = videoFrameSize(res, variant);
        const layout = computeCourtLayout(size.width, variant);
        const scene = makeScene(true);
        const frame = record((ctx) =>
          renderSceneToCtx(ctx, layout, scene, ANNOTATIONS, flipped, style),
        );
        const { ctx, log } = createRecordingCtx();
        renderVideoFrame(fakeCanvas(ctx, size.encW, size.encH), size, scene, ANNOTATIONS, flipped, variant, style);

        const padded = size.encW !== size.width || size.encH !== size.height;
        const pad: LogEntry[] = padded ? [["set fillStyle", COLOR_OOB], ["fillRect", 0, 0, size.encW, size.encH]] : [];
        expect(log).toEqual([...pad, ...frame]);
        // The court floor still covers the whole layout: no row of it is lost.
        expect(log.some((e) => e[0] === "fillRect" && e[3] === layout.totalWidth && e[4] === layout.totalHeight)).toBe(true);
        expectTokens(log, scene, layout, flipped);
      });
    }
  }

  it("defaults to the plain numbers frame", () => {
    const size = videoFrameSize("sd", "full");
    const layout = computeCourtLayout(size.width, "full");
    const scene = makeScene(false);
    const { ctx, log } = createRecordingCtx();
    renderVideoFrame(fakeCanvas(ctx, size.encW, size.encH), size, scene, [], false, "full");
    expect(log).toEqual(record((c) => renderSceneToCtx(c, layout, scene, [], false)));
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
      // The frame painter draws the token's drop shadow first, then the token.
      const discs = log.filter((e) => e[0] === "arc" && e[3] === playerR && e[5] === FULL_CIRCLE);
      expect(discs).toHaveLength(2);
      const token = discs[1];
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

  // Issue #174: a PDF panel is the same picture as a video frame.
  describe("panel is a video frame at the PDF width (renderSceneToCtx)", () => {
    const style = { displayMode: "names" as const, playerNames: { "offense-1": "Dan", "defense-4": "Big" }, offenseColor: "#112233", defenseColor: "#445566" };
    const upTo = (scene: Scene, maxStep: number) =>
      [...scene.timingGroups].sort((a, b) => a.step - b.step).filter((g) => g.step <= maxStep).flatMap((g) => g.annotations);

    for (const { variant, flipped } of CASES) {
      for (const maxStep of [1, 2, Infinity]) {
        it(`${variant} ${flipped ? "flipped" : "normal"} maxStep=${maxStep}: identical call log, defaults`, () => {
          const layout = computeCourtLayout(PDF_EXPORT_W, variant);
          const scene = makeScene(true);
          const frame = record((ctx) => renderSceneToCtx(ctx, layout, scene, upTo(scene, maxStep), flipped));
          const pdf = record((ctx) => drawPdfSceneOnCanvas(fakeCanvas(ctx), scene, variant, flipped, maxStep));
          expect(pdf).toEqual(frame);
        });

        it(`${variant} ${flipped ? "flipped" : "normal"} maxStep=${maxStep}: identical call log with label mode, names and team colours`, () => {
          const layout = computeCourtLayout(PDF_EXPORT_W, variant);
          const scene = makeScene(false);
          const frame = record((ctx) =>
            renderSceneToCtx(ctx, layout, scene, upTo(scene, maxStep), flipped, style),
          );
          const pdf = record((ctx) => drawPdfSceneOnCanvas(fakeCanvas(ctx), scene, variant, flipped, maxStep, style));
          expect(pdf).toEqual(frame);
        });
      }
    }

    it("step filter is cumulative and ordered by step, whatever the stored group order", () => {
      const layout = computeCourtLayout(PDF_EXPORT_W, "half");
      const scene = makeScene(false);
      scene.timingGroups = [...scene.timingGroups].reverse();
      const [a1, a2, a3, a4] = ANNOTATIONS;
      const expectLog = (maxStep: number | undefined, anns: Annotation[]) =>
        expect(record((ctx) => drawPdfSceneOnCanvas(fakeCanvas(ctx), scene, "half", false, maxStep))).toEqual(
          record((ctx) => renderSceneToCtx(ctx, layout, scene, anns, false)),
        );
      expectLog(0, []);
      expectLog(1, [a1, a2]);
      expectLog(2, [a1, a2, a3, a4]);
      expectLog(undefined, [a1, a2, a3, a4]);
    });

    it("label mode, names and team colours reach the tokens", () => {
      const scene = makeScene(false);
      const texts = (log: LogEntry[]) => log.filter((e) => e[0] === "fillText").map((e) => e[1]);
      const fills = (log: LogEntry[]) => log.filter((e) => e[0] === "set fillStyle").map((e) => e[1]);
      const draw = (opts?: Parameters<typeof drawPdfSceneOnCanvas>[5]) =>
        record((ctx) => drawPdfSceneOnCanvas(fakeCanvas(ctx), scene, "half", false, Infinity, opts));

      expect(texts(draw()).sort()).toEqual(["1", "1", "2", "4"]);
      expect(texts(draw({ displayMode: "abbreviations" })).sort()).toEqual(["PF", "PG", "PG", "SG"]);
      expect(texts(draw({ displayMode: "names", playerNames: style.playerNames })).sort()).toEqual(["2", "Big", "Dan", "X1"]);

      const custom = draw({ offenseColor: "#112233", defenseColor: "#445566" });
      expect(fills(custom)).toContain("#112233");
      expect(fills(custom)).toContain("#445566");
      expect(fills(draw())).not.toContain("#112233");
    });
  });

  it("has no private renderer: no own frame, tokens, annotations or court call", () => {
    const src = readFileSync(path.resolve(process.cwd(), "src/lib/exportPdf.ts"), "utf8");
    expect(src).not.toMatch(/computePdfFrame|drawCourt\b|oobBot/);
    expect(src).toMatch(/computeCourtLayout\(EXPORT_W, courtType\)/);
    expect(src).toMatch(/import \{ renderSceneToCtx \} from "\.\/frameRenderer"/);
    expect(src).toMatch(/renderSceneToCtx\(/);
    expect(src).not.toMatch(/function (drawPlayer|drawBall|drawAnnotation|drawArrowHead|strokeBezier)\b/);
    expect(src).not.toMatch(/paintCourt|normToCanvasPx|computeTokenSizes/);
    expect(src).not.toMatch(/ctx\.(arc|fill|stroke|moveTo|lineTo|setLineDash|fillText)\(/);
    expect(src).not.toMatch(/ANN_|EXPORT_W \*/);
  });
});

// ---------------------------------------------------------------------------
// One frame style for every exporter (review item 3)
// ---------------------------------------------------------------------------

describe("frame style", () => {
  const style = { displayMode: "names" as const, playerNames: { "offense-1": "Dan" }, offenseColor: "#112233", defenseColor: "#445566" };
  const texts = (log: LogEntry[]) => log.filter((e) => e[0] === "fillText").map((e) => e[1]);
  const fills = (log: LogEntry[]) => log.filter((e) => e[0] === "set fillStyle").map((e) => e[1]);

  it("renderSceneToCtx takes the style as one object; omitted fields default", () => {
    const layout = computeCourtLayout(480, "half");
    const scene = makeScene(false);
    const plain = record((ctx) => renderSceneToCtx(ctx, layout, scene, [], false));
    expect(record((ctx) => renderSceneToCtx(ctx, layout, scene, [], false, {}))).toEqual(plain);
    expect(record((ctx) => renderSceneToCtx(ctx, layout, scene, [], false, { displayMode: "numbers", playerNames: {} }))).toEqual(plain);
    const styled = record((ctx) => renderSceneToCtx(ctx, layout, scene, [], false, style));
    expect(texts(styled)).toContain("Dan");
    expect(fills(styled)).toEqual(expect.arrayContaining(["#112233", "#445566"]));
  });

  it("PNG, video and PDF hand the same object to the same painter", () => {
    const scene = makeScene(true);
    const all = scene.timingGroups.flatMap((g) => g.annotations);
    for (const { variant, flipped } of CASES) {
      const png = record((ctx) => renderPNGToCanvas(fakeCanvas(ctx), scene, 800, 1, flipped, { variant, ...style }));
      expect(png.slice(1)).toEqual(record((ctx) => renderSceneToCtx(ctx, computeCourtLayout(800, variant), scene, all, flipped, style)));

      const size = videoFrameSize("hd", variant);
      const video = record((ctx) => renderVideoFrame(fakeCanvas(ctx, size.encW, size.encH), size, scene, all, flipped, variant, style));
      const frame = record((ctx) => renderSceneToCtx(ctx, computeCourtLayout(800, variant), scene, all, flipped, style));
      expect(video.slice(video.length - frame.length)).toEqual(frame);

      const pdf = record((ctx) => drawPdfSceneOnCanvas(fakeCanvas(ctx), scene, variant, flipped, Infinity, style));
      expect(pdf).toEqual(record((ctx) => renderSceneToCtx(ctx, computeCourtLayout(PDF_EXPORT_W, variant), scene, all, flipped, style)));
    }
  });

  it("is declared once (frameRenderer.ts) and imported by the exporters", () => {
    const read = (f: string) => readFileSync(path.resolve(process.cwd(), "src/lib", f), "utf8");
    expect(read("frameRenderer.ts")).toMatch(/export interface FrameStyle \{/);
    for (const f of ["exportPNG.ts", "exportVideo.ts", "exportPdf.ts"]) {
      const src = read(f);
      expect(src, f).toMatch(/FrameStyle/);
      expect(src, f).not.toMatch(/playerNames\?: Record<string, string>/);
      expect(src, f).not.toMatch(/displayMode\?: PlayerDisplayMode/);
      expect(src, f).not.toMatch(/interface (PdfSceneStyle|VideoFrameStyle)/);
    }
    // No renderer is called with the style unpacked into positional arguments.
    for (const f of ["frameRenderer.ts", "exportPNG.ts", "exportVideo.ts", "exportPdf.ts"]) {
      expect(read(f), f).not.toMatch(/playerNames,\s*offenseColor,\s*defenseColor,?\s*\)/);
    }
  });

  it("both video encoder paths pass the style (WebCodecs and the MediaRecorder fallback)", () => {
    const src = readFileSync(path.resolve(process.cwd(), "src/lib/exportVideo.ts"), "utf8");
    const calls = src.match(/renderVideoFrame\(canvas,[^;]*\);/g) ?? [];
    expect(calls).toHaveLength(4);
    for (const c of calls) expect(c).toMatch(/, variant, style\);$/);
    expect(src).not.toMatch(/"numbers", \{\}/);
  });
});

// ---------------------------------------------------------------------------
// A scene without a ball renders without one — never throws (review item 1)
// ---------------------------------------------------------------------------

describe("scene without a ball", () => {
  const noBall = (): Scene => ({ ...makeScene(false), ball: undefined } as unknown as Scene);
  const nullBall = (): Scene => ({ ...makeScene(false), ball: null } as unknown as Scene);
  const BALL = "#F2B33D";
  const hasBall = (log: LogEntry[]) => log.some((e) => e[0] === "set fillStyle" && e[1] === BALL);

  for (const make of [noBall, nullBall]) {
    for (const { variant, flipped } of CASES) {
      it(`${make.name} ${variant} ${flipped ? "flipped" : "normal"}: frame, PNG, PDF and video draw everything but the ball`, () => {
        const scene = make();
        const layout = computeCourtLayout(480, variant);
        const withBall = record((ctx) => renderSceneToCtx(ctx, layout, makeScene(false), ANNOTATIONS, flipped));
        const frame = record((ctx) => renderSceneToCtx(ctx, layout, scene, ANNOTATIONS, flipped));
        expect(hasBall(withBall)).toBe(true);
        expect(hasBall(frame)).toBe(false);
        expect(frame.length).toBeLessThan(withBall.length);
        const { playerR } = computeTokenSizes(layout.innerW);
        const players = (log: LogEntry[]) => log.filter((e) => e[0] === "arc" && e[3] === playerR);
        expect(players(frame)).toEqual(players(withBall));
        expect(frame.filter((e) => e[0] === "save").length).toBe(frame.filter((e) => e[0] === "restore").length);

        const png = record((ctx) => renderPNGToCanvas(fakeCanvas(ctx), scene, 800, 2, flipped, { variant }));
        const pdf = record((ctx) => drawPdfSceneOnCanvas(fakeCanvas(ctx), scene, variant, flipped));
        const size = videoFrameSize("sd", variant);
        const video = record((ctx) => renderVideoFrame(fakeCanvas(ctx, size.encW, size.encH), size, scene, ANNOTATIONS, flipped, variant));
        for (const log of [png, pdf, video]) {
          expect(log.length).toBeGreaterThan(50);
          expect(hasBall(log)).toBe(false);
        }
      });
    }
  }
});

// ---------------------------------------------------------------------------
// No exporter keeps its own court / layout / sizing copy
// ---------------------------------------------------------------------------

describe("exporter sources", () => {
  const read = (f: string) => readFileSync(path.resolve(process.cwd(), "src/lib", f), "utf8");
  const files = ["frameRenderer.ts", "exportPNG.ts", "exportVideo.ts", "exportPdf.ts"];

  // Review item 7: the painter lives in a neutral module that no exporter owns.
  it("the frame painter is neutral: it imports no exporter", () => {
    const painter = read("frameRenderer.ts");
    expect(painter).not.toMatch(/from "\.\/export/);
    for (const name of ["FrameStyle", "renderSceneToCtx", "renderFrame", "annotationScale"]) {
      expect(painter, name).toMatch(new RegExp(`export (interface|function) ${name}\\b`));
    }
  });

  it.each(files)("%s has no court-drawing, layout or sizing copy", (file) => {
    const src = read(file);
    expect(src).not.toMatch(/drawCourtOnCanvas|drawHalfCourtInner/);
    expect(src).not.toMatch(/function\s+computeCourtLayout/);
    expect(src).not.toMatch(/components\/court\/Court"/); // court drawing comes from src/lib
    // Shared colour constants may be imported, never redefined or hard-coded.
    expect(src).not.toMatch(/(const|let|var)\s+(COLOR_COURT|COLOR_PAINT|COLOR_LINE)\b/);
    expect(src).not.toMatch(/COLOR_PAINT|COLOR_LINE/);
    expect(src).not.toMatch(/#F0C878/i);
    expect(src).not.toMatch(/OOB_SIDE_FRAC|OOB_BOTTOM_FRAC|-\s*oobBot/);
    expect(src).not.toMatch(/const\s+(PLAYER_RADIUS|BALL_RADIUS|PLAYER_R|BALL_R)\b/);
    expect(src).not.toMatch(/\*\s*0\.03\b|\*\s*0\.02\b|\*\s*0\.016\b/);
    expect(src).not.toMatch(/toX\s*=|toY\s*=/);
  });

  it("exportVideo takes the layout from courtLayout", () => {
    const src = read("exportVideo.ts");
    expect(src).toMatch(/import\s*\{[^}]*computeCourtLayout[^}]*\}\s*from\s*"@\/lib\/courtLayout"/);
  });

  it("no exporter negates the ball attach offset when flipped", () => {
    for (const file of files) {
      expect(read(file)).not.toMatch(/flipped\s*\?\s*-\s*ballAttachOffsetY/);
    }
  });
});

// ---------------------------------------------------------------------------
// Annotations are the editor's (AnnotationLayer.tsx is the reference)
//
// The editor draws annotations in fixed CSS px; the painter draws them at the
// same sizes × annotationScale(innerW). At innerW = 600 (total width 636) the
// scale is 1, so the painter's numbers must be the editor's numbers.
// ---------------------------------------------------------------------------

describe("annotations match the editor (AnnotationLayer.tsx)", () => {
  const layout = computeCourtLayout(636, "half");
  const editorSrc = readFileSync(path.resolve(process.cwd(), "src/components/annotations/AnnotationLayer.tsx"), "utf8");
  const rendered = editorSrc.slice(editorSrc.indexOf("function RenderedAnnotation("), editorSrc.indexOf("// In-progress (preview) annotation"));

  /** The editor's visible strokes for a type, read from its source: [colour, width, dash, opacity]. */
  function editorStrokes(type: string): Array<{ color: string; width: number; dash: number[]; opacity: number }> {
    const start = rendered.indexOf(`if (type === "${type}")`);
    expect(start, type).toBeGreaterThan(-1);
    const next = rendered.indexOf("if (type ===", start + 10);
    const block = rendered.slice(start, next === -1 ? undefined : next);
    const out: Array<{ color: string; width: number; dash: number[]; opacity: number }> = [];
    for (const m of Array.from(block.matchAll(/<(path|line)\b([\s\S]*?)\/>/g))) {
      const attrs = m[2];
      const color = /stroke="(#[0-9A-Fa-f]{6})"/.exec(attrs)?.[1];
      if (!color) continue; // transparent hit area
      const width = Number(/strokeWidth=\{([\d.]+)\}/.exec(attrs)![1]);
      const dash = (/strokeDasharray="([\d. ]+)"/.exec(attrs)?.[1] ?? "").split(" ").filter(Boolean).map(Number);
      const opacity = Number(/opacity=\{([\d.]+)\}/.exec(attrs)?.[1] ?? 1);
      out.push({ color, width, dash, opacity });
    }
    return out;
  }

  /** The painter's strokes for one annotation: canvas state at each stroke() after the tokens. */
  function painterStrokes(a: Annotation): Array<{ color: string; width: number; dash: number[]; opacity: number }> {
    const log = record((ctx) => renderSceneToCtx(ctx, layout, makeScene(false), [a], false));
    const start = annStart(log);
    const state = { color: "", width: 0, dash: [] as number[], opacity: 1 };
    const out: Array<{ color: string; width: number; dash: number[]; opacity: number }> = [];
    log.forEach((e, i) => {
      if (i < start) return; // token drawing manages its own state with save/restore
      if (e[0] === "set strokeStyle") state.color = String(e[1]);
      if (e[0] === "set lineWidth") state.width = e[1] as number;
      if (e[0] === "setLineDash") state.dash = e[1] as number[];
      if (e[0] === "set globalAlpha") state.opacity = e[1] as number;
      if (e[0] === "stroke") out.push({ ...state, dash: [...state.dash] });
    });
    return out;
  }

  /** Index in a frame log where annotation drawing starts: after the last token / ball op. */
  function annStart(log: LogEntry[]): number {
    const scene = makeScene(false);
    const noAnn = record((ctx) => renderSceneToCtx(ctx, layout, scene, [], false));
    // logs are identical up to the point where the annotation-free frame ends its token drawing
    let i = 0;
    while (i < noAnn.length && i < log.length && JSON.stringify(noAnn[i]) === JSON.stringify(log[i])) i++;
    return i;
  }

  const uniq = (xs: Array<{ color: string; width: number; dash: number[]; opacity: number }>) =>
    Array.from(new Set(xs.map((x) => JSON.stringify(x)))).sort();

  const TYPES: Array<[Annotation["type"], Partial<Annotation>, string]> = [
    ["movement", {}, "straight"],
    ["movement", { controlPoints: [{ x: 0.5, y: 0.2 }] }, "curved"],
    ["movement", { waypoints: [{ x: 0.4, y: 0.6 }] }, "multi-leg"],
    ["pass", {}, "straight"],
    ["pass", { controlPoints: [{ x: 0.5, y: 0.2 }] }, "curved"],
    ["screen", {}, "straight"],
    ["cut", {}, "straight"],
    ["cut", { waypoints: [{ x: 0.4, y: 0.6 }] }, "multi-leg"],
    ["guard", {}, "straight"],
    ["handoff", {}, "straight"],
    ["handoff", { controlPoints: [{ x: 0.5, y: 0.2 }] }, "curved"],
  ];

  it.each(TYPES)("%s (%#): colour, width, dash and opacity are the editor's", (type, extra) => {
    const editor = editorStrokes(type);
    expect(editor.length).toBeGreaterThan(0);
    expect(uniq(painterStrokes(ann("x", type, extra)))).toEqual(uniq(editor));
  });

  it("the pass is solid and the guard link is 4-4 dashed at 85 % opacity (both were wrong)", () => {
    expect(uniq(painterStrokes(ann("p", "pass")))).toEqual([JSON.stringify({ color: "#059669", width: 2, dash: [], opacity: 1 })]);
    expect(uniq(painterStrokes(ann("g", "guard")))).toEqual([JSON.stringify({ color: "#D97706", width: 2, dash: [4, 4], opacity: 0.85 })]);
  });

  it("dribble: zigzag when straight, 5-4 dashes when curved or multi-leg — the editor's three branches", () => {
    const block = rendered.slice(rendered.indexOf('if (type === "dribble")'), rendered.indexOf('if (type === "pass")'));
    expect(block.match(/strokeDasharray="5 4"/g)).toHaveLength(2);
    const solid = { color: "#1E3A5F", width: 2.5, dash: [], opacity: 1 };
    const dashed = { ...solid, dash: [5, 4] };
    expect(uniq(painterStrokes(ann("d", "dribble")))).toEqual([JSON.stringify(solid)]);
    expect(uniq(painterStrokes(ann("d", "dribble", { controlPoints: [{ x: 0.5, y: 0.2 }] })))).toEqual([JSON.stringify(dashed)]);
    expect(uniq(painterStrokes(ann("d", "dribble", { waypoints: [{ x: 0.4, y: 0.6 }] })))).toEqual([JSON.stringify(dashed)]);
  });

  const px = (p: { x: number; y: number }) => normToCanvasPx(p.x, p.y, layout, false);
  const frameOps = (a: Annotation) => {
    const log = record((ctx) => renderSceneToCtx(ctx, layout, makeScene(false), [a], false));
    return log.slice(annStart(log));
  };
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

  it("straight dribble zigzag is the editor's: len/18 zigs, ±6 px, zero offset at BOTH ends", () => {
    const a = ann("d", "dribble");
    const f = px(a.from), t = px(a.to);
    const dx = t.x - f.x, dy = t.y - f.y, len = Math.hypot(dx, dy);
    const zigCount = Math.max(2, Math.round(len / 18));
    const expected: Array<[number, number]> = [];
    for (let i = 0; i <= zigCount; i++) {
      const tt = i / zigCount;
      const perp = i === 0 || i === zigCount ? 0 : i % 2 === 0 ? 6 : -6;
      expected.push([f.x + dx * tt + (-dy / len) * perp, f.y + dy * tt + (dx / len) * perp]);
    }
    const pts = frameOps(a).filter((e) => e[0] === "moveTo" || e[0] === "lineTo").slice(0, zigCount + 1);
    expect(pts.length).toBe(zigCount + 1);
    pts.forEach((e, i) => {
      expect(near(e[1] as number, expected[i][0]) && near(e[2] as number, expected[i][1]), `zig ${i}`).toBe(true);
    });
    expect(pts[0]).toEqual(["moveTo", f.x, f.y]);
  });

  it("arrowhead is the editor's 12 px triangle (half-width 0.45 × 12), along the control-point tangent when curved", () => {
    for (const cp of [undefined, { x: 0.5, y: 0.2 }]) {
      const a = ann("m", "movement", cp ? { controlPoints: [cp] } : {});
      const t = px(a.to), tail = cp ? px(cp) : px(a.from);
      const d = Math.hypot(t.x - tail.x, t.y - tail.y);
      const ux = (t.x - tail.x) / d, uy = (t.y - tail.y) / d;
      const bx = t.x - ux * 12, by = t.y - uy * 12, w = 12 * 0.45;
      const ops = frameOps(a);
      const i = ops.map((e) => e[0]).lastIndexOf("closePath");
      const tri = ops.slice(i - 3, i).map((e) => [e[1], e[2]]) as number[][];
      const expected = [[t.x, t.y], [bx - uy * w, by + ux * w], [bx + uy * w, by - ux * w]];
      tri.forEach((p, k) => expect(near(p[0], expected[k][0]) && near(p[1], expected[k][1]), `vertex ${k}`).toBe(true));
    }
  });

  it("screen: straight line plus a ±10 px bar, 3 px wide, no arrowhead", () => {
    const a = ann("s", "screen", { controlPoints: [{ x: 0.5, y: 0.2 }] }); // the editor ignores the control point
    const f = px(a.from), t = px(a.to);
    const ops = frameOps(a);
    expect(ops.some((e) => e[0] === "quadraticCurveTo")).toBe(false);
    expect(ops.some((e) => e[0] === "closePath")).toBe(false);
    const d = Math.hypot(t.x - f.x, t.y - f.y);
    const ux = (t.x - f.x) / d, uy = (t.y - f.y) / d;
    const moves = ops.filter((e) => e[0] === "moveTo" || e[0] === "lineTo");
    expect(moves[0]).toEqual(["moveTo", f.x, f.y]);
    expect(moves[1]).toEqual(["lineTo", t.x, t.y]);
    expect(near(moves[2][1] as number, t.x - uy * 10) && near(moves[2][2] as number, t.y + ux * 10)).toBe(true);
    expect(near(moves[3][1] as number, t.x + uy * 10) && near(moves[3][2] as number, t.y - ux * 10)).toBe(true);
  });

  it("hand-off ticks are the editor's: at t = 0.85 and 0.72, 9 px each side, perpendicular to the path", () => {
    const tickSrc = rendered.slice(rendered.indexOf('if (type === "handoff")'));
    expect(tickSrc).toMatch(/const tickLen = 9;/);
    expect(tickSrc).toMatch(/bezierPoint\(from, to, 0\.85, cp\)/);
    expect(tickSrc).toMatch(/bezierPoint\(from, to, 0\.72, cp\)/);
    expect(tickSrc).toMatch(/bezierPoint\(from, to, 0\.83, cp\)/);
    expect(tickSrc).toMatch(/bezierPoint\(from, to, 0\.70, cp\)/);

    const a = ann("h", "handoff");
    const f = px(a.from), t = px(a.to);
    const at = (tt: number) => ({ x: f.x + (t.x - f.x) * tt, y: f.y + (t.y - f.y) * tt });
    const d = Math.hypot(t.x - f.x, t.y - f.y);
    const pux = -(t.y - f.y) / d, puy = (t.x - f.x) / d;
    const moves = frameOps(a).filter((e) => e[0] === "moveTo" || e[0] === "lineTo");
    // body (2), tick 1 (2), tick 2 (2), then the arrowhead
    for (const [k, tt] of [[2, 0.85], [4, 0.72]] as const) {
      const c = at(tt);
      expect(near(moves[k][1] as number, c.x + pux * 9) && near(moves[k][2] as number, c.y + puy * 9), `tick at ${tt}`).toBe(true);
      expect(near(moves[k + 1][1] as number, c.x - pux * 9) && near(moves[k + 1][2] as number, c.y - puy * 9), `tick at ${tt}`).toBe(true);
    }
  });

  it("a pass ignores waypoints for its body, as the editor does (only move / cut / dribble are multi-leg)", () => {
    const a = ann("p", "pass", { waypoints: [{ x: 0.4, y: 0.6 }] });
    const moves = frameOps(a).filter((e) => e[0] === "moveTo" || e[0] === "lineTo");
    expect(moves[0]).toEqual(["moveTo", px(a.from).x, px(a.from).y]);
    expect(moves[1]).toEqual(["lineTo", px(a.to).x, px(a.to).y]);
  });

  it("z-order: every annotation is drawn AFTER all tokens and the ball, in the given order (the editor's layer sits on top)", () => {
    for (const { variant, flipped } of CASES) {
      const l = computeCourtLayout(800, variant);
      const scene = makeScene(true);
      const noAnn = record((ctx) => renderSceneToCtx(ctx, l, scene, [], flipped));
      const log = record((ctx) => renderSceneToCtx(ctx, l, scene, ANNOTATIONS, flipped));
      // the frame without annotations is a prefix (minus its closing restore)
      expect(log.slice(0, noAnn.length - 1)).toEqual(noAnn.slice(0, noAnn.length - 1));
      const after = log.slice(noAnn.length - 1);
      const sizes = computeTokenSizes(l.innerW);
      expect(after.some((e) => e[0] === "arc" && (e[3] === sizes.playerR || e[3] === sizes.ballR))).toBe(false);
      expect(after.some((e) => e[0] === "fillText")).toBe(false);
      // order: movement (navy), pass (green), cut (red), screen (purple)
      const colours = after.filter((e) => e[0] === "set strokeStyle").map((e) => e[1]);
      expect(Array.from(new Set(colours))).toEqual(["#1E3A5F", "#059669", "#DC2626", "#7C3AED"]);
    }
  });

  it("leaves no dash pattern or alpha behind", () => {
    const log = record((ctx) => renderSceneToCtx(ctx, layout, makeScene(false), [ann("g", "guard"), ann("c", "cut")], false));
    const dashes = log.filter((e) => e[0] === "setLineDash");
    expect(dashes[dashes.length - 1]).toEqual(["setLineDash", []]);
    const alphas = log.filter((e) => e[0] === "set globalAlpha");
    expect(alphas[alphas.length - 1]).toEqual(["set globalAlpha", 1]);
  });
});

// ---------------------------------------------------------------------------
// PDF panels: every scene gets at least one (review item 5)
// ---------------------------------------------------------------------------

describe("pdfPanels", () => {
  const scene = (id: string, order: number, steps: number[]): Scene => ({
    ...makeScene(false),
    id,
    order,
    timingGroups: steps.map((step) => ({ step, duration: 500, annotations: [] })),
  });
  const play = (scenes: Scene[]) => ({ title: "t", scenes } as unknown as Play);

  it("without export steps: one panel per scene, in scene order, showing everything", () => {
    const items = pdfPanels(play([scene("b", 2, [1, 2]), scene("a", 1, [])]), false);
    expect(items.map((i: PdfPanel) => [i.scene.id, i.maxStep, i.label])).toEqual([
      ["a", Infinity, "Scene 1"],
      ["b", Infinity, "Scene 2"],
    ]);
  });

  it("with export steps: one panel per timing step, sorted", () => {
    const items = pdfPanels(play([scene("a", 1, [2, 1])]), true);
    expect(items.map((i: PdfPanel) => [i.scene.id, i.maxStep, i.label])).toEqual([
      ["a", 1, "Scene 1 · Step 1"],
      ["a", 2, "Scene 1 · Step 2"],
    ]);
  });

  it("with export steps: a scene with no timing groups still gets one panel", () => {
    const items = pdfPanels(play([scene("a", 1, [1]), scene("b", 2, []), scene("c", 3, [1, 2])]), true);
    expect(items.map((i: PdfPanel) => [i.scene.id, i.maxStep, i.label])).toEqual([
      ["a", 1, "Scene 1 · Step 1"],
      ["b", Infinity, "Scene 2"],
      ["c", 1, "Scene 3 · Step 1"],
      ["c", 2, "Scene 3 · Step 2"],
    ]);
  });
});

describe("export step timing follows on-screen playback", () => {
  it("exporters take step durations from the playback helper, not the raw field", () => {
    for (const rel of ["src/lib/exportVideo.ts"]) {
      const src = readFileSync(path.join(process.cwd(), rel), "utf8");
      expect(src, rel).toMatch(/stepDurationMs\(/);
      expect(src, rel).not.toMatch(/\b(group|g)\.duration\b/);
    }
  });
});
