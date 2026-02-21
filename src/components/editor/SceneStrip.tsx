"use client";

/**
 * SceneStrip — horizontal scrollable strip at the bottom of the editor.
 *
 * Implements issue #63: Scene management — add, remove, duplicate, reorder.
 *
 * Features:
 *   - Renders a mini SVG court thumbnail for each scene showing player dots.
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
import InfoTooltip from "./InfoTooltip";

// ---------------------------------------------------------------------------
// Mini court thumbnail
// ---------------------------------------------------------------------------

/** Renders a tiny SVG court with coloured dots for visible players. */
function SceneThumbnail({ scene, compact = false }: { scene: Scene; compact?: boolean }) {
  const W = compact ? 80 : 120;
  const H = Math.round(W * (47 / 50)); // half-court aspect ratio: 50ft wide × 47ft deep

  // Normalised → pixel helpers.
  // px() scales to width; py() scales to height.
  // Arc radii: a physical radius R_ft has pixel radius = (R_ft/50)*W in BOTH x and y
  // because H = W*(47/50), so (R_ft/47)*H = (R_ft/50)*W. Use px() for all arc radii.
  const px = (nx: number) => nx * W;
  const py = (ny: number) => ny * H;

  // NBA court dimensions (normalised, matching courtDimensions.ts):
  //   y=0 = half-court line, y=1 = baseline
  //   LANE_LEFT=0.34, LANE_RIGHT=0.66, LANE_TOP≈0.596 (19ft from baseline)
  //   FT circle radius = 6ft = px(0.12)
  //   3P radius = 23.75ft = px(0.475), corner y≈0.702, corner x=0.06/0.94
  //   BASKET_Y≈0.888 (5.25ft from baseline), BACKBOARD_Y≈0.915 (4ft from baseline)
  //   CENTRE_CIRCLE_RADIUS = 6ft = px(0.12), RESTRICTED_RADIUS = 4ft = px(0.08)

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      aria-hidden="true"
      style={{ display: "block", borderRadius: 3 }}
    >
      {/* Court background */}
      <rect width={W} height={H} fill="#F0C878" rx={3} />

      {/* Paint (free-throw lane) — 16ft wide × 19ft deep from baseline */}
      <rect
        x={px(0.34)}
        y={py(0.596)}
        width={px(0.32)}
        height={py(0.404)}
        fill="#E07B39"
      />

      {/* Court outline */}
      <rect width={W} height={H} fill="none" stroke="#fff" strokeWidth={1} rx={3} />

      {/* Half-court line (top border) */}
      <line x1={0} y1={0} x2={W} y2={0} stroke="#fff" strokeWidth={0.8} />

      {/* Half-court centre-circle arc — bows into the court (downward, sweep=0=CCW) */}
      <path
        d={`M ${px(0.38)},0 A ${px(0.12)},${px(0.12)} 0 0 0 ${px(0.62)},0`}
        fill="none"
        stroke="#fff"
        strokeWidth={0.8}
      />

      {/* Three-point line: corner straights + arc */}
      {/* Arc: minor arc (large-arc=0) going clockwise (sweep=1) = bows upward over basket */}
      <path
        d={`M ${px(0.06)},${py(1)} L ${px(0.06)},${py(0.702)} A ${px(0.475)},${px(0.475)} 0 0 1 ${px(0.94)},${py(0.702)} L ${px(0.94)},${py(1)}`}
        fill="none"
        stroke="#fff"
        strokeWidth={0.8}
      />

      {/* Lane outline */}
      <rect
        x={px(0.34)}
        y={py(0.596)}
        width={px(0.32)}
        height={py(0.404)}
        fill="none"
        stroke="#fff"
        strokeWidth={0.8}
      />

      {/* Free-throw line */}
      <line
        x1={px(0.34)}
        y1={py(0.596)}
        x2={px(0.66)}
        y2={py(0.596)}
        stroke="#fff"
        strokeWidth={0.8}
      />

      {/* Free-throw circle — upper semicircle toward half-court (sweep=1=CW=upward) */}
      {/* Radius = 6ft = px(0.12); endpoints at lane-center ± radius */}
      <path
        d={`M ${px(0.38)},${py(0.596)} A ${px(0.12)},${px(0.12)} 0 0 1 ${px(0.62)},${py(0.596)}`}
        fill="none"
        stroke="#fff"
        strokeWidth={0.8}
      />

      {/* Backboard (4ft from baseline, 6ft wide) */}
      <line
        x1={px(0.44)}
        y1={py(0.915)}
        x2={px(0.56)}
        y2={py(0.915)}
        stroke="#fff"
        strokeWidth={1}
      />

      {/* Restricted area arc — 4ft radius, toward half-court (sweep=1=CW=upward) */}
      <path
        d={`M ${px(0.42)},${py(0.888)} A ${px(0.08)},${px(0.08)} 0 0 1 ${px(0.58)},${py(0.888)}`}
        fill="none"
        stroke="#fff"
        strokeWidth={0.8}
      />

      {/* Basket */}
      <circle cx={px(0.5)} cy={py(0.888)} r={compact ? 2 : 3} fill="none" stroke="#fff" strokeWidth={0.8} />

      {/* Offensive players — blue fill */}
      {scene.players.offense
        .filter((p) => p.visible)
        .map((p) => (
          <circle
            key={`o-${p.position}`}
            cx={px(p.x)}
            cy={py(p.y)}
            r={4}
            fill="#3B82F6"
            stroke="#fff"
            strokeWidth={0.8}
          />
        ))}

      {/* Defensive players — dark fill */}
      {scene.players.defense
        .filter((p) => p.visible)
        .map((p) => (
          <circle
            key={`d-${p.position}`}
            cx={px(p.x)}
            cy={py(p.y)}
            r={4}
            fill="#1E3A5F"
            stroke="#fff"
            strokeWidth={0.8}
          />
        ))}
    </svg>
  );
}

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
}

function SceneCard({ scene, index, totalScenes, isActive, compact, onClick }: SceneCardProps) {
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
        <SceneThumbnail scene={scene} compact={compact} />
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
