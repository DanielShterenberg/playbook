"use client";

/**
 * PlayerRosterPanel — right-side panel for managing per-scene player visibility
 * and the global player display mode.
 *
 * Implements:
 *   Issue #53 — Player display mode toggle (numbers / names / abbreviations)
 *   Issue #54 — Show/hide individual players per scene
 *
 * Architecture:
 *   - Display mode is a global editor setting stored in the Zustand store.
 *   - Visibility is stored per-player per-scene in the Scene data model.
 *   - Toggling visibility calls `togglePlayerVisibility` in the store.
 */

import { useStore, selectEditorScene } from "@/lib/store";
import type { PlayerDisplayMode } from "@/lib/store";

// ---------------------------------------------------------------------------
// Display mode toggle button group
// ---------------------------------------------------------------------------

const DISPLAY_MODES: { id: PlayerDisplayMode; label: string }[] = [
  { id: "numbers",       label: "#" },
  { id: "abbreviations", label: "POS" },
  { id: "names",         label: "NAME" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PlayerRosterPanel() {
  const scene          = useStore(selectEditorScene);
  const sceneId        = useStore((s) => s.selectedSceneId);
  const displayMode    = useStore((s) => s.playerDisplayMode);
  const setDisplayMode = useStore((s) => s.setPlayerDisplayMode);
  const toggleVisibility = useStore((s) => s.togglePlayerVisibility);

  const offensePlayers = scene?.players.offense ?? [];
  const defensePlayers = scene?.players.defense ?? [];

  function handleToggle(side: "offense" | "defense", position: number) {
    if (sceneId) toggleVisibility(sceneId, side, position);
  }

  return (
    <aside
      className="flex w-52 flex-col gap-3 border-l border-gray-200 bg-white p-3 text-sm"
      aria-label="Player roster and visibility"
    >
      {/* ── Display mode ─────────────────────────────────── */}
      <section>
        <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-gray-400">
          Display
        </h2>
        <div className="flex gap-1" role="group" aria-label="Player label mode">
          {DISPLAY_MODES.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setDisplayMode(id)}
              aria-pressed={displayMode === id}
              title={id.charAt(0).toUpperCase() + id.slice(1)}
              className={[
                "flex-1 rounded-md border px-1 py-1 text-[11px] font-semibold transition-colors",
                displayMode === id
                  ? "border-blue-500 bg-blue-500 text-white"
                  : "border-gray-300 bg-white text-gray-600 hover:border-blue-400 hover:text-blue-600",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {/* ── Offense ─────────────────────────────────────── */}
      <section>
        <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-gray-400">
          Offense
        </h2>
        <ul className="flex flex-col gap-1">
          {offensePlayers.map((p) => (
            <li key={p.position} className="flex items-center justify-between">
              <span className="font-medium text-gray-700">O{p.position}</span>
              <button
                onClick={() => handleToggle("offense", p.position)}
                aria-label={`${p.visible ? "Hide" : "Show"} offensive player ${p.position}`}
                title={p.visible ? "Click to hide" : "Click to show"}
                className={[
                  "rounded px-2 py-0.5 text-[11px] font-medium transition-colors",
                  p.visible
                    ? "bg-orange-100 text-orange-700 hover:bg-orange-200"
                    : "bg-gray-100 text-gray-400 hover:bg-gray-200",
                ].join(" ")}
              >
                {p.visible ? "Visible" : "Hidden"}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Defense ─────────────────────────────────────── */}
      <section>
        <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-gray-400">
          Defense
        </h2>
        <ul className="flex flex-col gap-1">
          {defensePlayers.map((p) => (
            <li key={p.position} className="flex items-center justify-between">
              <span className="font-medium text-gray-700">X{p.position}</span>
              <button
                onClick={() => handleToggle("defense", p.position)}
                aria-label={`${p.visible ? "Hide" : "Show"} defensive player ${p.position}`}
                title={p.visible ? "Click to hide" : "Click to show"}
                className={[
                  "rounded px-2 py-0.5 text-[11px] font-medium transition-colors",
                  p.visible
                    ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                    : "bg-gray-100 text-gray-400 hover:bg-gray-200",
                ].join(" ")}
              >
                {p.visible ? "Visible" : "Hidden"}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
