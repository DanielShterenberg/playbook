"use client";

/**
 * CourtWithPlayers — wraps the Court canvas and overlays draggable player tokens.
 *
 * Implements issues #51 and #52:
 *   #51 — Draggable offensive players (O1–O5)
 *   #52 — Draggable defensive players (X1–X5)
 *
 * Architecture:
 *   - The Court canvas is rendered inside a relatively-positioned container.
 *   - An absolutely-positioned SVG layer of the same dimensions is overlaid on top.
 *   - Player tokens are SVG <g> elements positioned in CSS pixel coords.
 *   - Normalised [0-1] court coords are used in the Zustand store; conversion
 *     to/from CSS pixels is done via the courtToCanvas callback from Court.
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
import { useStore } from "@/lib/store";
import type { Scene, PlayerState } from "@/lib/types";

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
  const updatePlayerState = useStore((s) => s.updatePlayerState);

  // Court layout reported by the Court canvas
  const [courtSize, setCourtSize] = useState<{ width: number; height: number } | null>(null);

  // Local pixel-position state for smooth dragging (avoids round-tripping through store on every mousemove)
  const [offensePx, setOffensePx] = useState<PixelPlayer[] | null>(null);
  const [defensePx, setDefensePx] = useState<PixelPlayer[] | null>(null);

  // Track the last known court size for re-projection on resize
  const courtSizeRef = useRef<{ width: number; height: number } | null>(null);

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
      }
    },
    [scene],
  );

  // -------------------------------------------------------------------------
  // Drag handlers
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
      setOffensePx((prev) =>
        prev
          ? prev.map((p) => (p.position === position ? { ...p, px: newCx, py: newCy } : p))
          : prev,
      );
      if (sceneId && courtSizeRef.current) {
        const { x, y } = pixelToNorm(newCx, newCy, courtSizeRef.current.width, courtSizeRef.current.height);
        updatePlayerState(sceneId, "offense", { position, x, y, visible: true });
      }
    },
    [sceneId, updatePlayerState],
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
      setDefensePx((prev) =>
        prev
          ? prev.map((p) => (p.position === position ? { ...p, px: newCx, py: newCy } : p))
          : prev,
      );
      if (sceneId && courtSizeRef.current) {
        const { x, y } = pixelToNorm(newCx, newCy, courtSizeRef.current.width, courtSizeRef.current.height);
        updatePlayerState(sceneId, "defense", { position, x, y, visible: true });
      }
    },
    [sceneId, updatePlayerState],
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className={`relative ${className ?? "w-full"}`}>
      {/* Court canvas */}
      <Court onReady={handleCourtReady} className="w-full" />

      {/* SVG player overlay — same dimensions as the canvas */}
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
              ?.filter((p) => p.visible)
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
                />
              ))}

            {/* Offensive players (rendered on top) */}
            {offensePx
              ?.filter((p) => p.visible)
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
                />
              ))}
          </g>
        </svg>
      )}
    </div>
  );
}
