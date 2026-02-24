"use client";

/**
 * PresentationOverlay — full-screen presentation mode for the play editor.
 *
 * Implements issue #132: Presentation mode.
 *
 * Features:
 *   - Full-screen fixed overlay (black background) that hides all editor chrome
 *   - Large court display with play title and scene note overlay
 *   - Touch-friendly playback controls (play/pause, prev/next scene)
 *   - Scene dot indicator showing position within the play
 *   - Keyboard shortcuts: Space (play/pause), Left/Right (scene nav), Esc (exit)
 *   - Auto-hide controls after 3 seconds of inactivity
 *
 * Architecture:
 *   - Reads playback state from the Zustand store (isPlaying, currentSceneIndex, etc.)
 *   - Uses the same rAF-based playback loop as PlaybackControls
 *   - exitPresentationMode stops playback and clears the flag from the store
 */

import { useEffect, useRef, useCallback, useState } from "react";
import {
  useStore,
  selectPlaybackScene,
  selectSceneCount,
} from "@/lib/store";
import CourtWithPlayers from "@/components/players/CourtWithPlayers";
import type { CourtVariant } from "@/components/court/Court";

// ---------------------------------------------------------------------------
// Icon helpers (inline SVG, no external deps)
// ---------------------------------------------------------------------------

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" width={28} height={28} fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" width={28} height={28} fill="currentColor" aria-hidden="true">
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" width={28} height={28} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" width={28} height={28} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 18l6-6-6-6" />
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

export default function PresentationOverlay() {
  const currentPlay = useStore((s) => s.currentPlay);
  const isPlaying = useStore((s) => s.isPlaying);
  const currentSceneIndex = useStore((s) => s.currentSceneIndex);
  const currentStep = useStore((s) => s.currentStep);
  const loop = useStore((s) => s.loop);
  const sceneCount = useStore(selectSceneCount);
  const scene = useStore(selectPlaybackScene);
  const courtType = useStore((s) => s.currentPlay?.courtType ?? "half");

  const togglePlayback = useStore((s) => s.togglePlayback);
  const pausePlayback = useStore((s) => s.pausePlayback);
  const stepForward = useStore((s) => s.stepForward);
  const stepBack = useStore((s) => s.stepBack);
  const setCurrentSceneIndex = useStore((s) => s.setCurrentSceneIndex);
  const setCurrentStep = useStore((s) => s.setCurrentStep);
  const exitPresentationMode = useStore((s) => s.exitPresentationMode);

  // Auto-hide controls after 3 s of inactivity
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), 3000);
  }, []);

  useEffect(() => {
    // Show controls on mount WITHOUT starting the hide timer — controls stay
    // visible until the first mouse/pointer interaction, which then starts
    // the 3-second auto-hide countdown via showControls().
    setControlsVisible(true);
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Keyboard shortcuts: Space, Left/Right, Esc
  // ---------------------------------------------------------------------------

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.code === "Space") {
        e.preventDefault();
        showControls();
        togglePlayback();
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        showControls();
        pausePlayback();
        stepForward();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        showControls();
        pausePlayback();
        stepBack();
      } else if (e.key === "Escape") {
        e.preventDefault();
        exitPresentationMode();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [togglePlayback, pausePlayback, stepForward, stepBack, exitPresentationMode, showControls]);

  // ---------------------------------------------------------------------------
  // rAF-based playback loop (mirrors PlaybackControls logic)
  // ---------------------------------------------------------------------------

  const rafRef = useRef<number | null>(null);
  const lastTimestampRef = useRef<number | null>(null);
  const msAccRef = useRef<number>(0);

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

        if (stepIndex < sortedGroups.length - 1) {
          state.setCurrentStep(sortedGroups[stepIndex + 1].step);
        } else {
          const nextSceneIdx = sceneIdx + 1;
          if (nextSceneIdx < scenes.length) {
            const nextScene = scenes[nextSceneIdx];
            const nextSteps = [...nextScene.timingGroups].sort((a, b) => a.step - b.step);
            useStore.setState({
              currentSceneIndex: nextSceneIdx,
              currentStep: nextSteps[0]?.step ?? 1,
              selectedSceneId: nextScene.id,
            });
          } else if (state.loop) {
            const firstScene = scenes[0];
            const firstSteps = [...firstScene.timingGroups].sort((a, b) => a.step - b.step);
            useStore.setState({
              currentSceneIndex: 0,
              currentStep: firstSteps[0]?.step ?? 1,
              selectedSceneId: firstScene.id,
            });
          } else {
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

  if (!currentPlay) return null;

  const sortedScenes = [...currentPlay.scenes].sort((a, b) => a.order - b.order);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Presentation mode"
      onMouseMove={showControls}
      onPointerDown={showControls}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "#000",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        cursor: controlsVisible ? "default" : "none",
      }}
    >
      {/* ------------------------------------------------------------------ */}
      {/* Title + scene note overlay — top-left, fades with controls          */}
      {/* ------------------------------------------------------------------ */}
      <div
        aria-live="polite"
        style={{
          position: "absolute",
          top: 20,
          left: 24,
          right: 80,
          zIndex: 10,
          opacity: controlsVisible ? 1 : 0,
          transition: "opacity 0.4s",
          pointerEvents: "none",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: "clamp(15px, 2.2vw, 24px)",
            fontWeight: 700,
            color: "#fff",
            textShadow: "0 1px 6px rgba(0,0,0,0.7)",
            lineHeight: 1.3,
          }}
        >
          {currentPlay.title}
        </p>
        {scene?.note && (
          <p
            style={{
              margin: "4px 0 0",
              fontSize: "clamp(12px, 1.6vw, 18px)",
              color: "rgba(255,255,255,0.75)",
              textShadow: "0 1px 4px rgba(0,0,0,0.6)",
            }}
          >
            {scene.note}
          </p>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Exit button — top-right                                             */}
      {/* ------------------------------------------------------------------ */}
      <button
        onClick={exitPresentationMode}
        aria-label="Exit presentation mode (Esc)"
        title="Exit presentation mode (Esc)"
        style={{
          position: "absolute",
          top: 16,
          right: 16,
          zIndex: 10,
          width: 40,
          height: 40,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.12)",
          border: "1px solid rgba(255,255,255,0.2)",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          opacity: controlsVisible ? 1 : 0,
          transition: "opacity 0.4s, background 0.2s",
        }}
      >
        <XIcon />
      </button>

      {/* ------------------------------------------------------------------ */}
      {/* Court — fills available space                                        */}
      {/* ------------------------------------------------------------------ */}
      <div
        style={{
          width: "100%",
          maxWidth:
            courtType === "full"
              ? "min(90vw, calc(85vh * 0.55))"
              : "min(90vw, calc(85vh * 1.1))",
          padding: "0 8px",
        }}
      >
        <CourtWithPlayers
          sceneId={scene?.id}
          scene={scene}
          variant={courtType as CourtVariant}
          readOnly
          className="w-full"
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Bottom controls bar — auto-hides                                     */}
      {/* ------------------------------------------------------------------ */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "16px 24px 24px",
          background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
          opacity: controlsVisible ? 1 : 0,
          transition: "opacity 0.4s",
          pointerEvents: controlsVisible ? "auto" : "none",
        }}
      >
        {/* Scene dot indicators */}
        <div
          role="group"
          aria-label="Scene timeline"
          style={{ display: "flex", gap: 8, alignItems: "center" }}
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
                  showControls();
                }}
                aria-label={`Scene ${i + 1}${s.note ? ` — ${s.note}` : ""}`}
                aria-pressed={isActive}
                title={`Scene ${i + 1}${s.note ? ` — ${s.note}` : ""}`}
                style={{
                  width: isActive ? 28 : 10,
                  height: 10,
                  borderRadius: 5,
                  background: isActive ? "#fff" : "rgba(255,255,255,0.35)",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  transition: "width 0.25s, background 0.2s",
                  flexShrink: 0,
                }}
              />
            );
          })}
        </div>

        {/* Play controls row */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* Prev scene */}
          <button
            onClick={() => { pausePlayback(); stepBack(); showControls(); }}
            disabled={currentSceneIndex === 0 && !loop}
            aria-label="Previous scene"
            title="Previous scene (Left Arrow)"
            style={{
              width: 52,
              height: 52,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.15)",
              border: "1px solid rgba(255,255,255,0.2)",
              color: currentSceneIndex === 0 && !loop ? "rgba(255,255,255,0.3)" : "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: currentSceneIndex === 0 && !loop ? "default" : "pointer",
            }}
          >
            <ChevronLeftIcon />
          </button>

          {/* Play / Pause */}
          <button
            onClick={() => { togglePlayback(); showControls(); }}
            aria-label={isPlaying ? "Pause" : "Play"}
            title={isPlaying ? "Pause (Space)" : "Play (Space)"}
            style={{
              width: 68,
              height: 68,
              borderRadius: "50%",
              background: "#fff",
              border: "none",
              color: "#111",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              boxShadow: "0 2px 16px rgba(0,0,0,0.4)",
            }}
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>

          {/* Next scene */}
          <button
            onClick={() => { pausePlayback(); stepForward(); showControls(); }}
            disabled={currentSceneIndex >= sceneCount - 1 && !loop}
            aria-label="Next scene"
            title="Next scene (Right Arrow)"
            style={{
              width: 52,
              height: 52,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.15)",
              border: "1px solid rgba(255,255,255,0.2)",
              color: currentSceneIndex >= sceneCount - 1 && !loop ? "rgba(255,255,255,0.3)" : "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: currentSceneIndex >= sceneCount - 1 && !loop ? "default" : "pointer",
            }}
          >
            <ChevronRightIcon />
          </button>
        </div>

        {/* Scene / step counter */}
        <p
          aria-live="polite"
          aria-atomic="true"
          style={{
            margin: 0,
            fontSize: 13,
            color: "rgba(255,255,255,0.55)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          Scene {currentSceneIndex + 1} / {sceneCount}
          {scene && scene.timingGroups.length > 1
            ? `  ·  Step ${currentStep} / ${scene.timingGroups.length}`
            : ""}
        </p>
      </div>
    </div>
  );
}
