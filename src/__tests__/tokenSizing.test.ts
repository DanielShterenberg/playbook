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
  playerLabelFontSize,
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

  it("ballScale is r / 12", () => {
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

// ---------------------------------------------------------------------------
// Token colours and thumbnail attach offset (review items 4, 6, 7)
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import path from "node:path";
import {
  DEFAULT_OFFENSE_COLOR,
  DEFAULT_DEFENSE_COLOR,
  thumbnailBallAttachOffsetY,
  thumbnailBallRadius,
  thumbnailDotRadius,
} from "@/lib/tokenSizing";

describe("token colours — one exported source", () => {
  it("are the editor's", () => {
    expect(DEFAULT_OFFENSE_COLOR).toBe("#FF7A1A");
    expect(DEFAULT_DEFENSE_COLOR).toBe("#141A23");
  });

  it("no other module re-declares the ball colours or the default team colours", () => {
    const files = [
      "src/components/players/BallToken.tsx",
      "src/components/players/PlayerToken.tsx",
      "src/components/court/CourtThumbnail.tsx",
      "src/components/playbook/PlayCard.tsx",
      "src/components/editor/SceneStrip.tsx",
      "src/app/play/[id]/EditorHeader.tsx",
      "src/lib/frameRenderer.ts",
    ];
    for (const f of files) {
      const src = readFileSync(path.resolve(process.cwd(), f), "utf8");
      expect(src, f).not.toMatch(/["'`]#(F2B33D|FFE2A6|FF7A1A|141A23|E05C00|F47B2A|E07B39)["'`]/i);
      expect(src, f).not.toMatch(/const (COLOR_BALL|COLOR_BALL_HIGHLIGHT|COLOR_SEAM|COLOR_BALL_SEAM|DEFAULT_OFFENSE_COLOR|DEFAULT_DEFENSE_COLOR|COLOR_OFFENSE_FILL|COLOR_DEFENSE_STROKE)\b/);
    }
    // On-screen tokens and thumbnails take the active theme's palette; the
    // export painter takes FrameStyle.palette (default light).
    for (const f of ["src/components/players/BallToken.tsx", "src/components/players/PlayerToken.tsx", "src/components/court/CourtThumbnail.tsx"]) {
      expect(readFileSync(path.resolve(process.cwd(), f), "utf8"), f).toMatch(/import \{[^}]*useCourtPalette[^}]*\} from "@\/hooks\/useTheme"/);
    }
    const painter = readFileSync(path.resolve(process.cwd(), "src/lib/frameRenderer.ts"), "utf8");
    expect(painter).toMatch(/import \{[^}]*LIGHT_COURT_PALETTE[^}]*\} from "@\/lib\/courtPalette"/);
    for (const f of ["src/components/players/BallToken.tsx", "src/lib/frameRenderer.ts"]) {
      const src = readFileSync(path.resolve(process.cwd(), f), "utf8");
      expect(src, f).toMatch(/palette\.ballHighlight/);
      expect(src, f).toMatch(/palette\.ballSeam/);
    }
    expect(readFileSync(path.resolve(process.cwd(), "src/app/play/[id]/EditorHeader.tsx"), "utf8")).toMatch(/import \{[^}]*DEFAULT_OFFENSE_COLOR[^}]*\} from "@\/lib\/tokenSizing"/);
  });
});

describe("thumbnailBallAttachOffsetY — the editor's gap scaled to the dot", () => {
  it("is the editor's offset at the editor's base radius", () => {
    expect(thumbnailBallAttachOffsetY(18, 12)).toBe(ballAttachOffsetY(18, 12));
  });

  it("scales the 2 px gap with the dot radius instead of keeping it fixed", () => {
    for (const w of [80, 120, 200]) {
      const dot = thumbnailDotRadius(w);
      const ball = thumbnailBallRadius(w);
      const off = thumbnailBallAttachOffsetY(dot, ball);
      expect(off).toBeCloseTo(-(dot + ball + (BALL_ATTACH_GAP * dot) / 18), 12);
      // closer to the holder than the fixed-gap offset, but never overlapping it
      expect(off).toBeGreaterThan(ballAttachOffsetY(dot, ball));
      expect(-off).toBeGreaterThan(dot + ball);
      expect(-off - (dot + ball)).toBeLessThan(1);
    }
  });
});

describe("playerLabelFontSize", () => {
  it("is the authored size at the base radius", () => {
    expect(playerLabelFontSize(1, PLAYER_RADIUS)).toBe(11);
    expect(playerLabelFontSize(4, PLAYER_RADIUS)).toBe(8);
    expect(playerLabelFontSize(12, PLAYER_RADIUS)).toBe(5);
  });

  it("keeps a long name the same share of the token at export sizes", () => {
    for (const len of [3, 6, 12]) {
      const atBase = playerLabelFontSize(len, PLAYER_RADIUS) / PLAYER_RADIUS;
      const atPdf = playerLabelFontSize(len, 36) / 36;
      expect(atPdf).toBeCloseTo(atBase, 5);
    }
  });

  it("never drops below 5px", () => {
    expect(playerLabelFontSize(20, 10)).toBeGreaterThanOrEqual(5);
  });
});
