"use client";

/**
 * ExportMenu — dropdown menu for scene export options.
 *
 * Implements issue #79: PNG export of single scene.
 *
 * Renders a "Export" button that opens a small dropdown with:
 *   - Export Image (PNG) — current scene, 2× resolution
 *
 * Future issues (#77, #80) will add GIF and PDF entries to this same menu.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useStore, selectEditorScene } from "@/lib/store";
import { exportSceneAsPNG, type ExportResolution } from "@/lib/exportPNG";

// ---------------------------------------------------------------------------
// Resolution options
// ---------------------------------------------------------------------------

const RESOLUTION_OPTIONS: { label: string; value: ExportResolution; description: string }[] = [
  { label: "Standard (1×)", value: "1x", description: "~800 × 752 px" },
  { label: "High (2×)", value: "2x", description: "~1600 × 1504 px" },
  { label: "Ultra (3×)", value: "3x", description: "~2400 × 2256 px" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ExportMenu() {
  const scene = useStore(selectEditorScene);
  const currentPlay = useStore((s) => s.currentPlay);

  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selectedResolution, setSelectedResolution] = useState<ExportResolution>("2x");

  const menuRef = useRef<HTMLDivElement>(null);

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
    setExporting(true);
    setOpen(false);
    try {
      const title = currentPlay?.title ?? "play";
      // Sanitise title for use as a filename
      const safeTitle = title.replace(/[^a-zA-Z0-9-_\s]/g, "").trim().replace(/\s+/g, "-");
      const sceneIndex = (currentPlay?.scenes.findIndex((s) => s.id === scene.id) ?? 0) + 1;
      const filename = `${safeTitle}-scene-${sceneIndex}`;
      exportSceneAsPNG(scene, 800, selectedResolution, filename);
    } finally {
      // Small delay so the user sees the "Exporting…" state before it clears
      setTimeout(() => setExporting(false), 500);
    }
  }, [scene, currentPlay, selectedResolution]);

  return (
    <div ref={menuRef} className="relative">
      <button
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        onClick={() => setOpen((v) => !v)}
        disabled={exporting || !scene}
        aria-haspopup="true"
        aria-expanded={open}
      >
        {exporting ? "Exporting…" : "Export"}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-1 w-64 rounded-lg border border-gray-200 bg-white shadow-lg"
          role="menu"
          aria-label="Export options"
        >
          {/* Header */}
          <div className="border-b border-gray-100 px-4 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Export Scene
            </p>
          </div>

          {/* Resolution picker */}
          <div className="px-4 py-3">
            <p className="mb-2 text-xs font-medium text-gray-600">Resolution</p>
            <div className="flex flex-col gap-1.5">
              {RESOLUTION_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-gray-50"
                >
                  <input
                    type="radio"
                    name="export-resolution"
                    value={opt.value}
                    checked={selectedResolution === opt.value}
                    onChange={() => setSelectedResolution(opt.value)}
                    className="accent-blue-600"
                  />
                  <span className="flex-1 text-sm text-gray-700">{opt.label}</span>
                  <span className="text-xs text-gray-400">{opt.description}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-100" />

          {/* Export PNG action */}
          <div className="p-2">
            <button
              className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700"
              role="menuitem"
              onClick={handleExportPNG}
              disabled={!scene}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-100 text-blue-600">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M8 1v9M5 7l3 3 3-3M2 11v2a1 1 0 001 1h10a1 1 0 001-1v-2"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span>
                <span className="block font-medium">Export as PNG</span>
                <span className="block text-xs text-gray-500">
                  Current scene · {selectedResolution} resolution
                </span>
              </span>
            </button>
          </div>

          {/* Future items placeholder */}
          <div className="border-t border-gray-100 p-2">
            <button
              className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-gray-400"
              disabled
              title="Coming soon"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-gray-100 text-gray-400">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden="true"
                >
                  <rect x="1" y="3" width="14" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M5 6l3 2.5L11 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span>
                <span className="block font-medium">Export as GIF</span>
                <span className="block text-xs">Coming soon</span>
              </span>
            </button>
            <button
              className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-gray-400"
              disabled
              title="Coming soon"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-gray-100 text-gray-400">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M3 1h7l3 3v10a1 1 0 01-1 1H3a1 1 0 01-1-1V2a1 1 0 011-1z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path d="M10 1v3h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span>
                <span className="block font-medium">Export as PDF</span>
                <span className="block text-xs">Coming soon</span>
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
