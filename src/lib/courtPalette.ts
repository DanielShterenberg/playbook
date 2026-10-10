/**
 * Court palettes — every colour of the court, the tokens and the ball, per theme.
 *
 * One object is threaded through the shared rendering pipeline:
 *   - paintCourt / drawHalfCourtInner (courtRendering) take it in their options
 *   - renderSceneToCtx (frameRenderer) takes it in FrameStyle
 *   - Court, CourtThumbnail, PlayerToken and BallToken read it for the active
 *     theme via useCourtPalette (src/hooks/useTheme.ts)
 *
 * The default everywhere is LIGHT_COURT_PALETTE, so the exports (PNG / MP4 /
 * PDF), which never pass a palette, are always drawn on the light court
 * whatever the on-screen theme is.
 */

export interface CourtPalette {
  /** Inner court floor. */
  floor: string;
  /** Out-of-bounds margin around the court. */
  oob: string;
  /** Court markings. */
  line: string;
  /** Free-throw lane fill. */
  paint: string;
  /** Offense token fill when the play has no custom team colour. */
  offenseFill: string;
  /** Defense token fill when the play has no custom team colour. */
  defenseFill: string;
  /** Outline around every token and thumbnail dot. */
  tokenStroke: string;
  /** Basketball fill. */
  ball: string;
  /** Basketball highlight arc. */
  ballHighlight: string;
  /** Basketball seams and outline. */
  ballSeam: string;
}

export const LIGHT_COURT_PALETTE: CourtPalette = {
  floor: "#FFFFFF",
  oob: "#DCE1E8",
  line: "#2A3442",
  paint: "rgba(255, 122, 26, 0.16)",
  offenseFill: "#FF7A1A",
  defenseFill: "#141A23",
  tokenStroke: "#FFFFFF",
  ball: "#F2B33D",
  ballHighlight: "#FFE2A6",
  ballSeam: "#141A23",
};

export const DARK_COURT_PALETTE: CourtPalette = {
  floor: "#1B2330",
  oob: "#141A23",
  line: "#C9D2DE",
  paint: "rgba(255, 122, 26, 0.14)",
  offenseFill: "#FF7A1A",
  defenseFill: "#E8ECF1",
  tokenStroke: "#0E1116",
  ball: "#F2B33D",
  ballHighlight: "#FFE2A6",
  ballSeam: "#0E1116",
};

/**
 * Default team colours a play may have stored without anyone choosing them:
 * the play details dialog always saved both colours, seeded from the defaults
 * of the time. They mean "no custom colour", so the token follows the palette.
 */
const DEFAULT_TEAM_COLORS = new Set(
  [
    "#E07B39", // offense default before the redesign
    "#1E3A5F", // defense default before the redesign
    LIGHT_COURT_PALETTE.offenseFill,
    LIGHT_COURT_PALETTE.defenseFill,
  ].map((c) => c.toUpperCase()),
);

/**
 * A play's stored team colour if it is a real custom choice, else undefined
 * (missing, or one of the stored defaults). Every renderer resolves a token
 * fill as `customTeamColor(stored) ?? palette.offenseFill / defenseFill`.
 */
export function customTeamColor(stored: string | undefined | null): string | undefined {
  if (!stored) return undefined;
  return DEFAULT_TEAM_COLORS.has(stored.trim().toUpperCase()) ? undefined : stored;
}

/** Label colours for {@link contrastText}. */
export const TOKEN_TEXT_DARK = "#0E1116";
export const TOKEN_TEXT_LIGHT = "#FFFFFF";

/**
 * Label colour that reads on `fill`: dark ink on light fills, white on dark
 * ones. Tokens take any team colour, so the label follows the fill instead of
 * being fixed per side. Understands #RGB, #RRGGBB (optionally with alpha) and
 * rgb() / rgba(); anything else gets white.
 */
export function contrastText(fill: string): string {
  const rgb = parseRgb(fill);
  if (!rgb) return TOKEN_TEXT_LIGHT;
  const channel = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
  // Contrast against the dark ink beats contrast against white above this point.
  return luminance > 0.19 ? TOKEN_TEXT_DARK : TOKEN_TEXT_LIGHT;
}

function parseRgb(color: string): [number, number, number] | null {
  const c = color.trim();
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(c)?.[1];
  if (hex) {
    const full = hex.length <= 4 ? hex.replace(/./g, (ch) => ch + ch) : hex;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
  }
  const fn = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(c);
  return fn ? [Number(fn[1]), Number(fn[2]), Number(fn[3])] : null;
}
