"use client";

/**
 * DrawingToolsPanel — left-side toolbar for selecting drawing tools.
 *
 * Implements issue #56: Drawing tools panel UI.
 *
 * Tools:
 *   Select / Move  (keyboard: V or Escape)
 *   Movement       (keyboard: M) — solid arrow line
 *   Dribble        (keyboard: D) — wavy/zigzag line
 *   Pass           (keyboard: P) — line with triangle tip
 *   Screen         (keyboard: S) — perpendicular line
 *   Cut            (keyboard: C) — dashed arrow line
 *   Eraser         (keyboard: E) — remove annotations
 */

import { useEffect, useCallback } from "react";
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

/** Map keyboard key → DrawingTool (lower-cased) */
const KEY_MAP: Record<string, DrawingTool> = {
  v: "select",
  escape: "select",
  m: "movement",
  d: "dribble",
  p: "pass",
  s: "screen",
  c: "cut",
  e: "eraser",
};

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
// Component
// ---------------------------------------------------------------------------

export default function DrawingToolsPanel() {
  const selectedTool = useStore((s) => s.selectedTool);
  const setSelectedTool = useStore((s) => s.setSelectedTool);

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Ignore when typing in an input / textarea
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const tool = KEY_MAP[e.key.toLowerCase()];
      if (tool) {
        e.preventDefault();
        setSelectedTool(tool);
      }
    },
    [setSelectedTool],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <aside
      className="flex w-14 flex-col items-center gap-1 border-r border-gray-200 bg-gray-50 py-3"
      aria-label="Drawing tools"
    >
      <span className="mb-1 text-[10px] font-medium uppercase tracking-widest text-gray-400">
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
            <span className="mt-0.5 text-[9px] leading-none">{shortcut}</span>
          </button>
        );
      })}
    </aside>
  );
}
