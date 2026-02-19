"use client";

/**
 * DrawingToolsPanel — left-side toolbar for selecting drawing tools.
 *
 * Implements issue #56: Drawing tools panel UI.
 * Implements issue #81: Responsive layout — collapsible on tablet (md-lg).
 *
 * Tools:
 *   Select / Move  (keyboard: V or Escape)
 *   Movement       (keyboard: M) — solid arrow line
 *   Dribble        (keyboard: D) — wavy/zigzag line
 *   Pass           (keyboard: P) — line with triangle tip
 *   Screen         (keyboard: S) — perpendicular line
 *   Cut            (keyboard: C) — dashed arrow line
 *   Eraser         (keyboard: E) — remove annotations
 *
 * Note: keyboard shortcut registration has been centralised in
 * useKeyboardShortcuts (issue #82). This component no longer attaches its
 * own keydown listener — it is kept here for documentation purposes only.
 */

import { useState } from "react";
import { useStore } from "@/lib/store";
import type { DrawingTool } from "@/lib/store";

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

interface ToolDef {
  id: DrawingTool;
  label: string;
  shortcut: string;
  /** SVG icon content rendered inside a 28×28 viewBox */
  Icon: React.FC<{ active: boolean }>;
}

// Shared icon colours
const ACTIVE_COLOR = "#3B82F6"; // blue-500
const IDLE_COLOR = "#6B7280";   // gray-500

/** Select / Move tool icon (arrow cursor shape) */
function SelectIcon({ active }: { active: boolean }) {
  const c = active ? ACTIVE_COLOR : IDLE_COLOR;
  return (
    <svg viewBox="0 0 28 28" width={22} height={22} aria-hidden="true">
      <path
        d="M6 4 L6 20 L10 16 L14 24 L16 23 L12 15 L18 15 Z"
        fill={c}
        stroke={c}
        strokeWidth={0.5}
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Movement tool icon (solid arrow line) */
function MovementIcon({ active }: { active: boolean }) {
  const c = active ? ACTIVE_COLOR : IDLE_COLOR;
  return (
    <svg viewBox="0 0 28 28" width={22} height={22} aria-hidden="true">
      <line x1="4" y1="24" x2="22" y2="6" stroke={c} strokeWidth={2.5} strokeLinecap="round" />
      <polygon points="22,6 14,8 20,14" fill={c} />
    </svg>
  );
}

/** Dribble tool icon (wavy/zigzag arrow) */
function DribbleIcon({ active }: { active: boolean }) {
  const c = active ? ACTIVE_COLOR : IDLE_COLOR;
  return (
    <svg viewBox="0 0 28 28" width={22} height={22} aria-hidden="true">
      <path
        d="M4 22 Q7 16 10 19 Q13 22 16 16 Q19 10 22 6"
        fill="none"
        stroke={c}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polygon points="22,6 15,9 19,14" fill={c} />
    </svg>
  );
}

/** Pass tool icon (straight line with solid arrowhead) */
function PassIcon({ active }: { active: boolean }) {
  const c = active ? ACTIVE_COLOR : IDLE_COLOR;
  return (
    <svg viewBox="0 0 28 28" width={22} height={22} aria-hidden="true">
      <line x1="4" y1="22" x2="22" y2="6" stroke={c} strokeWidth={2} strokeLinecap="round" />
      {/* Filled equilateral triangle at tip */}
      <polygon points="22,6 14,9 19,15" fill={c} />
    </svg>
  );
}

/** Screen / Pick tool icon (perpendicular line = L-shape) */
function ScreenIcon({ active }: { active: boolean }) {
  const c = active ? ACTIVE_COLOR : IDLE_COLOR;
  return (
    <svg viewBox="0 0 28 28" width={22} height={22} aria-hidden="true">
      {/* Vertical bar of the screen */}
      <line x1="14" y1="8" x2="14" y2="22" stroke={c} strokeWidth={3} strokeLinecap="round" />
      {/* Horizontal bar of the screen */}
      <line x1="8" y1="8" x2="20" y2="8" stroke={c} strokeWidth={3} strokeLinecap="round" />
      {/* Arrow showing player path */}
      <line x1="6" y1="22" x2="14" y2="22" stroke={c} strokeWidth={2} strokeLinecap="round" strokeDasharray="2 2" />
    </svg>
  );
}

/** Cut tool icon (dashed arrow line) */
function CutIcon({ active }: { active: boolean }) {
  const c = active ? ACTIVE_COLOR : IDLE_COLOR;
  return (
    <svg viewBox="0 0 28 28" width={22} height={22} aria-hidden="true">
      <line
        x1="4"
        y1="22"
        x2="20"
        y2="6"
        stroke={c}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeDasharray="4 3"
      />
      <polygon points="22,6 15,9 19,14" fill={c} />
    </svg>
  );
}

/** Eraser tool icon */
function EraserIcon({ active }: { active: boolean }) {
  const c = active ? ACTIVE_COLOR : IDLE_COLOR;
  return (
    <svg viewBox="0 0 28 28" width={22} height={22} aria-hidden="true">
      <rect
        x="5"
        y="14"
        width="18"
        height="10"
        rx="2"
        fill="none"
        stroke={c}
        strokeWidth={2}
      />
      <line x1="5" y1="19" x2="23" y2="19" stroke={c} strokeWidth={1.5} />
      <line x1="12" y1="14" x2="8" y2="5" stroke={c} strokeWidth={2} strokeLinecap="round" />
      <line x1="16" y1="14" x2="20" y2="5" stroke={c} strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

const TOOLS: ToolDef[] = [
  { id: "select",   label: "Select",   shortcut: "V", Icon: SelectIcon   },
  { id: "movement", label: "Move",     shortcut: "M", Icon: MovementIcon },
  { id: "dribble",  label: "Dribble",  shortcut: "D", Icon: DribbleIcon  },
  { id: "pass",     label: "Pass",     shortcut: "P", Icon: PassIcon     },
  { id: "screen",   label: "Screen",   shortcut: "S", Icon: ScreenIcon   },
  { id: "cut",      label: "Cut",      shortcut: "C", Icon: CutIcon      },
  { id: "eraser",   label: "Eraser",   shortcut: "E", Icon: EraserIcon   },
];

/** CSS cursor per tool */
export const TOOL_CURSOR: Record<DrawingTool, string> = {
  select:   "default",
  movement: "crosshair",
  dribble:  "crosshair",
  pass:     "crosshair",
  screen:   "crosshair",
  cut:      "crosshair",
  eraser:   "cell",
};

// ---------------------------------------------------------------------------
// Collapse toggle icon
// ---------------------------------------------------------------------------

function CollapseIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width={14}
      height={14}
      fill="currentColor"
      aria-hidden="true"
      className="transition-transform"
      style={{ transform: collapsed ? "rotate(180deg)" : "none" }}
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DrawingToolsPanel() {
  const selectedTool = useStore((s) => s.selectedTool);
  const setSelectedTool = useStore((s) => s.setSelectedTool);

  /**
   * Collapse state — only meaningful at tablet breakpoint (md–lg).
   * On desktop the panel is always expanded; on mobile it's not rendered at all
   * (see the editor page layout). Default: expanded.
   */
  const [collapsed, setCollapsed] = useState(false);

  // Keyboard shortcut registration is handled centrally by EditorKeyboardManager
  // (useKeyboardShortcuts hook, issue #82). No listener is registered here.

  return (
    <aside
      className={[
        "flex flex-col items-center border-r border-gray-200 bg-gray-50 transition-all duration-200",
        collapsed ? "w-8" : "w-14",
      ].join(" ")}
      aria-label="Drawing tools"
    >
      {/* Collapse toggle button — visible on all md+ sizes */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        title={collapsed ? "Expand tools panel" : "Collapse tools panel"}
        aria-label={collapsed ? "Expand tools panel" : "Collapse tools panel"}
        aria-expanded={!collapsed}
        className="mt-2 flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-200 hover:text-gray-600"
      >
        <CollapseIcon collapsed={collapsed} />
      </button>

      {/* Tool buttons — hidden when collapsed */}
      {!collapsed && (
        <>
          <span className="mb-1 mt-1 text-[10px] font-medium uppercase tracking-widest text-gray-400">
            Tools
          </span>

          {TOOLS.map(({ id, label, shortcut, Icon }) => {
            const active = selectedTool === id;
            return (
              <button
                key={id}
                onClick={() => setSelectedTool(id)}
                title={`${label} (${shortcut})`}
                aria-label={label}
                aria-pressed={active}
                className={[
                  "flex w-10 flex-col items-center justify-center rounded-lg py-2 transition-colors",
                  active
                    ? "bg-blue-100 text-blue-600 shadow-inner"
                    : "text-gray-500 hover:bg-gray-200 hover:text-gray-700",
                ].join(" ")}
              >
                <Icon active={active} />
                <span className="mt-0.5 text-[9px] leading-none">{label}</span>
              </button>
            );
          })}
        </>
      )}

      {/* When collapsed: show only the active tool icon as a hint */}
      {collapsed && (
        <div className="mt-2 flex flex-col items-center gap-1">
          {TOOLS.filter(({ id }) => id === selectedTool).map(({ id, label, Icon }) => (
            <div
              key={id}
              title={label}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100"
            >
              <Icon active={true} />
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
