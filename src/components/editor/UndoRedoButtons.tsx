"use client";

/**
 * UndoRedoButtons — toolbar buttons for undo and redo actions.
 *
 * Implements issue #83: Undo/Redo system.
 *
 * Reads canUndo / canRedo from the history store and calls the undo/redo
 * actions on the main store. Buttons are disabled when the stack is empty.
 *
 * Keyboard shortcuts (Ctrl+Z / Ctrl+Shift+Z) are handled by
 * EditorKeyboardManager — this component only provides the UI affordance.
 */

import { useStore } from "@/lib/store";
import { useHistoryStore } from "@/lib/history";
import { ICON_BTN } from "./chrome";

export function UndoIcon({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H10a6 6 0 0 0 0 12h3" />
    </svg>
  );
}

export default function UndoRedoButtons() {
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const canUndo = useHistoryStore((s) => s.canUndo);
  const canRedo = useHistoryStore((s) => s.canRedo);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={undo}
        disabled={!canUndo}
        title="Undo (Ctrl+Z)"
        aria-label="Undo"
        className={ICON_BTN}
      >
        <UndoIcon />
      </button>
      <button
        type="button"
        onClick={redo}
        disabled={!canRedo}
        title="Redo (Ctrl+Shift+Z)"
        aria-label="Redo"
        className={ICON_BTN}
      >
        <RedoIcon />
      </button>
    </div>
  );
}
