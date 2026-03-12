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

import { useEffect, useState, useCallback, useRef } from "react";
import { loadSharedPlay } from "@/lib/team";
import type { Play, Scene } from "@/lib/types";
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
// Helpers
// ---------------------------------------------------------------------------

function getSortedSteps(scene: Scene): number[] {
  return [...scene.timingGroups]
    .sort((a, b) => a.step - b.step)
    .map((g) => g.step);
}

function getStepDuration(scene: Scene, step: number): number {
  return scene.timingGroups.find((g) => g.step === step)?.duration ?? 1000;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SharedPlayViewPage({ params }: SharedPlayViewPageProps) {
  const { shareToken } = params;
  const [play, setPlay] = useState<Play | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [sceneIndex, setSceneIndex] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const rafRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playStateRef = useRef(false);

  useEffect(() => {
    loadSharedPlay(shareToken)
      .then((p) => {
        if (p) setPlay(p);
        else setNotFound(true);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [shareToken]);

  // Sort scenes once
  const scenes = play ? [...play.scenes].sort((a, b) => a.order - b.order) : [];
  const scene = scenes[sceneIndex] ?? null;
  const steps = scene ? getSortedSteps(scene) : [];
  const currentStep = steps[stepIndex] ?? steps[0] ?? 1;

  // Sync playStateRef
  useEffect(() => { playStateRef.current = isPlaying; }, [isPlaying]);

  // Auto-advance through steps when playing
  const scheduleNext = useCallback(() => {
    if (!scene || !playStateRef.current) return;
    const duration = getStepDuration(scene, steps[stepIndex]);
    rafRef.current = setTimeout(() => {
      if (!playStateRef.current) return;
      setStepIndex((si) => {
        const nextSi = si + 1;
        if (nextSi < steps.length) {
          return nextSi;
        }
        // Advance to next scene or stop
        setSceneIndex((sci) => {
          const nextSci = sci + 1;
          if (nextSci < scenes.length) {
            setStepIndex(0);
            return nextSci;
          }
          // End of play — stop
          setIsPlaying(false);
          playStateRef.current = false;
          return sci;
        });
        return 0;
      });
    }, duration);
  }, [scene, steps, stepIndex, scenes.length]);

  useEffect(() => {
    if (isPlaying) scheduleNext();
    return () => { if (rafRef.current) clearTimeout(rafRef.current); };
  }, [isPlaying, stepIndex, sceneIndex, scheduleNext]);

  // Reset step when scene changes
  useEffect(() => { setStepIndex(0); }, [sceneIndex]);

  // Keyboard shortcuts
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.code === "Space") {
        e.preventDefault();
        setIsPlaying((v) => !v);
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        setIsPlaying(false);
        setStepIndex((si) => Math.min(si + 1, steps.length - 1));
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        setIsPlaying(false);
        setStepIndex((si) => Math.max(si - 1, 0));
      } else if (e.code === "Home") {
        e.preventDefault();
        setIsPlaying(false);
        setSceneIndex(0);
        setStepIndex(0);
      } else if (e.code === "BracketLeft") {
        e.preventDefault();
        setIsPlaying(false);
        setSceneIndex((i) => Math.max(0, i - 1));
      } else if (e.code === "BracketRight") {
        e.preventDefault();
        setIsPlaying(false);
        setSceneIndex((i) => Math.min(scenes.length - 1, i + 1));
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [steps.length, scenes.length]);

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
              onClick={() => { setIsPlaying(false); setStepIndex((i) => Math.max(0, i - 1)); }}
              disabled={stepIndex === 0}
              aria-label="Previous step"
              style={{ padding: "5px 10px", borderRadius: 6, border: "1.5px solid #E5E7EB", background: "#fff", color: stepIndex === 0 ? "#D1D5DB" : "#374151", cursor: stepIndex === 0 ? "default" : "pointer", display: "flex", alignItems: "center", gap: 4 }}
            >
              <ChevronLeftIcon size={14} /> Step
            </button>

            <button
              onClick={() => setIsPlaying((v) => !v)}
              aria-label={isPlaying ? "Pause" : "Play steps"}
              style={{ padding: "6px 14px", borderRadius: 6, border: "none", background: "#1E3A5F", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
            >
              {isPlaying ? <PauseIcon /> : <PlayIcon />}
              {isPlaying ? "Pause" : "Play"}
            </button>

            <button
              onClick={() => { setIsPlaying(false); setStepIndex((i) => Math.min(i + 1, steps.length - 1)); }}
              disabled={stepIndex >= steps.length - 1}
              aria-label="Next step"
              style={{ padding: "5px 10px", borderRadius: 6, border: "1.5px solid #E5E7EB", background: "#fff", color: stepIndex >= steps.length - 1 ? "#D1D5DB" : "#374151", cursor: stepIndex >= steps.length - 1 ? "default" : "pointer", display: "flex", alignItems: "center", gap: 4 }}
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
              onClick={() => { setIsPlaying(false); setSceneIndex(0); setStepIndex(0); }}
              disabled={sceneIndex === 0 && stepIndex === 0}
              aria-label="Go to beginning"
              title="Go to beginning"
              style={{ padding: "6px 10px", borderRadius: 8, border: "1.5px solid #E5E7EB", background: "#fff", fontSize: 13, fontWeight: 500, color: sceneIndex === 0 && stepIndex === 0 ? "#D1D5DB" : "#374151", cursor: sceneIndex === 0 && stepIndex === 0 ? "default" : "pointer" }}
            >
              ⏮
            </button>

            <button
              onClick={() => { setIsPlaying(false); setSceneIndex((i) => Math.max(0, i - 1)); }}
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
                  onClick={() => { setIsPlaying(false); setSceneIndex(i); }}
                  aria-label={`Scene ${i + 1}${s.note ? ` — ${s.note}` : ""}`}
                  style={{ width: i === sceneIndex ? 22 : 8, height: 8, borderRadius: 4, background: i === sceneIndex ? "#1E3A5F" : "#D1D5DB", border: "none", cursor: "pointer", padding: 0, transition: "width 0.2s, background 0.2s" }}
                />
              ))}
            </div>

            <button
              onClick={() => { setIsPlaying(false); setSceneIndex((i) => Math.min(scenes.length - 1, i + 1)); }}
              disabled={sceneIndex >= scenes.length - 1}
              aria-label="Next scene"
              style={{ padding: "6px 16px", borderRadius: 8, border: "1.5px solid #E5E7EB", background: "#fff", fontSize: 13, fontWeight: 500, color: sceneIndex >= scenes.length - 1 ? "#D1D5DB" : "#374151", cursor: sceneIndex >= scenes.length - 1 ? "default" : "pointer" }}
            >
              Next scene →
            </button>
          </div>
        )}

        {/* Keyboard hint */}
        <p style={{ margin: 0, fontSize: 11, color: "#C4C4C4" }}>
          Space: play/pause · ← →: step · [ ]: scene · Home: restart
        </p>
      </div>
    </main>
  );
}
