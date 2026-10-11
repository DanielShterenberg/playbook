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
 *     `currentPlay.scenes` in `order` order (`setCurrentPlay` sorts on load via
 *     `normalizePlayForPlayback`; every scene mutation renumbers `order` to the
 *     array index), so callers must not re-sort before indexing.
 *   - Timing groups are walked in ascending `step` order; the next step is
 *     always a strictly higher step number, so malformed data (duplicate or
 *     unknown steps) can never stall or loop playback.
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

const EMPTY_GROUPS: readonly never[] = [];

/** Sorted copies, keyed by the (immutably updated) `timingGroups` array they were built from. */
const sortedGroupsCache = new WeakMap<object, readonly PlaybackTimingGroup[]>();

/**
 * A scene's timing groups in playback (ascending `step`) order.
 *
 * Memoized per `timingGroups` array: the store replaces that array on every
 * edit, so the engine can call this on every animation frame without
 * allocating. The returned array must not be mutated.
 */
export function sortedTimingGroups<G extends PlaybackTimingGroup>(
  scene: { timingGroups: readonly G[] } | null | undefined,
): readonly G[] {
  if (!scene) return EMPTY_GROUPS;
  const groups = scene.timingGroups;
  let sorted = sortedGroupsCache.get(groups) as readonly G[] | undefined;
  if (!sorted) {
    sorted = [...groups].sort((a, b) => a.step - b.step);
    sortedGroupsCache.set(groups, sorted);
  }
  return sorted;
}

/** The step a scene starts on (1 when it has no timing groups). */
export function firstStepOf(scene: PlaybackScene | null | undefined): number {
  return sortedTimingGroups(scene)[0]?.step ?? 1;
}

/** The step a scene ends on (1 when it has no timing groups). */
export function lastStepOf(scene: PlaybackScene | null | undefined): number {
  const groups = sortedTimingGroups(scene);
  return groups[groups.length - 1]?.step ?? 1;
}

/**
 * The step that follows `step` in a scene: the lowest step number strictly
 * greater than it, or undefined at the end of the scene. Being strictly
 * increasing is what guarantees playback terminates on malformed data
 * (duplicate or unknown step numbers).
 */
export function nextStepAfter(scene: PlaybackScene | null | undefined, step: number): number | undefined {
  const groups = sortedTimingGroups(scene);
  for (let i = 0; i < groups.length; i++) {
    if (groups[i].step > step) return groups[i].step;
  }
  return undefined;
}

/**
 * The step that precedes `step` in a scene: the highest step number strictly
 * below it, or undefined at the start of the scene. Mirror of `nextStepAfter`.
 */
export function prevStepBefore(scene: PlaybackScene | null | undefined, step: number): number | undefined {
  const groups = sortedTimingGroups(scene);
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i].step < step) return groups[i].step;
  }
  return undefined;
}

/** Where a play starts: first step of the first scene, no time elapsed. */
export function startPosition(scenes: readonly PlaybackScene[]): PlaybackPosition {
  return { sceneIndex: 0, step: firstStepOf(scenes[0]), accMs: 0 };
}

/** True on the last step of the last scene — where playback ends when loop is off. */
export function isAtEnd(
  position: { sceneIndex: number; step: number },
  scenes: readonly PlaybackScene[],
): boolean {
  if (scenes.length === 0 || position.sceneIndex !== scenes.length - 1) return false;
  return nextStepAfter(scenes[position.sceneIndex], position.step) === undefined;
}

/** True on the first step of the first scene — nothing to step back to. */
export function isAtStart(
  position: { sceneIndex: number; step: number },
  scenes: readonly PlaybackScene[],
): boolean {
  if (scenes.length === 0 || position.sceneIndex !== 0) return false;
  return prevStepBefore(scenes[0], position.step) === undefined;
}

// ---------------------------------------------------------------------------
// Normalisation on load
// ---------------------------------------------------------------------------

/**
 * Re-number timing steps 1..n in step order (ties keep their stored order),
 * so legacy data with gaps or duplicate step numbers plays every group once.
 * Does not mutate its input.
 */
export function normalizeTimingSteps<G extends { step: number }>(groups: readonly G[]): G[] {
  return [...groups]
    .sort((a, b) => a.step - b.step)
    .map((g, i) => ({ ...g, step: i + 1 }));
}

/**
 * Put a loaded play into the shape playback assumes: scenes in `order` order
 * with `order` renumbered to the array index (as every store scene mutation
 * does), and each scene's timing steps numbered 1..n. Applied by the store's
 * `setCurrentPlay` and by the share viewer, so every consumer agrees on the
 * sequence. Does not mutate its input.
 */
export function normalizePlayForPlayback<
  S extends { order: number; timingGroups: PlaybackTimingGroup[] },
  P extends { scenes: S[] },
>(play: P): P {
  return {
    ...play,
    scenes: [...play.scenes]
      .sort((a, b) => a.order - b.order)
      .map((sc, i) => ({ ...sc, order: i, timingGroups: normalizeTimingSteps(sc.timingGroups) })),
  };
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

/**
 * How far through its scene a position is, by time: 0 at the start of the
 * first step, approaching 1 as the last step runs out. Steps count by their
 * duration (stepDurationMs), so a long step fills the bar more slowly.
 * 0 when there is no scene. A view helper for progress bars — the reducer
 * below does not use it.
 */
export function sceneProgress(
  scene: PlaybackScene | null | undefined,
  step: number,
  accMs: number,
): number {
  if (!scene) return 0;
  const groups = sortedTimingGroups(scene);
  let total = 0;
  let before = 0;
  let current = DEFAULT_STEP_DURATION_MS;
  for (const g of groups) {
    const d = stepDurationMs(g);
    if (g.step < step) before += d;
    if (g.step === step) current = d;
    total += d;
  }
  // A scene with no steps is held for one default step (see tickPlayback).
  if (total <= 0) total = current;
  const elapsed = before + Math.min(Math.max(accMs, 0), current);
  return Math.min(elapsed / total, 1);
}

/**
 * Advance playback by `dtMs` of wall-clock time.
 *
 * Reports `ended` (never spins) when there is nothing to play: no scenes, or
 * a scene index out of range.
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

  const groups = sortedTimingGroups(scene);
  let current: PlaybackTimingGroup | undefined;
  for (let i = 0; i < groups.length; i++) {
    if (groups[i].step === state.step) { current = groups[i]; break; }
  }
  const duration = stepDurationMs(current);
  const accMs = state.accMs + dtMs * speed;

  if (accMs < duration) {
    return { state: { ...state, accMs }, changed: false, ended: false };
  }

  const remainder = accMs - duration;

  // Next step within the scene: always a strictly higher step number.
  const nextStep = nextStepAfter(scene, state.step);
  if (nextStep !== undefined) {
    return {
      state: { sceneIndex: state.sceneIndex, step: nextStep, accMs: remainder },
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
  const entryStep = firstStepOf(scenes[nextSceneIndex]);
  return {
    state: { sceneIndex: nextSceneIndex, step: entryStep, accMs: remainder },
    changed: nextSceneIndex !== state.sceneIndex || entryStep !== state.step,
    ended: false,
  };
}
