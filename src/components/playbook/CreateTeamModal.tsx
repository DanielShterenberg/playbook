"use client";

/**
 * CreateTeamModal — dialog for creating a new team.
 *
 * Implements issue #74: team creation with name input.
 *
 * On submit: calls createTeam(), then refreshes the TeamContext so the
 * playbook header immediately shows the team name and invite link.
 */

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/contexts/TeamContext";
import { createTeam } from "@/lib/team";

interface CreateTeamModalProps {
  onClose: () => void;
}

export default function CreateTeamModal({ onClose }: CreateTeamModalProps) {
  const { user } = useAuth();
  const { refresh } = useTeam();

  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

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
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Team name is required.");
      nameRef.current?.focus();
      return;
    }
    if (!user) return;

    setLoading(true);
    setError("");
    try {
      await createTeam(trimmed, user.uid);
      refresh();
      onClose();
    } catch {
      setError("Failed to create team. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-team-title"
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
          maxWidth: 420,
          padding: "28px 28px 24px",
        }}
      >
        <h2
          id="create-team-title"
          style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 700, color: "#111827" }}
        >
          Create Team
        </h2>
        <p style={{ margin: "0 0 20px", fontSize: 13, color: "#6B7280" }}>
          Create a team to collaborate on plays with your coaching staff.
        </p>

        <form onSubmit={handleSubmit} noValidate>
          <div style={{ marginBottom: 20 }}>
            <label
              htmlFor="team-name"
              style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}
            >
              Team name <span style={{ color: "#EF4444" }}>*</span>
            </label>
            <input
              id="team-name"
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); if (error) setError(""); }}
              placeholder="e.g. Lakers Coaching Staff"
              maxLength={60}
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

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
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
              disabled={loading}
              style={{
                padding: "8px 22px",
                borderRadius: 8,
                border: "none",
                background: loading ? "#818CF8" : "#4F46E5",
                fontSize: 14,
                fontWeight: 600,
                color: "#fff",
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Creating…" : "Create Team"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
