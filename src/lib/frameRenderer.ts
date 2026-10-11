/**
 * Frame renderer — the single painter of the export pipeline.
 *
 * renderSceneToCtx draws one complete frame (court, players, ball,
 * annotations) on any 2D context. PNG, MP4 / WebM and PDF all call it, so
 * every export is the same picture. It is a neutral module: no encoder, no
 * DOM lookups, nothing format-specific.
 *
 * It follows the shared recipe exactly, so the output matches the editor:
 *   court       → paintCourt(ctx, layout, { flipped })           (courtRendering)
 *   positions   → normToCanvasPx(x, y, layout, flipped)          (courtLayout)
 *   token size  → computeTokenSizes(layout.innerW)               (tokenSizing)
 *   annotations → the editor's AnnotationLayer.tsx, transcribed  (below)
 *
 * ANNOTATIONS — the editor is the reference
 * -----------------------------------------
 * AnnotationLayer.tsx draws every annotation at reference sizes (2.5 px lines,
 * 12 px arrowheads, … on a 600 px court) in an SVG layer that sits ON TOP of the player and ball
 * tokens, in stored order. drawAnnotation below is a transcription of its
 * RenderedAnnotation, type by type: same colours, widths, dash patterns,
 * opacity, zigzag, bar, tick and arrowhead geometry, and the same rules for
 * curves (one quadratic control point) and multi-leg waypoints (move / cut /
 * dribble only). All its pixel sizes are multiplied by annotationScale() so
 * they keep their size relative to the tokens at any export resolution; the
 * editor scales its SVG group by the same factor.
 * Editor-only aids — step badges, the selection ring and drag handles — are
 * not part of the picture and are not drawn.
 */

import type { Scene, Annotation } from "./types";
import type { PlayerDisplayMode } from "./store";
import { computeCourtLayout, normToCanvasPx } from "@/lib/courtLayout";
import type { CourtLayout, CourtVariant } from "@/lib/courtLayout";
import { paintCourt } from "@/lib/courtRendering";
import {
  computeTokenSizes,
  playerScale,
  ballScale,
  PLAYER_RADIUS,
  PLAYER_RADIUS_RATIO,
  playerLabelFontSize,
} from "@/lib/tokenSizing";
import { LIGHT_COURT_PALETTE, contrastText, customTeamColor, type CourtPalette } from "@/lib/courtPalette";

// ---------------------------------------------------------------------------
// Animation frame presets (video encoder)
// ---------------------------------------------------------------------------

/** Brief pause between scenes (ms). */
export const SCENE_HOLD_MS = 400;

/** Longer hold on the last frame at the end of the video (ms). */
export const FINAL_HOLD_MS = 1200;

/** Resolution preset of an animated export. */
export type FrameResolution = "sd" | "hd";

/** Total frame width in px (including the side out-of-bounds margins) per preset. */
export const RESOLUTION_WIDTH: Record<FrameResolution, number> = {
  sd: 480,
  hd: 800,
};

// ---------------------------------------------------------------------------
// Frame style
// ---------------------------------------------------------------------------

/**
 * How the editor currently shows a play: label mode, player names and team
 * colours. The one style type of the export pipeline — the PNG, video and PDF
 * options all extend it and pass it on unchanged to renderSceneToCtx.
 */
export interface FrameStyle {
  /** Player label mode. Default "numbers". */
  displayMode?: PlayerDisplayMode;
  /** Names keyed "offense-1" / "defense-4". Default none. */
  playerNames?: Record<string, string>;
  /** Offense token fill. Default the palette's. */
  offenseColor?: string;
  /** Defense token fill. Default the palette's. */
  defenseColor?: string;
  /**
   * Court, token and ball colours. Default LIGHT_COURT_PALETTE — the exports
   * never set it, so they are drawn on the light court in either theme.
   */
  palette?: CourtPalette;
}

// ---------------------------------------------------------------------------
// Player drawing
// ---------------------------------------------------------------------------

const POSITION_ABBRS: Record<number, string> = { 1: "PG", 2: "SG", 3: "SF", 4: "PF", 5: "C" };

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  side: "offense" | "defense",
  position: number,
  px: number,
  py: number,
  r: number,
  style: FrameStyle,
  palette: CourtPalette,
): void {
  const { displayMode = "numbers", playerNames = {}, offenseColor, defenseColor } = style;
  const isOffense = side === "offense";
  // Scale all size-based values proportionally to the token radius.
  const s = playerScale(r);

  // Colours mirror PlayerToken.tsx: team colour else the palette's fill, the
  // palette's outline, and a label that contrasts with the fill.
  const fill = isOffense
    ? customTeamColor(offenseColor) ?? palette.offenseFill
    : customTeamColor(defenseColor) ?? palette.defenseFill;

  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.arc(px + s, py + 2 * s, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(px, py, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = palette.tokenStroke;
  ctx.lineWidth = Math.max(1.5, 2 * s);
  ctx.stroke();

  // Label rules mirror PlayerToken.tsx so a taped play reads like the editor.
  let label: string;
  if (displayMode === "names") {
    const key = `${side}-${position}`;
    label = playerNames[key] ?? (isOffense ? String(position) : `X${position}`);
  } else if (displayMode === "abbreviations") {
    label = POSITION_ABBRS[position] ?? String(position);
  } else {
    // "numbers"
    label = String(position);
  }
  const fontSize = playerLabelFontSize(label.length, r);

  ctx.fillStyle = contrastText(fill);
  ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, px, py);
}

// ---------------------------------------------------------------------------
// Ball drawing
// ---------------------------------------------------------------------------

function drawBall(ctx: CanvasRenderingContext2D, px: number, py: number, r: number, palette: CourtPalette): void {
  const s = ballScale(r);

  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.arc(px + s, py + 2 * s, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(px, py, r, 0, Math.PI * 2);
  ctx.fillStyle = palette.ball;
  ctx.fill();
  ctx.strokeStyle = palette.ballSeam;
  ctx.lineWidth = 1.5 * s;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(px - r * 0.5, py - r * 0.6);
  ctx.arc(px, py, r * 0.7, Math.PI + 0.6, Math.PI * 2 - 0.4, false);
  ctx.strokeStyle = palette.ballHighlight;
  ctx.lineWidth = 1.5 * s;
  ctx.lineCap = "round";
  ctx.globalAlpha = 0.5;
  ctx.stroke();
  ctx.globalAlpha = 1;

  const vPath = new Path2D(
    `M ${px} ${py - r} C ${px + r * 0.55} ${py - r * 0.5} ${px + r * 0.55} ${py + r * 0.5} ${px} ${py + r}`,
  );
  ctx.strokeStyle = palette.ballSeam;
  ctx.lineWidth = 1.2 * s;
  ctx.lineCap = "round";
  ctx.stroke(vPath);

  const hPath = new Path2D(
    `M ${px - r} ${py} C ${px - r * 0.5} ${py + r * 0.4} ${px + r * 0.5} ${py + r * 0.4} ${px + r} ${py}`,
  );
  ctx.stroke(hPath);
}

// ---------------------------------------------------------------------------
// Annotation drawing — a transcription of AnnotationLayer.tsx RenderedAnnotation
// ---------------------------------------------------------------------------

type Pt = { x: number; y: number };

/** Annotation colours — AnnotationLayer.tsx. */
const ANNOTATION_COLOR: Record<Annotation["type"], string> = {
  movement: "#1E3A5F",
  dribble: "#1E3A5F",
  pass: "#059669",
  screen: "#7C3AED",
  cut: "#DC2626",
  guard: "#D97706",
  handoff: "#0369A1",
};

/**
 * Scale factor for every annotation size (stroke widths, dash patterns,
 * arrowheads, zigzag, bars and ticks).
 *
 * Sizes are written for the tokens' design size: the court at which a player
 * token has its base radius (PLAYER_RADIUS = 18 px, i.e. an inner court width
 * of 600 px). Elsewhere they scale with the inner court width, like the
 * tokens, so a 12 px arrowhead is always 2/3 of a token radius. The exporter
 * multiplies each size by this factor; the editor (AnnotationLayer) scales
 * the SVG group its lines are drawn in by it.
 *
 * @param innerCourtWidth  CourtLayout.innerW — NOT the total canvas width.
 */
export function annotationScale(innerCourtWidth: number): number {
  return innerCourtWidth / (PLAYER_RADIUS / PLAYER_RADIUS_RATIO);
}

/** Quadratic bezier point at t (linear when there is no control point). */
function bezierPoint(from: Pt, to: Pt, t: number, cp?: Pt): Pt {
  if (!cp) return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
  const mt = 1 - t;
  return {
    x: mt * mt * from.x + 2 * mt * t * cp.x + t * t * to.x,
    y: mt * mt * from.y + 2 * mt * t * cp.y + t * t * to.y,
  };
}

/** Stroke from → to, through the control point when there is one. */
function strokeBezier(ctx: CanvasRenderingContext2D, from: Pt, to: Pt, cp?: Pt): void {
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  if (cp) ctx.quadraticCurveTo(cp.x, cp.y, to.x, to.y);
  else ctx.lineTo(to.x, to.y);
  ctx.stroke();
}

function strokePolyline(ctx: CanvasRenderingContext2D, pts: Pt[]): void {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
}

function strokeSegment(ctx: CanvasRenderingContext2D, a: Pt, b: Pt): void {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

/**
 * Filled arrowhead with its tip at `tip`, pointing away from `tail`
 * (AnnotationLayer arrowHead / arrowHeadBezier: length `size`, half-width
 * 0.45 × size). Nothing is drawn when the direction is undefined.
 */
function fillArrowHead(ctx: CanvasRenderingContext2D, tip: Pt, tail: Pt, size: number): void {
  const dx = tip.x - tail.x;
  const dy = tip.y - tail.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return;
  const ux = dx / len;
  const uy = dy / len;
  const baseX = tip.x - ux * size;
  const baseY = tip.y - uy * size;
  const w = size * 0.45;
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(baseX - uy * w, baseY + ux * w);
  ctx.lineTo(baseX + uy * w, baseY - ux * w);
  ctx.closePath();
  ctx.fill();
}

function drawAnnotation(
  ctx: CanvasRenderingContext2D,
  ann: Annotation,
  layout: CourtLayout,
  flipped: boolean,
): void {
  const { type } = ann;
  const s = annotationScale(layout.innerW);
  // Normalised [0-1] coords → canvas pixels: the shared mapping, nothing else.
  const pt = (p: Pt) => normToCanvasPx(p.x, p.y, layout, flipped);
  const from = pt(ann.from);
  const to = pt(ann.to);

  // Multi-leg path: from → waypoints → to. A control point only applies to
  // single-leg annotations.
  const hasWaypoints = !!ann.waypoints && ann.waypoints.length > 0;
  const allPts: Pt[] = hasWaypoints ? [from, ...(ann.waypoints ?? []).map(pt), to] : [];
  const cp: Pt | undefined = !hasWaypoints && ann.controlPoints.length > 0 ? pt(ann.controlPoints[0]) : undefined;

  const color = ANNOTATION_COLOR[type];
  if (!color) return;

  // Arrowhead: last leg when multi-leg, control-point tangent when curved,
  // from → to otherwise.
  const head = () =>
    fillArrowHead(ctx, to, hasWaypoints ? allPts[allPts.length - 2] : cp ?? from, 12 * s);
  const dash = (...px: number[]) => ctx.setLineDash(px.map((v) => v * s));

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 2.5 * s;
  ctx.setLineDash([]);

  if (type === "movement") {
    if (hasWaypoints) strokePolyline(ctx, allPts);
    else strokeBezier(ctx, from, to, cp);
    head();
    return;
  }

  if (type === "dribble") {
    if (hasWaypoints || cp) {
      // Multi-leg or curved dribble: dashed line (no zigzag)
      dash(5, 4);
      if (hasWaypoints) strokePolyline(ctx, allPts);
      else strokeBezier(ctx, from, to, cp);
      ctx.setLineDash([]);
    } else {
      // Straight dribble: zigzag. The offset is zero at both ends so the path
      // starts / ends exactly on from / to and the arrowhead lines up.
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const zigCount = Math.max(2, Math.round(len / (18 * s)));
      ctx.beginPath();
      for (let i = 0; i <= zigCount; i++) {
        const t = i / zigCount;
        const perp = i === 0 || i === zigCount ? 0 : (i % 2 === 0 ? 6 : -6) * s;
        const x = from.x + dx * t + (len > 0 ? (-dy / len) * perp : 0);
        const y = from.y + dy * t + (len > 0 ? (dx / len) * perp : 0);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    head();
    return;
  }

  if (type === "pass") {
    // Solid line (straight or curved) with a solid triangle tip. Not multi-leg.
    ctx.lineWidth = 2 * s;
    strokeBezier(ctx, from, to, hasWaypoints ? undefined : cp);
    head();
    return;
  }

  if (type === "screen") {
    // Straight line with a perpendicular bar at the end; no arrowhead.
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const ux = len > 0 ? dx / len : 1;
    const uy = len > 0 ? dy / len : 0;
    const perp = { x: -uy * 10 * s, y: ux * 10 * s };
    strokeSegment(ctx, from, to);
    ctx.lineWidth = 3 * s;
    strokeSegment(ctx, { x: to.x + perp.x, y: to.y + perp.y }, { x: to.x - perp.x, y: to.y - perp.y });
    return;
  }

  if (type === "cut") {
    dash(7, 5);
    if (hasWaypoints) strokePolyline(ctx, allPts);
    else strokeBezier(ctx, from, to, cp);
    ctx.setLineDash([]);
    head();
    return;
  }

  if (type === "guard") {
    // Assignment link: dashed, slightly transparent, no arrowhead.
    ctx.lineWidth = 2 * s;
    ctx.globalAlpha = 0.85;
    dash(4, 4);
    strokeBezier(ctx, from, to, cp);
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    return;
  }

  if (type === "handoff") {
    dash(6, 4);
    strokeBezier(ctx, from, to, cp);
    ctx.setLineDash([]);

    // Two solid perpendicular tick marks near the delivery point.
    const tickLen = 9 * s;
    for (const t of [0.85, 0.72]) {
      const at = bezierPoint(from, to, t, cp);
      const before = bezierPoint(from, to, t - 0.02, cp);
      const ddx = at.x - before.x;
      const ddy = at.y - before.y;
      const dlen = Math.sqrt(ddx * ddx + ddy * ddy);
      const pux = dlen > 0 ? -ddy / dlen : 0;
      const puy = dlen > 0 ? ddx / dlen : 1;
      strokeSegment(
        ctx,
        { x: at.x + pux * tickLen, y: at.y + puy * tickLen },
        { x: at.x - pux * tickLen, y: at.y - puy * tickLen },
      );
    }
    head();
    return;
  }
}

// ---------------------------------------------------------------------------
// Frame rendering
// ---------------------------------------------------------------------------

/**
 * Draw one complete frame — court, players, ball, annotations — on any 2D
 * context. Pure: no DOM lookups, no canvas sizing.
 *
 * Drawing order is the editor's stacking order: court, defense, offense, ball,
 * then every annotation on top, in the order given (AnnotationLayer is an SVG
 * layer above the token layer).
 *
 * Coordinates are in the units of `layout` (logical px). The caller owns
 * canvas sizing and any resolution scaling.
 *
 * @param style  Label mode, names and team colours (FrameStyle).
 */
export function renderSceneToCtx(
  ctx: CanvasRenderingContext2D,
  layout: CourtLayout,
  scene: Scene,
  visibleAnnotations: Annotation[],
  flipped = false,
  style: FrameStyle = {},
): void {
  const { playerR, ballR, ballAttachOffsetY } = computeTokenSizes(layout.innerW);
  const pos = (p: { x: number; y: number }) => normToCanvasPx(p.x, p.y, layout, flipped);

  // Court floor (incl. OOB margins) + markings
  const palette = style.palette ?? LIGHT_COURT_PALETTE;
  paintCourt(ctx, layout, { flipped, palette });

  ctx.save();

  // Defense (underneath offense)
  for (const p of scene.players.defense) {
    if (p.visible) {
      const { x, y } = pos(p);
      drawPlayer(ctx, "defense", p.position, x, y, playerR, style, palette);
    }
  }

  // Offense
  for (const p of scene.players.offense) {
    if (p.visible) {
      const { x, y } = pos(p);
      drawPlayer(ctx, "offense", p.position, x, y, playerR, style, palette);
    }
  }

  // Ball — a scene may have none (older stored plays): draw everything else.
  const ball = scene.ball ?? null;
  if (ball) {
    let ballPx = pos(ball);
    if (ball.attachedTo) {
      const pool =
        ball.attachedTo.side === "offense" ? scene.players.offense : scene.players.defense;
      const holder = pool.find((p) => p.position === ball.attachedTo!.position);
      if (holder) {
        // Screen space: the ball always sits above its holder, flipped or not —
        // exactly as in the editor.
        const h = pos(holder);
        ballPx = { x: h.x, y: h.y + ballAttachOffsetY };
      }
    }
    drawBall(ctx, ballPx.x, ballPx.y, ballR, palette);
  }

  // Annotations — on top of the tokens and the ball, as in the editor
  for (const ann of visibleAnnotations) {
    drawAnnotation(ctx, ann, layout, flipped);
  }

  ctx.restore();
}

/**
 * Render a single animation frame onto the given canvas.
 *
 * @param canvas    Destination canvas (already sized to width × layout.totalHeight).
 * @param scene     Scene data (player positions, ball, timing groups).
 * @param visibleAnnotations  Annotations to draw on this frame (cumulative subset).
 * @param width     Canvas width in px (total, including OOB side margins).
 * @param height    Canvas height in px (unused — derived from the layout).
 * @param style     Label mode, names and team colours (FrameStyle).
 * @param variant   Court variant; the canvas must be computeCourtLayout(width, variant).totalHeight tall.
 */
export function renderFrame(
  canvas: HTMLCanvasElement,
  scene: Scene,
  visibleAnnotations: Annotation[],
  width: number,
  height: number,
  flipped = false,
  style: FrameStyle = {},
  variant: CourtVariant = "half",
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  renderSceneToCtx(ctx, computeCourtLayout(width, variant), scene, visibleAnnotations, flipped, style);
}
