"use client";

/**
 * ExportMenu — dropdown menu for scene/play export options.
 *
 * Implements issue #79: PNG export of single scene.
 * Implements issue #77: Video (MP4/WebM) export of play animation.
 *
 * Renders an "Export" button that opens a small dropdown with:
 *   - Export Image (PNG) — current scene, configurable resolution
 *   - Export Video       — full play animation, configurable speed + resolution
 *   - Export PDF         — play document, configurable layout
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useStore, selectEditorScene } from "@/lib/store";
import { exportSceneAsPNG, type ExportResolution } from "@/lib/exportPNG";
import { exportPlayAsVideo, type VideoResolution } from "@/lib/exportVideo";
import { exportPlayToPdf, type PdfLayout } from "@/lib/exportPdf";
import { ACCENT_BTN, ACCENT_CONTROL, POPOVER } from "./chrome";
import { exportFileBase } from "@/lib/export";

/** Section heading inside the menu. */
const HEADING = "font-display text-sm font-semibold uppercase tracking-[0.08em] text-muted";
/** Small option chip (speed, resolution, layout); selected state follows aria-pressed. */
const CHIP =
  "flex min-h-11 min-w-11 items-center justify-center rounded-md bg-chip px-2.5 text-xs font-medium text-ink transition-colors hover:bg-line aria-pressed:bg-accent aria-pressed:text-accent-ink md:min-h-7 md:min-w-0";
/** One export action row (icon tile + title + summary). */
const ACTION =
  "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-ink transition-colors hover:bg-chip disabled:cursor-not-allowed disabled:opacity-40";
const ACTION_ICON = "flex h-8 w-8 flex-none items-center justify-center rounded-md bg-chip text-accent-text";

// ---------------------------------------------------------------------------
// Resolution options (PNG)
// ---------------------------------------------------------------------------

const PNG_RESOLUTION_OPTIONS: { label: string; value: ExportResolution; description: string }[] = [
  { label: "Standard (1×)", value: "1x", description: "800 px wide" },
  { label: "High (2×)", value: "2x", description: "1600 px wide" },
  { label: "Ultra (3×)", value: "3x", description: "2400 px wide" },
];

// ---------------------------------------------------------------------------
// Speed + resolution options (Video)
// ---------------------------------------------------------------------------

const VIDEO_SPEED_OPTIONS: { label: string; value: number }[] = [
  { label: "0.5×", value: 0.5 },
  { label: "1×", value: 1 },
  { label: "1.5×", value: 1.5 },
  { label: "2×", value: 2 },
];

const VIDEO_RESOLUTION_OPTIONS: { label: string; value: VideoResolution; description: string }[] = [
  { label: "SD", value: "sd", description: "480 px — small file" },
  { label: "HD", value: "hd", description: "800 px — sharper" },
];

// ---------------------------------------------------------------------------
// Icon helpers
// ---------------------------------------------------------------------------

function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 1v9M5 7l3 3 3-3M2 11v2a1 1 0 001 1h10a1 1 0 001-1v-2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PdfIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="1" width="10" height="13" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 5h4M5 8h4M5 11h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M10 1v3.5H13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1" y="3" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M11 6l4-2v8l-4-2V6z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Progress bar sub-component
// ---------------------------------------------------------------------------

function ProgressBar({ fraction }: { fraction: number }) {
  const pct = Math.round(fraction * 100);
  return (
    <div className="px-4 py-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-ink">Rendering video…</span>
        <span className="text-xs tabular-nums text-muted">{pct}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-full bg-accent transition-all duration-150"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type ExportMode = "idle" | "png" | "video" | "pdf";

export default function ExportMenu() {
  const scene = useStore(selectEditorScene);
  const currentPlay = useStore((s) => s.currentPlay);
  const displayMode = useStore((s) => s.playerDisplayMode);
  const playerNames = useStore((s) => s.playerNames);

  const [open, setOpen] = useState(false);
  const [exportMode, setExportMode] = useState<ExportMode>("idle");
  const [videoProgress, setVideoProgress] = useState(0);

  // PNG settings
  const [pngResolution, setPngResolution] = useState<ExportResolution>("2x");

  // Video settings
  const [videoSpeed, setVideoSpeed] = useState<number>(1);
  const [videoResolution, setVideoResolution] = useState<VideoResolution>("sd");

  // PDF settings
  const [pdfExportSteps, setPdfExportSteps] = useState(false);
  const [pdfLayout, setPdfLayout] = useState<PdfLayout>("1x1");

  const menuRef = useRef<HTMLDivElement>(null);
  const isExporting = exportMode !== "idle";

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const handleExportPNG = useCallback(async () => {
    if (!scene) return;
    setExportMode("png");
    setOpen(false);
    try {
      const safeTitle = exportFileBase(currentPlay?.title);
      const sceneIndex = (currentPlay?.scenes.findIndex((s) => s.id === scene.id) ?? 0) + 1;
      const filename = `${safeTitle}-scene-${sceneIndex}`;
      const flipped = (scene.flipped ?? currentPlay?.flipped) === true;
      exportSceneAsPNG(scene, 800, pngResolution, filename, flipped, {
        variant: currentPlay?.courtType,
        displayMode,
        playerNames,
        offenseColor: currentPlay?.colors?.offense,
        defenseColor: currentPlay?.colors?.defense,
      });
    } finally {
      setTimeout(() => setExportMode("idle"), 500);
    }
  }, [scene, currentPlay, pngResolution, displayMode, playerNames]);

  const handleExportPDF = useCallback(async () => {
    if (!currentPlay) return;
    setExportMode("pdf");
    setOpen(false);
    try {
      await exportPlayToPdf(currentPlay, {
        exportSteps: pdfExportSteps,
        layout: pdfLayout,
        displayMode,
        playerNames,
        offenseColor: currentPlay.colors?.offense,
        defenseColor: currentPlay.colors?.defense,
      });
    } finally {
      setExportMode("idle");
    }
  }, [currentPlay, pdfExportSteps, pdfLayout, displayMode, playerNames]);

  const handleExportVideo = useCallback(async () => {
    if (!currentPlay) return;
    setExportMode("video");
    setVideoProgress(0);
    setOpen(false);
    try {
      const safeTitle = exportFileBase(currentPlay.title);
      await exportPlayAsVideo(currentPlay, safeTitle, {
        speed: videoSpeed,
        resolution: videoResolution,
        onProgress: (fraction) => setVideoProgress(fraction),
        displayMode,
        playerNames,
        offenseColor: currentPlay.colors?.offense,
        defenseColor: currentPlay.colors?.defense,
      });
    } finally {
      setExportMode("idle");
      setVideoProgress(0);
    }
  }, [currentPlay, videoSpeed, videoResolution, displayMode, playerNames]);

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        className={ACCENT_BTN}
        onClick={() => setOpen((v) => !v)}
        disabled={isExporting || !scene}
        aria-haspopup="true"
        aria-expanded={open}
      >
        {exportMode === "png" || exportMode === "pdf"
          ? "Exporting…"
          : exportMode === "video"
            ? `Video ${Math.round(videoProgress * 100)}%`
            : "Export"}
      </button>

      {/* Video progress — shown below the button while rendering */}
      {exportMode === "video" && (
        <div className={`${POPOVER} absolute right-0 top-full z-50 mt-1 w-56`}>
          <ProgressBar fraction={videoProgress} />
        </div>
      )}

      {open && !isExporting && (
        <div
          className={`${POPOVER} absolute right-0 top-full z-50 mt-1 max-h-[calc(100vh-76px)] w-72 overflow-y-auto`}
          role="menu"
          aria-label="Export options"
        >
          {/* ---------------------------------------------------------------- */}
          {/* PNG section                                                       */}
          {/* ---------------------------------------------------------------- */}
          <div className="border-b border-line px-4 py-2.5">
            <p className={HEADING}>
              Export Scene
            </p>
          </div>

          {/* PNG resolution picker */}
          <div className="px-4 py-3">
            <p className="mb-2 text-xs font-medium text-muted">PNG Resolution</p>
            <div className="flex flex-col gap-1.5">
              {PNG_RESOLUTION_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-md px-2 hover:bg-app md:min-h-8"
                >
                  <input
                    type="radio"
                    name="export-png-resolution"
                    value={opt.value}
                    checked={pngResolution === opt.value}
                    onChange={() => setPngResolution(opt.value)}
                    className={ACCENT_CONTROL}
                  />
                  <span className="flex-1 text-sm text-ink">{opt.label}</span>
                  <span className="text-xs text-muted">{opt.description}</span>
                </label>
              ))}
            </div>
          </div>

          {/* PNG export button */}
          <div className="border-t border-line p-2">
            <button
              type="button"
              className={ACTION}
              role="menuitem"
              onClick={handleExportPNG}
              disabled={!scene}
            >
              <span className={ACTION_ICON}>
                <DownloadIcon />
              </span>
              <span>
                <span className="block font-medium">Export as PNG</span>
                <span className="block text-xs text-muted">
                  Current scene · {pngResolution} resolution
                </span>
              </span>
            </button>
          </div>

          {/* ---------------------------------------------------------------- */}
          {/* Video section                                                     */}
          {/* ---------------------------------------------------------------- */}
          <div className="border-y border-line px-4 py-2.5">
            <p className={HEADING}>
              Export Play Animation
            </p>
          </div>

          {/* Video speed + resolution */}
          <div className="px-4 py-3">
            <div className="mb-3">
              <p className="mb-1.5 text-xs font-medium text-muted">Playback Speed</p>
              <div className="flex gap-1.5">
                {VIDEO_SPEED_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setVideoSpeed(opt.value)}
                    aria-pressed={videoSpeed === opt.value}
                    className={CHIP}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-medium text-muted">Resolution</p>
              <div className="flex gap-1.5">
                {VIDEO_RESOLUTION_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setVideoResolution(opt.value)}
                    aria-pressed={videoResolution === opt.value}
                    title={opt.description}
                    className={CHIP}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-muted">
                {VIDEO_RESOLUTION_OPTIONS.find((o) => o.value === videoResolution)?.description}
              </p>
            </div>
          </div>

          {/* Video export button */}
          <div className="border-t border-line p-2">
            <button
              type="button"
              className={ACTION}
              role="menuitem"
              onClick={handleExportVideo}
              disabled={!currentPlay}
            >
              <span className={ACTION_ICON}>
                <VideoIcon />
              </span>
              <span>
                <span className="block font-medium">Export as Video</span>
                <span className="block text-xs text-muted">
                  All {currentPlay?.scenes.length ?? 0} scene
                  {(currentPlay?.scenes.length ?? 0) !== 1 ? "s" : ""} · {videoSpeed}× speed ·{" "}
                  {videoResolution.toUpperCase()} · MP4/WebM
                </span>
              </span>
            </button>
          </div>

          {/* ---------------------------------------------------------------- */}
          {/* PDF section                                                       */}
          {/* ---------------------------------------------------------------- */}
          <div className="border-y border-line px-4 py-2.5">
            <p className={HEADING}>
              Export Play Document
            </p>
          </div>
          <div className="px-4 py-3 flex flex-col gap-3">
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted">Layout</p>
              <div className="flex gap-1.5 flex-wrap">
                {(["1x1", "2x1", "2x2", "3x2"] as PdfLayout[]).map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setPdfLayout(l)}
                    aria-pressed={pdfLayout === l}
                    className={CHIP}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex min-h-11 cursor-pointer items-center gap-2.5 md:min-h-0">
              <input
                type="checkbox"
                checked={pdfExportSteps}
                onChange={(e) => setPdfExportSteps(e.target.checked)}
                className={ACCENT_CONTROL}
              />
              <span className="text-sm text-ink">Export steps</span>
              <span className="text-xs text-muted">(cumulative reveal)</span>
            </label>
          </div>
          <div className="border-t border-line p-2">
            <button
              type="button"
              className={ACTION}
              role="menuitem"
              onClick={handleExportPDF}
              disabled={!currentPlay}
            >
              <span className={ACTION_ICON}>
                <PdfIcon />
              </span>
              <span>
                <span className="block font-medium">Export as PDF</span>
                <span className="block text-xs text-muted">
                  All {currentPlay?.scenes.length ?? 0} scene
                  {(currentPlay?.scenes.length ?? 0) !== 1 ? "s" : ""}
                  {pdfExportSteps ? " · per step" : " · per scene"} · {pdfLayout} layout
                </span>
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
