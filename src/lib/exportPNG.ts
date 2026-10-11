"use client";

/**
 * PNG export utility for a single scene.
 *
 * Implements issue #79: PNG export of single scene.
 *
 * A PNG is one frame of the export pipeline: it is drawn by the same frame
 * painter as MP4 / PDF (renderSceneToCtx in frameRenderer.ts) with every
 * annotation of the scene visible, so a PNG of a scene is the same picture as
 * a video frame of that scene at the same width — only the pixel density
 * differs. Court geometry, norm→pixel mapping and token sizes all come from
 * the shared modules (courtLayout / courtRendering / tokenSizing) through that
 * painter; nothing is duplicated here.
 *
 * All rendering is self-contained (no DOM capture) so it works even when the
 * editor is not visible.
 */

import type { Scene } from "./types";
import { computeCourtLayout } from "@/lib/courtLayout";
import type { CourtVariant } from "@/lib/courtLayout";
import { renderSceneToCtx } from "./frameRenderer";
import type { FrameStyle } from "./frameRenderer";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type ExportResolution = "1x" | "2x" | "3x";

const RESOLUTION_SCALE: Record<ExportResolution, number> = {
  "1x": 1,
  "2x": 2,
  "3x": 3,
};

/** Label mode, names and team colours (FrameStyle) plus the court variant. */
export interface ExportPNGOptions extends FrameStyle {
  /** Court variant. Default "half". */
  variant?: CourtVariant;
}

/**
 * Size `canvas` for the export and draw the scene on it.
 *
 * Follows the shared renderer recipe: the layout is built in logical px for
 * `baseWidth`, the backing store is layout × `scale`, and the context is
 * scaled once before the frame painter runs. Split from exportSceneAsPNG so it
 * can be driven without a DOM.
 *
 * @param baseWidth  Total export width in logical px (including OOB side margins).
 * @param scale      Pixel density multiplier.
 */
export function renderPNGToCanvas(
  canvas: HTMLCanvasElement,
  scene: Scene,
  baseWidth: number,
  scale: number,
  flipped = false,
  options: ExportPNGOptions = {},
): void {
  const { variant = "half", ...style } = options;
  const layout = computeCourtLayout(baseWidth, variant);

  canvas.width = Math.round(layout.totalWidth * scale);
  canvas.height = Math.round(layout.totalHeight * scale);

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.scale(scale, scale);
  renderSceneToCtx(
    ctx,
    layout,
    scene,
    scene.timingGroups.flatMap((g) => g.annotations),
    flipped,
    style,
  );
}

/**
 * Export the given scene as a PNG and trigger a browser download.
 *
 * @param scene         The scene to export.
 * @param baseWidth     Desired export width in CSS pixels (height derived from the court layout).
 * @param resolution    Pixel density multiplier ("1x" | "2x" | "3x").
 * @param filename      Suggested download filename (without .png extension).
 * @param flipped       When true, basket is at the top (north) — mirrors play/scene flip flag.
 * @param options       Court variant, label mode and team colours.
 */
export function exportSceneAsPNG(
  scene: Scene,
  baseWidth: number = 800,
  resolution: ExportResolution = "2x",
  filename: string = "play-scene",
  flipped = false,
  options: ExportPNGOptions = {},
): void {
  const canvas = document.createElement("canvas");
  renderPNGToCanvas(canvas, scene, baseWidth, RESOLUTION_SCALE[resolution], flipped, options);

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
