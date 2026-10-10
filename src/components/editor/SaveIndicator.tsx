"use client";

/**
 * SaveIndicator — shows the current auto-save status in the editor header.
 *
 * Implements issue #68: "Saving…" / "Saved" / "Offline" indicator.
 *
 * Mount exactly once: useAutoSave is the hook that writes the play.
 */

import { useAutoSave } from "@/hooks/useAutoSave";

interface SaveIndicatorProps {
  /** Draw a "·" before the status on md+ (it follows the play's meta text there). */
  separated?: boolean;
}

export default function SaveIndicator({ separated = false }: SaveIndicatorProps) {
  const status = useAutoSave();
  const sep = separated ? " md:before:mx-1.5 md:before:text-muted md:before:content-['·']" : "";

  if (status === "idle") return null;

  if (status === "saved") {
    return <span className={`flex-none${sep}`}>Saved</span>;
  }

  if (status === "pending" || status === "saving") {
    return (
      <span className={`inline-flex flex-none items-center gap-1${sep}`}>
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
      className={`inline-flex flex-none items-center gap-1 text-danger${sep}`}
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
