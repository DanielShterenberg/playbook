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

export interface CourtLayoutOptions {
  /**
   * Reserve the side out-of-bounds margins inside `totalWidth` (default true).
   * false: no side margin — oobLeft = 0 and `totalWidth` IS the inner court
   * width (thumbnails).
   */
  sideMargin?: boolean;
  /**
   * Round the baseline out-of-bounds band to a whole pixel (default true, as a
   * canvas needs). false keeps the exact OOB_BOTTOM_FRAC ratio (SVG thumbnails,
   * where rounding a ~5 px band would distort it).
   */
  roundOobBot?: boolean;
}

/**
 * Compute the pixel layout for a given total canvas width.
 *
 * This mirrors the calculation in Court.tsx's draw() callback exactly
 * (including its full-court branch). The editor and all export paths (MP4,
 * PNG, PDF) must call this function so that pixel dimensions are always
 * consistent with each other.
 *
 * `variant` defaults to "half"; for a half court every pre-existing field has
 * the same numeric value it always had. `options` default to the editor's
 * frame; with the defaults the result is bit-identical to what it always was.
 */
export function computeCourtLayout(
  totalWidth: number,
  variant: CourtVariant = "half",
  options: CourtLayoutOptions = {},
): CourtLayout {
  const { sideMargin = true, roundOobBot = true } = options;
  const oobLeft     = sideMargin ? Math.round((totalWidth * OOB_SIDE_FRAC) / (1 + 2 * OOB_SIDE_FRAC)) : 0;
  const innerW      = totalWidth - 2 * oobLeft;
  const innerH      = Math.round(innerW / COURT_ASPECT_RATIO);
  const exactOobBot = innerH * OOB_BOTTOM_FRAC;
  const oobBot      = roundOobBot ? Math.round(exactOobBot) : exactOobBot;
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

/**
 * Layout for a thumbnail (the SVG mini-courts of PlayCard / SceneStrip) that is
 * `width` px wide: computeCourtLayout with no side margin and an unrounded
 * baseline band.
 *
 * A thumbnail shows the play area only, so `width` is the inner court width.
 * Everything else is the editor's frame at that width — in particular oobBot,
 * totalHeight and playAreaOffsetY keep their meaning — so the thumbnail can
 * pair the editor's court transforms (see paintCourt) with normToCanvasPx like
 * every other renderer and then show just the play-area window
 *   x ∈ [0, innerW],  y ∈ [playAreaOffsetY, playAreaOffsetY + innerH]
 * which is where normToCanvasPx puts the unit square, flipped or not.
 */
export function computeThumbnailLayout(width: number, variant: CourtVariant = "half"): CourtLayout {
  return computeCourtLayout(width, variant, { sideMargin: false, roundOobBot: false });
}

/**
 * True when the layout has a court to draw on. A container that is collapsed
 * or hidden reports width 0, which yields innerW = innerH = 0; positions must
 * never be converted through such a layout (÷ 0 → NaN).
 */
export function hasCourtArea(layout: CourtLayout): boolean {
  return layout.innerW > 0 && layout.innerH > 0;
}

// ---------------------------------------------------------------------------
// Coordinate transforms
// ---------------------------------------------------------------------------

/**
 * Convert normalised court coordinates [0-1] to canvas pixel coordinates.
 *
 * This is THE norm→pixel formula for every renderer (editor overlay, share
 * viewer, presentation, MP4/PNG/PDF exports). It is numerically identical
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

/**
 * Move a canvas pixel position from one layout to another (a resize): the
 * point keeps its normalised court position. Returns null when either layout
 * has no court area, so a transient zero-size layout can never turn a position
 * into NaN — the caller keeps what it had.
 */
export function reprojectCanvasPx(
  px: number,
  py: number,
  from: CourtLayout,
  to: CourtLayout,
  flipped: boolean,
): { x: number; y: number } | null {
  if (!hasCourtArea(from) || !hasCourtArea(to)) return null;
  const norm = canvasPxToNorm(px, py, from, flipped);
  return normToCanvasPx(norm.x, norm.y, to, flipped);
}
