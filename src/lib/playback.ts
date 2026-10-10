/**
 * Playback engine — the one place that decides when playback advances.
 *
 * Implements issue #160: one playback engine instead of three loops.
 *
 * Architecture:
 *   - Pure functions: no React, no timers, no store.
 *   - `tickPlayback` is a reducer: given a position, the elapsed wall-clock
 *     time and the play's scenes, it returns the next position (or "ended").
 *   - The editor / presentation mode drive it from a single rAF hook
 *     (`usePlaybackEngine`) against the Zustand store; the public share
 *     viewer drives it against its own local state.
 *
 * Rules (shared by every consumer):
 *   - `sceneIndex` indexes the `scenes` array exactly as given. The store keeps
 *     `currentPlay.scenes` in `order` order (every scene mutation renumbers
 *     `order` to the array index), so callers must not re-sort before indexing.
 *   - Timing groups are walked in ascending `step` order.
 *   - A step lasts `duration > 0 ? duration : 1000` ms, divided by speed.
 *   - Time left over when a step completes is carried into the next step, so
 *     step changes do not drift by a frame each.
 *   - At most one step is advanced per tick: a long frame never skips a step.
 */

/** Duration used for a step whose stored duration is missing or not positive. */
export const DEFAULT_STEP_DURATION_MS = 1000;

/** Minimal structural shape of a timing group the engine needs. */
export interface PlaybackTimingGroup {
  step: number;
  duration: number;
}

/** Minimal structural shape of a scene the engine needs (`Scene` satisfies it). */
export interface PlaybackScene {
  timingGroups: readonly PlaybackTimingGroup[];
}

export interface PlaybackPosition {
  /** Index into the `scenes` array passed to `tickPlayback`. */
  sceneIndex: number;
  /** Active timing step number (a `TimingGroup.step`, not an array index). */
  step: number;
  /** Speed-scaled ms already spent in the current step. */
  accMs: number;
}

export interface PlaybackOptions {
  scenes: readonly PlaybackScene[];
  /** Playback speed multiplier (1 = real time). */
  speed: number;
  /** Wrap to the first scene after the last step instead of ending. */
  loop: boolean;
}

export interface PlaybackTick {
  state: PlaybackPosition;
  /** True when `sceneIndex` or `step` differ from the input state. */
  changed: boolean;
  /** True when the last step of the last scene has finished (and loop is off). */
  ended: boolean;
}

/** How long a timing step is held, in ms at 1x speed. */
export function stepDurationMs(group: { duration: number } | undefined): number {
  return group && group.duration > 0 ? group.duration : DEFAULT_STEP_DURATION_MS;
}

function sortedGroups(scene: PlaybackScene | undefined): PlaybackTimingGroup[] {
  return scene ? [...scene.timingGroups].sort((a, b) => a.step - b.step) : [];
}

/** Step numbers of a scene in playback order. */
export function sortedSteps(scene: PlaybackScene | undefined): number[] {
  return sortedGroups(scene).map((g) => g.step);
}

/** The step a scene starts on (1 when it has no timing groups). */
export function firstStepOf(scene: PlaybackScene | undefined): number {
  return sortedSteps(scene)[0] ?? 1;
}

/** The step a scene ends on (1 when it has no timing groups). */
export function lastStepOf(scene: PlaybackScene | undefined): number {
  const steps = sortedSteps(scene);
  return steps[steps.length - 1] ?? 1;
}

/**
 * Advance playback by `dtMs` of wall-clock time.
 *
 * @param state - Current position and accumulated time.
 * @param dtMs  - Wall-clock ms since the previous tick (unscaled).
 * @param opts  - Scenes, speed and loop flag.
 */
export function tickPlayback(
  state: PlaybackPosition,
  dtMs: number,
  opts: PlaybackOptions,
): PlaybackTick {
  const { scenes, speed, loop } = opts;
  const scene = scenes[state.sceneIndex];
  if (!scene) {
    return { state: { ...state, accMs: 0 }, changed: false, ended: true };
  }

  const groups = sortedGroups(scene);
  const stepIndex = groups.findIndex((g) => g.step === state.step);
  const duration = stepDurationMs(groups[stepIndex]);
  const accMs = state.accMs + dtMs * speed;

  if (accMs < duration) {
    return { state: { ...state, accMs }, changed: false, ended: false };
  }

  const remainder = accMs - duration;

  // Next step within the scene. An unknown step (index -1) recovers onto the first.
  if (stepIndex < groups.length - 1) {
    return {
      state: { sceneIndex: state.sceneIndex, step: groups[stepIndex + 1].step, accMs: remainder },
      changed: true,
      ended: false,
    };
  }

  // Last step of the scene — next scene, loop, or end of play.
  let nextSceneIndex = state.sceneIndex + 1;
  if (nextSceneIndex >= scenes.length) {
    if (!loop) {
      return { state: { ...state, accMs: 0 }, changed: false, ended: true };
    }
    nextSceneIndex = 0;
  }
  const nextStep = firstStepOf(scenes[nextSceneIndex]);
  return {
    state: { sceneIndex: nextSceneIndex, step: nextStep, accMs: remainder },
    changed: nextSceneIndex !== state.sceneIndex || nextStep !== state.step,
    ended: false,
  };
}
