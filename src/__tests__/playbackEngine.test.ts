/**
 * Tests for the store-bound playback driver (issue #160): the function the
 * single rAF hook calls once per frame. Driven here with synthetic frame
 * times — no React, no timers.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useStore, createDefaultPlay } from "@/lib/store";
import { createStorePlaybackDriver } from "@/hooks/usePlaybackEngine";
import type { Play, Scene } from "@/lib/types";

function makeScene(id: string, order: number, steps: [step: number, duration: number][]): Scene {
  const base = createDefaultPlay().scenes[0];
  return { ...base, id, order, timingGroups: steps.map(([step, duration]) => ({ step, duration, annotations: [] })) };
}
const makePlay = (scenes: Scene[]): Play => ({ ...createDefaultPlay(), scenes });
const get = () => useStore.getState();

beforeEach(() => {
  useStore.setState({ currentPlay: null, selectedSceneId: null, isPlaying: false, currentSceneIndex: 0, currentStep: 1, speed: 1, loop: false });
});

/** Run frames until playback pauses; record every (scene, step, selectedSceneId) change. */
function runUntilPaused(frameMs = 20, maxFrames = 2000) {
  const driver = createStorePlaybackDriver();
  const sig = () => `${get().currentSceneIndex}:${get().currentStep}:${get().selectedSceneId}`;
  const visits = [sig()];
  let frames = 0;
  while (get().isPlaying && frames < maxFrames) {
    driver.tick(frameMs);
    frames++;
    if (sig() !== visits[visits.length - 1]) visits.push(sig());
  }
  return { visits, frames, ms: frames * frameMs };
}

describe("createStorePlaybackDriver", () => {
  it("pauses on the first frame when there is no play", () => {
    useStore.setState({ isPlaying: true });
    createStorePlaybackDriver().tick(16);
    expect(get().isPlaying).toBe(false);
  });

  it("pauses on the first frame when the play has no scenes", () => {
    useStore.setState({ currentPlay: makePlay([]), isPlaying: true });
    createStorePlaybackDriver().tick(16);
    expect(get().isPlaying).toBe(false);
  });

  it("does nothing while paused", () => {
    get().setCurrentPlay(makePlay([makeScene("a", 0, [[1, 100], [2, 100]])]));
    const driver = createStorePlaybackDriver();
    for (let i = 0; i < 50; i++) driver.tick(100);
    expect(get().currentStep).toBe(1);
  });

  it("plays every step of every scene once, keeps selectedSceneId in sync, then pauses on the last step", () => {
    get().setCurrentPlay(makePlay([makeScene("a", 0, [[1, 600], [2, 900]]), makeScene("b", 1, [[1, 500], [2, 700], [3, 800]])]));
    get().setPlaybackPosition(0);
    get().startPlayback();
    const { visits, ms } = runUntilPaused();
    expect(visits).toEqual(["0:1:a", "0:2:a", "1:1:b", "1:2:b", "1:3:b"]);
    expect(ms).toBe(3500);
    expect(get().isPlaying).toBe(false);
  });

  it("pressing play again after the end replays the whole play, not just the final hold", () => {
    get().setCurrentPlay(makePlay([makeScene("a", 0, [[1, 600], [2, 900]]), makeScene("b", 1, [[1, 500], [2, 700], [3, 800]])]));
    get().setPlaybackPosition(0);
    get().startPlayback();
    runUntilPaused();
    get().togglePlayback();
    const { visits, ms } = runUntilPaused();
    expect(visits).toEqual(["0:1:a", "0:2:a", "1:1:b", "1:2:b", "1:3:b"]);
    expect(ms).toBe(3500);
  });

  it("plays a play stored out of order in `order` order", () => {
    get().setCurrentPlay(makePlay([makeScene("second", 1, [[1, 100]]), makeScene("first", 0, [[1, 100]])]));
    get().setPlaybackPosition(0);
    get().startPlayback();
    expect(runUntilPaused().visits).toEqual(["0:1:first", "1:1:second"]);
  });

  it("restarts the step timer when the position is moved underneath it", () => {
    get().setCurrentPlay(makePlay([makeScene("a", 0, [[1, 1000], [2, 1000]])]));
    get().startPlayback();
    const driver = createStorePlaybackDriver();
    driver.tick(900);
    get().setPlaybackPosition(0, 2);
    driver.tick(900); // would end the play if the 900ms from step 1 had been kept
    expect(get().isPlaying).toBe(true);
    driver.tick(100);
    expect(get().isPlaying).toBe(false);
  });

  it("reset() discards accumulated time", () => {
    get().setCurrentPlay(makePlay([makeScene("a", 0, [[1, 1000], [2, 1000]])]));
    get().startPlayback();
    const driver = createStorePlaybackDriver();
    driver.tick(900);
    driver.reset();
    driver.tick(900);
    expect(get().currentStep).toBe(1);
    driver.tick(100);
    expect(get().currentStep).toBe(2);
  });
});
