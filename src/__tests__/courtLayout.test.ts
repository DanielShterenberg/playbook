/**
 * Tests for courtLayout.ts — the shared layout and coordinate utilities.
 *
 * These tests are the safety net for the export coordinate system.
 * Every bug fixed in the export pipeline (player positions, court proportions,
 * flipped court offsets) has a corresponding test here so it cannot silently
 * regress.
 *
 * See GitHub issue #163 for the broader architectural context.
 */

import { describe, it, expect } from "vitest";
import {
  OOB_SIDE_FRAC,
  OOB_BOTTOM_FRAC,
  computeCourtLayout,
  normToCanvasPx,
  canvasPxToNorm,
} from "@/lib/courtLayout";
import { playerRadius, ballRadius } from "@/lib/tokenSizing";
import {
  COURT_ASPECT_RATIO,
  LANE_TOP,
  BASKET_Y,
  FT_CIRCLE_CENTER_Y,
} from "@/components/court/courtDimensions";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe("OOB margin constants", () => {
  it("side OOB fraction is 3%", () => {
    expect(OOB_SIDE_FRAC).toBe(0.03);
  });

  it("bottom OOB fraction is 7%", () => {
    expect(OOB_BOTTOM_FRAC).toBe(0.07);
  });

  it("COURT_ASPECT_RATIO is 50/47 (wider than tall)", () => {
    expect(COURT_ASPECT_RATIO).toBeCloseTo(50 / 47, 10);
  });
});

// ---------------------------------------------------------------------------
// computeCourtLayout
// ---------------------------------------------------------------------------

describe("computeCourtLayout", () => {
  it("innerW + 2*oobLeft === totalWidth (no pixel lost)", () => {
    for (const w of [480, 600, 800, 1280]) {
      const { oobLeft, innerW } = computeCourtLayout(w);
      expect(innerW + 2 * oobLeft).toBe(w);
    }
  });

  it("totalHeight === innerH + oobBot", () => {
    for (const w of [480, 600, 800]) {
      const { innerH, oobBot, totalHeight } = computeCourtLayout(w);
      expect(totalHeight).toBe(innerH + oobBot);
    }
  });

  it("innerH / innerW ≈ 1/COURT_ASPECT_RATIO (correct court proportions)", () => {
    for (const w of [480, 800]) {
      const { innerW, innerH } = computeCourtLayout(w);
      expect(innerH / innerW).toBeCloseTo(1 / COURT_ASPECT_RATIO, 2);
    }
  });

  it("oobBot ≈ 7% of innerH", () => {
    for (const w of [480, 800]) {
      const { innerH, oobBot } = computeCourtLayout(w);
      // Allow ±1 px for rounding
      expect(oobBot).toBeGreaterThanOrEqual(Math.round(innerH * OOB_BOTTOM_FRAC) - 1);
      expect(oobBot).toBeLessThanOrEqual(Math.round(innerH * OOB_BOTTOM_FRAC) + 1);
    }
  });

  it("SD (480 px wide) produces the expected pixel values", () => {
    const layout = computeCourtLayout(480);
    // oobLeft = round(480 * 0.03 / 1.06) = round(13.58) = 14
    expect(layout.oobLeft).toBe(14);
    // innerW = 480 - 28 = 452
    expect(layout.innerW).toBe(452);
    // innerH = round(452 / (50/47)) = round(424.88) = 425
    expect(layout.innerH).toBe(425);
    // oobBot = round(425 * 0.07) = round(29.75) = 30
    expect(layout.oobBot).toBe(30);
    // totalHeight = 425 + 30 = 455
    expect(layout.totalHeight).toBe(455);
  });

  it("HD (800 px wide) produces the expected pixel values", () => {
    const layout = computeCourtLayout(800);
    // oobLeft = round(800 * 0.03 / 1.06) = round(22.64) = 23
    expect(layout.oobLeft).toBe(23);
    // innerW = 800 - 46 = 754
    expect(layout.innerW).toBe(754);
    // innerH = round(754 / (50/47)) = round(708.76) = 709
    expect(layout.innerH).toBe(709);
    // oobBot = round(709 * 0.07) = round(49.63) = 50
    expect(layout.oobBot).toBe(50);
    // totalHeight = 709 + 50 = 759
    expect(layout.totalHeight).toBe(759);
  });
});

// ---------------------------------------------------------------------------
// normToCanvasPx — non-flipped half court
// ---------------------------------------------------------------------------

describe("normToCanvasPx — non-flipped half court", () => {
  const layout = computeCourtLayout(800);

  it("normY=0 (half-court line) maps to canvas top (y=0)", () => {
    const { y } = normToCanvasPx(0.5, 0, layout, false);
    expect(y).toBe(0);
  });

  it("normY=1 (baseline) maps to canvas y=innerH", () => {
    const { y } = normToCanvasPx(0.5, 1, layout, false);
    expect(y).toBe(layout.innerH);
  });

  it("normY=0.5 maps to y=innerH/2", () => {
    const { y } = normToCanvasPx(0.5, 0.5, layout, false);
    expect(y).toBeCloseTo(layout.innerH / 2, 5);
  });

  it("normX=0 (left sideline) maps to canvas x=oobLeft", () => {
    const { x } = normToCanvasPx(0, 0.5, layout, false);
    expect(x).toBe(layout.oobLeft);
  });

  it("normX=1 (right sideline) maps to canvas x=oobLeft+innerW (=totalWidth)", () => {
    const { x } = normToCanvasPx(1, 0.5, layout, false);
    expect(x).toBe(layout.oobLeft + layout.innerW);
  });

  it("normX=0.5 (centre) maps to canvas x=totalWidth/2", () => {
    const { x } = normToCanvasPx(0.5, 0.5, layout, false);
    expect(x).toBeCloseTo(800 / 2, 5);
  });

  it("player and court marking are at the same canvas y for any normY", () => {
    // Non-flipped court: markings at normY*innerH. Formula: normY*innerH. ✓
    for (const normY of [0, 0.25, LANE_TOP, BASKET_Y, 1]) {
      const { y: playerY } = normToCanvasPx(0.5, normY, layout, false);
      const courtMarkingY = normY * layout.innerH;
      expect(playerY).toBeCloseTo(courtMarkingY, 5);
    }
  });
});

// ---------------------------------------------------------------------------
// normToCanvasPx — flipped half court
// ---------------------------------------------------------------------------

describe("normToCanvasPx — flipped half court", () => {
  const layout = computeCourtLayout(800);

  it("normY=0 (half-court line) maps to canvas y=innerH (bottom)", () => {
    const { y } = normToCanvasPx(0.5, 0, layout, true);
    expect(y).toBe(layout.innerH);
  });

  it("normY=1 (baseline/basket) maps to canvas y=0 (top)", () => {
    const { y } = normToCanvasPx(0.5, 1, layout, true);
    expect(y).toBe(0);
  });

  it("normY=0.5 maps to y=innerH/2", () => {
    const { y } = normToCanvasPx(0.5, 0.5, layout, true);
    expect(y).toBeCloseTo(layout.innerH / 2, 5);
  });

  it("x axis is identical in flipped and non-flipped (flip is vertical only)", () => {
    for (const normX of [0, 0.25, 0.5, 0.75, 1]) {
      const normal  = normToCanvasPx(normX, 0.5, layout, false);
      const flipped = normToCanvasPx(normX, 0.5, layout, true);
      expect(flipped.x).toBe(normal.x);
    }
  });
});

// ---------------------------------------------------------------------------
// Regression tests — specific bugs that were fixed
// ---------------------------------------------------------------------------

describe("regressions", () => {
  it("HD canvas height is 759 not 752 (computeCourtLayout not Math.round(800/ASPECT_RATIO))", () => {
    // Bug: exportVideo.ts used Math.round(800 / COURT_ASPECT_RATIO) = 752 instead of
    // computeCourtLayout(800).totalHeight = 759. Fixed in commit c65e61e.
    const { totalHeight } = computeCourtLayout(800);
    expect(totalHeight).toBe(759);
    expect(Math.round(800 / COURT_ASPECT_RATIO)).toBe(752); // the wrong value
    expect(totalHeight).not.toBe(Math.round(800 / COURT_ASPECT_RATIO));
  });

  it("SD canvas height is 455 not 451 (computeCourtLayout not Math.round(480/ASPECT_RATIO))", () => {
    const { totalHeight } = computeCourtLayout(480);
    expect(totalHeight).toBe(455);
    expect(Math.round(480 / COURT_ASPECT_RATIO)).toBe(451);
    expect(totalHeight).not.toBe(Math.round(480 / COURT_ASPECT_RATIO));
  });

  it("export player Y is NOT equal to (1-normY)*innerH for flipped (oobBot correction required)", () => {
    // Documents that the naive formula is wrong for flipped export courts.
    const layout = computeCourtLayout(800);
    const normY = LANE_TOP;
    const naiveY   = (1 - normY) * layout.innerH;
    const correctY = (1 - normY) * layout.innerH - layout.oobBot;
    expect(naiveY).not.toBeCloseTo(correctY, 0);
  });

  it("FT_CIRCLE_CENTER_Y equals LANE_TOP (FT circle is centred on the FT line)", () => {
    expect(FT_CIRCLE_CENTER_Y).toBe(LANE_TOP);
  });
});

// ---------------------------------------------------------------------------
// Characterization (#168): normToCanvasPx ≡ the editor's local formulas
//
// The two oracles below are verbatim copies of the private helpers in
// src/components/players/CourtWithPlayers.tsx as of the start of milestone m1:
//   normToPx — lines 88–101
//   pxToNorm — lines 103–116
// The editor calls them with (see handleCourtReady lines 258–329 and the
// scene/flip effect lines 366–384):
//   paWidth   = payload.playAreaWidth   = innerW   (Court.tsx line 443)
//   paHeight  = payload.playAreaHeight  = innerH   (Court.tsx line 440)
//   paOffsetY = payload.playAreaOffsetY = variant === "full" ? innerH + oobBot : 0
//                                                  (Court.tsx line 426)
//   paOffsetX = payload.playAreaOffsetX = oobLeft  (Court.tsx line 442)
// Do not "simplify" these — they are the reference the shared code must match.
// ---------------------------------------------------------------------------

function editorNormToPx(
  normX: number,
  normY: number,
  paWidth: number,
  paHeight: number,
  paOffsetY: number,
  paOffsetX = 0,
  flipped = false,
): { x: number; y: number } {
  return {
    x: normX * paWidth + paOffsetX,
    y: flipped ? (1 - normY) * paHeight + paOffsetY : normY * paHeight + paOffsetY,
  };
}

function editorPxToNorm(
  px: number,
  py: number,
  paWidth: number,
  paHeight: number,
  paOffsetY: number,
  paOffsetX = 0,
  flipped = false,
): { x: number; y: number } {
  return {
    x: (px - paOffsetX) / paWidth,
    y: flipped ? 1 - (py - paOffsetY) / paHeight : (py - paOffsetY) / paHeight,
  };
}

/** Court.tsx draw() layout maths, lines 356–360 + 426, reproduced as an oracle. */
function editorLayout(cssWidth: number, variant: "half" | "full") {
  const oobLeft = Math.round((cssWidth * OOB_SIDE_FRAC) / (1 + 2 * OOB_SIDE_FRAC));
  const innerW  = cssWidth - 2 * oobLeft;
  const innerH  = Math.round(innerW / COURT_ASPECT_RATIO);
  const oobBot  = Math.round(innerH * OOB_BOTTOM_FRAC);
  const cssHeight = variant === "full" ? innerH * 2 + oobBot : innerH + oobBot;
  const playAreaOffsetY = variant === "full" ? innerH + oobBot : 0;
  return { oobLeft, innerW, innerH, oobBot, cssHeight, playAreaOffsetY };
}

const WIDTHS = [320, 375, 480, 600, 800, 1013, 1280];
const VARIANTS = ["half", "full"] as const;
const FLIPS = [false, true];
const NORMS = [-0.05, 0, 0.1, 0.25, LANE_TOP, 0.5, BASKET_Y, 0.9, 1, 1.04];

describe("computeCourtLayout — variant", () => {
  it("defaults to half and matches Court.tsx's draw() maths for both variants", () => {
    for (const w of WIDTHS) {
      expect(computeCourtLayout(w)).toEqual(computeCourtLayout(w, "half"));
      for (const variant of VARIANTS) {
        const o = editorLayout(w, variant);
        const l = computeCourtLayout(w, variant);
        expect(l.variant).toBe(variant);
        expect(l.totalWidth).toBe(w);
        expect(l.oobLeft).toBe(o.oobLeft);
        expect(l.innerW).toBe(o.innerW);
        expect(l.innerH).toBe(o.innerH);
        expect(l.oobBot).toBe(o.oobBot);
        expect(l.totalHeight).toBe(o.cssHeight);
        expect(l.playAreaOffsetX).toBe(o.oobLeft);
        expect(l.playAreaOffsetY).toBe(o.playAreaOffsetY);
        expect(l.playAreaWidth).toBe(o.innerW);
        expect(l.playAreaHeight).toBe(o.innerH);
      }
    }
  });

  it("half court: play area starts at the canvas top", () => {
    const l = computeCourtLayout(800, "half");
    expect(l.playAreaOffsetY).toBe(0);
    expect(l.totalHeight).toBe(759);
  });

  it("full court (800 px): pinned pixel values", () => {
    const l = computeCourtLayout(800, "full");
    expect(l.oobLeft).toBe(23);
    expect(l.innerW).toBe(754);
    expect(l.innerH).toBe(709);
    expect(l.oobBot).toBe(50);
    // totalHeight = 2 * 709 + 50
    expect(l.totalHeight).toBe(1468);
    // play area (near end) starts below the far end + the OOB strip
    expect(l.playAreaOffsetY).toBe(759);
    expect(l.playAreaOffsetX).toBe(23);
  });

  it("only totalHeight and playAreaOffsetY differ between variants", () => {
    const h = computeCourtLayout(600, "half");
    const f = computeCourtLayout(600, "full");
    expect({ ...f, variant: "half", totalHeight: h.totalHeight, playAreaOffsetY: 0 }).toEqual(h);
  });
});

describe("characterization: normToCanvasPx === CourtWithPlayers normToPx", () => {
  it("is exactly equal for half/full × normal/flipped at every width", () => {
    for (const w of WIDTHS) {
      for (const variant of VARIANTS) {
        const layout = computeCourtLayout(w, variant);
        const o = editorLayout(w, variant);
        for (const flipped of FLIPS) {
          for (const nx of NORMS) {
            for (const ny of NORMS) {
              const expected = editorNormToPx(nx, ny, o.innerW, o.innerH, o.playAreaOffsetY, o.oobLeft, flipped);
              // default offset comes from the layout
              expect(normToCanvasPx(nx, ny, layout, flipped)).toEqual(expected);
              // explicit offset (legacy call style) agrees
              expect(normToCanvasPx(nx, ny, layout, flipped, o.playAreaOffsetY)).toEqual(expected);
            }
          }
        }
      }
    }
  });

  it("explicit playAreaOffsetY overrides the layout's (legacy 5-arg call on a half layout)", () => {
    const half = computeCourtLayout(800);
    const full = computeCourtLayout(800, "full");
    expect(normToCanvasPx(0.3, 0.7, half, false, full.playAreaOffsetY)).toEqual(normToCanvasPx(0.3, 0.7, full, false));
    expect(normToCanvasPx(0.3, 0.7, half, true, full.playAreaOffsetY)).toEqual(normToCanvasPx(0.3, 0.7, full, true));
  });

  it("full court, not flipped: pinned pixels (800 px)", () => {
    const l = computeCourtLayout(800, "full");
    expect(normToCanvasPx(0, 0, l, false)).toEqual({ x: 23, y: 759 });
    expect(normToCanvasPx(1, 1, l, false)).toEqual({ x: 777, y: 1468 });
    expect(normToCanvasPx(0.5, 0.5, l, false)).toEqual({ x: 400, y: 1113.5 });
  });

  it("full court, flipped: pinned pixels (800 px) — tokens stay in the near-end band", () => {
    const l = computeCourtLayout(800, "full");
    expect(normToCanvasPx(0, 0, l, true)).toEqual({ x: 23, y: 1468 });
    expect(normToCanvasPx(1, 1, l, true)).toEqual({ x: 777, y: 759 });
    expect(normToCanvasPx(0.5, 0.5, l, true)).toEqual({ x: 400, y: 1113.5 });
  });

  it("half court: pinned pixels (800 px)", () => {
    const l = computeCourtLayout(800);
    expect(normToCanvasPx(0.25, 0.75, l, false)).toEqual({ x: 211.5, y: 531.75 });
    expect(normToCanvasPx(0.25, 0.75, l, true)).toEqual({ x: 211.5, y: 177.25 });
  });
});

describe("canvasPxToNorm", () => {
  it("is exactly equal to CourtWithPlayers pxToNorm", () => {
    for (const w of WIDTHS) {
      for (const variant of VARIANTS) {
        const layout = computeCourtLayout(w, variant);
        const o = editorLayout(w, variant);
        for (const flipped of FLIPS) {
          for (const px of [0, o.oobLeft, 17.5, w / 2, w - o.oobLeft, w]) {
            for (const py of [0, 13.25, o.innerH, o.cssHeight / 2, o.cssHeight]) {
              const expected = editorPxToNorm(px, py, o.innerW, o.innerH, o.playAreaOffsetY, o.oobLeft, flipped);
              expect(canvasPxToNorm(px, py, layout, flipped)).toEqual(expected);
              expect(canvasPxToNorm(px, py, layout, flipped, o.playAreaOffsetY)).toEqual(expected);
            }
          }
        }
      }
    }
  });

  it("round-trips norm → px → norm for half/full × normal/flipped", () => {
    for (const w of WIDTHS) {
      for (const variant of VARIANTS) {
        const layout = computeCourtLayout(w, variant);
        for (const flipped of FLIPS) {
          for (const nx of NORMS) {
            for (const ny of NORMS) {
              const { x, y } = normToCanvasPx(nx, ny, layout, flipped);
              const back = canvasPxToNorm(x, y, layout, flipped);
              expect(back.x).toBeCloseTo(nx, 10);
              expect(back.y).toBeCloseTo(ny, 10);
            }
          }
        }
      }
    }
  });

  it("round-trips px → norm → px", () => {
    for (const variant of VARIANTS) {
      const layout = computeCourtLayout(800, variant);
      for (const flipped of FLIPS) {
        for (const [px, py] of [[0, 0], [23, 759], [400.5, 333.25], [800, layout.totalHeight]]) {
          const n = canvasPxToNorm(px, py, layout, flipped);
          const back = normToCanvasPx(n.x, n.y, layout, flipped);
          expect(back.x).toBeCloseTo(px, 8);
          expect(back.y).toBeCloseTo(py, 8);
        }
      }
    }
  });

  it("re-projects a token across a resize the way the editor does (px@old → norm → px@new)", () => {
    // handleCourtReady, CourtWithPlayers.tsx lines 272–273.
    const before = computeCourtLayout(800);
    const after = computeCourtLayout(480);
    for (const flipped of FLIPS) {
      const start = normToCanvasPx(0.3, 0.6, before, flipped);
      const norm = canvasPxToNorm(start.x, start.y, before, flipped);
      const end = normToCanvasPx(norm.x, norm.y, after, flipped);
      const direct = normToCanvasPx(0.3, 0.6, after, flipped);
      expect(end.x).toBeCloseTo(direct.x, 8);
      expect(end.y).toBeCloseTo(direct.y, 8);
    }
  });

  it("does not clamp: a point in the OOB margin maps outside [0, 1]", () => {
    const l = computeCourtLayout(800);
    expect(canvasPxToNorm(0, l.totalHeight, l, false).x).toBeLessThan(0);
    expect(canvasPxToNorm(0, l.totalHeight, l, false).y).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// Master side-by-side (m1 drill steps 3a/3b)
// ---------------------------------------------------------------------------
//
// The numbers below were MEASURED, not derived. A checkout of master
// (0d7d99b) was served on localhost:3458 next to this branch on
// localhost:3457, both against the same Firestore project. Two plays (half and
// full court) were created by the master build, and the editor was read in
// headless Chrome on both servers: court canvas size, every player token's
// SVG `translate(cx, cy)`, and the circle radii — at 1440x900 dpr 1 and
// 390x844 dpr 3, normal and flipped. Master and branch returned identical
// values in all 8 configurations, and the court canvas PNG was byte-identical
// in all 8 as well.
//
// These are master's values. If one of these expectations fails, stored plays
// no longer render in the editor where master renders them.

describe("master side-by-side: editor geometry measured on master (0d7d99b)", () => {
  // Default line-up created by master (store.ts): defense X1-X5, then offense O1-O5.
  const NORM: [number, number][] = [
    [0.5, 0.42], [0.22, 0.54], [0.78, 0.54], [0.14, 0.78], [0.86, 0.78],
    [0.5, 0.35], [0.18, 0.48], [0.82, 0.48], [0.08, 0.75], [0.92, 0.75],
  ];

  // cssW / cssH: court canvas CSS size. centres: token centres in canvas CSS
  // px, in NORM order (the half-court rows stop at O4 — O5 was dragged during
  // the drill and is pinned separately below).
  const MEASURED: {
    variant: "half" | "full"; flipped: boolean; cssW: number; cssH: number;
    playerR: number; ballR: number; centres: [number, number][];
  }[] = [
    { variant: "half", flipped: false, cssW: 579, cssH: 550, playerR: 16, ballR: 11,
      centres: [[289.5, 215.88], [136.34, 277.56], [442.66, 277.56], [92.58, 400.92], [486.42, 400.92], [289.5, 179.9], [114.46, 246.72], [464.54, 246.72], [59.76, 385.5]] },
    { variant: "half", flipped: true, cssW: 579, cssH: 550, playerR: 16, ballR: 11,
      centres: [[289.5, 298.12], [136.34, 236.44], [442.66, 236.44], [92.58, 113.08], [486.42, 113.08], [289.5, 334.1], [114.46, 267.28], [464.54, 267.28], [59.76, 128.5]] },
    { variant: "half", flipped: false, cssW: 390, cssH: 370, playerR: 11, ballR: 7,
      centres: [[195, 145.32], [91.96, 186.84], [298.04, 186.84], [62.52, 269.88], [327.48, 269.88], [195, 121.1], [77.24, 166.08], [312.76, 166.08], [40.44, 259.5]] },
    { variant: "half", flipped: true, cssW: 390, cssH: 370, playerR: 11, ballR: 7,
      centres: [[195, 200.68], [91.96, 159.16], [298.04, 159.16], [62.52, 76.12], [327.48, 76.12], [195, 224.9], [77.24, 179.92], [312.76, 179.92], [40.44, 86.5]] },
    { variant: "full", flipped: false, cssW: 768, cssH: 1410, playerR: 22, ballR: 14,
      centres: [[384, 1015.02], [181.28, 1096.74], [586.72, 1096.74], [123.36, 1260.18], [644.64, 1260.18], [384, 967.35], [152.32, 1055.88], [615.68, 1055.88], [79.92, 1239.75], [688.08, 1239.75]] },
    { variant: "full", flipped: true, cssW: 768, cssH: 1410, playerR: 22, ballR: 14,
      centres: [[384, 1123.98], [181.28, 1042.26], [586.72, 1042.26], [123.36, 878.82], [644.64, 878.82], [384, 1171.65], [152.32, 1083.12], [615.68, 1083.12], [79.92, 899.25], [688.08, 899.25]] },
    { variant: "full", flipped: false, cssW: 390, cssH: 716, playerR: 11, ballR: 7,
      centres: [[195, 515.32], [91.96, 556.84], [298.04, 556.84], [62.52, 639.88], [327.48, 639.88], [195, 491.1], [77.24, 536.08], [312.76, 536.08], [40.44, 629.5], [349.56, 629.5]] },
    { variant: "full", flipped: true, cssW: 390, cssH: 716, playerR: 11, ballR: 7,
      centres: [[195, 570.68], [91.96, 529.16], [298.04, 529.16], [62.52, 446.12], [327.48, 446.12], [195, 594.9], [77.24, 549.92], [312.76, 549.92], [40.44, 456.5], [349.56, 456.5]] },
  ];

  for (const m of MEASURED) {
    const name = `${m.variant} ${m.flipped ? "flipped" : "normal"} @ ${m.cssW} px`;

    it(`${name}: canvas is ${m.cssW}x${m.cssH} as on master`, () => {
      const l = computeCourtLayout(m.cssW, m.variant);
      expect(l.totalWidth).toBe(m.cssW);
      expect(l.totalHeight).toBe(m.cssH);
    });

    it(`${name}: token radii are ${m.playerR} / ${m.ballR} as on master`, () => {
      const l = computeCourtLayout(m.cssW, m.variant);
      // The editor passes playAreaWidth (= innerW), see CourtWithPlayers.tsx.
      expect(playerRadius(l.playAreaWidth)).toBe(m.playerR);
      expect(ballRadius(l.playAreaWidth)).toBe(m.ballR);
    });

    it(`${name}: every token centre is where master puts it`, () => {
      const l = computeCourtLayout(m.cssW, m.variant);
      m.centres.forEach(([cx, cy], i) => {
        const p = normToCanvasPx(NORM[i][0], NORM[i][1], l, m.flipped);
        // measurements were recorded to 3 decimals
        expect(Math.abs(p.x - cx), `token ${i} x`).toBeLessThan(0.001);
        expect(Math.abs(p.y - cy), `token ${i} y`).toBeLessThan(0.001);
      });
    });
  }

  it("a token dragged on master lands on the same pixel after a viewport change", () => {
    // O5 of the half-court play was dragged in master's editor and saved. It
    // then read x = 373.24 at 1440 px and x = 251.337 at 390 px on BOTH
    // master and the branch, i.e. one stored normX reproduces both.
    const desktop = computeCourtLayout(579);
    const mobile = computeCourtLayout(390);
    const normX = canvasPxToNorm(373.24, 0, desktop, false).x;
    expect(Math.abs(normToCanvasPx(normX, 0, mobile, false).x - 251.337)).toBeLessThan(0.01);
  });

  it("flipped tokens mirror about innerH, not about the canvas height (as measured)", () => {
    // master, half court @ 579: X1 at cy 215.88 normal, 298.12 flipped.
    const l = computeCourtLayout(579);
    expect(215.88 + 298.12).toBeCloseTo(l.innerH, 6);
    expect(l.innerH).not.toBe(l.totalHeight);
  });
});

// ---------------------------------------------------------------------------
// One layout function, parameterised (review item 5) + degenerate layouts (9a)
// ---------------------------------------------------------------------------

import { readFileSync as readSource } from "node:fs";
import nodePath from "node:path";
import * as layoutModule from "@/lib/courtLayout";

describe("computeCourtLayout options", () => {
  const { computeCourtLayout: layoutOf, computeThumbnailLayout } = layoutModule;

  it("defaults are bit-identical to the two-argument call", () => {
    for (let w = 1; w <= 2400; w += 13) {
      for (const variant of ["half", "full"] as const) {
        const base = layoutOf(w, variant);
        expect(layoutOf(w, variant, {})).toEqual(base);
        expect(layoutOf(w, variant, { sideMargin: true, roundOobBot: true })).toEqual(base);
      }
    }
  });

  it("pinned editor/export values are unchanged", () => {
    expect(layoutOf(800)).toEqual({
      variant: "half", totalWidth: 800, oobLeft: 23, innerW: 754, innerH: 709, oobBot: 50, totalHeight: 759,
      playAreaOffsetX: 23, playAreaOffsetY: 0, playAreaWidth: 754, playAreaHeight: 709,
    });
    expect(layoutOf(480, "full")).toMatchObject({ oobLeft: 14, innerW: 452, innerH: 425, oobBot: 30, totalHeight: 880, playAreaOffsetY: 455 });
    expect(layoutOf(1200, "full")).toMatchObject({ totalHeight: 2202 });
  });

  it("sideMargin: false makes the width the inner court width", () => {
    const l = layoutOf(200, "half", { sideMargin: false });
    expect(l).toMatchObject({ totalWidth: 200, oobLeft: 0, innerW: 200, innerH: 188, oobBot: 13, playAreaOffsetX: 0 });
  });

  it("roundOobBot: false keeps the exact 7 % band", () => {
    const l = layoutOf(800, "half", { roundOobBot: false });
    expect(l.oobBot).toBeCloseTo(709 * 0.07, 12);
    expect(l.totalHeight).toBe(l.innerH + l.oobBot);
  });

  it("computeThumbnailLayout is that function with both options off — no second copy of the formula", () => {
    for (const w of [80, 120, 200]) {
      for (const variant of ["half", "full"] as const) {
        expect(computeThumbnailLayout(w, variant)).toEqual(layoutOf(w, variant, { sideMargin: false, roundOobBot: false }));
      }
    }
    const src = readSource(nodePath.resolve(process.cwd(), "src/lib/courtLayout.ts"), "utf8");
    expect(src.match(/ \/ COURT_ASPECT_RATIO\)/g)).toHaveLength(1);
    expect(src.match(/ \* OOB_BOTTOM_FRAC/g)).toHaveLength(1);
  });
});

describe("degenerate layouts never produce NaN positions", () => {
  const { computeCourtLayout: layoutOf, hasCourtArea, reprojectCanvasPx } = layoutModule;

  it("hasCourtArea is false exactly when the court has no width or height", () => {
    expect(hasCourtArea(layoutOf(0))).toBe(false);
    expect(hasCourtArea(layoutOf(0, "full"))).toBe(false);
    for (const w of [1, 2, 80, 566, 1200]) expect(hasCourtArea(layoutOf(w))).toBe(true);
  });

  it("the unguarded round trip through a zero-width layout is NaN (the bug)", () => {
    const zero = layoutOf(0);
    const good = layoutOf(566);
    const n = layoutModule.canvasPxToNorm(100, 100, zero, false);
    expect(Number.isFinite(layoutModule.normToCanvasPx(n.x, n.y, good, false).x)).toBe(false);
  });

  it("reprojectCanvasPx maps between two real layouts and refuses a degenerate one", () => {
    const a = layoutOf(566);
    const b = layoutOf(768);
    for (const flipped of [false, true]) {
      const p = normToCanvasPx(0.3, 0.7, a, flipped);
      const q = reprojectCanvasPx(p.x, p.y, a, b, flipped)!;
      const expected = normToCanvasPx(0.3, 0.7, b, flipped);
      expect(q.x).toBeCloseTo(expected.x, 9);
      expect(q.y).toBeCloseTo(expected.y, 9);
      expect(reprojectCanvasPx(p.x, p.y, layoutOf(0), b, flipped)).toBeNull();
      expect(reprojectCanvasPx(p.x, p.y, a, layoutOf(0), flipped)).toBeNull();
    }
  });
});
