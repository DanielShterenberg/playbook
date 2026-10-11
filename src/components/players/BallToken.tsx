"use client";

/**
 * BallToken — a draggable basketball rendered as an SVG element.
 *
 * Implements issue #55: Ball placement and player attachment.
 *
 * Behaviour:
 *   - Freely draggable anywhere on the court canvas (clamped to bounds).
 *   - When released within SNAP_RADIUS CSS pixels of a player centre, the ball
 *     snaps and attaches to that player.
 *   - While attached, the ball is rendered offset slightly above the player
 *     token and cannot be independently dragged — it follows the player.
 *   - Dragging the ball away from an attached player (past DETACH_RADIUS)
 *     detaches it and it becomes free again.
 *   - Only one ball exists on the court at a time (enforced by the parent).
 *
 * Visual design:
 *   - Outlined circle with curved seam lines mimicking a basketball, in the
 *     active theme's palette.
 */

import { useRef, useCallback } from "react";
import { BALL_RADIUS, ballScale } from "@/lib/tokenSizing";
import { useCourtPalette } from "@/hooks/useTheme";

/** Pointer travel (px) before a press on the token counts as a drag. */
const DRAG_THRESHOLD_PX = 3;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Default radius (BALL_RADIUS, 12 CSS px) lives in @/lib/tokenSizing, shared
// with every export path.

/**
 * Distance (in CSS pixels) within which releasing the ball attaches it to a
 * player centre.
 */
const SNAP_RADIUS = BALL_RADIUS * 2.5;

/**
 * Distance (in CSS pixels) the ball must be dragged from the player centre to
 * detach.
 */
const DETACH_RADIUS = BALL_RADIUS * 3.5;

// The ball colours come from the active theme's CourtPalette, shared with the
// exports and thumbnails.

// ---------------------------------------------------------------------------
// Exported constants for use by the parent
// ---------------------------------------------------------------------------

export { SNAP_RADIUS, DETACH_RADIUS };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NearbyPlayer {
  px: number;
  py: number;
  side: "offense" | "defense";
  position: number;
}

export interface BallTokenProps {
  /** CSS pixel x of ball centre */
  cx: number;
  /** CSS pixel y of ball centre */
  cy: number;
  /** Whether the ball is currently attached to a player */
  attached: boolean;
  /** Called continuously during drag with new centre coords */
  onDrag: (newCx: number, newCy: number) => void;
  /**
   * Called on drag-end.
   * @param newCx - final x in CSS px
   * @param newCy - final y in CSS px
   * @param nearestPlayer - nearest player if within snap radius, else null
   */
  onDragEnd: (newCx: number, newCy: number, nearestPlayer: NearbyPlayer | null) => void;
  /** All player positions for snap detection */
  players: NearbyPlayer[];
  /** Court bounding box for clamping */
  courtBounds: { width: number; height: number; minY?: number };
  /** Visual radius in CSS pixels. Defaults to BALL_RADIUS (12). */
  radius?: number;
}

// ---------------------------------------------------------------------------
// Helper: nearest player within radius
// ---------------------------------------------------------------------------

function findNearest(
  cx: number,
  cy: number,
  players: NearbyPlayer[],
  radius: number,
): NearbyPlayer | null {
  let best: NearbyPlayer | null = null;
  let bestDist = radius;
  for (const p of players) {
    const dx = p.px - cx;
    const dy = p.py - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < bestDist) {
      bestDist = dist;
      best = p;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BallToken({
  cx,
  cy,
  attached,
  onDrag,
  onDragEnd,
  players,
  courtBounds,
  radius = BALL_RADIUS,
}: BallTokenProps) {
  const palette = useCourtPalette();
  const isDragging = useRef(false);
  /** Whether the current press has moved the token past the drag threshold (otherwise it is a tap). */
  const didMove = useRef(false);
  const dragStart = useRef<{ mouseX: number; mouseY: number; ballCx: number; ballCy: number }>({
    mouseX: 0,
    mouseY: 0,
    ballCx: 0,
    ballCy: 0,
  });

  const clamp = useCallback(
    (x: number, y: number): { x: number; y: number } => ({
      x: Math.max(radius, Math.min(courtBounds.width - radius, x)),
      y: Math.max((courtBounds.minY ?? 0) + radius, Math.min(courtBounds.height - radius, y)),
    }),
    [courtBounds, radius],
  );

  // -------------------------------------------------------------------------
  // Mouse handlers
  // -------------------------------------------------------------------------

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging.current) return;
      const dx = e.clientX - dragStart.current.mouseX;
      const dy = e.clientY - dragStart.current.mouseY;
      // Below the threshold it is still a tap (fingers and mice jitter).
      if (!didMove.current && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      const { x, y } = clamp(dragStart.current.ballCx + dx, dragStart.current.ballCy + dy);
      didMove.current = true;
      onDrag(x, y);
    },
    [clamp, onDrag],
  );

  const handleMouseUp = useCallback(
    (e: MouseEvent) => {
      if (!isDragging.current) return;
      isDragging.current = false;
      const dx = e.clientX - dragStart.current.mouseX;
      const dy = e.clientY - dragStart.current.mouseY;
      // A click / tap is not a drag: nothing moved, nothing to store or undo.
      // (A tap also arrives twice — as a touch, then as a compatibility click.)
      const moved = didMove.current;
      const { x, y } = clamp(dragStart.current.ballCx + dx, dragStart.current.ballCy + dy);
      const nearest = findNearest(x, y, players, SNAP_RADIUS);
      if (moved) onDragEnd(x, y, nearest);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    },
    [clamp, onDragEnd, players, handleMouseMove],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<SVGGElement>) => {
      e.preventDefault();
      isDragging.current = true;
      didMove.current = false;
      dragStart.current = { mouseX: e.clientX, mouseY: e.clientY, ballCx: cx, ballCy: cy };
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    },
    [cx, cy, handleMouseMove, handleMouseUp],
  );

  // -------------------------------------------------------------------------
  // Touch handlers
  // -------------------------------------------------------------------------

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!isDragging.current) return;
      e.preventDefault();
      const touch = e.touches[0];
      if (!touch) return;
      const dx = touch.clientX - dragStart.current.mouseX;
      const dy = touch.clientY - dragStart.current.mouseY;
      // Below the threshold it is still a tap (fingers and mice jitter).
      if (!didMove.current && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      const { x, y } = clamp(dragStart.current.ballCx + dx, dragStart.current.ballCy + dy);
      didMove.current = true;
      onDrag(x, y);
    },
    [clamp, onDrag],
  );

  const handleTouchEnd = useCallback(
    (e: TouchEvent) => {
      if (!isDragging.current) return;
      isDragging.current = false;
      const touch = e.changedTouches[0];
      if (touch && didMove.current) {
        const dx = touch.clientX - dragStart.current.mouseX;
        const dy = touch.clientY - dragStart.current.mouseY;
        const { x, y } = clamp(dragStart.current.ballCx + dx, dragStart.current.ballCy + dy);
        const nearest = findNearest(x, y, players, SNAP_RADIUS);
        onDragEnd(x, y, nearest);
      }
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    },
    [clamp, onDragEnd, players, handleTouchMove],
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent<SVGGElement>) => {
      const touch = e.touches[0];
      if (!touch) return;
      isDragging.current = true;
      didMove.current = false;
      dragStart.current = {
        mouseX: touch.clientX,
        mouseY: touch.clientY,
        ballCx: cx,
        ballCy: cy,
      };
      window.addEventListener("touchmove", handleTouchMove, { passive: false });
      window.addEventListener("touchend", handleTouchEnd);
    },
    [cx, cy, handleTouchMove, handleTouchEnd],
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const r = radius;
  // Stroke widths are authored at BALL_RADIUS and scale with the ball, as in drawBall
  const s = ballScale(r);

  return (
    <g
      transform={`translate(${cx}, ${cy})`}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      style={{ cursor: attached ? "grab" : "grab" }}
      role="button"
      aria-label="Basketball"
    >
      {/* Drop shadow */}
      <circle r={r} cx={1} cy={2} fill="rgba(0,0,0,0.3)" />

      {/* Ball body */}
      <circle r={r} fill={palette.ball} stroke={palette.ballSeam} strokeWidth={1.5 * s} />

      {/* Highlight arc (upper-left quadrant) */}
      <path
        d={`M ${-r * 0.5} ${-r * 0.6} A ${r * 0.7} ${r * 0.7} 0 0 1 ${r * 0.4} ${-r * 0.5}`}
        fill="none"
        stroke={palette.ballHighlight}
        strokeWidth={1.5 * s}
        strokeLinecap="round"
        opacity={0.5}
      />

      {/* Vertical seam (curved) */}
      <path
        d={`M 0 ${-r} C ${r * 0.55} ${-r * 0.5} ${r * 0.55} ${r * 0.5} 0 ${r}`}
        fill="none"
        stroke={palette.ballSeam}
        strokeWidth={1.2 * s}
        strokeLinecap="round"
      />

      {/* Horizontal seam (curved) */}
      <path
        d={`M ${-r} 0 C ${-r * 0.5} ${r * 0.4} ${r * 0.5} ${r * 0.4} ${r} 0`}
        fill="none"
        stroke={palette.ballSeam}
        strokeWidth={1.2 * s}
        strokeLinecap="round"
      />
    </g>
  );
}
