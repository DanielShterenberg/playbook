"use client";

/**
 * SceneNotes — the selected scene's notes, under the playback controls.
 *
 * Notes explain a scene in words: the options from this spot, the reads, what
 * to look for. They are shown as text (three lines, "Show all" for more);
 * editors click it (or "Add notes") to edit in place, which pauses playback.
 * Typing is committed to the store when it pauses and when the box loses
 * focus, so a paragraph is a few undo steps, not one per letter. Team viewers
 * see the notes and cannot edit them.
 *
 * The share viewer, presentation mode and the PDF show the same text
 * (sceneDescription in types.ts).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { selectEditorScene, useStore } from "@/lib/store";
import { savePlay } from "@/lib/db";
import { useCanEditPlay } from "@/hooks/useCanEditPlay";
import { SCENE_DESCRIPTION_MAX, sceneDescription } from "@/lib/types";
import { FOCUS_RING } from "@/lib/uiClasses";

/** Idle time after the last keystroke before the notes are saved. */
const COMMIT_DELAY_MS = 1200;

export default function SceneNotes() {
  const scene = useStore(selectEditorScene);
  const updateSceneDescription = useStore((s) => s.updateSceneDescription);
  const pausePlayback = useStore((s) => s.pausePlayback);
  const canEdit = useCanEditPlay();

  const stored = sceneDescription(scene);
  const sceneId = scene?.id ?? null;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(stored);
  const [expanded, setExpanded] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // The scene being edited and the text typed so far, for commits that run
  // after the selection moved on (blur, scene change, unmount).
  const editRef = useRef<{ sceneId: string; text: string } | null>(null);

  // Outside editing the box follows the store (undo, redo, another scene).
  useEffect(() => {
    if (!editing) setDraft(stored);
  }, [stored, editing]);

  const commit = useCallback(() => {
    const edit = editRef.current;
    if (edit) updateSceneDescription(edit.sceneId, edit.text);
  }, [updateSceneDescription]);

  const finish = useCallback(() => {
    commit();
    editRef.current = null;
    setEditing(false);
  }, [commit]);

  // Save when typing pauses.
  useEffect(() => {
    if (!editing) return;
    const timer = setTimeout(commit, COMMIT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [draft, editing, commit]);

  // A different scene was selected while editing: the notes belong to the old one.
  useEffect(() => {
    if (editRef.current && editRef.current.sceneId !== sceneId) finish();
  }, [sceneId, finish]);

  // Leaving the editor mid-edit keeps what was typed. Autosave may already
  // have stopped listening, so the play is written directly.
  useEffect(
    () => () => {
      const edit = editRef.current;
      if (!edit) return;
      const before = useStore.getState().currentPlay;
      commit();
      const after = useStore.getState().currentPlay;
      if (after && after !== before) void savePlay(after).catch(() => {});
    },
    [commit],
  );

  // Another scene starts collapsed.
  useEffect(() => setExpanded(false), [sceneId]);

  useEffect(() => {
    if (editing) textareaRef.current?.focus();
  }, [editing]);

  if (!scene) return null;

  function startEditing() {
    if (!canEdit || !sceneId) return;
    // Playback would move the selection to the next scene mid-sentence.
    pausePlayback();
    editRef.current = { sceneId, text: stored };
    setDraft(stored);
    setEditing(true);
  }

  const label = <span className="font-display text-xs font-semibold uppercase tracking-[0.08em] text-muted">Notes</span>;

  if (editing) {
    const lines = draft.split("\n").length;
    return (
      <div className="flex w-full max-w-[640px] flex-col gap-1 px-2.5 pb-2 md:px-0 md:pb-0">
        {label}
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (editRef.current) editRef.current.text = e.target.value;
          }}
          onBlur={finish}
          onKeyDown={(e) => {
            if (e.key === "Escape") e.currentTarget.blur();
          }}
          dir="auto"
          rows={Math.min(8, Math.max(3, lines))}
          maxLength={SCENE_DESCRIPTION_MAX}
          placeholder="Explain this scene: the options from here, the reads, what to look for…"
          aria-label="Scene notes"
          className="w-full resize-none rounded-lg [unicode-bidi:plaintext] border border-line-strong bg-surface px-3 py-2 text-sm leading-normal text-ink outline-none placeholder:text-muted focus:border-accent-text"
        />
      </div>
    );
  }

  if (stored) {
    // Longer than the three lines shown: offer the rest.
    const long = stored.split("\n").length > 3 || stored.length > 240;
    const text = (
      <p
        dir="auto"
        className={`m-0 whitespace-pre-line break-words text-start text-sm leading-normal text-ink [unicode-bidi:plaintext] ${expanded ? "" : "line-clamp-3"}`}
      >
        {stored}
      </p>
    );
    return (
      <div className="flex w-full max-w-[640px] flex-col gap-1 px-2.5 pb-2 md:px-0 md:pb-0">
        {label}
        {canEdit ? (
          <button
            type="button"
            onClick={startEditing}
            title="Edit notes"
            aria-label={`Scene notes: ${stored}. Click to edit`}
            className={`-mx-2 rounded-lg px-2 py-1 text-left transition-colors hover:bg-chip ${FOCUS_RING}`}
          >
            {text}
          </button>
        ) : (
          text
        )}
        {long && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            className={`w-fit rounded text-[13px] font-medium text-accent-text hover:underline ${FOCUS_RING}`}
          >
            {expanded ? "Show less" : "Show all"}
          </button>
        )}
      </div>
    );
  }

  if (!canEdit) return null;

  return (
    <button
      type="button"
      onClick={startEditing}
      className={`mx-2.5 mb-2 flex h-9 flex-none items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-muted transition-colors hover:bg-chip hover:text-ink md:mx-0 md:mb-0 ${FOCUS_RING}`}
    >
      <span aria-hidden="true">+</span> Add notes to this scene
    </button>
  );
}
