"use client";

/**
 * EditorHeader — client component for the play editor page header.
 *
 * Shows:
 *   - Back arrow to /playbook (syncs currentPlay changes back to the list)
 *   - Current play title (from the Zustand store) or the raw play ID
 *   - Slot for action buttons (passed as children by the server page)
 */

import { useCallback } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";

interface EditorHeaderProps {
  playId: string;
  children?: React.ReactNode;
}

export default function EditorHeader({ playId, children }: EditorHeaderProps) {
  const currentPlay = useStore((s) => s.currentPlay);
  const updatePlayInList = useStore((s) => s.updatePlayInList);

  const title = currentPlay?.title ?? null;

  // When navigating away, sync any in-flight changes back to the plays list.
  const handleBack = useCallback(() => {
    if (currentPlay) {
      updatePlayInList(currentPlay);
    }
  }, [currentPlay, updatePlayInList]);

  return (
    <header className="flex min-w-0 items-center justify-between border-b border-gray-200 px-3 py-2 md:px-4">
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
      </div>

      {children}
    </header>
  );
}
