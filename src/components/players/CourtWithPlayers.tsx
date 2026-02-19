"use client";

/**
 * CourtWithPlayers — wraps the Court canvas and overlays draggable player tokens
 * and a draggable basketball.
 *
 * Implements issues #51, #52, and #55:
 *   #51 — Draggable offensive players (O1–O5)
 *   #52 — Draggable defensive players (X1–X5)
 *   #55 — Ball placement and player attachment
 *
 * Architecture:
 *   - The Court canvas is rendered inside a relatively-positioned container.
 *   - An absolutely-positioned SVG layer of the same dimensions is overlaid on top.
 *   - Player tokens and the ball are SVG <g> elements positioned in CSS pixel coords.
 *   - Normalised [0-1] court coords are used in the Zustand store; conversion
 *     to/from CSS pixels is done via the courtToCanvas callback from Court.
 *
 * Ball behaviour:
 *   - Freely draggable across the court.
 *   - When released within SNAP_RADIUS of a player, it attaches to that player.
 *   - While attached, it renders offset above the player token and moves with it.
 *   - Dragging the ball past DETACH_RADIUS from the player detaches it.
 *
 * Default positions:
 *   Offense — standard 5-out (perimeter) set:
 *     O1 (PG) top of key, O2/O3 wings, O4/O5 corners
 *   Defense — man-to-man mirroring:
 *     X1–X5 shadow their offensive counterparts with a ~4ft sag
 */

import { useState, useCallback, useRef } from "react";
import Court, { type CourtReadyPayload } from "@/components/court/Court";
import PlayerToken from "./PlayerToken";
import BallToken, { type NearbyPlayer, DETACH_RADIUS } from "./BallToken";
import AnnotationLayer from "@/components/annotations/AnnotationLayer";
import { useStore } from "@/lib/store";
import type { Scene, PlayerState, BallState } from "@/lib/types";

// ---------------------------------------------------------------------------
// Default normalised court positions (y: 0 = half-court, 1 = baseline)
// ---------------------------------------------------------------------------

/**
 * Offensive 5-out spacing defaults.
 * Positions are (normX, normY) in court coordinate space [0-1].
 */
const OFFENSE_DEFAULTS: [number, number][] = [
  [0.5, 0.35], // O1 — PG, top of key
  [0.18, 0.48], // O2 — left wing
  [0.82, 0.48], // O3 — right wing
  [0.08, 0.75], // O4 — left corner
  [0.92, 0.75], // O5 — right corner
];

/**
 * Defensive defaults — slightly higher (sagging toward basket).
 */
const DEFENSE_DEFAULTS: [number, number][] = [
  [0.5, 0.42],  // X1 — on ball
  [0.22, 0.54], // X2
  [0.78, 0.54], // X3
  [0.14, 0.78], // X4
  [0.86, 0.78], // X5
];

/** Default ball position — near the PG (O1). */
const BALL_DEFAULT: { x: number; y: number } = { x: 0.5, y: 0.35 };

/**
 * CSS pixel offset from the player centre at which the attached ball is drawn
 * (above the token so both are visible).
 */
const BALL_ATTACH_OFFSET_Y = -22;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normToPixel(
  normX: number,
  normY: number,
  width: number,
  height: number,
): { x: number; y: number } {
  return { x: normX * width, y: normY * height };
}

function pixelToNorm(
  px: number,
  py: number,
  width: number,
  height: number,
): { x: number; y: number } {
  return { x: px / width, y: py / height };
}

/** Create a default PlayerState array from normalised position defaults. */
function defaultPlayers(
  defaults: [number, number][],
): PlayerState[] {
  return defaults.map(([x, y], i) => ({
    position: i + 1,
    x,
    y,
    visible: true,
  }));
}

// ---------------------------------------------------------------------------
// Local player position state (pixel coords) — derived from store / defaults
// ---------------------------------------------------------------------------

interface PixelPlayer {
  position: number;
  px: number;
  py: number;
  visible: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface CourtWithPlayersProps {
  /** The id of the currently active scene, used to write to the store. */
  sceneId?: string;
  /** Optional scene to read player positions from. Falls back to defaults. */
  scene?: Scene | null;
  className?: string;
}

export default function CourtWithPlayers({ sceneId, scene, className }: CourtWithPlayersProps) {
  const updatePlayerState  = useStore((s) => s.updatePlayerState);
  const updateBallState    = useStore((s) => s.updateBallState);
  const displayMode        = useStore((s) => s.playerDisplayMode);

  // Court layout reported by the Court canvas
  const [courtSize, setCourtSize] = useState<{ width: number; height: number } | null>(null);

  // Local pixel-position state for smooth dragging (avoids round-tripping through store on every mousemove)
  const [offensePx, setOffensePx] = useState<PixelPlayer[] | null>(null);
  const [defensePx, setDefensePx] = useState<PixelPlayer[] | null>(null);

  // Ball pixel position — free coords when not attached, follows player when attached
  const [ballPx, setBallPx] = useState<{ x: number; y: number } | null>(null);
  // Attachment: which player the ball is attached to (null = free)
  const [ballAttachment, setBallAttachment] = useState<{
    side: "offense" | "defense";
    position: number;
  } | null>(null);

  // Track the last known court size for re-projection on resize
  const courtSizeRef = useRef<{ width: number; height: number } | null>(null);

  // -------------------------------------------------------------------------
  // Derive visibility directly from the scene prop (source of truth in the
  // Zustand store) rather than caching it in local pixel state. This ensures
  // that togglePlayerVisibility updates are always reflected immediately
  // without relying on a useEffect to sync the flag into offensePx/defensePx.
  // -------------------------------------------------------------------------
  const offenseVisible = scene?.players.offense ?? null;
  const defenseVisible = scene?.players.defense ?? null;

  // -------------------------------------------------------------------------
  // Derived: effective ball pixel centre (follows player if attached)
  // -------------------------------------------------------------------------
  function getEffectiveBallPx(
    attachment: { side: "offense" | "defense"; position: number } | null,
    offense: PixelPlayer[] | null,
    defense: PixelPlayer[] | null,
    freeBall: { x: number; y: number } | null,
  ): { x: number; y: number } | null {
    if (attachment) {
      const pool = attachment.side === "offense" ? offense : defense;
      const player = pool?.find((p) => p.position === attachment.position);
      if (player) {
        return { x: player.px, y: player.py + BALL_ATTACH_OFFSET_Y };
      }
    }
    return freeBall;
  }

  // -------------------------------------------------------------------------
  // When the court canvas reports its size, initialise pixel positions
  // -------------------------------------------------------------------------
  const handleCourtReady = useCallback(
    (payload: CourtReadyPayload) => {
      const { width, height } = payload;
      const prevSize = courtSizeRef.current;
      courtSizeRef.current = { width, height };
      setCourtSize({ width, height });

      // If size changed (resize) but we already have pixel positions, re-project
      if (prevSize && (prevSize.width !== width || prevSize.height !== height)) {
        setOffensePx((prev) =>
          prev
            ? prev.map((p) => {
                const norm = pixelToNorm(p.px, p.py, prevSize.width, prevSize.height);
                const { x, y } = normToPixel(norm.x, norm.y, width, height);
                return { ...p, px: x, py: y };
              })
            : null,
        );
        setDefensePx((prev) =>
          prev
            ? prev.map((p) => {
                const norm = pixelToNorm(p.px, p.py, prevSize.width, prevSize.height);
                const { x, y } = normToPixel(norm.x, norm.y, width, height);
                return { ...p, px: x, py: y };
              })
            : null,
        );
        setBallPx((prev) => {
          if (!prev) return null;
          const norm = pixelToNorm(prev.x, prev.y, prevSize.width, prevSize.height);
          const { x, y } = normToPixel(norm.x, norm.y, width, height);
          return { x, y };
        });
        return;
      }

      // First render — project from store or defaults
      if (!prevSize) {
        const offenseStoreState = scene?.players.offense ?? defaultPlayers(OFFENSE_DEFAULTS);
        const defenseStoreState = scene?.players.defense ?? defaultPlayers(DEFENSE_DEFAULTS);

        setOffensePx(
          offenseStoreState.map((p) => {
            const { x, y } = normToPixel(p.x, p.y, width, height);
            return { position: p.position, px: x, py: y, visible: p.visible };
          }),
        );
        setDefensePx(
          defenseStoreState.map((p) => {
            const { x, y } = normToPixel(p.x, p.y, width, height);
            return { position: p.position, px: x, py: y, visible: p.visible };
          }),
        );

        // Ball initialisation
        const storeBall = scene?.ball ?? { ...BALL_DEFAULT, attachedTo: null };
        const { x: ballX, y: ballY } = normToPixel(storeBall.x, storeBall.y, width, height);
        setBallPx({ x: ballX, y: ballY });
        setBallAttachment(storeBall.attachedTo ?? null);
      }
    },
    [scene],
  );

  // -------------------------------------------------------------------------
  // Drag handlers — players
  // -------------------------------------------------------------------------

  const handleOffenseDrag = useCallback((position: number, newCx: number, newCy: number) => {
    setOffensePx((prev) =>
      prev
        ? prev.map((p) => (p.position === position ? { ...p, px: newCx, py: newCy } : p))
        : prev,
    );
  }, []);

  const handleOffenseDragEnd = useCallback(
    (position: number, newCx: number, newCy: number) => {
      setOffensePx((prev) => {
        if (!prev) return prev;
        const updated = prev.map((p) => (p.position === position ? { ...p, px: newCx, py: newCy } : p));
        if (sceneId && courtSizeRef.current) {
          const { x, y } = pixelToNorm(newCx, newCy, courtSizeRef.current.width, courtSizeRef.current.height);
          // Read visible from the scene prop (source of truth) to avoid overwriting
          // a visibility toggle with a stale value from local pixel state.
          const scenePlayer = offenseVisible?.find((sp) => sp.position === position);
          const visible = scenePlayer ? scenePlayer.visible : (updated.find((p) => p.position === position)?.visible ?? true);
          updatePlayerState(sceneId, "offense", { position, x, y, visible });
        }
        return updated;
      });
    },
    [sceneId, updatePlayerState, offenseVisible],
  );

  const handleDefenseDrag = useCallback((position: number, newCx: number, newCy: number) => {
    setDefensePx((prev) =>
      prev
        ? prev.map((p) => (p.position === position ? { ...p, px: newCx, py: newCy } : p))
        : prev,
    );
  }, []);

  const handleDefenseDragEnd = useCallback(
    (position: number, newCx: number, newCy: number) => {
      setDefensePx((prev) => {
        if (!prev) return prev;
        const updated = prev.map((p) => (p.position === position ? { ...p, px: newCx, py: newCy } : p));
        if (sceneId && courtSizeRef.current) {
          const { x, y } = pixelToNorm(newCx, newCy, courtSizeRef.current.width, courtSizeRef.current.height);
          // Read visible from the scene prop (source of truth) to avoid overwriting
          // a visibility toggle with a stale value from local pixel state.
          const scenePlayer = defenseVisible?.find((sp) => sp.position === position);
          const visible = scenePlayer ? scenePlayer.visible : (updated.find((p) => p.position === position)?.visible ?? true);
          updatePlayerState(sceneId, "defense", { position, x, y, visible });
        }
        return updated;
      });
    },
    [sceneId, updatePlayerState, defenseVisible],
  );

  // -------------------------------------------------------------------------
  // Drag handlers — ball
  // -------------------------------------------------------------------------

  /**
   * Build the list of all visible player positions for snap/detach detection.
   * Used by BallToken to find the nearest player.
   *
   * Visibility is read from the scene prop (Zustand source of truth) rather
   * than from local pixel state so that togglePlayerVisibility changes are
   * immediately reflected in ball-snap behaviour too.
   */
  function buildPlayerList(
    offense: PixelPlayer[] | null,
    defense: PixelPlayer[] | null,
  ): NearbyPlayer[] {
    const result: NearbyPlayer[] = [];
    for (const p of offense ?? []) {
      const scenePlayer = offenseVisible?.find((sp) => sp.position === p.position);
      const visible = scenePlayer ? scenePlayer.visible : p.visible;
      if (visible) result.push({ px: p.px, py: p.py, side: "offense", position: p.position });
    }
    for (const p of defense ?? []) {
      const scenePlayer = defenseVisible?.find((sp) => sp.position === p.position);
      const visible = scenePlayer ? scenePlayer.visible : p.visible;
      if (visible) result.push({ px: p.px, py: p.py, side: "defense", position: p.position });
    }
    return result;
  }

  const handleBallDrag = useCallback(
    (newCx: number, newCy: number) => {
      // While dragging, check if we should detach
      setBallAttachment((prevAttachment) => {
        if (prevAttachment) {
          // Get current player position
          const pool = prevAttachment.side === "offense" ? offensePx : defensePx;
          const player = pool?.find((p) => p.position === prevAttachment.position);
          if (player) {
            const dx = newCx - player.px;
            const dy = newCy - player.py;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > DETACH_RADIUS) {
              // Detach
              setBallPx({ x: newCx, y: newCy });
              return null;
            }
            // Still attached — don't update free position
            return prevAttachment;
          }
        }
        // Free ball: update position
        setBallPx({ x: newCx, y: newCy });
        return prevAttachment;
      });
    },
    [offensePx, defensePx],
  );

  const handleBallDragEnd = useCallback(
    (newCx: number, newCy: number, nearest: NearbyPlayer | null) => {
      let newBallState: BallState;

      if (nearest) {
        // Snap to player
        setBallAttachment({ side: nearest.side, position: nearest.position });
        // Free position becomes player position (for re-projection on resize)
        setBallPx({ x: nearest.px, y: nearest.py });
        if (sceneId && courtSizeRef.current) {
          const { x, y } = pixelToNorm(
            nearest.px,
            nearest.py,
            courtSizeRef.current.width,
            courtSizeRef.current.height,
          );
          newBallState = { x, y, attachedTo: { side: nearest.side, position: nearest.position } };
        } else {
          return;
        }
      } else {
        // Free placement
        setBallAttachment(null);
        setBallPx({ x: newCx, y: newCy });
        if (sceneId && courtSizeRef.current) {
          const { x, y } = pixelToNorm(newCx, newCy, courtSizeRef.current.width, courtSizeRef.current.height);
          newBallState = { x, y, attachedTo: null };
        } else {
          return;
        }
      }

      updateBallState(sceneId!, newBallState);
    },
    [sceneId, updateBallState],
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const allPlayers = buildPlayerList(offensePx, defensePx);
  const effectiveBall = getEffectiveBallPx(ballAttachment, offensePx, defensePx, ballPx);

  return (
    <div className={`relative ${className ?? "w-full"}`}>
      {/* Court canvas */}
      <Court onReady={handleCourtReady} className="w-full" />

      {/* SVG player + ball overlay — same dimensions as the canvas */}
      {courtSize && (
        <svg
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: courtSize.width,
            height: courtSize.height,
            overflow: "visible",
            pointerEvents: "none",
          }}
          viewBox={`0 0 ${courtSize.width} ${courtSize.height}`}
          aria-hidden="true"
        >
          {/* Enable pointer events only on the tokens themselves */}
          <g style={{ pointerEvents: "all" }}>
            {/* Defensive players (rendered first = underneath offensive) */}
            {defensePx
              ?.filter((p) => {
                // Read visibility from scene (Zustand source of truth) so that
                // togglePlayerVisibility changes are reflected immediately
                // without relying on local pixel state staying in sync.
                const scenePlayer = defenseVisible?.find((sp) => sp.position === p.position);
                return scenePlayer ? scenePlayer.visible : p.visible;
              })
              .map((p) => (
                <PlayerToken
                  key={`defense-${p.position}`}
                  side="defense"
                  position={p.position}
                  cx={p.px}
                  cy={p.py}
                  courtBounds={courtSize}
                  onDrag={(x, y) => handleDefenseDrag(p.position, x, y)}
                  onDragEnd={(x, y) => handleDefenseDragEnd(p.position, x, y)}
                  displayMode={displayMode}
                />
              ))}

            {/* Offensive players (rendered on top of defensive) */}
            {offensePx
              ?.filter((p) => {
                // Read visibility from scene (Zustand source of truth) so that
                // togglePlayerVisibility changes are reflected immediately
                // without relying on local pixel state staying in sync.
                const scenePlayer = offenseVisible?.find((sp) => sp.position === p.position);
                return scenePlayer ? scenePlayer.visible : p.visible;
              })
              .map((p) => (
                <PlayerToken
                  key={`offense-${p.position}`}
                  side="offense"
                  position={p.position}
                  cx={p.px}
                  cy={p.py}
                  courtBounds={courtSize}
                  onDrag={(x, y) => handleOffenseDrag(p.position, x, y)}
                  onDragEnd={(x, y) => handleOffenseDragEnd(p.position, x, y)}
                  displayMode={displayMode}
                />
              ))}

            {/* Basketball — rendered on top of all players */}
            {effectiveBall && (
              <BallToken
                cx={effectiveBall.x}
                cy={effectiveBall.y}
                attached={ballAttachment !== null}
                onDrag={handleBallDrag}
                onDragEnd={handleBallDragEnd}
                players={allPlayers}
                courtBounds={courtSize}
              />
            )}
          </g>
        </svg>
      )}

      {/* Annotation drawing layer — sits above the player SVG so pointer events
          can be captured by the active drawing tool without interfering with
          player dragging when the select tool is active. */}
      {courtSize && (
        <AnnotationLayer
          width={courtSize.width}
          height={courtSize.height}
          sceneId={sceneId ?? null}
          players={allPlayers}
        />
      )}
    </div>
  );
}
