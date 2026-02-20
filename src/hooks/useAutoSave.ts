"use client";

/**
 * useAutoSave — debounced Firestore sync for the current play.
 *
 * Implements issue #68: auto-save with 1.5 s debounce.
 *
 * Subscribes to Zustand store changes. Whenever the currentPlay changes
 * (player position drag end, annotation added, scene note edited, etc.)
 * this hook debounces a Firestore write.
 *
 * Save states:
 *   "idle"    — no pending save
 *   "pending" — debounce timer running (local change not yet written)
 *   "saving"  — Firestore write in flight
 *   "saved"   — last write succeeded
 *   "error"   — last write failed (network issue)
 */

import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { savePlay } from "@/lib/db";
import { useAuth } from "@/contexts/AuthContext";

export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

const DEBOUNCE_MS = 1500;

export function useAutoSave(): SaveStatus {
  const { user } = useAuth();
  const [status, setStatus] = useState<SaveStatus>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track the last play ID so we reset state on play switch
  const lastPlayIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Subscribe to currentPlay changes in the Zustand store
    const unsub = useStore.subscribe(
      (state) => state.currentPlay,
      (currentPlay) => {
        if (!currentPlay || !user) return;

        // If the play changed entirely, reset state
        if (currentPlay.id !== lastPlayIdRef.current) {
          lastPlayIdRef.current = currentPlay.id;
          setStatus("idle");
          if (timerRef.current) clearTimeout(timerRef.current);
          return;
        }

        // Debounce — cancel the previous timer and restart
        if (timerRef.current) clearTimeout(timerRef.current);
        setStatus("pending");

        const snapshot = { ...currentPlay };
        timerRef.current = setTimeout(async () => {
          setStatus("saving");
          try {
            await savePlay(snapshot);
            setStatus("saved");
          } catch {
            setStatus("error");
          }
        }, DEBOUNCE_MS);
      },
    );

    return () => {
      unsub();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [user]);

  return status;
}
