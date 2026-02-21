"use client";

/**
 * GIF export utility — renders the full play animation as an animated GIF.
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
} from "@/components/court/courtDimensions";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Brief pause between scenes (ms). */
const SCENE_HOLD_MS = 400;

/** Longer pause at the very end of the animation before it loops (ms). */
const FINAL_HOLD_MS = 1200;

/** Maximum GIF palette size (256 is the GIF spec limit). */
const MAX_COLORS = 128;

// ---------------------------------------------------------------------------
// Court colours (must match exportPNG.ts)
// ---------------------------------------------------------------------------

const COLOR_COURT = "#F0C878";
const COLOR_PAINT = "#E07B39";
const COLOR_LINE = "#FFFFFF";
const COLOR_LINE_WIDTH_PX = 2;

// ---------------------------------------------------------------------------
// Court drawing (copy of the logic in exportPNG.ts — kept in sync)
// ---------------------------------------------------------------------------

function drawCourtOnCanvas(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const W = canvas.width;
  const H = canvas.height;

  const cx = (nx: number) => nx * W;
  const cy = (ny: number) => ny * H;
  const rx = (nr: number) => nr * W;
  const scaleY = H / W;

  ctx.clearRect(0, 0, W, H);

  // 1. Court background
  ctx.fillStyle = COLOR_COURT;
  ctx.fillRect(0, 0, W, H);

  // 2. Paint
  ctx.fillStyle = COLOR_PAINT;
  ctx.fillRect(cx(LANE_LEFT), cy(LANE_TOP), cx(LANE_RIGHT) - cx(LANE_LEFT), cy(1) - cy(LANE_TOP));

  ctx.strokeStyle = COLOR_LINE;
  ctx.lineWidth = COLOR_LINE_WIDTH_PX;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // 3. Court boundary
  ctx.strokeRect(0, 0, W, H);

  // 4. Half-court line
  ctx.beginPath();
  ctx.moveTo(0, cy(0));
  ctx.lineTo(W, cy(0));
  ctx.stroke();

  // 5. Half-court centre-circle arc
  ctx.save();
  ctx.scale(1, scaleY);
  ctx.beginPath();
  ctx.arc(cx(0.5), 0, rx(CENTRE_CIRCLE_RADIUS), 0, Math.PI);
  ctx.restore();
  ctx.stroke();

  // 6. Three-point arc
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

  ctx.beginPath();
  ctx.moveTo(leftCornerX_ft, 47);
  ctx.lineTo(leftCornerX_ft, cornerY_ft);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(rightCornerX_ft, 47);
  ctx.lineTo(rightCornerX_ft, cornerY_ft);
  ctx.stroke();

  const arcAngleLeftCorner = Math.atan2(cornerY_ft - basketY_ft, leftCornerX_ft - basketX_ft);
  const arcAngleRightCorner = Math.atan2(cornerY_ft - basketY_ft, rightCornerX_ft - basketX_ft);

  ctx.beginPath();
  ctx.arc(basketX_ft, basketY_ft, 23.75, arcAngleRightCorner, arcAngleLeftCorner, true);
  ctx.stroke();

  // 7. Restricted area arc
  ctx.beginPath();
  ctx.arc(basketX_ft, basketY_ft, 4, Math.PI, 0, false);
  ctx.stroke();

  ctx.restore();

  // 8. Paint lane outline
  ctx.beginPath();
  ctx.strokeRect(cx(LANE_LEFT), cy(LANE_TOP), cx(LANE_RIGHT) - cx(LANE_LEFT), cy(1) - cy(LANE_TOP));

  // 9. Free-throw line
  ctx.beginPath();
  ctx.moveTo(cx(LANE_LEFT), cy(FT_CIRCLE_CENTER_Y));
  ctx.lineTo(cx(LANE_RIGHT), cy(FT_CIRCLE_CENTER_Y));
  ctx.stroke();

  // 10. Free-throw circle
  ctx.save();
  ctx.scale(1 / FT_PER_PX_X, 1 / FT_PER_PX_Y);

  const ftCenterX_ft = FT_CIRCLE_CENTER_X * 50;
  const ftCenterY_ft = FT_CIRCLE_CENTER_Y * 47;
  const ftRadius_ft = 6;

  ctx.strokeStyle = COLOR_LINE;
  ctx.lineWidth = COLOR_LINE_WIDTH_PX * FT_PER_PX_X;

  ctx.beginPath();
  ctx.arc(ftCenterX_ft, ftCenterY_ft, ftRadius_ft, Math.PI, 0, false);
  ctx.stroke();

  ctx.setLineDash([0.75, 0.75]);
  ctx.beginPath();
  ctx.arc(ftCenterX_ft, ftCenterY_ft, ftRadius_ft, 0, Math.PI, false);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.restore();

  // 11. Backboard
  ctx.beginPath();
  ctx.moveTo(cx(BASKET_X - BACKBOARD_HALF_WIDTH), cy(BACKBOARD_Y));
  ctx.lineTo(cx(BASKET_X + BACKBOARD_HALF_WIDTH), cy(BACKBOARD_Y));
  ctx.stroke();

  // 12. Basket / rim
  ctx.save();
  ctx.scale(1, scaleY);
  ctx.beginPath();
  ctx.arc(cx(BASKET_X), cy(BASKET_Y) / scaleY, rx(BASKET_RADIUS), 0, Math.PI * 2);
  ctx.strokeStyle = COLOR_LINE;
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Player drawing (mirrors exportPNG.ts)
// ---------------------------------------------------------------------------

const PLAYER_RADIUS = 18;
const COLOR_OFFENSE_FILL = "#E07B39";
const COLOR_OFFENSE_STROKE = "#FFFFFF";
const COLOR_DEFENSE_FILL = "#FFFFFF";
const COLOR_DEFENSE_STROKE = "#1E3A5F";
const COLOR_TEXT_OFFENSE = "#FFFFFF";
const COLOR_TEXT_DEFENSE = "#1E3A5F";

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  side: "offense" | "defense",
  position: number,
  px: number,
  py: number,
  scale: number,
): void {
  const r = PLAYER_RADIUS * scale;
  const isOffense = side === "offense";

  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.arc(px + scale, py + 2 * scale, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(px, py, r, 0, Math.PI * 2);
  ctx.fillStyle = isOffense ? COLOR_OFFENSE_FILL : COLOR_DEFENSE_FILL;
  ctx.fill();
  ctx.strokeStyle = isOffense ? COLOR_OFFENSE_STROKE : COLOR_DEFENSE_STROKE;
  ctx.lineWidth = (isOffense ? 2 : 2.5) * scale;
  ctx.stroke();

  if (!isOffense) {
    const xSize = 7 * scale;
    ctx.strokeStyle = COLOR_DEFENSE_STROKE;
    ctx.lineWidth = 2.5 * scale;
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

  const label = isOffense
    ? ({ 1: "PG", 2: "SG", 3: "SF", 4: "PF", 5: "C" }[position] ?? String(position))
    : `X${position}`;
  const baseFontSize = isOffense ? 11 : 9;
  const fontSize =
    (label.length > 2
      ? Math.max(6, baseFontSize - (label.length - 2) * 1.5)
      : baseFontSize) * scale;

  ctx.fillStyle = isOffense ? COLOR_TEXT_OFFENSE : COLOR_TEXT_DEFENSE;
  ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const dyOffset = isOffense ? 0 : -9 * scale;
  ctx.fillText(label, px, py + dyOffset);
}

// ---------------------------------------------------------------------------
// Ball drawing (mirrors exportPNG.ts)
// ---------------------------------------------------------------------------

const BALL_RADIUS = 12;
const COLOR_BALL = "#E05C00";
const COLOR_BALL_HIGHLIGHT = "#F47B2A";
const COLOR_SEAM = "#FFFFFF";
const BALL_ATTACH_OFFSET_Y = -22;

function drawBall(ctx: CanvasRenderingContext2D, px: number, py: number, scale: number): void {
  const r = BALL_RADIUS * scale;

  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.arc(px + scale, py + 2 * scale, r, 0, Math.PI * 2);
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
  ctx.lineWidth = 1.5 * scale;
  ctx.lineCap = "round";
  ctx.globalAlpha = 0.5;
  ctx.stroke();
  ctx.globalAlpha = 1;

  const vPath = new Path2D(
    `M ${px} ${py - r} C ${px + r * 0.55} ${py - r * 0.5} ${px + r * 0.55} ${py + r * 0.5} ${px} ${py + r}`,
  );
  ctx.strokeStyle = COLOR_SEAM;
  ctx.lineWidth = 1.2 * scale;
  ctx.lineCap = "round";
  ctx.stroke(vPath);

  const hPath = new Path2D(
    `M ${px - r} ${py} C ${px - r * 0.5} ${py + r * 0.4} ${px + r * 0.5} ${py + r * 0.4} ${px + r} ${py}`,
  );
  ctx.stroke(hPath);
}

// ---------------------------------------------------------------------------
// Annotation drawing (mirrors exportPNG.ts)
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

function drawAnnotation(
  ctx: CanvasRenderingContext2D,
  ann: Annotation,
  scale: number,
): void {
  const { from, to, type } = ann;
  const arrowSize = 12 * scale;

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (type === "movement") {
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.strokeStyle = "#1E3A5F";
    ctx.lineWidth = 2.5 * scale;
    ctx.stroke();
    drawArrowHead(ctx, from.x, from.y, to.x, to.y, arrowSize, "#1E3A5F");
    return;
  }

  if (type === "dribble") {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const zigCount = Math.max(2, Math.round(len / (18 * scale)));
    ctx.beginPath();
    for (let i = 0; i <= zigCount; i++) {
      const t = i / zigCount;
      const mx = from.x + dx * t;
      const my = from.y + dy * t;
      const perp = i % 2 === 0 ? 6 * scale : -6 * scale;
      const px2 = len > 0 ? (-dy / len) * perp : 0;
      const py2 = len > 0 ? (dx / len) * perp : 0;
      if (i === 0) ctx.moveTo(mx + px2, my + py2);
      else ctx.lineTo(mx + px2, my + py2);
    }
    ctx.strokeStyle = "#1E3A5F";
    ctx.lineWidth = 2.5 * scale;
    ctx.stroke();
    drawArrowHead(ctx, from.x, from.y, to.x, to.y, arrowSize, "#1E3A5F");
    return;
  }

  if (type === "pass") {
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.strokeStyle = "#059669";
    ctx.lineWidth = 2 * scale;
    ctx.stroke();
    drawArrowHead(ctx, from.x, from.y, to.x, to.y, arrowSize, "#059669");
    return;
  }

  if (type === "screen") {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const perpX = len > 0 ? (-dy / len) * 10 * scale : 0;
    const perpY = len > 0 ? (dx / len) * 10 * scale : 0;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.strokeStyle = "#7C3AED";
    ctx.lineWidth = 2.5 * scale;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(to.x + perpX, to.y + perpY);
    ctx.lineTo(to.x - perpX, to.y - perpY);
    ctx.lineWidth = 3 * scale;
    ctx.stroke();
    return;
  }

  if (type === "cut") {
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.strokeStyle = "#DC2626";
    ctx.lineWidth = 2.5 * scale;
    ctx.setLineDash([7 * scale, 5 * scale]);
    ctx.stroke();
    ctx.setLineDash([]);
    drawArrowHead(ctx, from.x, from.y, to.x, to.y, arrowSize, "#DC2626");
  }
}

// ---------------------------------------------------------------------------
// Frame rendering
// ---------------------------------------------------------------------------

/**
 * Render a single animation frame onto the given canvas.
 *
 * @param canvas    Destination canvas (already sized to W × H).
 * @param scene     Scene data (player positions, ball, timing groups).
 * @param visibleAnnotations  Annotations to draw on this frame (cumulative subset).
 * @param width     Canvas width in px.
 * @param height    Canvas height in px.
 */
function renderFrame(
  canvas: HTMLCanvasElement,
  scene: Scene,
  visibleAnnotations: Annotation[],
  width: number,
  height: number,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Court background
  drawCourtOnCanvas(canvas);

  // Overlay: annotations + players + ball
  ctx.save();

  // Draw annotations (below players)
  for (const ann of visibleAnnotations) {
    drawAnnotation(ctx, ann, 1);
  }

  // Defense
  for (const p of scene.players.defense) {
    if (p.visible) {
      drawPlayer(ctx, "defense", p.position, p.x * width, p.y * height, 1);
    }
  }

  // Offense
  for (const p of scene.players.offense) {
    if (p.visible) {
      drawPlayer(ctx, "offense", p.position, p.x * width, p.y * height, 1);
    }
  }

  // Ball
  const ball = scene.ball;
  let ballPx = { x: ball.x * width, y: ball.y * height };
  if (ball.attachedTo) {
    const pool =
      ball.attachedTo.side === "offense" ? scene.players.offense : scene.players.defense;
    const holder = pool.find((p) => p.position === ball.attachedTo!.position);
    if (holder) {
      ballPx = { x: holder.x * width, y: holder.y * height + BALL_ATTACH_OFFSET_Y };
    }
  }
  drawBall(ctx, ballPx.x, ballPx.y, 1);

  ctx.restore();
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
    delay: delayMs,
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

const RESOLUTION_WIDTH: Record<GifResolution, number> = {
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
  const height = Math.round(width / COURT_ASPECT_RATIO);

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
    const sortedGroups = [...scene.timingGroups].sort((a, b) => a.step - b.step);

    // Cumulative annotation list — we reveal one timing step at a time
    const cumulativeAnnotations: Annotation[] = [];

    for (let gi = 0; gi < sortedGroups.length; gi++) {
      const group = sortedGroups[gi];

      // Add this step's annotations to the running cumulative list
      cumulativeAnnotations.push(...group.annotations);

      // Duration for this frame: respect speed and clamp to reasonable range
      const rawDuration = group.duration / speed;
      // GIF delay is in 10ms units; minimum 10ms (100fps), cap at 10s
      const delayMs = Math.min(Math.max(Math.round(rawDuration), 10), 10000);

      renderFrame(canvas, scene, cumulativeAnnotations, width, height);
      encodeFrame(encoder, canvas, delayMs, isFirst);
      isFirst = false;

      framesEncoded += 1;
      onProgress?.(framesEncoded / totalFrames);

      // Yield to keep the UI responsive between frames
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }

    // Hold frame between scenes (or longer final hold at the last scene)
    const holdMs = si === scenes.length - 1 ? FINAL_HOLD_MS : SCENE_HOLD_MS;
    const holdDelay = Math.round(holdMs / speed);

    // Re-render with all annotations of this scene visible for the hold
    renderFrame(canvas, scene, cumulativeAnnotations, width, height);
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
