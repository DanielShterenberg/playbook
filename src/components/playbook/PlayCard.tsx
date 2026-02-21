"use client";

/**
 * PlayCard — a card in the playbook grid view.
 *
 * Implements issue #69: Playbook grid view.
 *
 * Shows:
 *   - Thumbnail of the first scene (reuses the SVG court + dots pattern
 *     from SceneStrip's SceneThumbnail logic)
 *   - Play title
 *   - Scene count
 *   - Category badge
 *   - Delete button (with confirmation)
 *
 * Clicking the card opens /play/[id] and sets the play as currentPlay.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import type { Play, Role, Scene } from "@/lib/types";
import { addPlayToTeam, deletePlay, savePlay } from "@/lib/db";

// ---------------------------------------------------------------------------
// Inline mini court thumbnail (same logic as SceneStrip's SceneThumbnail)
// ---------------------------------------------------------------------------

function PlayThumbnail({ scene }: { scene: Scene }) {
  const W = 200;
  const H = Math.round(W / (50 / 47)); // ~188 px

  const px = (nx: number) => nx * W;
  const py = (ny: number) => ny * H;

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      aria-hidden="true"
      style={{ display: "block", width: "100%", height: "auto" }}
    >
      {/* Court background */}
      <rect width={W} height={H} fill="#F0C878" rx={6} />

      {/* Paint (16ft wide × 19ft deep; LANE_LEFT=0.34, LANE_RIGHT=0.66) */}
      <rect
        x={px(0.34)}
        y={py(0.596)}
        width={px(0.32)}
        height={py(0.404)}
        fill="#E07B39"
      />

      {/* Court outline */}
      <rect width={W} height={H} fill="none" stroke="#fff" strokeWidth={1.5} rx={6} />

      {/* Half-court line */}
      <line x1={0} y1={0} x2={W} y2={0} stroke="#fff" strokeWidth={1} />

      {/* Half-court centre-circle arc — bows into the court (sweep=0=CCW) */}
      <path
        d={`M ${px(0.38)},0 A ${px(0.12)},${px(0.12)} 0 0 0 ${px(0.62)},0`}
        fill="none"
        stroke="#fff"
        strokeWidth={1}
      />

      {/* Three-point line: corner straights + minor arc (large-arc=0, sweep=1) bowing upward */}
      <path
        d={`M ${px(0.06)},${py(1)} L ${px(0.06)},${py(0.702)} A ${px(0.475)},${px(0.475)} 0 0 1 ${px(0.94)},${py(0.702)} L ${px(0.94)},${py(1)}`}
        fill="none"
        stroke="#fff"
        strokeWidth={1}
      />

      {/* Lane outline */}
      <rect
        x={px(0.34)}
        y={py(0.596)}
        width={px(0.32)}
        height={py(0.404)}
        fill="none"
        stroke="#fff"
        strokeWidth={1}
      />

      {/* Free-throw line */}
      <line
        x1={px(0.34)}
        y1={py(0.596)}
        x2={px(0.66)}
        y2={py(0.596)}
        stroke="#fff"
        strokeWidth={1}
      />

      {/* Free-throw circle upper arc — toward half-court (sweep=1=CW=upward) */}
      <path
        d={`M ${px(0.38)},${py(0.596)} A ${px(0.12)},${px(0.12)} 0 0 1 ${px(0.62)},${py(0.596)}`}
        fill="none"
        stroke="#fff"
        strokeWidth={1}
      />

      {/* Backboard (4ft from baseline, 6ft wide) */}
      <line
        x1={px(0.44)}
        y1={py(0.915)}
        x2={px(0.56)}
        y2={py(0.915)}
        stroke="#fff"
        strokeWidth={1.5}
      />

      {/* Restricted area arc (sweep=1=CW=upward) */}
      <path
        d={`M ${px(0.42)},${py(0.888)} A ${px(0.08)},${px(0.08)} 0 0 1 ${px(0.58)},${py(0.888)}`}
        fill="none"
        stroke="#fff"
        strokeWidth={1}
      />

      {/* Basket */}
      <circle cx={px(0.5)} cy={py(0.888)} r={5} fill="none" stroke="#fff" strokeWidth={1} />

      {/* Offensive players */}
      {scene.players.offense
        .filter((p) => p.visible)
        .map((p) => (
          <circle
            key={`o-${p.position}`}
            cx={px(p.x)}
            cy={py(p.y)}
            r={4}
            fill="#E07B39"
            stroke="#fff"
            strokeWidth={1}
          />
        ))}

      {/* Defensive players */}
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
            strokeWidth={1}
          />
        ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Category badge colours
// ---------------------------------------------------------------------------

const CATEGORY_COLOURS: Record<string, { bg: string; text: string }> = {
  offense: { bg: "#DBEAFE", text: "#1D4ED8" },
  defense: { bg: "#FEE2E2", text: "#B91C1C" },
  inbound: { bg: "#D1FAE5", text: "#065F46" },
  "press-break": { bg: "#FEF3C7", text: "#92400E" },
  "fast-break": { bg: "#EDE9FE", text: "#5B21B6" },
  oob: { bg: "#F3F4F6", text: "#374151" },
  special: { bg: "#FDF2F8", text: "#9D174D" },
};

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

export default function PlayCard({ play, teamId, role }: PlayCardProps) {
  const router = useRouter();
  const setCurrentPlay = useStore((s) => s.setCurrentPlay);
  const removePlay = useStore((s) => s.removePlay);
  const duplicatePlay = useStore((s) => s.duplicatePlay);
  const updatePlayTeamId = useStore((s) => s.updatePlayTeamId);
  const [hovered, setHovered] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [addingToTeam, setAddingToTeam] = useState(false);

  // A play is "personal" when: user is in a team, the play has no teamId, and
  // the user has permission to edit (admin or editor).
  const isPersonal = Boolean(teamId && !play.teamId);
  const canAddToTeam = isPersonal && (role === "admin" || role === "editor");

  const firstScene = play.scenes[0] ?? null;
  const sceneCount = play.scenes.length;
  const categoryColour = CATEGORY_COLOURS[play.category] ?? { bg: "#F3F4F6", text: "#374151" };

  function openPlay() {
    setCurrentPlay(play);
    router.push(`/play/${play.id}`);
  }

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    removePlay(play.id);
    // Fire-and-forget Firestore delete
    deletePlay(play.id).catch(() => {});
  }

  function handleDeleteBlur() {
    // Reset confirm state if focus leaves
    setConfirmDelete(false);
  }

  async function handleAddToTeam(e: React.MouseEvent) {
    e.stopPropagation();
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
      role="button"
      tabIndex={0}
      aria-label={`Open play: ${play.title}`}
      onClick={openPlay}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") openPlay(); }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setConfirmDelete(false); }}
      style={{
        borderRadius: 12,
        border: `2px solid ${hovered ? "#6366F1" : "#E5E7EB"}`,
        background: "#fff",
        cursor: "pointer",
        overflow: "hidden",
        transition: "border-color 0.15s, box-shadow 0.15s",
        boxShadow: hovered ? "0 4px 20px rgba(99,102,241,0.15)" : "0 1px 4px rgba(0,0,0,0.06)",
        display: "flex",
        flexDirection: "column",
        userSelect: "none",
      }}
    >
      {/* Thumbnail */}
      <div
        style={{
          background: "#F5F3EF",
          padding: "12px 12px 0",
          lineHeight: 0,
        }}
      >
        {firstScene ? (
          <PlayThumbnail scene={firstScene} />
        ) : (
          <div
            style={{
              width: "100%",
              paddingBottom: "94%",
              background: "#E5E7EB",
              borderRadius: 6,
            }}
          />
        )}
      </div>

      {/* Info — three rows: title / buttons / tags */}
      <div style={{ padding: "12px 14px 14px", flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
        {/* Row 1: title */}
        <h3
          style={{
            margin: 0,
            fontSize: 15,
            fontWeight: 700,
            color: "#111827",
            lineHeight: 1.3,
            overflowWrap: "break-word",
          }}
        >
          {play.title}
        </h3>

        {/* Row 2: action buttons — always reserve height, fade in on hover */}
        <div
          style={{
            display: "flex",
            gap: 4,
            flexWrap: "wrap",
            opacity: hovered ? 1 : 0,
            pointerEvents: hovered ? "auto" : "none",
            transition: "opacity 0.15s",
          }}
        >
          {canAddToTeam && (
            <button
              onClick={(e) => { void handleAddToTeam(e); }}
              aria-label="Add play to team"
              title="Add to team"
              disabled={addingToTeam}
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid #A5B4FC",
                background: "transparent",
                color: "#4F46E5",
                fontSize: 12,
                fontWeight: 500,
                cursor: addingToTeam ? "default" : "pointer",
                transition: "all 0.15s",
                whiteSpace: "nowrap",
                opacity: addingToTeam ? 0.6 : 1,
              }}
              onMouseEnter={(e) => { if (!addingToTeam) { (e.currentTarget as HTMLButtonElement).style.background = "#EEF2FF"; } }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            >
              {addingToTeam ? "Adding…" : "+ Team"}
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              duplicatePlay(play.id);
              // Persist the newly created copy to Firestore.
              // The copy is always appended last in the plays list.
              const { plays } = useStore.getState();
              const copy = plays[plays.length - 1];
              if (copy && copy.id !== play.id) savePlay(copy).catch(() => {});
            }}
            aria-label="Duplicate play"
            title="Duplicate play"
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              border: "1px solid #E5E7EB",
              background: "transparent",
              color: "#9CA3AF",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              transition: "all 0.15s",
              whiteSpace: "nowrap",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#4F46E5"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#A5B4FC"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#9CA3AF"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#E5E7EB"; }}
          >
            Copy
          </button>
          <button
            onClick={handleDelete}
            onBlur={handleDeleteBlur}
            aria-label={confirmDelete ? "Confirm delete play" : "Delete play"}
            title={confirmDelete ? "Click again to confirm delete" : "Delete play"}
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              border: `1px solid ${confirmDelete ? "#FCA5A5" : "#E5E7EB"}`,
              background: confirmDelete ? "#FEE2E2" : "transparent",
              color: confirmDelete ? "#B91C1C" : "#9CA3AF",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              transition: "all 0.15s",
              whiteSpace: "nowrap",
            }}
          >
            {confirmDelete ? "Sure?" : "Delete"}
          </button>
        </div>

        {play.description && (
          <p
            style={{
              margin: 0,
              fontSize: 12,
              color: "#6B7280",
              lineHeight: 1.4,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical" as const,
              overflow: "hidden",
            }}
          >
            {play.description}
          </p>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: "auto", paddingTop: 4 }}>
          {/* Category badge */}
          <span
            style={{
              padding: "2px 8px",
              borderRadius: 99,
              background: categoryColour.bg,
              color: categoryColour.text,
              fontSize: 11,
              fontWeight: 600,
              textTransform: "capitalize",
              letterSpacing: "0.01em",
            }}
          >
            {play.category.replace("-", " ")}
          </span>

          {/* Personal badge — shown when this play has not yet been added to the team */}
          {isPersonal && (
            <span
              title="This play is personal and not yet shared with the team"
              style={{
                padding: "2px 7px",
                borderRadius: 99,
                background: "#FEF9C3",
                color: "#92400E",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.01em",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              Personal
            </span>
          )}

          {/* Scene count */}
          <span style={{ fontSize: 12, color: "#9CA3AF", marginLeft: "auto" }}>
            {sceneCount} {sceneCount === 1 ? "scene" : "scenes"}
          </span>
        </div>
      </div>
    </div>
  );
}
