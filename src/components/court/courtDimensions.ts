/**
 * NBA half-court dimensions in feet.
 * Origin (0, 0) is the top-left corner of the half court.
 * The baseline is at y = COURT_HEIGHT (bottom edge, where the basket is).
 *
 * Reference: NBA official court specifications.
 *   - Full court: 94ft × 50ft
 *   - Half court: 47ft × 50ft
 */

// ---------------------------------------------------------------------------
// Raw feet dimensions
// ---------------------------------------------------------------------------

/** Half-court length in feet (baseline to half-court line). */
export const COURT_LENGTH_FT = 47;

/** Court width in feet. */
export const COURT_WIDTH_FT = 50;

/**
 * Aspect ratio: width / length.
 * The canvas is wider than it is tall (landscape orientation for a half court
 * viewed from behind the basket).
 */
export const COURT_ASPECT_RATIO = COURT_WIDTH_FT / COURT_LENGTH_FT; // ≈ 1.064

// ---------------------------------------------------------------------------
// Normalised (0–1) coordinates
// All values are expressed as a fraction of the court's full dimensions so
// that the canvas can be drawn at any pixel size.
// x: 0 = left sideline,  1 = right sideline
// y: 0 = half-court line, 1 = baseline (basket end)
// ---------------------------------------------------------------------------

/** Basket distance from baseline in feet. */
const BASKET_FROM_BASELINE_FT = 5.25;

/** Basket normalised y (measured from half-court line toward baseline). */
export const BASKET_Y = 1 - BASKET_FROM_BASELINE_FT / COURT_LENGTH_FT;

/** Basket normalised x (centre of court). */
export const BASKET_X = 0.5;

/** Basket radius in feet. */
const BASKET_RADIUS_FT = 0.75;
export const BASKET_RADIUS = BASKET_RADIUS_FT / COURT_WIDTH_FT;

/** Backboard half-width in feet. */
const BACKBOARD_HALF_WIDTH_FT = 3;
export const BACKBOARD_HALF_WIDTH = BACKBOARD_HALF_WIDTH_FT / COURT_WIDTH_FT;

/** Backboard distance from baseline in feet. */
const BACKBOARD_FROM_BASELINE_FT = 4;
export const BACKBOARD_Y = 1 - BACKBOARD_FROM_BASELINE_FT / COURT_LENGTH_FT;

// ---------------------------------------------------------------------------
// Paint / Free-throw lane
// NBA lane: 16ft wide × 19ft deep (from baseline)
// ---------------------------------------------------------------------------
const LANE_WIDTH_FT = 16;
const LANE_DEPTH_FT = 19;

export const LANE_LEFT = (COURT_WIDTH_FT / 2 - LANE_WIDTH_FT / 2) / COURT_WIDTH_FT;
export const LANE_RIGHT = (COURT_WIDTH_FT / 2 + LANE_WIDTH_FT / 2) / COURT_WIDTH_FT;
export const LANE_TOP = 1 - LANE_DEPTH_FT / COURT_LENGTH_FT; // y = 0 is top (half-court)
export const LANE_BOTTOM = 1; // baseline

// ---------------------------------------------------------------------------
// Free-throw line
// ---------------------------------------------------------------------------
/** Free-throw line is at the top of the lane box (19ft from baseline). */
export const FREE_THROW_LINE_Y = LANE_TOP;

// ---------------------------------------------------------------------------
// Free-throw circle
// NBA free-throw circle radius: 6ft
// ---------------------------------------------------------------------------
const FT_CIRCLE_RADIUS_FT = 6;
export const FT_CIRCLE_RADIUS = FT_CIRCLE_RADIUS_FT / COURT_WIDTH_FT;
export const FT_CIRCLE_CENTER_X = 0.5;
export const FT_CIRCLE_CENTER_Y = FREE_THROW_LINE_Y;

// ---------------------------------------------------------------------------
// Three-point arc
// NBA three-point line:
//   - Corner three: 3ft from sideline, extends 14ft from baseline
//   - Arc radius: 23.75ft from basket centre
// ---------------------------------------------------------------------------
const THREE_POINT_RADIUS_FT = 23.75;
export const THREE_POINT_RADIUS = THREE_POINT_RADIUS_FT / COURT_WIDTH_FT;

/** Distance of corner three line from baseline in feet. */
const CORNER_THREE_DEPTH_FT = 14;
export const CORNER_THREE_Y = 1 - CORNER_THREE_DEPTH_FT / COURT_LENGTH_FT;

/** Corner three x positions (3ft from each sideline). */
const CORNER_THREE_INSET_FT = 3;
export const CORNER_THREE_LEFT_X = CORNER_THREE_INSET_FT / COURT_WIDTH_FT;
export const CORNER_THREE_RIGHT_X = 1 - CORNER_THREE_INSET_FT / COURT_WIDTH_FT;

// ---------------------------------------------------------------------------
// Restricted area arc
// NBA restricted arc radius: 4ft from basket centre
// ---------------------------------------------------------------------------
const RESTRICTED_RADIUS_FT = 4;
export const RESTRICTED_RADIUS = RESTRICTED_RADIUS_FT / COURT_WIDTH_FT;

// ---------------------------------------------------------------------------
// Half-court circle
// NBA centre circle radius: 6ft
// ---------------------------------------------------------------------------
const CENTRE_CIRCLE_RADIUS_FT = 6;
export const CENTRE_CIRCLE_RADIUS = CENTRE_CIRCLE_RADIUS_FT / COURT_WIDTH_FT;
