"use client";

/**
 * MobileToolBar — the editor's drawing tools on phones (<768px), where the
 * tool rail is not shown: a fixed row of six at the bottom of the screen, as
 * in the approved mobile mockup. Five tools and Undo.
 *
 * The tools, their names and their icons are the rail's (DrawingToolsPanel),
 * so a tool is the same thing on every screen size. Guard, hand-off and the
 * dashed cut stay rail-only: six slots is what fits a phone.
 *
 * With an annotation selected, a Delete row appears above the bar — phones
 * have no Delete key.
 */

import { useStore } from "@/lib/store";
import type { DrawingTool } from "@/lib/store";
import { useHistoryStore } from "@/lib/history";
import { useTeam } from "@/contexts/TeamContext";
import { TOOLS } from "./DrawingToolsPanel";

/** The five tools of the phone bar, in order (Undo takes the sixth slot). */
const PHONE_TOOLS: DrawingTool[] = ["select", "movement", "pass", "dribble", "screen"];

const SLOT =
  "flex h-14 flex-col items-center justify-center gap-[3px] rounded-[10px] text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text disabled:opacity-40";

function UndoIcon() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
    </svg>
  );
}

export default function MobileToolBar() {
  const selectedTool = useStore((s) => s.selectedTool);
  const setSelectedTool = useStore((s) => s.setSelectedTool);
  const undo = useStore((s) => s.undo);
  const canUndo = useHistoryStore((s) => s.canUndo);
  const selectedSceneId = useStore((s) => s.selectedSceneId);
  const selectedAnnotationId = useStore((s) => s.selectedAnnotationId);
  const removeAnnotation = useStore((s) => s.removeAnnotation);
  const isPlaying = useStore((s) => s.isPlaying);
  const { role } = useTeam();

  // Viewers cannot edit (#76): no tools, on any screen size.
  if (role === "viewer") return null;

  const tools = PHONE_TOOLS.map((id) => TOOLS.find((t) => t.id === id)).filter((t) => t !== undefined);

  return (
    <div className="flex-none md:hidden">
      {selectedAnnotationId && selectedSceneId && !isPlaying && (
        <div className="flex justify-center border-t border-line bg-surface px-3 pt-2">
          <button
            type="button"
            onClick={() => removeAnnotation(selectedSceneId, selectedAnnotationId)}
            className="flex h-11 items-center rounded-lg border border-line px-4 text-sm font-medium text-danger"
          >
            Delete selected line
          </button>
        </div>
      )}
      <nav
        aria-label="Drawing tools"
        className="grid grid-cols-6 gap-1 border-t border-line bg-surface px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2"
      >
        {tools.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setSelectedTool(id)}
            aria-pressed={selectedTool === id}
            className={`${SLOT} ${selectedTool === id ? "bg-accent font-semibold text-accent-ink" : "bg-transparent font-medium text-ink"}`}
          >
            <Icon />
            {label}
          </button>
        ))}
        <button type="button" onClick={undo} disabled={!canUndo} className={`${SLOT} bg-transparent font-medium text-ink`}>
          <UndoIcon />
          Undo
        </button>
      </nav>
    </div>
  );
}
