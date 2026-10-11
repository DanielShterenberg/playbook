"use client";

/**
 * PlayerToken — a single draggable player circle rendered as an SVG element.
 *
 * Both sides are filled circles with the position label inside: offense in the
 * offense colour, defense in the defense colour (team colours, else the active
 * theme's palette). The label colour follows the fill (contrastText).
 *
 * Props are expressed in *CSS pixels* relative to the court canvas so that the
 * parent CourtWithPlayers can place them correctly.
 *
 * Implements issue #53: player display mode (numbers | names | abbreviations).
 */

import { useRef, useCallback } from "react";
import type { PlayerDisplayMode } from "@/lib/store";
import { PLAYER_RADIUS, playerScale, playerLabelFontSize } from "@/lib/tokenSizing";
import { contrastText, customTeamColor } from "@/lib/courtPalette";
import { useCourtPalette } from "@/hooks/useTheme";

/** Pointer travel (px) before a press on the token counts as a drag. */
const DRAG_THRESHOLD_PX = 3;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Default radius (PLAYER_RADIUS, 18 CSS px) and proportional scaling live in
// @/lib/tokenSizing, shared with every export path.

/** Standard position abbreviations for offense (by 1-based position). */
const OFFENSE_ABBRS: Record<number, string> = {
  1: "PG",
  2: "SG",
  3: "SF",
  4: "PF",
  5: "C",
};

/** Standard position abbreviations for defense (mirror of offense). */
const DEFENSE_ABBRS: Record<number, string> = {
  1: "PG",
  2: "SG",
  3: "SF",
  4: "PF",
  5: "C",
};

// Token colours come from the active theme's CourtPalette (useCourtPalette),
// shared with the exports and thumbnails.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlayerTokenProps {
  /** "offense" or "defense" */
  side: "offense" | "defense";
  /** 1-based position number */
  position: number;
  /** CSS pixel x position of the player centre within the court container */
  cx: number;
  /** CSS pixel y position of the player centre within the court container */
  cy: number;
  /** Called continuously as the player is dragged */
  onDrag: (newCx: number, newCy: number) => void;
  /** Called when drag ends, signals store should be updated */
  onDragEnd: (newCx: number, newCy: number) => void;
  /** Bounding box (in CSS px) to clamp drag inside the court */
  courtBounds: { width: number; height: number; minY?: number };
  /**
   * What to display inside the token.
   *   "numbers"       — default positional number (O1, X1 …)
   *   "names"         — player name from roster (passed via `playerName`)
   *   "abbreviations" — PG / SG / SF / PF / C
   */
  displayMode?: PlayerDisplayMode;
  /**
   * Player name shown when displayMode === "names".
   * Falls back to the position number if absent.
   */
  playerName?: string;
  /** Token radius in CSS pixels. Defaults to PLAYER_RADIUS (18). */
  radius?: number;
  /**
   * Custom fill color for the offense token (overrides the palette's).
   * Only used when side === "offense".
   */
  offenseColor?: string;
  /**
   * Custom fill color for the defense token (overrides the palette's).
   * Only used when side === "defense".
   */
  defenseColor?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PlayerToken({
  side,
  position,
  cx,
  cy,
  onDrag,
  onDragEnd,
  courtBounds,
  displayMode = "numbers",
  playerName,
  radius = PLAYER_RADIUS,
  offenseColor,
  defenseColor,
}: PlayerTokenProps) {
  const palette = useCourtPalette();
  const isDragging = useRef(false);
  /** Whether the current press has moved the token past the drag threshold (otherwise it is a tap). */
  const didMove = useRef(false);
  const dragStart = useRef<{ mouseX: number; mouseY: number; playerCx: number; playerCy: number }>({
    mouseX: 0,
    mouseY: 0,
    playerCx: 0,
    playerCy: 0,
  });

  const clamp = useCallback(
    (x: number, y: number): { x: number; y: number } => ({
      x: Math.max(radius, Math.min(courtBounds.width - radius, x)),
      y: Math.max((courtBounds.minY ?? 0) + radius, Math.min(courtBounds.height - radius, y)),
    }),
    [courtBounds, radius],
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging.current) return;
      const dx = e.clientX - dragStart.current.mouseX;
      const dy = e.clientY - dragStart.current.mouseY;
      // Below the threshold it is still a tap (fingers and mice jitter).
      if (!didMove.current && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      const { x, y } = clamp(dragStart.current.playerCx + dx, dragStart.current.playerCy + dy);
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
      const { x, y } = clamp(dragStart.current.playerCx + dx, dragStart.current.playerCy + dy);
      if (moved) onDragEnd(x, y);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    },
    [clamp, onDragEnd, handleMouseMove],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<SVGGElement>) => {
      e.preventDefault();
      isDragging.current = true;
      didMove.current = false;
      dragStart.current = { mouseX: e.clientX, mouseY: e.clientY, playerCx: cx, playerCy: cy };
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    },
    [cx, cy, handleMouseMove, handleMouseUp],
  );

  // Touch support
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
      const { x, y } = clamp(dragStart.current.playerCx + dx, dragStart.current.playerCy + dy);
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
        const { x, y } = clamp(dragStart.current.playerCx + dx, dragStart.current.playerCy + dy);
        onDragEnd(x, y);
      }
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    },
    [clamp, onDragEnd, handleTouchMove],
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
        playerCx: cx,
        playerCy: cy,
      };
      window.addEventListener("touchmove", handleTouchMove, { passive: false });
      window.addEventListener("touchend", handleTouchEnd);
    },
    [cx, cy, handleTouchMove, handleTouchEnd],
  );

  const isOffense = side === "offense";
  const fillColor = isOffense
    ? customTeamColor(offenseColor) ?? palette.offenseFill
    : customTeamColor(defenseColor) ?? palette.defenseFill;
  const strokeColor = palette.tokenStroke;
  const textColor = contrastText(fillColor);
  const strokeWidth = 2;

  // Build label based on display mode
  let label: string;
  if (displayMode === "names") {
    label = playerName ?? (isOffense ? String(position) : `X${position}`);
  } else if (displayMode === "abbreviations") {
    const abbrs = isOffense ? OFFENSE_ABBRS : DEFENSE_ABBRS;
    label = abbrs[position] ?? String(position);
  } else {
    // "numbers" — default
    label = String(position);
  }

  // Stroke and font are authored at PLAYER_RADIUS and scale with the token
  const scale = playerScale(radius);
  const scaledStrokeWidth = Math.max(1.5, strokeWidth * scale);

  // Shrink font for long names so they fit inside the token
  const fontSize = playerLabelFontSize(label.length, radius);

  return (
    <g
      transform={`translate(${cx}, ${cy})`}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      style={{ cursor: "grab" }}
      role="button"
      aria-label={`${isOffense ? "Offensive" : "Defensive"} player ${position}`}
    >
      {/* Drop shadow */}
      <circle
        r={radius}
        cx={1}
        cy={2}
        fill="rgba(0,0,0,0.25)"
      />
      {/* Main circle */}
      <circle
        r={radius}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={scaledStrokeWidth}
      />
      {/* Position label */}
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fill={textColor}
        fontSize={fontSize}
        fontWeight="700"
        fontFamily="system-ui, sans-serif"
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        {label}
      </text>
    </g>
  );
}
