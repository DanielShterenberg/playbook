"use client";

/**
 * PlayerRosterPanel — right-side panel for managing per-scene player visibility,
 * the global player display mode and the court orientation.
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
 *   - "Flip court" is the play-level orientation (`setPlayFlipped`).
 */

import { useState } from "react";
import { useStore, selectEditorScene } from "@/lib/store";
import type { PlayerDisplayMode } from "@/lib/store";
import { contrastText, customTeamColor } from "@/lib/courtPalette";
import { useCourtPalette } from "@/hooks/useTheme";
import { ACCENT_CONTROL, SECTION_LABEL, SEGMENT, SEGMENTED } from "./chrome";

const POSITION_ABBRS: Record<number, string> = { 1: "PG", 2: "SG", 3: "SF", 4: "PF", 5: "C" };
const POSITION_NAMES: Record<number, string> = {
  1: "Point guard",
  2: "Shooting guard",
  3: "Small forward",
  4: "Power forward",
  5: "Center",
};

// ---------------------------------------------------------------------------
// Display mode toggle button group
// ---------------------------------------------------------------------------

const DISPLAY_MODES: { id: PlayerDisplayMode; label: string }[] = [
  { id: "numbers",       label: "Numbers" },
  { id: "abbreviations", label: "Pos" },
  { id: "names",         label: "Names" },
];

type Side = "offense" | "defense";

const SIDE_WORD: Record<Side, string> = { offense: "offensive", defense: "defensive" };
const SIDE_PREFIX: Record<Side, string> = { offense: "O", defense: "X" };

const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text";

/** Eye / crossed-eye glyph for the per-player visibility toggle. */
function EyeIcon({ visible }: { visible: boolean }) {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {visible ? (
        <>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx={12} cy={12} r={3} />
        </>
      ) : (
        <>
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
          <path d="M1 1l22 22" />
        </>
      )}
    </svg>
  );
}

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
  const currentPlay      = useStore((s) => s.currentPlay);
  const setPlayFlipped   = useStore((s) => s.setPlayFlipped);
  const palette          = useCourtPalette();

  /**
   * Collapse state — allows the panel to be hidden at tablet widths to
   * preserve horizontal space for the court canvas (issue #81).
   */
  const [collapsed, setCollapsed] = useState(false);

  const offensePlayers = scene?.players.offense ?? [];
  const defensePlayers = scene?.players.defense ?? [];
  const ballHolder = scene?.ball.attachedTo ?? null;

  // Roster chips take the same fills the tokens on the court do.
  const fills: Record<Side, string> = {
    offense: customTeamColor(currentPlay?.colors?.offense) ?? palette.offenseFill,
    defense: customTeamColor(currentPlay?.colors?.defense) ?? palette.defenseFill,
  };

  function handleToggle(side: Side, position: number) {
    if (sceneId) toggleVisibility(sceneId, side, position);
  }

  function renderRows(side: Side, players: typeof offensePlayers) {
    return (
      <ul className="flex flex-col gap-0.5">
        {players.map((p) => {
          const key = `${side}-${p.position}`;
          const hasBall = ballHolder?.side === side && ballHolder.position === p.position;
          return (
            <li
              key={p.position}
              className={`flex min-h-10 items-center gap-2.5 rounded-lg px-2 ${hasBall ? "bg-app" : ""}`}
            >
              <span
                className={`flex h-7 w-7 flex-none items-center justify-center rounded-full font-semibold ${displayMode === "abbreviations" ? "text-[11px]" : "text-sm"} ${p.visible ? "" : "opacity-40"}`}
                style={{ background: fills[side], color: contrastText(fills[side]) }}
                title={`${SIDE_PREFIX[side]}${p.position}`}
              >
                {displayMode === "abbreviations" ? POSITION_ABBRS[p.position] : p.position}
              </span>
              {displayMode === "names" ? (
                <input
                  type="text"
                  value={playerNames[key] ?? ""}
                  onChange={(e) => setPlayerName(key, e.target.value)}
                  placeholder={POSITION_NAMES[p.position] ?? `${SIDE_PREFIX[side]}${p.position}`}
                  aria-label={`Name for ${SIDE_WORD[side]} player ${p.position}`}
                  className="h-8 min-w-0 flex-1 rounded-md border border-line-strong bg-surface px-2 text-sm text-ink outline-none placeholder:text-muted focus:border-accent-text"
                />
              ) : (
                <span className={`min-w-0 flex-1 truncate ${p.visible ? "text-ink" : "text-muted line-through"}`}>
                  {POSITION_NAMES[p.position] ?? `${SIDE_PREFIX[side]}${p.position}`}
                </span>
              )}
              {hasBall && (
                <span className="flex-none text-xs font-semibold text-[#8A5A00] dark:font-normal dark:text-[#F2B33D]">
                  Ball
                </span>
              )}
              <button
                type="button"
                onClick={() => handleToggle(side, p.position)}
                aria-label={`${p.visible ? "Hide" : "Show"} ${SIDE_WORD[side]} player ${p.position}`}
                aria-pressed={p.visible}
                title={p.visible ? "Visible — click to hide" : "Hidden — click to show"}
                className={`flex h-8 w-8 flex-none items-center justify-center rounded-md transition-colors hover:bg-chip ${FOCUS} ${p.visible ? "text-ink" : "text-muted"}`}
              >
                <EyeIcon visible={p.visible} />
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  const collapseButton = (
    <button
      type="button"
      onClick={() => setCollapsed((c) => !c)}
      title={collapsed ? "Expand roster panel" : "Collapse roster panel"}
      aria-label={collapsed ? "Expand roster panel" : "Collapse roster panel"}
      aria-expanded={!collapsed}
      className={`flex h-8 w-8 flex-none items-center justify-center rounded-lg text-muted transition-colors hover:bg-chip hover:text-ink ${FOCUS}`}
    >
      {/* Right-pointing chevron; rotated when collapsed to point left */}
      <svg
        viewBox="0 0 20 20"
        width={16}
        height={16}
        fill="currentColor"
        aria-hidden="true"
        className={collapsed ? "rotate-180 transition-transform" : "transition-transform"}
      >
        <path
          fillRule="evenodd"
          d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02z"
          clipRule="evenodd"
        />
      </svg>
    </button>
  );

  if (collapsed) {
    return (
      <aside
        className="flex w-11 flex-col items-center border-l border-line bg-surface py-4"
        aria-label="Player roster and visibility"
      >
        <div className="mt-auto">{collapseButton}</div>
      </aside>
    );
  }

  return (
    <aside
      className="flex w-[300px] flex-col border-l border-line bg-surface"
      aria-label="Player roster and visibility"
    >
      {/* ── Heading + display mode (stays put; the lists scroll) ── */}
      <div className="flex flex-none items-center justify-between gap-2 px-5 pb-[18px] pt-5">
        <h2 className={SECTION_LABEL}>Roster</h2>
        <div className={SEGMENTED} role="group" aria-label="Player label mode">
          {DISPLAY_MODES.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setDisplayMode(id)}
              aria-pressed={displayMode === id}
              title={id.charAt(0).toUpperCase() + id.slice(1)}
              className={SEGMENT}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-5 pb-[18px]">
      {/* ── Offense ──────────────────────────────────────── */}
      <section className="flex flex-col gap-1.5">
        <h3 className="px-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">Offense</h3>
        {renderRows("offense", offensePlayers)}
      </section>

      {/* ── Defense ──────────────────────────────────────── */}
      <section className="flex flex-col gap-1.5">
        <h3 className="px-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">Defense</h3>
        {renderRows("defense", defensePlayers)}
      </section>

      </div>

      {/* ── Court options ────────────────────────────────── */}
      <div className="mx-5 flex flex-none flex-col gap-2.5 border-t border-line pt-4">
        <label
          className="flex min-h-11 cursor-pointer items-center justify-between"
          title="Flip court (basket north/south)"
        >
          <span>Flip court</span>
          <input
            type="checkbox"
            checked={currentPlay?.flipped ?? false}
            disabled={!currentPlay}
            onChange={(e) => setPlayFlipped(e.target.checked)}
            aria-label="Flip court orientation"
            className={`h-5 w-5 cursor-pointer ${ACCENT_CONTROL}`}
          />
        </label>
      </div>

      <div className="flex flex-none justify-end px-5 pb-4">{collapseButton}</div>
    </aside>
  );
}
