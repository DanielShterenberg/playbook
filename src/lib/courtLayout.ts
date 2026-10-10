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

/**
 * "half" — one end of the court (canvas = innerH + oobBot tall).
 * "full" — both ends (canvas = 2 × innerH + oobBot tall); players live in the
 *          near end, which starts playAreaOffsetY below the canvas top.
 */
export type CourtVariant = "half" | "full";

export interface CourtLayout {
  /** Variant this layout was computed for. */
  variant: CourtVariant;
  /** Total canvas width in pixels (inner court + 2× side OOB). */
  totalWidth: number;
  /** Side OOB margin in pixels (same on left and right). */
  oobLeft: number;
  /** Inner court width in pixels (total width minus 2× side OOB). */
  innerW: number;
  /** Inner court height of ONE half court in pixels (innerW ÷ COURT_ASPECT_RATIO). */
  innerH: number;
  /** Baseline OOB height in pixels. */
  oobBot: number;
  /**
   * Total canvas height in pixels.
   *   half: innerH + oobBot
   *   full: 2 × innerH + oobBot
   */
  totalHeight: number;
  /** X offset from the canvas left edge to the play area (= oobLeft). */
  playAreaOffsetX: number;
  /**
   * Y offset from the canvas top to the play area (where normY = 0 lands when
   * not flipped).
   *   half: 0
   *   full: innerH + oobBot
   */
  playAreaOffsetY: number;
  /** Play area width in pixels (= innerW). */
  playAreaWidth: number;
  /** Play area height in pixels (= innerH, one end, for both variants). */
  playAreaHeight: number;
}

/**
 * Compute the pixel layout for a given total canvas width.
 *
 * This mirrors the calculation in Court.tsx's draw() callback exactly
 * (including its full-court branch). The editor and all export paths (GIF,
 * video, PNG, PDF) must call this function so that pixel dimensions are always
 * consistent with each other.
 *
 * `variant` defaults to "half"; for a half court every pre-existing field has
 * the same numeric value it always had.
 */
export function computeCourtLayout(totalWidth: number, variant: CourtVariant = "half"): CourtLayout {
  const oobLeft     = Math.round((totalWidth * OOB_SIDE_FRAC) / (1 + 2 * OOB_SIDE_FRAC));
  const innerW      = totalWidth - 2 * oobLeft;
  const innerH      = Math.round(innerW / COURT_ASPECT_RATIO);
  const oobBot      = Math.round(innerH * OOB_BOTTOM_FRAC);
  const totalHeight = variant === "full" ? innerH * 2 + oobBot : innerH + oobBot;
  const playAreaOffsetY = variant === "full" ? innerH + oobBot : 0;
  return {
    variant,
    totalWidth,
    oobLeft,
    innerW,
    innerH,
    oobBot,
    totalHeight,
    playAreaOffsetX: oobLeft,
    playAreaOffsetY,
    playAreaWidth: innerW,
    playAreaHeight: innerH,
  };
}

// ---------------------------------------------------------------------------
// Coordinate transforms
// ---------------------------------------------------------------------------

/**
 * Convert normalised court coordinates [0-1] to canvas pixel coordinates.
 *
 * This is THE norm→pixel formula for every renderer (editor overlay, share
 * viewer, presentation, GIF/MP4/PNG/PDF exports). It is numerically identical
 * to the legacy local normToPx in CourtWithPlayers.tsx and to Court.tsx's
 * courtToCanvas.
 *
 * Normalised space:
 *   x: 0 = left sideline,  1 = right sideline
 *   y: 0 = half-court line, 1 = baseline (basket end)
 *
 * `playAreaOffsetY` defaults to `layout.playAreaOffsetY` (0 for a half court,
 * innerH + oobBot for a full court) — callers should normally omit it.
 *
 * FLIPPED CONVENTION (decision recorded in issue #163 / #170 — the editor is
 * the reference): when flipped, court markings are painted with
 *   translate(0, totalHeight); scale(1, -1)
 * (see paintCourt in courtRendering.ts), which puts a half court's markings at
 * y = oobBot + (1 - normY) * innerH, while this function places tokens at
 * y = (1 - normY) * innerH. Tokens therefore sit oobBot pixels above the
 * marking with the same normY. That offset is baked into stored play data, so
 * it is part of the contract: every renderer must pair paintCourt with this
 * function and must NOT add its own "- oobBot" compensation.
 */
export function normToCanvasPx(
  normX: number,
  normY: number,
  layout: CourtLayout,
  flipped: boolean,
  playAreaOffsetY: number = layout.playAreaOffsetY,
): { x: number; y: number } {
  return {
    x: normX * layout.innerW + layout.oobLeft,
    y: flipped
      ? (1 - normY) * layout.innerH + playAreaOffsetY
      : normY * layout.innerH + playAreaOffsetY,
  };
}

/**
 * Inverse of normToCanvasPx: canvas pixel coordinates → normalised court
 * coordinates. Numerically identical to the legacy local pxToNorm in
 * CourtWithPlayers.tsx. The result is NOT clamped to [0, 1] (a token dragged
 * into the OOB margin yields a value slightly outside the range, as today).
 */
export function canvasPxToNorm(
  px: number,
  py: number,
  layout: CourtLayout,
  flipped: boolean,
  playAreaOffsetY: number = layout.playAreaOffsetY,
): { x: number; y: number } {
  return {
    x: (px - layout.oobLeft) / layout.innerW,
    y: flipped
      ? 1 - (py - playAreaOffsetY) / layout.innerH
      : (py - playAreaOffsetY) / layout.innerH,
  };
}
