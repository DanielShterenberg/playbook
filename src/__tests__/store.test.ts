/**
 * Tests for the store's playback slice and the invariants playback relies on
 * (issue #160 review):
 *   - `currentPlay.scenes` is always in `order` order (enforced on load);
 *   - every scene move goes through the same position logic: first step of the
 *     scene, `selectedSceneId` in sync;
 *   - pressing play at the end of the play restarts from the beginning.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useStore, createDefaultPlay } from "@/lib/store";
import type { Play, Scene, TimingGroup } from "@/lib/types";

function makeScene(id: string, order: number, steps: [step: number, duration: number][]): Scene {
  const base = createDefaultPlay().scenes[0];
  const timingGroups: TimingGroup[] = steps.map(([step, duration]) => ({ step, duration, annotations: [] }));
  return { ...base, id, order, timingGroups };
}

function makePlay(scenes: Scene[]): Play {
  return { ...createDefaultPlay(), scenes };
}

/** Two scenes: "a" with steps 1,2 and "b" with steps 1,2,3. */
const twoScenes = () => makePlay([
  makeScene("a", 0, [[1, 600], [2, 900]]),
  makeScene("b", 1, [[1, 500], [2, 700], [3, 800]]),
]);

const get = () => useStore.getState();
const pos = () => {
  const s = get();
  return { scene: s.currentSceneIndex, step: s.currentStep, selected: s.selectedSceneId, playing: s.isPlaying };
};

beforeEach(() => {
  useStore.setState({
    currentPlay: null,
    selectedSceneId: null,
    isPlaying: false,
    currentSceneIndex: 0,
    currentStep: 1,
    speed: 1,
    loop: false,
  });
});

describe("setCurrentPlay — sorted-scenes invariant", () => {
  it("sorts a play stored as [order:1, order:0]", () => {
    const stored = makePlay([makeScene("second", 1, [[1, 100]]), makeScene("first", 0, [[1, 100]])]);
    get().setCurrentPlay(stored);
    expect(get().currentPlay!.scenes.map((s) => s.id)).toEqual(["first", "second"]);
    expect(get().currentPlay!.scenes.map((s) => s.order)).toEqual([0, 1]);
  });

  it("renumbers non-contiguous orders to the array index", () => {
    get().setCurrentPlay(makePlay([makeScene("late", 5, [[1, 100]]), makeScene("early", 2, [[1, 100]])]));
    expect(get().currentPlay!.scenes.map((s) => [s.id, s.order])).toEqual([["early", 0], ["late", 1]]);
  });

  it("does not mutate the play it was given", () => {
    const stored = makePlay([makeScene("second", 1, [[3, 100], [1, 100]]), makeScene("first", 0, [[1, 100]])]);
    get().setCurrentPlay(stored);
    expect(stored.scenes.map((s) => s.id)).toEqual(["second", "first"]);
    expect(stored.scenes[0].timingGroups.map((g) => g.step)).toEqual([3, 1]);
  });

  it("still normalizes timing steps, including duplicates", () => {
    get().setCurrentPlay(makePlay([makeScene("a", 0, [[1, 100], [1, 200], [4, 300]])]));
    expect(get().currentPlay!.scenes[0].timingGroups.map((g) => [g.step, g.duration])).toEqual([[1, 100], [2, 200], [3, 300]]);
  });

  it("index N then means the same scene for playback, selection and scene navigation", () => {
    get().setCurrentPlay(makePlay([makeScene("second", 1, [[1, 100]]), makeScene("first", 0, [[1, 100]])]));
    get().setPlaybackPosition(0);
    expect(pos().selected).toBe("first");
    get().stepForward();
    expect(pos().selected).toBe("second");
  });
});

describe("setPlaybackPosition", () => {
  it("moves scene + step, syncs selectedSceneId and leaves isPlaying alone", () => {
    get().setCurrentPlay(twoScenes());
    get().startPlayback();
    get().setPlaybackPosition(1, 2);
    expect(pos()).toEqual({ scene: 1, step: 2, selected: "b", playing: true });
    get().pausePlayback();
    get().setPlaybackPosition(0);
    expect(pos()).toEqual({ scene: 0, step: 1, selected: "a", playing: false });
  });

  it("is a no-op for a scene index that does not exist", () => {
    get().setCurrentPlay(twoScenes());
    get().setPlaybackPosition(1, 2);
    get().setPlaybackPosition(7);
    get().setPlaybackPosition(-1);
    expect(pos()).toEqual({ scene: 1, step: 2, selected: "b", playing: false });
  });
});

describe("stepForward / stepBack / setCurrentSceneIndex share the position logic", () => {
  /** Bypass setCurrentPlay's normalization so the first step is NOT 1. */
  const loadRaw = () => useStore.setState({
    currentPlay: makePlay([makeScene("a", 0, [[4, 100], [2, 100]]), makeScene("b", 1, [[7, 100], [5, 100]])]),
    selectedSceneId: "a",
    currentSceneIndex: 0,
    currentStep: 2,
  });

  it("stepForward lands on the next scene's first step, pauses and syncs selection", () => {
    loadRaw();
    get().startPlayback();
    get().stepForward();
    expect(pos()).toEqual({ scene: 1, step: 5, selected: "b", playing: false });
  });

  it("stepForward at the last scene pauses; with loop it wraps to the first scene's first step", () => {
    loadRaw();
    get().setPlaybackPosition(1, 7);
    useStore.setState({ isPlaying: true }); // startPlayback here would restart from the beginning
    get().stepForward();
    expect(pos()).toEqual({ scene: 1, step: 7, selected: "b", playing: false });
    get().setLoop(true);
    get().stepForward();
    expect(pos()).toEqual({ scene: 0, step: 2, selected: "a", playing: false });
  });

  it("stepBack lands on the previous scene's first step, pauses and syncs selection", () => {
    loadRaw();
    get().setPlaybackPosition(1, 7);
    useStore.setState({ isPlaying: true }); // startPlayback here would restart from the beginning
    get().stepBack();
    expect(pos()).toEqual({ scene: 0, step: 2, selected: "a", playing: false });
    get().startPlayback();
    get().stepBack();
    expect(pos()).toEqual({ scene: 0, step: 2, selected: "a", playing: false });
  });

  it("setCurrentSceneIndex lands on that scene's first step, pauses and syncs selection", () => {
    loadRaw();
    get().startPlayback();
    get().setCurrentSceneIndex(1);
    expect(pos()).toEqual({ scene: 1, step: 5, selected: "b", playing: false });
  });

  it("setCurrentSceneIndex with an invalid index only pauses", () => {
    loadRaw();
    get().startPlayback();
    get().setCurrentSceneIndex(9);
    expect(pos()).toEqual({ scene: 0, step: 2, selected: "a", playing: false });
  });
});

describe("play at the end restarts from the beginning", () => {
  const toEnd = () => {
    get().setCurrentPlay(twoScenes());
    get().setPlaybackPosition(1, 3);
  };

  it("togglePlayback at the final position jumps to the first step of the first scene", () => {
    toEnd();
    get().togglePlayback();
    expect(pos()).toEqual({ scene: 0, step: 1, selected: "a", playing: true });
  });

  it("startPlayback does the same", () => {
    toEnd();
    get().startPlayback();
    expect(pos()).toEqual({ scene: 0, step: 1, selected: "a", playing: true });
  });

  it("anywhere else playback resumes in place", () => {
    get().setCurrentPlay(twoScenes());
    get().setPlaybackPosition(1, 2);
    get().togglePlayback();
    expect(pos()).toEqual({ scene: 1, step: 2, selected: "b", playing: true });
  });

  it("with loop on the final step plays on and wraps by itself — no jump", () => {
    toEnd();
    get().setLoop(true);
    get().togglePlayback();
    expect(pos()).toEqual({ scene: 1, step: 3, selected: "b", playing: true });
  });

  it("pausing at the end does not move the position", () => {
    toEnd();
    useStore.setState({ isPlaying: true });
    get().togglePlayback();
    expect(pos()).toEqual({ scene: 1, step: 3, selected: "b", playing: false });
  });
});
