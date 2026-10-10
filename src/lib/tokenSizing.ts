/**
 * Token sizing — the single source of truth for player / ball token size
 * relative to the court, shared by the editor and every export path.
 *
 * COURT-WIDTH CONVENTION
 * ----------------------
 * Every function here takes the INNER court width in pixels — sideline to
 * sideline, i.e. `CourtLayout.innerW` (a.k.a. `playAreaWidth`) from
 * courtLayout.ts. It is NOT the total canvas width (which also includes the
 * two side out-of-bounds margins).
 *
 * This is what the editor passes today: CourtWithPlayers.tsx computes
 *   computeTokenRadius(courtSize.playAreaWidth)
 *   computeBallRadius(courtSize.playAreaWidth)
 * and playAreaWidth is Court.tsx's innerW. The editor is the reference, so the
 * parameter is named `innerCourtWidth` to make passing the canvas width look
 * wrong at the call site.
 *
 * Like courtLayout.ts this module is free of React and browser APIs.
 */

// ---------------------------------------------------------------------------
// Base (design-size) constants
// ---------------------------------------------------------------------------

/**
 * Base player token radius in px. Stroke widths, fonts and glyph sizes of a
 * player token are authored at this radius and scaled by playerScale().
 * Also the default radius of PlayerToken when no court size is known.
 */
export const PLAYER_RADIUS = 18;

/**
 * Base ball token radius in px. Ball seams / strokes are authored at this
 * radius and scaled by ballScale(). Also the default radius of BallToken.
 */
export const BALL_RADIUS = 12;

// ---------------------------------------------------------------------------
// Token colours (the editor's — one source for tokens, exports and thumbnails)
// ---------------------------------------------------------------------------

/** Basketball fill. */
export const COLOR_BALL = "#E05C00";
/** Basketball highlight arc. */
export const COLOR_BALL_HIGHLIGHT = "#F47B2A";
/** Basketball seam lines. */
export const COLOR_BALL_SEAM = "#FFFFFF";
/** Offense token fill when the play has no custom team colours. */
export const DEFAULT_OFFENSE_COLOR = "#E07B39";
/** Defense token accent (outline / label) when the play has no custom team colours. */
export const DEFAULT_DEFENSE_COLOR = "#1E3A5F";

// ---------------------------------------------------------------------------
// Ratios and minimums (the editor's current values)
// ---------------------------------------------------------------------------

/** Player radius as a fraction of the inner court width. */
export const PLAYER_RADIUS_RATIO = 0.03;
/** Smallest player radius in px (keeps tokens tappable on narrow screens). */
export const PLAYER_RADIUS_MIN = 10;

/** Ball radius as a fraction of the inner court width. */
export const BALL_RADIUS_RATIO = 0.02;
/** Smallest ball radius in px. */
export const BALL_RADIUS_MIN = 7;

/** Gap in px between the player token edge and an attached ball's edge. */
export const BALL_ATTACH_GAP = 2;

// ---------------------------------------------------------------------------
// Radii
// ---------------------------------------------------------------------------

/**
 * Player token radius in px for a court whose INNER width (CourtLayout.innerW)
 * is `innerCourtWidth` px. Equals PLAYER_RADIUS (18) at innerCourtWidth = 600.
 */
export function playerRadius(innerCourtWidth: number): number {
  return Math.max(PLAYER_RADIUS_MIN, Math.round(innerCourtWidth * PLAYER_RADIUS_RATIO));
}

/**
 * Ball token radius in px for a court whose INNER width (CourtLayout.innerW)
 * is `innerCourtWidth` px. Equals BALL_RADIUS (12) at innerCourtWidth = 600.
 */
export function ballRadius(innerCourtWidth: number): number {
  return Math.max(BALL_RADIUS_MIN, Math.round(innerCourtWidth * BALL_RADIUS_RATIO));
}

// ---------------------------------------------------------------------------
// Attached ball offset
// ---------------------------------------------------------------------------

/**
 * Y offset in px from a player's centre to the centre of the ball attached to
 * that player: ballY = playerY + ballAttachOffsetY(playerR, ballR).
 *
 * Always negative, in SCREEN space: the attached ball is drawn above the
 * player on screen whether or not the court is flipped (the editor never
 * negates it). Renderers must not flip its sign for flipped courts.
 */
export function ballAttachOffsetY(playerR: number, ballR: number): number {
  return -(playerR + ballR + BALL_ATTACH_GAP);
}

// ---------------------------------------------------------------------------
// Proportional scale
// ---------------------------------------------------------------------------

/**
 * Proportional scale factor for a token: radius / base.
 * Everything drawn inside a token (stroke width, font size, glyph size) is
 * authored at the base radius and multiplied by this.
 */
export function tokenScale(radius: number, baseRadius: number): number {
  return radius / baseRadius;
}

/** tokenScale relative to PLAYER_RADIUS — e.g. font = 11 * playerScale(r). */
export function playerScale(radius: number): number {
  return tokenScale(radius, PLAYER_RADIUS);
}

/**
 * Font size of a player token's label. Authored at PLAYER_RADIUS (11px, shrinking
 * 1.5px per character beyond two, floor 5px) and scaled with the token, so a
 * long name fills the same share of the token on screen and in every export.
 */
export function playerLabelFontSize(labelLength: number, radius: number): number {
  const s = playerScale(radius);
  const base = Math.max(6, Math.round(11 * s));
  if (labelLength <= 2) return base;
  return Math.max(5, 5 * s, base - (labelLength - 2) * 1.5 * s);
}

/** tokenScale relative to BALL_RADIUS. */
export function ballScale(radius: number): number {
  return tokenScale(radius, BALL_RADIUS);
}

// ---------------------------------------------------------------------------
// Thumbnails
// ---------------------------------------------------------------------------

/** Smallest player-dot radius in px, for thumbnails too small for the shared ratio. */
export const THUMBNAIL_DOT_MIN_RADIUS = 4;

/**
 * Player-dot radius for the SVG mini-courts (CourtThumbnail, used by PlayCard
 * and SceneStrip). Thumbnails have no out-of-bounds margin, so their SVG width
 * is the inner court width.
 */
export function thumbnailDotRadius(thumbnailWidth: number): number {
  return Math.max(THUMBNAIL_DOT_MIN_RADIUS, Math.round(thumbnailWidth * PLAYER_RADIUS_RATIO));
}

/** Smallest ball radius in px on a thumbnail (stays smaller than the smallest dot). */
export const THUMBNAIL_BALL_MIN_RADIUS = 3;

/**
 * Ball radius for the SVG mini-courts — the editor's ball-to-court-width ratio
 * with a legibility floor, the counterpart of thumbnailDotRadius.
 */
export function thumbnailBallRadius(thumbnailWidth: number): number {
  return Math.max(THUMBNAIL_BALL_MIN_RADIUS, Math.round(thumbnailWidth * BALL_RADIUS_RATIO));
}

/**
 * Y offset from a thumbnail dot's centre to the centre of the ball attached to
 * it (negative: above, in screen space — never negated when flipped).
 *
 * Same as ballAttachOffsetY except that the gap scales with the dot instead of
 * staying BALL_ATTACH_GAP px: 2 px next to an 18 px token is a hairline, next
 * to a 4 px dot it is half a dot and reads as a detached ball.
 */
export function thumbnailBallAttachOffsetY(dotR: number, ballR: number): number {
  return -(dotR + ballR + BALL_ATTACH_GAP * playerScale(dotR));
}

// ---------------------------------------------------------------------------
// Convenience
// ---------------------------------------------------------------------------

export interface TokenSizes {
  /** Player token radius in px. */
  playerR: number;
  /** Ball token radius in px. */
  ballR: number;
  /** playerR / PLAYER_RADIUS. */
  playerScale: number;
  /** ballR / BALL_RADIUS. */
  ballScale: number;
  /** Screen-space Y offset of an attached ball from its holder (negative). */
  ballAttachOffsetY: number;
}

/**
 * All token sizes for a court whose INNER width (CourtLayout.innerW) is
 * `innerCourtWidth` px — one call for renderers that need the whole set.
 */
export function computeTokenSizes(innerCourtWidth: number): TokenSizes {
  const playerR = playerRadius(innerCourtWidth);
  const ballR = ballRadius(innerCourtWidth);
  return {
    playerR,
    ballR,
    playerScale: playerScale(playerR),
    ballScale: ballScale(ballR),
    ballAttachOffsetY: ballAttachOffsetY(playerR, ballR),
  };
}
