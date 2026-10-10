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

/**
 * Author colours — identity, not chrome, so they are the same in both themes.
 * Each is dark enough for the white initial (≥ 4.5:1).
 */
const AVATAR_COLORS = [
  "#4338CA", "#0E7490", "#047857", "#B45309",
  "#B91C1C", "#6D28D9", "#BE185D", "#1D4ED8",
];

function Avatar({ name }: { name: string }) {
  const color = AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
  return (
    <div
      className="flex h-7 w-7 flex-none items-center justify-center rounded-full text-xs font-bold text-white"
      style={{ background: color }}
    >
      {authorInitial(name)}
    </div>
  );
}

const TAG = "rounded-full bg-chip px-1.5 py-px text-[11px] font-semibold";
const LINK_BTN = "flex min-h-11 items-center text-xs font-medium disabled:opacity-50 md:min-h-7";
const SMALL_BTN = "flex h-11 items-center rounded-lg px-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 md:h-8";
const TEXTAREA =
  "w-full resize-none rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-[13px] text-ink outline-none placeholder:text-muted focus:border-accent-text disabled:bg-chip";

// ---------------------------------------------------------------------------
// ReplyItem
// ---------------------------------------------------------------------------

function ReplyItem({ reply }: { reply: Comment["replies"][number] }) {
  return (
    <div className="flex gap-2 py-1.5">
      <Avatar name={reply.authorName} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="text-xs font-semibold text-ink">{reply.authorName}</span>
          <span className="text-[11px] text-muted">{formatTime(reply.createdAt)}</span>
        </div>
        <p className="text-[13px] leading-[1.45] text-ink [overflow-wrap:anywhere]">
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
    <div className="border-b border-line px-3 py-2.5">
      {/* Header row */}
      <div className="flex items-start gap-2">
        <Avatar name={comment.authorName} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-1.5">
            <span className="text-xs font-semibold text-ink">{comment.authorName}</span>
            <span className="text-[11px] text-muted">{formatTime(comment.createdAt)}</span>
            {sceneLabel && <span className={`${TAG} text-ink`}>{sceneLabel}</span>}
            {comment.resolved && <span className={`${TAG} text-success`}>Resolved</span>}
          </div>

          <p className="mb-0.5 mt-[3px] text-[13px] leading-normal text-ink [overflow-wrap:anywhere]">
            {comment.text}
          </p>

          {/* Action row */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowReply((v) => !v)}
              className={`${LINK_BTN} ${showReply ? "text-accent-text" : "text-muted hover:text-ink"}`}
            >
              Reply{comment.replies.length > 0 ? ` (${comment.replies.length})` : ""}
            </button>

            <button
              type="button"
              onClick={handleToggleResolve}
              disabled={toggling || !currentUserId}
              className={`${LINK_BTN} ${comment.resolved ? "text-muted hover:text-ink" : "text-success"}`}
            >
              {comment.resolved ? "Reopen" : "Resolve"}
            </button>

            {comment.authorId === currentUserId && (
              <button type="button" onClick={handleDelete} className={`${LINK_BTN} ml-auto text-danger`}>
                Delete
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Replies */}
      {comment.replies.length > 0 && (
        <div className="ml-9 mt-1.5 border-l-2 border-line pl-2.5">
          {comment.replies.map((r) => (
            <ReplyItem key={r.id} reply={r} />
          ))}
        </div>
      )}

      {/* Reply input */}
      {showReply && (
        <div className="ml-9 mt-2">
          <textarea
            ref={replyRef}
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleReply();
              if (e.key === "Escape") { setShowReply(false); setReplyText(""); }
            }}
            placeholder="Write a reply…"
            aria-label="Write a reply"
            rows={2}
            className={TEXTAREA}
          />
          <div className="mt-1 flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => { setShowReply(false); setReplyText(""); }}
              className={`${SMALL_BTN} border border-line font-medium text-ink hover:bg-app`}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleReply}
              disabled={!replyText.trim() || submittingReply}
              className={`${SMALL_BTN} bg-accent text-accent-ink`}
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
      className="fixed inset-y-0 right-0 z-[80] flex w-80 max-w-full flex-col border-l border-line bg-surface text-ink shadow-2xl"
      aria-label="Comments panel"
    >
      {/* Header */}
      <div className="flex flex-none items-center justify-between border-b border-line py-2 pl-5 pr-2">
        <div className="flex items-center gap-2">
          <span className="font-display text-base font-semibold uppercase tracking-[0.08em] text-muted">Comments</span>
          {openCount > 0 && (
            <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[11px] font-bold leading-none text-accent-ink">
              {openCount}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close comments"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-muted transition-colors hover:bg-app hover:text-ink"
        >
          <svg width={14} height={14} viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-none border-b border-line">
        {(["scene", "all"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setFilter(tab)}
            aria-pressed={filter === tab}
            className={`h-11 flex-1 border-b-2 text-[13px] transition-colors ${
              filter === tab ? "border-accent font-semibold text-ink" : "border-transparent font-medium text-muted hover:text-ink"
            }`}
          >
            {tab === "scene" ? "This Scene" : "All Scenes"}
          </button>
        ))}
      </div>

      {/* Comment list */}
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="px-5 py-10 text-center text-[13px] text-muted">
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
                <div className="bg-app px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">
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
      <div className="flex-none border-t border-line bg-app px-3 py-2.5">
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
          aria-label="Add a comment"
          rows={2}
          disabled={!user}
          className={TEXTAREA}
        />
        <div className="mt-1.5 flex items-center justify-between">
          <span className="text-[11px] text-muted">Ctrl+Enter to send</span>
          <button
            type="button"
            onClick={handleAdd}
            disabled={!newText.trim() || !user || submitting}
            className={`${SMALL_BTN} bg-accent px-4 text-accent-ink`}
          >
            {submitting ? "…" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}
