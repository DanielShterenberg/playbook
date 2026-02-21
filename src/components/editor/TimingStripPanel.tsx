"use client";

/**
 * TimingStripPanel — horizontal strip above the scene strip showing timing
 * groups (steps) for the active scene.
 *
 * Implements issue #64: Timing groups — assign steps to annotations.
 *
 * Features:
 *   - Numbered step buttons (Step 1, Step 2, ...).
 *   - Active step is highlighted in blue.
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
        className="w-16 rounded border border-blue-400 px-1 py-0 text-center text-[10px] focus:outline-none focus:ring-1 focus:ring-blue-400"
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
      className="text-[10px] text-gray-400 hover:text-gray-600"
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
  const stepCount = useStore((state) => selectTimingStepCount(selectEditorScene(state)));
  const isPlaying = useStore((s) => s.isPlaying);
  const currentStep = useStore((s) => s.currentStep);

  // We need to write duration updates directly into the scene.
  // Expose via store's generic setCurrentPlay — we write a targeted scene update.
  const setCurrentPlay = useStore((s) => s.setCurrentPlay);
  const currentPlay = useStore((s) => s.currentPlay);

  const handleDurationChange = useCallback(
    (step: number, ms: number) => {
      if (!currentPlay || !sceneId) return;
      const updated = {
        ...currentPlay,
        updatedAt: new Date(),
        scenes: currentPlay.scenes.map((sc) => {
          if (sc.id !== sceneId) return sc;
          return {
            ...sc,
            timingGroups: sc.timingGroups.map((g) =>
              g.step === step ? { ...g, duration: ms } : g,
            ),
          };
        }),
      };
      setCurrentPlay(updated);
    },
    [currentPlay, sceneId, setCurrentPlay],
  );

  if (!scene || !sceneId) return null;

  const sortedGroups = [...scene.timingGroups].sort((a, b) => a.step - b.step);

  // When playing, show the current playback step instead of the editor step
  const activeStep = isPlaying ? currentStep : selectedTimingStep;

  return (
    <div
      className="flex items-center gap-2 border-t border-gray-100 bg-gray-50 px-4 py-1.5"
      aria-label="Timing steps"
    >
      {/* Label */}
      <span className="flex shrink-0 items-center gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
          Steps
        </span>
        <InfoTooltip tip="Steps play in order within a scene. Annotations in the same step animate simultaneously — useful for sequencing a screen before a cut." />
      </span>

      {/* Step buttons */}
      {sortedGroups.map((group) => {
        const isActive = group.step === activeStep;
        const annCount = group.annotations.length;

        return (
          <div key={group.step} className="flex flex-col items-center gap-0.5">
            <button
              onClick={() => {
                if (!isPlaying) setSelectedTimingStep(group.step);
              }}
              aria-label={`Step ${group.step}`}
              aria-pressed={isActive}
              disabled={isPlaying}
              title={`Step ${group.step} — ${group.duration}ms`}
              className={[
                "relative flex h-7 min-w-[36px] items-center justify-center rounded-md px-2 text-xs font-semibold transition-colors",
                isActive
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-100",
                isPlaying ? "cursor-default" : "",
              ].join(" ")}
            >
              {group.step}
              {/* Annotation count badge */}
              {annCount > 0 && (
                <span
                  className={[
                    "absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold",
                    isActive ? "bg-white text-blue-600" : "bg-blue-600 text-white",
                  ].join(" ")}
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
                onChange={(ms) => handleDurationChange(group.step, ms)}
              />
            )}

            {/* Remove step button (only if multiple steps, not while playing) */}
            {!isPlaying && stepCount > 1 && (
              <button
                onClick={() => removeTimingStep(sceneId, group.step)}
                aria-label={`Remove step ${group.step}`}
                title={`Remove step ${group.step}`}
                className="text-[10px] text-gray-300 hover:text-red-500"
              >
                ×
              </button>
            )}
          </div>
        );
      })}

      {/* Empty-state hint */}
      {sortedGroups.length === 1 && !isPlaying && (
        <span className="ml-1 text-[11px] italic text-gray-400">
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
          className="flex h-7 w-7 items-center justify-center rounded-md border-2 border-dashed border-gray-300 text-gray-400 hover:border-blue-400 hover:text-blue-500"
        >
          +
        </button>
      )}
    </div>
  );
}
