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

/** Label colours for {@link contrastText}. */
export const TOKEN_TEXT_DARK = "#0E1116";
export const TOKEN_TEXT_LIGHT = "#FFFFFF";

/**
 * Label colour that reads on `fill`: dark ink on light fills, white on dark
 * ones. Tokens take any team colour, so the label follows the fill instead of
 * being fixed per side. Anything that is not a #RGB / #RRGGBB hex gets white.
 */
export function contrastText(fill: string): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(fill.trim());
  if (!m) return TOKEN_TEXT_LIGHT;
  const hex = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  const channel = (i: number) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
  // Contrast against the dark ink beats contrast against white above this point.
  return luminance > 0.19 ? TOKEN_TEXT_DARK : TOKEN_TEXT_LIGHT;
}
