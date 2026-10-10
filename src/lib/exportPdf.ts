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
 * A PDF panel is one frame of the export pipeline (issue #174): it is drawn by
 * the same frame painter as GIF / MP4 / PNG (renderSceneToCtx in exportGIF.ts)
 * on the shared layout at EXPORT_W, so a panel is the same picture as a video
 * frame of that scene — court frame and flip, token positions and sizes, label
 * mode, player names, team colours and annotation styling included. The only
 * thing this module decides is WHICH annotations a panel shows (the "export
 * steps" option reveals them cumulatively, one panel per timing step) and the
 * A4 page / grid layout around the panels.
 */

import { computeCourtLayout } from "@/lib/courtLayout";
import type { CourtVariant } from "@/lib/courtLayout";
import type { Play, Scene } from "@/lib/types";
import { renderSceneToCtx } from "./exportGIF";
import type { FrameStyle } from "./exportGIF";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Canvas width in pixels for the export. Higher = sharper in PDF. */
const EXPORT_W = 1200;
export { EXPORT_W as PDF_EXPORT_W };

// ---------------------------------------------------------------------------
// Scene → canvas
// ---------------------------------------------------------------------------

/**
 * Size `canvas` to the shared court layout and draw the scene on it. Split from
 * renderScene so it can be driven without a DOM.
 *
 * @param style    Label mode, names and team colours — the same FrameStyle the
 *                 PNG and video exports take.
 * @param maxStep  Step filter: only annotations of timing groups with
 *                 step ≤ maxStep are drawn, in step order (cumulative reveal).
 *                 Default Infinity = every annotation of the scene.
 */
export function drawPdfSceneOnCanvas(
  canvas: HTMLCanvasElement,
  scene: Scene,
  courtType: CourtVariant,
  flipped = false,
  maxStep = Infinity,
  style: FrameStyle = {},
): void {
  const layout = computeCourtLayout(EXPORT_W, courtType);

  canvas.width = layout.totalWidth;
  canvas.height = layout.totalHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const visibleAnnotations = [...scene.timingGroups]
    .sort((a, b) => a.step - b.step)
    .filter((group) => group.step <= maxStep)
    .flatMap((group) => group.annotations);

  renderSceneToCtx(ctx, layout, scene, visibleAnnotations, flipped, style);
}

function renderScene(
  scene: Scene,
  courtType: CourtVariant,
  flipped = false,
  maxStep = Infinity,
  style: FrameStyle = {},
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  drawPdfSceneOnCanvas(canvas, scene, courtType, flipped, maxStep, style);
  return canvas;
}

// ---------------------------------------------------------------------------
// PDF assembly
// ---------------------------------------------------------------------------

export type PdfLayout = "1x1" | "2x1" | "2x2" | "3x2";

export interface ExportPdfOptions extends FrameStyle {
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
  const { exportSteps = false, layout = "1x1", ...style } = options;
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
    const sceneIdx = scenes.indexOf(scene);
    const sortedGroups = [...scene.timingGroups].sort((a, b) => a.step - b.step);
    const steps = exportSteps ? sortedGroups.map((g) => g.step) : [Infinity];
    for (const maxStep of steps) {
      const stepLabel = exportSteps && maxStep !== Infinity ? ` · Step ${maxStep}` : "";
      items.push({ scene, maxStep, label: `Scene ${sceneIdx + 1}${stepLabel}` });
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
      const canvas = renderScene(scene, play.courtType, sceneFlipped, maxStep, style);
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
