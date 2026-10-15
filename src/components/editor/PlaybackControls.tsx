"use client";

/**
 * PlaybackControls — playback row under the court.
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
 *   - Owns no timer: auto-advance is done by the single playback engine
 *     (src/hooks/usePlaybackEngine.ts, issue #160).
 */

import { useEffect } from "react";
import { useStore, selectEditorScene, selectSceneCount } from "@/lib/store";
import type { PlaybackSpeed } from "@/lib/store";
import { sortedTimingGroups } from "@/lib/playback";
import { ROUND_BTN, SEGMENT, SEGMENTED } from "./chrome";
import { sceneName } from "@/lib/types";

// ---------------------------------------------------------------------------
// Speed options
// ---------------------------------------------------------------------------

const SPEED_OPTIONS: PlaybackSpeed[] = [0.5, 1, 1.5, 2];

// ---------------------------------------------------------------------------
// Icon helpers (inline SVG, no external deps)
// ---------------------------------------------------------------------------

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="currentColor" aria-hidden="true">
      <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
    </svg>
  );
}

function StepBackIcon() {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="currentColor" aria-hidden="true">
      <path d="M6 5h2v14H6zM20 5v14L9 12z" />
    </svg>
  );
}

function StepForwardIcon() {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="currentColor" aria-hidden="true">
      <path d="M16 5h2v14h-2zM4 5v14l11-7z" />
    </svg>
  );
}

function LoopIcon() {
  return (
    <svg viewBox="0 0 20 20" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
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
  const setPlaybackPosition = useStore((s) => s.setPlaybackPosition);
  const setSpeed = useStore((s) => s.setSpeed);
  const setLoop = useStore((s) => s.setLoop);
  const setSelectedTool = useStore((s) => s.setSelectedTool);

  // Pause editing while playing
  useEffect(() => {
    if (isPlaying) {
      setSelectedTool("select");
    }
  }, [isPlaying, setSelectedTool]);

  // The playback timer lives in usePlaybackEngine (mounted once by
  // PlaybackEngine, issue #160). This component owns no rAF / timer.

  // Keyboard shortcut registration (Space, Left/Right, L, Ctrl+Left/Right) is
  // handled centrally by EditorKeyboardManager (useKeyboardShortcuts, issue #82).
  // No duplicate listener is registered here.

  if (!currentPlay) return null;

  // currentSceneIndex indexes currentPlay.scenes directly — the store keeps
  // that array in `order` order, so it must not be re-sorted here.
  const scenes = currentPlay.scenes;
  const stepGroups = sortedTimingGroups(scene);
  const totalSteps = Math.max(stepGroups.length, 1);
  // Position of the active step in playback order (1-based), not its raw number.
  const stepNumber = Math.max(stepGroups.findIndex((g) => g.step === currentStep), 0) + 1;

  // Build step indicator string
  const stepLabel = `Scene ${currentSceneIndex + 1} of ${sceneCount} · Step ${stepNumber} of ${totalSteps}`;

  return (
    <div
      className="flex w-full flex-none items-center gap-2.5 px-3 py-2 md:max-w-3xl md:flex-wrap md:justify-center md:gap-2 md:p-0 xl:gap-3"
      aria-label="Playback controls"
    >
      {/* Step back — hidden on mobile */}
      <button
        type="button"
        onClick={() => { pausePlayback(); stepBack(); }}
        title="Step back (Left Arrow)"
        aria-label="Step back"
        disabled={currentSceneIndex === 0}
        className={`${ROUND_BTN} hidden md:flex`}
      >
        <StepBackIcon />
      </button>

      {/* Play / Pause — always visible */}
      <button
        type="button"
        onClick={togglePlayback}
        title={isPlaying ? "Pause (Space)" : "Play (Space)"}
        aria-label={isPlaying ? "Pause" : "Play"}
        className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-accent text-accent-ink transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text md:h-[52px] md:w-[52px]"
      >
        {isPlaying ? <PauseIcon /> : <PlayIcon />}
      </button>

      {/* Step forward — hidden on mobile */}
      <button
        type="button"
        onClick={() => { pausePlayback(); stepForward(); }}
        title="Step forward (Right Arrow)"
        aria-label="Step forward"
        disabled={currentSceneIndex >= sceneCount - 1}
        className={`${ROUND_BTN} hidden md:flex`}
      >
        <StepForwardIcon />
      </button>

      {/* Timeline scrubber — one segment per scene, filled up to the current one */}
      <div
        className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto md:basis-14"
        role="group"
        aria-label="Scene timeline"
      >
        {scenes.map((s, i) => {
          const isActive = i === currentSceneIndex;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                pausePlayback();
                setPlaybackPosition(i);
              }}
              aria-label={`Scene ${i + 1}`}
              aria-pressed={isActive}
              title={[`Scene ${i + 1}`, sceneName(s)].filter(Boolean).join(" — ")}
              className="group flex h-11 min-w-[6px] flex-1 items-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text"
            >
              <span
                className={[
                  "block h-1.5 w-full transition-colors",
                  i === 0 ? "rounded-l-full" : "",
                  i === scenes.length - 1 ? "rounded-r-full" : "",
                  i <= currentSceneIndex ? "bg-accent" : "bg-line group-hover:bg-line-strong",
                ].join(" ")}
              />
            </button>
          );
        })}
      </div>

      {/* Scene / step indicator — short form on mobile */}
      <span
        className="flex-none select-none text-[13px] tabular-nums text-muted"
        aria-live="polite"
        aria-atomic="true"
      >
        <span className="hidden md:inline">{stepLabel}</span>
        <span className="md:hidden">
          {currentSceneIndex + 1} / {sceneCount}
        </span>
      </span>

      {/* Speed selector — hidden on mobile */}
      <div className={`${SEGMENTED} hidden md:flex`} role="group" aria-label="Playback speed">
        {SPEED_OPTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSpeed(s)}
            aria-label={`Speed ${s}x`}
            aria-pressed={speed === s}
            className={`${SEGMENT} tabular-nums`}
          >
            {s}x
          </button>
        ))}
      </div>

      {/* Loop toggle — hidden on mobile */}
      <button
        type="button"
        onClick={() => setLoop(!loop)}
        title="Loop (L)"
        aria-label="Toggle loop"
        aria-pressed={loop}
        className={`${ROUND_BTN} hidden aria-pressed:text-accent-text md:flex`}
      >
        <LoopIcon />
      </button>
    </div>
  );
}
