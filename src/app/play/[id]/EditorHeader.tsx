"use client";

/**
 * EditorHeader — client component for the play editor page header.
 *
 * Shows:
 *   - Back arrow to /playbook (syncs currentPlay changes back to the list)
 *   - Current play title (from the Zustand store) or the raw play ID
 *   - Pencil edit button to edit play metadata (title, description, category, court type) — issue #71
 *   - Slot for action buttons (passed as children by the server page)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import type { Category, CourtType } from "@/lib/types";
import { exportPlayToPdf } from "@/lib/exportPdf";
import { useAuth } from "@/contexts/AuthContext";
import { createShareToken } from "@/lib/team";

const CATEGORY_OPTIONS: { value: Category; label: string }[] = [
  { value: "offense", label: "Offense" },
  { value: "defense", label: "Defense" },
  { value: "inbound", label: "Inbound" },
  { value: "press-break", label: "Press Break" },
  { value: "fast-break", label: "Fast Break" },
  { value: "oob", label: "Out of Bounds" },
  { value: "special", label: "Special" },
];

interface EditorHeaderProps {
  playId: string;
  children?: React.ReactNode;
}

export default function EditorHeader({ playId, children }: EditorHeaderProps) {
  const { user } = useAuth();
  const currentPlay = useStore((s) => s.currentPlay);
  const updatePlayInList = useStore((s) => s.updatePlayInList);
  const updatePlayMeta = useStore((s) => s.updatePlayMeta);

  const title = currentPlay?.title ?? null;

  // When navigating away, sync any in-flight changes back to the plays list.
  const handleBack = useCallback(() => {
    if (currentPlay) {
      updatePlayInList(currentPlay);
    }
  }, [currentPlay, updatePlayInList]);

  // ---------------------------------------------------------------------------
  // Edit metadata modal
  // ---------------------------------------------------------------------------

  const [isExporting, setIsExporting] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  async function handleExportPdf() {
    if (!currentPlay || isExporting) return;
    setIsExporting(true);
    try {
      await exportPlayToPdf(currentPlay);
    } finally {
      setIsExporting(false);
    }
  }

  async function handleShare() {
    if (!currentPlay || !user || isSharing) return;
    setIsSharing(true);
    setShareMsg(null);
    try {
      const token = await createShareToken(currentPlay, user.uid);
      const url = `${window.location.origin}/view/${token}`;
      await navigator.clipboard.writeText(url);
      setShareMsg("Link copied!");
    } catch {
      setShareMsg("Failed to create link");
    } finally {
      setIsSharing(false);
      setTimeout(() => setShareMsg(null), 3000);
    }
  }

  const [showEdit, setShowEdit] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editCategory, setEditCategory] = useState<Category>("offense");
  const [editCourtType, setEditCourtType] = useState<CourtType>("half");
  const [editError, setEditError] = useState("");

  const titleInputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  function openEdit() {
    if (!currentPlay) return;
    setEditTitle(currentPlay.title);
    setEditDesc(currentPlay.description);
    setEditCategory(currentPlay.category);
    setEditCourtType(currentPlay.courtType);
    setEditError("");
    setShowEdit(true);
  }

  useEffect(() => {
    if (showEdit) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [showEdit]);

  useEffect(() => {
    if (!showEdit) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setShowEdit(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [showEdit]);

  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === overlayRef.current) setShowEdit(false);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = editTitle.trim();
    if (!trimmed) {
      setEditError("Title is required.");
      titleInputRef.current?.focus();
      return;
    }
    const patch = { title: trimmed, description: editDesc, category: editCategory, courtType: editCourtType };
    updatePlayMeta(patch);
    // Sync immediately to the plays list so the playbook grid reflects the update.
    if (currentPlay) {
      updatePlayInList({ ...currentPlay, ...patch, updatedAt: new Date() });
    }
    setShowEdit(false);
  }

  return (
    <>
      <header className="flex min-w-0 items-center justify-between border-b border-gray-200 bg-white px-3 py-2 md:px-4">
        <div className="flex min-w-0 items-center gap-2">
          {/* Back to playbook */}
          <Link
            href="/playbook"
            onClick={handleBack}
            aria-label="Back to playbook"
            className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors"
            title="Back to Playbook"
          >
            <svg
              width={16}
              height={16}
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M10 3L5 8L10 13"
                stroke="currentColor"
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>

          <div className="mx-1 h-4 w-px bg-gray-200 flex-shrink-0" aria-hidden="true" />

          <h1 className="truncate text-base font-semibold text-gray-900 md:text-lg">
            {title ? (
              <>
                <span className="hidden sm:inline text-gray-400 font-normal">Playbook / </span>
                {title}
              </>
            ) : (
              <>
                <span className="hidden sm:inline">Play Editor — </span>
                <span className="font-mono text-gray-500">{playId}</span>
              </>
            )}
          </h1>

          {/* Edit metadata button */}
          {currentPlay && (
            <button
              onClick={openEdit}
              aria-label="Edit play details"
              title="Edit play details"
              className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
            >
              <svg width={14} height={14} viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path
                  d="M13.586 3.586a2 2 0 1 1 2.828 2.828l-9 9A2 2 0 0 1 6 16H4a1 1 0 0 1-1-1v-2a2 2 0 0 1 .586-1.414l9-9z"
                  stroke="currentColor"
                  strokeWidth={1.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* PDF export */}
          <button
            onClick={handleExportPdf}
            disabled={!currentPlay || isExporting}
            aria-label="Export play as PDF"
            title="Export as PDF"
            className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isExporting ? (
              <svg
                width={13}
                height={13}
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
                className="animate-spin"
              >
                <circle cx={12} cy={12} r={10} stroke="currentColor" strokeWidth={3} strokeDasharray="31.4 31.4" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width={13} height={13} viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path
                  d="M3 16.5A1.5 1.5 0 0 0 4.5 18h11A1.5 1.5 0 0 0 17 16.5V7l-4-4H4.5A1.5 1.5 0 0 0 3 4.5v12z"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                />
                <path d="M13 3v3.5A1.5 1.5 0 0 0 14.5 8H17" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
                <path d="M7 13l3 3 3-3M10 16V9" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            {isExporting ? "Exporting…" : "PDF"}
          </button>

          {/* Share button (#78) */}
          <button
            onClick={handleShare}
            disabled={!currentPlay || !user || isSharing}
            aria-label="Share play"
            title="Create a shareable read-only link"
            className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isSharing ? (
              <svg
                width={11}
                height={11}
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
                className="animate-spin"
              >
                <circle cx={12} cy={12} r={10} stroke="currentColor" strokeWidth={3} strokeDasharray="31.4 31.4" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width={11} height={11} viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M13 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM7 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM13 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                <path d="M9 8.5l3-2M9 11.5l3 2" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
              </svg>
            )}
            {shareMsg ?? (isSharing ? "Sharing…" : "Share")}
          </button>

          {children}
        </div>
      </header>

      {/* Edit play modal */}
      {showEdit && (
        <div
          ref={overlayRef}
          onClick={handleOverlayClick}
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-play-title"
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
              id="edit-play-title"
              style={{ margin: "0 0 20px", fontSize: 20, fontWeight: 700, color: "#111827" }}
            >
              Edit Play
            </h2>

            <form onSubmit={handleSave} noValidate>
              {/* Title */}
              <div style={{ marginBottom: 16 }}>
                <label
                  htmlFor="edit-title"
                  style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}
                >
                  Title <span style={{ color: "#EF4444" }}>*</span>
                </label>
                <input
                  id="edit-title"
                  ref={titleInputRef}
                  type="text"
                  value={editTitle}
                  onChange={(e) => { setEditTitle(e.target.value); if (editError) setEditError(""); }}
                  placeholder="e.g. Horns Set, Box Out, 1-3-1 Zone"
                  maxLength={80}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "8px 12px",
                    border: editError ? "1.5px solid #EF4444" : "1.5px solid #D1D5DB",
                    borderRadius: 8,
                    fontSize: 14,
                    color: "#111827",
                    outline: "none",
                  }}
                />
                {editError && (
                  <p role="alert" style={{ marginTop: 4, fontSize: 12, color: "#EF4444" }}>
                    {editError}
                  </p>
                )}
              </div>

              {/* Description */}
              <div style={{ marginBottom: 16 }}>
                <label
                  htmlFor="edit-description"
                  style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}
                >
                  Description <span style={{ color: "#9CA3AF", fontWeight: 400 }}>(optional)</span>
                </label>
                <textarea
                  id="edit-description"
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  placeholder="Brief notes about this play…"
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
                <div>
                  <label
                    htmlFor="edit-court-type"
                    style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}
                  >
                    Court
                  </label>
                  <select
                    id="edit-court-type"
                    value={editCourtType}
                    onChange={(e) => setEditCourtType(e.target.value as CourtType)}
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

                <div>
                  <label
                    htmlFor="edit-category"
                    style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}
                  >
                    Category
                  </label>
                  <select
                    id="edit-category"
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value as Category)}
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
                  onClick={() => setShowEdit(false)}
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
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
