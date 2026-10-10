"use client";

/**
 * ShortcutsButton — small toolbar button that opens the shortcuts overlay.
 *
 * Implements issue #82: Keyboard shortcuts — header button to show overlay.
 *
 * Dispatches a synthetic keyboard event ("?") which EditorKeyboardManager
 * already listens for, keeping a single source of truth for overlay state.
 */

import { ICON_BTN } from "./chrome";

/**
 * Toggle the shortcuts overlay: a synthetic "?" keydown that
 * EditorKeyboardManager handles, so overlay state lives in one component.
 */
export function toggleShortcutsOverlay() {
  window.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "?",
      code: "Slash",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    }),
  );
}

export default function ShortcutsButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={toggleShortcutsOverlay}
      className={className ? `${ICON_BTN} ${className}` : ICON_BTN}
      title="Keyboard shortcuts (?)"
      aria-label="Keyboard shortcuts"
    >
      <span className="text-base font-semibold leading-none" aria-hidden="true">?</span>
    </button>
  );
}
