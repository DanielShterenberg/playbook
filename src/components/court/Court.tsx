"use client";

/**
 * Court component — renders an NBA basketball half court on an HTML5 Canvas.
 *
 * Implements issue #49: Render basketball half court on canvas.
 *
 * Design:
 *   - Light maple-wood court colour (#F5DEB3 / wheat) with darker line colour.
 *   - All NBA standard markings: paint, free-throw line, free-throw circle,
 *     three-point arc (with corner straights), restricted area arc,
 *     backboard, basket/rim, and half-court line with centre-circle arc.
 *   - Responsive: fills container width and maintains correct aspect ratio.
 *   - Exposes a `courtToCanvas(x, y)` utility via the `onReady` callback so
 *     downstream components can map normalised court coordinates to pixels.
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
  /** Canvas width in CSS pixels. */
  width: number;
  /** Canvas height in CSS pixels. */
  height: number;
}

export interface CourtProps {
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
const COLOR_LINE = "#FFFFFF"; // white lines
const COLOR_LINE_WIDTH_PX = 2; // base line width — scaled by canvas resolution

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

function drawCourt(canvas: HTMLCanvasElement, cssWidth: number, cssHeight: number): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const W = cssWidth;
  const H = cssHeight;

  // Helpers to convert normalised [0-1] court coords → canvas pixels
  const cx = (nx: number) => nx * W;
  const cy = (ny: number) => ny * H;
  // Convert a normalised x-radius → pixels (uses W since x is scaled to width)
  const rx = (nr: number) => nr * W;

  // For arcs that need a pixel radius: the arc is based on the court's physical
  // radius expressed relative to court width, but when rendered we need the
  // pixel equivalent. Because W corresponds to COURT_WIDTH_FT and H to
  // COURT_LENGTH_FT, a radius expressed in normalised-x units maps to rx(r)
  // pixels in x but potentially a different number in y. We draw arcs in
  // canvas space where 1px is not necessarily square, so we use a uniform
  // scale based on W (width) and apply ctx.scale / ellipse where needed.
  // To keep things simple we apply a non-uniform scale so that a single
  // canvas unit = 1px in x direction, and squash y accordingly.

  // Scale factor: when drawing a "circle" from physical coords, y must be
  // scaled by H/W to convert from x-normalised radius to y-normalised radius.
  const scaleY = H / W;

  ctx.clearRect(0, 0, W, H);

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
  // 4. Half-court line
  // ------------------------------------------------------------------
  ctx.beginPath();
  ctx.moveTo(0, cy(0));
  ctx.lineTo(W, cy(0));
  ctx.stroke();

  // ------------------------------------------------------------------
  // 5. Half-court centre-circle arc (only the half visible in this half)
  //    The full centre circle has radius 6ft. We draw the semicircle that
  //    extends into the half court (downward from y=0).
  // ------------------------------------------------------------------
  ctx.save();
  ctx.scale(1, scaleY);
  ctx.beginPath();
  // Arc at (0.5*W, 0) with radius rx(CENTRE_CIRCLE_RADIUS)
  // Draw the semicircle going into the court (0 to π in canvas coords)
  ctx.arc(cx(0.5), 0, rx(CENTRE_CIRCLE_RADIUS), 0, Math.PI);
  ctx.restore();
  ctx.stroke();

  // ------------------------------------------------------------------
  // 6. Three-point arc
  // The three-point line consists of:
  //   a) Two corner straight segments (parallel to baseline)
  //   b) An arc connecting them, centred on the basket
  // ------------------------------------------------------------------

  // We need to find the angles where the arc meets the corner-three y line.
  // In normalised coords: basket is at (BASKET_X, BASKET_Y)
  // Corner three y is at CORNER_THREE_Y
  // The arc has radius THREE_POINT_RADIUS (in x-normalised units)
  // But because we draw with non-uniform scale, we compute intersection angle
  // in physical (normalised) space, then map to canvas.
  //
  // In normalised coords, the arc is an ellipse:
  //   ((nx - BASKET_X) / THREE_POINT_RADIUS)^2 + ((ny - BASKET_Y) / (THREE_POINT_RADIUS * H/W))^2 = 1
  // No — let's think in feet instead.
  //
  // Physical: basket at (25ft, basketY_ft) from top-left corner.
  // THREE_POINT_RADIUS_FT = 23.75
  // Corner straight at y = CORNER_THREE_Y * H (canvas px from top)
  //
  // dy_ft = (BASKET_Y - CORNER_THREE_Y) * COURT_LENGTH_FT (feet from basket to corner-line)
  // dx_ft = sqrt(23.75^2 - dy_ft^2)
  // Angles in the canvas's potentially non-square coordinate system require
  // the ellipse approach.
  //
  // Simplest accurate approach: draw the arc using ctx.save()/scale so that
  // the coordinate system becomes square (1 unit = 1 ft), then the arc is a
  // true circle.

  const FT_PER_PX_X = 50 / W; // feet per canvas pixel in x
  const FT_PER_PX_Y = 47 / H; // feet per canvas pixel in y

  // Save and transform to a "feet" coordinate system
  ctx.save();
  // Scale so that 1 canvas unit = 1 foot
  ctx.scale(1 / FT_PER_PX_X, 1 / FT_PER_PX_Y);

  // In ft coords:
  const basketX_ft = BASKET_X * 50; // 25
  const basketY_ft = BASKET_Y * 47;
  const cornerY_ft = CORNER_THREE_Y * 47;
  const leftCornerX_ft = CORNER_THREE_LEFT_X * 50; // 3
  const rightCornerX_ft = CORNER_THREE_RIGHT_X * 50; // 47

  ctx.strokeStyle = COLOR_LINE;
  ctx.lineWidth = COLOR_LINE_WIDTH_PX * FT_PER_PX_X; // scale line width to ft coords

  // Left corner three straight: vertical line from baseline (y=47) up to 14ft depth
  ctx.beginPath();
  ctx.moveTo(leftCornerX_ft, 47);
  ctx.lineTo(leftCornerX_ft, cornerY_ft);
  ctx.stroke();

  // Right corner three straight: vertical line from baseline (y=47) up to 14ft depth
  ctx.beginPath();
  ctx.moveTo(rightCornerX_ft, 47);
  ctx.lineTo(rightCornerX_ft, cornerY_ft);
  ctx.stroke();

  // Arc angles measured from basket center to each corner x at cornerY_ft
  const arcAngleLeftCorner = Math.atan2(cornerY_ft - basketY_ft, leftCornerX_ft - basketX_ft);
  const arcAngleRightCorner = Math.atan2(cornerY_ft - basketY_ft, rightCornerX_ft - basketX_ft);

  // Three-point arc (counterclockwise from right corner to left corner,
  // going through the top of the arc toward the half-court line)
  ctx.beginPath();
  ctx.arc(basketX_ft, basketY_ft, 23.75, arcAngleRightCorner, arcAngleLeftCorner, true);
  ctx.stroke();

  // ------------------------------------------------------------------
  // 7. Restricted area arc (4ft radius from basket)
  // ------------------------------------------------------------------
  // Draw semicircle from baseline to free-throw side (angles: π to 0 going counterclockwise,
  // i.e. the portion inside the court, away from baseline)
  // In canvas y-down: angles where y < basketY_ft are "upward" i.e. into the court.
  // We want the arc on the side toward half-court (y < basketY).
  // That's angles from π (left) to 0 (right), going counterclockwise (through top).
  ctx.beginPath();
  ctx.arc(basketX_ft, basketY_ft, 4, Math.PI, 0, false);
  ctx.stroke();

  ctx.restore(); // end ft coordinate system

  // ------------------------------------------------------------------
  // 8. Paint lane outline (drawn over paint fill)
  // ------------------------------------------------------------------
  ctx.beginPath();
  ctx.strokeRect(cx(LANE_LEFT), cy(LANE_TOP), cx(LANE_RIGHT) - cx(LANE_LEFT), cy(1) - cy(LANE_TOP));

  // ------------------------------------------------------------------
  // 9. Free-throw line
  // ------------------------------------------------------------------
  ctx.beginPath();
  ctx.moveTo(cx(LANE_LEFT), cy(FT_CIRCLE_CENTER_Y));
  ctx.lineTo(cx(LANE_RIGHT), cy(FT_CIRCLE_CENTER_Y));
  ctx.stroke();

  // ------------------------------------------------------------------
  // 10. Free-throw circle
  //     Full circle: solid upper half (toward half court), dashed lower half
  //     Drawn in feet-coordinate system for a true circle.
  // ------------------------------------------------------------------
  ctx.save();
  ctx.scale(1 / FT_PER_PX_X, 1 / FT_PER_PX_Y);

  const ftCenterX_ft = FT_CIRCLE_CENTER_X * 50; // 25ft
  const ftCenterY_ft = FT_CIRCLE_CENTER_Y * 47;
  const ftRadius_ft = 6; // 6ft radius

  ctx.strokeStyle = COLOR_LINE;
  ctx.lineWidth = COLOR_LINE_WIDTH_PX * FT_PER_PX_X;

  // Upper semicircle (solid) — toward half court (clockwise π → 0, through 12 o'clock)
  ctx.beginPath();
  ctx.arc(ftCenterX_ft, ftCenterY_ft, ftRadius_ft, Math.PI, 0, false);
  ctx.stroke();

  // Lower semicircle (dashed) — into the paint (clockwise 0 → π)
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
  // 12. Basket / rim
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
// Component
// ---------------------------------------------------------------------------

export default function Court({ onReady, className }: CourtProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio ?? 1;
    const cssWidth = container.clientWidth;
    const cssHeight = Math.round(cssWidth / COURT_ASPECT_RATIO);

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

    drawCourt(canvas, cssWidth, cssHeight);

    // Notify parent with coordinate conversion helper
    if (onReady) {
      const courtToCanvas: CourtToCanvas = (normX, normY) => ({
        x: normX * cssWidth,
        y: normY * cssHeight,
      });
      onReady({ canvas, courtToCanvas, width: cssWidth, height: cssHeight });
    }
  }, [onReady]);

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
        aria-label="Basketball half court"
        role="img"
      />
    </div>
  );
}
