"use client";

/**
 * Court component — renders an NBA basketball court on an HTML5 Canvas.
 *
 * Implements issue #49: Render basketball half court on canvas.
 * Implements issue #50: Full court rendering.
 *
 * Design:
 *   - Light maple-wood court colour (#F5DEB3 / wheat) with white lines.
 *   - All NBA standard markings: paint, free-throw line + circle (solid upper,
 *     dashed lower), three-point arc with corner straights, restricted area arc,
 *     backboard, basket/rim, and half-court line with centre-circle arc.
 *   - variant="full" draws both ends by mirroring the half-court markings
 *     around the centre line. Players are positioned in the near (bottom) end.
 *   - Responsive: fills container width and maintains correct aspect ratio.
 *   - Exposes courtToCanvas / playAreaHeight / playAreaOffsetY in onReady so
 *     CourtWithPlayers can map normalised coords to pixels correctly.
 */

import { useEffect, useRef, useCallback } from "react";
import {
  COURT_ASPECT_RATIO,
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
} from "./courtDimensions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CourtVariant = "half" | "full";

/** Maps a normalised court coordinate [0-1, 0-1] to canvas pixels. */
export type CourtToCanvas = (normX: number, normY: number) => { x: number; y: number };

export interface CourtReadyPayload {
  canvas: HTMLCanvasElement;
  courtToCanvas: CourtToCanvas;
  /** Total canvas width in CSS pixels. */
  width: number;
  /** Total canvas height in CSS pixels. */
  height: number;
  /**
   * Height of the play area in CSS pixels.
   * For half court this equals height; for full court it is height/2 (one end).
   */
  playAreaHeight: number;
  /**
   * Y offset from the canvas top to the play area.
   * For half court this is 0; for full court it is height/2 (players are in
   * the near/bottom end of the full court canvas).
   */
  playAreaOffsetY: number;
}

export interface CourtProps {
  /**
   * "half" (default) — renders one end of the court.
   * "full" — renders both ends with the near basket at the bottom.
   */
  variant?: CourtVariant;
  /**
   * Optional callback fired whenever the court is (re-)drawn.
   * Useful for overlaying players or annotations on top.
   */
  onReady?: (payload: CourtReadyPayload) => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------
const COLOR_COURT = "#F0C878"; // warm maple
const COLOR_PAINT = "#E07B39"; // standard orange paint
const COLOR_LINE = "#FFFFFF";  // white lines
const COLOR_LINE_WIDTH_PX = 2; // base line width — scaled by canvas resolution

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
function drawHalfCourtInner(ctx: CanvasRenderingContext2D, W: number, H: number): void {
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
  ctx.fillStyle = COLOR_PAINT;
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
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, cssWidth, cssHeight);

  if (variant === "full") {
    const halfH = cssHeight / 2;

    // Near basket end (bottom half) — normal orientation
    ctx.save();
    ctx.translate(0, halfH);
    drawHalfCourtInner(ctx, cssWidth, halfH);
    ctx.restore();

    // Far basket end (top half) — mirrored vertically around the centre line
    ctx.save();
    ctx.translate(0, halfH);
    ctx.scale(1, -1);
    drawHalfCourtInner(ctx, cssWidth, halfH);
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
// Component
// ---------------------------------------------------------------------------

export default function Court({ variant = "half", onReady, className }: CourtProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio ?? 1;
    const cssWidth = container.clientWidth;
    const halfH = Math.round(cssWidth / COURT_ASPECT_RATIO);
    const cssHeight = variant === "full" ? halfH * 2 : halfH;

    // Set CSS size
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;

    // Set backing store size (high-DPI)
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);

    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(dpr, dpr);
    }

    drawCourt(canvas, cssWidth, cssHeight, variant);

    // Notify parent with coordinate conversion helper and play-area metadata
    if (onReady) {
      const playAreaHeight = variant === "full" ? halfH : cssHeight;
      const playAreaOffsetY = variant === "full" ? halfH : 0;

      const courtToCanvas: CourtToCanvas = (normX, normY) => ({
        x: normX * cssWidth,
        y: normY * playAreaHeight + playAreaOffsetY,
      });

      onReady({
        canvas,
        courtToCanvas,
        width: cssWidth,
        height: cssHeight,
        playAreaHeight,
        playAreaOffsetY,
      });
    }
  }, [variant, onReady]);

  useEffect(() => {
    draw();

    const observer = new ResizeObserver(() => draw());
    const container = containerRef.current;
    if (container) observer.observe(container);

    return () => observer.disconnect();
  }, [draw]);

  return (
    <div ref={containerRef} className={className ?? "w-full"}>
      <canvas
        ref={canvasRef}
        style={{ display: "block" }}
        aria-label={variant === "full" ? "Basketball full court" : "Basketball half court"}
        role="img"
      />
    </div>
  );
}
