/**
 * exportPdf — renders a Play to a multi-page PDF (one page per scene).
 *
 * Implements issue #80: PDF export — one page per scene.
 *
 * Each page contains:
 *   - A header row: scene number + note (left), play title (right)
 *   - The court with all players, ball, and annotations drawn on an
 *     offscreen canvas and embedded as a JPEG image.
 *
 * Rendering is done entirely in the browser via the Canvas 2D API so
 * no server round-trip is required. jsPDF is dynamically imported to
 * avoid loading it on the server.
 *
 * Coordinate conventions:
 *   - The court frame is the editor's: computeCourtLayout(EXPORT_W, variant)
 *     painted by the shared paintCourt (out-of-bounds margins included, and
 *     the editor's flip transform when flipped).
 *   - Player, ball and annotation positions are normalised [0-1] in play-area
 *     space and mapped with the shared normToCanvasPx.
 *   - Token radii come from tokenSizing (same token-to-court ratio as the
 *     editor and the other exports).
 */

import { computeCourtLayout, normToCanvasPx } from "@/lib/courtLayout";
import type { CourtLayout, CourtVariant } from "@/lib/courtLayout";
import { paintCourt } from "@/lib/courtRendering";
import { computeTokenSizes } from "@/lib/tokenSizing";
import type { Annotation, Play, Scene } from "@/lib/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Canvas width in pixels for the export. Higher = sharper in PDF. */
const EXPORT_W = 1200;
export { EXPORT_W as PDF_EXPORT_W };

/** Line width for annotations, scaled to canvas. */
const ANN_LINE_W = EXPORT_W * 0.003;

/** Arrowhead size, scaled to canvas. */
const ANN_ARROW_SIZE = EXPORT_W * 0.022;

/** Dribble zigzag: one zig per this many canvas pixels along the line. */
const DRIBBLE_SEGMENT = EXPORT_W * 0.028;

/** Dribble perpendicular offset in canvas pixels. */
const DRIBBLE_PERP = EXPORT_W * 0.009;

// Annotation colours — match AnnotationLayer.tsx
const ANN_COLOR: Record<string, string> = {
  movement: "#1E3A5F",
  dribble:  "#1E3A5F",
  pass:     "#059669",
  screen:   "#7C3AED",
  cut:      "#DC2626",
  guard:    "#D97706",
  handoff:  "#0369A1",
};

// ---------------------------------------------------------------------------
// Canvas drawing helpers
// ---------------------------------------------------------------------------

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  side: "offense" | "defense",
  position: number,
  px: number,
  py: number,
  r: number,
): void {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (side === "offense") {
    // Filled orange circle
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fillStyle = "#E07B39";
    ctx.fill();
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = r * 0.15;
    ctx.stroke();

    // Position number
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `bold ${Math.round(r * 0.78)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(position), px, py);
  } else {
    // White circle with navy X
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.strokeStyle = "#1E3A5F";
    ctx.lineWidth = r * 0.18;
    ctx.stroke();

    const x = r * 0.42;
    ctx.beginPath();
    ctx.moveTo(px - x, py - x);
    ctx.lineTo(px + x, py + x);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(px + x, py - x);
    ctx.lineTo(px - x, py + x);
    ctx.stroke();

    // Label above the X
    ctx.fillStyle = "#1E3A5F";
    ctx.font = `bold ${Math.round(r * 0.58)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`X${position}`, px, py - x - r * 0.22);
  }

  ctx.restore();
}

function drawBall(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  r: number,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(px, py, r, 0, Math.PI * 2);
  ctx.fillStyle = "#E07B39";
  ctx.fill();
  ctx.strokeStyle = "#1E3A5F";
  ctx.lineWidth = r * 0.18;
  ctx.stroke();
  ctx.restore();
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  tipX: number,
  tipY: number,
  tailX: number,
  tailY: number,
  size: number,
): void {
  const dx = tipX - tailX;
  const dy = tipY - tailY;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return;
  const ux = dx / len;
  const uy = dy / len;
  const perp = size * 0.45;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(tipX - ux * size - uy * perp, tipY - uy * size + ux * perp);
  ctx.lineTo(tipX - ux * size + uy * perp, tipY - uy * size - ux * perp);
  ctx.closePath();
  ctx.fill();
}

/** Quadratic bezier point at parameter t. */
function bezierPt(
  fx: number, fy: number,
  tx: number, ty: number,
  t: number,
  cpx?: number, cpy?: number,
): { x: number; y: number } {
  if (cpx === undefined || cpy === undefined) {
    return { x: fx + (tx - fx) * t, y: fy + (ty - fy) * t };
  }
  const mt = 1 - t;
  return {
    x: mt * mt * fx + 2 * mt * t * cpx + t * t * tx,
    y: mt * mt * fy + 2 * mt * t * cpy + t * t * ty,
  };
}

/** Draw quadratic bezier or straight-line body. */
function strokeBezier(
  ctx: CanvasRenderingContext2D,
  fx: number, fy: number,
  tx: number, ty: number,
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

/** Arrowhead at (tx, ty) using bezier tangent direction. */
function arrowHeadBezierPdf(
  ctx: CanvasRenderingContext2D,
  fx: number, fy: number,
  tx: number, ty: number,
  size: number,
  cpx?: number, cpy?: number,
): void {
  const tailX = cpx !== undefined ? cpx : fx;
  const tailY = cpy !== undefined ? cpy : fy;
  drawArrowHead(ctx, tx, ty, tailX, tailY, size);
}

/** Draw a multi-leg polyline through pixel-space waypoints. */
function strokePolyline(
  ctx: CanvasRenderingContext2D,
  pts: { x: number; y: number }[],
): void {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
}

function drawAnnotation(
  ctx: CanvasRenderingContext2D,
  ann: Annotation,
  frame: CourtLayout,
  flipped = false,
): void {
  // Annotations are stored in normalised play-area coords, like players.
  const pt = (p: { x: number; y: number }) => normToCanvasPx(p.x, p.y, frame, flipped);
  const { x: fx, y: fy } = pt(ann.from);
  const { x: tx, y: ty } = pt(ann.to);

  // Multi-leg waypoints
  const hasWaypoints = ann.waypoints && ann.waypoints.length > 0;
  const allPts: { x: number; y: number }[] = hasWaypoints
    ? [{ x: fx, y: fy }, ...(ann.waypoints ?? []).map(pt), { x: tx, y: ty }]
    : [];

  // Bezier control point (if any — single-leg only)
  let cpx: number | undefined;
  let cpy: number | undefined;
  if (!hasWaypoints && ann.controlPoints.length > 0) {
    ({ x: cpx, y: cpy } = pt(ann.controlPoints[0]));
  }

  const color = ANN_COLOR[ann.type] ?? "#1E3A5F";

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = ANN_LINE_W;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (ann.type === "movement") {
    ctx.setLineDash([]);
    if (hasWaypoints) {
      strokePolyline(ctx, allPts);
      const n = allPts.length;
      drawArrowHead(ctx, allPts[n - 1].x, allPts[n - 1].y, allPts[n - 2].x, allPts[n - 2].y, ANN_ARROW_SIZE);
    } else {
      strokeBezier(ctx, fx, fy, tx, ty, cpx, cpy);
      arrowHeadBezierPdf(ctx, fx, fy, tx, ty, ANN_ARROW_SIZE, cpx, cpy);
    }

  } else if (ann.type === "pass") {
    ctx.setLineDash([]);
    strokeBezier(ctx, fx, fy, tx, ty, cpx, cpy);
    arrowHeadBezierPdf(ctx, fx, fy, tx, ty, ANN_ARROW_SIZE, cpx, cpy);

  } else if (ann.type === "dribble") {
    if (hasWaypoints) {
      // Multi-leg dribble: dashed polyline
      ctx.setLineDash([ANN_LINE_W * 3, ANN_LINE_W * 2]);
      strokePolyline(ctx, allPts);
      ctx.setLineDash([]);
      const n = allPts.length;
      drawArrowHead(ctx, allPts[n - 1].x, allPts[n - 1].y, allPts[n - 2].x, allPts[n - 2].y, ANN_ARROW_SIZE);
    } else if (cpx !== undefined && cpy !== undefined) {
      // Curved dribble: dashed bezier
      ctx.setLineDash([ANN_LINE_W * 3, ANN_LINE_W * 2]);
      strokeBezier(ctx, fx, fy, tx, ty, cpx, cpy);
      ctx.setLineDash([]);
      arrowHeadBezierPdf(ctx, fx, fy, tx, ty, ANN_ARROW_SIZE, cpx, cpy);
    } else {
      // Straight zigzag
      const dx = tx - fx;
      const dy = ty - fy;
      const len = Math.sqrt(dx * dx + dy * dy);
      const zigCount = Math.max(2, Math.round(len / DRIBBLE_SEGMENT));
      ctx.setLineDash([]);
      ctx.beginPath();
      for (let i = 0; i <= zigCount; i++) {
        const t = i / zigCount;
        const mx = fx + dx * t;
        const my = fy + dy * t;
        const perp = i % 2 === 0 ? DRIBBLE_PERP : -DRIBBLE_PERP;
        const px2 = len > 0 ? -dy / len * perp : 0;
        const py2 = len > 0 ? dx / len * perp : 0;
        if (i === 0) ctx.moveTo(mx + px2, my + py2);
        else ctx.lineTo(mx + px2, my + py2);
      }
      ctx.stroke();
      drawArrowHead(ctx, tx, ty, fx, fy, ANN_ARROW_SIZE);
    }

  } else if (ann.type === "screen") {
    ctx.setLineDash([]);
    strokeBezier(ctx, fx, fy, tx, ty, cpx, cpy);

    // Perpendicular bar at the end
    const dx = tx - fx;
    const dy = ty - fy;
    const len = Math.sqrt(dx * dx + dy * dy);
    const ux = len > 0 ? dx / len : 1;
    const uy = len > 0 ? dy / len : 0;
    const barLen = ANN_ARROW_SIZE * 0.85;
    ctx.lineWidth = ANN_LINE_W * 1.2;
    ctx.beginPath();
    ctx.moveTo(tx + uy * barLen, ty - ux * barLen);
    ctx.lineTo(tx - uy * barLen, ty + ux * barLen);
    ctx.stroke();

  } else if (ann.type === "cut") {
    ctx.setLineDash([ANN_LINE_W * 4, ANN_LINE_W * 3]);
    if (hasWaypoints) {
      strokePolyline(ctx, allPts);
      ctx.setLineDash([]);
      const n = allPts.length;
      drawArrowHead(ctx, allPts[n - 1].x, allPts[n - 1].y, allPts[n - 2].x, allPts[n - 2].y, ANN_ARROW_SIZE);
    } else {
      strokeBezier(ctx, fx, fy, tx, ty, cpx, cpy);
      ctx.setLineDash([]);
      arrowHeadBezierPdf(ctx, fx, fy, tx, ty, ANN_ARROW_SIZE, cpx, cpy);
    }

  } else if (ann.type === "guard") {
    ctx.globalAlpha = 0.85;
    ctx.setLineDash([ANN_LINE_W * 4, ANN_LINE_W * 4]);
    strokeBezier(ctx, fx, fy, tx, ty, cpx, cpy);
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

  } else if (ann.type === "handoff") {
    ctx.setLineDash([ANN_LINE_W * 3, ANN_LINE_W * 2]);
    strokeBezier(ctx, fx, fy, tx, ty, cpx, cpy);
    ctx.setLineDash([]);

    // Tick marks at t=0.85 and t=0.72 (bezier-aware)
    const tick1 = bezierPt(fx, fy, tx, ty, 0.85, cpx, cpy);
    const tick2 = bezierPt(fx, fy, tx, ty, 0.72, cpx, cpy);
    const tan1Before = bezierPt(fx, fy, tx, ty, 0.83, cpx, cpy);
    const tan2Before = bezierPt(fx, fy, tx, ty, 0.70, cpx, cpy);
    const getPerp = (pt: { x: number; y: number }, before: { x: number; y: number }) => {
      const ddx = pt.x - before.x;
      const ddy = pt.y - before.y;
      const dlen = Math.sqrt(ddx * ddx + ddy * ddy);
      return { px: dlen > 0 ? -ddy / dlen : 0, py: dlen > 0 ? ddx / dlen : 1 };
    };
    const tickLen = ANN_ARROW_SIZE * 0.75;
    const { px: px1, py: py1 } = getPerp(tick1, tan1Before);
    const { px: px2, py: py2 } = getPerp(tick2, tan2Before);

    ctx.beginPath();
    ctx.moveTo(tick1.x + px1 * tickLen, tick1.y + py1 * tickLen);
    ctx.lineTo(tick1.x - px1 * tickLen, tick1.y - py1 * tickLen);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(tick2.x + px2 * tickLen, tick2.y + py2 * tickLen);
    ctx.lineTo(tick2.x - px2 * tickLen, tick2.y - py2 * tickLen);
    ctx.stroke();

    arrowHeadBezierPdf(ctx, fx, fy, tx, ty, ANN_ARROW_SIZE, cpx, cpy);
  }

  ctx.setLineDash([]);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Scene → canvas
// ---------------------------------------------------------------------------

/**
 * Size `canvas` to the shared court layout and draw the scene on it. Split from
 * renderScene so it can be driven without a DOM.
 */
export function drawPdfSceneOnCanvas(
  canvas: HTMLCanvasElement,
  scene: Scene,
  courtType: CourtVariant,
  flipped = false,
  maxStep = Infinity,
): void {
  const layout = computeCourtLayout(EXPORT_W, courtType);
  const { playerR, ballR, ballAttachOffsetY } = computeTokenSizes(layout.innerW);

  canvas.width = layout.totalWidth;
  canvas.height = layout.totalHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Court (floor, OOB margins, markings) in the editor's frame, flip included
  paintCourt(ctx, layout, { flipped });

  const pos = (p: { x: number; y: number }) => normToCanvasPx(p.x, p.y, layout, flipped);

  // Defense (underneath offense)
  for (const p of scene.players.defense) {
    if (!p.visible) continue;
    const { x, y } = pos(p);
    drawPlayer(ctx, "defense", p.position, x, y, playerR);
  }

  // Offense
  for (const p of scene.players.offense) {
    if (!p.visible) continue;
    const { x, y } = pos(p);
    drawPlayer(ctx, "offense", p.position, x, y, playerR);
  }

  // Ball
  const ball = scene.ball;
  if (ball) {
    let b = pos(ball);

    // If attached to a player, float it above them (screen space — never
    // negated when flipped, exactly as in the editor)
    if (ball.attachedTo) {
      const pool = ball.attachedTo.side === "offense" ? scene.players.offense : scene.players.defense;
      const attached = pool.find((p) => p.position === ball.attachedTo!.position);
      if (attached) {
        const h = pos(attached);
        b = { x: h.x, y: h.y + ballAttachOffsetY };
      }
    }
    drawBall(ctx, b.x, b.y, ballR);
  }

  // Annotations — cumulative reveal up to maxStep
  const sortedGroups = [...scene.timingGroups].sort((a, b) => a.step - b.step);
  for (const group of sortedGroups) {
    if (group.step > maxStep) break;
    for (const ann of group.annotations) {
      drawAnnotation(ctx, ann, layout, flipped);
    }
  }
}

function renderScene(
  scene: Scene,
  courtType: CourtVariant,
  flipped = false,
  maxStep = Infinity,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  drawPdfSceneOnCanvas(canvas, scene, courtType, flipped, maxStep);
  return canvas;
}

// ---------------------------------------------------------------------------
// PDF assembly
// ---------------------------------------------------------------------------

export type PdfLayout = "1x1" | "2x1" | "2x2" | "3x2";

export interface ExportPdfOptions {
  /** When true, renders one item per timing step (cumulative reveal). Default: false. */
  exportSteps?: boolean;
  /** Grid layout: columns × rows per page. Default "1x1". */
  layout?: PdfLayout;
}

const LAYOUT_GRID: Record<PdfLayout, { cols: number; rows: number }> = {
  "1x1": { cols: 1, rows: 1 },
  "2x1": { cols: 2, rows: 1 },
  "2x2": { cols: 2, rows: 2 },
  "3x2": { cols: 3, rows: 2 },
};

/**
 * Generates and downloads a PDF of the given play.
 * Supports 1×1 (full page), 2×1, 2×2, and 3×2 grid layouts.
 */
export async function exportPlayToPdf(play: Play, options: ExportPdfOptions = {}): Promise<void> {
  const { exportSteps = false, layout = "1x1" } = options;
  const { cols, rows } = LAYOUT_GRID[layout];
  const itemsPerPage = cols * rows;

  // Dynamic import keeps jsPDF out of the SSR bundle
  const { jsPDF } = await import("jspdf");

  const PAGE_W = 210;    // A4 portrait width (mm)
  const PAGE_H = 297;    // A4 portrait height (mm)
  const MARGIN = 10;     // outer page margin (mm)
  const PAGE_HEADER_H = cols === 1 && rows === 1 ? 14 : 10; // play title bar
  const CELL_LABEL_H = cols === 1 && rows === 1 ? 0 : 7;    // per-cell label (not needed for 1×1)
  const CELL_GAP = 4;    // gap between cells (mm)

  const usableW = PAGE_W - 2 * MARGIN;
  const usableH = PAGE_H - 2 * MARGIN - PAGE_HEADER_H;
  const cellW = (usableW - (cols - 1) * CELL_GAP) / cols;
  const cellH = (usableH - (rows - 1) * CELL_GAP) / rows;
  const imgAreaH = cellH - CELL_LABEL_H;

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  // --- Collect all items to render ---
  interface RenderItem {
    scene: typeof play.scenes[number];
    maxStep: number;
    label: string;
  }
  const items: RenderItem[] = [];
  const scenes = [...play.scenes].sort((a, b) => a.order - b.order);
  for (const scene of scenes) {
    const sortedGroups = [...scene.timingGroups].sort((a, b) => a.step - b.step);
    const steps = exportSteps ? sortedGroups.map((g) => g.step) : [Infinity];
    for (const maxStep of steps) {
      const stepLabel = exportSteps && maxStep !== Infinity ? ` · Step ${maxStep}` : "";
      items.push({ scene, maxStep, label: `Scene ${scene.order}${stepLabel}` });
    }
  }

  // --- Render pages ---
  const totalPages = Math.ceil(items.length / itemsPerPage);

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    if (pageIdx > 0) pdf.addPage();

    // Page header: play title + divider
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(cols === 1 && rows === 1 ? 9 : 8);
    pdf.setTextColor(156, 163, 175);
    pdf.text(play.title, PAGE_W - MARGIN, MARGIN + (PAGE_HEADER_H - 4), { align: "right" });
    pdf.setDrawColor(229, 231, 235);
    pdf.setLineWidth(0.3);
    pdf.line(MARGIN, MARGIN + PAGE_HEADER_H - 2, PAGE_W - MARGIN, MARGIN + PAGE_HEADER_H - 2);

    const pageItems = items.slice(pageIdx * itemsPerPage, (pageIdx + 1) * itemsPerPage);

    for (let i = 0; i < pageItems.length; i++) {
      const { scene, maxStep, label } = pageItems[i];
      const col = i % cols;
      const row = Math.floor(i / cols);

      const cellX = MARGIN + col * (cellW + CELL_GAP);
      const cellY = MARGIN + PAGE_HEADER_H + row * (cellH + CELL_GAP);

      // Per-cell label (only in multi-cell layouts)
      if (CELL_LABEL_H > 0) {
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(7);
        pdf.setTextColor(31, 41, 55);
        pdf.text(label, cellX, cellY + 5);
        if (scene.note) {
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(6);
          pdf.setTextColor(107, 114, 128);
          const labelW = pdf.getTextWidth(label);
          pdf.text(scene.note, cellX + labelW + 2, cellY + 5);
        }
      } else {
        // 1×1: full-width header with scene label + divider
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(11);
        pdf.setTextColor(31, 41, 55);
        pdf.text(label, MARGIN, MARGIN + 8);
        if (scene.note) {
          const labelW = pdf.getTextWidth(label);
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(9);
          pdf.setTextColor(107, 114, 128);
          pdf.text(scene.note, MARGIN + labelW + 3, MARGIN + 8);
        }
      }

      // Render court canvas
      const sceneFlipped = (scene.flipped ?? play.flipped) === true;
      const canvas = renderScene(scene, play.courtType, sceneFlipped, maxStep);
      const imgData = canvas.toDataURL("image/jpeg", 0.92);

      // Scale court image to fit cell image area, preserving aspect ratio
      const imgAspect = canvas.width / canvas.height;
      const imgAreaY = cellY + CELL_LABEL_H;
      let imgW: number, imgH: number;
      if (imgAspect >= cellW / imgAreaH) {
        imgW = cellW;
        imgH = cellW / imgAspect;
      } else {
        imgH = imgAreaH;
        imgW = imgAreaH * imgAspect;
      }
      const imgX = cellX + (cellW - imgW) / 2;
      const imgY = imgAreaY + (imgAreaH - imgH) / 2;

      pdf.addImage(imgData, "JPEG", imgX, imgY, imgW, imgH);
    }
  }

  const safe = play.title.replace(/[^\w\s-]/g, "").trim() || "play";
  pdf.save(`${safe}.pdf`);
}
