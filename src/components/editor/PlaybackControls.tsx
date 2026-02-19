"use client";

/**
 * PlaybackControls — bottom bar for scene playback.
 *
 * Implements issue #66: Playback controls UI.
 *
 * Features:
 *   - Play/Pause button (keyboard: Space)
 *   - Step Back / Step Forward buttons (keyboard: Left / Right arrows)
 *   - Speed selector: 0.5x, 1x, 1.5x, 2x
 *   - Loop toggle (keyboard: L)
 *   - Current scene / step indicator ("Scene 2 · Step 1")
 *   - Timeline scrubber showing all scenes
 *   - Disables editing while playing (drawing tools deactivated)
 *
 * Architecture:
 *   - Reads/writes Zustand playback state.
 *   - Uses requestAnimationFrame to auto-advance through scenes while isPlaying.
 *   - On each frame, advances the selectedTimingStep within a scene, then
 *     moves to the next scene when all timing groups are exhausted.
 */

import { useEffect, useRef, useCallback } from "react";
import { useStore, selectEditorScene, selectSceneCount } from "@/lib/store";
import type { PlaybackSpeed } from "@/lib/store";

// ---------------------------------------------------------------------------
// Speed options
// ---------------------------------------------------------------------------

const SPEED_OPTIONS: PlaybackSpeed[] = [0.5, 1, 1.5, 2];

// ---------------------------------------------------------------------------
// Icon helpers (inline SVG, no external deps)
// ---------------------------------------------------------------------------

function PlayIcon() {
  return (
    <svg viewBox="0 0 20 20" width={18} height={18} fill="currentColor" aria-hidden="true">
      <path d="M6.3 3.7a1 1 0 0 1 1.4 0l7 6a1 1 0 0 1 0 1.6l-7 6A1 1 0 0 1 6 16.5v-13a1 1 0 0 1 .3-.8z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 20 20" width={18} height={18} fill="currentColor" aria-hidden="true">
      <rect x="5" y="3" width="4" height="14" rx="1.5" />
      <rect x="11" y="3" width="4" height="14" rx="1.5" />
    </svg>
  );
}

function StepBackIcon() {
  return (
    <svg viewBox="0 0 20 20" width={16} height={16} fill="currentColor" aria-hidden="true">
      <rect x="4" y="3" width="2.5" height="14" rx="1" />
      <path d="M14.5 3.7a1 1 0 0 0-1.4 0l-6 5.3a1 1 0 0 0 0 1.6l6 5a1 1 0 0 0 1.6-.8V4.5a1 1 0 0 0-.2-.8z" />
    </svg>
  );
}

function StepForwardIcon() {
  return (
    <svg viewBox="0 0 20 20" width={16} height={16} fill="currentColor" aria-hidden="true">
      <rect x="13.5" y="3" width="2.5" height="14" rx="1" />
      <path d="M5.5 3.7a1 1 0 0 1 1.4 0l6 5.3a1 1 0 0 1 0 1.6l-6 5A1 1 0 0 1 4.3 14.8V4.5a1 1 0 0 1 .2-.8z" />
    </svg>
  );
}

function LoopIcon({ active }: { active: boolean }) {
  const c = active ? "#3B82F6" : "currentColor";
  return (
    <svg viewBox="0 0 20 20" width={16} height={16} fill="none" stroke={c} strokeWidth={1.8} aria-hidden="true">
      <path d="M4 10a6 6 0 0 1 6-6h4" strokeLinecap="round" />
      <path d="M12 2l2.5 2L12 6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 10a6 6 0 0 1-6 6H6" strokeLinecap="round" />
      <path d="M8 18l-2.5-2L8 14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PlaybackControls() {
  const currentPlay = useStore((s) => s.currentPlay);
  const isPlaying = useStore((s) => s.isPlaying);
  const currentSceneIndex = useStore((s) => s.currentSceneIndex);
  const currentStep = useStore((s) => s.currentStep);
  const speed = useStore((s) => s.speed);
  const loop = useStore((s) => s.loop);
  const sceneCount = useStore(selectSceneCount);
  const scene = useStore(selectEditorScene);

  const togglePlayback = useStore((s) => s.togglePlayback);
  const pausePlayback = useStore((s) => s.pausePlayback);
  const stepForward = useStore((s) => s.stepForward);
  const stepBack = useStore((s) => s.stepBack);
  const setCurrentSceneIndex = useStore((s) => s.setCurrentSceneIndex);
  const setCurrentStep = useStore((s) => s.setCurrentStep);
  const setSpeed = useStore((s) => s.setSpeed);
  const setLoop = useStore((s) => s.setLoop);
  const setSelectedTool = useStore((s) => s.setSelectedTool);

  // Pause editing while playing
  useEffect(() => {
    if (isPlaying) {
      setSelectedTool("select");
    }
  }, [isPlaying, setSelectedTool]);

  // Playback timer — auto-advance timing steps, then scenes
  const rafRef = useRef<number | null>(null);
  const lastTimestampRef = useRef<number | null>(null);
  const msAccRef = useRef<number>(0); // accumulated ms in current step

  const advancePlayback = useCallback(
    (timestamp: number) => {
      if (!lastTimestampRef.current) {
        lastTimestampRef.current = timestamp;
      }
      const dt = (timestamp - lastTimestampRef.current) * useStore.getState().speed;
      lastTimestampRef.current = timestamp;
      msAccRef.current += dt;

      const state = useStore.getState();
      const scenes = state.currentPlay?.scenes ?? [];
      if (scenes.length === 0) return;

      const sceneIdx = state.currentSceneIndex;
      const curScene = scenes[sceneIdx];
      if (!curScene) return;

      const sortedGroups = [...curScene.timingGroups].sort((a, b) => a.step - b.step);
      const stepIndex = sortedGroups.findIndex((g) => g.step === state.currentStep);
      const group = sortedGroups[stepIndex];
      const stepDuration = group?.duration ?? 1000;

      if (msAccRef.current >= stepDuration) {
        msAccRef.current -= stepDuration;

        // Move to next step in scene
        if (stepIndex < sortedGroups.length - 1) {
          state.setCurrentStep(sortedGroups[stepIndex + 1].step);
        } else {
          // End of last step — move to next scene
          const nextSceneIdx = sceneIdx + 1;
          if (nextSceneIdx < scenes.length) {
            state.setCurrentSceneIndex(nextSceneIdx);
            // Set to first step of next scene
            const nextScene = scenes[nextSceneIdx];
            const nextSteps = [...nextScene.timingGroups].sort((a, b) => a.step - b.step);
            state.setCurrentStep(nextSteps[0]?.step ?? 1);
          } else if (state.loop) {
            state.setCurrentSceneIndex(0);
            const firstScene = scenes[0];
            const firstSteps = [...firstScene.timingGroups].sort((a, b) => a.step - b.step);
            state.setCurrentStep(firstSteps[0]?.step ?? 1);
          } else {
            // Playback complete
            state.pausePlayback();
            return;
          }
        }
      }

      if (useStore.getState().isPlaying) {
        rafRef.current = requestAnimationFrame(advancePlayback);
      }
    },
    [],
  );

  useEffect(() => {
    if (isPlaying) {
      lastTimestampRef.current = null;
      msAccRef.current = 0;
      rafRef.current = requestAnimationFrame(advancePlayback);
    } else {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    }
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isPlaying, advancePlayback]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.code === "Space") {
        e.preventDefault();
        togglePlayback();
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        pausePlayback();
        stepForward();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        pausePlayback();
        stepBack();
      } else if (e.key === "l" || e.key === "L") {
        setLoop(!useStore.getState().loop);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlayback, pausePlayback, stepForward, stepBack, setLoop]);

  if (!currentPlay) return null;

  const sortedScenes = [...currentPlay.scenes].sort((a, b) => a.order - b.order);
  const totalSteps = scene?.timingGroups.length ?? 1;

  // Build step indicator string
  const stepLabel = `Scene ${currentSceneIndex + 1} / ${sceneCount}  ·  Step ${currentStep} / ${totalSteps}`;

  return (
    <div
      className="flex items-center gap-3 border-t border-gray-200 bg-white px-4 py-2"
      aria-label="Playback controls"
    >
      {/* Step back */}
      <button
        onClick={() => { pausePlayback(); stepBack(); }}
        title="Step back (Left Arrow)"
        aria-label="Step back"
        disabled={currentSceneIndex === 0}
        className="flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 disabled:opacity-30"
      >
        <StepBackIcon />
      </button>

      {/* Play / Pause */}
      <button
        onClick={togglePlayback}
        title={isPlaying ? "Pause (Space)" : "Play (Space)"}
        aria-label={isPlaying ? "Pause" : "Play"}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-white shadow hover:bg-blue-700"
      >
        {isPlaying ? <PauseIcon /> : <PlayIcon />}
      </button>

      {/* Step forward */}
      <button
        onClick={() => { pausePlayback(); stepForward(); }}
        title="Step forward (Right Arrow)"
        aria-label="Step forward"
        disabled={currentSceneIndex >= sceneCount - 1}
        className="flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 disabled:opacity-30"
      >
        <StepForwardIcon />
      </button>

      {/* Scene / step indicator */}
      <span
        className="min-w-[160px] select-none text-center text-xs font-medium text-gray-500"
        aria-live="polite"
        aria-atomic="true"
      >
        {stepLabel}
      </span>

      {/* Timeline scrubber */}
      <div
        className="flex flex-1 items-center gap-1 overflow-x-auto"
        role="group"
        aria-label="Scene timeline"
      >
        {sortedScenes.map((s, i) => {
          const isActive = i === currentSceneIndex;
          return (
            <button
              key={s.id}
              onClick={() => {
                pausePlayback();
                setCurrentSceneIndex(i);
                const steps = [...s.timingGroups].sort((a, b) => a.step - b.step);
                setCurrentStep(steps[0]?.step ?? 1);
              }}
              aria-label={`Scene ${i + 1}`}
              aria-pressed={isActive}
              title={`Scene ${i + 1}${s.note ? ` — ${s.note}` : ""}`}
              className={[
                "h-2 flex-1 min-w-[32px] rounded-full transition-colors",
                isActive ? "bg-blue-600" : "bg-gray-200 hover:bg-gray-300",
              ].join(" ")}
            />
          );
        })}
      </div>

      {/* Speed selector */}
      <div className="flex items-center gap-1">
        {SPEED_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => setSpeed(s)}
            aria-label={`Speed ${s}x`}
            aria-pressed={speed === s}
            className={[
              "rounded px-1.5 py-0.5 text-xs font-medium transition-colors",
              speed === s
                ? "bg-blue-100 text-blue-700"
                : "text-gray-500 hover:bg-gray-100",
            ].join(" ")}
          >
            {s}x
          </button>
        ))}
      </div>

      {/* Loop toggle */}
      <button
        onClick={() => setLoop(!loop)}
        title="Loop (L)"
        aria-label="Toggle loop"
        aria-pressed={loop}
        className={[
          "flex h-8 w-8 items-center justify-center rounded-md transition-colors",
          loop ? "bg-blue-100 text-blue-600" : "text-gray-400 hover:bg-gray-100",
        ].join(" ")}
      >
        <LoopIcon active={loop} />
      </button>
    </div>
  );
}
