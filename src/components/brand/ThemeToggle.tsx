/**
 * ThemeToggle — switches between the light and dark theme (src/lib/theme.ts).
 * Shows the theme you would switch TO: a moon in light, a sun in dark. The
 * icon is chosen in CSS from <html data-theme>, so it is right on first paint
 * (no hydration flip for a stored dark theme).
 */

"use client";

import { toggleTheme } from "@/lib/theme";

const BASE =
  "flex h-11 w-11 flex-none items-center justify-center rounded-lg border border-line bg-transparent text-ink transition-colors hover:bg-app";

export default function ThemeToggle({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="Switch between light and dark theme"
      title="Switch theme"
      className={className ? `${BASE} ${className}` : BASE}
    >
      <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path className="dark:hidden" d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
        <g className="hidden dark:inline">
          <circle cx={12} cy={12} r={4} />
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5" />
        </g>
      </svg>
    </button>
  );
}
