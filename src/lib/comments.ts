"use client";

/**
 * Firestore CRUD + real-time subscription for scene comments.
 *
 * Implements issue #133: scene comments with threading and resolve.
 *
 * Data model:
 *   /comments/{commentId}
 *     playId:     string
 *     sceneId:    string | null   — null = play-level comment
 *     stepId:     number | null
 *     authorId:   string
 *     authorName: string
 *     text:       string
 *     createdAt:  Timestamp
 *     resolved:   boolean
 *     resolvedBy: string | null
 *     resolvedAt: Timestamp | null
 *     replies:    { id, authorId, authorName, text, createdAt }[]
 */

import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  Timestamp,
  type DocumentData,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Comment, CommentReply } from "./types";

// ---------------------------------------------------------------------------
// Deserialisation
// ---------------------------------------------------------------------------

function deserialiseReply(r: DocumentData): CommentReply {
  return {
    id: r.id as string,
    authorId: r.authorId as string,
    authorName: r.authorName as string,
    text: r.text as string,
    createdAt: r.createdAt instanceof Timestamp ? r.createdAt.toDate() : new Date(),
  };
}

function deserialiseComment(id: string, data: DocumentData): Comment {
  return {
    id,
    playId: data.playId as string,
    sceneId: (data.sceneId as string | null) ?? null,
    stepId: (data.stepId as number | null) ?? null,
    authorId: data.authorId as string,
    authorName: data.authorName as string,
    text: data.text as string,
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(),
    resolved: (data.resolved as boolean) ?? false,
    resolvedBy: (data.resolvedBy as string | null) ?? null,
    resolvedAt: data.resolvedAt instanceof Timestamp ? data.resolvedAt.toDate() : null,
    replies: Array.isArray(data.replies) ? (data.replies as DocumentData[]).map(deserialiseReply) : [],
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Add a new top-level comment to a play/scene. */
export async function addComment(
  playId: string,
  sceneId: string | null,
  stepId: number | null,
  authorId: string,
  authorName: string,
  text: string,
): Promise<string> {
  const ref = await addDoc(collection(db, "comments"), {
    playId,
    sceneId: sceneId ?? null,
    stepId: stepId ?? null,
    authorId,
    authorName,
    text: text.trim(),
    createdAt: serverTimestamp(),
    resolved: false,
    resolvedBy: null,
    resolvedAt: null,
    replies: [],
  });
  return ref.id;
}

/** Add a reply to an existing comment. */
export async function addReply(
  commentId: string,
  authorId: string,
  authorName: string,
  text: string,
): Promise<void> {
  const reply = {
    id: crypto.randomUUID(),
    authorId,
    authorName,
    text: text.trim(),
    createdAt: Timestamp.now(),
  };
  await updateDoc(doc(db, "comments", commentId), {
    replies: arrayUnion(reply),
  });
}

/** Mark a comment as resolved. */
export async function resolveComment(commentId: string, userId: string): Promise<void> {
  await updateDoc(doc(db, "comments", commentId), {
    resolved: true,
    resolvedBy: userId,
    resolvedAt: serverTimestamp(),
  });
}

/** Reopen a resolved comment. */
export async function unresolveComment(commentId: string): Promise<void> {
  await updateDoc(doc(db, "comments", commentId), {
    resolved: false,
    resolvedBy: null,
    resolvedAt: null,
  });
}

/** Delete a comment document. */
export async function deleteComment(commentId: string): Promise<void> {
  await deleteDoc(doc(db, "comments", commentId));
}

/**
 * Subscribe to all comments for a play.
 * Returns an unsubscribe function. `onUpdate` is called immediately with
 * the current snapshot and again whenever comments change.
 */
export function subscribeToComments(
  playId: string,
  onUpdate: (comments: Comment[]) => void,
): Unsubscribe {
  const q = query(
    collection(db, "comments"),
    where("playId", "==", playId),
    orderBy("createdAt", "asc"),
  );
  return onSnapshot(q, (snap) => {
    const comments = snap.docs.map((d) => deserialiseComment(d.id, d.data()));
    onUpdate(comments);
  });
}
