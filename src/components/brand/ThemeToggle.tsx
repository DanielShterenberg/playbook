"use client";

/**
 * ThemeToggle — switches between the light and dark theme (src/lib/theme.ts).
 * Shows the theme you would switch TO: a moon in light, a sun in dark.
 */

import { useTheme } from "@/hooks/useTheme";
import { toggleTheme } from "@/lib/theme";

export default function ThemeToggle({ className }: { className?: string }) {
  const theme = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className={
        className ??
        "flex h-11 w-11 flex-none items-center justify-center rounded-lg border border-line bg-transparent text-ink transition-colors hover:bg-app"
      }
    >
      <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {theme === "dark" ? (
          <>
            <circle cx={12} cy={12} r={4} />
            <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5" />
          </>
        ) : (
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
        )}
      </svg>
    </button>
  );
}
