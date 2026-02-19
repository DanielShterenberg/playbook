"use client";

/**
 * EditorCourtArea — client component that renders the court with draggable players.
 *
 * Updated for issue #67/#69: accepts a playId prop. If the store already has
 * the matching play set as currentPlay we use it directly. Otherwise we look
 * it up in the plays list (e.g. the user navigated directly via URL) and load
 * it. If the play is not found (e.g. after a page refresh), we redirect to
 * /playbook rather than creating an infinite loop of new default plays.
 *
 * Bug fix: The original implementation had `currentPlay` in the useEffect deps
 * while also calling `setCurrentPlay` inside the effect. This created an infinite
 * render loop ("Maximum update depth exceeded") on page refresh because each new
 * default play had a different ID than the URL's playId, causing the effect to
 * run again on every re-render. Fixed by using a useRef guard and reading store
 * state directly via useStore.getState() to avoid the dependency cycle.
 */

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useStore, createDefaultPlay, selectEditorScene } from "@/lib/store";
import CourtWithPlayers from "@/components/players/CourtWithPlayers";

interface EditorCourtAreaProps {
  playId?: string;
}

export default function EditorCourtArea({ playId }: EditorCourtAreaProps) {
  const scene = useStore(selectEditorScene);
  const selectedSceneId = useStore((s) => s.selectedSceneId);
  const router = useRouter();
  // Guard: only initialise once to prevent the re-render cycle where setting
  // currentPlay triggers the effect to run again with a non-matching playId.
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // Read state directly to avoid adding currentPlay to deps (which would
    // restart the effect every time we call setCurrentPlay inside it).
    const { currentPlay, getPlayById, setCurrentPlay, addPlay, setSelectedSceneId } =
      useStore.getState();

    // Already have the right play loaded.
    if (currentPlay && (!playId || currentPlay.id === playId)) {
      // Ensure selectedSceneId is set — NewPlayModal sets currentPlay but historically
      // did not always set selectedSceneId, leaving it null and breaking all scene ops.
      const { selectedSceneId, setSelectedSceneId } = useStore.getState();
      if (!selectedSceneId && currentPlay.scenes.length > 0) {
        setSelectedSceneId(currentPlay.scenes[0].id);
      }
      return;
    }

    // Try to find the play in the plays list (user navigated via URL).
    if (playId) {
      const found = getPlayById(playId);
      if (found) {
        setCurrentPlay(found);
        setSelectedSceneId(found.scenes[0].id);
        return;
      }
      // Play not found (e.g. page refresh — store is in-memory only).
      // Redirect to the playbook list rather than creating a new play whose ID
      // would never match the URL, causing infinite re-renders.
      router.replace("/playbook");
      return;
    }

    // No playId in the URL — bootstrap a new default play (dev convenience).
    const play = createDefaultPlay();
    addPlay(play);
    setCurrentPlay(play);
    setSelectedSceneId(play.scenes[0].id);
  }, [playId, router]);

  return (
    /*
     * Issue #81 — responsive court sizing:
     *   - Mobile (<768px): full width, no side panels
     *   - Tablet (768–1024px): max-w-xl to leave room for any side chrome
     *   - Desktop (>1024px): max-w-3xl for a large comfortable canvas
     */
    <CourtWithPlayers
      sceneId={selectedSceneId ?? scene?.id}
      scene={scene}
      className="w-full max-w-full md:max-w-xl lg:max-w-3xl"
    />
  );
}
