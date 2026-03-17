"use client";

/**
 * PresentationOverlay — full-screen presentation mode for the play editor.
 *
 * Implements issue #132: Presentation mode.
 *
 * Features:
 *   - Full-screen fixed overlay (black background) that hides all editor chrome
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
import CourtWithPlayers from "@/components/players/CourtWithPlayers";
import type { CourtVariant } from "@/components/court/Court";

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
  const setSpeed           = useStore((s) => s.setSpeed);
  const exitPresentationMode = useStore((s) => s.exitPresentationMode);

  // Effective flip: scene override > play default
  const effectiveFlipped = ((scene?.flipped ?? currentPlay?.flipped) === true);

  // Reset to beginning when entering presentation mode
  useEffect(() => {
    const state = useStore.getState();
    const scenes = state.currentPlay?.scenes ?? [];
    const sorted = [...scenes].sort((a, b) => a.order - b.order);
    const first = sorted[0];
    if (first) {
      const firstGroups = [...first.timingGroups].sort((a, b) => a.step - b.step);
      state.pausePlayback();
      useStore.setState({
        currentSceneIndex: 0,
        currentStep: firstGroups[0]?.step ?? 1,
        selectedSceneId: first.id,
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  const goNextStep = useCallback(() => {
    const state = useStore.getState();
    const scenes = state.currentPlay?.scenes ?? [];
    const sortedScenes = [...scenes].sort((a, b) => a.order - b.order);
    const curScene = sortedScenes[state.currentSceneIndex];
    if (!curScene) return;
    const sortedGroups = [...curScene.timingGroups].sort((a, b) => a.step - b.step);
    const stepIdx = sortedGroups.findIndex((g) => g.step === state.currentStep);
    if (stepIdx < sortedGroups.length - 1) {
      state.setCurrentStep(sortedGroups[stepIdx + 1].step);
    } else {
      // Advance to next scene
      const nextIdx = state.currentSceneIndex + 1;
      if (nextIdx < sortedScenes.length) {
        const nextScene = sortedScenes[nextIdx];
        const nextGroups = [...nextScene.timingGroups].sort((a, b) => a.step - b.step);
        useStore.setState({
          currentSceneIndex: nextIdx,
          currentStep: nextGroups[0]?.step ?? 1,
          selectedSceneId: nextScene.id,
        });
      } else if (state.loop) {
        const firstScene = sortedScenes[0];
        const firstGroups = [...firstScene.timingGroups].sort((a, b) => a.step - b.step);
        useStore.setState({
          currentSceneIndex: 0,
          currentStep: firstGroups[0]?.step ?? 1,
          selectedSceneId: firstScene.id,
        });
      }
    }
  }, []);

  const goPrevStep = useCallback(() => {
    const state = useStore.getState();
    const scenes = state.currentPlay?.scenes ?? [];
    const sortedScenes = [...scenes].sort((a, b) => a.order - b.order);
    const curScene = sortedScenes[state.currentSceneIndex];
    if (!curScene) return;
    const sortedGroups = [...curScene.timingGroups].sort((a, b) => a.step - b.step);
    const stepIdx = sortedGroups.findIndex((g) => g.step === state.currentStep);
    if (stepIdx > 0) {
      state.setCurrentStep(sortedGroups[stepIdx - 1].step);
    } else if (state.currentSceneIndex > 0) {
      // Go to last step of previous scene
      const prevIdx = state.currentSceneIndex - 1;
      const prevScene = sortedScenes[prevIdx];
      const prevGroups = [...prevScene.timingGroups].sort((a, b) => a.step - b.step);
      useStore.setState({
        currentSceneIndex: prevIdx,
        currentStep: prevGroups[prevGroups.length - 1]?.step ?? 1,
        selectedSceneId: prevScene.id,
      });
    }
  }, []);

  const goNextScene = useCallback(() => {
    const state = useStore.getState();
    const scenes = state.currentPlay?.scenes ?? [];
    const sortedScenes = [...scenes].sort((a, b) => a.order - b.order);
    const nextIdx = state.currentSceneIndex + 1;
    if (nextIdx < sortedScenes.length) {
      const nextScene = sortedScenes[nextIdx];
      const nextGroups = [...nextScene.timingGroups].sort((a, b) => a.step - b.step);
      useStore.setState({
        currentSceneIndex: nextIdx,
        currentStep: nextGroups[0]?.step ?? 1,
        selectedSceneId: nextScene.id,
      });
    }
  }, []);

  const goPrevScene = useCallback(() => {
    const state = useStore.getState();
    const scenes = state.currentPlay?.scenes ?? [];
    const sortedScenes = [...scenes].sort((a, b) => a.order - b.order);
    if (state.currentSceneIndex > 0) {
      const prevIdx = state.currentSceneIndex - 1;
      const prevScene = sortedScenes[prevIdx];
      const prevGroups = [...prevScene.timingGroups].sort((a, b) => a.step - b.step);
      useStore.setState({
        currentSceneIndex: prevIdx,
        currentStep: prevGroups[0]?.step ?? 1,
        selectedSceneId: prevScene.id,
      });
    }
  }, []);

  const goToBeginning = useCallback(() => {
    const state = useStore.getState();
    const scenes = state.currentPlay?.scenes ?? [];
    const sortedScenes = [...scenes].sort((a, b) => a.order - b.order);
    const firstScene = sortedScenes[0];
    if (!firstScene) return;
    const firstGroups = [...firstScene.timingGroups].sort((a, b) => a.step - b.step);
    state.pausePlayback();
    useStore.setState({
      currentSceneIndex: 0,
      currentStep: firstGroups[0]?.step ?? 1,
      selectedSceneId: firstScene.id,
    });
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

  // ---------------------------------------------------------------------------
  // rAF-based playback loop
  // ---------------------------------------------------------------------------

  const rafRef = useRef<number | null>(null);
  const lastTimestampRef = useRef<number | null>(null);
  const msAccRef = useRef<number>(0);

  const advancePlayback = useCallback(
    (timestamp: number) => {
      if (!lastTimestampRef.current) lastTimestampRef.current = timestamp;
      const dt = (timestamp - lastTimestampRef.current) * useStore.getState().speed;
      lastTimestampRef.current = timestamp;
      msAccRef.current += dt;

      const state = useStore.getState();
      const scenes = state.currentPlay?.scenes ?? [];
      const sortedScenes = [...scenes].sort((a, b) => a.order - b.order);
      if (sortedScenes.length === 0) return;

      const curScene = sortedScenes[state.currentSceneIndex];
      if (!curScene) return;

      const sortedGroups = [...curScene.timingGroups].sort((a, b) => a.step - b.step);
      const stepIndex = sortedGroups.findIndex((g) => g.step === state.currentStep);
      const stepDuration = sortedGroups[stepIndex]?.duration ?? 1000;

      if (msAccRef.current >= stepDuration) {
        msAccRef.current -= stepDuration;
        if (stepIndex < sortedGroups.length - 1) {
          state.setCurrentStep(sortedGroups[stepIndex + 1].step);
        } else {
          const nextSceneIdx = state.currentSceneIndex + 1;
          if (nextSceneIdx < sortedScenes.length) {
            const nextScene = sortedScenes[nextSceneIdx];
            const nextGroups = [...nextScene.timingGroups].sort((a, b) => a.step - b.step);
            useStore.setState({
              currentSceneIndex: nextSceneIdx,
              currentStep: nextGroups[0]?.step ?? 1,
              selectedSceneId: nextScene.id,
            });
          } else if (state.loop) {
            const firstScene = sortedScenes[0];
            const firstGroups = [...firstScene.timingGroups].sort((a, b) => a.step - b.step);
            useStore.setState({
              currentSceneIndex: 0,
              currentStep: firstGroups[0]?.step ?? 1,
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
      if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    }
    return () => { if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; } };
  }, [isPlaying, advancePlayback]);

  if (!currentPlay) return null;

  const sortedScenes = [...currentPlay.scenes].sort((a, b) => a.order - b.order);

  // Step indicators for current scene
  const sortedSteps = scene
    ? [...scene.timingGroups].sort((a, b) => a.step - b.step)
    : [];
  const currentStepIndex = sortedSteps.findIndex((g) => g.step === currentStep);
  const hasMultipleSteps = sortedSteps.length > 1;

  const atStart = currentSceneIndex === 0 && currentStepIndex <= 0;
  const atEnd   = currentSceneIndex >= sceneCount - 1 && currentStepIndex >= sortedSteps.length - 1;

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
      {/* Title + scene note — top left */}
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
        <p style={{ margin: 0, fontSize: "clamp(15px, 2.2vw, 24px)", fontWeight: 700, color: "#fff", textShadow: "0 1px 6px rgba(0,0,0,0.7)", lineHeight: 1.3 }}>
          {currentPlay.title}
        </p>
        {scene?.note && (
          <p style={{ margin: "4px 0 0", fontSize: "clamp(12px, 1.6vw, 18px)", color: "rgba(255,255,255,0.75)", textShadow: "0 1px 4px rgba(0,0,0,0.6)" }}>
            {scene.note}
          </p>
        )}
      </div>

      {/* Exit button — top right */}
      <button
        onClick={exitPresentationMode}
        aria-label="Exit presentation mode (Esc)"
        title="Exit (Esc)"
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
          transition: "opacity 0.4s",
        }}
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
          n={currentStep}
          className="w-full"
        />
      </div>

      {/* Bottom controls — auto-hides */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "16px 24px 20px",
          background: "linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 10,
          opacity: controlsVisible ? 1 : 0,
          transition: "opacity 0.4s",
          pointerEvents: controlsVisible ? "auto" : "none",
        }}
      >
        {/* Scene dots */}
        <div role="group" aria-label="Scene timeline" style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {sortedScenes.map((s, i) => {
            const isActive = i === currentSceneIndex;
            return (
              <button
                key={s.id}
                onClick={() => {
                  pausePlayback();
                  const groups = [...s.timingGroups].sort((a, b) => a.step - b.step);
                  useStore.setState({ currentSceneIndex: i, currentStep: groups[0]?.step ?? 1, selectedSceneId: s.id });
                  showControls();
                }}
                aria-label={`Scene ${i + 1}${s.note ? ` — ${s.note}` : ""}`}
                aria-pressed={isActive}
                title={`Scene ${i + 1}${s.note ? ` — ${s.note}` : ""}`}
                style={{
                  width: isActive ? 28 : 8,
                  height: 8,
                  borderRadius: 4,
                  background: isActive ? "#fff" : "rgba(255,255,255,0.3)",
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

        {/* Step dots — only if current scene has multiple steps */}
        {hasMultipleSteps && (
          <div role="group" aria-label="Step timeline" style={{ display: "flex", gap: 5, alignItems: "center" }}>
            {sortedSteps.map((g, i) => {
              const isActive = i === currentStepIndex;
              return (
                <button
                  key={g.step}
                  onClick={() => { pausePlayback(); setCurrentStep(g.step); showControls(); }}
                  aria-label={`Step ${i + 1}`}
                  aria-pressed={isActive}
                  style={{
                    width: isActive ? 20 : 6,
                    height: 6,
                    borderRadius: 3,
                    background: isActive ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.2)",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                    transition: "width 0.2s, background 0.15s",
                    flexShrink: 0,
                  }}
                />
              );
            })}
          </div>
        )}

        {/* Main controls row */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Go to beginning */}
          <button
            onClick={() => { goToBeginning(); showControls(); }}
            disabled={atStart}
            aria-label="Go to beginning (Home)"
            title="Go to beginning (Home)"
            style={{
              width: 38,
              height: 38,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.1)",
              border: "1px solid rgba(255,255,255,0.15)",
              color: atStart ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.7)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: atStart ? "default" : "pointer",
            }}
          >
            <RestartIcon />
          </button>

          {/* Prev scene */}
          <button
            onClick={() => { pausePlayback(); goPrevScene(); showControls(); }}
            disabled={currentSceneIndex === 0}
            aria-label="Previous scene ([)"
            title="Previous scene ([)"
            style={{
              width: 38,
              height: 38,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.1)",
              border: "1px solid rgba(255,255,255,0.15)",
              color: currentSceneIndex === 0 ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.7)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: currentSceneIndex === 0 ? "default" : "pointer",
            }}
          >
            <SceneBackIcon />
          </button>

          {/* Prev step */}
          <button
            onClick={() => { pausePlayback(); goPrevStep(); showControls(); }}
            disabled={atStart}
            aria-label="Previous step (←)"
            title="Previous step (←)"
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.15)",
              border: "1px solid rgba(255,255,255,0.2)",
              color: atStart ? "rgba(255,255,255,0.25)" : "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: atStart ? "default" : "pointer",
            }}
          >
            <StepBackIcon />
          </button>

          {/* Play / Pause */}
          <button
            onClick={() => { togglePlayback(); showControls(); }}
            aria-label={isPlaying ? "Pause (Space)" : "Play (Space)"}
            title={isPlaying ? "Pause (Space)" : "Play (Space)"}
            style={{
              width: 64,
              height: 64,
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

          {/* Next step */}
          <button
            onClick={() => { pausePlayback(); goNextStep(); showControls(); }}
            disabled={atEnd && !loop}
            aria-label="Next step (→)"
            title="Next step (→)"
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.15)",
              border: "1px solid rgba(255,255,255,0.2)",
              color: atEnd && !loop ? "rgba(255,255,255,0.25)" : "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: atEnd && !loop ? "default" : "pointer",
            }}
          >
            <StepForwardIcon />
          </button>

          {/* Next scene */}
          <button
            onClick={() => { pausePlayback(); goNextScene(); showControls(); }}
            disabled={currentSceneIndex >= sceneCount - 1}
            aria-label="Next scene (])"
            title="Next scene (])"
            style={{
              width: 38,
              height: 38,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.1)",
              border: "1px solid rgba(255,255,255,0.15)",
              color: currentSceneIndex >= sceneCount - 1 ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.7)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: currentSceneIndex >= sceneCount - 1 ? "default" : "pointer",
            }}
          >
            <SceneForwardIcon />
          </button>
        </div>

        {/* Speed + counter row */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* Speed pills */}
          <div style={{ display: "flex", gap: 4 }}>
            {SPEED_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => { setSpeed(opt.value); showControls(); }}
                aria-pressed={speed === opt.value}
                style={{
                  padding: "3px 9px",
                  borderRadius: 99,
                  border: speed === opt.value ? "1px solid rgba(255,255,255,0.7)" : "1px solid rgba(255,255,255,0.2)",
                  background: speed === opt.value ? "rgba(255,255,255,0.2)" : "transparent",
                  color: speed === opt.value ? "#fff" : "rgba(255,255,255,0.45)",
                  fontSize: 11,
                  fontWeight: speed === opt.value ? 700 : 400,
                  cursor: "pointer",
                  transition: "background 0.15s, border-color 0.15s, color 0.15s",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Counter */}
          <p
            aria-live="polite"
            aria-atomic="true"
            style={{
              margin: 0,
              fontSize: 12,
              color: "rgba(255,255,255,0.45)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            Scene {currentSceneIndex + 1}/{sceneCount}
            {hasMultipleSteps ? `  ·  Step ${currentStepIndex + 1}/${sortedSteps.length}` : ""}
          </p>

          {/* Keyboard hint */}
          <p style={{ margin: 0, fontSize: 10, color: "rgba(255,255,255,0.2)" }}>
            ← →: step  ·  [ ]: scene  ·  Home: restart
          </p>
        </div>
      </div>
    </div>
  );
}
