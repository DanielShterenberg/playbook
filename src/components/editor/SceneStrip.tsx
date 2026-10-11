"use client";

/**
 * SceneStrip — horizontal scrollable strip at the bottom of the editor.
 *
 * Implements issue #63: Scene management — add, remove, duplicate, reorder.
 *
 * On phones (<768px) the strip shows the thumbnails without labels and a
 * compact "+" tile for adding a scene.
 *
 * Features:
 *   - Renders a mini SVG court thumbnail for each scene showing player dots and
 *     the ball, in the scene's orientation (shared CourtThumbnail).
 *   - Click a scene card to select it.
 *   - [+] button to append a new scene.
 *   - Right-click context menu: Rename, Duplicate, Move Left, Move Right, Delete.
 *   - Double-click a card (or F2 when it has focus) to rename it.
 *   - A scene's name is its `note`: shown under the thumbnail here and next to
 *     "Scene n of m" in the share viewer.
 *   - Keyboard: Delete/Backspace deletes the selected scene (when not focused on input).
 *   - Active scene is highlighted with an accent border.
 *   - First (and only) scene cannot be deleted.
 */

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { useStore, selectEditorScene } from "@/lib/store";
import { SCENE_NAME_MAX } from "@/lib/types";
import type { Scene } from "@/lib/types";
import type { CourtVariant } from "@/lib/courtLayout";
import CourtThumbnail from "@/components/court/CourtThumbnail";
import InfoTooltip from "./InfoTooltip";
import { POPOVER, SECTION_LABEL } from "./chrome";
import { useOpenCommentCounts } from "@/hooks/useOpenCommentCounts";
import { useTeam } from "@/contexts/TeamContext";

// ---------------------------------------------------------------------------
// Mini court thumbnail (the court itself is the shared CourtThumbnail)
// ---------------------------------------------------------------------------

/** Thumbnail width in px: normal / compact (tablet) scene cards. */
const THUMBNAIL_W = 120;
const THUMBNAIL_W_COMPACT = 80;

// ---------------------------------------------------------------------------
// Context menu
// ---------------------------------------------------------------------------

const POPOVER_MARGIN = 8;

/**
 * Position for a popover opened at the pointer, measured so it stays on
 * screen: it opens downward if it fits below the pointer, else upward, and is
 * clamped to the window either way (the strip sits at the bottom of the
 * editor, so upward is the usual case). Transparent until measured — not
 * `visibility: hidden`, which would refuse the rename field's focus.
 */
function usePopoverPosition(
  ref: React.RefObject<HTMLElement>,
  x: number,
  y: number,
  /** Open upward from the point even when there is room below (the point is a card's top edge). */
  above = false,
): React.CSSProperties {
  const [style, setStyle] = useState<React.CSSProperties>({ left: x, top: y, opacity: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const maxLeft = window.innerWidth - width - POPOVER_MARGIN;
    const maxTop = window.innerHeight - height - POPOVER_MARGIN;
    const top = !above && y + height <= window.innerHeight - POPOVER_MARGIN ? y : y - height;
    setStyle({
      left: Math.max(POPOVER_MARGIN, Math.min(x, maxLeft)),
      top: Math.max(POPOVER_MARGIN, Math.min(top, maxTop)),
    });
  }, [ref, x, y, above]);
  return style;
}

interface ContextMenuProps {
  x: number;
  y: number;
  sceneId: string;
  sceneIndex: number;
  totalScenes: number;
  onRename: () => void;
  onClose: () => void;
}

function ContextMenu({
  x,
  y,
  sceneId,
  sceneIndex,
  totalScenes,
  onRename,
  onClose,
}: ContextMenuProps) {
  const duplicateScene = useStore((s) => s.duplicateScene);
  const removeScene = useStore((s) => s.removeScene);
  const reorderScene = useStore((s) => s.reorderScene);
  const setSceneFlipped = useStore((s) => s.setSceneFlipped);
  const currentPlay = useStore((s) => s.currentPlay);
  const scene = currentPlay?.scenes.find((s) => s.id === sceneId) ?? null;
  const playFlipped = currentPlay?.flipped ?? false;
  const sceneEffectiveFlipped = scene?.flipped != null ? scene.flipped : playFlipped;
  const ref = useRef<HTMLDivElement>(null);
  const position = usePopoverPosition(ref, x, y);

  // Close when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  const handle = (fn: () => void) => {
    fn();
    onClose();
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Scene options"
      className={`${POPOVER} fixed z-50 min-w-[160px] py-1`}
      style={position}
    >
      {[
        {
          label: "Rename",
          disabled: false,
          action: () => handle(onRename),
        },
        {
          label: "Duplicate",
          disabled: false,
          action: () => handle(() => duplicateScene(sceneId)),
        },
        {
          label: "Move Left",
          disabled: sceneIndex === 0,
          action: () => handle(() => reorderScene(sceneId, sceneIndex - 1)),
        },
        {
          label: "Move Right",
          disabled: sceneIndex === totalScenes - 1,
          action: () => handle(() => reorderScene(sceneId, sceneIndex + 1)),
        },
        {
          label: sceneEffectiveFlipped ? "Unflip scene" : "Flip scene",
          disabled: false,
          action: () => handle(() => setSceneFlipped(sceneId, !sceneEffectiveFlipped)),
        },
        {
          label: "Reset scene flip",
          disabled: scene?.flipped == null,
          action: () => handle(() => setSceneFlipped(sceneId, null)),
        },
        {
          label: "Delete",
          disabled: totalScenes <= 1,
          danger: true,
          action: () => handle(() => removeScene(sceneId)),
        },
      ].map(({ label, disabled, danger, action }) => (
        <button
          key={label}
          type="button"
          role="menuitem"
          disabled={disabled}
          onClick={disabled ? undefined : action}
          className={[
            "block w-full px-4 py-2 text-left text-[13px] transition-colors",
            disabled
              ? "cursor-default text-muted opacity-50"
              : danger
                ? "text-danger hover:bg-chip"
                : "text-ink hover:bg-chip",
          ].join(" ")}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rename popover
// ---------------------------------------------------------------------------

interface RenamePopoverProps {
  /** Left edge and top edge of the scene card: the form opens above it. */
  x: number;
  y: number;
  sceneId: string;
  sceneNumber: number;
  initial: string;
  onClose: () => void;
}

/** Small form above a scene card for naming it. Enter or leaving the field saves, Esc cancels. */
function RenamePopover({ x, y, sceneId, sceneNumber, initial, onClose }: RenamePopoverProps) {
  const updateSceneNote = useStore((s) => s.updateSceneNote);
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const position = usePopoverPosition(formRef, x, y, true);
  // Enter, blur and resize can all end the edit; only the first one counts.
  const done = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  /** Close, saving the name if the user changed it (never rewrites an untouched note). */
  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    const next = value.trim();
    if (save && next !== initial.trim()) updateSceneNote(sceneId, next);
    onClose();
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;

  // The form is positioned once; if the window changes under it, end the edit.
  useEffect(() => {
    const onResize = () => finishRef.current(true);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <form
      ref={formRef}
      onSubmit={(e) => { e.preventDefault(); finish(true); }}
      className={`${POPOVER} fixed z-50 flex w-[240px] flex-col gap-1.5 p-3`}
      style={position}
    >
      <label htmlFor={`scene-name-${sceneId}`} className="text-xs text-muted">
        Name of scene {sceneNumber}
      </label>
      <input
        id={`scene-name-${sceneId}`}
        ref={inputRef}
        dir="auto"
        value={value}
        // A longer note written before names had a limit stays editable as it is
        maxLength={Math.max(SCENE_NAME_MAX, initial.length)}
        // Leaving the field (click away, Tab) saves, so shortcuts never act on a half-typed name
        onBlur={() => finish(true)}
        placeholder="e.g. Flare"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape") finish(false); }}
        className="h-9 rounded-md border border-line bg-app px-2.5 text-[13px] text-ink outline-none focus:border-accent-text"
      />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Scene card
// ---------------------------------------------------------------------------

interface SceneCardProps {
  scene: Scene;
  index: number;
  totalScenes: number;
  isActive: boolean;
  compact: boolean;
  onClick: () => void;
  /** Court variant of the play. */
  variant: CourtVariant;
  /** Effective flip of this scene (scene override ?? play default). */
  flipped: boolean;
  offenseColor?: string;
  defenseColor?: string;
  commentCount?: number;
}

function SceneCard({ scene, index, totalScenes, isActive, compact, onClick, variant, flipped, offenseColor, defenseColor, commentCount = 0 }: SceneCardProps) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [rename, setRename] = useState<{ x: number; y: number } | null>(null);
  const cardRef = useRef<HTMLButtonElement>(null);
  // Plays stored before notes existed can lack the field.
  const name = scene.note ?? "";

  // Team viewers cannot edit (#76).
  const { role } = useTeam();
  const canEdit = role !== "viewer";

  // Right-click, or a long press on touch screens that send contextmenu.
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (canEdit) setMenu({ x: e.clientX, y: e.clientY });
  };

  /** Rename from the card itself (double-click / double-tap, or F2 when focused). */
  const renameAtCard = (card: HTMLElement) => {
    if (!canEdit) return;
    const rect = card.getBoundingClientRect();
    setRename({ x: rect.left, y: rect.top - 6 });
  };

  return (
    <>
      <button
        ref={cardRef}
        type="button"
        onClick={onClick}
        onContextMenu={handleContextMenu}
        onDoubleClick={(e) => renameAtCard(e.currentTarget)}
        onKeyDown={(e) => { if (e.key === "F2") renameAtCard(e.currentTarget); }}
        title={`Scene ${index + 1}${name ? ` — ${name}` : ""}`}
        aria-label={`Scene ${index + 1}${name ? `: ${name}` : ""}`}
        aria-pressed={isActive}
        className={[
          "flex flex-none flex-col items-center overflow-hidden rounded-lg border-2 bg-surface text-xs transition-colors dark:bg-app md:gap-0.5 md:p-1",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text",
          isActive ? "border-accent text-ink" : "border-line text-muted hover:border-line-strong",
        ].join(" ")}
      >
        <div className="relative flex">
          <CourtThumbnail
            scene={scene}
            width={compact ? THUMBNAIL_W_COMPACT : THUMBNAIL_W}
            variant={variant}
            flipped={flipped}
            offenseColor={offenseColor}
            defenseColor={defenseColor}
            lineWidth={0.8}
            outlineWidth={1}
            basketRadius={compact ? 2 : 3}
            cornerRadius={3}
          />
          {commentCount > 0 && (
            <span
              title={`${commentCount} open comment${commentCount !== 1 ? "s" : ""}`}
              className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold leading-none text-accent-ink ring-2 ring-surface dark:ring-app"
            >
              {commentCount}
            </span>
          )}
        </div>
        {/* w-0 + min-w-full: the caption takes the thumbnail's width and never widens the card */}
        <span className="hidden w-0 min-w-full truncate px-0.5 text-center leading-[14px] md:block">
          {index + 1}
          {name ? ` · ${name}` : ""}
        </span>
      </button>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          sceneId={scene.id}
          sceneIndex={index}
          totalScenes={totalScenes}
          onRename={() => cardRef.current && renameAtCard(cardRef.current)}
          onClose={() => setMenu(null)}
        />
      )}

      {rename && (
        <RenamePopover
          x={rename.x}
          y={rename.y}
          sceneId={scene.id}
          sceneNumber={index + 1}
          initial={scene.note ?? ""}
          onClose={() => setRename(null)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// SceneStrip
// ---------------------------------------------------------------------------

/** Hook that returns true when the viewport is narrower than 1024 px (tablet). */
function useIsTablet() {
  const [isTablet, setIsTablet] = useState(false);

  const check = useCallback(() => {
    setIsTablet(window.innerWidth < 1024);
  }, []);

  useEffect(() => {
    // Run once on mount (client-side only)
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [check]);

  return isTablet;
}

export default function SceneStrip() {
  const currentPlay = useStore((s) => s.currentPlay);
  const selectedSceneId = useStore((s) => s.selectedSceneId);
  const setSelectedSceneId = useStore((s) => s.setSelectedSceneId);
  const setCurrentSceneIndex = useStore((s) => s.setCurrentSceneIndex);
  const addScene = useStore((s) => s.addScene);
  const scene = useStore(selectEditorScene);
  const playColors = useStore((s) => s.currentPlay?.colors);

  // Open comments per scene, for the dot indicators on scene cards
  const { byScene: commentCounts } = useOpenCommentCounts(currentPlay?.id);

  /**
   * Issue #81 — at tablet widths use compact (smaller) scene thumbnails
   * so the strip fits without triggering horizontal overflow.
   */
  const isTablet = useIsTablet();

  // Sort scenes by order for display
  const scenes = currentPlay
    ? [...currentPlay.scenes].sort((a, b) => a.order - b.order)
    : [];

  const activeId = selectedSceneId ?? scene?.id ?? null;

  // Keyboard Delete/Backspace for scene removal is handled centrally by
  // EditorKeyboardManager (useKeyboardShortcuts, issue #82). No listener here.

  if (!currentPlay) return null;

  return (
    <div
      className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto px-3 py-2 md:gap-3 md:px-5 md:py-3.5"
      aria-label="Scene strip"
    >
      {/* Label */}
      <div className="hidden flex-none items-center gap-1 md:flex">
        <span className={SECTION_LABEL}>Scenes</span>
        <InfoTooltip tip="Each scene is a frame of your play. Click to edit it, double-click to name it, right-click to duplicate or reorder." />
      </div>

      {/* Scene cards */}
      {scenes.map((s, i) => (
        <SceneCard
          key={s.id}
          scene={s}
          index={i}
          totalScenes={scenes.length}
          isActive={s.id === activeId}
          compact={isTablet}
          onClick={() => { setSelectedSceneId(s.id); setCurrentSceneIndex(i); }}
          variant={currentPlay?.courtType === "full" ? "full" : "half"}
          flipped={(s.flipped ?? currentPlay?.flipped) === true}
          offenseColor={playColors?.offense}
          defenseColor={playColors?.defense}
          commentCount={commentCounts[s.id] ?? 0}
        />
      ))}

      {/* Empty-state hint */}
      {scenes.length === 1 && (
        <span className="hidden flex-none self-center text-xs text-muted md:inline">
          Add a scene for the next moment →
        </span>
      )}

      {/* Add scene button — a "+" tile on phones, a labelled one from md up */}
      <button
        type="button"
        onClick={addScene}
        aria-label="Add scene"
        title="Add scene"
        className={[
          "flex w-12 flex-none items-center justify-center self-stretch rounded-lg border-2 border-dashed border-line-strong text-[13px] text-muted transition-colors",
          "hover:border-accent-text hover:text-accent-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text",
          isTablet ? "md:w-20" : "md:w-[116px]",
        ].join(" ")}
      >
        <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true" className="md:hidden">
          <path d="M12 5v14M5 12h14" />
        </svg>
        <span className="hidden md:inline">Add scene</span>
      </button>
    </div>
  );
}
