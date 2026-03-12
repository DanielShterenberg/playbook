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
 *   - Player positions are normalised [0-1] in play-area space.
 *     For half court: play area = full canvas (paOffY = 0).
 *     For full court: play area = bottom half (paOffY = halfH).
 *   - Annotations are stored in normalised [0-1] coords relative to the
 *     FULL canvas (width × height), matching how AnnotationLayer stores them.
 */

import { drawCourt } from "@/components/court/Court";
import type { CourtVariant } from "@/components/court/Court";
import type { Annotation, Play, Scene } from "@/lib/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Canvas width in pixels for the export. Higher = sharper in PDF. */
const EXPORT_W = 1200;

/** Half-court aspect ratio (width / height = 50ft / 47ft). */
const HALF_COURT_ASPECT = 50 / 47;

/** Player token radius as a fraction of court width. */
const PLAYER_R = EXPORT_W * 0.03;

/** Ball radius as a fraction of court width. */
const BALL_R = EXPORT_W * 0.016;

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
  canvasW: number,
  canvasH: number,
  flipped = false,
): void {
  // Annotations stored in normalised [0-1] coords relative to full canvas.
  const ny = (n: number) => flipped ? (1 - n) * canvasH : n * canvasH;
  const fx = ann.from.x * canvasW;
  const fy = ny(ann.from.y);
  const tx = ann.to.x * canvasW;
  const ty = ny(ann.to.y);

  // Multi-leg waypoints
  const hasWaypoints = ann.waypoints && ann.waypoints.length > 0;
  const allPts: { x: number; y: number }[] = hasWaypoints
    ? [{ x: fx, y: fy }, ...(ann.waypoints ?? []).map((p) => ({ x: p.x * canvasW, y: ny(p.y) })), { x: tx, y: ty }]
    : [];

  // Bezier control point (if any — single-leg only)
  let cpx: number | undefined;
  let cpy: number | undefined;
  if (!hasWaypoints && ann.controlPoints.length > 0) {
    cpx = ann.controlPoints[0].x * canvasW;
    cpy = ny(ann.controlPoints[0].y);
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

function renderScene(
  scene: Scene,
  courtType: "half" | "full",
  flipped = false,
  maxStep = Infinity,
): HTMLCanvasElement {
  const halfH = Math.round(EXPORT_W / HALF_COURT_ASPECT);
  const H = courtType === "full" ? halfH * 2 : halfH;

  // Play-area offset: where players live on the canvas
  const paH = halfH;
  const paOffY = courtType === "full" ? halfH : 0;

  const canvas = document.createElement("canvas");
  canvas.width = EXPORT_W;
  canvas.height = H;

  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  // Draw court markings — apply flip transform if needed
  if (flipped) {
    ctx.save();
    ctx.translate(0, H);
    ctx.scale(1, -1);
  }
  drawCourt(canvas, EXPORT_W, H, courtType as CourtVariant);
  if (flipped) ctx.restore();

  // Normalised y → canvas y helper
  const cy = (normY: number) => flipped ? (1 - normY) * paH + paOffY : normY * paH + paOffY;

  // Defense (underneath offense)
  for (const p of scene.players.defense) {
    if (!p.visible) continue;
    drawPlayer(ctx, "defense", p.position, p.x * EXPORT_W, cy(p.y), PLAYER_R);
  }

  // Offense
  for (const p of scene.players.offense) {
    if (!p.visible) continue;
    drawPlayer(ctx, "offense", p.position, p.x * EXPORT_W, cy(p.y), PLAYER_R);
  }

  // Ball
  const ball = scene.ball;
  if (ball) {
    let bx = ball.x * EXPORT_W;
    let by = cy(ball.y);

    // If attached to a player, float it above them
    if (ball.attachedTo) {
      const pool = ball.attachedTo.side === "offense" ? scene.players.offense : scene.players.defense;
      const attached = pool.find((p) => p.position === ball.attachedTo!.position);
      if (attached) {
        bx = attached.x * EXPORT_W;
        // "above" means toward half-court regardless of flip direction
        by = flipped ? cy(attached.y) + PLAYER_R * 1.2 : cy(attached.y) - PLAYER_R * 1.2;
      }
    }
    drawBall(ctx, bx, by, BALL_R);
  }

  // Annotations — cumulative reveal up to maxStep
  const sortedGroups = [...scene.timingGroups].sort((a, b) => a.step - b.step);
  for (const group of sortedGroups) {
    if (group.step > maxStep) break;
    for (const ann of group.annotations) {
      drawAnnotation(ctx, ann, EXPORT_W, H, flipped);
    }
  }

  return canvas;
}

// ---------------------------------------------------------------------------
// PDF assembly
// ---------------------------------------------------------------------------

export interface ExportPdfOptions {
  /** When true, renders one page per timing step (cumulative reveal). Default: false. */
  exportSteps?: boolean;
}

/**
 * Generates and downloads a PDF of the given play.
 * Default: one page per scene. With exportSteps: one page per timing step.
 */
export async function exportPlayToPdf(play: Play, options: ExportPdfOptions = {}): Promise<void> {
  const { exportSteps = false } = options;

  // Dynamic import keeps jsPDF out of the SSR bundle
  const { jsPDF } = await import("jspdf");

  const PAGE_W = 210;   // A4 portrait width (mm)
  const PAGE_H = 297;   // A4 portrait height (mm)
  const MARGIN = 12;    // page margin (mm)
  const HEADER_H = 16;  // height reserved for scene/play title row (mm)

  const usableW = PAGE_W - 2 * MARGIN;
  const usableH = PAGE_H - 2 * MARGIN - HEADER_H;

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const scenes = [...play.scenes].sort((a, b) => a.order - b.order);
  let pageIndex = 0;

  for (const scene of scenes) {
    const sceneFlipped = (scene.flipped ?? play.flipped) === true;
    const sortedGroups = [...scene.timingGroups].sort((a, b) => a.step - b.step);
    const steps = exportSteps ? sortedGroups.map((g) => g.step) : [Infinity];

    for (const maxStep of steps) {
      if (pageIndex > 0) pdf.addPage();
      pageIndex++;

      const canvas = renderScene(scene, play.courtType, sceneFlipped, maxStep);
      const imgData = canvas.toDataURL("image/jpeg", 0.92);

      // Scale to fit usable area while preserving aspect ratio
      const imgAspect = canvas.width / canvas.height;
      let imgW: number;
      let imgH: number;
      if (imgAspect >= usableW / usableH) {
        imgW = usableW;
        imgH = usableW / imgAspect;
      } else {
        imgH = usableH;
        imgW = usableH * imgAspect;
      }
      const imgX = MARGIN + (usableW - imgW) / 2;
      const imgY = MARGIN + HEADER_H;

      // --- Header row ---
      const stepLabel = exportSteps && maxStep !== Infinity ? ` · Step ${maxStep}` : "";
      const sceneLabel = `Scene ${scene.order}${stepLabel}`;

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11);
      pdf.setTextColor(31, 41, 55);
      pdf.text(sceneLabel, MARGIN, MARGIN + 8);

      if (scene.note) {
        const labelW = pdf.getTextWidth(sceneLabel);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9);
        pdf.setTextColor(107, 114, 128);
        pdf.text(scene.note, MARGIN + labelW + 3, MARGIN + 8);
      }

      // Play title — right-aligned
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(156, 163, 175);
      pdf.text(play.title, PAGE_W - MARGIN, MARGIN + 8, { align: "right" });

      // Thin divider under header
      pdf.setDrawColor(229, 231, 235);
      pdf.setLineWidth(0.3);
      pdf.line(MARGIN, MARGIN + HEADER_H - 2, PAGE_W - MARGIN, MARGIN + HEADER_H - 2);

      // --- Court image ---
      pdf.addImage(imgData, "JPEG", imgX, imgY, imgW, imgH);
    }
  }

  const safe = play.title.replace(/[^\w\s-]/g, "").trim() || "play";
  pdf.save(`${safe}.pdf`);
}
