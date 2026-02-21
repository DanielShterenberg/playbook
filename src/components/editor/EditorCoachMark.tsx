"use client";

/**
 * EditorCoachMark — a one-time dismissable banner that explains scenes and steps
 * to first-time users. Dismissed state is persisted in localStorage.
 */

import { useState } from "react";

const COACH_KEY = "playbook_editor_hints_v1";

export default function EditorCoachMark() {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem(COACH_KEY) === "1";
  });

  if (dismissed) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "7px 16px",
        borderTop: "1px solid #FDE68A",
        background: "#FFFBEB",
        fontSize: 12,
        color: "#78350F",
      }}
    >
      <span style={{ fontSize: 14, flexShrink: 0 }}>💡</span>
      <span style={{ flex: 1, lineHeight: 1.5 }}>
        <strong>Scenes</strong> are the frames of your play — each one captures a moment on the court.{" "}
        <strong>Steps</strong> sequence actions <em>within</em> a scene (e.g. set the screen first,
        then cut). Right-click any scene thumbnail to duplicate or reorder it.
      </span>
      <button
        onClick={() => {
          localStorage.setItem(COACH_KEY, "1");
          setDismissed(true);
        }}
        style={{
          flexShrink: 0,
          padding: "3px 10px",
          borderRadius: 6,
          border: "1px solid #FCD34D",
          background: "#FEF3C7",
          color: "#92400E",
          fontSize: 11,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Got it
      </button>
    </div>
  );
}
