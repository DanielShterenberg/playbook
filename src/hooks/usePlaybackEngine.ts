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

import { useEffect, useRef, useCallback } from "react";
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

/** Drive the store's playback slice. Mount once per editor page. */
export function usePlaybackEngine() {
  const isPlaying = useStore((s) => s.isPlaying);

  // Speed-scaled ms spent in the step the engine last saw.
  const accMsRef = useRef(0);
  const lastPosRef = useRef<{ sceneIndex: number; step: number } | null>(null);

  const tick = useCallback((dtMs: number) => {
    const state = useStore.getState();
    if (!state.isPlaying) return;
    const scenes = state.currentPlay?.scenes;
    if (!scenes || scenes.length === 0) return;

    // Position moved underneath us (play started, or the user navigated):
    // the new step starts from zero.
    const last = lastPosRef.current;
    if (!last || last.sceneIndex !== state.currentSceneIndex || last.step !== state.currentStep) {
      accMsRef.current = 0;
    }

    const result = tickPlayback(
      { sceneIndex: state.currentSceneIndex, step: state.currentStep, accMs: accMsRef.current },
      dtMs,
      { scenes, speed: state.speed, loop: state.loop },
    );
    accMsRef.current = result.state.accMs;
    lastPosRef.current = { sceneIndex: result.state.sceneIndex, step: result.state.step };

    if (result.ended) {
      state.pausePlayback();
    } else if (result.changed) {
      state.setPlaybackPosition(result.state.sceneIndex, result.state.step);
    }
  }, []);

  // Every play press starts the current step from zero.
  useEffect(() => {
    if (isPlaying) {
      accMsRef.current = 0;
      lastPosRef.current = null;
    }
  }, [isPlaying]);

  usePlaybackClock(isPlaying, tick);
}
