/**
 * history.ts — Undo/Redo history store for the play editor.
 *
 * Implements issue #83: Undo/Redo system.
 *
 * Architecture:
 *   We maintain two stacks (past and future) of "snapshots". A snapshot
 *   captures the entire `currentPlay` plus the `selectedSceneId` — these are
 *   the only pieces of editor state that benefit from undo/redo (player
 *   positions, annotations, scenes, timing groups, etc. all live on `currentPlay`).
 *
 *   When an undoable action is dispatched the caller invokes `pushSnapshot`
 *   BEFORE mutating the store. This records the current state. The future
 *   stack is cleared on every new push (standard undo/redo semantics).
 *
 *   `undo` pops the top of `past`, pushes the current snapshot onto `future`,
 *   and restores the popped snapshot to the main store.
 *
 *   `redo` pops the top of `future`, pushes the current snapshot onto `past`,
 *   and restores the popped snapshot to the main store.
 *
 * Stack size is capped at MAX_HISTORY_SIZE to prevent memory growth.
 *
 * The history is reset whenever `setCurrentPlay` or `clearCurrentPlay` is
 * called (i.e. when switching to a different play).
 */

import { create } from "zustand";
import type { Play } from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_HISTORY_SIZE = 50;

// ---------------------------------------------------------------------------
// Snapshot type — what we store per undo step
// ---------------------------------------------------------------------------

export interface EditorSnapshot {
  play: Play;
  selectedSceneId: string | null;
}

// ---------------------------------------------------------------------------
// History store interface
// ---------------------------------------------------------------------------

export interface HistoryStore {
  past: EditorSnapshot[];
  future: EditorSnapshot[];

  /** Push a snapshot onto the past stack (clears the future stack). */
  pushSnapshot: (snapshot: EditorSnapshot) => void;

  /**
   * Undo: returns the snapshot to restore and updates the stacks.
   * Returns null if there is nothing to undo.
   * The caller is expected to apply `currentSnapshot` to the history's future
   * and restore the returned snapshot to the main store.
   */
  undo: (currentSnapshot: EditorSnapshot) => EditorSnapshot | null;

  /**
   * Redo: returns the snapshot to restore and updates the stacks.
   * Returns null if there is nothing to redo.
   */
  redo: (currentSnapshot: EditorSnapshot) => EditorSnapshot | null;

  /** Reset the history (called on play switch). */
  resetHistory: () => void;

  /** Whether undo is possible */
  canUndo: boolean;
  /** Whether redo is possible */
  canRedo: boolean;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useHistoryStore = create<HistoryStore>()((set, get) => ({
  past: [],
  future: [],
  canUndo: false,
  canRedo: false,

  pushSnapshot: (snapshot) =>
    set((state) => {
      const past = [...state.past, snapshot].slice(-MAX_HISTORY_SIZE);
      return { past, future: [], canUndo: true, canRedo: false };
    }),

  undo: (currentSnapshot) => {
    const { past, future } = get();
    if (past.length === 0) return null;

    const previous = past[past.length - 1];
    const newPast = past.slice(0, -1);
    const newFuture = [currentSnapshot, ...future].slice(0, MAX_HISTORY_SIZE);

    set({
      past: newPast,
      future: newFuture,
      canUndo: newPast.length > 0,
      canRedo: true,
    });

    return previous;
  },

  redo: (currentSnapshot) => {
    const { past, future } = get();
    if (future.length === 0) return null;

    const next = future[0];
    const newFuture = future.slice(1);
    const newPast = [...past, currentSnapshot].slice(-MAX_HISTORY_SIZE);

    set({
      past: newPast,
      future: newFuture,
      canUndo: true,
      canRedo: newFuture.length > 0,
    });

    return next;
  },

  resetHistory: () =>
    set({ past: [], future: [], canUndo: false, canRedo: false }),
}));
