"use client";

/**
 * PlayerRosterPanel — right-side panel for managing per-scene player visibility
 * and the global player display mode.
 *
 * Implements:
 *   Issue #53 — Player display mode toggle (numbers / names / abbreviations)
 *   Issue #54 — Show/hide individual players per scene
 *   Issue #81 — Responsive layout: collapsible panel at tablet breakpoint
 *
 * Architecture:
 *   - Display mode is a global editor setting stored in the Zustand store.
 *   - Visibility is stored per-player per-scene in the Scene data model.
 *   - Toggling visibility calls `togglePlayerVisibility` in the store.
 */

import { useState } from "react";
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
  const scene            = useStore(selectEditorScene);
  const sceneId          = useStore((s) => s.selectedSceneId);
  const displayMode      = useStore((s) => s.playerDisplayMode);
  const setDisplayMode   = useStore((s) => s.setPlayerDisplayMode);
  const toggleVisibility = useStore((s) => s.togglePlayerVisibility);
  const playerNames      = useStore((s) => s.playerNames);
  const setPlayerName    = useStore((s) => s.setPlayerName);

  /**
   * Collapse state — allows the panel to be hidden at tablet widths to
   * preserve horizontal space for the court canvas (issue #81).
   */
  const [collapsed, setCollapsed] = useState(false);

  const offensePlayers = scene?.players.offense ?? [];
  const defensePlayers = scene?.players.defense ?? [];

  function handleToggle(side: "offense" | "defense", position: number) {
    if (sceneId) toggleVisibility(sceneId, side, position);
  }

  return (
    <aside
      className={[
        "flex flex-col border-l border-gray-200 bg-white text-sm transition-all duration-200",
        collapsed ? "w-8" : "w-52",
      ].join(" ")}
      aria-label="Player roster and visibility"
    >
      {/* ── Collapse toggle ──────────────────────────────── */}
      <div className="flex items-center justify-end border-b border-gray-100 px-2 py-2">
        <button
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "Expand roster panel" : "Collapse roster panel"}
          aria-label={collapsed ? "Expand roster panel" : "Collapse roster panel"}
          aria-expanded={!collapsed}
          className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          {/* Right-pointing chevron; rotated when expanded to point left */}
          <svg
            viewBox="0 0 20 20"
            width={14}
            height={14}
            fill="currentColor"
            aria-hidden="true"
            className="transition-transform"
            style={{ transform: collapsed ? "none" : "rotate(180deg)" }}
          >
            <path
              fillRule="evenodd"
              d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>

      {/* ── Panel contents (hidden when collapsed) ───────── */}
      {!collapsed && (
        <div className="flex flex-col gap-3 overflow-y-auto p-3">
          {/* ── Display mode ─────────────────────────────── */}
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

          {/* ── Offense ──────────────────────────────────── */}
          <section>
            <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-gray-400">
              Offense
            </h2>
            <ul className="flex flex-col gap-1">
              {offensePlayers.map((p) => (
                <li key={p.position} className="flex items-center justify-between gap-1">
                  <span className="flex-shrink-0 font-medium text-gray-700">O{p.position}</span>
                  {displayMode === "names" ? (
                    <input
                      type="text"
                      value={playerNames[`offense-${p.position}`] ?? ""}
                      onChange={(e) => setPlayerName(`offense-${p.position}`, e.target.value)}
                      placeholder={`O${p.position}`}
                      aria-label={`Name for offensive player ${p.position}`}
                      className="min-w-0 flex-1 rounded border border-gray-200 px-1.5 py-0.5 text-[11px] text-gray-700 focus:border-blue-400 focus:outline-none"
                    />
                  ) : (
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
                  )}
                </li>
              ))}
            </ul>
          </section>

          {/* ── Defense ──────────────────────────────────── */}
          <section>
            <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-gray-400">
              Defense
            </h2>
            <ul className="flex flex-col gap-1">
              {defensePlayers.map((p) => (
                <li key={p.position} className="flex items-center justify-between gap-1">
                  <span className="flex-shrink-0 font-medium text-gray-700">X{p.position}</span>
                  {displayMode === "names" ? (
                    <input
                      type="text"
                      value={playerNames[`defense-${p.position}`] ?? ""}
                      onChange={(e) => setPlayerName(`defense-${p.position}`, e.target.value)}
                      placeholder={`X${p.position}`}
                      aria-label={`Name for defensive player ${p.position}`}
                      className="min-w-0 flex-1 rounded border border-gray-200 px-1.5 py-0.5 text-[11px] text-gray-700 focus:border-blue-400 focus:outline-none"
                    />
                  ) : (
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
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </aside>
  );
}
