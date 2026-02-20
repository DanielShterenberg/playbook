"use client";

/**
 * SaveIndicator — shows the current auto-save status in the editor header.
 *
 * Implements issue #68: "Saving…" / "Saved" / "Offline" indicator.
 */

import { useAutoSave } from "@/hooks/useAutoSave";

export default function SaveIndicator() {
  const status = useAutoSave();

  if (status === "idle" || status === "saved") {
    return (
      <span className="hidden text-xs text-gray-400 sm:inline-block">
        {status === "saved" ? "Saved" : ""}
      </span>
    );
  }

  if (status === "pending" || status === "saving") {
    return (
      <span className="hidden items-center gap-1 text-xs text-gray-400 sm:inline-flex">
        <svg
          width={11}
          height={11}
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className="animate-spin"
        >
          <circle cx={12} cy={12} r={10} stroke="currentColor" strokeWidth={3} strokeDasharray="31 31" strokeLinecap="round" />
        </svg>
        Saving…
      </span>
    );
  }

  // error
  return (
    <span
      className="hidden items-center gap-1 text-xs text-red-500 sm:inline-flex"
      title="Auto-save failed — check your connection"
    >
      <svg width={11} height={11} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path
          fillRule="evenodd"
          d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
          clipRule="evenodd"
        />
      </svg>
      Offline
    </span>
  );
}
