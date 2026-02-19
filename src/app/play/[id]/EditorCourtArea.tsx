"use client";

/**
 * EditorCourtArea — client component that renders the court with draggable players.
 *
 * Updated for issue #67/#69: accepts a playId prop. If the store already has
 * the matching play set as currentPlay we use it directly. Otherwise we look
 * it up in the plays list (e.g. the user navigated directly via URL) and load
 * it. As a final fallback we bootstrap a brand-new default play (preserves
 * existing direct-URL behaviour for development).
 */

import { useEffect } from "react";
import { useStore, createDefaultPlay, selectEditorScene } from "@/lib/store";
import CourtWithPlayers from "@/components/players/CourtWithPlayers";

interface EditorCourtAreaProps {
  playId?: string;
}

export default function EditorCourtArea({ playId }: EditorCourtAreaProps) {
  const currentPlay = useStore((s) => s.currentPlay);
  const setCurrentPlay = useStore((s) => s.setCurrentPlay);
  const getPlayById = useStore((s) => s.getPlayById);
  const addPlay = useStore((s) => s.addPlay);
  const selectedSceneId = useStore((s) => s.selectedSceneId);
  const setSelectedSceneId = useStore((s) => s.setSelectedSceneId);
  const scene = useStore(selectEditorScene);

  useEffect(() => {
    // If the current play already matches the URL id, nothing to do.
    if (currentPlay && (!playId || currentPlay.id === playId)) return;

    // Try to find the play in the plays list (user navigated via URL).
    if (playId) {
      const found = getPlayById(playId);
      if (found) {
        setCurrentPlay(found);
        setSelectedSceneId(found.scenes[0].id);
        return;
      }
    }

    // Fallback: bootstrap a new default play (dev convenience).
    const play = createDefaultPlay();
    addPlay(play);
    setCurrentPlay(play);
    setSelectedSceneId(play.scenes[0].id);
  }, [playId, currentPlay, setCurrentPlay, getPlayById, addPlay, setSelectedSceneId]);

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
