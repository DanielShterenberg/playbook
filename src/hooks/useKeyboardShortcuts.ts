"use client";

/**
 * useKeyboardShortcuts — centralised global keyboard shortcut handler.
 *
 * Implements issue #82: Keyboard shortcuts.
 *
 * Shortcuts registered here:
 *   Tool switching   : V (select), M (move), D (dribble), P (pass),
 *                      S (screen), C (cut), E (eraser)
 *   Playback         : Space (play/pause), Left/Right (step scenes),
 *                      L (loop toggle)
 *   Scene navigation : Ctrl+Right / Ctrl+Left (next/prev scene)
 *   Editing          : Ctrl+Z (undo), Ctrl+Shift+Z (redo),
 *                      Delete/Backspace (remove selected),
 *                      Ctrl+S (force save)
 *   Help             : ? (show shortcuts overlay)
 *
 * Rules:
 *   - All shortcuts are disabled when focus is inside an input, textarea,
 *     or select element (contentEditable nodes are also excluded).
 *   - The hook does NOT register listeners when `enabled` is false.
 *   - Tool-switching keys, playback shortcuts, and scene-nav shortcuts are
 *     handled here so that DrawingToolsPanel and PlaybackControls can remove
 *     their own duplicate listeners and call this hook instead.
 */

import { useEffect, useCallback } from "react";
import { useStore } from "@/lib/store";
import type { DrawingTool } from "@/lib/store";

/** Returns true when keyboard focus is inside a text-editing element. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

const TOOL_KEY_MAP: Record<string, DrawingTool> = {
  v: "select",
  escape: "select",
  m: "movement",
  d: "dribble",
  p: "pass",
  s: "screen",
  c: "cut",
  e: "eraser",
};

export interface KeyboardShortcutsOptions {
  /** When false the hook is a no-op. Defaults to true. */
  enabled?: boolean;
  /** Called when Ctrl+S is pressed. Stub until auto-save is wired up. */
  onSave?: () => void;
  /** Called when ? is pressed — used to toggle the shortcuts overlay. */
  onToggleHelp?: () => void;
  /** Called when Ctrl+Z is pressed — stub until #83 undo/redo is implemented. */
  onUndo?: () => void;
  /** Called when Ctrl+Shift+Z is pressed — stub until #83 undo/redo is implemented. */
  onRedo?: () => void;
}

export function useKeyboardShortcuts({
  enabled = true,
  onSave,
  onToggleHelp,
  onUndo,
  onRedo,
}: KeyboardShortcutsOptions = {}) {
  // Pull store actions via stable references
  const setSelectedTool = useStore((s) => s.setSelectedTool);
  const togglePlayback = useStore((s) => s.togglePlayback);
  const pausePlayback = useStore((s) => s.pausePlayback);
  const stepForward = useStore((s) => s.stepForward);
  const stepBack = useStore((s) => s.stepBack);
  const setLoop = useStore((s) => s.setLoop);
  const setSelectedSceneId = useStore((s) => s.setSelectedSceneId);
  const removeAnnotation = useStore((s) => s.removeAnnotation);
  const removeScene = useStore((s) => s.removeScene);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;
      if (isTypingTarget(e.target)) return;

      const key = e.key.toLowerCase();
      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;

      // -----------------------------------------------------------------------
      // Ctrl / Meta combos — check first to avoid conflicts with single keys
      // -----------------------------------------------------------------------

      if (ctrl) {
        if (key === "s") {
          e.preventDefault();
          onSave?.();
          return;
        }

        if (key === "z" && !shift) {
          e.preventDefault();
          onUndo?.();
          return;
        }

        if ((key === "z" && shift) || key === "y") {
          e.preventDefault();
          onRedo?.();
          return;
        }

        if (key === "arrowright") {
          e.preventDefault();
          pausePlayback();
          stepForward();
          return;
        }

        if (key === "arrowleft") {
          e.preventDefault();
          pausePlayback();
          stepBack();
          return;
        }

        // Let other Ctrl combos pass through
        return;
      }

      // -----------------------------------------------------------------------
      // Single-key shortcuts
      // -----------------------------------------------------------------------

      // Tool switching
      const tool = TOOL_KEY_MAP[key];
      if (tool) {
        e.preventDefault();
        setSelectedTool(tool);
        return;
      }

      // Playback
      if (e.code === "Space") {
        e.preventDefault();
        togglePlayback();
        return;
      }

      if (e.code === "ArrowRight") {
        e.preventDefault();
        pausePlayback();
        stepForward();
        return;
      }

      if (e.code === "ArrowLeft") {
        e.preventDefault();
        pausePlayback();
        stepBack();
        return;
      }

      if (key === "l") {
        const currentLoop = useStore.getState().loop;
        setLoop(!currentLoop);
        return;
      }

      // Delete / Backspace — remove selected annotation OR selected scene
      if (key === "delete" || key === "backspace") {
        const state = useStore.getState();
        if (state.selectedAnnotationId && state.selectedSceneId) {
          // Remove annotation (AnnotationLayer also handles this — the first
          // listener to call removeAnnotation wins; idempotent on missing id)
          removeAnnotation(state.selectedSceneId, state.selectedAnnotationId);
          return;
        }
        const scenes = state.currentPlay?.scenes ?? [];
        if (state.selectedSceneId && scenes.length > 1) {
          removeScene(state.selectedSceneId);
        }
        return;
      }

      // Shortcuts help overlay
      if (e.key === "?" || (shift && e.code === "Slash")) {
        e.preventDefault();
        onToggleHelp?.();
        return;
      }

      // Explicit scene navigation via setSelectedSceneId
      if (e.code === "ArrowRight" || e.code === "ArrowLeft") {
        const state = useStore.getState();
        const scenes = (state.currentPlay?.scenes ?? []).sort(
          (a, b) => a.order - b.order,
        );
        const currentIdx = scenes.findIndex(
          (s) => s.id === state.selectedSceneId,
        );
        if (currentIdx === -1) return;
        const nextIdx =
          e.code === "ArrowRight"
            ? Math.min(currentIdx + 1, scenes.length - 1)
            : Math.max(currentIdx - 1, 0);
        setSelectedSceneId(scenes[nextIdx].id);
      }
    },
    [
      enabled,
      setSelectedTool,
      togglePlayback,
      pausePlayback,
      stepForward,
      stepBack,
      setLoop,
      setSelectedSceneId,
      removeAnnotation,
      removeScene,
      onSave,
      onToggleHelp,
      onUndo,
      onRedo,
    ],
  );

  useEffect(() => {
    if (!enabled) return;
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, handleKeyDown]);
}
