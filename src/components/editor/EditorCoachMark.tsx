"use client";

/**
 * EditorCoachMark — a one-time dismissable banner that explains scenes and steps
 * to first-time users. Dismissed state is persisted in localStorage.
 */

import { useState } from "react";

const COACH_KEY = "playbook_editor_hints_v1";

export default function EditorCoachMark() {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem(COACH_KEY) === "1";
  });

  if (dismissed) return null;

  return (
    <div className="flex items-center gap-3 border-t border-line bg-chip px-5 py-1.5 text-xs text-ink">
      <svg
        className="flex-none text-accent-text"
        width={18}
        height={18}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M9 18h6M10 21h4" />
        <path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.3 1 2.5h6c0-1.2.3-1.8 1-2.5A6 6 0 0 0 12 3z" />
      </svg>
      <span className="flex-1 leading-normal">
        <strong>Scenes</strong> are the frames of your play — each one captures a moment on the court.{" "}
        <strong>Steps</strong> sequence actions <em>within</em> a scene (e.g. set the screen first,
        then cut). Right-click any scene thumbnail to duplicate or reorder it.
      </span>
      <button
        type="button"
        onClick={() => {
          localStorage.setItem(COACH_KEY, "1");
          setDismissed(true);
        }}
        className="flex h-7 flex-none items-center rounded-lg border border-line-strong bg-surface px-3 text-xs font-semibold text-ink transition-colors hover:bg-app"
      >
        Got it
      </button>
    </div>
  );
}
