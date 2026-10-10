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
 * Player-dot radius for the SVG mini-courts (PlayCard, SceneStrip). Thumbnails
 * have no out-of-bounds margin, so their SVG width is the inner court width.
 */
export function thumbnailDotRadius(thumbnailWidth: number): number {
  return Math.max(THUMBNAIL_DOT_MIN_RADIUS, Math.round(thumbnailWidth * PLAYER_RADIUS_RATIO));
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
