"use client";

/**
 * PlaybookPage — the home/dashboard screen for the playbook.
 *
 * Implements issues #67 and #69:
 *   #67 — "New Play" button opens NewPlayModal to create a play with
 *          title, description, court type, and category.
 *   #69 — Grid view showing all plays as PlayCard thumbnails.
 *
 * State is stored in the Zustand store (Firebase comes later in #45/#68).
 */

import { useState } from "react";
import { useStore } from "@/lib/store";
import NewPlayModal from "@/components/playbook/NewPlayModal";
import PlayCard from "@/components/playbook/PlayCard";

export default function PlaybookPage() {
  const plays = useStore((s) => s.plays);
  const [showModal, setShowModal] = useState(false);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#F9FAFB",
      }}
    >
      {/* Header */}
      <header
        style={{
          borderBottom: "1px solid #E5E7EB",
          background: "#fff",
          padding: "0 24px",
        }}
      >
        <div
          style={{
            maxWidth: 1280,
            margin: "0 auto",
            height: 60,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Basketball icon */}
            <svg
              width={24}
              height={24}
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <circle cx={12} cy={12} r={10} fill="#F97316" />
              <path
                d="M12 2 A10 10 0 0 1 22 12"
                stroke="#fff"
                strokeWidth={1.5}
                fill="none"
              />
              <path
                d="M2 12 A10 10 0 0 1 12 2"
                stroke="#fff"
                strokeWidth={1.5}
                fill="none"
              />
              <line x1={12} y1={2} x2={12} y2={22} stroke="#fff" strokeWidth={1.5} />
              <line x1={2} y1={12} x2={22} y2={12} stroke="#fff" strokeWidth={1.5} />
              <path
                d="M4.9 5.6 Q12 10 19.1 5.6"
                stroke="#fff"
                strokeWidth={1.2}
                fill="none"
              />
              <path
                d="M4.9 18.4 Q12 14 19.1 18.4"
                stroke="#fff"
                strokeWidth={1.2}
                fill="none"
              />
            </svg>
            <h1
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 700,
                color: "#111827",
                letterSpacing: "-0.01em",
              }}
            >
              Playbook
            </h1>
          </div>

          <button
            onClick={() => setShowModal(true)}
            aria-label="Create new play"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 18px",
              borderRadius: 8,
              border: "none",
              background: "#4F46E5",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#4338CA"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#4F46E5"; }}
          >
            <span style={{ fontSize: 18, lineHeight: 1, marginTop: -1 }}>+</span>
            New Play
          </button>
        </div>
      </header>

      {/* Content */}
      <div
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          padding: "32px 24px",
        }}
      >
        {plays.length === 0 ? (
          /* Empty state */
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 360,
              gap: 16,
              textAlign: "center",
            }}
          >
            {/* Court illustration */}
            <svg
              width={100}
              height={94}
              viewBox="0 0 100 94"
              aria-hidden="true"
              style={{ opacity: 0.25 }}
            >
              <rect width={100} height={94} fill="#F0C878" rx={8} />
              <rect x={32} y={56} width={36} height={38} fill="#E07B39" />
              <rect width={100} height={94} fill="none" stroke="#9CA3AF" strokeWidth={2} rx={8} />
              <line x1={32} y1={56} x2={68} y2={56} stroke="#9CA3AF" strokeWidth={1.5} />
              <path
                d="M 6,66 L 6,56 A 47.6,44.7 0 0 1 94,56 L 94,66"
                fill="none"
                stroke="#9CA3AF"
                strokeWidth={1.5}
              />
              <circle cx={50} cy={83} r={4} fill="none" stroke="#9CA3AF" strokeWidth={1.5} />
            </svg>

            <div>
              <p
                style={{
                  margin: "0 0 6px",
                  fontSize: 18,
                  fontWeight: 600,
                  color: "#374151",
                }}
              >
                No plays yet
              </p>
              <p
                style={{
                  margin: "0 0 20px",
                  fontSize: 14,
                  color: "#9CA3AF",
                }}
              >
                Create your first play to get started.
              </p>
              <button
                onClick={() => setShowModal(true)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "10px 22px",
                  borderRadius: 8,
                  border: "none",
                  background: "#4F46E5",
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <span style={{ fontSize: 18, lineHeight: 1, marginTop: -1 }}>+</span>
                Create Play
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Stats bar */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 24,
              }}
            >
              <p style={{ margin: 0, fontSize: 14, color: "#6B7280" }}>
                {plays.length} {plays.length === 1 ? "play" : "plays"}
              </p>
            </div>

            {/* Grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: 20,
              }}
            >
              {[...plays]
                .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
                .map((play) => (
                  <PlayCard key={play.id} play={play} />
                ))}
            </div>
          </>
        )}
      </div>

      {/* New Play Modal */}
      {showModal && <NewPlayModal onClose={() => setShowModal(false)} />}
    </main>
  );
}
