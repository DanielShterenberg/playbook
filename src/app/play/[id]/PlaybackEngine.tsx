"use client";

/**
 * PlaybackEngine — mounts the single playback timer for the editor page.
 *
 * Implements issue #160. Renders nothing; it exists so that exactly one
 * component owns the rAF loop, regardless of which playback UI is on screen
 * (PlaybackControls bar, PresentationOverlay, or both).
 */

import { usePlaybackEngine } from "@/hooks/usePlaybackEngine";

export default function PlaybackEngine() {
  usePlaybackEngine();
  return null;
}
