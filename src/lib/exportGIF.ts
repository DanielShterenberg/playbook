"use client";

/**
 * GIF export utility — renders the full play animation as an animated GIF.
 *
 * NOTE: GIF export is currently disabled in the UI (ExportMenu.tsx uses
 * exportVideo.ts instead). This file is preserved so GIF export can be
 * re-enabled without re-implementing the rendering pipeline — just swap
 * the import in ExportMenu back to exportPlayAsGIF / GifResolution.
 *
 *
 * Implements issue #77: GIF export of play animation.
 *
 * Approach:
 *   1. For each scene in the play, for each timing step within that scene,
 *      render one (or more) canvas frames.
 *   2. Each frame shows the court + player positions + all annotations that
 *      are visible at that point in the animation (cumulative reveal).
 *   3. Encode the frames into an animated GIF using the `gifenc` library
 *      (pure-JS, no workers needed, great for flat vector graphics).
 *   4. Optionally render a brief "hold" frame between scenes to give the
 *      viewer a moment to read the diagram before the next scene starts.
 *   5. Trigger a browser download of the resulting GIF blob.
 *
 * Frame timing:
 *   - Each step frame duration = timingGroup.duration / speedMultiplier.
 *   - A hold frame of SCENE_HOLD_MS is inserted between scenes.
 *   - At the last scene, a longer FINAL_HOLD_MS hold closes the animation.
 *
 * Resolution:
 *   - SD: 480 px wide  (suitable for messaging apps, keeps file size small)
 *   - HD: 800 px wide  (sharper, larger file)
 *
 * Color depth:
 *   - GIF supports a maximum of 256 colors. We quantize to 128 colors which
 *     balances quality and file size for this flat-color illustration style.
 *
 * Progress callback:
 *   - `onProgress(fraction)` is called after each frame is encoded so the UI
 *     can display a progress bar (fraction in [0, 1]).
 */

import { GIFEncoder, quantize, applyPalette } from "gifenc";
import type { Play, Scene, Annotation } from "./types";
import type { PlayerDisplayMode } from "./store";
import { computeCourtLayout, normToCanvasPx } from "@/lib/courtLayout";
import type { CourtLayout, CourtVariant } from "@/lib/courtLayout";
import { paintCourt } from "@/lib/courtRendering";
import { computeTokenSizes, playerScale, ballScale } from "@/lib/tokenSizing";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Brief pause between scenes (ms). */
export const SCENE_HOLD_MS = 400;

/** Longer pause at the very end of the animation before it loops (ms). */
export const FINAL_HOLD_MS = 1200;

/** Maximum GIF palette size (256 is the GIF spec limit). */
const MAX_COLORS = 128;

// ---------------------------------------------------------------------------
// Player drawing
// ---------------------------------------------------------------------------

const COLOR_OFFENSE_FILL = "#E07B39";
const COLOR_OFFENSE_STROKE = "#FFFFFF";
const COLOR_DEFENSE_FILL = "#FFFFFF";
const COLOR_DEFENSE_STROKE = "#1E3A5F";
const COLOR_TEXT_OFFENSE = "#FFFFFF";

const OFFENSE_ABBRS: Record<number, string> = { 1: "PG", 2: "SG", 3: "SF", 4: "PF", 5: "C" };

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  side: "offense" | "defense",
  position: number,
  px: number,
  py: number,
  r: number,
  displayMode: PlayerDisplayMode = "numbers",
  playerNames: Record<string, string> = {},
  offenseColor?: string,
  defenseColor?: string,
): void {
  const isOffense = side === "offense";
  // Scale all size-based values proportionally to the token radius.
  const s = playerScale(r);

  const offenseFill   = offenseColor ?? COLOR_OFFENSE_FILL;
  const defenseStroke = defenseColor ?? COLOR_DEFENSE_STROKE;

  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.arc(px + s, py + 2 * s, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(px, py, r, 0, Math.PI * 2);
  ctx.fillStyle = isOffense ? offenseFill : COLOR_DEFENSE_FILL;
  ctx.fill();
  ctx.strokeStyle = isOffense ? COLOR_OFFENSE_STROKE : defenseStroke;
  ctx.lineWidth = (isOffense ? 2 : 2.5) * s;
  ctx.stroke();

  if (!isOffense) {
    const xSize = 7 * s;
    ctx.strokeStyle = defenseStroke;
    ctx.lineWidth = 2.5 * s;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(px - xSize, py - xSize);
    ctx.lineTo(px + xSize, py + xSize);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(px + xSize, py - xSize);
    ctx.lineTo(px - xSize, py + xSize);
    ctx.stroke();
  }

  let label: string;
  if (displayMode === "names") {
    const key = `${side}-${position}`;
    label = playerNames[key] ?? (isOffense ? String(position) : `X${position}`);
  } else if (displayMode === "abbreviations") {
    label = OFFENSE_ABBRS[position] ?? String(position);
  } else {
    // "numbers"
    label = isOffense ? String(position) : `X${position}`;
  }
  const baseFontSize = isOffense ? 11 : 9;
  const fontSize =
    (label.length > 2
      ? Math.max(6, baseFontSize - (label.length - 2) * 1.5)
      : baseFontSize) * s;

  ctx.fillStyle = isOffense ? COLOR_TEXT_OFFENSE : defenseStroke;
  ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const dyOffset = isOffense ? 0 : -9 * s;
  ctx.fillText(label, px, py + dyOffset);
}

// ---------------------------------------------------------------------------
// Ball drawing
// ---------------------------------------------------------------------------

const COLOR_BALL = "#E05C00";
const COLOR_BALL_HIGHLIGHT = "#F47B2A";
const COLOR_SEAM = "#FFFFFF";

function drawBall(ctx: CanvasRenderingContext2D, px: number, py: number, r: number): void {
  const s = ballScale(r);

  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.arc(px + s, py + 2 * s, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(px, py, r, 0, Math.PI * 2);
  ctx.fillStyle = COLOR_BALL;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(px - r * 0.5, py - r * 0.6);
  ctx.arc(px, py, r * 0.7, Math.PI + 0.6, Math.PI * 2 - 0.4, false);
  ctx.strokeStyle = COLOR_BALL_HIGHLIGHT;
  ctx.lineWidth = 1.5 * s;
  ctx.lineCap = "round";
  ctx.globalAlpha = 0.5;
  ctx.stroke();
  ctx.globalAlpha = 1;

  const vPath = new Path2D(
    `M ${px} ${py - r} C ${px + r * 0.55} ${py - r * 0.5} ${px + r * 0.55} ${py + r * 0.5} ${px} ${py + r}`,
  );
  ctx.strokeStyle = COLOR_SEAM;
  ctx.lineWidth = 1.2 * s;
  ctx.lineCap = "round";
  ctx.stroke(vPath);

  const hPath = new Path2D(
    `M ${px - r} ${py} C ${px - r * 0.5} ${py + r * 0.4} ${px + r * 0.5} ${py + r * 0.4} ${px + r} ${py}`,
  );
  ctx.stroke(hPath);
}

// ---------------------------------------------------------------------------
// Annotation drawing
// ---------------------------------------------------------------------------

function arrowHeadPoints(
  x2: number,
  y2: number,
  x1: number,
  y1: number,
  size: number,
): [number, number][] | null {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return null;
  const ux = dx / len;
  const uy = dy / len;
  const perpX = -uy;
  const perpY = ux;
  const w = size * 0.45;
  return [
    [x2, y2],
    [x2 - ux * size + perpX * w, y2 - uy * size + perpY * w],
    [x2 - ux * size - perpX * w, y2 - uy * size - perpY * w],
  ];
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  size: number,
  color: string,
): void {
  const pts = arrowHeadPoints(x2, y2, x1, y1, size);
  if (!pts) return;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  ctx.lineTo(pts[1][0], pts[1][1]);
  ctx.lineTo(pts[2][0], pts[2][1]);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

// Stroke a quadratic bezier (or straight line if no control point).
function strokeBezier(
  ctx: CanvasRenderingContext2D,
  fx: number, fy: number, tx: number, ty: number,
  cpx?: number, cpy?: number,
): void {
  ctx.beginPath();
  ctx.moveTo(fx, fy);
  if (cpx !== undefined && cpy !== undefined) {
    ctx.quadraticCurveTo(cpx, cpy, tx, ty);
  } else {
    ctx.lineTo(tx, ty);
  }
  ctx.stroke();
}

// Arrowhead at (tx,ty); for bezier the tail direction comes from the control point.
function arrowAtEnd(
  ctx: CanvasRenderingContext2D,
  fx: number, fy: number, tx: number, ty: number,
  arrowSize: number, color: string,
  cpx?: number, cpy?: number,
): void {
  const tailX = cpx !== undefined ? cpx : fx;
  const tailY = cpy !== undefined ? cpy : fy;
  drawArrowHead(ctx, tailX, tailY, tx, ty, arrowSize, color);
}

function strokePolyline(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[]): void {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
}

/**
 * Scale factor for annotation stroke widths, dash patterns and arrowheads.
 * SD (480 px total canvas width) is the baseline. The single expression used
 * by every raster export (GIF, MP4, PNG).
 */
export function annotationScale(totalWidth: number): number {
  return totalWidth / 480;
}

function drawAnnotation(
  ctx: CanvasRenderingContext2D,
  ann: Annotation,
  layout: CourtLayout,
  flipped: boolean,
): void {
  const { from, to, type } = ann;
  const scale = annotationScale(layout.totalWidth);
  // Normalised [0-1] coords → canvas pixels: the shared mapping, nothing else.
  const pt = (p: { x: number; y: number }) => normToCanvasPx(p.x, p.y, layout, flipped);
  const { x: fx, y: fy } = pt(from);
  const { x: tx, y: ty } = pt(to);

  // Bezier control point
  const hasWaypoints = ann.waypoints && ann.waypoints.length > 0;
  let cpx: number | undefined;
  let cpy: number | undefined;
  if (!hasWaypoints && ann.controlPoints.length > 0) {
    ({ x: cpx, y: cpy } = pt(ann.controlPoints[0]));
  }

  // Multi-leg waypoints
  const allPts = hasWaypoints
    ? [{ x: fx, y: fy }, ...(ann.waypoints ?? []).map(pt), { x: tx, y: ty }]
    : [];

  const arrowSize = 12 * scale;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash([]);

  if (type === "movement") {
    ctx.strokeStyle = "#1E3A5F";
    ctx.fillStyle = "#1E3A5F";
    ctx.lineWidth = 2.5 * scale;
    if (hasWaypoints) {
      strokePolyline(ctx, allPts);
      const n = allPts.length;
      drawArrowHead(ctx, allPts[n - 2].x, allPts[n - 2].y, allPts[n - 1].x, allPts[n - 1].y, arrowSize, "#1E3A5F");
    } else {
      strokeBezier(ctx, fx, fy, tx, ty, cpx, cpy);
      arrowAtEnd(ctx, fx, fy, tx, ty, arrowSize, "#1E3A5F", cpx, cpy);
    }
    return;
  }

  if (type === "dribble") {
    ctx.strokeStyle = "#1E3A5F";
    ctx.fillStyle = "#1E3A5F";
    ctx.lineWidth = 2.5 * scale;
    if (hasWaypoints || cpx !== undefined) {
      // Curved/multi-leg dribble: dashed bezier or polyline
      ctx.setLineDash([6 * scale, 4 * scale]);
      if (hasWaypoints) strokePolyline(ctx, allPts);
      else strokeBezier(ctx, fx, fy, tx, ty, cpx, cpy);
      ctx.setLineDash([]);
      if (hasWaypoints) {
        const n = allPts.length;
        drawArrowHead(ctx, allPts[n - 2].x, allPts[n - 2].y, allPts[n - 1].x, allPts[n - 1].y, arrowSize, "#1E3A5F");
      } else {
        arrowAtEnd(ctx, fx, fy, tx, ty, arrowSize, "#1E3A5F", cpx, cpy);
      }
    } else {
      // Straight zigzag
      const dx = tx - fx;
      const dy = ty - fy;
      const len = Math.sqrt(dx * dx + dy * dy);
      const zigCount = Math.max(2, Math.round(len / (18 * scale)));
      ctx.beginPath();
      for (let i = 0; i <= zigCount; i++) {
        const t = i / zigCount;
        const mx = fx + dx * t;
        const my = fy + dy * t;
        const perp = i % 2 === 0 ? 6 * scale : -6 * scale;
        const px2 = len > 0 ? (-dy / len) * perp : 0;
        const py2 = len > 0 ? (dx / len) * perp : 0;
        if (i === 0) ctx.moveTo(mx + px2, my + py2);
        else if (i === zigCount) ctx.lineTo(tx, ty);
        else ctx.lineTo(mx + px2, my + py2);
      }
      ctx.stroke();
      drawArrowHead(ctx, fx, fy, tx, ty, arrowSize, "#1E3A5F");
    }
    return;
  }

  if (type === "pass") {
    ctx.strokeStyle = "#059669";
    ctx.fillStyle = "#059669";
    ctx.lineWidth = 2 * scale;
    ctx.setLineDash([6 * scale, 4 * scale]);
    if (hasWaypoints) {
      strokePolyline(ctx, allPts);
      ctx.setLineDash([]);
      const n = allPts.length;
      drawArrowHead(ctx, allPts[n - 2].x, allPts[n - 2].y, allPts[n - 1].x, allPts[n - 1].y, arrowSize, "#059669");
    } else {
      strokeBezier(ctx, fx, fy, tx, ty, cpx, cpy);
      ctx.setLineDash([]);
      arrowAtEnd(ctx, fx, fy, tx, ty, arrowSize, "#059669", cpx, cpy);
    }
    return;
  }

  if (type === "screen") {
    const dx = tx - fx;
    const dy = ty - fy;
    const len = Math.sqrt(dx * dx + dy * dy);
    const perpX = len > 0 ? (-dy / len) * 10 * scale : 0;
    const perpY = len > 0 ? (dx / len) * 10 * scale : 0;
    ctx.strokeStyle = "#7C3AED";
    ctx.lineWidth = 2.5 * scale;
    ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tx + perpX, ty + perpY);
    ctx.lineTo(tx - perpX, ty - perpY);
    ctx.lineWidth = 3 * scale;
    ctx.stroke();
    return;
  }

  if (type === "cut") {
    ctx.strokeStyle = "#DC2626";
    ctx.fillStyle = "#DC2626";
    ctx.lineWidth = 2.5 * scale;
    ctx.setLineDash([7 * scale, 5 * scale]);
    if (hasWaypoints) {
      strokePolyline(ctx, allPts);
      ctx.setLineDash([]);
      const n = allPts.length;
      drawArrowHead(ctx, allPts[n - 2].x, allPts[n - 2].y, allPts[n - 1].x, allPts[n - 1].y, arrowSize, "#DC2626");
    } else {
      strokeBezier(ctx, fx, fy, tx, ty, cpx, cpy);
      ctx.setLineDash([]);
      arrowAtEnd(ctx, fx, fy, tx, ty, arrowSize, "#DC2626", cpx, cpy);
    }
    return;
  }

  if (type === "guard") {
    ctx.strokeStyle = "#D97706";
    ctx.lineWidth = 2 * scale;
    ctx.setLineDash([6 * scale, 6 * scale]);
    strokeBezier(ctx, fx, fy, tx, ty, cpx, cpy);
    ctx.setLineDash([]);
    return;
  }

  if (type === "handoff") {
    ctx.strokeStyle = "#0369A1";
    ctx.fillStyle = "#0369A1";
    ctx.lineWidth = 2.5 * scale;
    ctx.setLineDash([6 * scale, 4 * scale]);
    strokeBezier(ctx, fx, fy, tx, ty, cpx, cpy);
    ctx.setLineDash([]);

    // Two perpendicular tick marks near the tip
    const t1 = 0.82, t2 = 0.68;
    const getPoint = (t: number) => {
      if (cpx !== undefined && cpy !== undefined) {
        const mt = 1 - t;
        return { x: mt * mt * fx + 2 * mt * t * cpx + t * t * tx, y: mt * mt * fy + 2 * mt * t * cpy + t * t * ty };
      }
      return { x: fx + (tx - fx) * t, y: fy + (ty - fy) * t };
    };
    const p1 = getPoint(t1), p2 = getPoint(t2);
    const p1b = getPoint(t1 - 0.04), p2b = getPoint(t2 - 0.04);
    const tickLen = 8 * scale;
    for (const [p, pb] of [[p1, p1b], [p2, p2b]] as const) {
      const ddx = p.x - pb.x, ddy = p.y - pb.y;
      const dlen = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
      const perpX = -ddy / dlen * tickLen, perpY = ddx / dlen * tickLen;
      ctx.beginPath();
      ctx.moveTo(p.x + perpX, p.y + perpY);
      ctx.lineTo(p.x - perpX, p.y - perpY);
      ctx.stroke();
    }
    arrowAtEnd(ctx, fx, fy, tx, ty, arrowSize, "#0369A1", cpx, cpy);
    return;
  }

  ctx.setLineDash([]);
}

// ---------------------------------------------------------------------------
// Frame rendering (exported so exportVideo.ts and exportPNG.ts reuse the same pipeline)
// ---------------------------------------------------------------------------

/**
 * Draw one complete frame — court, annotations, players, ball — on any 2D
 * context. Pure: no DOM lookups, no canvas sizing.
 *
 * This is the single frame painter of the export pipeline: GIF and MP4 call it
 * through renderFrame, PNG calls it after ctx.scale(resolution). It follows
 * the shared recipe exactly, so the output matches the editor:
 *   court      → paintCourt(ctx, layout, { flipped })
 *   positions  → normToCanvasPx(x, y, layout, flipped)
 *   token size → computeTokenSizes(layout.innerW)
 *
 * Coordinates are in the units of `layout` (logical px). The caller owns
 * canvas sizing and any resolution scaling.
 */
export function renderSceneToCtx(
  ctx: CanvasRenderingContext2D,
  layout: CourtLayout,
  scene: Scene,
  visibleAnnotations: Annotation[],
  flipped = false,
  displayMode: PlayerDisplayMode = "numbers",
  playerNames: Record<string, string> = {},
  offenseColor?: string,
  defenseColor?: string,
): void {
  const { playerR, ballR, ballAttachOffsetY } = computeTokenSizes(layout.innerW);
  const pos = (p: { x: number; y: number }) => normToCanvasPx(p.x, p.y, layout, flipped);

  // Court floor (incl. OOB margins) + markings
  paintCourt(ctx, layout, { flipped });

  ctx.save();

  // Draw movement/cut/dribble/pass/guard/handoff annotations below players
  const BELOW_PLAYER_TYPES = new Set(["movement", "cut", "dribble", "pass", "guard", "handoff"]);
  for (const ann of visibleAnnotations) {
    if (BELOW_PLAYER_TYPES.has(ann.type)) {
      drawAnnotation(ctx, ann, layout, flipped);
    }
  }

  // Defense
  for (const p of scene.players.defense) {
    if (p.visible) {
      const { x, y } = pos(p);
      drawPlayer(ctx, "defense", p.position, x, y, playerR, displayMode, playerNames, offenseColor, defenseColor);
    }
  }

  // Offense
  for (const p of scene.players.offense) {
    if (p.visible) {
      const { x, y } = pos(p);
      drawPlayer(ctx, "offense", p.position, x, y, playerR, displayMode, playerNames, offenseColor, defenseColor);
    }
  }

  // Ball
  const ball = scene.ball;
  let ballPx = pos(ball);
  if (ball.attachedTo) {
    const pool =
      ball.attachedTo.side === "offense" ? scene.players.offense : scene.players.defense;
    const holder = pool.find((p) => p.position === ball.attachedTo!.position);
    if (holder) {
      // Screen space: the ball always sits above its holder, flipped or not —
      // exactly as in the editor.
      const h = pos(holder);
      ballPx = { x: h.x, y: h.y + ballAttachOffsetY };
    }
  }
  drawBall(ctx, ballPx.x, ballPx.y, ballR);

  // Draw screen annotations on top of players so the perpendicular bar is visible
  for (const ann of visibleAnnotations) {
    if (!BELOW_PLAYER_TYPES.has(ann.type)) {
      drawAnnotation(ctx, ann, layout, flipped);
    }
  }

  ctx.restore();
}

/**
 * Render a single animation frame onto the given canvas.
 *
 * @param canvas    Destination canvas (already sized to width × layout.totalHeight).
 * @param scene     Scene data (player positions, ball, timing groups).
 * @param visibleAnnotations  Annotations to draw on this frame (cumulative subset).
 * @param width     Canvas width in px (total, including OOB side margins).
 * @param height    Canvas height in px (unused — derived from the layout).
 * @param variant   Court variant; the canvas must be computeCourtLayout(width, variant).totalHeight tall.
 */
export function renderFrame(
  canvas: HTMLCanvasElement,
  scene: Scene,
  visibleAnnotations: Annotation[],
  width: number,
  height: number,
  flipped = false,
  displayMode: PlayerDisplayMode = "numbers",
  playerNames: Record<string, string> = {},
  offenseColor?: string,
  defenseColor?: string,
  variant: CourtVariant = "half",
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  renderSceneToCtx(
    ctx,
    computeCourtLayout(width, variant),
    scene,
    visibleAnnotations,
    flipped,
    displayMode,
    playerNames,
    offenseColor,
    defenseColor,
  );
}

// ---------------------------------------------------------------------------
// GIF frame encoding helper
// ---------------------------------------------------------------------------

/**
 * Extract RGBA pixel data from a canvas and encode one GIF frame.
 */
function encodeFrame(
  encoder: ReturnType<typeof GIFEncoder>,
  canvas: HTMLCanvasElement,
  delayMs: number,
  isFirst: boolean,
): void {
  const ctx = canvas.getContext("2d")!;
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const rgba = new Uint8Array(imageData.data.buffer);

  const palette = quantize(rgba, MAX_COLORS);
  const index = applyPalette(rgba, palette);

  encoder.writeFrame(index, width, height, {
    palette,
    delay: delayMs, // centiseconds (gifenc unit)
    repeat: 0, // infinite loop
    first: isFirst,
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type GifResolution = "sd" | "hd";

export interface ExportGIFOptions {
  /** Playback speed multiplier. Higher = shorter frame durations. Default 1. */
  speed?: number;
  /** Output resolution preset. Default "sd". */
  resolution?: GifResolution;
  /** Called with progress in [0, 1] after each encoded frame. */
  onProgress?: (fraction: number) => void;
}

export const RESOLUTION_WIDTH: Record<GifResolution, number> = {
  sd: 480,
  hd: 800,
};

/**
 * Export the given play as an animated GIF and trigger a browser download.
 *
 * @param play      The play to export (must have at least one scene).
 * @param filename  Download filename without extension.
 * @param options   Speed, resolution, progress callback.
 */
export async function exportPlayAsGIF(
  play: Play,
  filename: string = "play",
  options: ExportGIFOptions = {},
): Promise<void> {
  const { speed = 1, resolution = "sd", onProgress } = options;

  const width = RESOLUTION_WIDTH[resolution];
  const variant: CourtVariant = play.courtType;
  const { totalHeight: height } = computeCourtLayout(width, variant);

  // Allocate a single offscreen canvas reused for every frame.
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const encoder = GIFEncoder();

  // Sort scenes by order
  const scenes = [...play.scenes].sort((a, b) => a.order - b.order);

  // Pre-compute total frame count for progress reporting
  let totalFrames = 0;
  for (const scene of scenes) {
    totalFrames += scene.timingGroups.length; // one frame per step
    totalFrames += 1; // hold frame between scenes
  }
  let framesEncoded = 0;

  let isFirst = true;

  for (let si = 0; si < scenes.length; si++) {
    const scene = scenes[si];
    const sceneFlipped = (scene.flipped ?? play.flipped) === true;
    const sortedGroups = [...scene.timingGroups].sort((a, b) => a.step - b.step);

    // Cumulative annotation list — we reveal one timing step at a time
    const cumulativeAnnotations: Annotation[] = [];

    for (let gi = 0; gi < sortedGroups.length; gi++) {
      const group = sortedGroups[gi];

      // Add this step's annotations to the running cumulative list
      cumulativeAnnotations.push(...group.annotations);

      // Duration for this frame: respect speed and clamp to reasonable range.
      // GIF delay is in centiseconds (1/100 s) — divide ms by 10.
      // Clamp: min 2 cs (20 ms), max 500 cs (5 s).
      const rawDuration = group.duration / speed;
      const delayCs = Math.min(Math.max(Math.round(rawDuration / 10), 2), 500);

      renderFrame(canvas, scene, cumulativeAnnotations, width, height, sceneFlipped, "numbers", {}, undefined, undefined, variant);
      encodeFrame(encoder, canvas, delayCs, isFirst);
      isFirst = false;

      framesEncoded += 1;
      onProgress?.(framesEncoded / totalFrames);

      // Yield to keep the UI responsive between frames
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }

    // Hold frame between scenes (or longer final hold at the last scene).
    // Convert ms → centiseconds.
    const holdMs = si === scenes.length - 1 ? FINAL_HOLD_MS : SCENE_HOLD_MS;
    const holdDelay = Math.round(holdMs / speed / 10);

    // Re-render with all annotations of this scene visible for the hold
    renderFrame(canvas, scene, cumulativeAnnotations, width, height, sceneFlipped, "numbers", {}, undefined, undefined, variant);
    encodeFrame(encoder, canvas, holdDelay, isFirst);
    isFirst = false;

    framesEncoded += 1;
    onProgress?.(framesEncoded / totalFrames);

    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }

  encoder.finish();
  // encoder.bytes() returns a Uint8Array whose .buffer is typed as ArrayBufferLike
  // (could be SharedArrayBuffer). Copy to a plain Uint8Array backed by a fresh
  // ArrayBuffer so that the Blob constructor accepts it without TS errors.
  const rawBytes = encoder.bytes();
  const safeBytes = new Uint8Array(rawBytes);
  const blob = new Blob([safeBytes], { type: "image/gif" });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.gif`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
