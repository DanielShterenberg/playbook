"use client";

/**
 * Video (MP4/WebM) export utility — renders the full play animation as a video.
 *
 * Reuses the same court/player/annotation rendering pipeline as exportGIF.ts
 * but encodes via the browser's MediaRecorder API instead of gifenc.
 *
 * Why video instead of GIF:
 *   - WhatsApp and most messaging apps play video files natively and animated.
 *   - GIF files are treated as static images by WhatsApp's media picker.
 *   - Video files are ~10× smaller than equivalent GIFs.
 *
 * Format selection (automatic, based on browser support):
 *   - Safari (iPhone/Mac): H.264 MP4  → downloads as .mp4
 *   - Chrome / Firefox:    VP9 WebM   → downloads as .webm
 *   Both formats are accepted by WhatsApp when sent as a video.
 */

import type { Play, Annotation } from "./types";
import { COURT_ASPECT_RATIO } from "@/components/court/courtDimensions";
import {
  renderFrame,
  SCENE_HOLD_MS,
  FINAL_HOLD_MS,
  RESOLUTION_WIDTH,
} from "./exportGIF";
import type { GifResolution } from "./exportGIF";

export type VideoResolution = GifResolution;

export interface ExportVideoOptions {
  speed?: number;
  resolution?: VideoResolution;
  onProgress?: (fraction: number) => void;
}

// ---------------------------------------------------------------------------
// Format detection
// ---------------------------------------------------------------------------

function detectFormat(): { mimeType: string; ext: "mp4" | "webm" } {
  const candidates = [
    { mimeType: "video/mp4;codecs=h264", ext: "mp4" as const },
    { mimeType: "video/mp4",             ext: "mp4" as const },
    { mimeType: "video/webm;codecs=vp9", ext: "webm" as const },
    { mimeType: "video/webm;codecs=vp8", ext: "webm" as const },
    { mimeType: "video/webm",            ext: "webm" as const },
  ];
  for (const f of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(f.mimeType)) {
      return f;
    }
  }
  return { mimeType: "video/webm", ext: "webm" };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function exportPlayAsVideo(
  play: Play,
  filename = "play",
  options: ExportVideoOptions = {},
): Promise<void> {
  const { speed = 1, resolution = "sd", onProgress } = options;

  const width  = RESOLUTION_WIDTH[resolution];
  const height = Math.round(width / COURT_ASPECT_RATIO);

  const canvas = document.createElement("canvas");
  canvas.width  = width;
  canvas.height = height;

  const format  = detectFormat();
  const stream  = canvas.captureStream(30);
  const recorder = new MediaRecorder(
    stream,
    format.mimeType ? { mimeType: format.mimeType } : {},
  );

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  recorder.start();

  // Sort scenes by order
  const scenes = [...play.scenes].sort((a, b) => a.order - b.order);

  let totalSteps = 0;
  for (const scene of scenes) totalSteps += scene.timingGroups.length + 1;
  let stepsRendered = 0;

  for (let si = 0; si < scenes.length; si++) {
    const scene = scenes[si];
    const sceneFlipped = (scene.flipped ?? play.flipped) === true;
    const sortedGroups = [...scene.timingGroups].sort((a, b) => a.step - b.step);
    const cumulativeAnnotations: Annotation[] = [];

    for (const group of sortedGroups) {
      cumulativeAnnotations.push(...group.annotations);
      renderFrame(canvas, scene, cumulativeAnnotations, width, height, sceneFlipped);
      await new Promise<void>((r) => setTimeout(r, group.duration / speed));
      stepsRendered++;
      onProgress?.(stepsRendered / totalSteps);
    }

    // Hold frame between scenes
    const holdMs = (si === scenes.length - 1 ? FINAL_HOLD_MS : SCENE_HOLD_MS) / speed;
    renderFrame(canvas, scene, cumulativeAnnotations, width, height, sceneFlipped);
    await new Promise<void>((r) => setTimeout(r, holdMs));
    stepsRendered++;
    onProgress?.(stepsRendered / totalSteps);
  }

  // Stop and collect
  await new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
    recorder.stop();
  });

  const blob = new Blob(chunks, { type: format.mimeType });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `${filename}.${format.ext}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
