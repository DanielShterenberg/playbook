"use client";

/**
 * Court component — renders an NBA basketball court on an HTML5 Canvas.
 *
 * Implements issue #49: Render basketball half court on canvas.
 * Implements issue #50: Full court rendering.
 *
 * Design:
 *   - The drawing itself (floor, markings, half/full, flip) is paintCourt in
 *     @/lib/courtRendering and the dimensions come from computeCourtLayout in
 *     @/lib/courtLayout — both shared with every export path (#163, #171).
 *     This component only owns the canvas element: sizing, DPR and resize.
 *   - variant="full" draws both ends. Players are positioned in the near
 *     (bottom) end.
 *   - Responsive: fills container width and maintains correct aspect ratio.
 *   - Exposes courtToCanvas / playAreaHeight / playAreaOffsetY in onReady so
 *     CourtWithPlayers can map normalised coords to pixels correctly.
 */

import { useEffect, useRef, useCallback } from "react";
import { computeCourtLayout, normToCanvasPx, type CourtLayout, type CourtVariant } from "@/lib/courtLayout";
import { paintCourt } from "@/lib/courtRendering";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// Canonical definition lives in courtLayout.ts; re-exported so existing imports keep working.
export type { CourtVariant } from "@/lib/courtLayout";

/** Maps a normalised court coordinate [0-1, 0-1] to canvas pixels. */
export type CourtToCanvas = (normX: number, normY: number) => { x: number; y: number };

export interface CourtReadyPayload {
  canvas: HTMLCanvasElement;
  courtToCanvas: CourtToCanvas;
  /** Total canvas width in CSS pixels (inner court + OOB margins). */
  width: number;
  /** Total canvas height in CSS pixels (inner court + OOB margin). */
  height: number;
  /**
   * Height of the play area (inner court) in CSS pixels.
   * For half court this equals innerH; for full court it is innerH (one end).
   */
  playAreaHeight: number;
  /**
   * Y offset from the canvas top to the play area.
   * For half court this is 0; for full court it is innerH + oobBot.
   */
  playAreaOffsetY: number;
  /**
   * X offset from the canvas left edge to the play area (OOB side margin).
   */
  playAreaOffsetX: number;
  /** Inner court width in CSS pixels (canvas width minus 2× side OOB margin). */
  playAreaWidth: number;
  /**
   * The full layout this draw used (CSS pixels). Pass it to normToCanvasPx /
   * canvasPxToNorm from courtLayout.ts; the fields above are views of it.
   */
  layout: CourtLayout;
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
  /**
   * When true, flips the court so the basket is at the top (north).
   * The flip is purely visual — normalised coords are unchanged.
   */
  flipped?: boolean;
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

// OOB margin constants live in courtLayout.ts (shared with export paths).
// Re-exported so existing imports from this file keep working.
export { OOB_SIDE_FRAC, OOB_BOTTOM_FRAC } from "@/lib/courtLayout";

// The court drawing itself lives in courtRendering.ts (shared with every export
// path). drawCourt is re-exported so existing imports from this file keep working.
export { drawCourt } from "@/lib/courtRendering";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Court({ variant = "half", onReady, className, flipped = false }: CourtProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio ?? 1;
    const cssWidth = container.clientWidth;

    // OOB margins and inner court dimensions — shared with every export path
    const layout = computeCourtLayout(cssWidth, variant);
    const cssHeight = layout.totalHeight;

    // Set CSS size
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;

    // Set backing store size (high-DPI) — also clears the canvas and resets the context
    canvas.width = Math.round(cssWidth * dpr); // actual pixel width
    canvas.height = Math.round(cssHeight * dpr); // actual pixel height

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(dpr, dpr);

    // Floor, OOB margins and all markings (the flip is purely visual —
    // courtToCanvas compensates)
    paintCourt(ctx, layout, { flipped });

    // Notify parent with coordinate conversion helper and play-area metadata
    if (onReady) {
      const courtToCanvas: CourtToCanvas = (normX, normY) => normToCanvasPx(normX, normY, layout, flipped);

      onReady({
        canvas,
        courtToCanvas,
        width: layout.totalWidth,
        height: layout.totalHeight,
        playAreaHeight: layout.playAreaHeight,
        playAreaOffsetY: layout.playAreaOffsetY,
        playAreaOffsetX: layout.playAreaOffsetX,
        playAreaWidth: layout.playAreaWidth,
        layout,
      });
    }
  }, [variant, onReady, flipped]);

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
