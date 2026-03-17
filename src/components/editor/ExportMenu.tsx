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
 *
 * Note: GIF export code is preserved in exportGIF.ts for potential future use.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useStore, selectEditorScene } from "@/lib/store";
import { exportSceneAsPNG, type ExportResolution } from "@/lib/exportPNG";
import { exportPlayAsVideo, type VideoResolution } from "@/lib/exportVideo";
import { exportPlayToPdf, type PdfLayout } from "@/lib/exportPdf";

// ---------------------------------------------------------------------------
// Resolution options (PNG)
// ---------------------------------------------------------------------------

const PNG_RESOLUTION_OPTIONS: { label: string; value: ExportResolution; description: string }[] = [
  { label: "Standard (1×)", value: "1x", description: "~800 × 752 px" },
  { label: "High (2×)", value: "2x", description: "~1600 × 1504 px" },
  { label: "Ultra (3×)", value: "3x", description: "~2400 × 2256 px" },
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
        <span className="text-xs font-medium text-gray-600">Rendering video…</span>
        <span className="text-xs text-gray-500">{pct}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full bg-blue-500 transition-all duration-150"
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
      const title = currentPlay?.title ?? "play";
      const safeTitle = title.replace(/[^a-zA-Z0-9-_\s]/g, "").trim().replace(/\s+/g, "-");
      const sceneIndex = (currentPlay?.scenes.findIndex((s) => s.id === scene.id) ?? 0) + 1;
      const filename = `${safeTitle}-scene-${sceneIndex}`;
      const flipped = (scene.flipped ?? currentPlay?.flipped) === true;
      exportSceneAsPNG(scene, 800, pngResolution, filename, flipped);
    } finally {
      setTimeout(() => setExportMode("idle"), 500);
    }
  }, [scene, currentPlay, pngResolution]);

  const handleExportPDF = useCallback(async () => {
    if (!currentPlay) return;
    setExportMode("pdf");
    setOpen(false);
    try {
      await exportPlayToPdf(currentPlay, { exportSteps: pdfExportSteps, layout: pdfLayout });
    } finally {
      setExportMode("idle");
    }
  }, [currentPlay, pdfExportSteps, pdfLayout]);

  const handleExportVideo = useCallback(async () => {
    if (!currentPlay) return;
    setExportMode("video");
    setVideoProgress(0);
    setOpen(false);
    try {
      const title = currentPlay.title ?? "play";
      const safeTitle = title.replace(/[^a-zA-Z0-9-_\s]/g, "").trim().replace(/\s+/g, "-") || "play";
      await exportPlayAsVideo(currentPlay, safeTitle, {
        speed: videoSpeed,
        resolution: videoResolution,
        onProgress: (fraction) => setVideoProgress(fraction),
      });
    } finally {
      setExportMode("idle");
      setVideoProgress(0);
    }
  }, [currentPlay, videoSpeed, videoResolution]);

  return (
    <div ref={menuRef} className="relative">
      <button
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
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
        <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-gray-200 bg-white shadow-lg">
          <ProgressBar fraction={videoProgress} />
        </div>
      )}

      {open && !isExporting && (
        <div
          className="absolute right-0 top-full z-50 mt-1 w-72 rounded-lg border border-gray-200 bg-white shadow-lg"
          role="menu"
          aria-label="Export options"
        >
          {/* ---------------------------------------------------------------- */}
          {/* PNG section                                                       */}
          {/* ---------------------------------------------------------------- */}
          <div className="border-b border-gray-100 px-4 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Export Scene
            </p>
          </div>

          {/* PNG resolution picker */}
          <div className="px-4 py-3">
            <p className="mb-2 text-xs font-medium text-gray-600">PNG Resolution</p>
            <div className="flex flex-col gap-1.5">
              {PNG_RESOLUTION_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-gray-50"
                >
                  <input
                    type="radio"
                    name="export-png-resolution"
                    value={opt.value}
                    checked={pngResolution === opt.value}
                    onChange={() => setPngResolution(opt.value)}
                    className="accent-blue-600"
                  />
                  <span className="flex-1 text-sm text-gray-700">{opt.label}</span>
                  <span className="text-xs text-gray-400">{opt.description}</span>
                </label>
              ))}
            </div>
          </div>

          {/* PNG export button */}
          <div className="border-t border-gray-100 p-2">
            <button
              className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700"
              role="menuitem"
              onClick={handleExportPNG}
              disabled={!scene}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-100 text-blue-600">
                <DownloadIcon />
              </span>
              <span>
                <span className="block font-medium">Export as PNG</span>
                <span className="block text-xs text-gray-500">
                  Current scene · {pngResolution} resolution
                </span>
              </span>
            </button>
          </div>

          {/* ---------------------------------------------------------------- */}
          {/* Video section                                                     */}
          {/* ---------------------------------------------------------------- */}
          <div className="border-t border-gray-200 px-4 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Export Play Animation
            </p>
          </div>

          {/* Video speed + resolution */}
          <div className="px-4 py-3">
            <div className="mb-3">
              <p className="mb-1.5 text-xs font-medium text-gray-600">Playback Speed</p>
              <div className="flex gap-1.5">
                {VIDEO_SPEED_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setVideoSpeed(opt.value)}
                    aria-pressed={videoSpeed === opt.value}
                    className={[
                      "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                      videoSpeed === opt.value
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200",
                    ].join(" ")}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-medium text-gray-600">Resolution</p>
              <div className="flex gap-1.5">
                {VIDEO_RESOLUTION_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setVideoResolution(opt.value)}
                    aria-pressed={videoResolution === opt.value}
                    title={opt.description}
                    className={[
                      "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                      videoResolution === opt.value
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200",
                    ].join(" ")}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-gray-400">
                {VIDEO_RESOLUTION_OPTIONS.find((o) => o.value === videoResolution)?.description}
              </p>
            </div>
          </div>

          {/* Video export button */}
          <div className="border-t border-gray-100 p-2">
            <button
              className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-green-50 hover:text-green-700"
              role="menuitem"
              onClick={handleExportVideo}
              disabled={!currentPlay}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-green-100 text-green-600">
                <VideoIcon />
              </span>
              <span>
                <span className="block font-medium">Export as Video</span>
                <span className="block text-xs text-gray-500">
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
          <div className="border-t border-gray-200 px-4 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Export Play Document
            </p>
          </div>
          <div className="px-4 py-3 flex flex-col gap-3">
            <div>
              <p className="mb-1.5 text-xs font-medium text-gray-600">Layout</p>
              <div className="flex gap-1.5 flex-wrap">
                {(["1x1", "2x1", "2x2", "3x2"] as PdfLayout[]).map((l) => (
                  <button
                    key={l}
                    onClick={() => setPdfLayout(l)}
                    aria-pressed={pdfLayout === l}
                    className={[
                      "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                      pdfLayout === l
                        ? "bg-orange-100 text-orange-700"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200",
                    ].join(" ")}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                checked={pdfExportSteps}
                onChange={(e) => setPdfExportSteps(e.target.checked)}
                className="accent-orange-600"
              />
              <span className="text-sm text-gray-700">Export steps</span>
              <span className="text-xs text-gray-400">(cumulative reveal)</span>
            </label>
          </div>
          <div className="border-t border-gray-100 p-2">
            <button
              className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-700"
              role="menuitem"
              onClick={handleExportPDF}
              disabled={!currentPlay}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-orange-100 text-orange-600">
                <PdfIcon />
              </span>
              <span>
                <span className="block font-medium">Export as PDF</span>
                <span className="block text-xs text-gray-500">
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
