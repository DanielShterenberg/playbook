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
import { useStore, selectEditorScene, selectAllAnnotations } from "@/lib/store";
import type { DrawingTool } from "@/lib/store";
import type { Annotation, Point } from "@/lib/types";
import { TOOL_CURSOR } from "@/components/editor/DrawingToolsPanel";

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

interface RenderedAnnotationProps {
  ann: Annotation;
  selected: boolean;
  onSelect: (id: string) => void;
  /** The timing step this annotation belongs to (for the badge). */
  step?: number;
  /** Whether to show the step badge. */
  showStepBadge?: boolean;
  /** Court canvas pixel dimensions — used to convert stored normalized coords to pixels. */
  width: number;
  height: number;
}

function RenderedAnnotation({ ann, selected, onSelect, step, showStepBadge, width, height }: RenderedAnnotationProps) {
  const { type } = ann;
  // Annotations are stored in normalised [0-1] coords. Convert to CSS pixels for rendering.
  const from = { x: ann.from.x * width, y: ann.from.y * height };
  const to   = { x: ann.to.x   * width, y: ann.to.y   * height };
  const hitStyle: React.CSSProperties = { cursor: "pointer", pointerEvents: "stroke" };

  // Step badge — small circle at the midpoint of the annotation
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
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

  const headPoints = arrowHead(to.x, to.y, from.x, from.y);
  const selectRing = selected ? (
    <rect
      x={Math.min(from.x, to.x) - 6}
      y={Math.min(from.y, to.y) - 6}
      width={Math.abs(to.x - from.x) + 12}
      height={Math.abs(to.y - from.y) + 12}
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
    return (
      <g onClick={handleClick} style={hitStyle}>
        {selectRing}
        {/* Invisible wide hit-area */}
        <line
          x1={from.x} y1={from.y} x2={to.x} y2={to.y}
          stroke="transparent" strokeWidth={14}
        />
        <line
          x1={from.x} y1={from.y} x2={to.x} y2={to.y}
          stroke="#1E3A5F"
          strokeWidth={2.5}
          strokeLinecap="round"
        />
        {headPoints && (
          <polygon points={headPoints} fill="#1E3A5F" />
        )}
        {stepBadge}
      </g>
    );
  }

  if (type === "dribble") {
    // Build zigzag path
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const zigCount = Math.max(2, Math.round(len / 18));
    const pts: string[] = [];
    for (let i = 0; i <= zigCount; i++) {
      const t = i / zigCount;
      const mx = from.x + dx * t;
      const my = from.y + dy * t;
      // Perpendicular offset alternates
      const perp = i % 2 === 0 ? 6 : -6;
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
    // Straight line with solid triangle tip — rendered slightly thinner / different colour
    return (
      <g onClick={handleClick} style={hitStyle}>
        {selectRing}
        <line
          x1={from.x} y1={from.y} x2={to.x} y2={to.y}
          stroke="transparent" strokeWidth={14}
        />
        <line
          x1={from.x} y1={from.y} x2={to.x} y2={to.y}
          stroke="#059669"
          strokeWidth={2}
          strokeLinecap="round"
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
    return (
      <g onClick={handleClick} style={hitStyle}>
        {selectRing}
        <line
          x1={from.x} y1={from.y} x2={to.x} y2={to.y}
          stroke="transparent" strokeWidth={14}
        />
        <line
          x1={from.x} y1={from.y} x2={to.x} y2={to.y}
          stroke="#DC2626"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeDasharray="7 5"
        />
        {headPoints && <polygon points={headPoints} fill="#DC2626" />}
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
  /** CSS pixel width of the court canvas. */
  width: number;
  /** CSS pixel height of the court canvas. */
  height: number;
  /** The scene ID currently being edited. */
  sceneId: string | null;
  /** Player positions for snap detection. */
  players: SnapPlayer[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AnnotationLayer({
  width,
  height,
  sceneId,
  players,
}: AnnotationLayerProps) {
  const selectedTool = useStore((s) => s.selectedTool);
  const selectedTimingStep = useStore((s) => s.selectedTimingStep);
  const selectedAnnotationId = useStore((s) => s.selectedAnnotationId);
  const setSelectedAnnotationId = useStore((s) => s.setSelectedAnnotationId);
  const addAnnotation = useStore((s) => s.addAnnotation);
  const removeAnnotation = useStore((s) => s.removeAnnotation);
  const isPlaying = useStore((s) => s.isPlaying);
  const currentStep = useStore((s) => s.currentStep);
  const scene = useStore(selectEditorScene);

  // During playback: progressive reveal — show only annotations from steps 1..currentStep.
  // While editing: show all annotations (with step badges when there are multiple steps).
  const annotations = isPlaying
    ? (scene?.timingGroups ?? [])
        .filter((g) => g.step <= currentStep)
        .flatMap((g) => g.annotations)
    : selectAllAnnotations(scene);

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

  // Snap highlight — player near cursor
  const [snapTarget, setSnapTarget] = useState<SnapPlayer | null>(null);

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

  // Handle annotation selection / eraser click on background
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

  // Mouse down — start drawing
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!isDrawingTool || selectedTool === "eraser") return;
      e.preventDefault();
      const pt = getSVGCoords(e);
      const nearest = findNearestPlayer(pt.x, pt.y, players);
      const from: Point = nearest ? { x: nearest.px, y: nearest.py } : pt;
      const stroke = { from, to: from };
      setDrawing(stroke);
      drawingRef.current = stroke;
      setSnapTarget(null);
    },
    [isDrawingTool, selectedTool, getSVGCoords, players],
  );

  // Mouse move — update preview
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const pt = getSVGCoords(e);
      const nearest = findNearestPlayer(pt.x, pt.y, players);
      setSnapTarget(nearest);

      if (!drawingRef.current) return;
      const to: Point = nearest ? { x: nearest.px, y: nearest.py } : pt;
      const next = { ...drawingRef.current, to };
      drawingRef.current = next;
      setDrawing(next);
    },
    [getSVGCoords, players],
  );

  // Mouse up — commit annotation
  const handleMouseUp = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!drawingRef.current || !sceneId) {
        setDrawing(null);
        drawingRef.current = null;
        return;
      }
      const { from } = drawingRef.current;
      const pt = getSVGCoords(e);
      const nearest = findNearestPlayer(pt.x, pt.y, players);
      const to: Point = nearest ? { x: nearest.px, y: nearest.py } : pt;

      // Ignore tiny strokes (accidental clicks)
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      if (Math.sqrt(dx * dx + dy * dy) > 8) {
        const fromNearest = findNearestPlayer(from.x, from.y, players);
        const annotation: Annotation = {
          id: crypto.randomUUID(),
          type: selectedTool as Annotation["type"],
          // Store in normalised [0-1] coords so the store is resolution-independent
          // and addScene can use annotation endpoints directly as player positions.
          from: { x: from.x / width, y: from.y / height },
          to:   { x: to.x   / width, y: to.y   / height },
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

      setDrawing(null);
      drawingRef.current = null;
      setSnapTarget(null);
    },
    [
      sceneId,
      selectedTool,
      selectedTimingStep,
      getSVGCoords,
      players,
      addAnnotation,
      setSelectedAnnotationId,
      width,
      height,
    ],
  );

  // Handle eraser click on annotation
  const handleAnnotationSelect = useCallback(
    (id: string) => {
      if (selectedTool === "eraser") {
        if (sceneId) removeAnnotation(sceneId, id);
      } else {
        setSelectedAnnotationId(id);
      }
    },
    [selectedTool, sceneId, removeAnnotation, setSelectedAnnotationId],
  );

  const cursor = TOOL_CURSOR[selectedTool];

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
        cursor,
        // Only capture events when a drawing tool is active
        pointerEvents: isDrawingTool ? "all" : "none",
      }}
      viewBox={`0 0 ${width} ${height}`}
      aria-label="Annotation drawing layer"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onClick={handleSVGClick}
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
          width={width}
          height={height}
        />
      ))}

      {/* Snap target ring */}
      {snapTarget && isDrawingTool && (
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
