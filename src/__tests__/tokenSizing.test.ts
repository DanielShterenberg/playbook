/**
 * Tests for tokenSizing.ts — player / ball size relative to the court.
 *
 * The oracles are verbatim copies of the editor's private helpers in
 * src/components/players/CourtWithPlayers.tsx as of the start of milestone m1:
 *   computeTokenRadius — lines 77–79
 *   computeBallRadius  — lines 80–82
 *   ballAttachOffsetY  — line 553: -(tokenRadius + ballRadius + 2)
 * The editor passes courtSize.playAreaWidth (= Court.tsx innerW) — lines 551–552.
 */

import { describe, it, expect } from "vitest";
import {
  PLAYER_RADIUS,
  BALL_RADIUS,
  PLAYER_RADIUS_RATIO,
  PLAYER_RADIUS_MIN,
  BALL_RADIUS_RATIO,
  BALL_RADIUS_MIN,
  BALL_ATTACH_GAP,
  playerRadius,
  ballRadius,
  ballAttachOffsetY,
  tokenScale,
  playerScale,
  ballScale,
  computeTokenSizes,
} from "@/lib/tokenSizing";
import { computeCourtLayout } from "@/lib/courtLayout";

function editorComputeTokenRadius(courtWidth: number): number {
  return Math.max(10, Math.round(courtWidth * 0.03));
}
function editorComputeBallRadius(courtWidth: number): number {
  return Math.max(7, Math.round(courtWidth * 0.02));
}

describe("constants", () => {
  it("base radii match PlayerToken / BallToken defaults", () => {
    expect(PLAYER_RADIUS).toBe(18);
    expect(BALL_RADIUS).toBe(12);
  });

  it("ratios and minimums are the editor's", () => {
    expect(PLAYER_RADIUS_RATIO).toBe(0.03);
    expect(PLAYER_RADIUS_MIN).toBe(10);
    expect(BALL_RADIUS_RATIO).toBe(0.02);
    expect(BALL_RADIUS_MIN).toBe(7);
    expect(BALL_ATTACH_GAP).toBe(2);
  });
});

describe("playerRadius / ballRadius", () => {
  it("equal the editor's computeTokenRadius / computeBallRadius for every width", () => {
    for (let w = 0; w <= 2000; w++) {
      expect(playerRadius(w)).toBe(editorComputeTokenRadius(w));
      expect(ballRadius(w)).toBe(editorComputeBallRadius(w));
    }
    for (const w of [333.3, 452.5, 754.49, 1207.2]) {
      expect(playerRadius(w)).toBe(editorComputeTokenRadius(w));
      expect(ballRadius(w)).toBe(editorComputeBallRadius(w));
    }
  });

  it("equal the base constants at a 600 px inner court", () => {
    expect(playerRadius(600)).toBe(PLAYER_RADIUS);
    expect(ballRadius(600)).toBe(BALL_RADIUS);
  });

  it("are floored on narrow courts", () => {
    expect(playerRadius(200)).toBe(10);
    expect(ballRadius(200)).toBe(7);
    expect(playerRadius(0)).toBe(10);
    expect(ballRadius(0)).toBe(7);
    // first widths above the floors
    expect(playerRadius(349)).toBe(10);
    expect(playerRadius(350)).toBe(11);
    expect(ballRadius(374)).toBe(7);
    expect(ballRadius(375)).toBe(8);
  });

  it("pinned values for the export resolutions (inner width, not canvas width)", () => {
    const sd = computeCourtLayout(480); // innerW 452
    const hd = computeCourtLayout(800); // innerW 754
    expect(playerRadius(sd.innerW)).toBe(14);
    expect(ballRadius(sd.innerW)).toBe(9);
    expect(playerRadius(hd.innerW)).toBe(23);
    expect(ballRadius(hd.innerW)).toBe(15);
  });

  it("the width convention matters: canvas width gives a different size", () => {
    const hd = computeCourtLayout(800);
    expect(playerRadius(hd.totalWidth)).toBe(24);
    expect(playerRadius(hd.innerW)).toBe(23);
    expect(ballRadius(hd.totalWidth)).toBe(16);
    expect(ballRadius(hd.innerW)).toBe(15);
  });
});

describe("ballAttachOffsetY", () => {
  it("is -(playerR + ballR + 2), the editor's formula", () => {
    expect(ballAttachOffsetY(18, 12)).toBe(-32);
    expect(ballAttachOffsetY(23, 15)).toBe(-40);
    expect(ballAttachOffsetY(10, 7)).toBe(-19);
  });

  it("is always negative (ball above the holder in screen space)", () => {
    for (const w of [0, 200, 452, 754, 1280]) {
      expect(ballAttachOffsetY(playerRadius(w), ballRadius(w))).toBeLessThan(0);
    }
  });
});

describe("scale helpers", () => {
  it("tokenScale is radius / base", () => {
    expect(tokenScale(9, 18)).toBe(0.5);
    expect(tokenScale(24, 12)).toBe(2);
  });

  it("playerScale / ballScale are 1 at the base radius", () => {
    expect(playerScale(PLAYER_RADIUS)).toBe(1);
    expect(ballScale(BALL_RADIUS)).toBe(1);
  });

  it("playerScale reproduces PlayerToken's stroke and font maths", () => {
    // PlayerToken.tsx lines 233 / 236:
    //   Math.max(1.5, strokeWidth * radius / PLAYER_RADIUS)
    //   Math.max(6, Math.round(11 * radius / PLAYER_RADIUS))
    for (const radius of [10, 14, 18, 23, 36]) {
      expect(2 * playerScale(radius)).toBeCloseTo((2 * radius) / 18, 12);
      expect(Math.round(11 * playerScale(radius))).toBe(Math.round((11 * radius) / 18));
    }
  });

  it("ballScale is r / 12 (exportGIF drawBall)", () => {
    expect(ballScale(15)).toBe(15 / 12);
  });
});

describe("computeTokenSizes", () => {
  it("bundles the individual helpers", () => {
    for (const w of [200, 452, 600, 754]) {
      const s = computeTokenSizes(w);
      expect(s).toEqual({
        playerR: playerRadius(w),
        ballR: ballRadius(w),
        playerScale: playerScale(playerRadius(w)),
        ballScale: ballScale(ballRadius(w)),
        ballAttachOffsetY: ballAttachOffsetY(playerRadius(w), ballRadius(w)),
      });
    }
  });

  it("600 px inner court is the design size", () => {
    expect(computeTokenSizes(600)).toEqual({
      playerR: 18,
      ballR: 12,
      playerScale: 1,
      ballScale: 1,
      ballAttachOffsetY: -32,
    });
  });
});
