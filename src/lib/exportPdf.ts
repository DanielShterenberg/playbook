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
 * the same frame painter as GIF / MP4 / PNG (renderSceneToCtx in frameRenderer.ts)
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
import { renderSceneToCtx } from "./frameRenderer";
import type { FrameStyle } from "./frameRenderer";
import { asciiPunctuation, exportFileBase, fitText, needsRasterText, rasterTextImage } from "./export";
import type { jsPDF } from "jspdf";

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
// Text
// ---------------------------------------------------------------------------

const MM_PER_PT = 25.4 / 72;
/** Canvas pixels per mm for rasterised text (~300 dpi). */
const TEXT_PX_PER_MM = 12;

interface PdfTextOptions {
  /** Font size in pt. */
  size: number;
  color: [number, number, number];
  align?: "left" | "right";
  /** Widest the text may be, in mm; longer text is cut with an ellipsis. */
  maxWidth: number;
}

/**
 * Draw user text (play title, scene note) on one line — line breaks become
 * spaces, and what does not fit `maxWidth` is cut — with its baseline at
 * (x, y) mm. Latin text is real PDF text in helvetica. Anything jsPDF's
 * built-in fonts cannot draw — Hebrew team and play names above all — is
 * drawn by the browser on a canvas (which shapes right-to-left text
 * correctly) and placed as an image of the same size and colour.
 */
function drawPdfText(pdf: jsPDF, raw: string, x: number, y: number, opts: PdfTextOptions): void {
  const single = raw.replace(/\s+/g, " ").trim();
  if (!single) return;
  const { size, color, align = "left", maxWidth } = opts;
  if (maxWidth <= 0) return;

  const vector = (text: string) => {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(size);
    pdf.setTextColor(color[0], color[1], color[2]);
    // "…" is outside Latin-1, so vector text is cut with three dots.
    pdf.text(fitText(text, maxWidth, (t) => pdf.getTextWidth(t), "..."), x, y, { align });
  };

  const latin = asciiPunctuation(single);
  if (!needsRasterText(latin)) {
    vector(latin);
    return;
  }

  const image = rasterTextImage(single, size * MM_PER_PT * TEXT_PX_PER_MM, color, maxWidth * TEXT_PX_PER_MM);
  if (!image) {
    // No canvas to draw on: imperfect text beats a missing title.
    vector(latin);
    return;
  }
  const wMm = image.width / TEXT_PX_PER_MM;
  const left = align === "right" ? x - wMm : x;
  pdf.addImage(image.dataUrl, "PNG", left, y - image.baseline / TEXT_PX_PER_MM, wMm, image.height / TEXT_PX_PER_MM);
}

// ---------------------------------------------------------------------------
// PDF assembly
// ---------------------------------------------------------------------------

/** One court panel of the PDF. */
export interface PdfPanel {
  scene: Scene;
  /** Step filter for drawPdfSceneOnCanvas (Infinity = every annotation). */
  maxStep: number;
  /** "Scene 2" or "Scene 2 · Step 1". */
  label: string;
}

/**
 * The panels of a play's PDF, in order: one per scene, or — with
 * `exportSteps` — one per timing step of each scene (cumulative reveal).
 * A scene without timing groups has no step to reveal but is still part of the
 * play, so it always gets one panel showing the whole scene.
 */
export function pdfPanels(play: Play, exportSteps: boolean): PdfPanel[] {
  const items: PdfPanel[] = [];
  const scenes = [...play.scenes].sort((a, b) => a.order - b.order);
  scenes.forEach((scene, sceneIdx) => {
    const sortedSteps = [...scene.timingGroups].sort((a, b) => a.step - b.step).map((g) => g.step);
    const steps = exportSteps && sortedSteps.length > 0 ? sortedSteps : [Infinity];
    for (const maxStep of steps) {
      const stepLabel = maxStep !== Infinity ? ` · Step ${maxStep}` : "";
      items.push({ scene, maxStep, label: `Scene ${sceneIdx + 1}${stepLabel}` });
    }
  });
  return items;
}

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
  const items = pdfPanels(play, exportSteps);

  // --- Render pages ---
  const totalPages = Math.ceil(items.length / itemsPerPage);

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    if (pageIdx > 0) pdf.addPage();

    // Page header: play title + divider
    drawPdfText(pdf, play.title, PAGE_W - MARGIN, MARGIN + (PAGE_HEADER_H - 4), {
      size: cols === 1 && rows === 1 ? 9 : 8,
      color: [156, 163, 175],
      align: "right",
      // In 1×1 the scene label and note share this line: the title gets the right half.
      maxWidth: cols === 1 && rows === 1 ? usableW / 2 : usableW,
    });
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
          const labelW = pdf.getTextWidth(label);
          drawPdfText(pdf, scene.note, cellX + labelW + 2, cellY + 5, {
            size: 6,
            color: [107, 114, 128],
            maxWidth: cellW - labelW - 2,
          });
        }
      } else {
        // 1×1: full-width header with scene label + divider
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(11);
        pdf.setTextColor(31, 41, 55);
        pdf.text(label, MARGIN, MARGIN + 8);
        if (scene.note) {
          const labelW = pdf.getTextWidth(label);
          // The play title is right-aligned on the same line; the note gets the left half.
          drawPdfText(pdf, scene.note, MARGIN + labelW + 3, MARGIN + 8, {
            size: 9,
            color: [107, 114, 128],
            maxWidth: usableW / 2 - labelW - 3,
          });
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

  pdf.save(`${exportFileBase(play.title)}.pdf`);
}
