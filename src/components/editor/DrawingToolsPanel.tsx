"use client";

/**
 * DrawingToolsPanel — left-side icon rail for selecting drawing tools.
 *
 * Implements issue #56: Drawing tools panel UI.
 * Implements issue #81: Responsive layout — collapsible rail (md+).
 *
 * Tools:
 *   Select / Move  (keyboard: V or Escape)
 *   Movement       (keyboard: M) — solid arrow line
 *   Dribble        (keyboard: D) — wavy/zigzag line
 *   Pass           (keyboard: P) — line with triangle tip
 *   Screen         (keyboard: S) — perpendicular line
 *   Cut            (keyboard: C) — dashed arrow line
 *   Guard          (keyboard: G) — defender→offensive player assignment (amber dashed)
 *   Eraser         (keyboard: E) — remove annotations
 *
 * Note: keyboard shortcut registration has been centralised in
 * useKeyboardShortcuts (issue #82). This component no longer attaches its
 * own keydown listener — it is kept here for documentation purposes only.
 */

import { useState } from "react";
import { useStore } from "@/lib/store";
import type { DrawingTool } from "@/lib/store";
import { useTeam } from "@/contexts/TeamContext";

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

interface ToolDef {
  id: DrawingTool;
  label: string;
  shortcut: string;
  /** Icon drawn in a 24×24 viewBox with the button's text colour */
  Icon: React.FC;
}

/** Shared frame: 20px, 2px round strokes in currentColor (the button sets the colour). */
function ToolSvg({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={20}
      height={20}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** Select / Move tool icon (arrow cursor shape) */
function SelectIcon() {
  return (
    <ToolSvg>
      <path d="M5 3l14 8-6 2-2 6z" />
    </ToolSvg>
  );
}

/** Movement tool icon (solid arrow line) */
function MovementIcon() {
  return (
    <ToolSvg>
      <path d="M4 20 20 4" />
      <path d="M12 4h8v8" />
    </ToolSvg>
  );
}

/** Dribble tool icon (wavy line) */
function DribbleIcon() {
  return (
    <ToolSvg>
      <path d="M3 20c3-1 1-5 4-6s2 3 5 2 1-5 4-6 2 2 4 1" />
    </ToolSvg>
  );
}

/** Pass tool icon (straight line with solid arrowhead) */
function PassIcon() {
  return (
    <ToolSvg>
      <path d="M4 20 15 9" />
      <path d="M20 4 11.5 6.5l6 6z" fill="currentColor" />
    </ToolSvg>
  );
}

/** Screen / Pick tool icon (path ending in a perpendicular bar) */
function ScreenIcon() {
  return (
    <ToolSvg>
      <path d="M5 19 17 7" />
      <path d="M13 3l8 8" />
    </ToolSvg>
  );
}

/** Cut tool icon (dashed arrow line) */
function CutIcon() {
  return (
    <ToolSvg>
      <path d="M4 20 20 4" strokeDasharray="3 4" />
      <path d="M12 4h8v8" />
    </ToolSvg>
  );
}

/** Guard tool icon (dashed line from a defender ring to an offensive dot) */
function GuardIcon() {
  return (
    <ToolSvg>
      <circle cx={6} cy={18} r={3} />
      <path d="M9 15l5.5-5.5" strokeDasharray="2 3" />
      <circle cx={18} cy={6} r={3} fill="currentColor" />
    </ToolSvg>
  );
}

/** Hand-off (DHO) tool icon — dashed line with double perpendicular tick marks */
function HandoffIcon() {
  return (
    <ToolSvg>
      <path d="M4 20 19 5" strokeDasharray="3 4" />
      <path d="M14.5 6.5l4 4" />
      <path d="M11.5 9.5l4 4" />
    </ToolSvg>
  );
}

/** Every drawing tool, in rail order. The phone tool bar (MobileToolBar) picks from this list. */
export const TOOLS: ToolDef[] = [
  { id: "select",   label: "Select",   shortcut: "V", Icon: SelectIcon   },
  { id: "movement", label: "Move",     shortcut: "M", Icon: MovementIcon },
  { id: "dribble",  label: "Dribble",  shortcut: "D", Icon: DribbleIcon  },
  { id: "pass",     label: "Pass",     shortcut: "P", Icon: PassIcon     },
  { id: "screen",   label: "Screen",   shortcut: "S", Icon: ScreenIcon   },
  { id: "cut",      label: "Cut",      shortcut: "C", Icon: CutIcon      },
  { id: "guard",    label: "Guard",    shortcut: "G", Icon: GuardIcon    },
  { id: "handoff",  label: "Hand-off", shortcut: "H", Icon: HandoffIcon  },
];

/** CSS cursor per tool */
export const TOOL_CURSOR: Record<DrawingTool, string> = {
  select:   "default",
  movement: "crosshair",
  dribble:  "crosshair",
  pass:     "crosshair",
  screen:   "crosshair",
  cut:      "crosshair",
  guard:    "crosshair",
  handoff:  "crosshair",
};

// ---------------------------------------------------------------------------
// Collapse toggle icon
// ---------------------------------------------------------------------------

function CollapseIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width={16}
      height={16}
      fill="currentColor"
      aria-hidden="true"
      className={collapsed ? "rotate-180 transition-transform" : "transition-transform"}
    >
      {/* Left-pointing chevron; rotated 180° when collapsed to point right */}
      <path
        fillRule="evenodd"
        d="M12.79 5.23a.75.75 0 0 1-.02 1.06L8.832 10l3.938 3.71a.75.75 0 1 1-1.04 1.08l-4.5-4.25a.75.75 0 0 1 0-1.08l4.5-4.25a.75.75 0 0 1 1.06.02z"
        clipRule="evenodd"
      />
    </svg>
  );
}

const RAIL = "flex flex-col items-center border-r border-line bg-surface";
const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DrawingToolsPanel() {
  const selectedTool = useStore((s) => s.selectedTool);
  const setSelectedTool = useStore((s) => s.setSelectedTool);
  const { role } = useTeam();

  /**
   * Collapse state — the rail can be folded to a thin strip to give the court
   * more room (issue #81). On mobile the rail is not rendered at all (see the
   * editor page layout). Default: expanded.
   */
  const [collapsed, setCollapsed] = useState(false);

  // Keyboard shortcut registration is handled centrally by EditorKeyboardManager
  // (useKeyboardShortcuts hook, issue #82). No listener is registered here.

  // Viewers see a collapsed read-only badge instead of the drawing tools (#76)
  if (role === "viewer") {
    return (
      <aside
        className={`${RAIL} w-11 py-4`}
        aria-label="View only — drawing tools disabled"
        title="You have viewer access — editing is disabled"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg text-muted" aria-hidden="true">
          <svg width={18} height={18} viewBox="0 0 20 20" fill="currentColor">
            <path d="M10 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
            <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0z" clipRule="evenodd" />
          </svg>
        </div>
      </aside>
    );
  }

  return (
    <nav
      className={`${RAIL} gap-1.5 overflow-y-auto py-4 transition-all duration-200 ${collapsed ? "w-11" : "px-2.5"}`}
      aria-label="Drawing tools"
    >
      {/* Tool buttons — hidden when collapsed */}
      {!collapsed &&
        TOOLS.map(({ id, label, shortcut, Icon }) => {
          const active = selectedTool === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setSelectedTool(id)}
              title={`${label} (${shortcut})`}
              aria-label={label}
              aria-pressed={active}
              className={[
                `flex h-12 w-12 flex-none items-center justify-center rounded-[10px] transition-colors ${FOCUS}`,
                active ? "bg-accent text-accent-ink" : "text-ink hover:bg-chip",
              ].join(" ")}
            >
              <Icon />
            </button>
          );
        })}

      {/* When collapsed: show only the active tool icon as a hint */}
      {collapsed &&
        TOOLS.filter(({ id }) => id === selectedTool).map(({ id, label, Icon }) => (
          <div
            key={id}
            title={label}
            className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-accent text-accent-ink"
          >
            <Icon />
          </div>
        ))}

      {/* Collapse toggle — at the foot of the rail */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        title={collapsed ? "Expand tools panel" : "Collapse tools panel"}
        aria-label={collapsed ? "Expand tools panel" : "Collapse tools panel"}
        aria-expanded={!collapsed}
        className={`mt-auto flex h-8 w-8 flex-none items-center justify-center rounded-lg text-muted transition-colors hover:bg-chip hover:text-ink ${FOCUS}`}
      >
        <CollapseIcon collapsed={collapsed} />
      </button>
    </nav>
  );
}
