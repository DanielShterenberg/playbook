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

import { useState, useCallback, useRef, useEffect } from "react";
import Court, { type CourtReadyPayload, type CourtVariant } from "@/components/court/Court";
import PlayerToken from "./PlayerToken";
import BallToken, { type NearbyPlayer, DETACH_RADIUS } from "./BallToken";
import AnnotationLayer from "@/components/annotations/AnnotationLayer";
import { useStore } from "@/lib/store";
import { normToCanvasPx, canvasPxToNorm, hasCourtArea, reprojectCanvasPx, type CourtLayout } from "@/lib/courtLayout";
import { computeTokenSizes } from "@/lib/tokenSizing";
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

// Norm ↔ pixel mapping lives in @/lib/courtLayout (normToCanvasPx /
// canvasPxToNorm) and token sizing in @/lib/tokenSizing — both shared with
// every export path (#163, #169).

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  /**
   * "half" (default) — half-court view; players fill the whole canvas.
   * "full" — full-court view; players are placed in the near (bottom) end.
   */
  variant?: CourtVariant;
  className?: string;
  /** When true, player/ball dragging is disabled and the store is not updated. */
  readOnly?: boolean;
  /** When true, flips the court so the basket is at the top. */
  flipped?: boolean;
  /**
   * When provided, filter annotations to steps ≤ activeStep.
   * Pass this to enable step-by-step display in viewers with their own step state.
   */
  activeStep?: number;
}

export default function CourtWithPlayers({ sceneId, scene, variant = "half", className, readOnly = false, flipped = false, activeStep }: CourtWithPlayersProps) {
  const updatePlayerState  = useStore((s) => s.updatePlayerState);
  const updateBallState    = useStore((s) => s.updateBallState);
  const displayMode        = useStore((s) => s.playerDisplayMode);
  const playerNames        = useStore((s) => s.playerNames);
  const playColors         = useStore((s) => s.currentPlay?.colors);

  // Court layout reported by the Court canvas
  const [courtSize, setCourtSize] = useState<{
    width: number;
    height: number;
    playAreaWidth: number;
    playAreaHeight: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  // Local pixel-position state for smooth dragging (avoids round-tripping through store on every mousemove)
  const [offensePx, setOffensePx] = useState<PixelPlayer[] | null>(null);
  const [defensePx, setDefensePx] = useState<PixelPlayer[] | null>(null);

  // Always-current refs for the pixel state, so the drag-end handlers can read
  // it without running store writes inside a setState updater (issue #176).
  const offensePxRef = useRef(offensePx);
  offensePxRef.current = offensePx;
  const defensePxRef = useRef(defensePx);
  defensePxRef.current = defensePx;

  // Ball pixel position — free coords when not attached, follows player when attached
  const [ballPx, setBallPx] = useState<{ x: number; y: number } | null>(null);
  // Attachment: which player the ball is attached to (null = free)
  const [ballAttachment, setBallAttachment] = useState<{
    side: "offense" | "defense";
    position: number;
  } | null>(null);
  // Always-current ref for the attachment, read by handleBallDrag.
  const ballAttachmentRef = useRef(ballAttachment);
  ballAttachmentRef.current = ballAttachment;

  /**
   * The last layout reported by the Court canvas (null until first draw).
   * Carries the play area — the region where players live:
   *   half court: playAreaOffsetY = 0
   *   full court: playAreaOffsetY = innerH + oobBot
   * Used for norm ↔ pixel conversion and for re-projection on resize.
   */
  const layoutRef = useRef<CourtLayout | null>(null);

  // Always-current ref for flipped (readable in stable callbacks without causing re-creation)
  const flippedRef = useRef(flipped);
  flippedRef.current = flipped;

  // Always-current ref for scene prop — lets handleCourtReady (stable, no deps)
  // fall back to prop-based scene data when the Zustand store is empty
  // (e.g. read-only viewers that load a play outside the store).
  const scenePropRef = useRef(scene);
  scenePropRef.current = scene;

  // Track the last scene ID so we can reinitialise pixel positions on scene switch
  const prevSceneIdRef = useRef<string | null>(null);

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
    attachOffsetY: number,
  ): { x: number; y: number } | null {
    if (attachment) {
      const pool = attachment.side === "offense" ? offense : defense;
      const player = pool?.find((p) => p.position === attachment.position);
      if (player) {
        return { x: player.px, y: player.py + attachOffsetY };
      }
    }
    return freeBall;
  }

  // -------------------------------------------------------------------------
  // When the court canvas reports its size, initialise pixel positions.
  //
  // IMPORTANT: This callback has NO dependencies so it is never recreated.
  // A stable callback means Court's draw function never changes, so Court's
  // useEffect never re-fires due to visibility/scene changes — only on mount
  // and actual resizes. Scene changes are handled by the useEffect below.
  // -------------------------------------------------------------------------
  const handleCourtReady = useCallback(
    (payload: CourtReadyPayload) => {
      const { width, height, playAreaHeight, playAreaOffsetY, playAreaOffsetX, playAreaWidth, layout } = payload;
      // A collapsed / hidden container reports a zero-size court. Ignore it and
      // keep the last real layout: re-projecting through a zero-width layout
      // divides by zero and would leave every token at NaN for good.
      if (!hasCourtArea(layout)) return;
      const prevLayout = layoutRef.current;
      layoutRef.current = layout;
      setCourtSize({ width, height, playAreaWidth, playAreaHeight, offsetX: playAreaOffsetX, offsetY: playAreaOffsetY });

      const currentFlipped = flippedRef.current;

      // If size changed (resize) but we already have pixel positions, re-project
      if (prevLayout && (prevLayout.totalWidth !== width || prevLayout.totalHeight !== height)) {
        // Both layouts have a court area (guard above), so this never yields
        // null; the fallback keeps the position rather than inventing one.
        const reproject = (px: number, py: number) =>
          reprojectCanvasPx(px, py, prevLayout, layout, currentFlipped) ?? { x: px, y: py };
        setOffensePx((prev) =>
          prev
            ? prev.map((p) => {
                const { x, y } = reproject(p.px, p.py);
                return { ...p, px: x, py: y };
              })
            : null,
        );
        setDefensePx((prev) =>
          prev
            ? prev.map((p) => {
                const { x, y } = reproject(p.px, p.py);
                return { ...p, px: x, py: y };
              })
            : null,
        );
        setBallPx((prev) => (prev ? reproject(prev.x, prev.y) : null));
        return;
      }

      // First render — read from the Zustand store directly so this callback
      // does not need `scene` in its dep array (which would recreate it on every
      // visibility toggle, causing Court to redraw unnecessarily).
      // Fall back to the scene prop ref for read-only viewers (share view) where
      // the play is not loaded into the store.
      if (!prevLayout) {
        const storeState = useStore.getState();
        const currentScene =
          storeState.currentPlay?.scenes.find(
            (sc) => sc.id === storeState.selectedSceneId,
          ) ??
          storeState.currentPlay?.scenes[0] ??
          scenePropRef.current ??
          null;

        const offenseStoreState = currentScene?.players.offense ?? defaultPlayers(OFFENSE_DEFAULTS);
        const defenseStoreState = currentScene?.players.defense ?? defaultPlayers(DEFENSE_DEFAULTS);

        setOffensePx(
          offenseStoreState.map((p) => {
            const { x, y } = normToCanvasPx(p.x, p.y, layout, currentFlipped);
            return { position: p.position, px: x, py: y, visible: p.visible };
          }),
        );
        setDefensePx(
          defenseStoreState.map((p) => {
            const { x, y } = normToCanvasPx(p.x, p.y, layout, currentFlipped);
            return { position: p.position, px: x, py: y, visible: p.visible };
          }),
        );

        // Ball initialisation
        const storeBall = currentScene?.ball ?? { ...BALL_DEFAULT, attachedTo: null };
        const { x: ballX, y: ballY } = normToCanvasPx(storeBall.x, storeBall.y, layout, currentFlipped);
        setBallPx({ x: ballX, y: ballY });
        setBallAttachment(storeBall.attachedTo ?? null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [], // Stable — never recreated. Scene/flip changes handled by useEffects below.
  );

  // -------------------------------------------------------------------------
  // Reinitialise pixel positions when the active scene changes or when the
  // court flip changes. We track the previous values via refs so we only
  // reinitialise on actual changes, not on every render.
  // -------------------------------------------------------------------------
  const prevFlippedRef = useRef<boolean>(false);

  useEffect(() => {
    const newSceneId = scene?.id ?? null;
    const newFlipped = flipped ?? false;

    // First render: positions are handled by handleCourtReady. Just record state.
    if (prevSceneIdRef.current === null) {
      prevSceneIdRef.current = newSceneId;
      prevFlippedRef.current = newFlipped;
      return;
    }

    const sceneChanged = newSceneId !== prevSceneIdRef.current;
    const flipChanged  = newFlipped !== prevFlippedRef.current;

    // No relevant change — bail
    if (!sceneChanged && !flipChanged) return;

    prevSceneIdRef.current = newSceneId;
    prevFlippedRef.current = newFlipped;

    // Reinitialise pixel positions from the scene's normalised data.
    const layout = layoutRef.current;
    if (!scene || !layout) return;

    setOffensePx(
      scene.players.offense.map((p) => {
        const { x, y } = normToCanvasPx(p.x, p.y, layout, newFlipped);
        return { position: p.position, px: x, py: y, visible: p.visible };
      }),
    );
    setDefensePx(
      scene.players.defense.map((p) => {
        const { x, y } = normToCanvasPx(p.x, p.y, layout, newFlipped);
        return { position: p.position, px: x, py: y, visible: p.visible };
      }),
    );

    const storeBall = scene.ball ?? { ...BALL_DEFAULT, attachedTo: null };
    const { x: ballX, y: ballY } = normToCanvasPx(storeBall.x, storeBall.y, layout, newFlipped);
    setBallPx({ x: ballX, y: ballY });
    setBallAttachment(storeBall.attachedTo ?? null);
  }, [scene, flipped]);

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
      // The store write must not happen inside the setState updater: React runs
      // updaters while rendering this component, and a Zustand write there
      // updates SaveIndicator mid-render (and runs twice under StrictMode).
      const current = offensePxRef.current;
      if (!current) return;
      setOffensePx((prev) =>
        prev
          ? prev.map((p) => (p.position === position ? { ...p, px: newCx, py: newCy } : p))
          : prev,
      );
      if (sceneId && layoutRef.current) {
        const { x, y } = canvasPxToNorm(newCx, newCy, layoutRef.current, flippedRef.current);
        // Read visible from the scene prop (source of truth) to avoid overwriting
        // a visibility toggle with a stale value from local pixel state.
        const scenePlayer = offenseVisible?.find((sp) => sp.position === position);
        const visible = scenePlayer ? scenePlayer.visible : (current.find((p) => p.position === position)?.visible ?? true);
        updatePlayerState(sceneId, "offense", { position, x, y, visible });
      }
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
      // The store write must not happen inside the setState updater: React runs
      // updaters while rendering this component, and a Zustand write there
      // updates SaveIndicator mid-render (and runs twice under StrictMode).
      const current = defensePxRef.current;
      if (!current) return;
      setDefensePx((prev) =>
        prev
          ? prev.map((p) => (p.position === position ? { ...p, px: newCx, py: newCy } : p))
          : prev,
      );
      if (sceneId && layoutRef.current) {
        const { x, y } = canvasPxToNorm(newCx, newCy, layoutRef.current, flippedRef.current);
        // Read visible from the scene prop (source of truth) to avoid overwriting
        // a visibility toggle with a stale value from local pixel state.
        const scenePlayer = defenseVisible?.find((sp) => sp.position === position);
        const visible = scenePlayer ? scenePlayer.visible : (current.find((p) => p.position === position)?.visible ?? true);
        updatePlayerState(sceneId, "defense", { position, x, y, visible });
      }
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
      // Reads the current attachment and player positions from refs: no state
      // setter runs inside another setter's updater (React runs updaters while
      // rendering), and the handler is not re-created on every drag frame.
      const attachment = ballAttachmentRef.current;
      if (attachment) {
        // Get current player position
        const pool = attachment.side === "offense" ? offensePxRef.current : defensePxRef.current;
        const player = pool?.find((p) => p.position === attachment.position);
        if (player) {
          const dx = newCx - player.px;
          const dy = newCy - player.py;
          const dist = Math.sqrt(dx * dx + dy * dy);
          // Still attached — don't update free position
          if (dist <= DETACH_RADIUS) return;
          // Detach (the ref is updated at once so the next move event, which
          // may arrive before the re-render, already sees a free ball)
          ballAttachmentRef.current = null;
          setBallAttachment(null);
        }
      }
      // Free ball: update position
      setBallPx({ x: newCx, y: newCy });
    },
    [],
  );

  const handleBallDragEnd = useCallback(
    (newCx: number, newCy: number, nearest: NearbyPlayer | null) => {
      let newBallState: BallState;

      if (nearest) {
        // Snap to player
        setBallAttachment({ side: nearest.side, position: nearest.position });
        // Free position becomes player position (for re-projection on resize)
        setBallPx({ x: nearest.px, y: nearest.py });
        if (sceneId && layoutRef.current) {
          const { x, y } = canvasPxToNorm(nearest.px, nearest.py, layoutRef.current, flippedRef.current);
          newBallState = { x, y, attachedTo: { side: nearest.side, position: nearest.position } };
        } else {
          return;
        }
      } else {
        // Free placement
        setBallAttachment(null);
        setBallPx({ x: newCx, y: newCy });
        if (sceneId && layoutRef.current) {
          const { x, y } = canvasPxToNorm(newCx, newCy, layoutRef.current, flippedRef.current);
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

  // Use the inner court (play area) width for proportional token sizing.
  // Nothing is drawn until the court has reported its size, so there is no
  // size-less fallback.
  const tokenSizes = courtSize ? computeTokenSizes(courtSize.playAreaWidth) : null;
  const tokenRadius = tokenSizes?.playerR;
  const ballRadius = tokenSizes?.ballR;

  const effectiveBall = tokenSizes
    ? getEffectiveBallPx(ballAttachment, offensePx, defensePx, ballPx, tokenSizes.ballAttachOffsetY)
    : null;

  return (
    <div className={`relative ${className ?? "w-full"}`}>
      {/* Court canvas */}
      <Court variant={variant} onReady={handleCourtReady} className="w-full" flipped={flipped} />

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

          {/* Enable pointer events only on the tokens themselves (disabled in readOnly mode) */}
          <g style={{ pointerEvents: readOnly ? "none" : "all" }}>
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
                  courtBounds={{ width: courtSize.width, height: courtSize.height, minY: courtSize.offsetY > 0 ? courtSize.offsetY : undefined }}
                  onDrag={(x, y) => handleDefenseDrag(p.position, x, y)}
                  onDragEnd={(x, y) => handleDefenseDragEnd(p.position, x, y)}
                  displayMode={displayMode}
                  playerName={playerNames[`defense-${p.position}`]}
                  radius={tokenRadius}
                  defenseColor={playColors?.defense}
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
                  courtBounds={{ width: courtSize.width, height: courtSize.height, minY: courtSize.offsetY > 0 ? courtSize.offsetY : undefined }}
                  onDrag={(x, y) => handleOffenseDrag(p.position, x, y)}
                  onDragEnd={(x, y) => handleOffenseDragEnd(p.position, x, y)}
                  displayMode={displayMode}
                  playerName={playerNames[`offense-${p.position}`]}
                  radius={tokenRadius}
                  offenseColor={playColors?.offense}
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
                courtBounds={{ width: courtSize.width, height: courtSize.height, minY: courtSize.offsetY > 0 ? courtSize.offsetY : undefined }}
                radius={ballRadius}
              />
            )}
          </g>
        </svg>
      )}

      {/* Annotation layer — always rendered; readOnly disables interaction. */}
      {courtSize && (
        <AnnotationLayer
          width={courtSize.width}
          height={courtSize.height}
          playAreaWidth={courtSize.playAreaWidth}
          playAreaHeight={courtSize.playAreaHeight}
          offsetX={courtSize.offsetX}
          offsetY={courtSize.offsetY}
          sceneId={sceneId ?? null}
          players={allPlayers}
          flipped={flipped}
          readOnly={readOnly}
          sceneOverride={readOnly ? scene ?? undefined : undefined}
          activeStep={activeStep}
        />
      )}
    </div>
  );
}
