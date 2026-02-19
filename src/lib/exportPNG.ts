"use client";

/**
 * PNG export utility for a single scene.
 *
 * Implements issue #79: PNG export of single scene.
 *
 * Approach:
 *   1. Allocate an offscreen canvas at the requested resolution.
 *   2. Re-draw the court using the same drawCourt logic from Court.tsx.
 *   3. Draw players, ball, and all annotations programmatically on top.
 *   4. Trigger a download of the resulting PNG.
 *
 * All rendering is self-contained (no DOM capture) so it works even when the
 * editor is not visible.
 */

import type { Scene, Annotation } from "./types";
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
// Court colours (must match Court.tsx)
// ---------------------------------------------------------------------------

const COLOR_COURT = "#F0C878";
const COLOR_PAINT = "#E07B39";
const COLOR_LINE = "#FFFFFF";
const COLOR_LINE_WIDTH_PX = 2;

// ---------------------------------------------------------------------------
// Court drawing (mirrors Court.tsx drawCourt — kept in sync manually)
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

  // Setup line style
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

  ctx.beginPath();
  ctx.arc(basketX_ft, basketY_ft, 23.75, arcAngleRightCorner, arcAngleLeftCorner, true);
  ctx.stroke();

  // 7. Restricted area arc
  ctx.beginPath();
  ctx.arc(basketX_ft, basketY_ft, 4, Math.PI, 0, true);
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

  // 10. Free-throw circle — drawn in feet-coordinate system for a true circle
  ctx.save();
  ctx.scale(1 / FT_PER_PX_X, 1 / FT_PER_PX_Y);

  const ftCenterX_ft = FT_CIRCLE_CENTER_X * 50; // 25ft
  const ftCenterY_ft = FT_CIRCLE_CENTER_Y * 47;
  const ftRadius_ft = 6; // 6ft radius

  ctx.strokeStyle = COLOR_LINE;
  ctx.lineWidth = COLOR_LINE_WIDTH_PX * FT_PER_PX_X;

  // Upper semicircle (solid) — toward half court (counterclockwise π → 0)
  ctx.beginPath();
  ctx.arc(ftCenterX_ft, ftCenterY_ft, ftRadius_ft, Math.PI, 0, true);
  ctx.stroke();

  // Lower semicircle (dashed) — into the paint (clockwise 0 → π)
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
// Player drawing
// ---------------------------------------------------------------------------

const PLAYER_RADIUS = 18;
const COLOR_OFFENSE_FILL = "#E07B39";
const COLOR_OFFENSE_STROKE = "#FFFFFF";
const COLOR_DEFENSE_FILL = "#FFFFFF";
const COLOR_DEFENSE_STROKE = "#1E3A5F";
const COLOR_TEXT_OFFENSE = "#FFFFFF";
const COLOR_TEXT_DEFENSE = "#1E3A5F";

const OFFENSE_ABBRS: Record<number, string> = { 1: "PG", 2: "SG", 3: "SF", 4: "PF", 5: "C" };

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  side: "offense" | "defense",
  position: number,
  px: number,
  py: number,
  scale: number,
) {
  const r = PLAYER_RADIUS * scale;
  const isOffense = side === "offense";

  // Drop shadow
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.arc(px + scale, py + 2 * scale, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Main circle
  ctx.beginPath();
  ctx.arc(px, py, r, 0, Math.PI * 2);
  ctx.fillStyle = isOffense ? COLOR_OFFENSE_FILL : COLOR_DEFENSE_FILL;
  ctx.fill();
  ctx.strokeStyle = isOffense ? COLOR_OFFENSE_STROKE : COLOR_DEFENSE_STROKE;
  ctx.lineWidth = (isOffense ? 2 : 2.5) * scale;
  ctx.stroke();

  // Defensive X lines
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

  // Label
  const label = isOffense ? OFFENSE_ABBRS[position] ?? String(position) : `X${position}`;
  const baseFontSize = isOffense ? 11 : 9;
  const fontSize = (label.length > 2
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
// Ball drawing
// ---------------------------------------------------------------------------

const BALL_RADIUS = 12;
const COLOR_BALL = "#E05C00";
const COLOR_BALL_HIGHLIGHT = "#F47B2A";
const COLOR_SEAM = "#FFFFFF";
const BALL_ATTACH_OFFSET_Y = -22;

function drawBall(ctx: CanvasRenderingContext2D, px: number, py: number, scale: number) {
  const r = BALL_RADIUS * scale;

  // Drop shadow
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.arc(px + scale, py + 2 * scale, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Ball body
  ctx.beginPath();
  ctx.arc(px, py, r, 0, Math.PI * 2);
  ctx.fillStyle = COLOR_BALL;
  ctx.fill();

  // Highlight arc
  ctx.beginPath();
  ctx.moveTo(px - r * 0.5, py - r * 0.6);
  ctx.arc(px, py, r * 0.7, Math.PI + 0.6, Math.PI * 2 - 0.4, false);
  ctx.strokeStyle = COLOR_BALL_HIGHLIGHT;
  ctx.lineWidth = 1.5 * scale;
  ctx.lineCap = "round";
  ctx.globalAlpha = 0.5;
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Vertical seam (curved)
  ctx.beginPath();
  const vPath = new Path2D(
    `M ${px} ${py - r} C ${px + r * 0.55} ${py - r * 0.5} ${px + r * 0.55} ${py + r * 0.5} ${px} ${py + r}`,
  );
  ctx.strokeStyle = COLOR_SEAM;
  ctx.lineWidth = 1.2 * scale;
  ctx.lineCap = "round";
  ctx.stroke(vPath);

  // Horizontal seam (curved)
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
  const px = -uy;
  const py = ux;
  const w = size * 0.45;
  return [
    [x2, y2],
    [x2 - ux * size + px * w, y2 - uy * size + py * w],
    [x2 - ux * size - px * w, y2 - uy * size - py * w],
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
) {
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
) {
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
    // Perpendicular bar
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
// Overlay drawing (players + ball + annotations)
// ---------------------------------------------------------------------------

interface PlayerPositions {
  offensePx: { position: number; px: number; py: number; visible: boolean }[];
  defensePx: { position: number; px: number; py: number; visible: boolean }[];
  ballPx: { x: number; y: number } | null;
  ballAttachment: { side: "offense" | "defense"; position: number } | null;
}

function computePixelPositions(
  scene: Scene,
  width: number,
  height: number,
): PlayerPositions {
  const offensePx = scene.players.offense.map((p) => ({
    position: p.position,
    px: p.x * width,
    py: p.y * height,
    visible: p.visible,
  }));
  const defensePx = scene.players.defense.map((p) => ({
    position: p.position,
    px: p.x * width,
    py: p.y * height,
    visible: p.visible,
  }));

  const ball = scene.ball;
  const ballPx = { x: ball.x * width, y: ball.y * height };
  const ballAttachment = ball.attachedTo ?? null;

  return { offensePx, defensePx, ballPx, ballAttachment };
}

function getEffectiveBallPx(
  attachment: { side: "offense" | "defense"; position: number } | null,
  offensePx: { position: number; px: number; py: number; visible: boolean }[],
  defensePx: { position: number; px: number; py: number; visible: boolean }[],
  freeBall: { x: number; y: number } | null,
  scale: number,
): { x: number; y: number } | null {
  if (attachment) {
    const pool = attachment.side === "offense" ? offensePx : defensePx;
    const player = pool.find((p) => p.position === attachment.position);
    if (player) {
      return { x: player.px, y: player.py + BALL_ATTACH_OFFSET_Y * scale };
    }
  }
  return freeBall;
}

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  width: number,
  height: number,
  scale: number,
) {
  const { offensePx, defensePx, ballPx, ballAttachment } = computePixelPositions(
    scene,
    width,
    height,
  );

  // Draw all annotations first (below players)
  const annotations = scene.timingGroups.flatMap((g) => g.annotations);
  for (const ann of annotations) {
    drawAnnotation(ctx, ann, scale);
  }

  // Defensive players (below offensive)
  for (const p of defensePx) {
    if (p.visible) drawPlayer(ctx, "defense", p.position, p.px, p.py, scale);
  }

  // Offensive players
  for (const p of offensePx) {
    if (p.visible) drawPlayer(ctx, "offense", p.position, p.px, p.py, scale);
  }

  // Ball
  const effectiveBall = getEffectiveBallPx(ballAttachment, offensePx, defensePx, ballPx, scale);
  if (effectiveBall) {
    drawBall(ctx, effectiveBall.x, effectiveBall.y, scale);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type ExportResolution = "1x" | "2x" | "3x";

const RESOLUTION_SCALE: Record<ExportResolution, number> = {
  "1x": 1,
  "2x": 2,
  "3x": 3,
};

/**
 * Export the given scene as a PNG and trigger a browser download.
 *
 * @param scene         The scene to export.
 * @param baseWidth     Desired export width in CSS pixels (height derived from aspect ratio).
 * @param resolution    Pixel density multiplier ("1x" | "2x" | "3x").
 * @param filename      Suggested download filename (without .png extension).
 */
export function exportSceneAsPNG(
  scene: Scene,
  baseWidth: number = 800,
  resolution: ExportResolution = "2x",
  filename: string = "play-scene",
): void {
  const scale = RESOLUTION_SCALE[resolution];
  const cssWidth = baseWidth;
  const cssHeight = Math.round(cssWidth / COURT_ASPECT_RATIO);

  const pixelWidth = Math.round(cssWidth * scale);
  const pixelHeight = Math.round(cssHeight * scale);

  const canvas = document.createElement("canvas");
  canvas.width = pixelWidth;
  canvas.height = pixelHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Scale the context so all drawing coords are in CSS pixel space
  ctx.scale(scale, scale);

  // Draw court
  // drawCourtOnCanvas expects canvas.width / canvas.height to be the full pixel dims
  // We temporarily draw to the full canvas and rely on scale transform
  drawCourtOnCanvas(canvas);

  // Re-apply scale (drawCourtOnCanvas uses canvas.width/height directly, not ctx transform)
  // So we need to do a second pass for the overlay in scaled CSS space:
  // Reset and re-draw properly:
  ctx.resetTransform();

  // Draw court at full pixel resolution (drawCourtOnCanvas uses canvas.width/height)
  drawCourtOnCanvas(canvas);

  // Draw overlay at scaled coordinates
  ctx.scale(scale, scale);
  drawOverlay(ctx, scene, cssWidth, cssHeight, scale);

  // Trigger download
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, "image/png");
}
