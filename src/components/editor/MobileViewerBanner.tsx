"use client";

/**
 * MobileViewerBanner — shown only on small screens (<768 px / below `md`).
 *
 * Implements issue #81 (responsive layout): on mobile the editor is locked to
 * viewer-only mode.  This banner communicates that constraint and prompts the
 * user to open the play on a larger device to edit.
 *
 * The component renders nothing on md+ screens via Tailwind's `md:hidden`.
 */
export default function MobileViewerBanner() {
  return (
    <div
      className="flex items-center gap-2 bg-amber-50 px-3 py-2 text-xs text-amber-800 md:hidden"
      role="status"
      aria-live="polite"
    >
      {/* Info icon */}
      <svg
        viewBox="0 0 20 20"
        width={14}
        height={14}
        fill="currentColor"
        aria-hidden="true"
        className="shrink-0"
      >
        <path
          fillRule="evenodd"
          d="M18 10A8 8 0 1 1 2 10a8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253l-.043 2.25H9a.75.75 0 0 0 0 1.5h2a.75.75 0 0 0 .75-.75v-.017l.047-2.483H12a.75.75 0 0 0 0-1.5H9Z"
          clipRule="evenodd"
        />
      </svg>
      <span>
        <strong className="font-semibold">Viewer mode.</strong> Open on a tablet or desktop to
        edit this play.
      </span>
    </div>
  );
}
