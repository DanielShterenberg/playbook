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

function drawAnnotation(
  ctx: CanvasRenderingContext2D,
  ann: Annotation,
  canvasW: number,
  canvasH: number,
): void {
  // Annotations stored in normalised [0-1] coords relative to full canvas.
  const fx = ann.from.x * canvasW;
  const fy = ann.from.y * canvasH;
  const tx = ann.to.x * canvasW;
  const ty = ann.to.y * canvasH;

  const color = ANN_COLOR[ann.type] ?? "#1E3A5F";

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = ANN_LINE_W;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (ann.type === "movement" || ann.type === "pass") {
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    drawArrowHead(ctx, tx, ty, fx, fy, ANN_ARROW_SIZE);

  } else if (ann.type === "dribble") {
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

  } else if (ann.type === "screen") {
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(tx, ty);
    ctx.stroke();

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
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.setLineDash([]);
    drawArrowHead(ctx, tx, ty, fx, fy, ANN_ARROW_SIZE);
  }

  ctx.setLineDash([]);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Scene → canvas
// ---------------------------------------------------------------------------

function renderScene(scene: Scene, courtType: "half" | "full"): HTMLCanvasElement {
  const halfH = Math.round(EXPORT_W / HALF_COURT_ASPECT);
  const H = courtType === "full" ? halfH * 2 : halfH;

  // Play-area offset: where players live on the canvas
  const paH = halfH;
  const paOffY = courtType === "full" ? halfH : 0;

  const canvas = document.createElement("canvas");
  canvas.width = EXPORT_W;
  canvas.height = H;

  // Draw court markings
  drawCourt(canvas, EXPORT_W, H, courtType as CourtVariant);

  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  // Defense (underneath offense)
  for (const p of scene.players.defense) {
    if (!p.visible) continue;
    drawPlayer(ctx, "defense", p.position, p.x * EXPORT_W, p.y * paH + paOffY, PLAYER_R);
  }

  // Offense
  for (const p of scene.players.offense) {
    if (!p.visible) continue;
    drawPlayer(ctx, "offense", p.position, p.x * EXPORT_W, p.y * paH + paOffY, PLAYER_R);
  }

  // Ball
  const ball = scene.ball;
  if (ball) {
    let bx = ball.x * EXPORT_W;
    let by = ball.y * paH + paOffY;

    // If attached to a player, float it above them
    if (ball.attachedTo) {
      const pool = ball.attachedTo.side === "offense" ? scene.players.offense : scene.players.defense;
      const attached = pool.find((p) => p.position === ball.attachedTo!.position);
      if (attached) {
        bx = attached.x * EXPORT_W;
        by = attached.y * paH + paOffY - PLAYER_R * 1.2;
      }
    }
    drawBall(ctx, bx, by, BALL_R);
  }

  // Annotations — stored in full-canvas-normalised coords
  for (const group of scene.timingGroups) {
    for (const ann of group.annotations) {
      drawAnnotation(ctx, ann, EXPORT_W, H);
    }
  }

  return canvas;
}

// ---------------------------------------------------------------------------
// PDF assembly
// ---------------------------------------------------------------------------

/**
 * Generates and downloads a PDF of the given play.
 * One page per scene, with the court rendered on each page.
 */
export async function exportPlayToPdf(play: Play): Promise<void> {
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

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];

    if (i > 0) pdf.addPage();

    // Render court + players + ball + annotations
    const canvas = renderScene(scene, play.courtType);
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
    const sceneLabel = `Scene ${scene.order}`;

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

  const safe = play.title.replace(/[^\w\s-]/g, "").trim() || "play";
  pdf.save(`${safe}.pdf`);
}
