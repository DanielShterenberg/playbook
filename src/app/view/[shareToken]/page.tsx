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

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import Logo from "@/components/brand/Logo";
import ThemeToggle from "@/components/brand/ThemeToggle";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { loadSharedPlay } from "@/lib/team";
import type { Category, Play } from "@/lib/types";
import {
  tickPlayback,
  sortedTimingGroups,
  nextStepAfter,
  prevStepBefore,
  firstStepOf,
  startPosition,
  isAtStart,
  isAtEnd,
  sceneProgress,
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
// Display helpers
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<Category, string> = {
  offense: "Offense",
  defense: "Defense",
  inbound: "Inbound",
  "press-break": "Press Break",
  "fast-break": "Fast Break",
  oob: "Out of Bounds",
  special: "Special",
};

/** Playback speeds offered, as in the approved mockup. */
const SPEEDS = [0.5, 1, 2] as const;

/** Notes up to this length are shown as the scene's name next to "Scene n of m". */
const SCENE_NAME_MAX = 28;

const ROUND_BUTTON =
  "flex h-11 w-11 flex-none items-center justify-center rounded-full border border-line bg-surface text-ink transition-colors hover:bg-app disabled:cursor-default disabled:opacity-40 disabled:hover:bg-surface";

const STEP_BUTTON =
  "flex h-11 items-center gap-1 rounded-lg border border-line bg-surface px-3.5 text-[13px] font-medium text-ink transition-colors hover:bg-app disabled:cursor-default disabled:opacity-40 disabled:hover:bg-surface";

// ---------------------------------------------------------------------------
// Icon helpers
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

function PrevSceneIcon() {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="currentColor" aria-hidden="true">
      <path d="M6 5h2v14H6zM20 5v14L9 12z" />
    </svg>
  );
}

function NextSceneIcon() {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="currentColor" aria-hidden="true">
      <path d="M16 5h2v14h-2zM4 5v14l11-7z" />
    </svg>
  );
}

function RestartIcon() {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 4v5h5" />
      <path d="M3.5 9a9 9 0 1 1-.4 5" />
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
// Header (shared by the viewer and its loading / not-found states)
// ---------------------------------------------------------------------------

function ViewerHeader() {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  // Signed-in viewers go to their playbook; others sign in and come back here.
  const link = user
    ? { href: "/playbook", label: "My playbook" }
    : { href: `/sign-in?redirect=${encodeURIComponent(pathname ?? "/playbook")}`, label: "Sign in" };
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface px-4 py-2.5 sm:px-6">
      <div className="flex flex-1 items-center">
        <Logo />
      </div>
      <ThemeToggle />
      {!loading && (
        <Link
          href={link.href}
          className="flex h-11 flex-none items-center rounded-lg border border-line px-4 text-sm font-medium text-ink no-underline transition-colors hover:bg-app"
        >
          {link.label}
        </Link>
      )}
    </header>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SharedPlayViewPage({ params }: SharedPlayViewPageProps) {
  const { shareToken } = params;
  const [play, setPlay] = useState<Play | null>(null);
  const [teamName, setTeamName] = useState<string | null>(null);
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
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);

  // The one playback position (scene, step, time spent in the step). It lives
  // in a ref because the time changes on every animation frame; `shown` is the
  // snapshot of it that is rendered. Both are only ever written by `moveTo`,
  // together, so there is nothing to reconcile — everything else is derived.
  const positionRef = useRef<PlaybackPosition>({ sceneIndex: 0, step: 1, accMs: 0 });
  const [shown, setShown] = useState({ sceneIndex: 0, step: 1 });
  // The progress bar follows the position on every frame without a re-render:
  // the current scene's segment reads its width from a CSS variable on the bar.
  const progressBarRef = useRef<HTMLDivElement>(null);
  const scenesRef = useRef<Play["scenes"]>([]);
  const paintProgress = useCallback((position: PlaybackPosition, ended = false) => {
    const scene = scenesRef.current[position.sceneIndex];
    const progress = ended ? 1 : sceneProgress(scene, position.step, position.accMs);
    progressBarRef.current?.style.setProperty("--scene-progress", String(progress));
  }, []);
  const moveTo = useCallback((next: PlaybackPosition, ended = false) => {
    const prev = positionRef.current;
    positionRef.current = next;
    paintProgress(next, ended);
    // Most ticks only add time; re-render only when the scene or step changes.
    if (prev.sceneIndex !== next.sceneIndex || prev.step !== next.step) {
      setShown({ sceneIndex: next.sceneIndex, step: next.step });
    }
  }, [paintProgress]);

  useEffect(() => {
    loadSharedPlay(shareToken)
      .then((shared) => {
        // Same normalisation as the editor store applies on load: scenes in
        // `order` order, timing steps renumbered 1..n (legacy snapshots can
        // carry gaps or duplicate step numbers).
        if (shared) {
          setPlay(normalizePlayForPlayback(shared.play));
          setTeamName(shared.teamName);
        } else setNotFound(true);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [shareToken]);

  const scenes = useMemo(() => play?.scenes ?? [], [play]);
  // The bar mounts with the play and again when the scene count changes; paint it then.
  useEffect(() => {
    scenesRef.current = scenes;
    paintProgress(positionRef.current);
  }, [scenes, paintProgress]);
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
    // The play ran out: the last segment shows full, not the start of its last step.
    moveTo(result.state, result.ended);
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
      // Space on a focused control (theme toggle, links, the buttons below)
      // activates that control; it must not also toggle playback.
      const onControl = e.target instanceof Element && e.target.closest("button, a, input, select, textarea") !== null;
      if (e.code === "Space" && onControl) return;
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
      <main className="flex min-h-screen flex-col bg-app text-ink">
        <ViewerHeader />
        <div className="flex flex-1 items-center justify-center gap-2.5 p-6 text-[15px] text-muted" role="status">
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden="true" className="animate-spin">
            <circle cx={12} cy={12} r={10} stroke="currentColor" strokeWidth={3} strokeDasharray="31 31" strokeLinecap="round" />
          </svg>
          Loading play…
        </div>
      </main>
    );
  }

  if (notFound || !play) {
    return (
      <main className="flex min-h-screen flex-col bg-app text-ink">
        <ViewerHeader />
        <div className="flex flex-1 items-center justify-center px-4 py-6">
          <div className="w-full max-w-[400px] rounded-xl border border-line bg-surface px-6 py-9 text-center">
            <svg width={48} height={48} viewBox="0 0 48 48" fill="none" aria-hidden="true" className="mx-auto mb-4 text-muted">
              <circle cx={24} cy={24} r={22} stroke="var(--color-line)" strokeWidth={2} />
              <path d="M24 14v12" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
              <circle cx={24} cy={33} r={1.5} fill="currentColor" />
            </svg>
            <h1 className="m-0 mb-1.5 font-display text-2xl font-bold uppercase tracking-[0.03em] text-ink">Play not found</h1>
            <p className="m-0 text-sm text-muted">This share link may have expired or been deleted.</p>
          </div>
        </div>
      </main>
    );
  }

  const hasMultipleSteps = steps.length > 1;
  const hasMultipleScenes = scenes.length > 1;
  const sceneCountLabel = `${scenes.length} ${scenes.length === 1 ? "scene" : "scenes"}`;
  const categoryLabel = CATEGORY_LABELS[play.category];
  // A short note is the scene's name ("Scene 2 of 4 · Flare"); a longer one is
  // a description and goes under the controls instead.
  const note = scene?.note.trim() ?? "";
  const sceneName = note.length <= SCENE_NAME_MAX ? note : "";

  return (
    <main className="flex min-h-screen flex-col bg-app text-sm text-ink">
      <ViewerHeader />

      <div className="mx-auto flex w-full max-w-[760px] flex-1 flex-col items-center gap-[18px] px-4 py-7 sm:px-6">
        {/* Title + meta */}
        <div className="flex max-w-full flex-col items-center gap-1 text-center">
          <h1 dir="auto" className="m-0 max-w-full break-words font-display text-[34px] font-bold uppercase leading-tight tracking-[0.03em]">
            {play.title}
          </h1>
          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-muted">
            <span>
              {teamName && (
                <>
                  <span dir="auto">{teamName}</span>
                  {" · "}
                </>
              )}
              {categoryLabel ? `${categoryLabel} · ` : ""}{sceneCountLabel}
            </span>
            <span className="whitespace-nowrap rounded-full bg-chip px-2.5 py-0.5 font-display text-xs font-semibold uppercase tracking-[0.06em] text-ink">
              Read-only
            </span>
          </div>
        </div>

        {/* Court */}
        {scene ? (
          <CourtWithPlayers
            sceneId={scene.id}
            scene={scene}
            variant={(play.courtType ?? "half") as CourtVariant}
            className="w-full max-w-[620px] pointer-events-none"
            readOnly
            flipped={effectiveFlipped}
            activeStep={currentStep}
          />
        ) : (
          <p className="m-0 py-10 text-muted">No scenes in this play.</p>
        )}

        {/* Control card */}
        <div className="flex w-full max-w-[620px] flex-col gap-3.5 rounded-xl border border-line bg-surface p-4">
          {/* Progress: one segment per scene; the current one fills as its steps play */}
          {hasMultipleScenes && (
            <div
              ref={progressBarRef}
              className="-my-[19px] grid gap-1.5"
              style={{ gridTemplateColumns: `repeat(${scenes.length}, minmax(0, 1fr))` }}
            >
              {scenes.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => goToScene(i)}
                  aria-label={`Scene ${i + 1}${s.note ? ` — ${s.note}` : ""}`}
                  aria-current={i === sceneIndex ? "step" : undefined}
                  className="flex h-11 items-center"
                >
                  <span className="relative block h-1.5 w-full overflow-hidden rounded-[3px] bg-line">
                    <span
                      className="absolute inset-y-0 left-0 rounded-[3px] bg-accent"
                      style={{
                        width: i < sceneIndex ? "100%" : i === sceneIndex ? "calc(var(--scene-progress, 0) * 100%)" : "0%",
                      }}
                    />
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Transport */}
          <div className="relative flex flex-wrap items-center justify-center gap-3">
            {hasMultipleScenes && (
              <>
                <button type="button" onClick={goToBeginning} disabled={atStart} aria-label="Go to beginning" title="Go to beginning" className={ROUND_BUTTON}>
                  <RestartIcon />
                </button>
                <button type="button" onClick={() => sceneBy(-1)} disabled={sceneIndex === 0} aria-label="Previous scene" title="Previous scene" className={ROUND_BUTTON}>
                  <PrevSceneIcon />
                </button>
              </>
            )}

            {(hasMultipleSteps || hasMultipleScenes) && (
              <button
                type="button"
                onClick={togglePlay}
                aria-label={isPlaying ? "Pause" : "Play steps"}
                className="flex h-14 w-14 flex-none items-center justify-center rounded-full bg-accent text-accent-ink transition-opacity hover:opacity-90"
              >
                {isPlaying ? <PauseIcon /> : <PlayIcon />}
              </button>
            )}

            {hasMultipleScenes && (
              <button type="button" onClick={() => sceneBy(1)} disabled={sceneIndex >= scenes.length - 1} aria-label="Next scene" title="Next scene" className={ROUND_BUTTON}>
                <NextSceneIcon />
              </button>
            )}

            {scenes.length > 0 && (
              <span className="max-w-full tabular-nums text-muted">
                Scene {sceneIndex + 1} of {scenes.length}
                {sceneName && (
                  <>
                    {" · "}
                    <span dir="auto">{sceneName}</span>
                  </>
                )}
              </span>
            )}

            {/* Speed control */}
            <div role="group" aria-label="Playback speed" className="flex overflow-hidden rounded-lg border border-line">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSpeed(s)}
                  aria-pressed={speed === s}
                  aria-label={`Speed ${s}x`}
                  className={`h-11 min-w-11 px-3 text-[13px] transition-colors ${
                    speed === s ? "bg-chip font-semibold text-ink" : "bg-transparent text-muted hover:text-ink"
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>

          {/* Step controls */}
          {hasMultipleSteps && (
            <div className="flex flex-wrap items-center justify-center gap-3 border-t border-line pt-3.5">
              <button type="button" onClick={() => stepBy(-1)} disabled={prevStep === undefined} aria-label="Previous step" className={STEP_BUTTON}>
                <ChevronLeftIcon size={14} /> Step
              </button>
              <span className="min-w-[72px] text-center tabular-nums text-muted">
                Step {stepIndex + 1} / {steps.length}
              </span>
              <button type="button" onClick={() => stepBy(1)} disabled={nextStep === undefined} aria-label="Next step" className={STEP_BUTTON}>
                Step <ChevronRightIcon size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Scene description (a note too long to be the scene's name) */}
        {note && !sceneName && (
          <p dir="auto" className="m-0 max-w-[620px] whitespace-pre-line break-words text-center leading-normal text-muted">
            {note}
          </p>
        )}

        {/* Keyboard hint */}
        <p className="m-0 text-center text-xs text-muted">
          Space: play/pause · ← →: step · [ ]: scene · Home: restart
        </p>
      </div>
    </main>
  );
}
