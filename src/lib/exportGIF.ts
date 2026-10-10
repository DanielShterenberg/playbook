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
import type { Play, Annotation } from "./types";
import { computeCourtLayout } from "@/lib/courtLayout";
import type { CourtVariant } from "@/lib/courtLayout";
import { renderFrame, SCENE_HOLD_MS, FINAL_HOLD_MS, RESOLUTION_WIDTH } from "./frameRenderer";
import type { FrameResolution } from "./frameRenderer";
import { stepDurationMs } from "./playback";

// Frame painting (court, tokens, annotations), FrameStyle and the frame presets
// live in frameRenderer.ts, shared with the PNG, video and PDF exports. This
// module is only the GIF encoder.

/** Maximum GIF palette size (256 is the GIF spec limit). */
const MAX_COLORS = 128;

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

export type GifResolution = FrameResolution;

export interface ExportGIFOptions {
  /** Playback speed multiplier. Higher = shorter frame durations. Default 1. */
  speed?: number;
  /** Output resolution preset. Default "sd". */
  resolution?: GifResolution;
  /** Called with progress in [0, 1] after each encoded frame. */
  onProgress?: (fraction: number) => void;
}

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
      const rawDuration = stepDurationMs(group) / speed;
      const delayCs = Math.min(Math.max(Math.round(rawDuration / 10), 2), 500);

      renderFrame(canvas, scene, cumulativeAnnotations, width, height, sceneFlipped, {}, variant);
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
    renderFrame(canvas, scene, cumulativeAnnotations, width, height, sceneFlipped, {}, variant);
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
