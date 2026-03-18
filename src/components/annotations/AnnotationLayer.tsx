"use client";

/**
 * AnnotationLayer — SVG overlay that handles annotation drawing interactions
 * and renders all existing annotations for the active scene / timing step.
 *
 * Implements issue #57: Player movement annotation (solid arrow line).
 *
 * Architecture:
 *   - Rendered as an absolutely-positioned SVG on top of CourtWithPlayers.
 *   - When a drawing tool is active, pointer events are captured by this layer.
 *   - When "select" is active, pointer events fall through to player tokens below.
 *   - The layer tracks an in-progress line (from mousedown → mouseup), then
 *     commits the resulting Annotation to the Zustand store via addAnnotation.
 *
 * Coordinate system:
 *   - The `width`/`height` props are the CSS pixel dimensions of the court.
 *   - Normalised [0-1] coords are stored in the Zustand store.
 *   - SVG renders in CSS-pixel space (same as CourtWithPlayers overlay).
 *
 * Snap-to-player:
 *   - When starting or ending a stroke within SNAP_RADIUS px of a player, the
 *     annotation endpoint is snapped to that player and a fromPlayer/toPlayer
 *     reference is stored.
 */

import { useState, useCallback, useRef } from "react";
import { useStore, selectEditorScene } from "@/lib/store";
import type { DrawingTool } from "@/lib/store";
import type { Annotation, Point, Scene } from "@/lib/types";
import { TOOL_CURSOR } from "@/components/editor/DrawingToolsPanel";
import { useHistoryStore } from "@/lib/history";

// ---------------------------------------------------------------------------
// Multi-leg path helpers
// ---------------------------------------------------------------------------

/**
 * Return all points in a (possibly multi-leg) annotation's path:
 *   from → waypoints[0] → ... → waypoints[n-1] → to
 * All points are in normalised [0-1] coords.
 */
function annPathPoints(ann: Annotation): Point[] {
  return [ann.from, ...(ann.waypoints ?? []), ann.to];
}

/**
 * Return true when the annotation type supports multi-leg extension.
 * Guard / handoff are assignment-style and do not get extra legs.
 */
function isExtendable(type: Annotation["type"]): boolean {
  return type === "movement" || type === "cut" || type === "dribble";
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Pixel distance within which a stroke endpoint snaps to a player token. */
const SNAP_RADIUS = 28;

/** Radius used to draw a snap indicator ring. */
const SNAP_RING_RADIUS = 24;

// ---------------------------------------------------------------------------
// Rendering helpers per annotation type
// ---------------------------------------------------------------------------

/**
 * Build an SVG polyline `d` string through a sequence of pixel points.
 * Used for multi-leg paths (when waypoints are present).
 */
function polylinePath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return "";
  return `M ${pts.map((p) => `${p.x},${p.y}`).join(" L ")}`;
}

/** Compute an arrowhead polygon points string given a line endpoint and direction. */
function arrowHead(
  x2: number,
  y2: number,
  x1: number,
  y1: number,
  size: number = 12,
): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return "";
  const ux = dx / len;
  const uy = dy / len;
  // Perpendicular
  const px = -uy;
  const py = ux;
  const tipX = x2;
  const tipY = y2;
  const baseX = x2 - ux * size;
  const baseY = y2 - uy * size;
  const w = size * 0.45;
  return `${tipX},${tipY} ${baseX + px * w},${baseY + py * w} ${baseX - px * w},${baseY - py * w}`;
}

/**
 * Build an SVG quadratic bezier path string from pixel from/to/control points.
 * Falls back to a straight line if no control point.
 */
function bezierPath(from: Point, to: Point, cp?: Point): string {
  if (!cp) return `M ${from.x},${from.y} L ${to.x},${to.y}`;
  return `M ${from.x},${from.y} Q ${cp.x},${cp.y} ${to.x},${to.y}`;
}

/**
 * Compute a point on a quadratic bezier at parameter t.
 * When cp is undefined, returns linear interpolation.
 */
function bezierPoint(from: Point, to: Point, t: number, cp?: Point): Point {
  if (!cp) {
    return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
  }
  const mt = 1 - t;
  return {
    x: mt * mt * from.x + 2 * mt * t * cp.x + t * t * to.x,
    y: mt * mt * from.y + 2 * mt * t * cp.y + t * t * to.y,
  };
}

/**
 * Compute the tangent direction at the end of a quadratic bezier (t=1).
 * Returns a vector from the point just before the end toward the end —
 * used to orient the arrowhead correctly on curved lines.
 */
function bezierEndTangent(from: Point, to: Point, cp?: Point): { ux: number; uy: number } {
  // Tangent at t=1: direction from cp to to (or from to to for straight lines)
  const tail = cp ?? from;
  const dx = to.x - tail.x;
  const dy = to.y - tail.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 0.001) return { ux: 1, uy: 0 };
  return { ux: dx / len, uy: dy / len };
}

/**
 * Arrowhead polygon string using bezier tangent direction at the endpoint.
 */
function arrowHeadBezier(to: Point, from: Point, cp: Point | undefined, size: number = 12): string {
  const { ux, uy } = bezierEndTangent(from, to, cp);
  // Perpendicular
  const px = -uy;
  const py = ux;
  const baseX = to.x - ux * size;
  const baseY = to.y - uy * size;
  const w = size * 0.45;
  return `${to.x},${to.y} ${baseX + px * w},${baseY + py * w} ${baseX - px * w},${baseY - py * w}`;
}

/**
 * Default control point: offset perpendicular to the line midpoint by a small amount.
 * Used when the user has not yet dragged the handle.
 */
function defaultControlPoint(from: Point, to: Point): Point {
  return { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
}

interface RenderedAnnotationProps {
  ann: Annotation;
  selected: boolean;
  onSelect: (id: string) => void;
  /** The timing step this annotation belongs to (for the badge). */
  step?: number;
  /** Whether to show the step badge. */
  showStepBadge?: boolean;
  /** Inner play-area pixel dimensions — used to convert stored normalized coords to pixels. */
  width: number;
  height: number;
  /** X offset from SVG left edge to play area (OOB side margin). Default 0. */
  offsetX?: number;
  /** Y offset from SVG top to play area. Default 0. */
  offsetY?: number;
  /** Whether the court is flipped (basket at top). */
  flipped?: boolean;
}

function RenderedAnnotation({ ann, selected, onSelect, step, showStepBadge, width, height, offsetX = 0, offsetY = 0, flipped = false }: RenderedAnnotationProps) {
  const { type } = ann;
  // Annotations are stored in normalised [0-1] coords. Convert to CSS pixels for rendering.
  // width/height here are the play area (inner court) dimensions; offsetX/offsetY position
  // the play area within the SVG canvas.
  const normToSvg = (nx: number, ny: number) => ({
    x: nx * width + offsetX,
    y: flipped ? (1 - ny) * height + offsetY : ny * height + offsetY,
  });
  const from = normToSvg(ann.from.x, ann.from.y);
  const to   = normToSvg(ann.to.x,   ann.to.y);

  // Multi-leg path support: convert all waypoints to pixel space
  const hasWaypoints = ann.waypoints && ann.waypoints.length > 0;
  const allPxPoints: { x: number; y: number }[] = hasWaypoints
    ? annPathPoints(ann).map((p) => normToSvg(p.x, p.y))
    : [];

  // Control point (bezier curve support — only for single-leg annotations)
  const cp: Point | undefined = !hasWaypoints && ann.controlPoints.length > 0
    ? normToSvg(ann.controlPoints[0].x, ann.controlPoints[0].y)
    : undefined;

  const hitStyle: React.CSSProperties = { cursor: "pointer", pointerEvents: "stroke" };

  // Step badge — small circle at the midpoint of the path
  const mid = hasWaypoints && allPxPoints.length >= 2
    ? allPxPoints[Math.floor(allPxPoints.length / 2)]
    : bezierPoint(from, to, 0.5, cp);
  const midX = mid.x;
  const midY = mid.y;
  const stepBadge = showStepBadge && step !== undefined ? (
    <g pointerEvents="none">
      <circle cx={midX} cy={midY} r={9} fill="#3B82F6" opacity={0.9} />
      <text
        x={midX}
        y={midY}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={9}
        fontWeight="bold"
        fill="#fff"
      >
        {step}
      </text>
    </g>
  ) : null;

  // For multi-leg: arrowhead from second-to-last to last point
  // For straight lines use legacy arrowHead; for bezier use bezier tangent
  const headPoints = hasWaypoints && allPxPoints.length >= 2
    ? arrowHead(allPxPoints[allPxPoints.length - 1].x, allPxPoints[allPxPoints.length - 1].y,
                allPxPoints[allPxPoints.length - 2].x, allPxPoints[allPxPoints.length - 2].y)
    : cp
    ? arrowHeadBezier(to, from, cp)
    : arrowHead(to.x, to.y, from.x, from.y);

  // Selection ring bounding box over all path points
  const allXs = hasWaypoints ? allPxPoints.map((p) => p.x) : [from.x, to.x];
  const allYs = hasWaypoints ? allPxPoints.map((p) => p.y) : [from.y, to.y];
  const minX = Math.min(...allXs);
  const minY = Math.min(...allYs);
  const maxX = Math.max(...allXs);
  const maxY = Math.max(...allYs);

  const selectRing = selected ? (
    <rect
      x={minX - 6}
      y={minY - 6}
      width={maxX - minX + 12}
      height={maxY - minY + 12}
      rx={4}
      fill="none"
      stroke="#3B82F6"
      strokeWidth={1.5}
      strokeDasharray="4 2"
      pointerEvents="none"
    />
  ) : null;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(ann.id);
  };

  if (type === "movement") {
    const d = hasWaypoints ? polylinePath(allPxPoints) : bezierPath(from, to, cp);
    return (
      <g onClick={handleClick} style={hitStyle}>
        {selectRing}
        {/* Invisible wide hit-area */}
        <path d={d} stroke="transparent" strokeWidth={14} fill="none" />
        <path
          d={d}
          stroke="#1E3A5F"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {headPoints && (
          <polygon points={headPoints} fill="#1E3A5F" />
        )}
        {stepBadge}
      </g>
    );
  }

  if (type === "dribble") {
    if (hasWaypoints) {
      // Multi-leg dribble: render as dashed polyline (no zigzag for multi-leg)
      const d = polylinePath(allPxPoints);
      return (
        <g onClick={handleClick} style={hitStyle}>
          {selectRing}
          <path d={d} stroke="transparent" strokeWidth={14} fill="none" />
          <path
            d={d}
            stroke="#1E3A5F"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="5 4"
            fill="none"
          />
          {headPoints && <polygon points={headPoints} fill="#1E3A5F" />}
          {stepBadge}
        </g>
      );
    }
    if (cp) {
      // Curved dribble: render as bezier path (smooth) + arrowhead
      const d = bezierPath(from, to, cp);
      return (
        <g onClick={handleClick} style={hitStyle}>
          {selectRing}
          <path d={d} stroke="transparent" strokeWidth={14} fill="none" />
          <path
            d={d}
            stroke="#1E3A5F"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="5 4"
            fill="none"
          />
          {headPoints && <polygon points={headPoints} fill="#1E3A5F" />}
          {stepBadge}
        </g>
      );
    }
    // Straight dribble: zigzag path
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const zigCount = Math.max(2, Math.round(len / 18));
    const pts: string[] = [];
    for (let i = 0; i <= zigCount; i++) {
      const t = i / zigCount;
      const mx = from.x + dx * t;
      const my = from.y + dy * t;
      // Perpendicular offset alternates; force 0 at endpoints so the path
      // starts/ends exactly at from/to and the arrowhead aligns correctly.
      const perp = (i === 0 || i === zigCount) ? 0 : (i % 2 === 0 ? 6 : -6);
      const px2 = -dy / len * perp;
      const py2 = dx / len * perp;
      pts.push(`${mx + px2},${my + py2}`);
    }
    const d = `M ${pts.join(" L ")}`;
    return (
      <g onClick={handleClick} style={hitStyle}>
        {selectRing}
        <path d={d} stroke="transparent" strokeWidth={14} fill="none" />
        <path
          d={d}
          stroke="#1E3A5F"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {headPoints && <polygon points={headPoints} fill="#1E3A5F" />}
        {stepBadge}
      </g>
    );
  }

  if (type === "pass") {
    // Straight/curved line with solid triangle tip
    const d = bezierPath(from, to, cp);
    return (
      <g onClick={handleClick} style={hitStyle}>
        {selectRing}
        <path d={d} stroke="transparent" strokeWidth={14} fill="none" />
        <path
          d={d}
          stroke="#059669"
          strokeWidth={2}
          strokeLinecap="round"
          fill="none"
        />
        {headPoints && <polygon points={headPoints} fill="#059669" />}
        {stepBadge}
      </g>
    );
  }

  if (type === "screen") {
    // A line with a perpendicular bar at the end (like a comb)
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const ux = len > 0 ? dx / len : 1;
    const uy = len > 0 ? dy / len : 0;
    const perp = { x: -uy * 10, y: ux * 10 };
    return (
      <g onClick={handleClick} style={hitStyle}>
        {selectRing}
        <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="transparent" strokeWidth={14} />
        <line
          x1={from.x} y1={from.y} x2={to.x} y2={to.y}
          stroke="#7C3AED" strokeWidth={2.5} strokeLinecap="round"
        />
        {/* Perpendicular bar */}
        <line
          x1={to.x + perp.x} y1={to.y + perp.y}
          x2={to.x - perp.x} y2={to.y - perp.y}
          stroke="#7C3AED" strokeWidth={3} strokeLinecap="round"
        />
        {stepBadge}
      </g>
    );
  }

  if (type === "cut") {
    const d = hasWaypoints ? polylinePath(allPxPoints) : bezierPath(from, to, cp);
    return (
      <g onClick={handleClick} style={hitStyle}>
        {selectRing}
        <path d={d} stroke="transparent" strokeWidth={14} fill="none" />
        <path
          d={d}
          stroke="#DC2626"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="7 5"
          fill="none"
        />
        {headPoints && <polygon points={headPoints} fill="#DC2626" />}
        {stepBadge}
      </g>
    );
  }

  if (type === "guard") {
    // Guard assignment: dashed line from defender to offensive player.
    // Rendered in amber/orange to be visually distinct from cut (red dashed)
    // and from movement (solid navy). No arrowhead — it is a static assignment link.
    const d = bezierPath(from, to, cp);
    return (
      <g onClick={handleClick} style={hitStyle}>
        {selectRing}
        <path d={d} stroke="transparent" strokeWidth={14} fill="none" />
        <path
          d={d}
          stroke="#D97706"
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray="4 4"
          opacity={0.85}
          fill="none"
        />
        {stepBadge}
      </g>
    );
  }

  if (type === "handoff") {
    // Dribble hand-off (DHO): dashed line from ball-handler to receiver with
    // two small perpendicular tick marks near the delivery point (to endpoint).
    // Standard DHO notation used in FastDraw / Synergy coaching diagrams.
    const d = bezierPath(from, to, cp);
    const tickLen = 9;
    // Tick positions along the path (bezier-aware)
    const tick1 = bezierPoint(from, to, 0.85, cp);
    const tick2 = bezierPoint(from, to, 0.72, cp);
    // Tangent at t=0.85 and t=0.72 for perpendicular tick orientation
    const tangent1Before = bezierPoint(from, to, 0.83, cp);
    const tangent2Before = bezierPoint(from, to, 0.70, cp);
    const getTick = (pt: Point, before: Point) => {
      const ddx = pt.x - before.x;
      const ddy = pt.y - before.y;
      const dlen = Math.sqrt(ddx * ddx + ddy * ddy);
      const pux = dlen > 0 ? -ddy / dlen : 0;
      const puy = dlen > 0 ? ddx / dlen : 1;
      return { pux, puy };
    };
    const { pux: pux1, puy: puy1 } = getTick(tick1, tangent1Before);
    const { pux: pux2, puy: puy2 } = getTick(tick2, tangent2Before);
    return (
      <g onClick={handleClick} style={hitStyle}>
        {selectRing}
        {/* Invisible wide hit-area */}
        <path d={d} stroke="transparent" strokeWidth={14} fill="none" />
        {/* Dashed body line */}
        <path
          d={d}
          stroke="#0369A1"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeDasharray="6 4"
          fill="none"
        />
        {/* First perpendicular tick mark */}
        <line
          x1={tick1.x + pux1 * tickLen} y1={tick1.y + puy1 * tickLen}
          x2={tick1.x - pux1 * tickLen} y2={tick1.y - puy1 * tickLen}
          stroke="#0369A1" strokeWidth={2.5} strokeLinecap="round"
        />
        {/* Second perpendicular tick mark */}
        <line
          x1={tick2.x + pux2 * tickLen} y1={tick2.y + puy2 * tickLen}
          x2={tick2.x - pux2 * tickLen} y2={tick2.y - puy2 * tickLen}
          stroke="#0369A1" strokeWidth={2.5} strokeLinecap="round"
        />
        {/* Direction arrow at the receiver end */}
        {headPoints && <polygon points={headPoints} fill="#0369A1" />}
        {stepBadge}
      </g>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// In-progress (preview) annotation
// ---------------------------------------------------------------------------

function PreviewAnnotation({
  tool,
  from,
  to,
}: {
  tool: DrawingTool;
  from: Point;
  to: Point;
}) {
  const headPoints = arrowHead(to.x, to.y, from.x, from.y);

  if (tool === "movement") {
    return (
      <g pointerEvents="none" opacity={0.7}>
        <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#1E3A5F" strokeWidth={2.5} strokeLinecap="round" strokeDasharray="5 3" />
        {headPoints && <polygon points={headPoints} fill="#1E3A5F" opacity={0.8} />}
      </g>
    );
  }

  if (tool === "dribble") {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const zigCount = Math.max(2, Math.round(len / 18));
    const pts: string[] = [];
    for (let i = 0; i <= zigCount; i++) {
      const t = i / zigCount;
      const mx = from.x + dx * t;
      const my = from.y + dy * t;
      const perp = i % 2 === 0 ? 6 : -6;
      const px2 = len > 0 ? -dy / len * perp : 0;
      const py2 = len > 0 ? dx / len * perp : 0;
      pts.push(`${mx + px2},${my + py2}`);
    }
    const d = `M ${pts.join(" L ")}`;
    return (
      <g pointerEvents="none" opacity={0.7}>
        <path d={d} stroke="#1E3A5F" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" strokeDasharray="5 3" />
        {headPoints && <polygon points={headPoints} fill="#1E3A5F" opacity={0.8} />}
      </g>
    );
  }

  if (tool === "pass") {
    return (
      <g pointerEvents="none" opacity={0.7}>
        <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#059669" strokeWidth={2} strokeLinecap="round" strokeDasharray="5 3" />
        {headPoints && <polygon points={headPoints} fill="#059669" opacity={0.8} />}
      </g>
    );
  }

  if (tool === "screen") {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const ux = len > 0 ? dx / len : 1;
    const uy = len > 0 ? dy / len : 0;
    const perp = { x: -uy * 10, y: ux * 10 };
    return (
      <g pointerEvents="none" opacity={0.7}>
        <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#7C3AED" strokeWidth={2.5} strokeLinecap="round" />
        <line x1={to.x + perp.x} y1={to.y + perp.y} x2={to.x - perp.x} y2={to.y - perp.y} stroke="#7C3AED" strokeWidth={3} strokeLinecap="round" />
      </g>
    );
  }

  if (tool === "cut") {
    return (
      <g pointerEvents="none" opacity={0.7}>
        <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#DC2626" strokeWidth={2.5} strokeLinecap="round" strokeDasharray="7 5" />
        {headPoints && <polygon points={headPoints} fill="#DC2626" opacity={0.8} />}
      </g>
    );
  }

  if (tool === "guard") {
    return (
      <g pointerEvents="none" opacity={0.7}>
        <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#D97706" strokeWidth={2} strokeLinecap="round" strokeDasharray="4 4" />
      </g>
    );
  }

  if (tool === "handoff") {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const ux = len > 0 ? dx / len : 1;
    const uy = len > 0 ? dy / len : 0;
    const px2 = -uy;
    const py2 = ux;
    const tickLen = 9;
    const t1 = 0.85;
    const t1x = from.x + dx * t1;
    const t1y = from.y + dy * t1;
    const t2 = 0.72;
    const t2x = from.x + dx * t2;
    const t2y = from.y + dy * t2;
    return (
      <g pointerEvents="none" opacity={0.7}>
        <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#0369A1" strokeWidth={2.5} strokeLinecap="round" strokeDasharray="6 4" />
        <line
          x1={t1x + px2 * tickLen} y1={t1y + py2 * tickLen}
          x2={t1x - px2 * tickLen} y2={t1y - py2 * tickLen}
          stroke="#0369A1" strokeWidth={2.5} strokeLinecap="round"
        />
        <line
          x1={t2x + px2 * tickLen} y1={t2y + py2 * tickLen}
          x2={t2x - px2 * tickLen} y2={t2y - py2 * tickLen}
          stroke="#0369A1" strokeWidth={2.5} strokeLinecap="round"
        />
        {headPoints && <polygon points={headPoints} fill="#0369A1" opacity={0.8} />}
      </g>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Player snap data (passed in from parent)
// ---------------------------------------------------------------------------

export interface SnapPlayer {
  px: number;
  py: number;
  side: "offense" | "defense";
  position: number;
}

function findNearestPlayer(
  x: number,
  y: number,
  players: SnapPlayer[],
): SnapPlayer | null {
  let nearest: SnapPlayer | null = null;
  let minDist = SNAP_RADIUS;
  for (const p of players) {
    const dx = x - p.px;
    const dy = y - p.py;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < minDist) {
      minDist = dist;
      nearest = p;
    }
  }
  return nearest;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AnnotationLayerProps {
  /** Total SVG/canvas CSS pixel width (including OOB margins). */
  width: number;
  /** Total SVG/canvas CSS pixel height (including OOB margins). */
  height: number;
  /** Inner play-area width in CSS pixels (excluding OOB side margins). Defaults to width. */
  playAreaWidth?: number;
  /** Inner play-area height in CSS pixels (excluding OOB bottom margin). Defaults to height. */
  playAreaHeight?: number;
  /** X offset from SVG left edge to the play area (OOB side margin). Default 0. */
  offsetX?: number;
  /** Y offset from SVG top to the play area (for full court). Default 0. */
  offsetY?: number;
  /** The scene ID currently being edited. */
  sceneId: string | null;
  /** Player positions for snap detection. */
  players: SnapPlayer[];
  /** Whether the court is flipped (basket at top). */
  flipped?: boolean;
  /** When true, renders annotations without any drawing/editing interaction. */
  readOnly?: boolean;
  /**
   * External scene data to use instead of reading from the Zustand store.
   * Intended for read-only viewers (share view) that load a play outside the store.
   */
  sceneOverride?: Scene;
  /**
   * When provided, filter annotations to steps ≤ activeStep.
   * Overrides the default readOnly "show all" behaviour, enabling step-by-step
   * playback in viewers that manage their own step state.
   */
  activeStep?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AnnotationLayer({
  width,
  height,
  playAreaWidth,
  playAreaHeight,
  offsetX = 0,
  offsetY = 0,
  sceneId,
  players,
  flipped = false,
  readOnly = false,
  sceneOverride,
  activeStep: activeStepProp,
}: AnnotationLayerProps) {
  // Inner court dimensions for coordinate conversion
  const paWidth  = playAreaWidth  ?? width;
  const paHeight = playAreaHeight ?? height;
  const selectedTool = useStore((s) => s.selectedTool);
  const selectedTimingStep = useStore((s) => s.selectedTimingStep);
  const selectedAnnotationId = useStore((s) => s.selectedAnnotationId);
  const setSelectedAnnotationId = useStore((s) => s.setSelectedAnnotationId);
  const addAnnotation = useStore((s) => s.addAnnotation);
  const updateAnnotation = useStore((s) => s.updateAnnotation);
  const appendAnnotationLeg = useStore((s) => s.appendAnnotationLeg);
  const isPlaying = useStore((s) => s.isPlaying);
  const currentStep = useStore((s) => s.currentStep);
  const storeScene = useStore(selectEditorScene);

  // When an external scene is provided (share view / read-only viewers that
  // don't load the play into the Zustand store), use it instead of the store.
  const scene = sceneOverride ?? storeScene;

  // Progressive reveal: only show annotations from steps 1..activeStep.
  // - External activeStep prop: explicit control (share view step navigation)
  // - readOnly without activeStep prop: show all (presentation mode)
  // - Otherwise: filter by current editor/playback step
  const storeStep = isPlaying ? currentStep : selectedTimingStep;
  const annotations = (scene?.timingGroups ?? [])
    .filter((g) => {
      if (activeStepProp !== undefined) return g.step <= activeStepProp;
      if (readOnly) return true;
      return g.step <= storeStep;
    })
    .flatMap((g) => g.annotations);

  // Build a map from annotation id → timing step for badge display
  const annotationStepMap = new Map<string, number>();
  if (scene) {
    for (const group of scene.timingGroups) {
      for (const ann of group.annotations) {
        annotationStepMap.set(ann.id, group.step);
      }
    }
  }
  // Show step badges only when there are multiple timing steps
  const showStepBadges = (scene?.timingGroups.length ?? 1) > 1;

  // In-progress stroke state
  const [drawing, setDrawing] = useState<{ from: Point; to: Point } | null>(null);
  const drawingRef = useRef<{ from: Point; to: Point } | null>(null);

  // Leg-extension state: when the user starts drawing from the endpoint of an
  // existing extendable annotation, record the annotation to extend instead of
  // creating a new one. Cleared on mouse-up.
  const legExtensionRef = useRef<{
    annotationId: string;
    /** The timing step the annotation lives in (so we don't need to look it up again). */
    timingStep: number;
  } | null>(null);

  // Control-point dragging state (for bending existing annotations)
  const cpDragRef = useRef<{
    annotationId: string;
    annotation: Annotation;
  } | null>(null);
  const [cpDragging, setCpDragging] = useState(false);

  // To-endpoint dragging state (move/re-attach the arrowhead of a selected annotation)
  const toDragRef = useRef<{
    annotationId: string;
    annotation: Annotation;
  } | null>(null);
  const [toDragging, setToDragging] = useState(false);

  // Snap highlight — player near cursor
  const [snapTarget, setSnapTarget] = useState<SnapPlayer | null>(null);

  // Leg-extension snap highlight — annotation endpoint near cursor (when tool is extendable)
  const [legSnapTarget, setLegSnapTarget] = useState<{ x: number; y: number } | null>(null);

  const isDrawingTool = selectedTool !== "select";

  // Get SVG-local coordinates from a mouse event
  const svgRef = useRef<SVGSVGElement>(null);
  const getSVGCoords = useCallback((e: React.MouseEvent | MouseEvent): Point => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }, []);

  // Handle annotation selection / deselect click on background
  const handleSVGClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (selectedTool === "select") {
        // Deselect if clicking background
        if (e.target === svgRef.current) {
          setSelectedAnnotationId(null);
        }
      }
    },
    [selectedTool, setSelectedAnnotationId],
  );

  // Keyboard Delete/Backspace for annotation removal is handled centrally by
  // EditorKeyboardManager (useKeyboardShortcuts, issue #82). No listener here.

  // For the guard tool we restrict snap-to-player by side:
  //   - mousedown: snap to defense only (the defender is the "from")
  //   - mousemove / mouseup: snap to offense only (the offensive player being guarded)
  const defenseOnly = players.filter((p) => p.side === "defense");
  const offenseOnly = players.filter((p) => p.side === "offense");

  // Mouse down — start drawing
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!isDrawingTool) return;
      e.preventDefault();

      legExtensionRef.current = null;

      const pt = getSVGCoords(e);
      const snapPool = selectedTool === "guard" ? defenseOnly : players;
      const nearest = findNearestPlayer(pt.x, pt.y, snapPool);
      const from: Point = nearest ? { x: nearest.px, y: nearest.py } : pt;

      // Leg-extension detection: check if we're starting near an existing
      // annotation's final endpoint that belongs to the same fromPlayer,
      // and the tool matches the annotation's type.
      if (isExtendable(selectedTool as Annotation["type"]) && scene) {
        for (const group of scene.timingGroups) {
          for (const ann of group.annotations) {
            if (ann.type !== selectedTool) continue;
            if (!isExtendable(ann.type)) continue;
            if (!ann.fromPlayer) continue;
            // Convert the annotation's `to` to SVG pixel space for distance check
            const toSvgX = ann.to.x * paWidth + offsetX;
            const toSvgY = flipped
              ? (1 - ann.to.y) * paHeight + offsetY
              : ann.to.y * paHeight + offsetY;
            const dist = Math.sqrt((pt.x - toSvgX) ** 2 + (pt.y - toSvgY) ** 2);
            if (dist <= SNAP_RADIUS) {
              // Snap the starting point exactly to the annotation's endpoint
              const snapFrom: Point = { x: toSvgX, y: toSvgY };
              const stroke = { from: snapFrom, to: snapFrom };
              setDrawing(stroke);
              drawingRef.current = stroke;
              setSnapTarget(null);
              legExtensionRef.current = { annotationId: ann.id, timingStep: group.step };
              return;
            }
          }
        }
      }

      const stroke = { from, to: from };
      setDrawing(stroke);
      drawingRef.current = stroke;
      setSnapTarget(null);
    },
    [isDrawingTool, selectedTool, getSVGCoords, players, defenseOnly, scene, paWidth, paHeight, offsetX, offsetY, flipped],
  );

  // Mouse move — update preview or drag control point
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const pt = getSVGCoords(e);

      // If dragging a control point, update the annotation
      if (cpDragRef.current && sceneId) {
        const { annotation } = cpDragRef.current;
        const cpNorm = {
          x: (pt.x - offsetX) / paWidth,
          y: flipped ? 1 - (pt.y - offsetY) / paHeight : (pt.y - offsetY) / paHeight,
        };
        const updated = { ...annotation, controlPoints: [cpNorm] };
        // Keep the ref's annotation up-to-date so consecutive moves see the latest CP
        cpDragRef.current.annotation = updated;
        updateAnnotation(sceneId, updated);
        return;
      }

      // If dragging the to-endpoint, update position + player snap
      if (toDragRef.current && sceneId) {
        const { annotation } = toDragRef.current;
        const nearest = findNearestPlayer(pt.x, pt.y, players);
        const snap = nearest ? { x: nearest.px, y: nearest.py } : pt;
        const toNorm = {
          x: (snap.x - offsetX) / paWidth,
          y: flipped ? 1 - (snap.y - offsetY) / paHeight : (snap.y - offsetY) / paHeight,
        };
        const toPlayer = nearest ? { side: nearest.side, position: nearest.position } : null;
        const updated = { ...annotation, to: toNorm, toPlayer };
        toDragRef.current.annotation = updated;
        updateAnnotation(sceneId, updated);
        setSnapTarget(nearest);
        return;
      }

      // While dragging a guard annotation, snap the endpoint to offense only.
      const snapPool =
        selectedTool === "guard" && drawingRef.current
          ? offenseOnly
          : players;
      const nearest = findNearestPlayer(pt.x, pt.y, snapPool);
      setSnapTarget(nearest);

      // Leg-extension hover: highlight annotation endpoints when not already drawing
      if (!drawingRef.current && isExtendable(selectedTool as Annotation["type"]) && scene) {
        let found: { x: number; y: number } | null = null;
        outer: for (const group of scene.timingGroups) {
          for (const ann of group.annotations) {
            if (ann.type !== selectedTool) continue;
            const toSvgX = ann.to.x * paWidth + offsetX;
            const toSvgY = flipped
              ? (1 - ann.to.y) * paHeight + offsetY
              : ann.to.y * paHeight + offsetY;
            const dist = Math.sqrt((pt.x - toSvgX) ** 2 + (pt.y - toSvgY) ** 2);
            if (dist <= SNAP_RADIUS) {
              found = { x: toSvgX, y: toSvgY };
              break outer;
            }
          }
        }
        setLegSnapTarget(found);
      } else {
        setLegSnapTarget(null);
      }

      if (!drawingRef.current) return;
      const to: Point = nearest ? { x: nearest.px, y: nearest.py } : pt;
      const next = { ...drawingRef.current, to };
      drawingRef.current = next;
      setDrawing(next);
    },
    [getSVGCoords, players, offenseOnly, selectedTool, sceneId, updateAnnotation, paWidth, paHeight, offsetX, offsetY, flipped, scene],
  );

  // Mouse up — commit annotation or finish CP drag
  const handleMouseUp = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      // Finish control-point drag
      if (cpDragRef.current) {
        cpDragRef.current = null;
        setCpDragging(false);
        return;
      }

      // Finish to-endpoint drag
      if (toDragRef.current) {
        toDragRef.current = null;
        setToDragging(false);
        setSnapTarget(null);
        return;
      }

      if (!drawingRef.current || !sceneId) {
        setDrawing(null);
        drawingRef.current = null;
        legExtensionRef.current = null;
        return;
      }
      const { from } = drawingRef.current;
      const pt = getSVGCoords(e);
      // Guard: endpoint snaps to offense only
      const toSnapPool = selectedTool === "guard" ? offenseOnly : players;
      const nearest = findNearestPlayer(pt.x, pt.y, toSnapPool);
      const to: Point = nearest ? { x: nearest.px, y: nearest.py } : pt;

      // Ignore tiny strokes (accidental clicks)
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      if (Math.sqrt(dx * dx + dy * dy) > 8) {
        // Convert SVG pixel coords to normalised [0-1] court coords.
        // Accounts for OOB side margins (offsetX) and flip.
        const svgToNorm = (svgX: number, svgY: number) => ({
          x: (svgX - offsetX) / paWidth,
          y: flipped ? 1 - (svgY - offsetY) / paHeight : (svgY - offsetY) / paHeight,
        });

        if (legExtensionRef.current) {
          // Extend an existing annotation with a new leg instead of creating a new one.
          const { annotationId } = legExtensionRef.current;
          const newToNorm = svgToNorm(to.x, to.y);
          const newToPlayer: Annotation["toPlayer"] = nearest
            ? { side: nearest.side, position: nearest.position }
            : null;
          appendAnnotationLeg(sceneId, annotationId, newToNorm, newToPlayer);
          setSelectedAnnotationId(annotationId);
        } else {
          // Guard: from-player must come from defense pool
          const fromSnapPool = selectedTool === "guard" ? defenseOnly : players;
          const fromNearest = findNearestPlayer(from.x, from.y, fromSnapPool);
          const annotation: Annotation = {
            id: crypto.randomUUID(),
            type: selectedTool as Annotation["type"],
            from: svgToNorm(from.x, from.y),
            to:   svgToNorm(to.x,   to.y),
            fromPlayer: fromNearest
              ? { side: fromNearest.side, position: fromNearest.position }
              : null,
            toPlayer: nearest
              ? { side: nearest.side, position: nearest.position }
              : null,
            controlPoints: [],
          };
          addAnnotation(sceneId, selectedTimingStep, annotation);
          setSelectedAnnotationId(annotation.id);
        }
      }

      setDrawing(null);
      drawingRef.current = null;
      legExtensionRef.current = null;
      setSnapTarget(null);
    },
    [
      sceneId,
      selectedTool,
      selectedTimingStep,
      getSVGCoords,
      players,
      offenseOnly,
      defenseOnly,
      addAnnotation,
      appendAnnotationLeg,
      setSelectedAnnotationId,
      paWidth,
      paHeight,
      offsetX,
      offsetY,
      flipped,
    ],
  );

  // Mouse down on a control-point drag handle
  const handleCpMouseDown = useCallback(
    (e: React.MouseEvent, ann: Annotation) => {
      e.stopPropagation();
      e.preventDefault();
      if (!sceneId) return;
      // Push undo snapshot before the drag begins
      const state = useStore.getState();
      const { currentPlay, selectedSceneId: sid } = state;
      if (currentPlay) {
        useHistoryStore.getState().pushSnapshot({
          play: JSON.parse(JSON.stringify(currentPlay)) as typeof currentPlay,
          selectedSceneId: sid,
        });
      }
      cpDragRef.current = { annotationId: ann.id, annotation: ann };
      setCpDragging(true);
    },
    [sceneId],
  );

  // Mouse down on the to-endpoint drag handle
  const handleToMouseDown = useCallback(
    (e: React.MouseEvent, ann: Annotation) => {
      e.stopPropagation();
      e.preventDefault();
      if (!sceneId) return;
      const state = useStore.getState();
      const { currentPlay, selectedSceneId: sid } = state;
      if (currentPlay) {
        useHistoryStore.getState().pushSnapshot({
          play: JSON.parse(JSON.stringify(currentPlay)) as typeof currentPlay,
          selectedSceneId: sid,
        });
      }
      toDragRef.current = { annotationId: ann.id, annotation: ann };
      setToDragging(true);
    },
    [sceneId],
  );

  const handleAnnotationSelect = useCallback(
    (id: string) => {
      setSelectedAnnotationId(id);
    },
    [setSelectedAnnotationId],
  );

  const cursor = (cpDragging || toDragging) ? "grabbing" : TOOL_CURSOR[selectedTool];

  // Find the selected annotation for control-point handle rendering
  const selectedAnnotation = selectedAnnotationId
    ? annotations.find((a) => a.id === selectedAnnotationId) ?? null
    : null;

  // Compute SVG-pixel coords for the selected annotation's control point handle.
  // The handle is shown only in "select" mode and only when the screen is not animating.
  const showCpHandle = !isPlaying && selectedTool === "select" && selectedAnnotation !== null;

  const normToSvgForHandle = (nx: number, ny: number) => ({
    x: nx * paWidth + offsetX,
    y: flipped ? (1 - ny) * paHeight + offsetY : ny * paHeight + offsetY,
  });

  let cpHandlePx: Point | null = null;
  if (showCpHandle && selectedAnnotation) {
    const annFrom = normToSvgForHandle(selectedAnnotation.from.x, selectedAnnotation.from.y);
    const annTo   = normToSvgForHandle(selectedAnnotation.to.x,   selectedAnnotation.to.y);
    if (selectedAnnotation.controlPoints.length > 0) {
      const cpNorm = selectedAnnotation.controlPoints[0];
      cpHandlePx = normToSvgForHandle(cpNorm.x, cpNorm.y);
    } else {
      // Default handle position: midpoint of the straight line (user hasn't curved it yet)
      cpHandlePx = defaultControlPoint(annFrom, annTo);
    }
  }

  // To-endpoint drag handle (arrowhead position — drag to move/re-attach the endpoint)
  const toHandlePx: Point | null = showCpHandle && selectedAnnotation
    ? normToSvgForHandle(selectedAnnotation.to.x, selectedAnnotation.to.y)
    : null;

  return (
    <svg
      ref={svgRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width,
        height,
        overflow: "visible",
        cursor: readOnly ? "default" : cursor,
        // Capture events when drawing, when dragging a control point, or when
        // in select mode with an annotation selected (so the CP handle is clickable).
        pointerEvents: readOnly ? "none" : (isDrawingTool || cpDragging || toDragging || showCpHandle) ? "all" : "none",
      }}
      viewBox={`0 0 ${width} ${height}`}
      aria-label="Annotation drawing layer"
      onMouseDown={readOnly ? undefined : handleMouseDown}
      onMouseMove={readOnly ? undefined : handleMouseMove}
      onMouseUp={readOnly ? undefined : handleMouseUp}
      onClick={readOnly ? undefined : handleSVGClick}
    >
      {/* Existing annotations */}
      {annotations.map((ann) => (
        <RenderedAnnotation
          key={ann.id}
          ann={ann}
          selected={selectedAnnotationId === ann.id}
          onSelect={handleAnnotationSelect}
          step={annotationStepMap.get(ann.id)}
          showStepBadge={showStepBadges}
          width={paWidth}
          height={paHeight}
          offsetX={offsetX}
          offsetY={offsetY}
          flipped={flipped}
        />
      ))}

      {/* Control-point drag handle for selected annotation */}
      {showCpHandle && cpHandlePx && selectedAnnotation && (
        <g>
          {/* Dotted guide line from annotation midpoint area to the handle */}
          {selectedAnnotation.controlPoints.length > 0 && (() => {
            const annFrom = normToSvgForHandle(selectedAnnotation.from.x, selectedAnnotation.from.y);
            const annTo   = normToSvgForHandle(selectedAnnotation.to.x,   selectedAnnotation.to.y);
            const mid = defaultControlPoint(annFrom, annTo);
            return (
              <line
                x1={mid.x} y1={mid.y}
                x2={cpHandlePx!.x} y2={cpHandlePx!.y}
                stroke="#3B82F6"
                strokeWidth={1}
                strokeDasharray="3 3"
                pointerEvents="none"
                opacity={0.5}
              />
            );
          })()}
          {/* Outer ring */}
          <circle
            cx={cpHandlePx.x}
            cy={cpHandlePx.y}
            r={10}
            fill="white"
            stroke="#3B82F6"
            strokeWidth={1.5}
            style={{ cursor: "grab", pointerEvents: "all" }}
            onMouseDown={(e) => handleCpMouseDown(e, selectedAnnotation)}
          />
          {/* Inner dot */}
          <circle
            cx={cpHandlePx.x}
            cy={cpHandlePx.y}
            r={4}
            fill="#3B82F6"
            pointerEvents="none"
          />
        </g>
      )}

      {/* To-endpoint drag handle — drag the arrowhead to move/re-attach the endpoint */}
      {toHandlePx && selectedAnnotation && (
        <circle
          cx={toHandlePx.x}
          cy={toHandlePx.y}
          r={8}
          fill="white"
          stroke="#6B7280"
          strokeWidth={1.5}
          style={{ cursor: "grab", pointerEvents: "all" }}
          onMouseDown={(e) => handleToMouseDown(e, selectedAnnotation)}
        />
      )}

      {/* Snap target ring */}
      {snapTarget && (
        <circle
          cx={snapTarget.px}
          cy={snapTarget.py}
          r={SNAP_RING_RADIUS}
          fill="none"
          stroke="#3B82F6"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          pointerEvents="none"
          opacity={0.7}
        />
      )}

      {/* Leg-extension snap ring — shown when hovering over an annotation endpoint
          to indicate a new leg can be drawn from this point */}
      {legSnapTarget && isDrawingTool && !drawing && (
        <g pointerEvents="none">
          <circle
            cx={legSnapTarget.x}
            cy={legSnapTarget.y}
            r={SNAP_RING_RADIUS}
            fill="none"
            stroke="#F97316"
            strokeWidth={2}
            strokeDasharray="4 3"
            opacity={0.85}
          />
          {/* Small "+" indicator */}
          <line x1={legSnapTarget.x - 5} y1={legSnapTarget.y} x2={legSnapTarget.x + 5} y2={legSnapTarget.y} stroke="#F97316" strokeWidth={2} strokeLinecap="round" />
          <line x1={legSnapTarget.x} y1={legSnapTarget.y - 5} x2={legSnapTarget.x} y2={legSnapTarget.y + 5} stroke="#F97316" strokeWidth={2} strokeLinecap="round" />
        </g>
      )}

      {/* In-progress preview */}
      {drawing && (
        <PreviewAnnotation
          tool={selectedTool}
          from={drawing.from}
          to={drawing.to}
        />
      )}
    </svg>
  );
}
