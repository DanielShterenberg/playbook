"use client";

/**
 * Video (H.264 MP4) export utility — renders the full play animation as a video.
 *
 * Uses the WebCodecs API (VideoEncoder) + mp4-muxer to produce a proper H.264
 * MP4 file that plays in QuickTime, WhatsApp, iMessage, and all video players.
 *
 * Why not MediaRecorder?
 *   Chrome's MediaRecorder only produces WebM (VP8/VP9), which QuickTime and
 *   WhatsApp do not support. WebCodecs gives us true H.264 in all browsers.
 *
 * Browser support: Chrome 94+, Safari 16.4+, Edge 94+.
 * Firefox: WebCodecs H.264 is behind a flag — falls back to MediaRecorder WebM.
 *
 * Key advantage over MediaRecorder: frames are encoded without waiting real time,
 * so a 3-scene play with 2-second steps exports in seconds, not minutes.
 */

import { Muxer, ArrayBufferTarget } from "mp4-muxer";
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
// WebCodecs H.264 export (primary path)
// ---------------------------------------------------------------------------

async function exportViaWebCodecs(
  play: Play,
  filename: string,
  options: ExportVideoOptions,
): Promise<void> {
  const { speed = 1, resolution = "sd", onProgress } = options;

  const width  = RESOLUTION_WIDTH[resolution];
  const height = Math.round(width / COURT_ASPECT_RATIO);
  // H.264 requires dimensions divisible by 2
  const encW = width  % 2 === 0 ? width  : width  - 1;
  const encH = height % 2 === 0 ? height : height - 1;

  const canvas = document.createElement("canvas");
  canvas.width  = encW;
  canvas.height = encH;

  // WhatsApp requires an audio track to display video inline (video-only MP4s
  // are rejected or shown as raw file attachments). We add a silent AAC track.
  const SAMPLE_RATE = 44100;

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width: encW, height: encH },
    audio: { codec: "aac", sampleRate: SAMPLE_RATE, numberOfChannels: 1 },
    fastStart: "in-memory",
  });

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { throw e; },
  });

  videoEncoder.configure({
    codec: "avc1.4d0028", // H.264 Main Profile Level 4.0
    width: encW,
    height: encH,
    bitrate: resolution === "hd" ? 3_000_000 : 1_500_000,
    framerate: 30,
    latencyMode: "quality",
  });

  const audioEncoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (e) => { throw e; },
  });

  audioEncoder.configure({
    codec: "mp4a.40.2", // AAC-LC
    sampleRate: SAMPLE_RATE,
    numberOfChannels: 1,
    bitrate: 64_000,
  });

  const scenes = [...play.scenes].sort((a, b) => a.order - b.order);

  // Pre-calculate total video duration so we can add the right amount of silence
  let totalDurationMs = 0;
  for (let si = 0; si < scenes.length; si++) {
    for (const g of scenes[si].timingGroups) totalDurationMs += g.duration / speed;
    totalDurationMs += (si === scenes.length - 1 ? FINAL_HOLD_MS : SCENE_HOLD_MS) / speed;
  }

  // Encode one chunk of silence covering the full duration
  const totalSamples = Math.ceil((totalDurationMs / 1000) * SAMPLE_RATE);
  const silence = new AudioData({
    format: "f32-planar",
    sampleRate: SAMPLE_RATE,
    numberOfFrames: totalSamples,
    numberOfChannels: 1,
    timestamp: 0,
    data: new Float32Array(totalSamples),
  });
  audioEncoder.encode(silence);
  silence.close();

  let totalSteps = 0;
  for (const scene of scenes) totalSteps += scene.timingGroups.length + 1;
  let stepsRendered = 0;

  let timestampUs = 0; // running encode timestamp in microseconds

  const encodeFrame = (durationMs: number, keyFrame: boolean) => {
    const durationUs = Math.round((durationMs / speed) * 1000);
    const frame = new VideoFrame(canvas, { timestamp: timestampUs, duration: durationUs });
    videoEncoder.encode(frame, { keyFrame });
    frame.close();
    timestampUs += durationUs;
  };

  for (let si = 0; si < scenes.length; si++) {
    const scene = scenes[si];
    const sceneFlipped = (scene.flipped ?? play.flipped) === true;
    const sortedGroups = [...scene.timingGroups].sort((a, b) => a.step - b.step);
    const cumulativeAnnotations: Annotation[] = [];

    for (let gi = 0; gi < sortedGroups.length; gi++) {
      const group = sortedGroups[gi];
      cumulativeAnnotations.push(...group.annotations);
      renderFrame(canvas, scene, cumulativeAnnotations, encW, encH, sceneFlipped);
      encodeFrame(group.duration, si === 0 && gi === 0);

      stepsRendered++;
      onProgress?.(stepsRendered / totalSteps);
      // Yield occasionally so the UI stays responsive
      if (stepsRendered % 5 === 0) await new Promise<void>((r) => setTimeout(r, 0));
    }

    // Hold frame
    const holdMs = si === scenes.length - 1 ? FINAL_HOLD_MS : SCENE_HOLD_MS;
    renderFrame(canvas, scene, [...cumulativeAnnotations], encW, encH, sceneFlipped);
    encodeFrame(holdMs, false);

    stepsRendered++;
    onProgress?.(stepsRendered / totalSteps);
  }

  await videoEncoder.flush();
  await audioEncoder.flush();
  muxer.finalize();

  const { buffer } = muxer.target;
  const blob = new Blob([buffer], { type: "video/mp4" });
  triggerDownload(blob, `${filename}.mp4`);
}

// ---------------------------------------------------------------------------
// MediaRecorder fallback (Firefox / older browsers)
// ---------------------------------------------------------------------------

async function exportViaMediaRecorder(
  play: Play,
  filename: string,
  options: ExportVideoOptions,
): Promise<void> {
  const { speed = 1, resolution = "sd", onProgress } = options;

  const width  = RESOLUTION_WIDTH[resolution];
  const height = Math.round(width / COURT_ASPECT_RATIO);

  const canvas = document.createElement("canvas");
  canvas.width  = width;
  canvas.height = height;

  const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
    ? "video/webm;codecs=vp9"
    : "video/webm";

  const stream   = canvas.captureStream(30);
  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  recorder.start();

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

    const holdMs = (si === scenes.length - 1 ? FINAL_HOLD_MS : SCENE_HOLD_MS) / speed;
    renderFrame(canvas, scene, [...cumulativeAnnotations], width, height, sceneFlipped);
    await new Promise<void>((r) => setTimeout(r, holdMs));
    stepsRendered++;
    onProgress?.(stepsRendered / totalSteps);
  }

  await new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
    recorder.stop();
  });

  const blob = new Blob(chunks, { type: mimeType });
  triggerDownload(blob, `${filename}.webm`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement("a");
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function supportsWebCodecs(): boolean {
  return (
    typeof VideoEncoder !== "undefined" &&
    typeof VideoFrame   !== "undefined"
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function exportPlayAsVideo(
  play: Play,
  filename = "play",
  options: ExportVideoOptions = {},
): Promise<void> {
  if (supportsWebCodecs()) {
    await exportViaWebCodecs(play, filename, options);
  } else {
    await exportViaMediaRecorder(play, filename, options);
  }
}
