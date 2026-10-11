"use client";

/**
 * EditorHeader — client component for the play editor page header.
 *
 * Shows:
 *   - The logo as the link back to /playbook (a chevron on mobile); it syncs
 *     currentPlay changes back to the list
 *   - Current play title (from the Zustand store) or the raw play ID, with the
 *     court type, category and auto-save state under it
 *   - Pencil edit button to edit play metadata (title, description, category, court type) — issue #71
 *   - Theme, undo / redo, comments, shortcuts, save, share, present and export
 *
 * Below lg the flip / comments / shortcuts / theme controls move into the
 * "More options" menu; on mobile share, present and edit details join them.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import type { Category, CourtType, PlayColors } from "@/lib/types";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/contexts/TeamContext";
import { createShareToken, loadTeam } from "@/lib/team";
import PresentationOverlay from "@/components/editor/PresentationOverlay";
import CommentsPanel from "@/components/editor/CommentsPanel";
import { useOpenCommentCounts } from "@/hooks/useOpenCommentCounts";
import SaveIndicator from "@/components/editor/SaveIndicator";
import UndoRedoButtons from "@/components/editor/UndoRedoButtons";
import ExportMenu from "@/components/editor/ExportMenu";
import ShortcutsButton, { toggleShortcutsOverlay } from "@/components/editor/ShortcutsButton";
import { ACCENT_BTN, FIELD, ICON_BTN, MENU_ITEM, POPOVER, TEXT_BTN } from "@/components/editor/chrome";
import Logo, { LogoMark } from "@/components/brand/Logo";
import ThemeToggle from "@/components/brand/ThemeToggle";
import { DEFAULT_OFFENSE_COLOR, DEFAULT_DEFENSE_COLOR } from "@/lib/tokenSizing";
import { customTeamColor } from "@/lib/courtPalette";
import { CATEGORY_LABELS, CATEGORY_OPTIONS } from "@/lib/categories";

interface EditorHeaderProps {
  playId: string;
}

const LABEL = "mb-1.5 block text-[13px] font-semibold text-ink";

function ShareIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M13 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM7 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM13 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 8.5l3-2M9 11.5l3 2" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  );
}

function CommentsIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M2 5a2 2 0 012-2h12a2 2 0 012 2v7a2 2 0 01-2 2H6l-4 3V5z" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  );
}

function PresentIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="2" y="3" width="16" height="12" rx="1.5" stroke="currentColor" strokeWidth={1.5} />
      <path d="M7 18h6M10 15v3" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  );
}

function FlipIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 2v12M5 5L2 8l3 3M11 5l3 3-3 3" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M13.586 3.586a2 2 0 1 1 2.828 2.828l-9 9A2 2 0 0 1 6 16H4a1 1 0 0 1-1-1v-2a2 2 0 0 1 .586-1.414l9-9z"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Open-comments count pill. */
function CountBadge({ count, className = "" }: { count: number; className?: string }) {
  return (
    <span className={`flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[11px] font-bold leading-none text-accent-ink ${className}`}>
      {count}
    </span>
  );
}

export default function EditorHeader({ playId }: EditorHeaderProps) {
  const { user } = useAuth();
  const { team } = useTeam();
  const currentPlay = useStore((s) => s.currentPlay);
  const updatePlayInList = useStore((s) => s.updatePlayInList);
  const updatePlayMeta = useStore((s) => s.updatePlayMeta);
  const updatePlayColors = useStore((s) => s.updatePlayColors);
  const isPresentationMode = useStore((s) => s.isPresentationMode);
  const enterPresentationMode = useStore((s) => s.enterPresentationMode);
  const setPlayFlipped = useStore((s) => s.setPlayFlipped);

  const title = currentPlay?.title ?? null;

  // When navigating away, sync any in-flight changes back to the plays list.
  const handleBack = useCallback(() => {
    if (currentPlay) {
      updatePlayInList(currentPlay);
    }
  }, [currentPlay, updatePlayInList]);

  // ---------------------------------------------------------------------------
  // Edit metadata modal
  // ---------------------------------------------------------------------------

  const selectedSceneId = useStore((s) => s.selectedSceneId);
  const [showComments, setShowComments] = useState(false);
  const { total: totalOpenComments } = useOpenCommentCounts(currentPlay?.id);

  const sceneLabels = useMemo<Record<string, string>>(() => {
    if (!currentPlay) return {};
    const sorted = [...currentPlay.scenes].sort((a, b) => a.order - b.order);
    const labels: Record<string, string> = {};
    sorted.forEach((s, i) => { labels[s.id] = `Scene ${i + 1}`; });
    return labels;
  }, [currentPlay]);


  const [isSharing, setIsSharing] = useState(false);
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  async function handleShare() {
    if (!currentPlay || !user || isSharing) return;
    setIsSharing(true);
    setShareMsg(null);
    try {
      // The viewer shows the team under the title; a personal play has none.
      // The team context may not have loaded yet (Share right after a refresh),
      // and the name is frozen into the link, so fetch it then.
      const playTeam = !currentPlay.teamId
        ? null
        : team?.id === currentPlay.teamId
          ? team
          : await loadTeam(currentPlay.teamId).catch(() => null);
      const teamName = playTeam?.name ?? null;
      const token = await createShareToken(currentPlay, user.uid, teamName);
      const url = `${window.location.origin}/view/${token}`;
      await navigator.clipboard.writeText(url);
      setShareMsg("Link copied!");
    } catch {
      setShareMsg("Failed to create link");
    } finally {
      setIsSharing(false);
      setTimeout(() => setShareMsg(null), 3000);
    }
  }

  const [showEdit, setShowEdit] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editCategory, setEditCategory] = useState<Category>("offense");
  const [editCourtType, setEditCourtType] = useState<CourtType>("half");
  const [editOffenseColor, setEditOffenseColor] = useState(DEFAULT_OFFENSE_COLOR);
  const [editDefenseColor, setEditDefenseColor] = useState(DEFAULT_DEFENSE_COLOR);
  const [editError, setEditError] = useState("");

  const titleInputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  function openEdit() {
    if (!currentPlay) return;
    setEditTitle(currentPlay.title);
    setEditDesc(currentPlay.description);
    setEditCategory(currentPlay.category);
    setEditCourtType(currentPlay.courtType);
    setEditOffenseColor(customTeamColor(currentPlay.colors?.offense) ?? DEFAULT_OFFENSE_COLOR);
    setEditDefenseColor(customTeamColor(currentPlay.colors?.defense) ?? DEFAULT_DEFENSE_COLOR);
    setEditError("");
    setShowEdit(true);
  }

  useEffect(() => {
    if (showEdit) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [showEdit]);

  useEffect(() => {
    if (!showEdit) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setShowEdit(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [showEdit]);

  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === overlayRef.current) setShowEdit(false);
  }

  // ---------------------------------------------------------------------------
  // "More options" menu (below lg)
  // ---------------------------------------------------------------------------

  const [showMore, setShowMore] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showMore) return;
    function handleDown(e: MouseEvent | TouchEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setShowMore(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setShowMore(false);
    }
    document.addEventListener("mousedown", handleDown);
    document.addEventListener("touchstart", handleDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleDown);
      document.removeEventListener("touchstart", handleDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [showMore]);

  const flipped = currentPlay?.flipped ?? false;
  const shareLabel = shareMsg ?? (isSharing ? "Sharing…" : "Share");
  const categoryLabel = currentPlay ? CATEGORY_LABELS[currentPlay.category] : undefined;
  const metaLabel = currentPlay
    ? `${currentPlay.courtType === "full" ? "Full-court" : "Half-court"}${categoryLabel ? ` ${categoryLabel.toLowerCase()}` : ""}`
    : null;

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = editTitle.trim();
    if (!trimmed) {
      setEditError("Title is required.");
      titleInputRef.current?.focus();
      return;
    }
    const patch = { title: trimmed, description: editDesc, category: editCategory, courtType: editCourtType };
    const colors: PlayColors = { offense: editOffenseColor, defense: editDefenseColor };
    updatePlayMeta(patch);
    updatePlayColors(colors);
    // Sync immediately to the plays list so the playbook grid reflects the update.
    if (currentPlay) {
      updatePlayInList({ ...currentPlay, ...patch, colors, updatedAt: new Date() });
    }
    setShowEdit(false);
  }

  return (
    <>
      <header className="relative z-30 flex min-w-0 items-center gap-2 border-b border-line bg-surface px-3 py-2 md:flex-wrap md:gap-4 md:px-5 md:py-2.5">
        {/* Back to playbook — a chevron on mobile, the logo from md up */}
        <Link
          href="/playbook"
          onClick={handleBack}
          aria-label="Back to playbook"
          title="Back to Playbook"
          className="flex h-11 w-11 flex-none items-center justify-center rounded-lg text-ink transition-colors hover:bg-app md:hidden"
        >
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 5-7 7 7 7" />
          </svg>
        </Link>
        <Link
          href="/playbook"
          onClick={handleBack}
          aria-label="Back to playbook"
          title="Back to Playbook"
          className="hidden flex-none items-center rounded-lg md:flex"
        >
          <span className="lg:hidden">
            <LogoMark size={34} decorative />
          </span>
          <span className="hidden lg:inline-flex">
            <Logo size={34} />
          </span>
        </Link>

        <div className="hidden h-7 w-px flex-none bg-line md:block" aria-hidden="true" />

        {/* Title + meta / save state */}
        <div className="flex min-w-0 flex-1 flex-col md:basis-[200px] md:gap-0.5">
          <div className="flex min-w-0 items-center gap-1">
            <h1 className="truncate font-display text-xl font-semibold leading-6 tracking-[0.02em] text-ink">
              {title ? (
                title
              ) : (
                <>
                  <span className="hidden sm:inline">Play Editor — </span>
                  <span className="font-mono text-base font-normal text-muted">{playId}</span>
                </>
              )}
            </h1>

            {/* Edit metadata button (in the More menu on mobile) */}
            {currentPlay && (
              <button
                type="button"
                onClick={openEdit}
                aria-label="Edit play details"
                title="Edit play details"
                className="hidden h-7 w-7 flex-none items-center justify-center rounded-md text-muted transition-colors hover:bg-app hover:text-ink md:flex"
              >
                <PencilIcon />
              </button>
            )}
          </div>
          <p className="flex min-w-0 items-center text-xs leading-4 text-muted">
            {metaLabel && <span className="hidden truncate md:inline">{metaLabel}</span>}
            <SaveIndicator separated={metaLabel !== null} />
          </p>
        </div>

        <div className="flex flex-none items-center gap-2 md:flex-wrap">
          <div className="hidden lg:block">
            <ThemeToggle />
          </div>

          {/* Undo / Redo buttons (issue #83) — md+; phones have Undo in the bottom tool bar */}
          <div className="hidden md:block">
            <UndoRedoButtons />
          </div>

          {/* Comments button */}
          {currentPlay && (
            <button
              type="button"
              onClick={() => setShowComments((v) => !v)}
              aria-label="Toggle comments"
              aria-pressed={showComments}
              title="Comments"
              className={`${ICON_BTN} relative hidden lg:flex`}
            >
              <CommentsIcon />
              {totalOpenComments > 0 && <CountBadge count={totalOpenComments} className="absolute -right-1.5 -top-1.5" />}
            </button>
          )}

          <ShortcutsButton className="hidden lg:flex" />

          {/* Share button (#78) */}
          <button
            type="button"
            onClick={handleShare}
            disabled={!currentPlay || !user || isSharing}
            aria-label="Share play"
            title="Create a shareable read-only link"
            className={`${TEXT_BTN} hidden md:flex`}
          >
            {shareLabel}
          </button>

          {/* Present button */}
          <button
            type="button"
            onClick={enterPresentationMode}
            disabled={!currentPlay}
            aria-label="Enter presentation mode"
            title="Present (full-screen view)"
            className={`${TEXT_BTN} hidden md:flex`}
          >
            Present
          </button>

          {/* More options — everything the bar has no room for below lg */}
          <div ref={moreRef} className="relative lg:hidden">
            <button
              type="button"
              onClick={() => setShowMore((v) => !v)}
              aria-label="More options"
              aria-haspopup="true"
              aria-expanded={showMore}
              title="More options"
              className="relative flex h-11 w-11 flex-none items-center justify-center rounded-lg text-ink transition-colors hover:bg-app md:border md:border-line"
            >
              <svg width={20} height={20} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx={5} cy={12} r={2} />
                <circle cx={12} cy={12} r={2} />
                <circle cx={19} cy={12} r={2} />
              </svg>
              {totalOpenComments > 0 && <CountBadge count={totalOpenComments} className="absolute -right-1 -top-1" />}
            </button>

            {showMore && (
              <div role="menu" aria-label="More options" className={`${POPOVER} absolute right-0 top-full z-50 mt-1 w-64 p-1.5`}>
                {currentPlay && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { setShowMore(false); openEdit(); }}
                    className={`${MENU_ITEM} md:hidden`}
                  >
                    <PencilIcon />
                    Edit play details
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleShare}
                  disabled={!currentPlay || !user || isSharing}
                  title="Create a shareable read-only link"
                  className={`${MENU_ITEM} md:hidden`}
                >
                  <ShareIcon />
                  {shareLabel}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { setShowMore(false); enterPresentationMode(); }}
                  disabled={!currentPlay}
                  className={`${MENU_ITEM} md:hidden`}
                >
                  <PresentIcon />
                  Present
                </button>
                {currentPlay && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { setShowMore(false); setShowComments((v) => !v); }}
                    className={MENU_ITEM}
                  >
                    <CommentsIcon />
                    <span className="flex-1">{showComments ? "Hide comments" : "Comments"}</span>
                    {totalOpenComments > 0 && <CountBadge count={totalOpenComments} />}
                  </button>
                )}
                {/* Flip court orientation (a checkbox in the roster panel on lg+) */}
                {currentPlay && (
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={flipped}
                    onClick={() => setPlayFlipped(!flipped)}
                    title="Flip court (basket north/south)"
                    className={MENU_ITEM}
                  >
                    <FlipIcon />
                    <span className="flex-1">Flip court</span>
                    <span className="text-xs text-muted">{flipped ? "On" : "Off"}</span>
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { setShowMore(false); toggleShortcutsOverlay(); }}
                  className={`${MENU_ITEM} hidden md:flex`}
                >
                  <span className="flex w-[18px] justify-center font-semibold" aria-hidden="true">?</span>
                  Keyboard shortcuts
                </button>
                <div className="mt-1 flex items-center justify-between border-t border-line px-3 pt-1.5">
                  <span className="text-sm text-ink">Theme</span>
                  <ThemeToggle />
                </div>
              </div>
            )}
          </div>

          <ExportMenu />
        </div>
      </header>

      {/* Presentation mode overlay */}
      {isPresentationMode && <PresentationOverlay />}

      {/* Comments panel */}
      {showComments && currentPlay && (
        <CommentsPanel
          playId={currentPlay.id}
          selectedSceneId={selectedSceneId}
          onClose={() => setShowComments(false)}
          sceneLabels={sceneLabels}
        />
      )}

      {/* Edit play modal */}
      {showEdit && (
        <div
          ref={overlayRef}
          onClick={handleOverlayClick}
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-play-title"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
        >
          <div className="max-h-full w-full max-w-[460px] overflow-y-auto rounded-xl border border-line bg-surface p-7 pb-6 text-ink shadow-2xl">
            <h2 id="edit-play-title" className="mb-5 font-display text-2xl font-semibold tracking-[0.02em] text-ink">
              Edit Play
            </h2>

            <form onSubmit={handleSave} noValidate>
              {/* Title */}
              <div className="mb-4">
                <label htmlFor="edit-title" className={LABEL}>
                  Title <span className="text-danger">*</span>
                </label>
                <input
                  id="edit-title"
                  ref={titleInputRef}
                  type="text"
                  value={editTitle}
                  onChange={(e) => { setEditTitle(e.target.value); if (editError) setEditError(""); }}
                  placeholder="e.g. Horns Set, Box Out, 1-3-1 Zone"
                  maxLength={80}
                  className={`${FIELD} h-11 ${editError ? "border-danger" : ""}`}
                />
                {editError && (
                  <p role="alert" className="mt-1 text-xs text-danger">
                    {editError}
                  </p>
                )}
              </div>

              {/* Description */}
              <div className="mb-4">
                <label htmlFor="edit-description" className={LABEL}>
                  Description <span className="font-normal text-muted">(optional)</span>
                </label>
                <textarea
                  id="edit-description"
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  placeholder="Brief notes about this play…"
                  rows={2}
                  maxLength={300}
                  className={`${FIELD} resize-y py-2`}
                />
              </div>

              {/* Court type + Category row */}
              <div className="mb-4 grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="edit-court-type" className={LABEL}>
                    Court
                  </label>
                  <select
                    id="edit-court-type"
                    value={editCourtType}
                    onChange={(e) => setEditCourtType(e.target.value as CourtType)}
                    className={`${FIELD} h-11 cursor-pointer`}
                  >
                    <option value="half">Half Court</option>
                    <option value="full">Full Court</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="edit-category" className={LABEL}>
                    Category
                  </label>
                  <select
                    id="edit-category"
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value as Category)}
                    className={`${FIELD} h-11 cursor-pointer`}
                  >
                    {CATEGORY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Team colors row */}
              <div className="mb-6">
                <p className={LABEL}>Team Colors</p>
                <div className="grid grid-cols-2 gap-3">
                  {/* Offense color */}
                  <div>
                    <label htmlFor="edit-offense-color" className="mb-1.5 block text-xs font-medium text-muted">
                      Offense
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id="edit-offense-color"
                        type="color"
                        value={editOffenseColor}
                        onChange={(e) => setEditOffenseColor(e.target.value)}
                        className="h-11 w-11 flex-none cursor-pointer rounded-md border border-line-strong bg-transparent p-0.5"
                        aria-label="Offense team color"
                      />
                      <span className="select-all font-mono text-xs text-muted">
                        {editOffenseColor.toUpperCase()}
                      </span>
                      {editOffenseColor !== DEFAULT_OFFENSE_COLOR && (
                        <button
                          type="button"
                          onClick={() => setEditOffenseColor(DEFAULT_OFFENSE_COLOR)}
                          title="Reset to default"
                          className="text-xs text-accent-text underline"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Defense color */}
                  <div>
                    <label htmlFor="edit-defense-color" className="mb-1.5 block text-xs font-medium text-muted">
                      Defense
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id="edit-defense-color"
                        type="color"
                        value={editDefenseColor}
                        onChange={(e) => setEditDefenseColor(e.target.value)}
                        className="h-11 w-11 flex-none cursor-pointer rounded-md border border-line-strong bg-transparent p-0.5"
                        aria-label="Defense team color"
                      />
                      <span className="select-all font-mono text-xs text-muted">
                        {editDefenseColor.toUpperCase()}
                      </span>
                      {editDefenseColor !== DEFAULT_DEFENSE_COLOR && (
                        <button
                          type="button"
                          onClick={() => setEditDefenseColor(DEFAULT_DEFENSE_COLOR)}
                          title="Reset to default"
                          className="text-xs text-accent-text underline"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2.5">
                <button type="button" onClick={() => setShowEdit(false)} className={TEXT_BTN}>
                  Cancel
                </button>
                <button type="submit" className={ACCENT_BTN}>
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
