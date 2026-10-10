/**
 * CourtThumbnail — the SVG mini court used by PlayCard (playbook grid) and
 * SceneStrip (editor scene cards).
 *
 * Implements issue #175: thumbnails reflect the flipped setting and show the
 * ball, so a play's thumbnail is the same picture as the editor.
 *
 * A thumbnail is the editor's court seen through the play-area window, with no
 * out-of-bounds margin around it:
 *   - layout     → computeThumbnailLayout(width, variant)  (oobLeft = 0)
 *   - court      → the transforms paintCourt uses, as SVG group transforms:
 *                    flipped:  translate(0, totalHeight) scale(1, -1)
 *                    full:     near end at translate(0, innerH + oobBot),
 *                              far end mirrored about the same line
 *   - positions  → normToCanvasPx(x, y, layout, flipped)
 *   - sizes      → thumbnailDotRadius / thumbnailBallRadius /
 *                  thumbnailBallAttachOffsetY
 *   - colours    → courtRendering (floor, lines, lane) and tokenSizing (ball,
 *                  default team colours) — the editor's, no local copies
 *   - viewBox    → the play-area window, where normToCanvasPx puts [0,1]²
 *
 * Flipping is done ONLY by the group transform; the marking paths (and their
 * arc flags) are the same strings in every orientation.
 *
 * Because the editor's flip is about totalHeight (= innerH + oobBot for a half
 * court), a flipped half-court thumbnail shows what the editor shows in that
 * window: a floor band of oobBot above the baseline, and markings oobBot below
 * the tokens that share their normY (see the FLIPPED CONVENTION note in
 * courtLayout.ts). The last oobBot of the court at the half-court line falls
 * outside the window.
 */

import { computeThumbnailLayout, normToCanvasPx, type CourtVariant } from "@/lib/courtLayout";
import { COLOR_COURT, COLOR_LINE, DEFAULT_COLOR_PAINT } from "@/lib/courtRendering";
import {
  COLOR_BALL,
  DEFAULT_OFFENSE_COLOR,
  DEFAULT_DEFENSE_COLOR,
  thumbnailBallAttachOffsetY,
  thumbnailBallRadius,
  thumbnailDotRadius,
} from "@/lib/tokenSizing";
import type { Scene } from "@/lib/types";
import {
  BASKET_X,
  BASKET_Y,
  BACKBOARD_Y,
  BACKBOARD_HALF_WIDTH,
  LANE_LEFT,
  LANE_RIGHT,
  LANE_TOP,
  CORNER_THREE_Y,
  CORNER_THREE_LEFT_X,
  CORNER_THREE_RIGHT_X,
  FT_CIRCLE_CENTER_X,
  FT_CIRCLE_CENTER_Y,
  FT_CIRCLE_RADIUS,
  THREE_POINT_RADIUS,
  RESTRICTED_RADIUS,
  CENTRE_CIRCLE_RADIUS,
} from "./courtDimensions";

export interface CourtThumbnailProps {
  scene: Scene;
  /** SVG width in px — also the inner court width (no out-of-bounds margin). */
  width: number;
  /** Court variant of the play. A full-court thumbnail shows the end the players are in. */
  variant?: CourtVariant;
  /** Effective flip of the scene: (scene.flipped ?? play.flipped) === true. */
  flipped?: boolean;
  /** Offense dot fill — the play's team colour. Default: the editor's. */
  offenseColor?: string;
  /** Defense dot fill — the play's team colour. Default: the editor's. */
  defenseColor?: string;
  /** Stroke width of court lines and token outlines. */
  lineWidth?: number;
  /** Stroke width of the outer frame and the backboard. */
  outlineWidth?: number;
  /** Rim radius in px. */
  basketRadius?: number;
  /** Corner radius of the thumbnail in px. */
  cornerRadius?: number;
  /** When true the SVG scales to its container's width. */
  fluid?: boolean;
}

export default function CourtThumbnail({
  scene,
  width,
  variant = "half",
  flipped = false,
  offenseColor = DEFAULT_OFFENSE_COLOR,
  defenseColor = DEFAULT_DEFENSE_COLOR,
  lineWidth = 1,
  outlineWidth = 1.5,
  basketRadius = 5,
  cornerRadius = 6,
  fluid = false,
}: CourtThumbnailProps) {
  const layout = computeThumbnailLayout(width, variant);
  const W = layout.innerW;
  const H = layout.innerH;
  const top = layout.playAreaOffsetY;

  // Normalised → px inside ONE half court whose origin is its half-court line.
  // Arc radii: a physical radius R_ft is (R_ft / 50) * W px in both x and y
  // (H = W * 47 / 50), so every radius goes through px().
  const px = (nx: number) => nx * W;
  const py = (ny: number) => ny * H;

  const dotR = thumbnailDotRadius(W);
  const ballR = thumbnailBallRadius(W);
  const pos = (p: { x: number; y: number }) => normToCanvasPx(p.x, p.y, layout, flipped);

  const laneX = px(LANE_LEFT);
  const laneY = py(LANE_TOP);
  const laneW = px(LANE_RIGHT - LANE_LEFT);
  const laneH = py(1 - LANE_TOP);
  const line = { fill: "none", stroke: COLOR_LINE, strokeWidth: lineWidth };

  // One half court: y = 0 half-court line, y = H baseline. Verified arc flags
  // (y-down, chord left→right): "0 0 1" bows upward (toward the half-court
  // line), "0 0 0" bows downward. Do not edit them to flip — use a transform.
  const halfCourt = (
    <>
      {/* Paint (free-throw lane) — the editor's paint, never a team colour */}
      <rect x={laneX} y={laneY} width={laneW} height={laneH} fill={DEFAULT_COLOR_PAINT} />

      {/* Half-court line and baseline (the sidelines are the frame) */}
      <line x1={0} y1={0} x2={W} y2={0} stroke={COLOR_LINE} strokeWidth={lineWidth} />
      <line x1={0} y1={H} x2={W} y2={H} stroke={COLOR_LINE} strokeWidth={lineWidth} />

      {/* Centre-circle arc — bows into the court */}
      <path
        d={`M ${px(0.5 - CENTRE_CIRCLE_RADIUS)},0 A ${px(CENTRE_CIRCLE_RADIUS)},${px(CENTRE_CIRCLE_RADIUS)} 0 0 0 ${px(0.5 + CENTRE_CIRCLE_RADIUS)},0`}
        {...line}
      />

      {/* Three-point line: corner straights + minor arc bowing toward half court */}
      <path
        d={`M ${px(CORNER_THREE_LEFT_X)},${py(1)} L ${px(CORNER_THREE_LEFT_X)},${py(CORNER_THREE_Y)} A ${px(THREE_POINT_RADIUS)},${px(THREE_POINT_RADIUS)} 0 0 1 ${px(CORNER_THREE_RIGHT_X)},${py(CORNER_THREE_Y)} L ${px(CORNER_THREE_RIGHT_X)},${py(1)}`}
        {...line}
      />

      {/* Lane outline and free-throw line */}
      <rect x={laneX} y={laneY} width={laneW} height={laneH} {...line} />
      <line x1={laneX} y1={laneY} x2={laneX + laneW} y2={laneY} stroke={COLOR_LINE} strokeWidth={lineWidth} />

      {/* Free-throw circle — upper semicircle, toward half court */}
      <path
        d={`M ${px(FT_CIRCLE_CENTER_X - FT_CIRCLE_RADIUS)},${py(FT_CIRCLE_CENTER_Y)} A ${px(FT_CIRCLE_RADIUS)},${px(FT_CIRCLE_RADIUS)} 0 0 1 ${px(FT_CIRCLE_CENTER_X + FT_CIRCLE_RADIUS)},${py(FT_CIRCLE_CENTER_Y)}`}
        {...line}
      />

      {/* Backboard */}
      <line
        x1={px(BASKET_X - BACKBOARD_HALF_WIDTH)}
        y1={py(BACKBOARD_Y)}
        x2={px(BASKET_X + BACKBOARD_HALF_WIDTH)}
        y2={py(BACKBOARD_Y)}
        stroke={COLOR_LINE}
        strokeWidth={outlineWidth}
      />

      {/* Restricted-area arc — toward half court */}
      <path
        d={`M ${px(BASKET_X - RESTRICTED_RADIUS)},${py(BASKET_Y)} A ${px(RESTRICTED_RADIUS)},${px(RESTRICTED_RADIUS)} 0 0 1 ${px(BASKET_X + RESTRICTED_RADIUS)},${py(BASKET_Y)}`}
        {...line}
      />

      {/* Basket */}
      <circle cx={px(BASKET_X)} cy={py(BASKET_Y)} r={basketRadius} {...line} />
    </>
  );

  // Same transforms as paintCourt (courtRendering.ts).
  const nearEnd = `translate(0 ${layout.innerH + layout.oobBot})`;
  const court =
    variant === "full" ? (
      <>
        <g transform={nearEnd}>{halfCourt}</g>
        <g transform={`${nearEnd} scale(1 -1)`}>{halfCourt}</g>
      </>
    ) : (
      halfCourt
    );

  // Ball: above its holder in SCREEN space (never negated when flipped), as in
  // the editor; free otherwise. Like the editor (and the exports) the holder is
  // looked up whether or not it is visible, so a ball attached to a hidden
  // player is drawn above that player's spot. An attached ball is kept inside
  // the frame: a holder at the top edge would otherwise push it out of view.
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
  const ball = scene.ball ?? null;
  let ballPos: { x: number; y: number } | null = ball ? pos(ball) : null;
  if (ball?.attachedTo) {
    const { side, position } = ball.attachedTo;
    const holder = scene.players[side].find((p) => p.position === position);
    if (holder) {
      const h = pos(holder);
      ballPos = {
        x: clamp(h.x, ballR, W - ballR),
        y: clamp(h.y + thumbnailBallAttachOffsetY(dotR, ballR), top + ballR, top + H - ballR),
      };
    }
  }

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 ${top} ${W} ${H}`}
      aria-hidden="true"
      style={
        fluid
          ? { display: "block", width: "100%", height: "auto", borderRadius: cornerRadius }
          : { display: "block", borderRadius: cornerRadius }
      }
    >
      {/* Floor (also the out-of-bounds band a flipped court shows) */}
      <rect x={0} y={top} width={W} height={H} fill={COLOR_COURT} rx={cornerRadius} />

      {flipped ? <g transform={`translate(0 ${layout.totalHeight}) scale(1 -1)`}>{court}</g> : court}

      {/* Frame */}
      <rect x={0} y={top} width={W} height={H} fill="none" stroke={COLOR_LINE} strokeWidth={outlineWidth} rx={cornerRadius} />

      {/* Players — defense under offense, as in the editor */}
      {scene.players.defense
        .filter((p) => p.visible)
        .map((p) => {
          const { x, y } = pos(p);
          return <circle key={`d-${p.position}`} cx={x} cy={y} r={dotR} fill={defenseColor} stroke={COLOR_LINE} strokeWidth={lineWidth} />;
        })}
      {scene.players.offense
        .filter((p) => p.visible)
        .map((p) => {
          const { x, y } = pos(p);
          return <circle key={`o-${p.position}`} cx={x} cy={y} r={dotR} fill={offenseColor} stroke={COLOR_LINE} strokeWidth={lineWidth} />;
        })}

      {/* Ball — on top of all players */}
      {ballPos && <circle cx={ballPos.x} cy={ballPos.y} r={ballR} fill={COLOR_BALL} stroke={COLOR_LINE} strokeWidth={lineWidth} />}
    </svg>
  );
}
