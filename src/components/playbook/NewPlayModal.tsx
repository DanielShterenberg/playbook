"use client";

/**
 * NewPlayModal — dialog for creating a new play.
 *
 * Implements issue #67: Create new play with properties.
 *
 * Fields:
 *   - Title (required)
 *   - Description (optional)
 *   - Court type: half / full
 *   - Category: offense / defense / inbound / press-break / fast-break / oob / special
 *
 * On submit: creates a Play via createDefaultPlay, adds it to the plays list,
 * then navigates to /play/[id] to open the editor.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { createDefaultPlay } from "@/lib/store";
import type { Category, CourtType } from "@/lib/types";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/contexts/TeamContext";
import { savePlay } from "@/lib/db";

interface NewPlayModalProps {
  onClose: () => void;
}

const CATEGORY_OPTIONS: { value: Category; label: string }[] = [
  { value: "offense", label: "Offense" },
  { value: "defense", label: "Defense" },
  { value: "inbound", label: "Inbound" },
  { value: "press-break", label: "Press Break" },
  { value: "fast-break", label: "Fast Break" },
  { value: "oob", label: "Out of Bounds" },
  { value: "special", label: "Special" },
];

export default function NewPlayModal({ onClose }: NewPlayModalProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { teamId } = useTeam();
  const addPlay = useStore((s) => s.addPlay);
  const setCurrentPlay = useStore((s) => s.setCurrentPlay);
  const setSelectedSceneId = useStore((s) => s.setSelectedSceneId);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [courtType, setCourtType] = useState<CourtType>("half");
  const [category, setCategory] = useState<Category>("offense");
  const [error, setError] = useState("");

  const titleRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Focus title on open
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === overlayRef.current) onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Title is required.");
      titleRef.current?.focus();
      return;
    }

    const play = createDefaultPlay();
    play.title = trimmed;
    play.description = description.trim();
    play.courtType = courtType;
    play.category = category;
    if (user) play.createdBy = user.uid;
    if (teamId) play.teamId = teamId;

    addPlay(play);
    setCurrentPlay(play);
    setSelectedSceneId(play.scenes[0].id);

    // Persist to Firestore in the background — don't block navigation
    savePlay(play).catch((err) => console.error("[Firestore] savePlay failed:", err));

    router.push(`/play/${play.id}`);
    onClose();
  }

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-play-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
          width: "100%",
          maxWidth: 460,
          padding: "28px 28px 24px",
        }}
      >
        <h2
          id="new-play-title"
          style={{
            margin: "0 0 20px",
            fontSize: 20,
            fontWeight: 700,
            color: "#111827",
          }}
        >
          New Play
        </h2>

        <form onSubmit={handleSubmit} noValidate>
          {/* Title */}
          <div style={{ marginBottom: 16 }}>
            <label
              htmlFor="play-title"
              style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}
            >
              Title <span style={{ color: "#EF4444" }}>*</span>
            </label>
            <input
              id="play-title"
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (error) setError("");
              }}
              placeholder="e.g. Horns Set, Box Out, 1-3-1 Zone"
              maxLength={80}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "8px 12px",
                border: error ? "1.5px solid #EF4444" : "1.5px solid #D1D5DB",
                borderRadius: 8,
                fontSize: 14,
                color: "#111827",
                outline: "none",
              }}
            />
            {error && (
              <p role="alert" style={{ marginTop: 4, fontSize: 12, color: "#EF4444" }}>
                {error}
              </p>
            )}
          </div>

          {/* Description */}
          <div style={{ marginBottom: 16 }}>
            <label
              htmlFor="play-description"
              style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}
            >
              Description <span style={{ color: "#9CA3AF", fontWeight: 400 }}>(optional)</span>
            </label>
            <textarea
              id="play-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief notes about this play..."
              rows={2}
              maxLength={300}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "8px 12px",
                border: "1.5px solid #D1D5DB",
                borderRadius: 8,
                fontSize: 14,
                color: "#111827",
                resize: "vertical",
                outline: "none",
                fontFamily: "inherit",
              }}
            />
          </div>

          {/* Court type + Category row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
            {/* Court type */}
            <div>
              <label
                htmlFor="play-court-type"
                style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}
              >
                Court
              </label>
              <select
                id="play-court-type"
                value={courtType}
                onChange={(e) => setCourtType(e.target.value as CourtType)}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "8px 10px",
                  border: "1.5px solid #D1D5DB",
                  borderRadius: 8,
                  fontSize: 14,
                  color: "#111827",
                  background: "#fff",
                  outline: "none",
                  cursor: "pointer",
                }}
              >
                <option value="half">Half Court</option>
                <option value="full">Full Court</option>
              </select>
            </div>

            {/* Category */}
            <div>
              <label
                htmlFor="play-category"
                style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}
              >
                Category
              </label>
              <select
                id="play-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as Category)}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "8px 10px",
                  border: "1.5px solid #D1D5DB",
                  borderRadius: 8,
                  fontSize: 14,
                  color: "#111827",
                  background: "#fff",
                  outline: "none",
                  cursor: "pointer",
                }}
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "8px 18px",
                borderRadius: 8,
                border: "1.5px solid #D1D5DB",
                background: "#fff",
                fontSize: 14,
                fontWeight: 500,
                color: "#374151",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                padding: "8px 22px",
                borderRadius: 8,
                border: "none",
                background: "#4F46E5",
                fontSize: 14,
                fontWeight: 600,
                color: "#fff",
                cursor: "pointer",
              }}
            >
              Create Play
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
