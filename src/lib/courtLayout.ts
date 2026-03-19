/**
 * Court layout computation — shared between the editor and all export paths.
 *
 * This module is intentionally free of React and browser APIs so it can be
 * imported in tests running in Node without any special mocking. It is the
 * single source of truth for OOB margin constants and the canvas dimension
 * calculation that every rendering path must agree on.
 *
 * See GitHub issue #163 for the full architectural context.
 */

import { COURT_ASPECT_RATIO } from "@/components/court/courtDimensions";

// ---------------------------------------------------------------------------
// Out-of-bounds margin fractions
// ---------------------------------------------------------------------------

/** Side OOB margin on each side, as a fraction of the total canvas width. */
export const OOB_SIDE_FRAC = 0.03;

/** Baseline OOB margin, as a fraction of the inner court height. */
export const OOB_BOTTOM_FRAC = 0.07;

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export interface CourtLayout {
  /** Side OOB margin in pixels (same on left and right). */
  oobLeft: number;
  /** Inner court width in pixels (total width minus 2× side OOB). */
  innerW: number;
  /** Inner court height in pixels (derived from innerW ÷ COURT_ASPECT_RATIO). */
  innerH: number;
  /** Baseline OOB height in pixels. */
  oobBot: number;
  /** Total canvas height in pixels (innerH + oobBot). */
  totalHeight: number;
}

/**
 * Compute the pixel layout for a given total canvas width.
 *
 * This mirrors the calculation in Court.tsx's draw() callback exactly.
 * Both the editor and all export paths (GIF, video, PDF) must call this
 * function so that pixel dimensions are always consistent with each other.
 */
export function computeCourtLayout(totalWidth: number): CourtLayout {
  const oobLeft     = Math.round((totalWidth * OOB_SIDE_FRAC) / (1 + 2 * OOB_SIDE_FRAC));
  const innerW      = totalWidth - 2 * oobLeft;
  const innerH      = Math.round(innerW / COURT_ASPECT_RATIO);
  const oobBot      = Math.round(innerH * OOB_BOTTOM_FRAC);
  const totalHeight = innerH + oobBot;
  return { oobLeft, innerW, innerH, oobBot, totalHeight };
}

// ---------------------------------------------------------------------------
// Coordinate transforms
// ---------------------------------------------------------------------------

/**
 * Convert normalised court coordinates [0-1] to canvas pixel coordinates.
 *
 * This is the canonical formula — it matches CourtWithPlayers.tsx's normToPx
 * exactly for a half court (playAreaOffsetY = 0).
 *
 * Normalised space:
 *   x: 0 = left sideline,  1 = right sideline
 *   y: 0 = half-court line, 1 = baseline (basket end)
 *
 * NOTE: when flipped, the editor draws the court with
 *   ctx.translate(0, innerH + oobBot) which shifts court markings down by
 *   oobBot relative to where normToCanvasPx places players. This is a known
 *   quirk: players appear oobBot pixels above their corresponding court line.
 *   The export path compensates for this — see exportGIF.ts toY. It will be
 *   fixed properly as part of issue #163.
 */
export function normToCanvasPx(
  normX: number,
  normY: number,
  layout: CourtLayout,
  flipped: boolean,
  playAreaOffsetY = 0,
): { x: number; y: number } {
  return {
    x: normX * layout.innerW + layout.oobLeft,
    y: flipped
      ? (1 - normY) * layout.innerH + playAreaOffsetY
      : normY * layout.innerH + playAreaOffsetY,
  };
}
