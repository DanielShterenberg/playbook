"use client";

/**
 * SharedPlayViewPage — public read-only play viewer.
 *
 * Implements issue #78: share link → read-only animated view.
 *
 * URL: /view/[shareToken]
 *
 * No authentication required. Loads a play snapshot from
 * sharedPlays/{shareToken} (publicly readable in Firestore rules)
 * and renders a read-only version of the editor court.
 */

import { useEffect, useState } from "react";
import { loadSharedPlay } from "@/lib/team";
import type { Play } from "@/lib/types";
import CourtWithPlayers from "@/components/players/CourtWithPlayers";
import type { CourtVariant } from "@/components/court/Court";

interface SharedPlayViewPageProps {
  params: { shareToken: string };
}

export default function SharedPlayViewPage({ params }: SharedPlayViewPageProps) {
  const { shareToken } = params;
  const [play, setPlay] = useState<Play | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [sceneIndex, setSceneIndex] = useState(0);

  useEffect(() => {
    loadSharedPlay(shareToken)
      .then((p) => {
        if (p) {
          setPlay(p);
        } else {
          setNotFound(true);
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [shareToken]);

  if (loading) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "#F9FAFB",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          color: "#6B7280",
          fontSize: 15,
        }}
      >
        <svg
          width={18}
          height={18}
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          style={{ animation: "spin 1s linear infinite" }}
        >
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <circle
            cx={12}
            cy={12}
            r={10}
            stroke="currentColor"
            strokeWidth={3}
            strokeDasharray="31 31"
            strokeLinecap="round"
          />
        </svg>
        Loading play…
      </main>
    );
  }

  if (notFound || !play) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "#F9FAFB",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 380 }}>
          <svg width={48} height={48} viewBox="0 0 48 48" fill="none" aria-hidden="true" style={{ margin: "0 auto 16px" }}>
            <circle cx={24} cy={24} r={22} stroke="#E5E7EB" strokeWidth={2} />
            <path d="M24 14v12" stroke="#9CA3AF" strokeWidth={2.5} strokeLinecap="round" />
            <circle cx={24} cy={33} r={1.5} fill="#9CA3AF" />
          </svg>
          <p style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 600, color: "#374151" }}>
            Play not found
          </p>
          <p style={{ margin: 0, fontSize: 14, color: "#9CA3AF" }}>
            This share link may have expired or been deleted.
          </p>
        </div>
      </main>
    );
  }

  const scenes = play.scenes ?? [];
  const scene = scenes[sceneIndex] ?? scenes[0] ?? null;

  return (
    <main style={{ minHeight: "100vh", background: "#F9FAFB", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <header
        style={{
          background: "#fff",
          borderBottom: "1px solid #E5E7EB",
          padding: "0 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 52,
          gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Basketball icon */}
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx={12} cy={12} r={10} fill="#F97316" />
            <line x1={12} y1={2} x2={12} y2={22} stroke="#fff" strokeWidth={1.5} />
            <line x1={2} y1={12} x2={22} y2={12} stroke="#fff" strokeWidth={1.5} />
          </svg>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>{play.title}</span>
        </div>

        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: "3px 10px",
            borderRadius: 99,
            background: "#EEF2FF",
            color: "#4338CA",
            letterSpacing: "0.03em",
          }}
        >
          READ-ONLY
        </span>
      </header>

      {/* Court */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px 16px",
          background: "#F3F4F6",
        }}
      >
        {scene ? (
          <CourtWithPlayers
            sceneId={scene.id}
            scene={scene}
            variant={(play.courtType ?? "half") as CourtVariant}
            className="w-full max-w-xl pointer-events-none"
            readOnly
          />
        ) : (
          <p style={{ color: "#9CA3AF", fontSize: 14 }}>No scenes in this play.</p>
        )}
      </div>

      {/* Scene navigation */}
      {scenes.length > 1 && (
        <div
          style={{
            background: "#fff",
            borderTop: "1px solid #E5E7EB",
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <button
            onClick={() => setSceneIndex((i) => Math.max(0, i - 1))}
            disabled={sceneIndex === 0}
            aria-label="Previous scene"
            style={{
              padding: "6px 16px",
              borderRadius: 8,
              border: "1.5px solid #E5E7EB",
              background: "#fff",
              fontSize: 13,
              fontWeight: 500,
              color: sceneIndex === 0 ? "#D1D5DB" : "#374151",
              cursor: sceneIndex === 0 ? "default" : "pointer",
            }}
          >
            ← Prev
          </button>
          <span style={{ fontSize: 13, color: "#6B7280", minWidth: 80, textAlign: "center" }}>
            Scene {sceneIndex + 1} / {scenes.length}
          </span>
          <button
            onClick={() => setSceneIndex((i) => Math.min(scenes.length - 1, i + 1))}
            disabled={sceneIndex === scenes.length - 1}
            aria-label="Next scene"
            style={{
              padding: "6px 16px",
              borderRadius: 8,
              border: "1.5px solid #E5E7EB",
              background: "#fff",
              fontSize: 13,
              fontWeight: 500,
              color: sceneIndex === scenes.length - 1 ? "#D1D5DB" : "#374151",
              cursor: sceneIndex === scenes.length - 1 ? "default" : "pointer",
            }}
          >
            Next →
          </button>
        </div>
      )}
    </main>
  );
}
