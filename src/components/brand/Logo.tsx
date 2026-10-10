/**
 * Logo — the Playbook mark (a cut from O past X on an orange tile) and the
 * lowercase mono wordmark with its accent underline.
 *
 * Colours: the mark is fixed (accent tile, dark ink) in both themes; the
 * wordmark takes the theme's ink colour unless `wordmarkColor` is given (for
 * surfaces that are not themed).
 */

export interface LogoProps {
  /** Height of the mark in px; the wordmark scales with it. Default 34. */
  size?: number;
  /** Show the "playbook" wordmark next to the mark. Default true. */
  wordmark?: boolean;
  /** Stack the wordmark under the mark (sign-in card). Default false. */
  stacked?: boolean;
  /** Wordmark colour. Default: the theme's ink. */
  wordmarkColor?: string;
}

/** The mark alone — also the app icon (src/app/icon.svg is the same drawing). */
export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" role="img" aria-label="Playbook logo" style={{ flex: "none", display: "block" }}>
      <rect width={34} height={34} rx={8} fill="var(--color-accent)" />
      <g fill="none" stroke="var(--color-accent-ink)" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
        <circle cx={11} cy={23} r={4.5} />
        <path d="M15 19 L24 10" />
        <path d="M18 9.5 H24.5 V16" />
        <path d="M21 21 L27 27 M27 21 L21 27" />
      </g>
    </svg>
  );
}

export default function Logo({ size = 34, wordmark = true, stacked = false, wordmarkColor }: LogoProps) {
  return (
    <span
      style={{
        display: "inline-flex",
        flexDirection: stacked ? "column" : "row",
        alignItems: "center",
        gap: Math.round(size * (stacked ? 0.35 : 0.3)),
      }}
    >
      <LogoMark size={size} />
      {wordmark && (
        <span
          className="font-mono"
          style={{
            fontWeight: 600,
            fontSize: Math.round(size * 0.59),
            lineHeight: 1.2,
            letterSpacing: "-0.02em",
            color: wordmarkColor ?? "var(--color-ink)",
            borderBottom: "3px solid var(--color-accent)",
            paddingBottom: 1,
          }}
        >
          playbook
        </span>
      )}
    </span>
  );
}
