"use client";

/**
 * SceneStrip — horizontal scrollable strip at the bottom of the editor.
 *
 * Implements issue #63: Scene management — add, remove, duplicate, reorder.
 *
 * On mobile (<768px, viewer-only) the strip shows the thumbnails only: no
 * labels and no add button.
 *
 * Features:
 *   - Renders a mini SVG court thumbnail for each scene showing player dots and
 *     the ball, in the scene's orientation (shared CourtThumbnail).
 *   - Click a scene card to select it.
 *   - [+] button to append a new scene.
 *   - Right-click context menu: Duplicate, Move Left, Move Right, Delete.
 *   - Keyboard: Delete/Backspace deletes the selected scene (when not focused on input).
 *   - Active scene is highlighted with an accent border.
 *   - First (and only) scene cannot be deleted.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useStore, selectEditorScene } from "@/lib/store";
import type { Scene } from "@/lib/types";
import type { CourtVariant } from "@/lib/courtLayout";
import CourtThumbnail from "@/components/court/CourtThumbnail";
import InfoTooltip from "./InfoTooltip";
import { POPOVER, SECTION_LABEL } from "./chrome";
import { subscribeToComments } from "@/lib/comments";

// ---------------------------------------------------------------------------
// Mini court thumbnail (the court itself is the shared CourtThumbnail)
// ---------------------------------------------------------------------------

/** Thumbnail width in px: normal / compact (tablet) scene cards. */
const THUMBNAIL_W = 120;
const THUMBNAIL_W_COMPACT = 80;

// ---------------------------------------------------------------------------
// Context menu
// ---------------------------------------------------------------------------

interface ContextMenuProps {
  x: number;
  y: number;
  sceneId: string;
  sceneIndex: number;
  totalScenes: number;
  onClose: () => void;
}

function ContextMenu({
  x,
  y,
  sceneId,
  sceneIndex,
  totalScenes,
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
      style={{ top: y, left: x }}
    >
      {[
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

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    // Phones are viewer-only: a long-press must not open Duplicate / Move / Delete.
    if (!window.matchMedia("(min-width: 768px)").matches) return;
    setMenu({ x: e.clientX, y: e.clientY });
  };

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        onContextMenu={handleContextMenu}
        title={`Scene ${index + 1}${scene.note ? ` — ${scene.note}` : ""}`}
        aria-label={`Scene ${index + 1}`}
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
        <span className="hidden max-w-full truncate px-0.5 leading-[14px] md:block">
          {index + 1}
          {scene.note ? ` · ${scene.note.slice(0, 12)}${scene.note.length > 12 ? "…" : ""}` : ""}
        </span>
      </button>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          sceneId={scene.id}
          sceneIndex={index}
          totalScenes={totalScenes}
          onClose={() => setMenu(null)}
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

  // Subscribe to comments to show dot indicators on scene cards
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    const playId = currentPlay?.id;
    if (!playId) return;
    return subscribeToComments(playId, (comments) => {
      const counts: Record<string, number> = {};
      for (const c of comments) {
        if (c.sceneId && !c.resolved) {
          counts[c.sceneId] = (counts[c.sceneId] ?? 0) + 1;
        }
      }
      setCommentCounts(counts);
    });
  }, [currentPlay?.id]);

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
        <InfoTooltip tip="Each scene is a frame of your play. Click to edit it, right-click to duplicate or reorder." />
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

      {/* Add scene button — md+ only: the editor is viewer-only on mobile (issue #81) */}
      <button
        type="button"
        onClick={addScene}
        aria-label="Add scene"
        title="Add scene"
        className={[
          "hidden flex-none items-center justify-center self-stretch rounded-lg border-2 border-dashed border-line-strong text-[13px] text-muted transition-colors md:flex",
          "hover:border-accent-text hover:text-accent-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text",
          isTablet ? "w-20" : "w-[116px]",
        ].join(" ")}
      >
        Add scene
      </button>
    </div>
  );
}
