"use client";

/**
 * usePlaybackEngine — the single timer behind editor / presentation playback.
 *
 * Implements issue #160: one playback engine instead of three loops.
 *
 * Architecture:
 *   - `usePlaybackClock` is a store-free rAF clock: while `active`, it calls
 *     `onTick(dtMs)` once per animation frame. The share viewer uses it with
 *     its own local state.
 *   - `usePlaybackEngine` binds that clock to the Zustand playback slice via
 *     the pure `tickPlayback` reducer. It must be mounted exactly ONCE per
 *     editor page (see PlaybackEngine in src/app/play/[id]). PlaybackControls
 *     and PresentationOverlay only read state and dispatch actions.
 */

import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { tickPlayback } from "@/lib/playback";

/**
 * Longest frame gap counted as playback time. rAF stops while the tab is
 * hidden; without a cap the whole hidden period would be replayed as a burst
 * of one-step-per-frame advances when the tab becomes visible again.
 */
export const MAX_TICK_MS = 250;

/**
 * Call `onTick(dtMs)` once per animation frame while `active`.
 * `dtMs` is the wall-clock time since the previous frame (0 on the first).
 */
export function usePlaybackClock(active: boolean, onTick: (dtMs: number) => void) {
  const onTickRef = useRef(onTick);
  useEffect(() => { onTickRef.current = onTick; }, [onTick]);

  useEffect(() => {
    if (!active) return;
    let rafId: number | null = null;
    let last: number | null = null;
    let cancelled = false;

    const frame = (timestamp: number) => {
      if (cancelled) return;
      const dt = last === null ? 0 : Math.min(timestamp - last, MAX_TICK_MS);
      last = timestamp;
      onTickRef.current(dt);
      if (!cancelled) rafId = requestAnimationFrame(frame);
    };
    rafId = requestAnimationFrame(frame);

    return () => {
      cancelled = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [active]);
}

/**
 * The per-frame step of store playback, without React: reads the store, runs
 * the pure reducer, dispatches the result. It owns the only piece of playback
 * state that is not in the store — the time spent in the current step.
 */
export function createStorePlaybackDriver() {
  // Speed-scaled ms spent in the step the driver last saw.
  let accMs = 0;
  let last: { sceneIndex: number; step: number } | null = null;

  return {
    /** Forget accumulated time (called on every play press). */
    reset() {
      accMs = 0;
      last = null;
    },

    tick(dtMs: number) {
      const state = useStore.getState();
      if (!state.isPlaying) return;

      // Position moved underneath us (play started, or the user navigated):
      // the new step starts from zero.
      if (!last || last.sceneIndex !== state.currentSceneIndex || last.step !== state.currentStep) {
        accMs = 0;
      }

      // No play / no scenes is reported as `ended` by the reducer, so playback
      // pauses instead of spinning with the UI stuck on "Pause".
      const result = tickPlayback(
        { sceneIndex: state.currentSceneIndex, step: state.currentStep, accMs },
        dtMs,
        { scenes: state.currentPlay?.scenes ?? [], speed: state.speed, loop: state.loop },
      );
      accMs = result.state.accMs;
      last = { sceneIndex: result.state.sceneIndex, step: result.state.step };

      if (result.ended) {
        state.pausePlayback();
      } else if (result.changed) {
        state.setPlaybackPosition(result.state.sceneIndex, result.state.step);
      }
    },
  };
}

/** Drive the store's playback slice. Mount once per editor page. */
export function usePlaybackEngine() {
  const isPlaying = useStore((s) => s.isPlaying);
  const [driver] = useState(createStorePlaybackDriver);

  // Every play press starts the current step from zero.
  useEffect(() => {
    if (isPlaying) driver.reset();
  }, [isPlaying, driver]);

  usePlaybackClock(isPlaying, driver.tick);
}
