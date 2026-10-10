"use client";

/**
 * TimingStripPanel — horizontal strip beside the scene strip (above it below
 * lg) showing timing groups (steps) for the active scene.
 *
 * Implements issue #64: Timing groups — assign steps to annotations.
 *
 * Features:
 *   - Numbered step buttons (Step 1, Step 2, ...).
 *   - Active step is highlighted in the accent colour.
 *   - [+] button to add a new step.
 *   - [×] button to remove a step (only if more than one step exists).
 *   - Step duration display (click to edit inline).
 *   - Annotation count badge per step.
 *   - New annotations are assigned to the currently selected step.
 */

import { useState, useCallback } from "react";
import {
  useStore,
  selectEditorScene,
  selectTimingStepCount,
} from "@/lib/store";
import InfoTooltip from "./InfoTooltip";
import { SECTION_LABEL } from "./chrome";

// ---------------------------------------------------------------------------
// Step duration editor
// ---------------------------------------------------------------------------

interface DurationEditorProps {
  stepDuration: number;
  onChange: (ms: number) => void;
}

function DurationEditor({ stepDuration, onChange }: DurationEditorProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(stepDuration));

  const commit = useCallback(() => {
    const parsed = parseInt(value, 10);
    if (!isNaN(parsed) && parsed >= 100 && parsed <= 30000) {
      onChange(parsed);
    } else {
      setValue(String(stepDuration));
    }
    setEditing(false);
  }, [value, stepDuration, onChange]);

  if (editing) {
    return (
      <input
        type="number"
        min={100}
        max={30000}
        step={100}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setValue(String(stepDuration));
            setEditing(false);
          }
          e.stopPropagation();
        }}
        autoFocus
        className="w-16 rounded border border-accent-text bg-surface px-1 py-0 text-center text-[11px] text-ink focus:outline-none"
        aria-label="Step duration in milliseconds"
      />
    );
  }

  return (
    <button
      onClick={() => {
        setValue(String(stepDuration));
        setEditing(true);
      }}
      title="Click to edit step duration"
      className="text-[11px] tabular-nums text-muted hover:text-ink"
    >
      {stepDuration}ms
    </button>
  );
}

// ---------------------------------------------------------------------------
// TimingStripPanel
// ---------------------------------------------------------------------------

export default function TimingStripPanel() {
  const scene = useStore(selectEditorScene);
  const sceneId = useStore((s) => s.selectedSceneId) ?? scene?.id ?? null;
  const selectedTimingStep = useStore((s) => s.selectedTimingStep);
  const setSelectedTimingStep = useStore((s) => s.setSelectedTimingStep);
  const addTimingStep = useStore((s) => s.addTimingStep);
  const removeTimingStep = useStore((s) => s.removeTimingStep);
  const mergeTimingSteps = useStore((s) => s.mergeTimingSteps);
  const stepCount = useStore((state) => selectTimingStepCount(selectEditorScene(state)));
  const isPlaying = useStore((s) => s.isPlaying);
  const currentStep = useStore((s) => s.currentStep);

  // Duration edits go through a dedicated, undoable store action.
  const setTimingStepDuration = useStore((s) => s.setTimingStepDuration);

  if (!scene || !sceneId) return null;

  const sortedGroups = [...scene.timingGroups].sort((a, b) => a.step - b.step);

  // When playing, show the current playback step instead of the editor step
  const activeStep = isPlaying ? currentStep : selectedTimingStep;

  return (
    <div
      className="flex min-w-0 flex-1 items-center gap-3 overflow-x-auto px-5 py-2.5 lg:py-3.5"
      aria-label="Timing steps"
    >
      {/* Label */}
      <span className="flex shrink-0 items-center gap-1">
        <span className={SECTION_LABEL}>Steps</span>
        <InfoTooltip tip="Steps play in order within a scene. Annotations in the same step animate simultaneously — useful for sequencing a screen before a cut." />
      </span>

      {/* Step buttons */}
      {sortedGroups.map((group, idx) => {
        const isActive = group.step === activeStep;
        const annCount = group.annotations.length;
        const hasNext = idx < sortedGroups.length - 1;

        return (
          <div key={group.step} className="flex shrink-0 items-start gap-1">
            {/* Step pill + controls */}
            <div className="flex flex-col items-center gap-0.5">
              <button
                onClick={() => {
                  if (!isPlaying) setSelectedTimingStep(group.step);
                }}
                aria-label={`Step ${group.step}`}
                aria-pressed={isActive}
                disabled={isPlaying}
                title={`Step ${group.step} — ${group.duration}ms`}
                className={[
                  "relative flex h-8 min-w-[40px] items-center justify-center rounded-lg border px-2 text-[13px] font-semibold transition-colors",
                  isActive
                    ? "border-accent bg-accent text-accent-ink"
                    : "border-line bg-surface text-ink hover:bg-chip dark:bg-app",
                  isPlaying ? "cursor-default" : "",
                ].join(" ")}
              >
                {group.step}
                {/* Annotation count badge */}
                {annCount > 0 && (
                  <span
                    className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-ink px-0.5 text-[10px] font-bold leading-none text-app"
                    aria-label={`${annCount} annotation${annCount !== 1 ? "s" : ""}`}
                  >
                    {annCount}
                  </span>
                )}
              </button>

              {/* Duration editor (hidden while playing) */}
              {!isPlaying && (
                <DurationEditor
                  stepDuration={group.duration}
                  onChange={(ms) => setTimingStepDuration(sceneId, group.step, ms)}
                />
              )}

              {/* Delete step button */}
              {!isPlaying && stepCount > 1 && (
                <button
                  onClick={() => removeTimingStep(sceneId, group.step)}
                  aria-label={`Remove step ${group.step}`}
                  title={`Delete step ${group.step}`}
                  className="text-[11px] leading-none text-muted hover:text-danger"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Merge button between this step and the next */}
            {!isPlaying && hasNext && (
              <button
                onClick={() => mergeTimingSteps(sceneId, group.step)}
                aria-label={`Merge step ${group.step} and ${group.step + 1}`}
                title={`Merge step ${group.step} + ${group.step + 1}`}
                className="mt-1.5 flex h-5 w-5 items-center justify-center rounded text-xs text-muted hover:bg-chip hover:text-ink"
              >
                ⊕
              </button>
            )}
          </div>
        );
      })}

      {/* Empty-state hint */}
      {sortedGroups.length === 1 && !isPlaying && (
        <span className="hidden shrink-0 text-xs text-muted xl:inline">
          Add a step to sequence actions one after another
        </span>
      )}

      {/* Add step button */}
      {!isPlaying && (
        <button
          onClick={() => {
            addTimingStep(sceneId);
            // Select the new step (it will be stepCount + 1)
            setSelectedTimingStep(stepCount + 1);
          }}
          aria-label="Add step"
          title="Add timing step"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-line-strong text-base text-muted transition-colors hover:border-accent-text hover:text-accent-text"
        >
          +
        </button>
      )}
    </div>
  );
}
