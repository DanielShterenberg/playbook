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

function UndoIcon() {
  return (
    <svg viewBox="0 0 20 20" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 8h9a5 5 0 0 1 0 10H7" />
      <path d="M3 8l4-4M3 8l4 4" />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg viewBox="0 0 20 20" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 8H8a5 5 0 0 0 0 10h5" />
      <path d="M17 8l-4-4M17 8l-4 4" />
    </svg>
  );
}

export default function UndoRedoButtons() {
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const canUndo = useHistoryStore((s) => s.canUndo);
  const canRedo = useHistoryStore((s) => s.canRedo);

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={undo}
        disabled={!canUndo}
        title="Undo (Ctrl+Z)"
        aria-label="Undo"
        className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-30"
      >
        <UndoIcon />
      </button>
      <button
        onClick={redo}
        disabled={!canRedo}
        title="Redo (Ctrl+Shift+Z)"
        aria-label="Redo"
        className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-30"
      >
        <RedoIcon />
      </button>
    </div>
  );
}
