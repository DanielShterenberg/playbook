"use client";

/**
 * PresentationOverlay — full-screen presentation mode for the play editor.
 *
 * Implements issue #132: Presentation mode.
 *
 * Features:
 *   - Full-screen fixed overlay (the theme's app background) that hides all editor chrome
 *   - Large court display with play title and scene note overlay
 *   - Step-by-step navigation within scenes (Left/Right arrows)
 *   - Scene navigation ([ / ] keys or dedicated buttons)
 *   - Go-to-beginning button (⏮ / Home key)
 *   - Speed control (0.5×, 1×, 1.5×, 2×)
 *   - Scene dots and step dots as visual timeline indicators
 *   - Auto-hide controls after 3 seconds of inactivity
 *   - Keyboard: Space (play/pause), ← → (step), [ ] (scene), Home (restart), Esc (exit)
 */

import { useEffect, useRef, useCallback, useState } from "react";
import {
  useStore,
  selectPlaybackScene,
  selectSceneCount,
} from "@/lib/store";
import type { PlaybackSpeed } from "@/lib/store";
import {
  sortedTimingGroups,
  nextStepAfter,
  prevStepBefore,
  lastStepOf,
  isAtStart,
  isAtEnd,
} from "@/lib/playback";
import CourtWithPlayers from "@/components/players/CourtWithPlayers";
import type { CourtVariant } from "@/components/court/Court";
import { SEGMENT, SEGMENTED } from "./chrome";

/** Round control button; `size` classes are added per button. */
const ROUND =
  "flex flex-none items-center justify-center rounded-full border border-line bg-surface text-ink transition-colors hover:bg-chip disabled:cursor-default disabled:opacity-40 disabled:hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text";
/** Fades with the auto-hiding controls. */
const FADE = "transition-opacity duration-[400ms]";

// ---------------------------------------------------------------------------
// Icon helpers
// ---------------------------------------------------------------------------

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" width={26} height={26} fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" width={26} height={26} fill="currentColor" aria-hidden="true">
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}

function StepBackIcon() {
  return (
    <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function StepForwardIcon() {
  return (
    <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function SceneBackIcon() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 18l-6-6 6-6M11 18l-6-6 6-6" />
    </svg>
  );
}

function SceneForwardIcon() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 18l6-6-6-6M13 18l6-6-6-6" />
    </svg>
  );
}

function RestartIcon() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="currentColor" aria-hidden="true">
      <path d="M6 4h2v16H6zM18 4L8 12l10 8V4z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const SPEED_OPTIONS: { label: string; value: PlaybackSpeed }[] = [
  { label: "0.5×", value: 0.5 },
  { label: "1×",   value: 1   },
  { label: "1.5×", value: 1.5 },
  { label: "2×",   value: 2   },
];

export default function PresentationOverlay() {
  const currentPlay        = useStore((s) => s.currentPlay);
  const isPlaying          = useStore((s) => s.isPlaying);
  const currentSceneIndex  = useStore((s) => s.currentSceneIndex);
  const currentStep        = useStore((s) => s.currentStep);
  const speed              = useStore((s) => s.speed);
  const loop               = useStore((s) => s.loop);
  const sceneCount         = useStore(selectSceneCount);
  const scene              = useStore(selectPlaybackScene);
  const courtType          = useStore((s) => s.currentPlay?.courtType ?? "half");

  const togglePlayback     = useStore((s) => s.togglePlayback);
  const pausePlayback      = useStore((s) => s.pausePlayback);
  const setCurrentStep     = useStore((s) => s.setCurrentStep);
  const setPlaybackPosition = useStore((s) => s.setPlaybackPosition);
  const setSpeed           = useStore((s) => s.setSpeed);
  const exitPresentationMode = useStore((s) => s.exitPresentationMode);

  // Effective flip: scene override > play default
  const effectiveFlipped = ((scene?.flipped ?? currentPlay?.flipped) === true);

  // Reset to beginning when entering presentation mode
  useEffect(() => {
    const state = useStore.getState();
    state.pausePlayback();
    state.setPlaybackPosition(0);
  }, []);

  // Auto-hide controls after 3 s of inactivity
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), 3000);
  }, []);

  useEffect(() => {
    setControlsVisible(true);
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); };
  }, []);

  // ---------------------------------------------------------------------------
  // Step navigation helpers (within scene, crossing scene boundaries)
  // ---------------------------------------------------------------------------

  // `currentSceneIndex` indexes `currentPlay.scenes` directly — the store keeps
  // that array in `order` order, so it is never re-sorted here. All moves go
  // through `setPlaybackPosition`, which keeps `selectedSceneId` in sync and
  // leaves `isPlaying` alone.

  const goNextStep = useCallback(() => {
    const state = useStore.getState();
    const scenes = state.currentPlay?.scenes ?? [];
    const curScene = scenes[state.currentSceneIndex];
    if (!curScene) return;
    const nextStep = nextStepAfter(curScene, state.currentStep);
    if (nextStep !== undefined) {
      state.setCurrentStep(nextStep);
    } else {
      // Advance to next scene
      const nextIdx = state.currentSceneIndex + 1;
      if (nextIdx < scenes.length) {
        state.setPlaybackPosition(nextIdx);
      } else if (state.loop) {
        state.setPlaybackPosition(0);
      }
    }
  }, []);

  const goPrevStep = useCallback(() => {
    const state = useStore.getState();
    const scenes = state.currentPlay?.scenes ?? [];
    const curScene = scenes[state.currentSceneIndex];
    if (!curScene) return;
    const prevStep = prevStepBefore(curScene, state.currentStep);
    if (prevStep !== undefined) {
      state.setCurrentStep(prevStep);
    } else if (state.currentSceneIndex > 0) {
      // Go to last step of previous scene
      const prevIdx = state.currentSceneIndex - 1;
      state.setPlaybackPosition(prevIdx, lastStepOf(scenes[prevIdx]));
    }
  }, []);

  const goNextScene = useCallback(() => {
    const state = useStore.getState();
    const sceneCount = state.currentPlay?.scenes.length ?? 0;
    const nextIdx = state.currentSceneIndex + 1;
    if (nextIdx < sceneCount) state.setPlaybackPosition(nextIdx);
  }, []);

  const goPrevScene = useCallback(() => {
    const state = useStore.getState();
    if (state.currentSceneIndex > 0) state.setPlaybackPosition(state.currentSceneIndex - 1);
  }, []);

  const goToBeginning = useCallback(() => {
    const state = useStore.getState();
    state.pausePlayback();
    state.setPlaybackPosition(0);
  }, []);

  // ---------------------------------------------------------------------------
  // Keyboard shortcuts
  // ---------------------------------------------------------------------------

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      showControls();
      if (e.code === "Space") {
        e.preventDefault();
        togglePlayback();
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        pausePlayback();
        goNextStep();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        pausePlayback();
        goPrevStep();
      } else if (e.code === "BracketRight") {
        e.preventDefault();
        pausePlayback();
        goNextScene();
      } else if (e.code === "BracketLeft") {
        e.preventDefault();
        pausePlayback();
        goPrevScene();
      } else if (e.code === "Home") {
        e.preventDefault();
        goToBeginning();
      } else if (e.key === "Escape") {
        e.preventDefault();
        exitPresentationMode();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [togglePlayback, pausePlayback, goNextStep, goPrevStep, goNextScene, goPrevScene, goToBeginning, exitPresentationMode, showControls]);

  // Auto-advance while playing is done by the single playback engine
  // (usePlaybackEngine, mounted once by the editor page — issue #160).
  // This component owns no rAF / timer.

  if (!currentPlay) return null;

  const scenes = currentPlay.scenes;

  // Step indicators for current scene
  const sortedSteps = sortedTimingGroups(scene);
  const currentStepIndex = sortedSteps.findIndex((g) => g.step === currentStep);
  const hasMultipleSteps = sortedSteps.length > 1;

  // Same definitions the store and the step handlers use (restart-on-play,
  // goNextStep / goPrevStep), so button state and behaviour cannot diverge.
  const position = { sceneIndex: currentSceneIndex, step: currentStep };
  const atStart = isAtStart(position, scenes);
  const atEnd   = isAtEnd(position, scenes);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Presentation mode"
      onMouseMove={showControls}
      onPointerDown={showControls}
      className={`fixed inset-0 z-[200] flex flex-col items-center justify-center bg-app text-ink ${controlsVisible ? "cursor-default" : "cursor-none"}`}
    >
      {/* Title + scene note — top left */}
      <div
        aria-live="polite"
        className={`pointer-events-none absolute left-6 right-20 top-5 z-10 ${FADE} ${controlsVisible ? "opacity-100" : "opacity-0"}`}
      >
        <p className="font-display text-[clamp(18px,2.4vw,28px)] font-semibold leading-tight tracking-[0.02em] text-ink">
          {currentPlay.title}
        </p>
        {scene?.note && (
          <p className="mt-1 text-[clamp(12px,1.6vw,18px)] text-muted">
            {scene.note}
          </p>
        )}
      </div>

      {/* Exit button — top right */}
      <button
        type="button"
        onClick={exitPresentationMode}
        aria-label="Exit presentation mode (Esc)"
        title="Exit (Esc)"
        className={`${ROUND} absolute right-4 top-4 z-10 h-11 w-11 ${FADE} ${controlsVisible ? "opacity-100" : "opacity-0"}`}
      >
        <XIcon />
      </button>

      {/* Court */}
      <div
        style={{
          width: "100%",
          maxWidth: courtType === "full"
            ? "min(90vw, calc(80vh * 0.55))"
            : "min(90vw, calc(80vh * 1.1))",
          padding: "0 8px",
        }}
      >
        <CourtWithPlayers
          sceneId={scene?.id}
          scene={scene}
          variant={courtType as CourtVariant}
          readOnly
          flipped={effectiveFlipped}
          activeStep={currentStep}
          className="w-full"
        />
      </div>

      {/* Bottom controls — auto-hides */}
      <div
        className={`absolute inset-x-0 bottom-0 flex flex-col items-center gap-2.5 bg-[color-mix(in_srgb,var(--color-app)_88%,transparent)] px-6 pb-5 pt-4 ${FADE} ${
          controlsVisible ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        {/* Scene dots */}
        <div role="group" aria-label="Scene timeline" className="flex items-center gap-1.5">
          {scenes.map((s, i) => {
            const isActive = i === currentSceneIndex;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  pausePlayback();
                  setPlaybackPosition(i);
                  showControls();
                }}
                aria-label={`Scene ${i + 1}${s.note ? ` — ${s.note}` : ""}`}
                aria-pressed={isActive}
                title={`Scene ${i + 1}${s.note ? ` — ${s.note}` : ""}`}
                className="group flex h-6 flex-none items-center"
              >
                <span
                  className={`block h-2 rounded transition-all duration-200 ${
                    isActive ? "w-7 bg-accent" : "w-2 bg-line-strong group-hover:bg-muted"
                  }`}
                />
              </button>
            );
          })}
        </div>

        {/* Step dots — only if current scene has multiple steps */}
        {hasMultipleSteps && (
          <div role="group" aria-label="Step timeline" className="flex items-center gap-[5px]">
            {sortedSteps.map((g, i) => {
              const isActive = i === currentStepIndex;
              return (
                <button
                  key={g.step}
                  type="button"
                  onClick={() => { pausePlayback(); setCurrentStep(g.step); showControls(); }}
                  aria-label={`Step ${i + 1}`}
                  aria-pressed={isActive}
                  className="group flex h-5 flex-none items-center"
                >
                  <span
                    className={`block h-1.5 rounded-sm transition-all duration-200 ${
                      isActive ? "w-5 bg-ink" : "w-1.5 bg-line-strong group-hover:bg-muted"
                    }`}
                  />
                </button>
              );
            })}
          </div>
        )}

        {/* Main controls row */}
        <div className="flex items-center gap-2">
          {/* Go to beginning */}
          <button
            type="button"
            onClick={() => { goToBeginning(); showControls(); }}
            disabled={atStart}
            aria-label="Go to beginning (Home)"
            title="Go to beginning (Home)"
            className={`${ROUND} h-11 w-11`}
          >
            <RestartIcon />
          </button>

          {/* Prev scene */}
          <button
            type="button"
            onClick={() => { pausePlayback(); goPrevScene(); showControls(); }}
            disabled={currentSceneIndex === 0}
            aria-label="Previous scene ([)"
            title="Previous scene ([)"
            className={`${ROUND} h-11 w-11`}
          >
            <SceneBackIcon />
          </button>

          {/* Prev step */}
          <button
            type="button"
            onClick={() => { pausePlayback(); goPrevStep(); showControls(); }}
            disabled={atStart}
            aria-label="Previous step (←)"
            title="Previous step (←)"
            className={`${ROUND} h-12 w-12`}
          >
            <StepBackIcon />
          </button>

          {/* Play / Pause */}
          <button
            type="button"
            onClick={() => { togglePlayback(); showControls(); }}
            aria-label={isPlaying ? "Pause (Space)" : "Play (Space)"}
            title={isPlaying ? "Pause (Space)" : "Play (Space)"}
            className="flex h-16 w-16 flex-none items-center justify-center rounded-full bg-accent text-accent-ink transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>

          {/* Next step */}
          <button
            type="button"
            onClick={() => { pausePlayback(); goNextStep(); showControls(); }}
            disabled={atEnd && !loop}
            aria-label="Next step (→)"
            title="Next step (→)"
            className={`${ROUND} h-12 w-12`}
          >
            <StepForwardIcon />
          </button>

          {/* Next scene */}
          <button
            type="button"
            onClick={() => { pausePlayback(); goNextScene(); showControls(); }}
            disabled={currentSceneIndex >= sceneCount - 1}
            aria-label="Next scene (])"
            title="Next scene (])"
            className={`${ROUND} h-11 w-11`}
          >
            <SceneForwardIcon />
          </button>
        </div>

        {/* Speed + counter row */}
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          {/* Speed pills */}
          <div className={SEGMENTED} role="group" aria-label="Playback speed">
            {SPEED_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { setSpeed(opt.value); showControls(); }}
                aria-label={`Speed ${opt.label}`}
                aria-pressed={speed === opt.value}
                className={`${SEGMENT} tabular-nums`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Counter */}
          <p aria-live="polite" aria-atomic="true" className="text-[13px] tabular-nums text-muted">
            Scene {currentSceneIndex + 1}/{sceneCount}
            {hasMultipleSteps ? `  ·  Step ${currentStepIndex + 1}/${sortedSteps.length}` : ""}
          </p>

          {/* Keyboard hint */}
          <p className="hidden text-xs text-muted sm:block">
            ← →: step  ·  [ ]: scene  ·  Home: restart
          </p>
        </div>
      </div>
    </div>
  );
}
