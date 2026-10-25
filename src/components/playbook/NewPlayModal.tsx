"use client";

/**
 * NewPlayModal — dialog for creating a new play.
 *
 * Implements issue #67: Create new play with properties.
 *
 * Fields:
 *   - Title (required)
 *   - Description (optional)
 *   - Court type: half / full
 *   - Category: offense / defense / inbound / press-break / fast-break / oob / special
 *
 * On submit: creates a Play via createDefaultPlay, adds it to the plays list,
 * then navigates to /play/[id] to open the editor.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { createDefaultPlay } from "@/lib/store";
import type { Category, CourtType } from "@/lib/types";
import { CATEGORY_OPTIONS } from "@/lib/categories";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/contexts/TeamContext";
import { canAddToTeam } from "@/lib/permissions";
import { savePlay } from "@/lib/db";
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  CHOICE,
  CHOICE_OFF,
  CHOICE_ON,
  FIELD,
  FIELD_BORDER,
  FIELD_BORDER_ERROR,
  FIELD_ERROR,
  FIELD_LABEL,
  MODAL_OVERLAY,
  MODAL_PANEL,
  MODAL_TITLE,
} from "./modalStyles";

interface NewPlayModalProps {
  onClose: () => void;
}

export default function NewPlayModal({ onClose }: NewPlayModalProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { teamId, team, role } = useTeam();
  // Viewers keep their new plays personal; they can still edit them.
  const teamChoice = Boolean(teamId) && canAddToTeam(role);
  const addPlay = useStore((s) => s.addPlay);
  const setCurrentPlay = useStore((s) => s.setCurrentPlay);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [courtType, setCourtType] = useState<CourtType>("half");
  const [category, setCategory] = useState<Category>("offense");
  // When user is in a team, default to saving to the team; they can opt out.
  const [saveToTeam, setSaveToTeam] = useState(true);
  const [error, setError] = useState("");

  const titleRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Focus title on open
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === overlayRef.current) onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Title is required.");
      titleRef.current?.focus();
      return;
    }

    const play = createDefaultPlay();
    play.title = trimmed;
    play.description = description.trim();
    play.courtType = courtType;
    play.category = category;
    if (user) play.createdBy = user.uid;
    if (teamId && teamChoice && saveToTeam) play.teamId = teamId;

    addPlay(play);
    setCurrentPlay(play);

    // Persist to Firestore in the background — don't block navigation
    savePlay(play).catch((err) => console.error("[Firestore] savePlay failed:", err));

    router.push(`/play/${play.id}`);
    onClose();
  }

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-play-title"
      className={MODAL_OVERLAY}
    >
      <div className={`${MODAL_PANEL} max-w-[460px]`}>
        <h2 id="new-play-title" className={`${MODAL_TITLE} mb-5`}>
          New Play
        </h2>

        <form onSubmit={handleSubmit} noValidate>
          {/* Title */}
          <div className="mb-4">
            <label htmlFor="play-title" className={FIELD_LABEL}>
              Title <span className="text-danger">*</span>
            </label>
            <input
              id="play-title"
              ref={titleRef}
              type="text"
              dir="auto"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (error) setError("");
              }}
              placeholder="e.g. Horns Set, Box Out, 1-3-1 Zone"
              maxLength={80}
              aria-invalid={error ? true : undefined}
              className={`${FIELD} h-11 ${error ? FIELD_BORDER_ERROR : FIELD_BORDER}`}
            />
            {error && (
              <p role="alert" className={FIELD_ERROR}>
                {error}
              </p>
            )}
          </div>

          {/* Description */}
          <div className="mb-4">
            <label htmlFor="play-description" className={FIELD_LABEL}>
              Description <span className="font-normal text-muted">(optional)</span>
            </label>
            <textarea
              id="play-description"
              dir="auto"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief notes about this play..."
              rows={2}
              maxLength={300}
              className={`${FIELD} ${FIELD_BORDER} block resize-y py-2.5 font-[inherit]`}
            />
          </div>

          {/* Court type + Category row */}
          <div className="mb-6 grid grid-cols-2 gap-3">
            {/* Court type */}
            <div className="min-w-0">
              <label htmlFor="play-court-type" className={FIELD_LABEL}>
                Court
              </label>
              <select
                id="play-court-type"
                value={courtType}
                onChange={(e) => setCourtType(e.target.value as CourtType)}
                className={`${FIELD} ${FIELD_BORDER} h-11 cursor-pointer`}
              >
                <option value="half">Half Court</option>
                <option value="full">Full Court</option>
              </select>
            </div>

            {/* Category */}
            <div className="min-w-0">
              <label htmlFor="play-category" className={FIELD_LABEL}>
                Category
              </label>
              <select
                id="play-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as Category)}
                className={`${FIELD} ${FIELD_BORDER} h-11 cursor-pointer`}
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Save to — only shown to team admins and editors */}
          {teamChoice && (
            <div className="mb-6" role="group" aria-labelledby="play-save-to">
              <span id="play-save-to" className={FIELD_LABEL}>
                Save to
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  dir="auto"
                  onClick={() => setSaveToTeam(true)}
                  aria-pressed={saveToTeam}
                  className={`${CHOICE} ${saveToTeam ? CHOICE_ON : CHOICE_OFF}`}
                >
                  {team?.name ?? "Team"}
                </button>
                <button
                  type="button"
                  onClick={() => setSaveToTeam(false)}
                  aria-pressed={!saveToTeam}
                  className={`${CHOICE} ${!saveToTeam ? CHOICE_ON : CHOICE_OFF}`}
                >
                  Personal
                </button>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2.5">
            <button type="button" onClick={onClose} className={BTN_SECONDARY}>
              Cancel
            </button>
            <button type="submit" className={BTN_PRIMARY}>
              Create Play
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
