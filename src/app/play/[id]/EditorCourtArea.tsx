"use client";

/**
 * EditorCourtArea — client component that renders the court with draggable players.
 *
 * Bootstraps a default play in the Zustand store (if none is loaded) and
 * wires CourtWithPlayers to the selected scene.
 */

import { useEffect } from "react";
import { useStore, createDefaultPlay, selectEditorScene } from "@/lib/store";
import CourtWithPlayers from "@/components/players/CourtWithPlayers";

export default function EditorCourtArea() {
  const currentPlay = useStore((s) => s.currentPlay);
  const setCurrentPlay = useStore((s) => s.setCurrentPlay);
  const selectedSceneId = useStore((s) => s.selectedSceneId);
  const setSelectedSceneId = useStore((s) => s.setSelectedSceneId);
  const scene = useStore(selectEditorScene);

  // Bootstrap a default play if the editor has no play loaded yet.
  useEffect(() => {
    if (!currentPlay) {
      const play = createDefaultPlay();
      setCurrentPlay(play);
      setSelectedSceneId(play.scenes[0].id);
    }
  }, [currentPlay, setCurrentPlay, setSelectedSceneId]);

  return (
    <CourtWithPlayers
      sceneId={selectedSceneId ?? scene?.id}
      scene={scene}
      className="w-full max-w-3xl"
    />
  );
}
