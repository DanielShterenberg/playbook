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
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  FIELD,
  FIELD_BORDER,
  FIELD_BORDER_ERROR,
  FIELD_ERROR,
  FIELD_LABEL,
  MODAL_OVERLAY,
  MODAL_PANEL,
  MODAL_TITLE,
} from "./modalStyles";

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
      className={MODAL_OVERLAY}
    >
      <div className={`${MODAL_PANEL} max-w-[420px]`}>
        <h2 id="create-team-title" className={`${MODAL_TITLE} mb-1.5`}>
          Create Team
        </h2>
        <p className="m-0 mb-5 text-sm text-muted">
          Create a team to collaborate on plays with your coaching staff.
        </p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="mb-5">
            <label htmlFor="team-name" className={FIELD_LABEL}>
              Team name <span className="text-danger">*</span>
            </label>
            <input
              id="team-name"
              ref={nameRef}
              type="text"
              dir="auto"
              value={name}
              onChange={(e) => { setName(e.target.value); if (error) setError(""); }}
              placeholder="e.g. Lakers Coaching Staff"
              maxLength={60}
              aria-invalid={error ? true : undefined}
              className={`${FIELD} h-11 ${error ? FIELD_BORDER_ERROR : FIELD_BORDER}`}
            />
            {error && (
              <p role="alert" className={FIELD_ERROR}>
                {error}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2.5">
            <button type="button" onClick={onClose} disabled={loading} className={BTN_SECONDARY}>
              Cancel
            </button>
            <button type="submit" disabled={loading} className={BTN_PRIMARY}>
              {loading ? "Creating…" : "Create Team"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
