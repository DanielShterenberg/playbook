"use client";

/**
 * EditorKeyboardManager — mounts the global keyboard shortcut handler and
 * manages the ShortcutsOverlay visibility for the play editor.
 *
 * Implements issue #82: Keyboard shortcuts.
 * Implements issue #83: Undo/Redo — wires Ctrl+Z / Ctrl+Shift+Z to the
 * history store.
 *
 * This is a zero-render client component that:
 *   1. Calls useKeyboardShortcuts with editor-specific callbacks.
 *   2. Renders the ShortcutsOverlay when the user presses "?".
 *
 * It is placed as a child of the editor page so it only activates on
 * /play/[id] and not on other pages.
 */

import { useState, useCallback } from "react";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useStore } from "@/lib/store";
import ShortcutsOverlay from "./ShortcutsOverlay";

export default function EditorKeyboardManager() {
  const [showHelp, setShowHelp] = useState(false);

  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);

  const handleToggleHelp = useCallback(() => {
    setShowHelp((prev) => !prev);
  }, []);

  const handleCloseHelp = useCallback(() => {
    setShowHelp(false);
  }, []);

  // Ctrl+S save — stubbed until Firestore auto-save (#68) is implemented
  const handleSave = useCallback(() => {
    // No-op for now; will be wired to the Firestore persistence layer in #68
  }, []);

  // Undo / Redo — wired to history store (issue #83)
  const handleUndo = useCallback(() => {
    undo();
  }, [undo]);

  const handleRedo = useCallback(() => {
    redo();
  }, [redo]);

  useKeyboardShortcuts({
    onToggleHelp: handleToggleHelp,
    onSave: handleSave,
    onUndo: handleUndo,
    onRedo: handleRedo,
  });

  if (!showHelp) return null;

  return <ShortcutsOverlay onClose={handleCloseHelp} />;
}
