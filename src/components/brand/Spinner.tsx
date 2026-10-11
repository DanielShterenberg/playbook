/**
 * Spinner — the app's two loading indicators.
 *
 *   Spinner      inline, takes the text colour (next to "Loading play…", "Saving…")
 *   RingSpinner  full-page: a line-coloured ring with an accent arc
 */

interface SpinnerProps {
  /** Width and height in px. */
  size?: number;
  /** Extra classes, added after `animate-spin`. */
  className?: string;
}

function spinClass(className?: string): string {
  return className ? `animate-spin ${className}` : "animate-spin";
}

export default function Spinner({ size = 18, className }: SpinnerProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className={spinClass(className)}>
      <circle cx={12} cy={12} r={10} stroke="currentColor" strokeWidth={3} strokeDasharray="31 31" strokeLinecap="round" />
    </svg>
  );
}

export function RingSpinner({ size = 36, className }: SpinnerProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" aria-hidden="true" className={spinClass(className)}>
      <circle cx={18} cy={18} r={14} stroke="var(--color-line)" strokeWidth={4} />
      <path d="M18 4 A14 14 0 0 1 32 18" stroke="var(--color-accent)" strokeWidth={4} strokeLinecap="round" />
    </svg>
  );
}
