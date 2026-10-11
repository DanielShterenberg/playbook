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
  sortedTimingGroups,
  firstStepOf,
  lastStepOf,
  nextStepAfter,
  prevStepBefore,
  isAtStart,
  startPosition,
  isAtEnd,
  normalizeTimingSteps,
  normalizePlayForPlayback,
  tickPlayback,
  sceneProgress,
} from "@/lib/playback";
import type { PlaybackPosition, PlaybackScene } from "@/lib/playback";
import { SCENE_NAME_MAX, sceneName } from "@/lib/types";

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
  it("firstStepOf / lastStepOf default to 1 for an empty or missing scene", () => {
    expect(firstStepOf(scene([4, 100], [2, 100]))).toBe(2);
    expect(lastStepOf(scene([4, 100], [2, 100]))).toBe(4);
    expect(firstStepOf(scene())).toBe(1);
    expect(lastStepOf(scene())).toBe(1);
    expect(firstStepOf(undefined)).toBe(1);
    expect(lastStepOf(undefined)).toBe(1);
  });
});

describe("sortedTimingGroups", () => {
  it("returns the groups in step order without mutating the scene", () => {
    const s = scene([3, 100], [1, 200], [2, 300]);
    expect(sortedTimingGroups(s).map((g) => [g.step, g.duration])).toEqual([[1, 200], [2, 300], [3, 100]]);
    expect(s.timingGroups.map((g) => g.step)).toEqual([3, 1, 2]);
  });

  it("is memoized per timingGroups array — no allocation per animation frame", () => {
    const s = scene([2, 100], [1, 100]);
    expect(sortedTimingGroups(s)).toBe(sortedTimingGroups(s));
    // An immutable update (new array) is picked up.
    const updated = { timingGroups: [...s.timingGroups, { step: 0, duration: 50 }] };
    expect(sortedTimingGroups(updated)).not.toBe(sortedTimingGroups(s));
    expect(sortedTimingGroups(updated).map((g) => g.step)).toEqual([0, 1, 2]);
  });

  it("is empty for a missing scene", () => {
    expect(sortedTimingGroups(undefined)).toEqual([]);
    expect(sortedTimingGroups(null)).toEqual([]);
  });
});

describe("position helpers", () => {
  it("nextStepAfter is the lowest step strictly above the given one", () => {
    const s = scene([1, 100], [1, 100], [4, 100]);
    expect(nextStepAfter(s, 0)).toBe(1);
    expect(nextStepAfter(s, 1)).toBe(4);
    expect(nextStepAfter(s, 4)).toBeUndefined();
    expect(nextStepAfter(undefined, 1)).toBeUndefined();
  });

  it("prevStepBefore is the highest step strictly below the given one", () => {
    const s = scene([1, 100], [4, 100], [4, 100]);
    expect(prevStepBefore(s, 9)).toBe(4);
    expect(prevStepBefore(s, 4)).toBe(1);
    expect(prevStepBefore(s, 1)).toBeUndefined();
    expect(prevStepBefore(undefined, 3)).toBeUndefined();
  });

  it("isAtStart is true only on the first step of the first scene", () => {
    expect(isAtStart(at(0, 1), SCENES)).toBe(true);
    expect(isAtStart(at(0, 2), SCENES)).toBe(false);
    expect(isAtStart(at(1, 1), SCENES)).toBe(false);
    expect(isAtStart(at(0, 1), [])).toBe(false);
  });

  it("start / end agree with prev / next for an unknown step, so buttons and moves cannot diverge", () => {
    // Step 9 does not exist in the last scene: nothing above it -> at end, but a step below -> not at start.
    expect(isAtEnd(at(1, 9), SCENES)).toBe(true);
    expect(nextStepAfter(SCENES[1], 9)).toBeUndefined();
    expect(isAtStart(at(0, 9), SCENES)).toBe(false);
    expect(prevStepBefore(SCENES[0], 9)).toBe(2);
    // Step 0 in the first scene: at start, and "next" is the first real step.
    expect(isAtStart(at(0, 0), SCENES)).toBe(true);
    expect(nextStepAfter(SCENES[0], 0)).toBe(1);
  });

  it("startPosition is the first step of the first scene", () => {
    expect(startPosition([scene([3, 100], [2, 100]), scene([1, 100])])).toEqual(at(0, 2, 0));
    expect(startPosition([])).toEqual(at(0, 1, 0));
  });

  it("isAtEnd is true only on the last step of the last scene", () => {
    expect(isAtEnd(at(1, 3), SCENES)).toBe(true);
    expect(isAtEnd(at(1, 2), SCENES)).toBe(false);
    expect(isAtEnd(at(0, 2), SCENES)).toBe(false);
    expect(isAtEnd(at(0, 1), [scene([1, 100])])).toBe(true);
    expect(isAtEnd(at(0, 1), [])).toBe(false);
  });
});

describe("normalizeTimingSteps / normalizePlayForPlayback", () => {
  it("renumbers steps 1..n in step order, keeping stored order for ties", () => {
    const groups = [
      { step: 1, duration: 100, tag: "a" },
      { step: 1, duration: 300, tag: "b" },
      { step: 2, duration: 100, tag: "c" },
    ];
    expect(normalizeTimingSteps(groups).map((g) => [g.step, g.tag])).toEqual([[1, "a"], [2, "b"], [3, "c"]]);
    expect(normalizeTimingSteps([{ step: 5, duration: 1 }, { step: 2, duration: 2 }]).map((g) => [g.step, g.duration])).toEqual([[1, 2], [2, 1]]);
  });

  it("does not mutate its input", () => {
    const groups = [{ step: 3, duration: 1 }, { step: 1, duration: 2 }];
    normalizeTimingSteps(groups);
    expect(groups).toEqual([{ step: 3, duration: 1 }, { step: 1, duration: 2 }]);
  });

  it("sorts scenes by order and normalizes every scene's steps", () => {
    const play = {
      title: "t",
      scenes: [
        { id: "b", order: 5, timingGroups: [{ step: 1, duration: 100 }] },
        { id: "a", order: 2, timingGroups: [{ step: 1, duration: 100 }, { step: 1, duration: 200 }, { step: 2, duration: 300 }] },
      ],
    };
    const n = normalizePlayForPlayback(play);
    expect(n.title).toBe("t");
    expect(n.scenes.map((s) => s.id)).toEqual(["a", "b"]);
    // `order` is renumbered to the array index, like every store scene mutation does.
    expect(n.scenes.map((s) => s.order)).toEqual([0, 1]);
    expect(play.scenes.map((s) => s.order)).toEqual([5, 2]);
    expect(n.scenes[0].timingGroups.map((g) => [g.step, g.duration])).toEqual([[1, 100], [2, 200], [3, 300]]);
    expect(play.scenes.map((s) => s.id)).toEqual(["b", "a"]);
  });

  it("a normalized [1,1,2] scene plays all three groups, like the old index-based viewer", () => {
    const { scenes } = normalizePlayForPlayback({
      scenes: [{ order: 0, timingGroups: [{ step: 1, duration: 100 }, { step: 1, duration: 100 }, { step: 2, duration: 100 }] }],
    });
    let state = startPosition(scenes);
    const visited = [state.step];
    for (let i = 0; i < 100; i++) {
      const r = tickPlayback(state, 50, { scenes, speed: 1, loop: false });
      state = r.state;
      if (r.changed) visited.push(state.step);
      if (r.ended) break;
    }
    expect(visited).toEqual([1, 2, 3]);
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

  it("a step that does not exist is held 1000ms, then playback moves strictly forward", () => {
    // Below the first step: on to the first real step.
    expect(tickPlayback(at(0, 0), 999, opts()).changed).toBe(false);
    expect(tickPlayback(at(0, 0), 1000, opts()).state).toEqual(at(0, 1, 0));
    // Between steps: on to the next higher one.
    const gap = [scene([1, 100], [5, 100])];
    expect(tickPlayback(at(0, 3), 1000, opts({ scenes: gap })).state).toEqual(at(0, 5, 0));
    // Above the last step: on to the next scene — never back to an earlier step.
    expect(tickPlayback(at(0, 9), 1000, opts()).state).toEqual(at(1, 1, 0));
  });

  it("duplicate step numbers cannot stall playback", () => {
    // The old findIndex-based advance bounced 1 -> 1 forever on [1, 1, 2].
    const scenes = [scene([1, 100], [1, 300], [2, 100])];
    const r1 = tickPlayback(at(0, 1), 100, opts({ scenes }));
    expect(r1.state).toEqual(at(0, 2, 0));
    const r2 = tickPlayback(r1.state, 100, opts({ scenes }));
    expect(r2.ended).toBe(true);
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

describe("tickPlayback — malformed data always terminates", () => {
  const malformed: PlaybackScene[][] = [
    [scene([1, 100], [1, 100], [1, 100])],
    [scene([2, 100], [2, 100]), scene([2, 100], [2, 100])],
    [scene([NaN, 100], [1, 100])],
    [scene([1, NaN], [1, -1], [0, 0])],
    [scene(), scene()],
  ];

  it.each(malformed.map((scenes, i) => [i, scenes] as const))("case %i ends in a bounded number of ticks", (_i, scenes) => {
    let state = startPosition(scenes);
    let ended = false;
    let changes = 0;
    for (let i = 0; i < 2000 && !ended; i++) {
      const r = tickPlayback(state, 250, { scenes, speed: 1, loop: false });
      state = r.state;
      if (r.changed) changes++;
      ended = r.ended;
    }
    expect(ended).toBe(true);
    // Never more position changes than there are timing groups (+1 per scene entry).
    const groups = scenes.reduce((n, s) => n + s.timingGroups.length + 1, 0);
    expect(changes).toBeLessThanOrEqual(groups);
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

describe("sceneProgress", () => {
  it("is time-based: a long step takes more of the bar than a short one", () => {
    const s = scene([1, 1000], [2, 3000]);
    expect(sceneProgress(s, 1, 0)).toBe(0);
    expect(sceneProgress(s, 1, 500)).toBeCloseTo(0.125);
    expect(sceneProgress(s, 2, 0)).toBeCloseTo(0.25);
    expect(sceneProgress(s, 2, 1500)).toBeCloseTo(0.625);
    expect(sceneProgress(s, 2, 3000)).toBe(1);
  });

  it("uses the default duration for steps without one and clamps stray time", () => {
    const s = scene([1, 0], [2, 0]);
    expect(sceneProgress(s, 1, DEFAULT_STEP_DURATION_MS / 2)).toBeCloseTo(0.25);
    expect(sceneProgress(s, 1, 99999)).toBeCloseTo(0.5);
    expect(sceneProgress(s, 2, -5)).toBeCloseTo(0.5);
  });

  it("is 0 for a missing scene; a scene with no steps is held for one default step", () => {
    expect(sceneProgress(undefined, 1, 500)).toBe(0);
    expect(sceneProgress(scene(), 1, DEFAULT_STEP_DURATION_MS / 2)).toBeCloseTo(0.5);
  });
});

describe("sceneProgress — duplicate step numbers", () => {
  it("uses the first matching group's duration, like tickPlayback", () => {
    const s = scene([1, 1000], [1, 3000], [2, 1000]);
    // Step 1 is played for 1000 ms; at its end the bar is at 1000 of 5000.
    expect(sceneProgress(s, 1, 99999)).toBeCloseTo(0.2);
  });
});

describe("sceneName", () => {
  it("is the trimmed note when it is short and one line", () => {
    expect(sceneName({ note: "  Flare " })).toBe("Flare");
    expect(sceneName({ note: "x".repeat(SCENE_NAME_MAX) })).toHaveLength(SCENE_NAME_MAX);
  });

  it("is empty for a description, a multi-line note, or no note at all", () => {
    expect(sceneName({ note: "x".repeat(SCENE_NAME_MAX + 1) })).toBe("");
    expect(sceneName({ note: "Flare\nthen slip" })).toBe("");
    expect(sceneName({ note: "   " })).toBe("");
    expect(sceneName({})).toBe("");
    expect(sceneName({ note: null })).toBe("");
    expect(sceneName(null)).toBe("");
  });
});
