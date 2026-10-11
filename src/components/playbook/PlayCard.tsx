"use client";

/**
 * PlayCard — a card in the playbook grid view.
 *
 * Implements issue #69: Playbook grid view.
 *
 * Shows:
 *   - Thumbnail of the first scene (the shared CourtThumbnail, which follows
 *     the scene's flipped setting and shows the ball)
 *   - Play title
 *   - Scene count
 *   - Category badge
 *   - Delete button (with confirmation)
 *
 * Clicking the card opens /play/[id] and sets the play as currentPlay.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import type { Play, Role } from "@/lib/types";
import { CATEGORY_BADGE } from "@/lib/categories";
import CourtThumbnail from "@/components/court/CourtThumbnail";
import { addPlayToTeam, deletePlay, savePlay } from "@/lib/db";
import { isPersonalPlay } from "@/lib/playFilter";

// ---------------------------------------------------------------------------
// Thumbnail (the court itself is the shared CourtThumbnail)
// ---------------------------------------------------------------------------

/** Thumbnail width in px (scaled to the card by CSS). */
const THUMBNAIL_W = 200;

const BADGE = "flex-none whitespace-nowrap rounded-full px-2 py-[3px] text-xs font-semibold";

/** Small 44px-tall action in the card's footer row. */
const ACTION_BTN =
  "h-11 whitespace-nowrap rounded-lg border bg-transparent px-3 text-[13px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text";

// ---------------------------------------------------------------------------
// PlayCard
// ---------------------------------------------------------------------------

interface PlayCardProps {
  play: Play;
  /** The current user's team id, if any. */
  teamId?: string | null;
  /** The current user's role in the team, if any. */
  role?: Role | null;
}

/** How long "Sure?" stays armed before it resets to "Delete". */
const CONFIRM_DELETE_MS = 4000;
/** Minimum time between arming and confirming, so a double-tap does not delete. */
const CONFIRM_DELETE_MIN_GAP_MS = 400;

export default function PlayCard({ play, teamId, role }: PlayCardProps) {
  const setCurrentPlay = useStore((s) => s.setCurrentPlay);
  const removePlay = useStore((s) => s.removePlay);
  const duplicatePlay = useStore((s) => s.duplicatePlay);
  const updatePlayTeamId = useStore((s) => s.updatePlayTeamId);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [addingToTeam, setAddingToTeam] = useState(false);

  // A play is "personal" when: user is in a team, the play has no teamId, and
  // the user has permission to edit (admin or editor).
  const isPersonal = isPersonalPlay(play, teamId);
  const canAddToTeam = isPersonal && (role === "admin" || role === "editor");

  const firstScene = play.scenes[0] ?? null;
  const sceneCount = play.scenes.length;
  const categoryBadge = CATEGORY_BADGE[play.category] ?? CATEGORY_BADGE.oob;

  // The confirmation disarms by itself: on touch there is no blur or
  // mouse-leave to reset it, and an armed card must not wait for a stray tap.
  const armedAt = useRef(0);
  useEffect(() => {
    if (!confirmDelete) return;
    const timer = setTimeout(() => setConfirmDelete(false), CONFIRM_DELETE_MS);
    return () => clearTimeout(timer);
  }, [confirmDelete]);

  function handleDelete() {
    if (!confirmDelete) {
      armedAt.current = Date.now();
      setConfirmDelete(true);
      return;
    }
    // A double-tap must not delete: the second tap has to be a separate decision.
    if (Date.now() - armedAt.current < CONFIRM_DELETE_MIN_GAP_MS) return;
    removePlay(play.id);
    // Fire-and-forget Firestore delete
    deletePlay(play.id).catch(() => {});
  }

  function handleDeleteBlur() {
    // Reset confirm state if focus leaves
    setConfirmDelete(false);
  }

  async function handleAddToTeam() {
    if (!teamId || addingToTeam) return;
    setAddingToTeam(true);
    try {
      await addPlayToTeam(play.id, teamId);
      updatePlayTeamId(play.id, teamId);
    } catch {
      // Silently fail — the play remains personal; user can retry
    } finally {
      setAddingToTeam(false);
    }
  }

  return (
    <div
      onMouseLeave={() => setConfirmDelete(false)}
      className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface text-ink transition-colors hover:border-line-strong"
    >
      {/* The card itself: thumbnail + title + meta, one link to the editor */}
      <Link
        href={`/play/${play.id}`}
        prefetch={false}
        onClick={(e) => {
          // Only a plain click navigates this tab; new-tab / new-window clicks must not touch the store.
          if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) setCurrentPlay(play);
        }}
        aria-label={`Open play: ${play.title}`}
        className="flex flex-1 flex-col text-ink no-underline focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-text"
      >
        {/* Thumbnail */}
        {firstScene ? (
          <CourtThumbnail
            scene={firstScene}
            width={THUMBNAIL_W}
            variant={play.courtType === "full" ? "full" : "half"}
            flipped={(firstScene.flipped ?? play.flipped) === true}
            offenseColor={play.colors?.offense}
            defenseColor={play.colors?.defense}
            cornerRadius={0}
            fluid
          />
        ) : (
          <div className="w-full bg-chip pb-[94%]" />
        )}

        {/* Info: title (+ Personal badge) / description / category + scene count */}
        <div className="flex flex-1 flex-col gap-1 px-3.5 pb-3.5 pt-3">
          <div className="flex items-start gap-2">
            <h3
              dir="auto"
              className="m-0 min-w-0 flex-1 break-words text-left font-display text-[20px] font-semibold leading-[1.2] tracking-[0.02em]"
            >
              {play.title}
            </h3>
            {/* Personal badge — shown when this play has not yet been added to the team */}
            {isPersonal && (
              <span
                title="This play is personal and not yet shared with the team"
                className={`${BADGE} mt-px bg-chip text-ink`}
              >
                Personal
              </span>
            )}
          </div>

          {play.description && (
            <p dir="auto" className="m-0 line-clamp-2 text-left text-[13px] leading-[1.4] text-muted">
              {play.description}
            </p>
          )}

          <div className="mt-auto flex items-center gap-2 pt-1 text-[13px] text-muted">
            {/* Category badge */}
            <span className={`${BADGE} capitalize ${categoryBadge}`}>{play.category.replace("-", " ")}</span>
            {/* Scene count */}
            <span>
              {sceneCount} {sceneCount === 1 ? "scene" : "scenes"}
            </span>
          </div>
        </div>
      </Link>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-1 border-t border-line px-1.5 py-1">
        {canAddToTeam && (
          <button
            type="button"
            onClick={() => { void handleAddToTeam(); }}
            aria-label="Add play to team"
            title="Add to team"
            disabled={addingToTeam}
            className={`${ACTION_BTN} border-transparent text-accent-text hover:bg-app disabled:cursor-default disabled:opacity-60`}
          >
            {addingToTeam ? "Adding…" : "+ Team"}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            duplicatePlay(play.id);
            // Persist the newly created copy to Firestore.
            // The copy is always appended last in the plays list.
            const { plays } = useStore.getState();
            const copy = plays[plays.length - 1];
            if (copy && copy.id !== play.id) savePlay(copy).catch(() => {});
          }}
          aria-label="Duplicate play"
          title="Duplicate play"
          className={`${ACTION_BTN} border-transparent text-muted hover:bg-app hover:text-ink`}
        >
          Copy
        </button>
        <button
          type="button"
          onClick={handleDelete}
          onBlur={handleDeleteBlur}
          aria-label={confirmDelete ? "Confirm delete play" : "Delete play"}
          title={confirmDelete ? "Click again to confirm delete" : "Delete play"}
          className={`${ACTION_BTN} ml-auto ${
            confirmDelete ? "border-danger font-semibold text-danger" : "border-transparent text-muted hover:bg-app hover:text-danger"
          }`}
        >
          {confirmDelete ? "Sure?" : "Delete"}
        </button>
      </div>
    </div>
  );
}
