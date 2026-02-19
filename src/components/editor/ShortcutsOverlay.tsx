"use client";

/**
 * ShortcutsOverlay — modal overlay listing all keyboard shortcuts.
 *
 * Implements issue #82: Keyboard shortcuts — "? key shows overlay with all shortcuts".
 *
 * Triggered by pressing ? anywhere in the editor (when not typing in an input).
 * Dismissed by pressing Escape, clicking the backdrop, or pressing ? again.
 */

import { useEffect } from "react";

interface ShortcutEntry {
  keys: string[];
  description: string;
}

interface ShortcutSection {
  title: string;
  entries: ShortcutEntry[];
}

const SECTIONS: ShortcutSection[] = [
  {
    title: "Tools",
    entries: [
      { keys: ["V"], description: "Select / deselect" },
      { keys: ["M"], description: "Movement arrow" },
      { keys: ["D"], description: "Dribble path" },
      { keys: ["P"], description: "Pass arrow" },
      { keys: ["S"], description: "Screen / pick" },
      { keys: ["C"], description: "Cut (dashed arrow)" },
      { keys: ["E"], description: "Eraser" },
      { keys: ["Esc"], description: "Back to Select" },
    ],
  },
  {
    title: "Playback",
    entries: [
      { keys: ["Space"], description: "Play / Pause" },
      { keys: ["←", "→"], description: "Step to previous / next scene" },
      { keys: ["Ctrl", "←", "/", "→"], description: "Navigate scenes (editor)" },
      { keys: ["L"], description: "Toggle loop" },
    ],
  },
  {
    title: "Editing",
    entries: [
      { keys: ["Ctrl", "Z"], description: "Undo" },
      { keys: ["Ctrl", "Shift", "Z"], description: "Redo" },
      { keys: ["Del", "⌫"], description: "Delete selected annotation or scene" },
      { keys: ["Ctrl", "S"], description: "Force save" },
    ],
  },
  {
    title: "Help",
    entries: [{ keys: ["?"], description: "Show / hide this shortcut list" }],
  },
];

interface ShortcutsOverlayProps {
  onClose: () => void;
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 26,
        padding: "2px 6px",
        background: "#F3F4F6",
        border: "1px solid #D1D5DB",
        borderRadius: 5,
        boxShadow: "0 1px 0 #9CA3AF",
        fontSize: 11,
        fontFamily: "ui-monospace, monospace",
        fontWeight: 600,
        color: "#374151",
        whiteSpace: "nowrap",
        lineHeight: 1.5,
      }}
    >
      {children}
    </kbd>
  );
}

export default function ShortcutsOverlay({ onClose }: ShortcutsOverlayProps) {
  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    // Backdrop
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.45)",
        backdropFilter: "blur(2px)",
      }}
    >
      {/* Panel */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 12,
          boxShadow: "0 8px 40px rgba(0,0,0,0.2)",
          padding: "24px 28px",
          width: "min(580px, 92vw)",
          maxHeight: "80vh",
          overflowY: "auto",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 20,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 17,
              fontWeight: 700,
              color: "#111827",
            }}
          >
            Keyboard Shortcuts
          </h2>
          <button
            onClick={onClose}
            aria-label="Close shortcuts panel"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 4,
              color: "#6B7280",
              fontSize: 20,
              lineHeight: 1,
              borderRadius: 6,
            }}
          >
            ×
          </button>
        </div>

        {/* Sections */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: "20px 32px",
          }}
        >
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <h3
                style={{
                  margin: "0 0 10px",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "#9CA3AF",
                }}
              >
                {section.title}
              </h3>
              <ul
                style={{
                  margin: 0,
                  padding: 0,
                  listStyle: "none",
                  display: "flex",
                  flexDirection: "column",
                  gap: 7,
                }}
              >
                {section.entries.map((entry) => (
                  <li
                    key={entry.description}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 13,
                        color: "#374151",
                        flexShrink: 1,
                        minWidth: 0,
                      }}
                    >
                      {entry.description}
                    </span>
                    <span
                      style={{
                        display: "flex",
                        gap: 3,
                        alignItems: "center",
                        flexShrink: 0,
                      }}
                    >
                      {entry.keys.map((k, i) => (
                        <span
                          key={i}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 3,
                          }}
                        >
                          {i > 0 && k !== "/" && (
                            <span
                              style={{
                                color: "#D1D5DB",
                                fontSize: 11,
                                margin: "0 1px",
                              }}
                            >
                              +
                            </span>
                          )}
                          {k === "/" ? (
                            <span
                              style={{ color: "#9CA3AF", fontSize: 11, margin: "0 3px" }}
                            >
                              or
                            </span>
                          ) : (
                            <Kbd>{k}</Kbd>
                          )}
                        </span>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <p
          style={{
            margin: "20px 0 0",
            fontSize: 12,
            color: "#9CA3AF",
            textAlign: "center",
          }}
        >
          Press <Kbd>?</Kbd> or <Kbd>Esc</Kbd> to dismiss
        </p>
      </div>
    </div>
  );
}
