"use client";

/**
 * PlayerToken — a single draggable player circle rendered as an SVG element.
 *
 * Offensive players: filled solid circle (warm orange) with white position number.
 * Defensive players: hollow circle with an X mark and position number.
 *
 * Props are expressed in *CSS pixels* relative to the court canvas so that the
 * parent CourtWithPlayers can place them correctly.
 *
 * Implements issue #53: player display mode (numbers | names | abbreviations).
 */

import { useRef, useCallback } from "react";
import type { PlayerDisplayMode } from "@/lib/store";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default radius of the player token in CSS pixels (independent of DPR). */
const PLAYER_RADIUS = 18;

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

const COLOR_OFFENSE_FILL = "#E07B39"; // warm orange (matches court paint)
const COLOR_OFFENSE_STROKE = "#FFFFFF";
const COLOR_DEFENSE_FILL = "#FFFFFF";
const COLOR_DEFENSE_STROKE = "#1E3A5F"; // dark navy
const COLOR_TEXT_OFFENSE = "#FFFFFF";
// Defense text color uses the resolved defense color (same as border/X stroke)

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
   * Custom fill color for the offense token (overrides COLOR_OFFENSE_FILL).
   * Only used when side === "offense".
   */
  offenseColor?: string;
  /**
   * Custom accent color for the defense token (overrides COLOR_DEFENSE_STROKE).
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
  const isDragging = useRef(false);
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
      const { x, y } = clamp(dragStart.current.playerCx + dx, dragStart.current.playerCy + dy);
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
      const { x, y } = clamp(dragStart.current.playerCx + dx, dragStart.current.playerCy + dy);
      onDragEnd(x, y);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    },
    [clamp, onDragEnd, handleMouseMove],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<SVGGElement>) => {
      e.preventDefault();
      isDragging.current = true;
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
      const { x, y } = clamp(dragStart.current.playerCx + dx, dragStart.current.playerCy + dy);
      onDrag(x, y);
    },
    [clamp, onDrag],
  );

  const handleTouchEnd = useCallback(
    (e: TouchEvent) => {
      if (!isDragging.current) return;
      isDragging.current = false;
      const touch = e.changedTouches[0];
      if (touch) {
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
  const resolvedOffenseColor = offenseColor ?? COLOR_OFFENSE_FILL;
  const resolvedDefenseColor = defenseColor ?? COLOR_DEFENSE_STROKE;
  const fillColor = isOffense ? resolvedOffenseColor : COLOR_DEFENSE_FILL;
  const strokeColor = isOffense ? COLOR_OFFENSE_STROKE : resolvedDefenseColor;
  const textColor = isOffense ? COLOR_TEXT_OFFENSE : resolvedDefenseColor;
  const strokeWidth = isOffense ? 2 : 2.5;

  // Build label based on display mode
  let label: string;
  if (displayMode === "names") {
    label = playerName ?? (isOffense ? String(position) : `X${position}`);
  } else if (displayMode === "abbreviations") {
    const abbrs = isOffense ? OFFENSE_ABBRS : DEFENSE_ABBRS;
    label = abbrs[position] ?? String(position);
  } else {
    // "numbers" — default
    label = isOffense ? String(position) : `X${position}`;
  }

  // Scale X-line extent and font proportionally to radius
  const xSize = Math.round(radius * 5 / PLAYER_RADIUS);
  const scaledStrokeWidth = Math.max(1.5, strokeWidth * radius / PLAYER_RADIUS);

  // Shrink font for long names so they fit inside the token
  const baseFontSize = Math.max(6, Math.round(11 * radius / PLAYER_RADIUS));
  const fontSize = label.length > 2 ? Math.max(5, baseFontSize - (label.length - 2) * 1.5) : baseFontSize;

  // Defense label sits above the X mark; scale the offset with radius
  const textDy = isOffense ? 0 : -Math.round(radius * 7 / PLAYER_RADIUS);

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
      {/* Defensive X lines */}
      {!isOffense && (
        <>
          <line
            x1={-xSize}
            y1={-xSize}
            x2={xSize}
            y2={xSize}
            stroke={resolvedDefenseColor}
            strokeWidth={scaledStrokeWidth}
            strokeLinecap="round"
          />
          <line
            x1={xSize}
            y1={-xSize}
            x2={-xSize}
            y2={xSize}
            stroke={resolvedDefenseColor}
            strokeWidth={scaledStrokeWidth}
            strokeLinecap="round"
          />
        </>
      )}
      {/* Position label */}
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fill={textColor}
        fontSize={fontSize}
        fontWeight="700"
        fontFamily="system-ui, sans-serif"
        dy={textDy}
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        {label}
      </text>
    </g>
  );
}
