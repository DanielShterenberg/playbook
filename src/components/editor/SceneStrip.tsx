"use client";

/**
 * SceneStrip — horizontal scrollable strip at the bottom of the editor.
 *
 * Implements issue #63: Scene management — add, remove, duplicate, reorder.
 *
 * Features:
 *   - Renders a mini SVG court thumbnail for each scene showing player dots and
 *     the ball, in the scene's orientation (shared CourtThumbnail).
 *   - Click a scene card to select it.
 *   - [+] button to append a new scene.
 *   - Right-click context menu: Duplicate, Move Left, Move Right, Delete.
 *   - Keyboard: Delete/Backspace deletes the selected scene (when not focused on input).
 *   - Active scene is highlighted with a blue ring.
 *   - First (and only) scene cannot be deleted.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useStore, selectEditorScene } from "@/lib/store";
import type { Scene } from "@/lib/types";
import type { CourtVariant } from "@/lib/courtLayout";
import CourtThumbnail from "@/components/court/CourtThumbnail";
import InfoTooltip from "./InfoTooltip";
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
      style={{
        position: "fixed",
        top: y,
        left: x,
        zIndex: 50,
        minWidth: 160,
        background: "#fff",
        border: "1px solid #E5E7EB",
        borderRadius: 8,
        boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
        padding: "4px 0",
      }}
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
          role="menuitem"
          disabled={disabled}
          onClick={disabled ? undefined : action}
          style={{
            display: "block",
            width: "100%",
            padding: "7px 16px",
            textAlign: "left",
            fontSize: 13,
            fontWeight: 400,
            background: "none",
            border: "none",
            cursor: disabled ? "default" : "pointer",
            color: disabled ? "#9CA3AF" : danger ? "#DC2626" : "#111827",
          }}
          onMouseEnter={(e) => {
            if (!disabled) (e.currentTarget as HTMLButtonElement).style.background = "#F3F4F6";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "none";
          }}
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
    setMenu({ x: e.clientX, y: e.clientY });
  };

  return (
    <>
      <button
        onClick={onClick}
        onContextMenu={handleContextMenu}
        title={`Scene ${index + 1}${scene.note ? ` — ${scene.note}` : ""}`}
        aria-label={`Scene ${index + 1}`}
        aria-pressed={isActive}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
          padding: 4,
          borderRadius: 8,
          border: isActive ? "2px solid #3B82F6" : "2px solid transparent",
          background: isActive ? "#EFF6FF" : "#F9FAFB",
          cursor: "pointer",
          outline: "none",
          flexShrink: 0,
          transition: "border-color 0.1s, background 0.1s",
        }}
        onMouseEnter={(e) => {
          if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "#F3F4F6";
        }}
        onMouseLeave={(e) => {
          if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "#F9FAFB";
        }}
      >
        <div style={{ position: "relative", display: "inline-block" }}>
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
              style={{
                position: "absolute",
                top: -4,
                right: -4,
                minWidth: 14,
                height: 14,
                borderRadius: 7,
                background: "#F59E0B",
                color: "#fff",
                fontSize: 9,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "0 3px",
                boxShadow: "0 0 0 1.5px #fff",
                lineHeight: 1,
              }}
            >
              {commentCount}
            </span>
          )}
        </div>
        <span
          style={{
            fontSize: 11,
            fontWeight: isActive ? 600 : 400,
            color: isActive ? "#2563EB" : "#6B7280",
            lineHeight: 1,
          }}
        >
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
    <footer
      style={{
        borderTop: "1px solid #E5E7EB",
        background: "#fff",
        padding: isTablet ? "6px 10px" : "8px 12px",
        display: "flex",
        alignItems: "center",
        gap: 8,
        overflowX: "auto",
        minHeight: isTablet ? 64 : 80,
      }}
      aria-label="Scene strip"
    >
      {/* Label */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, paddingRight: 4, flexShrink: 0 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: "#9CA3AF", letterSpacing: "0.05em", textTransform: "uppercase" }}>
          Scenes
        </span>
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
        <span style={{ fontSize: 11, color: "#9CA3AF", fontStyle: "italic", alignSelf: "center", flexShrink: 0 }}>
          Add a scene for the next moment →
        </span>
      )}

      {/* Add scene button */}
      <button
        onClick={addScene}
        aria-label="Add scene"
        title="Add scene"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 36,
          height: 36,
          borderRadius: 8,
          border: "2px dashed #D1D5DB",
          background: "none",
          cursor: "pointer",
          color: "#9CA3AF",
          fontSize: 22,
          fontWeight: 300,
          flexShrink: 0,
          transition: "border-color 0.1s, color 0.1s",
          lineHeight: 1,
        }}
        onMouseEnter={(e) => {
          const btn = e.currentTarget;
          btn.style.borderColor = "#3B82F6";
          btn.style.color = "#3B82F6";
        }}
        onMouseLeave={(e) => {
          const btn = e.currentTarget;
          btn.style.borderColor = "#D1D5DB";
          btn.style.color = "#9CA3AF";
        }}
      >
        +
      </button>
    </footer>
  );
}
