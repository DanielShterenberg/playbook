/**
 * On-screen rendering (editor / share viewer / presentation) pinned against
 * the shared contracts in src/lib (issues #163, #169, #171).
 *
 * Court.tsx, CourtWithPlayers.tsx, PlayerToken.tsx and BallToken.tsx used to
 * carry their own copies of the norm↔pixel mapping, the token-radius formulas
 * and the court drawing. The `legacy*` functions below are verbatim copies of
 * those deleted locals; the tests assert the shared functions return the same
 * bits, so swapping them in cannot move a pixel on screen.
 *
 * .tsx modules cannot be imported under Vitest here (jsx: preserve, Node env),
 * so the "exists exactly once" half is checked on the component sources.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import {
  computeCourtLayout,
  normToCanvasPx,
  canvasPxToNorm,
  type CourtVariant,
} from "@/lib/courtLayout";
import {
  PLAYER_RADIUS,
  BALL_RADIUS,
  PLAYER_RADIUS_RATIO,
  playerRadius,
  ballRadius,
  ballAttachOffsetY,
  playerScale,
  thumbnailDotRadius,
} from "@/lib/tokenSizing";

// ---------------------------------------------------------------------------
// Legacy copies (verbatim from CourtWithPlayers.tsx before #169)
// ---------------------------------------------------------------------------

function legacyComputeTokenRadius(courtWidth: number): number {
  return Math.max(10, Math.round(courtWidth * 0.03));
}
function legacyComputeBallRadius(courtWidth: number): number {
  return Math.max(7, Math.round(courtWidth * 0.02));
}

function legacyNormToPx(
  normX: number,
  normY: number,
  paWidth: number,
  paHeight: number,
  paOffsetY: number,
  paOffsetX = 0,
  flipped = false,
): { x: number; y: number } {
  return {
    x: normX * paWidth + paOffsetX,
    y: flipped ? (1 - normY) * paHeight + paOffsetY : normY * paHeight + paOffsetY,
  };
}

function legacyPxToNorm(
  px: number,
  py: number,
  paWidth: number,
  paHeight: number,
  paOffsetY: number,
  paOffsetX = 0,
  flipped = false,
): { x: number; y: number } {
  return {
    x: (px - paOffsetX) / paWidth,
    y: flipped ? 1 - (py - paOffsetY) / paHeight : (py - paOffsetY) / paHeight,
  };
}

/**
 * What CourtWithPlayers kept from Court's onReady payload before #169:
 * courtSizeRef = { width, height } and playAreaRef = { height, offsetY, offsetX };
 * the play-area width was re-derived as `width - 2 * offsetX`.
 */
function legacyRefs(totalWidth: number, variant: CourtVariant) {
  const l = computeCourtLayout(totalWidth, variant);
  const size = { width: l.totalWidth, height: l.totalHeight };
  const playArea = { height: l.playAreaHeight, offsetY: l.playAreaOffsetY, offsetX: l.playAreaOffsetX };
  return { size, playArea, paW: size.width - 2 * playArea.offsetX };
}

const WIDTHS = [280, 320, 375, 390, 414, 600, 636, 768, 800, 1024, 1280, 1337];
const VARIANTS: CourtVariant[] = ["half", "full"];
const FLIPS = [false, true];
const NORMS = [-0.05, 0, 0.08, 0.18, 1 / 3, 0.35, 0.42, 0.5, 0.54, 0.75, 0.78, 0.92, 1, 1.04];

// ---------------------------------------------------------------------------
// Positions
// ---------------------------------------------------------------------------

describe("editor token positions — shared mapping ≡ legacy CourtWithPlayers locals", () => {
  it("normToCanvasPx is bit-identical to the legacy normToPx", () => {
    for (const w of WIDTHS) for (const variant of VARIANTS) for (const flipped of FLIPS) {
      const layout = computeCourtLayout(w, variant);
      const { playArea, paW } = legacyRefs(w, variant);
      for (const nx of NORMS) for (const ny of NORMS) {
        const legacy = legacyNormToPx(nx, ny, paW, playArea.height, playArea.offsetY, playArea.offsetX, flipped);
        const shared = normToCanvasPx(nx, ny, layout, flipped);
        expect(shared.x).toBe(legacy.x);
        expect(shared.y).toBe(legacy.y);
      }
    }
  });

  it("canvasPxToNorm is bit-identical to the legacy pxToNorm (drag end → store)", () => {
    for (const w of WIDTHS) for (const variant of VARIANTS) for (const flipped of FLIPS) {
      const layout = computeCourtLayout(w, variant);
      const { playArea, paW } = legacyRefs(w, variant);
      for (const fx of NORMS) for (const fy of NORMS) {
        // arbitrary (non-integer) pixel positions across the canvas
        const px = fx * layout.totalWidth + 0.37;
        const py = fy * layout.totalHeight + 0.61;
        const legacy = legacyPxToNorm(px, py, paW, playArea.height, playArea.offsetY, playArea.offsetX, flipped);
        const shared = canvasPxToNorm(px, py, layout, flipped);
        expect(shared.x).toBe(legacy.x);
        expect(shared.y).toBe(legacy.y);
      }
    }
  });

  it("resize re-projection (old layout px → norm → new layout px) is bit-identical", () => {
    const pairs: [number, number][] = [[800, 390], [390, 800], [636, 637], [1024, 320], [414, 1280]];
    for (const [w0, w1] of pairs) for (const variant of VARIANTS) for (const flipped of FLIPS) {
      const prevLayout = computeCourtLayout(w0, variant);
      const nextLayout = computeCourtLayout(w1, variant);
      const prev = legacyRefs(w0, variant);
      const next = legacyRefs(w1, variant);
      for (const nx of NORMS) for (const ny of NORMS) {
        const start = legacyNormToPx(nx, ny, prev.paW, prev.playArea.height, prev.playArea.offsetY, prev.playArea.offsetX, flipped);

        // Legacy handleCourtReady resize branch
        const ln = legacyPxToNorm(
          start.x, start.y,
          prev.playArea.height > 0 ? prev.size.width - 2 * prev.playArea.offsetX : prev.size.width,
          prev.playArea.height, prev.playArea.offsetY, prev.playArea.offsetX, flipped,
        );
        const legacy = legacyNormToPx(ln.x, ln.y, next.paW, next.playArea.height, next.playArea.offsetY, next.playArea.offsetX, flipped);

        // New handleCourtReady resize branch
        const sn = canvasPxToNorm(start.x, start.y, prevLayout, flipped);
        const shared = normToCanvasPx(sn.x, sn.y, nextLayout, flipped);

        expect(shared.x).toBe(legacy.x);
        expect(shared.y).toBe(legacy.y);
      }
    }
  });

  it("Court's onReady payload fields are the layout's fields (what CourtWithPlayers reads)", () => {
    for (const w of WIDTHS) for (const variant of VARIANTS) {
      const l = computeCourtLayout(w, variant);
      // Legacy Court.tsx draw() maths
      const oobLeft = Math.round((w * 0.03) / (1 + 2 * 0.03));
      const innerW = w - 2 * oobLeft;
      const innerH = Math.round(innerW / (50 / 47));
      const oobBot = Math.round(innerH * 0.07);
      expect(l.totalWidth).toBe(w);
      expect(l.totalHeight).toBe(variant === "full" ? innerH * 2 + oobBot : innerH + oobBot);
      expect(l.playAreaHeight).toBe(innerH);
      expect(l.playAreaOffsetY).toBe(variant === "full" ? innerH + oobBot : 0);
      expect(l.playAreaOffsetX).toBe(oobLeft);
      expect(l.playAreaWidth).toBe(innerW);
    }
  });
});

// ---------------------------------------------------------------------------
// Token sizes
// ---------------------------------------------------------------------------

describe("editor token sizes — shared sizing ≡ legacy CourtWithPlayers locals", () => {
  it("playerRadius / ballRadius equal the legacy formulas for every inner width", () => {
    for (let w = 0; w <= 2600; w++) {
      expect(playerRadius(w)).toBe(legacyComputeTokenRadius(w));
      expect(ballRadius(w)).toBe(legacyComputeBallRadius(w));
    }
  });

  it("attached-ball offset equals the legacy -(tokenRadius + ballRadius + 2)", () => {
    for (const w of WIDTHS) {
      const innerW = computeCourtLayout(w).innerW;
      const r = legacyComputeTokenRadius(innerW);
      const b = legacyComputeBallRadius(innerW);
      expect(ballAttachOffsetY(playerRadius(innerW), ballRadius(innerW))).toBe(-(r + b + 2));
    }
  });

  it("token defaults are the legacy component constants", () => {
    expect(PLAYER_RADIUS).toBe(18);
    expect(BALL_RADIUS).toBe(12);
  });

  it("PlayerToken stroke width and font size via playerScale match the legacy expressions", () => {
    for (let radius = 1; radius <= 80; radius++) {
      // font: rounded, so must be exactly equal
      const legacyFont = Math.max(6, Math.round(11 * radius / 18));
      expect(Math.max(6, Math.round(11 * playerScale(radius)))).toBe(legacyFont);
      // offense stroke (2): multiplying by 2 is exact, so bit-identical
      expect(Math.max(1.5, 2 * playerScale(radius))).toBe(Math.max(1.5, 2 * radius / 18));
      // defense stroke (2.5): same value up to floating-point association
      expect(Math.max(1.5, 2.5 * playerScale(radius))).toBeCloseTo(Math.max(1.5, 2.5 * radius / 18), 12);
    }
  });
});

// ---------------------------------------------------------------------------
// Thumbnails (PlayCard / SceneStrip)
// ---------------------------------------------------------------------------

describe("thumbnail player dots — shared ratio with a legibility floor", () => {
  const dot = thumbnailDotRadius;

  it("PlayCard (200 px) uses the editor's 3% ratio", () => {
    expect(dot(200)).toBe(6);
    expect(dot(200) / 200).toBeCloseTo(PLAYER_RADIUS_RATIO, 10);
  });

  it("SceneStrip (120 px) rounds to its current size; compact (80 px) sits on the floor", () => {
    expect(dot(120)).toBe(4);
    expect(dot(80)).toBe(4);
  });

  it("matches the editor radius wherever the editor is above its own minimum", () => {
    for (let w = 340; w <= 2000; w += 7) expect(dot(w)).toBe(playerRadius(w));
  });
});

// ---------------------------------------------------------------------------
// Single source of truth — the components carry no private copies
// ---------------------------------------------------------------------------

function source(rel: string): string {
  return readFileSync(path.resolve(process.cwd(), rel), "utf8");
}

describe("on-screen components import the shared contracts (no local copies)", () => {
  it("Court.tsx draws through paintCourt and has no drawing code of its own", () => {
    const src = source("src/components/court/Court.tsx");
    expect(src).toMatch(/computeCourtLayout\(cssWidth, variant\)/);
    expect(src).toMatch(/paintCourt\(ctx, layout, \{ flipped, palette \}\)/);
    expect(src).toMatch(/normToCanvasPx\(/);
    expect(src).not.toMatch(/function drawHalfCourtInner/);
    expect(src).not.toMatch(/function drawCourt/);
    expect(src).not.toMatch(/ctx\.(arc|fillRect|strokeRect|translate|moveTo|lineTo)\(/);
    expect(src).not.toMatch(/#F0C878|#E07B39/i);
    expect(src).not.toMatch(/export type CourtVariant =/);
    // The legacy drawCourt re-export is gone (issue #176)
    expect(src).not.toMatch(/drawCourt/);
    // Existing importers keep compiling
    expect(src).toMatch(/export type \{ CourtVariant \} from "@\/lib\/courtLayout"/);
    expect(src).toMatch(/export \{ OOB_SIDE_FRAC, OOB_BOTTOM_FRAC \} from "@\/lib\/courtLayout"/);
  });

  it("Court.tsx only imports React and the shared court modules", () => {
    const src = source("src/components/court/Court.tsx");
    const allowed = new Set(["react", "./courtDimensions", "@/lib/courtLayout", "@/lib/courtRendering", "@/lib/tokenSizing", "@/hooks/useTheme"]);
    const specifiers = Array.from(src.matchAll(/from\s+"([^"]+)"/g)).map((m) => m[1]);
    expect(specifiers.length).toBeGreaterThan(0);
    for (const s of specifiers) expect(allowed.has(s), `unexpected import ${s}`).toBe(true);
  });

  it("CourtWithPlayers.tsx uses the shared mapping and sizing", () => {
    const src = source("src/components/players/CourtWithPlayers.tsx");
    expect(src).not.toMatch(/function normToPx/);
    expect(src).not.toMatch(/function pxToNorm/);
    expect(src).not.toMatch(/function computeTokenRadius/);
    expect(src).not.toMatch(/function computeBallRadius/);
    expect(src).not.toMatch(/\* 0\.0[23]\b/);
    expect(src).toMatch(/normToCanvasPx\(/);
    expect(src).toMatch(/canvasPxToNorm\(/);
    expect(src).toMatch(/from "@\/lib\/tokenSizing"/);
    // Token sizing is fed the INNER court width, as before
    expect(src).toMatch(/computeTokenSizes\(courtSize\.playAreaWidth\)/);
    // Project rule: handleCourtReady stays dependency-free
    expect(src).toMatch(/\[\], \/\/ Stable — never recreated\./);
    expect(src).toMatch(/\}, \[scene, flipped\]\);/);
  });

  it("PlayerToken.tsx / BallToken.tsx take their base radius from tokenSizing", () => {
    const player = source("src/components/players/PlayerToken.tsx");
    expect(player).not.toMatch(/const PLAYER_RADIUS\s*=/);
    expect(player).toMatch(/import \{[^}]*PLAYER_RADIUS[^}]*\} from "@\/lib\/tokenSizing"/);
    expect(player).toMatch(/playerScale\(radius\)/);

    const ball = source("src/components/players/BallToken.tsx");
    expect(ball).not.toMatch(/const BALL_RADIUS\s*=/);
    expect(ball).toMatch(/import \{[^}]*BALL_RADIUS[^}]*\} from "@\/lib\/tokenSizing"/);
  });

  it("PlayCard.tsx / SceneStrip.tsx draw their mini court through the shared CourtThumbnail", () => {
    for (const rel of ["src/components/playbook/PlayCard.tsx", "src/components/editor/SceneStrip.tsx"]) {
      const src = source(rel);
      expect(src, rel).toMatch(/import CourtThumbnail from "@\/components\/court\/CourtThumbnail"/);
      expect(src, rel).toMatch(/<CourtThumbnail\b/);
      // No hand-drawn court or dots left behind
      expect(src, rel).not.toMatch(/<(path|circle|rect|line)\b[^>]*\bp[xy]\(/);
      expect(src, rel).not.toMatch(/ A \$\{/);
      expect(src, rel).not.toMatch(/r=\{4\}/);
      // Scene override ?? play default, like every exporter
      expect(src, rel).toMatch(/\.flipped \?\? \w+(\?)?\.flipped\) === true/);
    }
  });

  it("CourtThumbnail.tsx takes geometry and sizes from the shared modules", () => {
    const src = source("src/components/court/CourtThumbnail.tsx");
    expect(src).toMatch(/computeThumbnailLayout\(/);
    expect(src).toMatch(/normToCanvasPx\(/);
    expect(src).toMatch(/thumbnailDotRadius\(/);
    expect(src).toMatch(/thumbnailBallRadius\(/);
    expect(src).toMatch(/thumbnailBallAttachOffsetY\(/);
    expect(src).not.toMatch(/\* 0\.0[23]\b/);
  });
});

// ---------------------------------------------------------------------------
// Drag end must not write to the store from inside a setState updater (#176)
//
// React runs updater functions while rendering CourtWithPlayers; a Zustand
// write there re-renders SaveIndicator mid-render ("Cannot update a component
// (SaveIndicator) while rendering a different component (CourtWithPlayers)")
// and, under StrictMode, runs twice.
// ---------------------------------------------------------------------------

describe("CourtWithPlayers drag-end handlers", () => {
  const FILE = path.resolve(process.cwd(), "src/components/players/CourtWithPlayers.tsx");
  const sf = ts.createSourceFile(FILE, readFileSync(FILE, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  function calls(name: string): ts.CallExpression[] {
    const found: ts.CallExpression[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name) found.push(node);
      ts.forEachChild(node, visit);
    };
    visit(sf);
    return found;
  }

  /** Name of the React state setter whose updater function encloses `node`, if any. */
  function enclosingSetStateUpdater(node: ts.Node): string | null {
    for (let cur: ts.Node | undefined = node.parent; cur; cur = cur.parent) {
      if (
        (ts.isArrowFunction(cur) || ts.isFunctionExpression(cur)) &&
        ts.isCallExpression(cur.parent) &&
        ts.isIdentifier(cur.parent.expression) &&
        /^set[A-Z]/.test(cur.parent.expression.text) &&
        cur.parent.arguments.includes(cur)
      ) {
        return cur.parent.expression.text;
      }
    }
    return null;
  }

  it("still stores the dragged player once per side", () => {
    const sides = calls("updatePlayerState").map((c) => c.arguments[1]?.getText(sf));
    expect(sides.sort()).toEqual(['"defense"', '"offense"']);
  });

  it.each(["updatePlayerState", "updateBallState"])("%s is never called inside a setState updater", (name) => {
    for (const call of calls(name)) {
      expect(enclosingSetStateUpdater(call), call.getText(sf).slice(0, 60)).toBeNull();
    }
  });

  it("stores the same fields as before: position, x, y, visible", () => {
    for (const call of calls("updatePlayerState")) {
      expect(call.arguments[0].getText(sf)).toBe("sceneId");
      expect(call.arguments[2].getText(sf)).toBe("{ position, x, y, visible }");
    }
  });

  // Review item 8: handleBallDrag called setBallPx inside the setBallAttachment
  // updater — the same side-effect-in-updater pattern.
  it("no React state setter is called inside another setter's updater, anywhere in the file", () => {
    const setters: ts.CallExpression[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && /^set[A-Z]/.test(node.expression.text)) setters.push(node);
      ts.forEachChild(node, visit);
    };
    visit(sf);
    expect(setters.length).toBeGreaterThan(10);
    for (const call of setters) {
      expect(enclosingSetStateUpdater(call), call.getText(sf).slice(0, 60)).toBeNull();
    }
  });

  it("handleBallDrag reads the pixel state from refs: it is not re-created on every drag frame", () => {
    const src = readFileSync(FILE, "utf8");
    const m = /const handleBallDrag = useCallback\(([\s\S]*?)\n  \);/.exec(src);
    expect(m).not.toBeNull();
    expect(m![1]).toMatch(/\[\],?\s*$/);
    expect(m![1]).toMatch(/offensePxRef\.current/);
    expect(m![1]).toMatch(/defensePxRef\.current/);
    expect(m![1]).toMatch(/DETACH_RADIUS/);
  });
});

// ---------------------------------------------------------------------------
// Court sizing robustness (review item 9)
// ---------------------------------------------------------------------------

describe("court sizing", () => {
  it("CourtWithPlayers guards only the re-projection against a degenerate layout — the size is still updated", () => {
    const src = source("src/components/players/CourtWithPlayers.tsx");
    const ready = src.slice(src.indexOf("const handleCourtReady = useCallback("), src.indexOf("// First render — read from the Zustand store"));
    // The reported size always reaches state, zero or not, before any guard…
    expect(ready).toMatch(/setCourtSize\(/);
    expect(ready.indexOf("setCourtSize(")).toBeLessThan(ready.indexOf("hasCourtArea(layout)"));
    expect(ready).toMatch(/if \(!hasCourtArea\(layout\)\) return;/);
    // …but a zero-size layout is never remembered or re-projected through.
    expect(ready.indexOf("if (!hasCourtArea(layout)) return;")).toBeLessThan(ready.indexOf("layoutRef.current = layout;"));
    expect(ready).toMatch(/reprojectCanvasPx\(/);
    expect(ready).not.toMatch(/canvasPxToNorm\(/);
    // Nothing is drawn over neighbouring UI while the court has no area.
    expect(src).toMatch(/const courtVisible = courtSize !== null && courtSize\.playAreaWidth > 0 && courtSize\.playAreaHeight > 0;/);
    expect(src.match(/\{courtVisible && courtSize && \(/g)).toHaveLength(2); // token overlay + AnnotationLayer
    expect(src).not.toMatch(/\{courtSize && \(/);
  });

  it("EditorCourtArea observes the area element whenever it (re)mounts, not only when courtType changes", () => {
    const src = source("src/app/play/[id]/EditorCourtArea.tsx");
    // The measured div is unmounted while "Loading play…" is shown; a ref
    // object would leave the effect attached to nothing after it comes back.
    expect(src).toMatch(/const \[areaEl, setAreaEl\] = useState<HTMLDivElement \| null>\(null\);/);
    expect(src).toMatch(/<div ref=\{setAreaEl\}/);
    expect(src).toMatch(/\}, \[areaEl, courtType\]\);/);
    expect(src).not.toMatch(/areaRef/);
  });
});
