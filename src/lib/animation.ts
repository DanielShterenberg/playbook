/**
 * Animation engine for scene transitions and playback.
 *
 * Implements issue #65: Scene transition animation engine.
 *
 * Architecture:
 *   - Pure functions: no React, no side-effects.
 *   - `interpolateScene` blends two scenes at a given progress [0-1].
 *   - `buildPlaybackTimeline` converts a Play into a flat list of
 *     timed keyframes that the PlaybackController can step through.
 *   - The engine is decoupled from rendering and can be used for both
 *     live playback and PNG/GIF export.
 *
 * Coordinate system:
 *   - All positions are normalised [0-1] as stored in the Zustand store.
 */

import type { Play, Scene, PlayerState, BallState, Annotation } from "./types";

// ---------------------------------------------------------------------------
// Easing
// ---------------------------------------------------------------------------

/** Smooth ease-in-out curve (cubic). */
export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

/** Linear (no easing). */
export function linear(t: number): number {
  return t;
}

export type EasingFn = (t: number) => number;

// ---------------------------------------------------------------------------
// Interpolation helpers
// ---------------------------------------------------------------------------

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Interpolate a single PlayerState between two scenes. */
function interpolatePlayer(
  from: PlayerState,
  to: PlayerState,
  t: number,
  easing: EasingFn = easeInOut,
): PlayerState {
  const et = easing(t);
  return {
    position: from.position,
    x: lerp(from.x, to.x, et),
    y: lerp(from.y, to.y, et),
    visible: to.visible, // snap visibility to target
  };
}

/** Interpolate ball state between two scenes. */
function interpolateBall(from: BallState, to: BallState, t: number, easing: EasingFn = easeInOut): BallState {
  const et = easing(t);
  return {
    x: lerp(from.x, to.x, et),
    y: lerp(from.y, to.y, et),
    // Snap attachment at the midpoint
    attachedTo: t >= 0.5 ? to.attachedTo : from.attachedTo,
  };
}

// ---------------------------------------------------------------------------
// Scene interpolation
// ---------------------------------------------------------------------------

export interface InterpolatedScene {
  players: {
    offense: PlayerState[];
    defense: PlayerState[];
  };
  ball: BallState;
  /** Annotations visible at this instant (from the "from" scene). */
  annotations: Annotation[];
}

/**
 * Blend `fromScene` toward `toScene` at progress `t` ∈ [0, 1].
 *
 * @param fromScene - Starting scene.
 * @param toScene   - Ending scene.
 * @param t         - Progress value in [0, 1].
 * @param easing    - Easing function (defaults to ease-in-out).
 */
export function interpolateScene(
  fromScene: Scene,
  toScene: Scene,
  t: number,
  easing: EasingFn = easeInOut,
): InterpolatedScene {
  const offense = fromScene.players.offense.map((fromP) => {
    const toP = toScene.players.offense.find((p) => p.position === fromP.position);
    return toP ? interpolatePlayer(fromP, toP, t, easing) : fromP;
  });

  const defense = fromScene.players.defense.map((fromP) => {
    const toP = toScene.players.defense.find((p) => p.position === fromP.position);
    return toP ? interpolatePlayer(fromP, toP, t, easing) : fromP;
  });

  const ball = interpolateBall(fromScene.ball, toScene.ball, t, easing);

  // During transition, show annotations from the source scene
  const annotations = fromScene.timingGroups.flatMap((g) => g.annotations);

  return { players: { offense, defense }, ball, annotations };
}

// ---------------------------------------------------------------------------
// Playback timeline
// ---------------------------------------------------------------------------

export type FrameKind =
  | "scene-hold"       // scene is fully settled; annotations are playing
  | "scene-transition" // interpolating between two scenes
  | "step-hold";       // within a scene, holding on a timing step

export interface TimelineFrame {
  kind: FrameKind;
  /** Wall-clock start time in ms (relative to t=0). */
  startMs: number;
  /** Duration in ms. */
  durationMs: number;
  /** Index of the "current" scene (the one being displayed / transitioning from). */
  sceneIndex: number;
  /** For "scene-transition": index of the target scene. */
  toSceneIndex?: number;
  /** For "scene-hold" / "step-hold": which timing step is active. */
  timingStep?: number;
}

export interface PlaybackTimeline {
  frames: TimelineFrame[];
  /** Total duration of the full animation in ms. */
  totalMs: number;
}

/**
 * Build a flat timeline of frames from a Play.
 *
 * For each scene:
 *   1. Play timing groups in order (step-hold per group).
 *   2. Transition to the next scene (scene-transition for 500ms).
 *
 * @param play                    - The play to build a timeline for.
 * @param transitionDurationMs    - Duration of the between-scene interpolation.
 */
export function buildPlaybackTimeline(
  play: Play,
  transitionDurationMs: number = 500,
): PlaybackTimeline {
  const frames: TimelineFrame[] = [];
  let cursor = 0;

  for (let si = 0; si < play.scenes.length; si++) {
    const scene = play.scenes[si];
    const sortedGroups = [...scene.timingGroups].sort((a, b) => a.step - b.step);

    for (const group of sortedGroups) {
      const dur = group.duration > 0 ? group.duration : 1000;
      frames.push({
        kind: "step-hold",
        startMs: cursor,
        durationMs: dur,
        sceneIndex: si,
        timingStep: group.step,
      });
      cursor += dur;
    }

    // Transition to next scene
    if (si < play.scenes.length - 1) {
      frames.push({
        kind: "scene-transition",
        startMs: cursor,
        durationMs: transitionDurationMs,
        sceneIndex: si,
        toSceneIndex: si + 1,
      });
      cursor += transitionDurationMs;
    }
  }

  return { frames, totalMs: cursor };
}

// ---------------------------------------------------------------------------
// Resolve current frame at a given wall-clock position
// ---------------------------------------------------------------------------

export interface ResolvedFrame {
  frame: TimelineFrame;
  /** Progress within this frame [0, 1]. */
  progress: number;
  /** For "step-hold": annotations active at this step. */
  activeAnnotations: Annotation[];
  /** Interpolated scene state (players + ball). */
  scene: InterpolatedScene;
}

/**
 * Given a play, a flat timeline, and a current time in ms, resolve the
 * exact frame and interpolated scene state.
 */
export function resolveFrame(
  play: Play,
  timeline: PlaybackTimeline,
  currentMs: number,
  easing: EasingFn = easeInOut,
): ResolvedFrame | null {
  if (timeline.frames.length === 0) return null;

  const clampedMs = Math.max(0, Math.min(currentMs, timeline.totalMs));

  // Find the frame that contains `clampedMs`
  let frame = timeline.frames[timeline.frames.length - 1];
  for (const f of timeline.frames) {
    if (clampedMs < f.startMs + f.durationMs) {
      frame = f;
      break;
    }
  }

  const raw = (clampedMs - frame.startMs) / Math.max(frame.durationMs, 1);
  const progress = Math.max(0, Math.min(raw, 1));

  const fromScene = play.scenes[frame.sceneIndex];
  const toSceneIdx = frame.toSceneIndex ?? frame.sceneIndex;
  const toScene = play.scenes[toSceneIdx];

  const activeAnnotations =
    frame.kind === "step-hold" && frame.timingStep !== undefined
      ? (fromScene.timingGroups.find((g) => g.step === frame.timingStep)?.annotations ?? [])
      : fromScene.timingGroups.flatMap((g) => g.annotations);

  const interp = interpolateScene(fromScene, toScene, frame.kind === "scene-transition" ? easing(progress) : 0, linear);

  return {
    frame,
    progress,
    activeAnnotations,
    scene: interp,
  };
}

// ---------------------------------------------------------------------------
// Utility: total annotation draw progress for a step
// ---------------------------------------------------------------------------

/**
 * Given the step-hold progress [0-1] and a list of annotations,
 * returns for each annotation a draw progress [0-1] staggered over time.
 *
 * Each annotation draws in sequence, occupying an equal share of the step duration.
 */
export function annotationDrawProgress(
  annotations: Annotation[],
  stepProgress: number,
): number[] {
  if (annotations.length === 0) return [];
  const share = 1 / annotations.length;
  return annotations.map((_, i) => {
    const start = i * share;
    const end = (i + 1) * share;
    if (stepProgress <= start) return 0;
    if (stepProgress >= end) return 1;
    return (stepProgress - start) / share;
  });
}
