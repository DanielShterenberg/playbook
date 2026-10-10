/**
 * Court rendering — the single implementation of the court drawing, shared by
 * the editor canvas (Court.tsx) and every export path (GIF, MP4, PNG, PDF).
 *
 * Everything here draws through a plain CanvasRenderingContext2D, so it works
 * on an on-screen canvas, an offscreen export canvas, or a recording mock in
 * tests. No React, no DOM lookups.
 *
 * Moved here from Court.tsx (issue #171, parent #163). drawHalfCourtInner and
 * drawCourt are verbatim copies; paintCourt is the body of Court.tsx's draw()
 * callback with the layout passed in.
 */

import {
  BASKET_X,
  BASKET_Y,
  BASKET_RADIUS,
  BACKBOARD_Y,
  BACKBOARD_HALF_WIDTH,
  LANE_LEFT,
  LANE_RIGHT,
  LANE_TOP,
  CORNER_THREE_Y,
  CORNER_THREE_LEFT_X,
  CORNER_THREE_RIGHT_X,
  FT_CIRCLE_CENTER_X,
  FT_CIRCLE_CENTER_Y,
  CENTRE_CIRCLE_RADIUS,
} from "@/components/court/courtDimensions";
import type { CourtLayout, CourtVariant } from "@/lib/courtLayout";

export type { CourtVariant } from "@/lib/courtLayout";

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------
/** Floor colour — also fills the out-of-bounds margins. */
export const COLOR_COURT = "#F0C878"; // warm maple
/** Default paint (free-throw lane) fill. */
export const DEFAULT_COLOR_PAINT = "#E07B39"; // standard orange paint
/** Court line colour. */
export const COLOR_LINE = "#FFFFFF";  // white lines
/** Court line width in the context's current units (CSS px in the editor). */
export const COLOR_LINE_WIDTH_PX = 2; // base line width — scaled by canvas resolution

// ---------------------------------------------------------------------------
// Inner half-court drawing helper
// ---------------------------------------------------------------------------

/**
 * Draws one half-court into the current canvas context.
 *
 * Assumes the CTM has already been set up so that (0,0) is the half-court line
 * and (W, H) is the baseline corner. Called for both the near and far ends of a
 * full court (the far end is drawn with an additional ctx.scale(1,-1) so it
 * appears mirrored / upside-down, which is the correct NBA full-court layout).
 */
export function drawHalfCourtInner(ctx: CanvasRenderingContext2D, W: number, H: number, paintColor = DEFAULT_COLOR_PAINT): void {
  const cx = (nx: number) => nx * W;
  const cy = (ny: number) => ny * H;
  const rx = (nr: number) => nr * W;
  // scaleY: factor to convert an x-normalised radius to a y-radius so that
  // arcs drawn with ctx.scale(1, scaleY) produce true circles in pixel space.
  const scaleY = H / W;

  // ------------------------------------------------------------------
  // 1. Court background
  // ------------------------------------------------------------------
  ctx.fillStyle = COLOR_COURT;
  ctx.fillRect(0, 0, W, H);

  // ------------------------------------------------------------------
  // 2. Paint (free-throw lane)
  // ------------------------------------------------------------------
  ctx.fillStyle = paintColor;
  ctx.fillRect(cx(LANE_LEFT), cy(LANE_TOP), cx(LANE_RIGHT) - cx(LANE_LEFT), cy(1) - cy(LANE_TOP));

  // ------------------------------------------------------------------
  // Setup line style
  // ------------------------------------------------------------------
  ctx.strokeStyle = COLOR_LINE;
  ctx.lineWidth = COLOR_LINE_WIDTH_PX;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // ------------------------------------------------------------------
  // 3. Court boundary
  // ------------------------------------------------------------------
  ctx.strokeRect(0, 0, W, H);

  // ------------------------------------------------------------------
  // 4. Half-court line (top edge, y=0)
  // ------------------------------------------------------------------
  ctx.beginPath();
  ctx.moveTo(0, cy(0));
  ctx.lineTo(W, cy(0));
  ctx.stroke();

  // ------------------------------------------------------------------
  // 5. Half-court centre-circle arc (semicircle bowing into the court)
  //    Uses ctx.scale(1, scaleY) so that a unit radius r in x maps to
  //    r*W pixels horizontally and r*W pixels vertically (true circle).
  // ------------------------------------------------------------------
  ctx.save();
  ctx.scale(1, scaleY);
  ctx.beginPath();
  ctx.arc(cx(0.5), 0, rx(CENTRE_CIRCLE_RADIUS), 0, Math.PI);
  ctx.restore();
  ctx.stroke();

  // ------------------------------------------------------------------
  // 6. Three-point arc (in a "feet" coordinate system for a true circle)
  // ------------------------------------------------------------------
  const FT_PER_PX_X = 50 / W;
  const FT_PER_PX_Y = 47 / H;

  ctx.save();
  ctx.scale(1 / FT_PER_PX_X, 1 / FT_PER_PX_Y);

  const basketX_ft = BASKET_X * 50;
  const basketY_ft = BASKET_Y * 47;
  const cornerY_ft = CORNER_THREE_Y * 47;
  const leftCornerX_ft = CORNER_THREE_LEFT_X * 50;
  const rightCornerX_ft = CORNER_THREE_RIGHT_X * 50;

  ctx.strokeStyle = COLOR_LINE;
  ctx.lineWidth = COLOR_LINE_WIDTH_PX * FT_PER_PX_X;

  // Left corner straight
  ctx.beginPath();
  ctx.moveTo(leftCornerX_ft, 47);
  ctx.lineTo(leftCornerX_ft, cornerY_ft);
  ctx.stroke();

  // Right corner straight
  ctx.beginPath();
  ctx.moveTo(rightCornerX_ft, 47);
  ctx.lineTo(rightCornerX_ft, cornerY_ft);
  ctx.stroke();

  // Arc: counterclockwise from right corner to left corner (major arc over basket)
  const arcAngleLeft = Math.atan2(cornerY_ft - basketY_ft, leftCornerX_ft - basketX_ft);
  const arcAngleRight = Math.atan2(cornerY_ft - basketY_ft, rightCornerX_ft - basketX_ft);
  ctx.beginPath();
  ctx.arc(basketX_ft, basketY_ft, 23.75, arcAngleRight, arcAngleLeft, true);
  ctx.stroke();

  // ------------------------------------------------------------------
  // 7. Restricted area arc (4ft radius, semicircle toward half-court)
  // ------------------------------------------------------------------
  ctx.beginPath();
  ctx.arc(basketX_ft, basketY_ft, 4, Math.PI, 0, false);
  ctx.stroke();

  ctx.restore(); // end ft coordinate system

  // ------------------------------------------------------------------
  // 8. Paint lane outline
  // ------------------------------------------------------------------
  ctx.strokeRect(cx(LANE_LEFT), cy(LANE_TOP), cx(LANE_RIGHT) - cx(LANE_LEFT), cy(1) - cy(LANE_TOP));

  // ------------------------------------------------------------------
  // 9. Free-throw line
  // ------------------------------------------------------------------
  ctx.beginPath();
  ctx.moveTo(cx(LANE_LEFT), cy(FT_CIRCLE_CENTER_Y));
  ctx.lineTo(cx(LANE_RIGHT), cy(FT_CIRCLE_CENTER_Y));
  ctx.stroke();

  // ------------------------------------------------------------------
  // 10. Free-throw circle (solid upper arc, dashed lower arc)
  // ------------------------------------------------------------------
  ctx.save();
  ctx.scale(1 / FT_PER_PX_X, 1 / FT_PER_PX_Y);

  const ftCenterX_ft = FT_CIRCLE_CENTER_X * 50;
  const ftCenterY_ft = FT_CIRCLE_CENTER_Y * 47;
  const ftRadius_ft = 6;

  ctx.strokeStyle = COLOR_LINE;
  ctx.lineWidth = COLOR_LINE_WIDTH_PX * FT_PER_PX_X;

  // Upper semicircle (solid) — toward half court
  ctx.beginPath();
  ctx.arc(ftCenterX_ft, ftCenterY_ft, ftRadius_ft, Math.PI, 0, false);
  ctx.stroke();

  // Lower semicircle (dashed) — into the paint
  ctx.setLineDash([0.75, 0.75]);
  ctx.beginPath();
  ctx.arc(ftCenterX_ft, ftCenterY_ft, ftRadius_ft, 0, Math.PI, false);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.restore();

  // ------------------------------------------------------------------
  // 11. Backboard
  // ------------------------------------------------------------------
  ctx.beginPath();
  ctx.moveTo(cx(BASKET_X - BACKBOARD_HALF_WIDTH), cy(BACKBOARD_Y));
  ctx.lineTo(cx(BASKET_X + BACKBOARD_HALF_WIDTH), cy(BACKBOARD_Y));
  ctx.stroke();

  // ------------------------------------------------------------------
  // 12. Basket / rim (true circle via scale)
  // ------------------------------------------------------------------
  ctx.save();
  ctx.scale(1, scaleY);
  ctx.beginPath();
  ctx.arc(cx(BASKET_X), cy(BASKET_Y) / scaleY, rx(BASKET_RADIUS), 0, Math.PI * 2);
  ctx.strokeStyle = COLOR_LINE;
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Top-level draw function
// ---------------------------------------------------------------------------

export function drawCourt(
  canvas: HTMLCanvasElement,
  cssWidth: number,
  cssHeight: number,
  variant: CourtVariant,
  paintColor?: string,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, cssWidth, cssHeight);

  if (variant === "full") {
    const halfH = cssHeight / 2;

    // Near basket end (bottom half) — normal orientation
    ctx.save();
    ctx.translate(0, halfH);
    drawHalfCourtInner(ctx, cssWidth, halfH, paintColor);
    ctx.restore();

    // Far basket end (top half) — mirrored vertically around the centre line
    ctx.save();
    ctx.translate(0, halfH);
    ctx.scale(1, -1);
    drawHalfCourtInner(ctx, cssWidth, halfH, paintColor);
    ctx.restore();

    // Draw the centre line and full centre circle explicitly to avoid any
    // sub-pixel gap between the two halves.
    ctx.strokeStyle = COLOR_LINE;
    ctx.lineWidth = COLOR_LINE_WIDTH_PX;
    ctx.lineCap = "round";

    ctx.beginPath();
    ctx.moveTo(0, halfH);
    ctx.lineTo(cssWidth, halfH);
    ctx.stroke();

    // Full centre circle (both halves already drew their arcs, so this is just
    // a reinforcement of the complete circle at the centre line).
    const scaleY = halfH / cssWidth;
    ctx.save();
    ctx.scale(1, scaleY);
    ctx.beginPath();
    ctx.arc(cssWidth * 0.5, halfH / scaleY, cssWidth * CENTRE_CIRCLE_RADIUS, 0, Math.PI * 2);
    ctx.restore();
    ctx.stroke();
  } else {
    drawHalfCourtInner(ctx, cssWidth, cssHeight);
  }
}

// ---------------------------------------------------------------------------
// Complete court for a layout (OOB margins + markings, half/full, flipped)
// ---------------------------------------------------------------------------

export interface PaintCourtOptions {
  /** Flip vertically so the basket is at the top. Default false. */
  flipped?: boolean;
  /** Paint (lane) fill colour. Default DEFAULT_COLOR_PAINT. */
  paintColor?: string;
}

/**
 * Paint the complete court — floor colour over the whole canvas (OOB margins
 * included) plus all markings — for `layout` (which carries the variant).
 *
 * This is the body of Court.tsx's draw() callback: the same calls in the same
 * order, in particular the flip is
 *   ctx.translate(0, layout.totalHeight); ctx.scale(1, -1);
 * applied to the WHOLE canvas before the floor fill (so a flipped half court
 * has its markings at y ∈ [oobBot, oobBot + innerH]). Pair it with
 * normToCanvasPx from courtLayout.ts for token positions; see the FLIPPED
 * CONVENTION note there.
 *
 * The only addition over Court.tsx is an outer ctx.save()/ctx.restore(), so
 * the flip does not leak into whatever the caller draws next (tokens,
 * annotations). Pixel output is unchanged.
 *
 * Coordinates are in the units of `layout` (CSS px). The caller owns the canvas
 * setup that precedes this in Court.tsx: sizing the backing store, and any
 * resolution scaling via ctx.scale(dpr, dpr) / ctx.scale(exportScale,
 * exportScale) BEFORE calling. Line widths scale with that transform, exactly
 * as in the editor. No clearRect is issued — the opaque floor fill covers
 * layout.totalWidth × layout.totalHeight.
 */
export function paintCourt(
  ctx: CanvasRenderingContext2D,
  layout: CourtLayout,
  options: PaintCourtOptions = {},
): void {
  const { flipped = false, paintColor } = options;
  const { variant, totalWidth: cssWidth, totalHeight: cssHeight, oobLeft, innerW, innerH, oobBot } = layout;

  ctx.save();

  // Apply vertical flip if requested (purely visual — normToCanvasPx compensates)
  if (flipped) {
    ctx.translate(0, cssHeight);
    ctx.scale(1, -1);
  }

  // Fill entire canvas with floor colour (covers OOB margins)
  ctx.fillStyle = COLOR_COURT;
  ctx.fillRect(0, 0, cssWidth, cssHeight);

  if (variant === "full") {
    // Near basket end (bottom half) — normal orientation
    ctx.save();
    ctx.translate(oobLeft, innerH + oobBot);
    drawHalfCourtInner(ctx, innerW, innerH, paintColor);
    ctx.restore();

    // Far basket end (top half) — mirrored vertically
    ctx.save();
    ctx.translate(oobLeft, innerH + oobBot);
    ctx.scale(1, -1);
    drawHalfCourtInner(ctx, innerW, innerH, paintColor);
    ctx.restore();

    // Centre line
    ctx.strokeStyle = COLOR_LINE;
    ctx.lineWidth = COLOR_LINE_WIDTH_PX;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(oobLeft, innerH + oobBot);
    ctx.lineTo(oobLeft + innerW, innerH + oobBot);
    ctx.stroke();

    // Full centre circle
    const scaleY = innerH / innerW;
    ctx.save();
    ctx.scale(1, scaleY);
    ctx.beginPath();
    ctx.arc(oobLeft + innerW * 0.5, (innerH + oobBot) / scaleY, innerW * CENTRE_CIRCLE_RADIUS, 0, Math.PI * 2);
    ctx.restore();
    ctx.stroke();
  } else {
    // Half court — translate right by OOB margin
    ctx.save();
    ctx.translate(oobLeft, 0);
    drawHalfCourtInner(ctx, innerW, innerH, paintColor);
    ctx.restore();
  }

  ctx.restore();
}
