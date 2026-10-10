"use client";

/**
 * SharedPlayViewPage — public read-only play viewer.
 *
 * Implements issue #78: share link → read-only animated view.
 *
 * URL: /view/[shareToken]
 *
 * No authentication required. Loads a play snapshot from
 * sharedPlays/{shareToken} (publicly readable in Firestore rules)
 * and renders a read-only, step-animated view of the play.
 *
 * Features:
 *   - Correct court orientation (respects play/scene flipped flag)
 *   - All annotations visible (arrows, screens, passes, etc.)
 *   - Step-by-step animation controls within each scene
 *   - Scene navigation (prev/next scene)
 *   - Keyboard shortcuts: Space (play/pause steps), Left/Right (prev/next step),
 *     [ / ] (prev/next scene)
 */

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { loadSharedPlay } from "@/lib/team";
import type { Play } from "@/lib/types";
import {
  tickPlayback,
  sortedTimingGroups,
  nextStepAfter,
  prevStepBefore,
  firstStepOf,
  startPosition,
  isAtStart,
  isAtEnd,
  normalizePlayForPlayback,
} from "@/lib/playback";
import type { PlaybackPosition } from "@/lib/playback";
import { usePlaybackClock } from "@/hooks/usePlaybackEngine";
import CourtWithPlayers from "@/components/players/CourtWithPlayers";
import type { CourtVariant } from "@/components/court/Court";

interface SharedPlayViewPageProps {
  params: { shareToken: string };
}

// ---------------------------------------------------------------------------
// Icon helpers
// ---------------------------------------------------------------------------

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="currentColor" aria-hidden="true">
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}

function ChevronLeftIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SharedPlayViewPage({ params }: SharedPlayViewPageProps) {
  const { shareToken } = params;
  const [play, setPlay] = useState<Play | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [isPlaying, setIsPlaying] = useState(false);
  // Read through a ref so two quick toggles before a re-render do not both
  // see the same stale value.
  const isPlayingRef = useRef(false);
  const setPlaying = useCallback((playing: boolean) => {
    isPlayingRef.current = playing;
    setIsPlaying(playing);
  }, []);
  const [speed, setSpeed] = useState<0.5 | 1 | 1.5 | 2>(1);

  // The one playback position (scene, step, time spent in the step). It lives
  // in a ref because the time changes on every animation frame; `shown` is the
  // snapshot of it that is rendered. Both are only ever written by `moveTo`,
  // together, so there is nothing to reconcile — everything else is derived.
  const positionRef = useRef<PlaybackPosition>({ sceneIndex: 0, step: 1, accMs: 0 });
  const [shown, setShown] = useState({ sceneIndex: 0, step: 1 });
  const moveTo = useCallback((next: PlaybackPosition) => {
    const prev = positionRef.current;
    positionRef.current = next;
    // Most ticks only add time; re-render only when the scene or step changes.
    if (prev.sceneIndex !== next.sceneIndex || prev.step !== next.step) {
      setShown({ sceneIndex: next.sceneIndex, step: next.step });
    }
  }, []);

  useEffect(() => {
    loadSharedPlay(shareToken)
      .then((p) => {
        // Same normalisation as the editor store applies on load: scenes in
        // `order` order, timing steps renumbered 1..n (legacy snapshots can
        // carry gaps or duplicate step numbers).
        if (p) setPlay(normalizePlayForPlayback(p));
        else setNotFound(true);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [shareToken]);

  const scenes = useMemo(() => play?.scenes ?? [], [play]);
  const { sceneIndex, step: currentStep } = shown;
  const scene = scenes[sceneIndex] ?? null;
  const steps = sortedTimingGroups(scene);
  const stepIndex = Math.max(steps.findIndex((g) => g.step === currentStep), 0);
  // One derivation for the step buttons' disabled state and for stepBy.
  const prevStep = prevStepBefore(scene, currentStep);
  const nextStep = nextStepAfter(scene, currentStep);
  const atStart = isAtStart(shown, scenes);

  // Auto-advance while playing: the shared pure playback reducer
  // (src/lib/playback.ts, issue #160) on a rAF clock. No loop in the viewer.
  const tick = useCallback((dtMs: number) => {
    const result = tickPlayback(positionRef.current, dtMs, { scenes, speed, loop: false });
    moveTo(result.state);
    if (result.ended) setPlaying(false);
  }, [scenes, speed, moveTo, setPlaying]);

  usePlaybackClock(isPlaying, tick);

  // ---------------------------------------------------------------------------
  // Controls (shared by buttons and keyboard)
  // ---------------------------------------------------------------------------

  const togglePlay = useCallback(() => {
    if (isPlayingRef.current) {
      setPlaying(false);
      return;
    }
    // Play pressed on the final step restarts the play instead of replaying
    // only the final hold. Either way the current step starts from zero.
    const position = positionRef.current;
    moveTo(isAtEnd(position, scenes) ? startPosition(scenes) : { ...position, accMs: 0 });
    setPlaying(true);
  }, [scenes, moveTo, setPlaying]);

  /**
   * Pause and move one step back / forward within the current scene. The
   * target comes from the same prevStepBefore / nextStepAfter the buttons'
   * disabled state is derived from (`prevStep` / `nextStep` below).
   */
  const stepBy = useCallback((delta: 1 | -1) => {
    setPlaying(false);
    const position = positionRef.current;
    const scene = scenes[position.sceneIndex];
    const target = delta > 0 ? nextStepAfter(scene, position.step) : prevStepBefore(scene, position.step);
    if (target !== undefined) moveTo({ sceneIndex: position.sceneIndex, step: target, accMs: 0 });
  }, [scenes, moveTo, setPlaying]);

  /** Pause and go to the first step of a scene (no-op move if already on that scene). */
  const goToScene = useCallback((index: number) => {
    setPlaying(false);
    const target = Math.min(Math.max(index, 0), scenes.length - 1);
    if (target < 0 || target === positionRef.current.sceneIndex) return;
    moveTo({ sceneIndex: target, step: firstStepOf(scenes[target]), accMs: 0 });
  }, [scenes, moveTo, setPlaying]);

  const sceneBy = useCallback(
    (delta: 1 | -1) => goToScene(positionRef.current.sceneIndex + delta),
    [goToScene],
  );

  const goToBeginning = useCallback(() => {
    setPlaying(false);
    moveTo(startPosition(scenes));
  }, [scenes, moveTo, setPlaying]);

  // Keyboard shortcuts. The window listener is registered once; it reaches the
  // current handlers through a ref so play/pause does not re-register it.
  const handlersRef = useRef({ togglePlay, stepBy, sceneBy, goToBeginning });
  useEffect(() => {
    handlersRef.current = { togglePlay, stepBy, sceneBy, goToBeginning };
  }, [togglePlay, stepBy, sceneBy, goToBeginning]);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const handlers = handlersRef.current;
      if (e.code === "Space") {
        e.preventDefault();
        handlers.togglePlay();
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        handlers.stepBy(1);
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        handlers.stepBy(-1);
      } else if (e.code === "Home") {
        e.preventDefault();
        handlers.goToBeginning();
      } else if (e.code === "BracketLeft") {
        e.preventDefault();
        handlers.sceneBy(-1);
      } else if (e.code === "BracketRight") {
        e.preventDefault();
        handlers.sceneBy(1);
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Effective flip: scene override > play default
  const effectiveFlipped = ((scene?.flipped ?? play?.flipped) === true);

  // ---------------------------------------------------------------------------
  // Loading / not-found states
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <main style={{ minHeight: "100vh", background: "#F9FAFB", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: "#6B7280", fontSize: 15 }}>
        <svg width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ animation: "spin 1s linear infinite" }}>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <circle cx={12} cy={12} r={10} stroke="currentColor" strokeWidth={3} strokeDasharray="31 31" strokeLinecap="round" />
        </svg>
        Loading play…
      </main>
    );
  }

  if (notFound || !play) {
    return (
      <main style={{ minHeight: "100vh", background: "#F9FAFB", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 380 }}>
          <svg width={48} height={48} viewBox="0 0 48 48" fill="none" aria-hidden="true" style={{ margin: "0 auto 16px" }}>
            <circle cx={24} cy={24} r={22} stroke="#E5E7EB" strokeWidth={2} />
            <path d="M24 14v12" stroke="#9CA3AF" strokeWidth={2.5} strokeLinecap="round" />
            <circle cx={24} cy={33} r={1.5} fill="#9CA3AF" />
          </svg>
          <p style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 600, color: "#374151" }}>Play not found</p>
          <p style={{ margin: 0, fontSize: 14, color: "#9CA3AF" }}>This share link may have expired or been deleted.</p>
        </div>
      </main>
    );
  }

  const hasMultipleSteps = steps.length > 1;
  const hasMultipleScenes = scenes.length > 1;

  return (
    <main style={{ minHeight: "100vh", background: "#F9FAFB", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <header style={{ background: "#fff", borderBottom: "1px solid #E5E7EB", padding: "0 20px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 52, gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx={12} cy={12} r={10} fill="#F97316" />
            <line x1={12} y1={2} x2={12} y2={22} stroke="#fff" strokeWidth={1.5} />
            <line x1={2} y1={12} x2={22} y2={12} stroke="#fff" strokeWidth={1.5} />
          </svg>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>{play.title}</span>
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 99, background: "#EEF2FF", color: "#4338CA", letterSpacing: "0.03em" }}>
          READ-ONLY
        </span>
      </header>

      {/* Scene note */}
      {scene?.note && (
        <div style={{ background: "#fff", borderBottom: "1px solid #F3F4F6", padding: "8px 20px" }}>
          <p style={{ margin: 0, fontSize: 13, color: "#6B7280" }}>{scene.note}</p>
        </div>
      )}

      {/* Court */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px", background: "#F3F4F6" }}>
        {scene ? (
          <CourtWithPlayers
            sceneId={scene.id}
            scene={scene}
            variant={(play.courtType ?? "half") as CourtVariant}
            className="w-full max-w-xl pointer-events-none"
            readOnly
            flipped={effectiveFlipped}
            activeStep={currentStep}
          />
        ) : (
          <p style={{ color: "#9CA3AF", fontSize: 14 }}>No scenes in this play.</p>
        )}
      </div>

      {/* Controls bar */}
      <div style={{ background: "#fff", borderTop: "1px solid #E5E7EB", padding: "12px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>

        {/* Step controls */}
        {hasMultipleSteps && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={() => stepBy(-1)}
              disabled={prevStep === undefined}
              aria-label="Previous step"
              style={{ padding: "5px 10px", borderRadius: 6, border: "1.5px solid #E5E7EB", background: "#fff", color: prevStep === undefined ? "#D1D5DB" : "#374151", cursor: prevStep === undefined ? "default" : "pointer", display: "flex", alignItems: "center", gap: 4 }}
            >
              <ChevronLeftIcon size={14} /> Step
            </button>

            <button
              onClick={togglePlay}
              aria-label={isPlaying ? "Pause" : "Play steps"}
              style={{ padding: "6px 14px", borderRadius: 6, border: "none", background: "#1E3A5F", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
            >
              {isPlaying ? <PauseIcon /> : <PlayIcon />}
              {isPlaying ? "Pause" : "Play"}
            </button>

            <button
              onClick={() => stepBy(1)}
              disabled={nextStep === undefined}
              aria-label="Next step"
              style={{ padding: "5px 10px", borderRadius: 6, border: "1.5px solid #E5E7EB", background: "#fff", color: nextStep === undefined ? "#D1D5DB" : "#374151", cursor: nextStep === undefined ? "default" : "pointer", display: "flex", alignItems: "center", gap: 4 }}
            >
              Step <ChevronRightIcon size={14} />
            </button>

            <span style={{ fontSize: 12, color: "#9CA3AF", minWidth: 54, textAlign: "center" }}>
              Step {stepIndex + 1} / {steps.length}
            </span>
          </div>
        )}

        {/* Scene navigation */}
        {hasMultipleScenes && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* Go to beginning */}
            <button
              onClick={goToBeginning}
              disabled={atStart}
              aria-label="Go to beginning"
              title="Go to beginning"
              style={{ padding: "6px 10px", borderRadius: 8, border: "1.5px solid #E5E7EB", background: "#fff", fontSize: 13, fontWeight: 500, color: atStart ? "#D1D5DB" : "#374151", cursor: atStart ? "default" : "pointer" }}
            >
              ⏮
            </button>

            <button
              onClick={() => sceneBy(-1)}
              disabled={sceneIndex === 0}
              aria-label="Previous scene"
              style={{ padding: "6px 16px", borderRadius: 8, border: "1.5px solid #E5E7EB", background: "#fff", fontSize: 13, fontWeight: 500, color: sceneIndex === 0 ? "#D1D5DB" : "#374151", cursor: sceneIndex === 0 ? "default" : "pointer" }}
            >
              ← Prev scene
            </button>

            {/* Scene dots */}
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {scenes.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => goToScene(i)}
                  aria-label={`Scene ${i + 1}${s.note ? ` — ${s.note}` : ""}`}
                  style={{ width: i === sceneIndex ? 22 : 8, height: 8, borderRadius: 4, background: i === sceneIndex ? "#1E3A5F" : "#D1D5DB", border: "none", cursor: "pointer", padding: 0, transition: "width 0.2s, background 0.2s" }}
                />
              ))}
            </div>

            <button
              onClick={() => sceneBy(1)}
              disabled={sceneIndex >= scenes.length - 1}
              aria-label="Next scene"
              style={{ padding: "6px 16px", borderRadius: 8, border: "1.5px solid #E5E7EB", background: "#fff", fontSize: 13, fontWeight: 500, color: sceneIndex >= scenes.length - 1 ? "#D1D5DB" : "#374151", cursor: sceneIndex >= scenes.length - 1 ? "default" : "pointer" }}
            >
              Next scene →
            </button>
          </div>
        )}

        {/* Speed control */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, color: "#9CA3AF", marginRight: 2 }}>Speed</span>
          {([0.5, 1, 1.5, 2] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              aria-pressed={speed === s}
              style={{
                padding: "3px 9px",
                borderRadius: 99,
                border: speed === s ? "1.5px solid #1E3A5F" : "1.5px solid #E5E7EB",
                background: speed === s ? "#1E3A5F" : "#fff",
                color: speed === s ? "#fff" : "#6B7280",
                fontSize: 11,
                fontWeight: speed === s ? 700 : 400,
                cursor: "pointer",
              }}
            >
              {s}×
            </button>
          ))}
        </div>

        {/* Keyboard hint */}
        <p style={{ margin: 0, fontSize: 11, color: "#C4C4C4" }}>
          Space: play/pause · ← →: step · [ ]: scene · Home: restart
        </p>
      </div>
    </main>
  );
}
