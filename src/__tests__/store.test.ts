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
import { useHistoryStore } from "@/lib/history";
import type { Play, Scene, TimingGroup } from "@/lib/types";
import { sceneDescription } from "@/lib/types";

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
  useHistoryStore.getState().resetHistory();
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

// ---------------------------------------------------------------------------
// Second review: selection and playback scene are one piece of state
// ---------------------------------------------------------------------------

/** N scenes "s0".."sN-1", each with steps 1..3. */
const manyScenes = (n: number, id = "play-" + n) => ({
  ...makePlay(Array.from({ length: n }, (_, i) => makeScene("s" + i, i, [[1, 100], [2, 100], [3, 100]]))),
  id,
});

/** The invariant: the selected scene IS the playback scene, and the step exists in it. */
function expectConsistent(label = "") {
  const s = get();
  const scenes = s.currentPlay?.scenes ?? [];
  if (scenes.length === 0) {
    expect(s.currentSceneIndex, label).toBe(0);
    return;
  }
  expect(scenes[s.currentSceneIndex]?.id, label).toBe(s.selectedSceneId);
  expect(scenes[s.currentSceneIndex].timingGroups.map((g) => g.step), label).toContain(s.currentStep);
}

describe("selectedSceneId and currentSceneIndex move together", () => {
  it("setSelectedSceneId moves the playback scene and goes to its first step", () => {
    get().setCurrentPlay(manyScenes(4));
    get().setPlaybackPosition(0, 3);
    get().setSelectedSceneId("s2");
    expect(pos()).toEqual({ scene: 2, step: 1, selected: "s2", playing: false });
  });

  it("setSelectedSceneId does not pause playback", () => {
    get().setCurrentPlay(manyScenes(4));
    get().startPlayback();
    get().setSelectedSceneId("s1");
    expect(pos()).toEqual({ scene: 1, step: 1, selected: "s1", playing: true });
  });

  it("re-selecting the current scene keeps the current step", () => {
    get().setCurrentPlay(manyScenes(4));
    get().setPlaybackPosition(2, 3);
    get().setSelectedSceneId("s2");
    expect(pos()).toEqual({ scene: 2, step: 3, selected: "s2", playing: false });
  });

  it("selecting null or an unknown id keeps a real scene selected", () => {
    get().setCurrentPlay(manyScenes(3));
    get().setPlaybackPosition(1, 2);
    get().setSelectedSceneId(null);
    expectConsistent();
    expect(get().selectedSceneId).toBe("s1");
    get().setSelectedSceneId("nope");
    expect(get().selectedSceneId).toBe("s1");
  });

  it("the caller pattern setCurrentPlay(play) + setSelectedSceneId(play.scenes[0].id) on an out-of-order play stays consistent", () => {
    const stored = makePlay([makeScene("second", 1, [[1, 100]]), makeScene("first", 0, [[1, 100]])]);
    get().setCurrentPlay(stored);
    expect(pos()).toEqual({ scene: 0, step: 1, selected: "first", playing: false });
    get().setSelectedSceneId(stored.scenes[0].id); // "second" — index 1 after normalization
    expect(pos()).toEqual({ scene: 1, step: 1, selected: "second", playing: false });
  });

  it("removeScene keeps them in sync when the selected / playback scene is removed", () => {
    get().setCurrentPlay(manyScenes(4));
    get().setSelectedSceneId("s3");
    get().removeScene("s3");
    expectConsistent();
    get().setSelectedSceneId("s1");
    get().removeScene("s0"); // selected scene shifts from index 1 to 0
    expect(get().selectedSceneId).toBe("s1");
    expect(get().currentSceneIndex).toBe(0);
  });

  it("reorderScene moves the index with the selected scene", () => {
    get().setCurrentPlay(manyScenes(4));
    get().setPlaybackPosition(0, 2);
    get().reorderScene("s0", 3);
    expect(pos()).toEqual({ scene: 3, step: 2, selected: "s0", playing: false });
  });

  it("addScene and duplicateScene select the new scene at its index, first step", () => {
    get().setCurrentPlay(manyScenes(2));
    get().setPlaybackPosition(0, 3);
    get().addScene();
    expect(get().currentSceneIndex).toBe(2);
    expect(get().currentStep).toBe(1);
    expectConsistent();
    get().duplicateScene("s0");
    expect(get().currentSceneIndex).toBe(1);
    expectConsistent();
  });

  it("removing the active timing step falls back to a step that exists", () => {
    get().setCurrentPlay(manyScenes(2));
    get().setPlaybackPosition(1, 3);
    get().removeTimingStep("s1", 3);
    expectConsistent();
  });

  it("resetPlayback selects the first scene", () => {
    get().setCurrentPlay(manyScenes(3));
    get().setSelectedSceneId("s2");
    get().resetPlayback();
    expect(pos()).toEqual({ scene: 0, step: 1, selected: "s0", playing: false });
  });

  it("holds after any sequence of actions", () => {
    // Deterministic PRNG so a failure is reproducible.
    let seed = 20261010;
    const rnd = (n: number) => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed % n;
    };
    const plays = [manyScenes(1, "A"), manyScenes(6, "B"), { ...manyScenes(3, "C"), scenes: manyScenes(3).scenes.slice().reverse() }];
    get().setCurrentPlay(plays[1]);
    expectConsistent("initial");
    const sceneIds = () => get().currentPlay!.scenes.map((s) => s.id);
    const anyId = () => { const ids = sceneIds(); return ids[rnd(ids.length)]; };
    const actions: [string, () => void][] = [
      ["setSelectedSceneId", () => get().setSelectedSceneId(anyId())],
      ["setSelectedSceneId(null)", () => get().setSelectedSceneId(null)],
      ["setSelectedSceneId(unknown)", () => get().setSelectedSceneId("unknown")],
      ["setCurrentSceneIndex", () => get().setCurrentSceneIndex(rnd(8) - 1)],
      ["setPlaybackPosition", () => get().setPlaybackPosition(rnd(8) - 1, rnd(5))],
      ["setPlaybackPosition(first)", () => get().setPlaybackPosition(rnd(7))],
      ["stepForward", () => get().stepForward()],
      ["stepBack", () => get().stepBack()],
      ["addScene", () => get().addScene()],
      ["removeScene", () => get().removeScene(anyId())],
      ["duplicateScene", () => get().duplicateScene(anyId())],
      ["reorderScene", () => get().reorderScene(anyId(), rnd(sceneIds().length))],
      ["addTimingStep", () => get().addTimingStep(anyId())],
      ["removeTimingStep", () => get().removeTimingStep(anyId(), 1 + rnd(4))],
      ["mergeTimingSteps", () => get().mergeTimingSteps(anyId(), 1 + rnd(3))],
      ["setTimingStepDuration", () => get().setTimingStepDuration(anyId(), 1 + rnd(3), 100 + rnd(900))],
      ["undo", () => get().undo()],
      ["redo", () => get().redo()],
      ["setCurrentPlay(other)", () => get().setCurrentPlay(plays[rnd(plays.length)])],
      ["setCurrentPlay(same)", () => get().setCurrentPlay(get().currentPlay!)],
      ["togglePlayback", () => get().togglePlayback()],
      ["setLoop", () => get().setLoop(rnd(2) === 0)],
      ["resetPlayback", () => get().resetPlayback()],
    ];
    const trail: string[] = [];
    for (let i = 0; i < 3000; i++) {
      const [name, run] = actions[rnd(actions.length)];
      trail.push(name);
      run();
      expectConsistent(`after #${i}: ${trail.slice(-6).join(" > ")}`);
    }
  });
});

describe("position does not go stale across plays", () => {
  it("opening a different play resets to its first scene and step, paused", () => {
    get().setCurrentPlay(manyScenes(6, "A"));
    get().setPlaybackPosition(5, 3);
    get().startPlayback();
    get().setCurrentPlay(manyScenes(2, "B"));
    expect(pos()).toEqual({ scene: 0, step: 1, selected: "s0", playing: false });
    // ...and Play then really plays: not "at the end", not out of range.
    get().startPlayback();
    expect(pos()).toEqual({ scene: 0, step: 1, selected: "s0", playing: true });
  });

  it("setting the same play again keeps the position when it still exists", () => {
    const play = manyScenes(4, "A");
    get().setCurrentPlay(play);
    get().setPlaybackPosition(2, 3);
    get().setCurrentPlay({ ...play, title: "renamed" });
    expect(pos()).toEqual({ scene: 2, step: 3, selected: "s2", playing: false });
  });

  it("setting the same play again with fewer scenes clamps", () => {
    const play = manyScenes(6, "A");
    get().setCurrentPlay(play);
    get().setPlaybackPosition(5, 3);
    get().setCurrentPlay({ ...play, scenes: play.scenes.slice(0, 2) });
    expect(get().currentSceneIndex).toBe(1);
    expectConsistent();
  });

  it("undo back to fewer scenes clamps, redo restores the selection", () => {
    get().setCurrentPlay(manyScenes(2, "A"));
    get().addScene();
    get().addScene();
    expect(get().currentSceneIndex).toBe(3);
    const added = get().selectedSceneId;
    get().undo();
    get().undo();
    expect(get().currentPlay!.scenes).toHaveLength(2);
    expectConsistent();
    get().redo();
    get().redo();
    expect(get().currentPlay!.scenes).toHaveLength(4);
    expectConsistent();
    expect(get().selectedSceneId).toBe(added);
  });
});

describe("setTimingStepDuration", () => {
  const durations = () => get().currentPlay!.scenes[1].timingGroups.map((g) => g.duration);

  it("changes one step's duration through the normal history path: undoable and redoable", () => {
    get().setCurrentPlay(twoScenes());
    get().setSelectedSceneId("b");
    get().addTimingStep("b"); // an earlier edit that must stay undoable
    expect(durations()).toEqual([500, 700, 800, 1000]);

    get().setTimingStepDuration("b", 2, 1234);
    expect(durations()).toEqual([500, 1234, 800, 1000]);
    expect(useHistoryStore.getState().canUndo).toBe(true);

    get().undo();
    expect(durations()).toEqual([500, 700, 800, 1000]);
    get().redo();
    expect(durations()).toEqual([500, 1234, 800, 1000]);

    // History was not wiped by the duration edit: the earlier edit is still there.
    get().undo();
    get().undo();
    expect(durations()).toEqual([500, 700, 800]);
  });

  it("leaves selection, position and other scenes alone", () => {
    get().setCurrentPlay(twoScenes());
    get().setPlaybackPosition(1, 2);
    const sceneA = get().currentPlay!.scenes[0];
    get().setTimingStepDuration("b", 2, 300);
    expect(pos()).toEqual({ scene: 1, step: 2, selected: "b", playing: false });
    expect(get().currentPlay!.scenes[0]).toBe(sceneA);
  });

  it("is a no-op (no history entry) for an unknown scene / step or an unchanged value", () => {
    get().setCurrentPlay(twoScenes());
    get().setTimingStepDuration("nope", 1, 300);
    get().setTimingStepDuration("b", 9, 300);
    get().setTimingStepDuration("b", 2, 700);
    expect(useHistoryStore.getState().canUndo).toBe(false);
    expect(durations()).toEqual([500, 700, 800]);
  });
});

describe("scene notes (updateSceneDescription)", () => {
  beforeEach(() => {
    get().setCurrentPlay(twoScenes());
  });
  const sceneA = () => get().currentPlay!.scenes.find((sc) => sc.id === "a")!;

  it("sets the notes as one undo step, and undo brings the old notes back", () => {
    get().updateSceneDescription("a", "If X denies, 1 hits 5 on the roll");
    expect(sceneA().description).toBe("If X denies, 1 hits 5 on the roll");
    expect(sceneDescription(sceneA())).toBe("If X denies, 1 hits 5 on the roll");
    get().undo();
    expect(sceneDescription(sceneA())).toBe("");
  });

  it("is a no-op (no undo step) when nothing changed", () => {
    get().updateSceneDescription("a", "x");
    const past = useHistoryStore.getState().past.length;
    get().updateSceneDescription("a", "x  ");
    expect(useHistoryStore.getState().past.length).toBe(past);
  });

  it("naming a scene keeps a long legacy note as its notes", () => {
    const long = "A note written before notes had their own field, far too long to be a name";
    get().updateSceneNote("a", long);
    get().updateSceneNote("a", "Flare");
    expect(sceneA().note).toBe("Flare");
    expect(sceneDescription(sceneA())).toBe(long);
  });

  it("keeps the scene's name; a long legacy note moves into the notes", () => {
    get().updateSceneNote("a", "Flare");
    get().updateSceneDescription("a", "notes");
    expect(sceneA().note).toBe("Flare");

    const long = "A note written before notes had their own field, far too long to be a name";
    get().updateSceneNote("b", long);
    const sceneB = () => get().currentPlay!.scenes.find((sc) => sc.id === "b")!;
    expect(sceneDescription(sceneB())).toBe(long);
    get().updateSceneDescription("b", long + " — edited");
    expect(sceneB().note).toBe("");
    expect(sceneDescription(sceneB())).toBe(long + " — edited");
  });
});
