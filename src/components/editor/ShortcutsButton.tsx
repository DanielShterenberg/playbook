"use client";

/**
 * ShortcutsButton — small toolbar button that opens the shortcuts overlay.
 *
 * Implements issue #82: Keyboard shortcuts — header button to show overlay.
 *
 * Dispatches a synthetic keyboard event ("?") which EditorKeyboardManager
 * already listens for, keeping a single source of truth for overlay state.
 */

export default function ShortcutsButton() {
  function handleClick() {
    // Dispatch a synthetic "?" keydown so EditorKeyboardManager handles it.
    // This avoids duplicating overlay state across two components.
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

  return (
    <button
      onClick={handleClick}
      className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
      title="Keyboard shortcuts (?)"
      aria-label="Keyboard shortcuts"
    >
      ?
    </button>
  );
}
