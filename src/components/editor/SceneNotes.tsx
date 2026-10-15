"use client";

/**
 * SceneNotes — the selected scene's notes, under the playback controls.
 *
 * Notes explain a scene in words: the options from this spot, the reads, what
 * to look for. They are shown as text; editors click it (or "Add notes") to
 * edit in place. Typing is committed to the store when it pauses and when the
 * box loses focus, so a paragraph is a few undo steps, not one per letter.
 * Team viewers see the notes and cannot edit them.
 *
 * The share viewer, presentation mode and the PDF show the same text
 * (sceneDescription in types.ts).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { useTeam } from "@/contexts/TeamContext";
import { SCENE_DESCRIPTION_MAX, sceneDescription } from "@/lib/types";
import { FOCUS_RING } from "@/lib/uiClasses";

/** Idle time after the last keystroke before the notes are saved. */
const COMMIT_DELAY_MS = 1200;

export default function SceneNotes() {
  const scene = useStore((s) => s.currentPlay?.scenes.find((sc) => sc.id === s.selectedSceneId) ?? null);
  const updateSceneDescription = useStore((s) => s.updateSceneDescription);
  const { role } = useTeam();
  const canEdit = role !== "viewer";

  const stored = sceneDescription(scene);
  const sceneId = scene?.id ?? null;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(stored);
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

  // Leaving the editor mid-edit keeps what was typed.
  useEffect(() => () => commit(), [commit]);

  useEffect(() => {
    if (editing) textareaRef.current?.focus();
  }, [editing]);

  if (!scene) return null;

  function startEditing() {
    if (!canEdit || !sceneId) return;
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
    const text = (
      <p dir="auto" className="m-0 line-clamp-3 whitespace-pre-line break-words text-start text-sm leading-normal text-ink [unicode-bidi:plaintext]">
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
