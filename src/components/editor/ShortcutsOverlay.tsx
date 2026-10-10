"use client";

/**
 * ShortcutsOverlay — modal overlay listing all keyboard shortcuts.
 *
 * Implements issue #82: Keyboard shortcuts — "? key shows overlay with all shortcuts".
 *
 * Triggered by pressing ? anywhere in the editor (when not typing in an input).
 * Dismissed by pressing Escape, clicking the backdrop, or pressing ? again.
 */

import { useEffect } from "react";

interface ShortcutEntry {
  keys: string[];
  description: string;
}

interface ShortcutSection {
  title: string;
  entries: ShortcutEntry[];
}

const SECTIONS: ShortcutSection[] = [
  {
    title: "Tools",
    entries: [
      { keys: ["V"], description: "Select / deselect" },
      { keys: ["M"], description: "Movement arrow" },
      { keys: ["D"], description: "Dribble path" },
      { keys: ["P"], description: "Pass arrow" },
      { keys: ["S"], description: "Screen / pick" },
      { keys: ["C"], description: "Cut (dashed arrow)" },
      { keys: ["G"], description: "Guard assignment (defender → offensive player)" },
      { keys: ["H"], description: "Hand-off / DHO (ball-handler → receiver)" },
      { keys: ["Esc"], description: "Back to Select" },
    ],
  },
  {
    title: "Playback",
    entries: [
      { keys: ["Space"], description: "Play / Pause" },
      { keys: ["←", "→"], description: "Step to previous / next scene" },
      { keys: ["Ctrl", "←", "/", "→"], description: "Navigate scenes (editor)" },
      { keys: ["L"], description: "Toggle loop" },
    ],
  },
  {
    title: "Editing",
    entries: [
      { keys: ["Ctrl", "Z"], description: "Undo" },
      { keys: ["Ctrl", "Shift", "Z"], description: "Redo" },
      { keys: ["Del", "⌫"], description: "Delete selected annotation or scene" },
      { keys: ["Ctrl", "S"], description: "Force save" },
      { keys: ["drag from endpoint"], description: "Add a leg to an existing movement / cut / dribble arrow" },
    ],
  },
  {
    title: "Help",
    entries: [{ keys: ["?"], description: "Show / hide this shortcut list" }],
  },
];

interface ShortcutsOverlayProps {
  onClose: () => void;
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex min-w-[26px] items-center justify-center whitespace-nowrap rounded-[5px] border border-line-strong bg-chip px-1.5 py-0.5 font-mono text-[11px] font-semibold leading-normal text-ink">
      {children}
    </kbd>
  );
}

export default function ShortcutsOverlay({ onClose }: ShortcutsOverlayProps) {
  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    // Backdrop
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-[2px]"
    >
      {/* Panel */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[80vh] w-[min(580px,92vw)] overflow-y-auto rounded-xl border border-line bg-surface px-7 py-6 text-ink shadow-2xl"
      >
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-2xl font-semibold tracking-[0.02em] text-ink">Keyboard Shortcuts</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close shortcuts panel"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-muted transition-colors hover:bg-app hover:text-ink"
          >
            <svg width={16} height={16} viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Sections */}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-x-8 gap-y-5">
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <h3 className="mb-2.5 font-display text-sm font-semibold uppercase tracking-[0.08em] text-muted">
                {section.title}
              </h3>
              <ul className="flex list-none flex-col gap-[7px]">
                {section.entries.map((entry) => (
                  <li key={entry.description} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 shrink text-[13px] text-ink">{entry.description}</span>
                    <span className="flex shrink-0 items-center gap-[3px]">
                      {entry.keys.map((k, i) => (
                        <span key={i} className="flex items-center gap-[3px]">
                          {i > 0 && k !== "/" && <span className="mx-px text-[11px] text-muted">+</span>}
                          {k === "/" ? <span className="mx-[3px] text-[11px] text-muted">or</span> : <Kbd>{k}</Kbd>}
                        </span>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <p className="mt-5 text-center text-xs text-muted">
          Press <Kbd>?</Kbd> or <Kbd>Esc</Kbd> to dismiss
        </p>
      </div>
    </div>
  );
}
