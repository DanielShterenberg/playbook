/**
 * Tests for playback.ts — the single, pure playback reducer (issue #160).
 *
 * The reducer replaces three independent loops (PlaybackControls,
 * PresentationOverlay, the share viewer). The rules pinned here:
 *   - the accumulator carries its remainder into the next step;
 *   - `sceneIndex` indexes the `scenes` array exactly as given (no re-sort);
 *   - step duration is `duration > 0 ? duration : 1000`;
 *   - at most one step is advanced per tick, so no step is ever skipped.
 */

import { describe, it, expect } from "vitest";
import {
  DEFAULT_STEP_DURATION_MS,
  stepDurationMs,
  sortedSteps,
  firstStepOf,
  lastStepOf,
  tickPlayback,
} from "@/lib/playback";
import type { PlaybackPosition, PlaybackScene } from "@/lib/playback";

const scene = (...groups: [step: number, duration: number][]): PlaybackScene => ({
  timingGroups: groups.map(([step, duration]) => ({ step, duration })),
});

/** 2 scenes: scene 0 has steps 1 (1000ms), 2 (500ms); scene 1 has steps 1 (800ms), 2 (1200ms), 3 (400ms). */
const SCENES: PlaybackScene[] = [
  scene([1, 1000], [2, 500]),
  scene([1, 800], [2, 1200], [3, 400]),
];

const at = (sceneIndex: number, step: number, accMs = 0): PlaybackPosition => ({ sceneIndex, step, accMs });
const opts = (over: Partial<{ scenes: PlaybackScene[]; speed: number; loop: boolean }> = {}) => ({
  scenes: SCENES,
  speed: 1,
  loop: false,
  ...over,
});

describe("stepDurationMs", () => {
  it("uses the group's duration when positive", () => {
    expect(stepDurationMs({ duration: 750 })).toBe(750);
  });

  it("falls back to 1000ms for zero, negative, NaN or a missing group", () => {
    expect(DEFAULT_STEP_DURATION_MS).toBe(1000);
    expect(stepDurationMs({ duration: 0 })).toBe(1000);
    expect(stepDurationMs({ duration: -5 })).toBe(1000);
    expect(stepDurationMs({ duration: NaN })).toBe(1000);
    expect(stepDurationMs(undefined)).toBe(1000);
  });
});

describe("step helpers", () => {
  it("sortedSteps orders by step number without mutating the scene", () => {
    const s = scene([3, 100], [1, 100], [2, 100]);
    expect(sortedSteps(s)).toEqual([1, 2, 3]);
    expect(s.timingGroups.map((g) => g.step)).toEqual([3, 1, 2]);
  });

  it("firstStepOf / lastStepOf default to 1 for an empty or missing scene", () => {
    expect(firstStepOf(scene([4, 100], [2, 100]))).toBe(2);
    expect(lastStepOf(scene([4, 100], [2, 100]))).toBe(4);
    expect(firstStepOf(scene())).toBe(1);
    expect(lastStepOf(scene())).toBe(1);
    expect(firstStepOf(undefined)).toBe(1);
    expect(lastStepOf(undefined)).toBe(1);
  });
});

describe("tickPlayback — within a step", () => {
  it("accumulates time without changing position while dt < duration", () => {
    const r = tickPlayback(at(0, 1), 400, opts());
    expect(r).toEqual({ state: at(0, 1, 400), changed: false, ended: false });
  });

  it("does not mutate the input state", () => {
    const state = at(0, 1, 100);
    tickPlayback(state, 5000, opts());
    expect(state).toEqual(at(0, 1, 100));
  });

  it("a zero dt (first animation frame) is a no-op", () => {
    const r = tickPlayback(at(0, 1, 250), 0, opts());
    expect(r).toEqual({ state: at(0, 1, 250), changed: false, ended: false });
  });
});

describe("tickPlayback — step advance", () => {
  it("advances exactly at the step duration with a zero remainder", () => {
    const r = tickPlayback(at(0, 1, 600), 400, opts());
    expect(r).toEqual({ state: at(0, 2, 0), changed: true, ended: false });
  });

  it("carries the remainder into the next step instead of resetting to 0", () => {
    const r = tickPlayback(at(0, 1, 990), 16, opts());
    expect(r.state).toEqual(at(0, 2, 6));
    expect(r.changed).toBe(true);
  });

  it("advances at most one step per tick, keeping the whole remainder", () => {
    // 2500ms in one tick: step 1 (1000ms) is consumed, 1500ms carried.
    const r1 = tickPlayback(at(0, 1), 2500, opts());
    expect(r1.state).toEqual(at(0, 2, 1500));
    // The next tick (even with dt 0) consumes step 2 (500ms): no step skipped.
    const r2 = tickPlayback(r1.state, 0, opts());
    expect(r2.state).toEqual(at(1, 1, 1000));
  });

  it("uses the 1000ms default for a zero-duration step", () => {
    const scenes = [scene([1, 0], [2, 300])];
    expect(tickPlayback(at(0, 1), 999, opts({ scenes })).changed).toBe(false);
    expect(tickPlayback(at(0, 1), 1000, opts({ scenes })).state).toEqual(at(0, 2, 0));
  });

  it("walks timing groups in step order even when stored unsorted", () => {
    const scenes = [scene([3, 100], [1, 100], [2, 100])];
    const r1 = tickPlayback(at(0, 1), 100, opts({ scenes }));
    expect(r1.state.step).toBe(2);
    const r2 = tickPlayback(r1.state, 100, opts({ scenes }));
    expect(r2.state.step).toBe(3);
  });

  it("handles non-contiguous step numbers", () => {
    const scenes = [scene([1, 100], [3, 100])];
    expect(tickPlayback(at(0, 1), 100, opts({ scenes })).state.step).toBe(3);
  });

  it("recovers from a step that does not exist in the scene: 1000ms, then the first step", () => {
    const r0 = tickPlayback(at(0, 9), 999, opts());
    expect(r0.changed).toBe(false);
    const r1 = tickPlayback(at(0, 9), 1000, opts());
    expect(r1.state).toEqual(at(0, 1, 0));
  });
});

describe("tickPlayback — speed", () => {
  it("scales elapsed time by speed", () => {
    expect(tickPlayback(at(0, 1), 499, opts({ speed: 2 })).changed).toBe(false);
    expect(tickPlayback(at(0, 1), 500, opts({ speed: 2 })).state).toEqual(at(0, 2, 0));
    expect(tickPlayback(at(0, 1), 1999, opts({ speed: 0.5 })).changed).toBe(false);
    expect(tickPlayback(at(0, 1), 2000, opts({ speed: 0.5 })).state).toEqual(at(0, 2, 0));
  });

  it("a speed change mid-step applies to the remaining time only", () => {
    // 500ms at 1x (half the step), then 2x: the other half takes 250ms of wall-clock.
    const half = tickPlayback(at(0, 1), 500, opts({ speed: 1 })).state;
    expect(tickPlayback(half, 249, opts({ speed: 2 })).changed).toBe(false);
    expect(tickPlayback(half, 250, opts({ speed: 2 })).state).toEqual(at(0, 2, 0));
  });
});

describe("tickPlayback — scene advance", () => {
  it("moves to the first step of the next scene after the last step", () => {
    const r = tickPlayback(at(0, 2, 450), 60, opts());
    expect(r).toEqual({ state: at(1, 1, 10), changed: true, ended: false });
  });

  it("enters the next scene on its lowest step number, not a hard-coded 1", () => {
    const scenes = [scene([1, 100]), scene([5, 100], [2, 100])];
    expect(tickPlayback(at(0, 1), 100, opts({ scenes })).state).toEqual(at(1, 2, 0));
  });

  it("indexes scenes as given — it never re-sorts them", () => {
    // Array order is authoritative; an `order` field on the scene is ignored.
    const a = { order: 1, ...scene([1, 100]) };
    const b = { order: 0, ...scene([7, 100]) };
    const r = tickPlayback(at(0, 1), 100, opts({ scenes: [a, b] }));
    expect(r.state).toEqual(at(1, 7, 0));
  });

  it("passes through a scene with no timing groups after the default duration", () => {
    const scenes = [scene(), scene([1, 100])];
    expect(tickPlayback(at(0, 1), 999, opts({ scenes })).changed).toBe(false);
    expect(tickPlayback(at(0, 1), 1000, opts({ scenes })).state).toEqual(at(1, 1, 0));
  });
});

describe("tickPlayback — end of play and loop", () => {
  it("ends after the last step of the last scene, holding position", () => {
    const r = tickPlayback(at(1, 3, 390), 20, opts());
    expect(r.ended).toBe(true);
    expect(r.changed).toBe(false);
    expect(r.state).toEqual(at(1, 3, 0));
  });

  it("does not end before the last step has run its full duration", () => {
    const r = tickPlayback(at(1, 3), 399, opts());
    expect(r.ended).toBe(false);
    expect(r.state).toEqual(at(1, 3, 399));
  });

  it("wraps to the first step of the first scene when loop is on", () => {
    const r = tickPlayback(at(1, 3, 390), 20, opts({ loop: true }));
    expect(r).toEqual({ state: at(0, 1, 10), changed: true, ended: false });
  });

  it("loops a single-step, single-scene play onto itself without ending", () => {
    const scenes = [scene([1, 100])];
    const r = tickPlayback(at(0, 1), 130, opts({ scenes, loop: true }));
    expect(r.ended).toBe(false);
    expect(r.state).toEqual(at(0, 1, 30));
  });

  it("ends immediately when there are no scenes or the scene index is out of range", () => {
    expect(tickPlayback(at(0, 1), 16, opts({ scenes: [] })).ended).toBe(true);
    expect(tickPlayback(at(5, 1), 16, opts()).ended).toBe(true);
    expect(tickPlayback(at(-1, 1), 16, opts()).ended).toBe(true);
  });
});

describe("tickPlayback — full run", () => {
  /** Drive the reducer at a fixed frame interval and record every position change with its time. */
  function run(frameMs: number, o: ReturnType<typeof opts>, maxMs = 20000) {
    let state = at(0, firstStepOf(o.scenes[0]));
    const visits: { t: number; scene: number; step: number }[] = [{ t: 0, scene: state.sceneIndex, step: state.step }];
    let t = 0;
    let ended = false;
    while (t < maxMs) {
      t += frameMs;
      const r = tickPlayback(state, frameMs, o);
      state = r.state;
      if (r.changed) visits.push({ t, scene: state.sceneIndex, step: state.step });
      if (r.ended) { ended = true; break; }
    }
    return { visits, ended, endT: t };
  }

  it("visits every step of every scene exactly once, in order, then ends", () => {
    const { visits, ended } = run(16, opts());
    expect(ended).toBe(true);
    expect(visits.map((v) => `${v.scene}:${v.step}`)).toEqual(["0:1", "0:2", "1:1", "1:2", "1:3"]);
  });

  it("step changes land within one frame of the cumulative step durations (no drift)", () => {
    const frame = 16;
    const { visits, endT } = run(frame, opts());
    const expected = [0, 1000, 1500, 2300, 3500];
    visits.forEach((v, i) => {
      expect(v.t).toBeGreaterThanOrEqual(expected[i]);
      expect(v.t).toBeLessThan(expected[i] + frame);
    });
    expect(endT).toBeGreaterThanOrEqual(3900);
    expect(endT).toBeLessThan(3900 + frame);
  });

  it("the whole run takes total / speed", () => {
    const { endT } = run(10, opts({ speed: 2 }));
    expect(endT).toBe(1950);
  });

  it("with loop on it keeps cycling in order", () => {
    const { visits, ended } = run(16, opts({ loop: true }), 8000);
    expect(ended).toBe(false);
    const seq = visits.map((v) => `${v.scene}:${v.step}`);
    expect(seq.slice(0, 11)).toEqual([
      "0:1", "0:2", "1:1", "1:2", "1:3",
      "0:1", "0:2", "1:1", "1:2", "1:3",
      "0:1",
    ]);
  });
});
