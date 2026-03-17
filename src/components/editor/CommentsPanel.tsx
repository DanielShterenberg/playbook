"use client";

/**
 * CommentsPanel — slide-in drawer for scene/play-level comments.
 *
 * Implements issue #133: scene comments with threading and resolve.
 *
 * Features:
 *   - Real-time updates via Firestore onSnapshot
 *   - Filter: current scene vs. all scenes
 *   - Add top-level comment + inline replies
 *   - Resolve / reopen comments
 *   - Delete own comments
 *   - Per-scene comment dot indicator data exposed via onCountsChange callback
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  subscribeToComments,
  addComment,
  addReply,
  resolveComment,
  unresolveComment,
  deleteComment,
} from "@/lib/comments";
import type { Comment } from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function authorInitial(name: string): string {
  return (name?.[0] ?? "?").toUpperCase();
}

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------

function Avatar({ name }: { name: string }) {
  const colors = [
    "#4F46E5", "#0891B2", "#059669", "#D97706",
    "#DC2626", "#7C3AED", "#DB2777", "#2563EB",
  ];
  const color = colors[name.charCodeAt(0) % colors.length];
  return (
    <div
      style={{
        width: 28,
        height: 28,
        borderRadius: "50%",
        background: color,
        color: "#fff",
        fontSize: 12,
        fontWeight: 700,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {authorInitial(name)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ReplyItem
// ---------------------------------------------------------------------------

function ReplyItem({ reply }: { reply: Comment["replies"][number] }) {
  return (
    <div style={{ display: "flex", gap: 8, padding: "6px 0" }}>
      <Avatar name={reply.authorName} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{reply.authorName}</span>
          <span style={{ fontSize: 11, color: "#9CA3AF" }}>{formatTime(reply.createdAt)}</span>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: "#374151", lineHeight: 1.45, wordBreak: "break-word" }}>
          {reply.text}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CommentItem
// ---------------------------------------------------------------------------

interface CommentItemProps {
  comment: Comment;
  currentUserId: string | null;
  sceneLabel: string | null; // e.g. "Scene 2" or null when filtering by scene
}

function CommentItem({ comment, currentUserId, sceneLabel }: CommentItemProps) {
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [submittingReply, setSubmittingReply] = useState(false);
  const [toggling, setToggling] = useState(false);
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (showReply) replyRef.current?.focus();
  }, [showReply]);

  const handleReply = async () => {
    if (!replyText.trim() || !user) return;
    setSubmittingReply(true);
    try {
      await addReply(
        comment.id,
        user.uid,
        user.displayName ?? user.email ?? "User",
        replyText,
      );
      setReplyText("");
      setShowReply(false);
    } finally {
      setSubmittingReply(false);
    }
  };

  const handleToggleResolve = async () => {
    if (toggling || !currentUserId) return;
    setToggling(true);
    try {
      if (comment.resolved) {
        await unresolveComment(comment.id);
      } else {
        await resolveComment(comment.id, currentUserId);
      }
    } finally {
      setToggling(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Delete this comment?")) return;
    await deleteComment(comment.id);
  };

  return (
    <div
      style={{
        padding: "10px 12px",
        borderBottom: "1px solid #F3F4F6",
        opacity: comment.resolved ? 0.6 : 1,
        transition: "opacity 0.15s",
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <Avatar name={comment.authorName} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{comment.authorName}</span>
            <span style={{ fontSize: 11, color: "#9CA3AF" }}>{formatTime(comment.createdAt)}</span>
            {sceneLabel && (
              <span style={{
                fontSize: 10,
                fontWeight: 600,
                padding: "1px 6px",
                borderRadius: 99,
                background: "#EFF6FF",
                color: "#3B82F6",
                letterSpacing: "0.02em",
              }}>
                {sceneLabel}
              </span>
            )}
            {comment.resolved && (
              <span style={{
                fontSize: 10,
                fontWeight: 600,
                padding: "1px 6px",
                borderRadius: 99,
                background: "#F0FDF4",
                color: "#16A34A",
              }}>
                Resolved
              </span>
            )}
          </div>

          <p style={{ margin: "3px 0 6px", fontSize: 13, color: "#1F2937", lineHeight: 1.5, wordBreak: "break-word" }}>
            {comment.text}
          </p>

          {/* Action row */}
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              onClick={() => setShowReply((v) => !v)}
              style={{
                fontSize: 11,
                color: showReply ? "#4F46E5" : "#6B7280",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
                fontWeight: 500,
              }}
            >
              Reply{comment.replies.length > 0 ? ` (${comment.replies.length})` : ""}
            </button>

            <button
              onClick={handleToggleResolve}
              disabled={toggling || !currentUserId}
              style={{
                fontSize: 11,
                color: comment.resolved ? "#6B7280" : "#059669",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
                fontWeight: 500,
                opacity: toggling ? 0.5 : 1,
              }}
            >
              {comment.resolved ? "Reopen" : "Resolve"}
            </button>

            {comment.authorId === currentUserId && (
              <button
                onClick={handleDelete}
                style={{
                  fontSize: 11,
                  color: "#EF4444",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  fontWeight: 500,
                  marginLeft: "auto",
                }}
              >
                Delete
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Replies */}
      {comment.replies.length > 0 && (
        <div style={{ marginLeft: 36, marginTop: 6, borderLeft: "2px solid #F3F4F6", paddingLeft: 10 }}>
          {comment.replies.map((r) => (
            <ReplyItem key={r.id} reply={r} />
          ))}
        </div>
      )}

      {/* Reply input */}
      {showReply && (
        <div style={{ marginLeft: 36, marginTop: 8 }}>
          <textarea
            ref={replyRef}
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleReply();
              if (e.key === "Escape") { setShowReply(false); setReplyText(""); }
            }}
            placeholder="Write a reply…"
            rows={2}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "6px 8px",
              border: "1.5px solid #D1D5DB",
              borderRadius: 6,
              fontSize: 12,
              color: "#111827",
              resize: "none",
              fontFamily: "inherit",
              outline: "none",
            }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 4 }}>
            <button
              onClick={() => { setShowReply(false); setReplyText(""); }}
              style={{
                fontSize: 12,
                padding: "3px 10px",
                borderRadius: 5,
                border: "1px solid #D1D5DB",
                background: "#fff",
                cursor: "pointer",
                color: "#6B7280",
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleReply}
              disabled={!replyText.trim() || submittingReply}
              style={{
                fontSize: 12,
                padding: "3px 10px",
                borderRadius: 5,
                border: "none",
                background: "#4F46E5",
                color: "#fff",
                cursor: "pointer",
                fontWeight: 600,
                opacity: !replyText.trim() || submittingReply ? 0.5 : 1,
              }}
            >
              Reply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CommentsPanel
// ---------------------------------------------------------------------------

export interface CommentsPanelProps {
  playId: string;
  /** Currently selected scene ID (used for "This scene" filter). */
  selectedSceneId: string | null;
  /** Map of sceneId → total (unresolved) comment count for dot indicators. */
  onCountsChange?: (counts: Record<string, number>) => void;
  onClose: () => void;
  /** Optional lookup: sceneId → display label ("Scene 1", etc.) */
  sceneLabels?: Record<string, string>;
}

export default function CommentsPanel({
  playId,
  selectedSceneId,
  onCountsChange,
  onClose,
  sceneLabels = {},
}: CommentsPanelProps) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [filter, setFilter] = useState<"scene" | "all">("scene");
  const [newText, setNewText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Real-time subscription
  useEffect(() => {
    if (!playId) return;
    const unsub = subscribeToComments(playId, setComments);
    return unsub;
  }, [playId]);

  // Notify parent of per-scene unresolved counts
  useEffect(() => {
    if (!onCountsChange) return;
    const counts: Record<string, number> = {};
    for (const c of comments) {
      if (c.sceneId && !c.resolved) {
        counts[c.sceneId] = (counts[c.sceneId] ?? 0) + 1;
      }
    }
    onCountsChange(counts);
  }, [comments, onCountsChange]);

  const filtered = filter === "scene"
    ? comments.filter((c) => c.sceneId === selectedSceneId)
    : comments;

  const handleAdd = useCallback(async () => {
    if (!newText.trim() || !user || submitting) return;
    setSubmitting(true);
    try {
      await addComment(
        playId,
        filter === "scene" ? selectedSceneId : null,
        null,
        user.uid,
        user.displayName ?? user.email ?? "User",
        newText,
      );
      setNewText("");
      // Scroll to bottom after adding
      setTimeout(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
      }, 100);
    } finally {
      setSubmitting(false);
    }
  }, [newText, user, submitting, playId, filter, selectedSceneId]);

  const openCount = filtered.filter((c) => !c.resolved).length;
  const resolvedCount = filtered.filter((c) => c.resolved).length;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: 320,
        background: "#fff",
        borderLeft: "1px solid #E5E7EB",
        boxShadow: "-4px 0 24px rgba(0,0,0,0.08)",
        zIndex: 80,
        display: "flex",
        flexDirection: "column",
      }}
      aria-label="Comments panel"
    >
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 14px",
        borderBottom: "1px solid #E5E7EB",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>Comments</span>
          {openCount > 0 && (
            <span style={{
              fontSize: 11,
              fontWeight: 700,
              padding: "1px 6px",
              borderRadius: 99,
              background: "#FEF3C7",
              color: "#D97706",
            }}>
              {openCount}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="Close comments"
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            border: "none",
            background: "none",
            cursor: "pointer",
            color: "#6B7280",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width={14} height={14} viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Filter tabs */}
      <div style={{
        display: "flex",
        borderBottom: "1px solid #E5E7EB",
        flexShrink: 0,
      }}>
        {(["scene", "all"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            style={{
              flex: 1,
              padding: "8px 0",
              fontSize: 12,
              fontWeight: filter === tab ? 600 : 500,
              color: filter === tab ? "#4F46E5" : "#6B7280",
              background: "none",
              border: "none",
              borderBottom: filter === tab ? "2px solid #4F46E5" : "2px solid transparent",
              cursor: "pointer",
              transition: "color 0.1s, border-color 0.1s",
            }}
          >
            {tab === "scene" ? "This Scene" : "All Scenes"}
          </button>
        ))}
      </div>

      {/* Comment list */}
      <div
        ref={listRef}
        style={{ flex: 1, overflowY: "auto", minHeight: 0 }}
      >
        {filtered.length === 0 ? (
          <div style={{
            padding: "40px 20px",
            textAlign: "center",
            color: "#9CA3AF",
            fontSize: 13,
          }}>
            {filter === "scene"
              ? "No comments on this scene yet.\nBe the first to add one!"
              : "No comments on this play yet."}
          </div>
        ) : (
          <>
            {filtered.filter((c) => !c.resolved).map((c) => (
              <CommentItem
                key={c.id}
                comment={c}
                currentUserId={user?.uid ?? null}
                sceneLabel={filter === "all" && c.sceneId ? (sceneLabels[c.sceneId] ?? null) : null}
              />
            ))}
            {resolvedCount > 0 && (
              <>
                <div style={{
                  padding: "6px 12px",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#9CA3AF",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  background: "#F9FAFB",
                }}>
                  Resolved ({resolvedCount})
                </div>
                {filtered.filter((c) => c.resolved).map((c) => (
                  <CommentItem
                    key={c.id}
                    comment={c}
                    currentUserId={user?.uid ?? null}
                    sceneLabel={filter === "all" && c.sceneId ? (sceneLabels[c.sceneId] ?? null) : null}
                  />
                ))}
              </>
            )}
          </>
        )}
      </div>

      {/* Add comment */}
      <div style={{
        borderTop: "1px solid #E5E7EB",
        padding: "10px 12px",
        flexShrink: 0,
        background: "#FAFAFA",
      }}>
        <textarea
          ref={textareaRef}
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleAdd();
          }}
          placeholder={
            filter === "scene"
              ? "Add a comment on this scene…"
              : "Add a play-level comment…"
          }
          rows={2}
          disabled={!user}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "7px 10px",
            border: "1.5px solid #D1D5DB",
            borderRadius: 7,
            fontSize: 13,
            color: "#111827",
            resize: "none",
            fontFamily: "inherit",
            outline: "none",
            background: user ? "#fff" : "#F3F4F6",
          }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
          <span style={{ fontSize: 10, color: "#C4C4C4" }}>Ctrl+Enter to send</span>
          <button
            onClick={handleAdd}
            disabled={!newText.trim() || !user || submitting}
            style={{
              fontSize: 12,
              padding: "5px 14px",
              borderRadius: 6,
              border: "none",
              background: "#4F46E5",
              color: "#fff",
              fontWeight: 600,
              cursor: "pointer",
              opacity: !newText.trim() || !user || submitting ? 0.4 : 1,
              transition: "opacity 0.1s",
            }}
          >
            {submitting ? "…" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}
