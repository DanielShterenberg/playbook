"use client";

/**
 * EditorCourtArea — client component that renders the court with draggable players.
 *
 * Updated for issue #67/#69: accepts a playId prop. If the store already has
 * the matching play set as currentPlay we use it directly. Otherwise we look
 * it up in the plays list (e.g. the user navigated directly via URL) and load
 * it. If the play is not found (e.g. after a page refresh), renders a friendly
 * "not found" message rather than silently redirecting (#84).
 *
 * Bug fix: The original implementation had `currentPlay` in the useEffect deps
 * while also calling `setCurrentPlay` inside the effect. This created an infinite
 * render loop ("Maximum update depth exceeded") on page refresh because each new
 * default play had a different ID than the URL's playId, causing the effect to
 * run again on every re-render. Fixed by using a useRef guard and reading store
 * state directly via useStore.getState() to avoid the dependency cycle.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useStore, createDefaultPlay, selectEditorScene } from "@/lib/store";
import CourtWithPlayers from "@/components/players/CourtWithPlayers";
import type { CourtVariant } from "@/components/court/Court";
import { COURT_ASPECT_RATIO } from "@/components/court/courtDimensions";
import { loadPlay } from "@/lib/db";
import { useTeam } from "@/contexts/TeamContext";
import { useAuth } from "@/contexts/AuthContext";

interface EditorCourtAreaProps {
  playId?: string;
}

export default function EditorCourtArea({ playId }: EditorCourtAreaProps) {
  const scene = useStore(selectEditorScene);
  const selectedSceneId = useStore((s) => s.selectedSceneId);
  const courtType = useStore((s) => s.currentPlay?.courtType ?? "half");
  const { role } = useTeam();
  const isReadOnly = role === "viewer";
  // Wait for Firebase Auth to restore the previous session before hitting
  // Firestore. Without this, the getDoc call runs before the auth token is
  // available and is rejected by Firestore security rules.
  const { loading: authLoading } = useAuth();

  const [notFound, setNotFound] = useState(false);
  const [loadingFromDb, setLoadingFromDb] = useState(false);

  // Measure the available area height so we can cap the court width to
  // availableHeight × COURT_ASPECT_RATIO. Without this the court overflows
  // vertically on typical laptop screens (e.g. 768px height).
  const areaRef = useRef<HTMLDivElement>(null);
  const [maxCourtWidth, setMaxCourtWidth] = useState<number | undefined>(undefined);
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => {
      if (el) setMaxCourtWidth(Math.round(el.clientHeight * COURT_ASPECT_RATIO));
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Guard: only initialise once to prevent the re-render cycle where setting
  // currentPlay triggers the effect to run again with a non-matching playId.
  const initialized = useRef(false);

  useEffect(() => {
    if (authLoading) return; // auth not yet resolved — wait before touching Firestore
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

      // Not in local store — try Firestore (e.g. after page refresh).
      setLoadingFromDb(true);
      loadPlay(playId)
        .then((remote) => {
          if (remote) {
            const { addPlay, setCurrentPlay, setSelectedSceneId } = useStore.getState();
            addPlay(remote);
            setCurrentPlay(remote);
            setSelectedSceneId(remote.scenes[0]?.id ?? null);
          } else {
            setNotFound(true);
          }
        })
        .catch(() => setNotFound(true))
        .finally(() => setLoadingFromDb(false));
      return;
    }

    // No playId in the URL — bootstrap a new default play (dev convenience).
    const play = createDefaultPlay();
    addPlay(play);
    setCurrentPlay(play);
    setSelectedSceneId(play.scenes[0].id);
  }, [playId, authLoading]);

  if (loadingFromDb) {
    return (
      <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
        <svg
          width={16}
          height={16}
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className="animate-spin"
        >
          <circle cx={12} cy={12} r={10} stroke="currentColor" strokeWidth={3} strokeDasharray="31 31" strokeLinecap="round" />
        </svg>
        Loading play…
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-10 text-center">
        <svg width={48} height={48} viewBox="0 0 48 48" fill="none" aria-hidden="true">
          <circle cx={24} cy={24} r={22} stroke="#E5E7EB" strokeWidth={2} />
          <path d="M24 14v12" stroke="#9CA3AF" strokeWidth={2.5} strokeLinecap="round" />
          <circle cx={24} cy={33} r={1.5} fill="#9CA3AF" />
        </svg>
        <p className="text-base font-semibold text-gray-700">Play not found</p>
        <p className="max-w-xs text-sm text-gray-400">
          This play could not be found. It may have been deleted or you may not have access to it.
          Return to the playbook to open a play or create a new one.
        </p>
        <Link
          href="/playbook"
          className="mt-1 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
        >
          Back to Playbook
        </Link>
      </div>
    );
  }

  return (
    /*
     * Outer div fills the flex parent and measures available height so the
     * inner court is capped to availableHeight × COURT_ASPECT_RATIO — this
     * prevents the court from overflowing vertically on laptop screens.
     */
    <div ref={areaRef} className="flex h-full w-full items-center justify-center">
      <div style={{ width: "100%", maxWidth: maxCourtWidth ?? "100%" }}>
        <CourtWithPlayers
          sceneId={selectedSceneId ?? scene?.id}
          scene={scene}
          variant={courtType as CourtVariant}
          className="w-full max-w-full md:max-w-xl lg:max-w-3xl"
          readOnly={isReadOnly}
        />
      </div>
    </div>
  );
}
