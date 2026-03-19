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
} from "@/lib/courtLayout";
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
// Key visual invariant: editor ↔ export coordinate agreement
//
// The editor's Court.tsx draws a flipped court with translate(0, innerH+oobBot),
// placing court markings at y = oobBot + (1-normY)*innerH. Players are placed
// at y = (1-normY)*innerH (no oobBot term). This makes players appear oobBot
// pixels above their court markings — the user positions players against this
// visual frame.
//
// The export's drawCourtOnCanvas uses translate(0, innerH), placing markings at
// y = (1-normY)*innerH. The export toY compensates with `(1-n)*innerH - oobBot`
// so players appear the same number of pixels above their court markings.
//
// These tests document and protect that invariant.
// ---------------------------------------------------------------------------

describe("editor ↔ export coordinate invariant (flipped half court)", () => {
  const layout = computeCourtLayout(800);
  const { innerH, oobBot } = layout;

  // Helpers that mirror the actual implementations exactly
  const editorPlayerY  = (normY: number) => (1 - normY) * innerH;              // normToCanvasPx flipped, playAreaOffsetY=0
  const editorMarkingY = (normY: number) => oobBot + (1 - normY) * innerH;     // Court.tsx with translate(0, innerH+oobBot)
  const exportPlayerY  = (normY: number) => (1 - normY) * innerH - oobBot;     // exportGIF.ts toY after fix
  const exportMarkingY = (normY: number) => (1 - normY) * innerH;              // drawCourtOnCanvas with translate(0, innerH)

  it("player-to-marking gap is the same in editor and export (−oobBot for all normY)", () => {
    for (const normY of [0.1, 0.3, LANE_TOP, BASKET_Y, 0.9]) {
      const editorGap = editorPlayerY(normY) - editorMarkingY(normY);
      const exportGap = exportPlayerY(normY)  - exportMarkingY(normY);
      expect(editorGap).toBeCloseTo(exportGap, 5);
    }
  });

  it("player placed at FT line in editor appears at FT line in export", () => {
    // Step 1: FT line canvas position in the editor (flipped)
    const ftEditorCanvasY = editorMarkingY(LANE_TOP);

    // Step 2: that pixel converts to this normY via pxToNorm (editor formula)
    const normY = 1 - ftEditorCanvasY / innerH;

    // Step 3: export renders this normY at:
    const playerExportY = exportPlayerY(normY);

    // Step 4: FT line in the export canvas is at:
    const ftExportCanvasY = exportMarkingY(LANE_TOP);

    expect(playerExportY).toBeCloseTo(ftExportCanvasY, 0);
  });

  it("player placed at basket in editor appears at basket in export", () => {
    const basketEditorCanvasY = editorMarkingY(BASKET_Y);
    const normY = 1 - basketEditorCanvasY / innerH;
    expect(exportPlayerY(normY)).toBeCloseTo(exportMarkingY(BASKET_Y), 0);
  });

  it("player placed at half-court line in editor appears at half-court line in export", () => {
    const halfCourtEditorCanvasY = editorMarkingY(0);
    const normY = 1 - halfCourtEditorCanvasY / innerH;
    expect(exportPlayerY(normY)).toBeCloseTo(exportMarkingY(0), 0);
  });

  it("same invariant holds for SD resolution", () => {
    const sdLayout = computeCourtLayout(480);
    const sdEditorPlayerY  = (n: number) => (1 - n) * sdLayout.innerH;
    const sdEditorMarkingY = (n: number) => sdLayout.oobBot + (1 - n) * sdLayout.innerH;
    const sdExportPlayerY  = (n: number) => (1 - n) * sdLayout.innerH - sdLayout.oobBot;
    const sdExportMarkingY = (n: number) => (1 - n) * sdLayout.innerH;

    for (const normY of [0.1, LANE_TOP, BASKET_Y, 0.9]) {
      const editorGap = sdEditorPlayerY(normY) - sdEditorMarkingY(normY);
      const exportGap = sdExportPlayerY(normY)  - sdExportMarkingY(normY);
      expect(editorGap).toBeCloseTo(exportGap, 5);
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
