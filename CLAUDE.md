# Claude Code — Project Instructions

## Stack
- Next.js 14 App Router, TypeScript, Tailwind CSS
- Zustand store (`src/lib/store.ts`) for editor state
- Firebase Auth + Firestore for persistence (`src/lib/db.ts`, `src/lib/firebase.ts`)
- HTML5 Canvas court (`src/components/court/Court.tsx`) + SVG player overlay (`CourtWithPlayers.tsx`)
- Vercel deployment — auto-deploys on merge to `master`
- Live at: https://playbook-brown.vercel.app

## Git Workflow
- Trunk-based: branch from `master` → implement → rebase → squash-merge PR
- Always rebase before creating PR; force push is expected
- Use `fix/` prefix for bug fixes, `feature/` for new features

## Testing
- Run tests: `npm test` (Vitest, ~100ms)
- Tests live in `src/__tests__/`
- CI runs tests + build on every push/PR via `.github/workflows/ci.yml`
- Pre-commit hook runs tests automatically — activate once after cloning:
  ```
  git config core.hooksPath .githooks
  ```

## Key Conventions

### Zustand store
- `selectedSceneId` and `currentSceneIndex` are reconciled on every store write (the `set` wrapper in `store.ts`), so always go through store actions — never call `useStore.setState` directly
- Use `useStore.getState()` inside `useEffect` to read state without adding it to deps
- Undo/redo wraps every store mutation — check `src/lib/store.ts` for the `withHistory` pattern

### Rendering pipeline (editor, viewer, thumbnails, exports)
- One recipe everywhere: `computeCourtLayout(width, variant)` → `paintCourt(ctx, layout, { flipped })` → `normToCanvasPx(x, y, layout, flipped)` → `computeTokenSizes(layout.innerW)` (`src/lib/courtLayout.ts`, `courtRendering.ts`, `tokenSizing.ts`)
- PNG / MP4 / PDF frames are all drawn by `renderSceneToCtx` in `src/lib/frameRenderer.ts`; its annotation drawing mirrors `AnnotationLayer.tsx` — change both together
- Annotation sizes are written for a 600px-wide court and scaled by `annotationScale(innerW)` in both places (the editor scales an SVG group, the exporter multiplies), so lines keep their proportion to the tokens at any size
- PDF text goes through `drawPdfText` (`exportPdf.ts`): Latin stays vector text, anything else (Hebrew) is drawn by the browser on a canvas. Export file names come from `exportFileBase` (`src/lib/export.ts`)
- The editor's on-screen frame **in the light theme** is the reference. Never add a private court-drawing copy or an `oobBot` compensation in an exporter
- Colours come from a `CourtPalette` (`src/lib/courtPalette.ts`, light + dark). On screen use `useCourtPalette()`; exporters never pass a palette, so PNG / MP4 / PDF are always light
- Team colours go through `customTeamColor(stored) ?? palette.offenseFill / defenseFill` — stored default colours mean "no custom colour"
- Verify rendering changes in a real browser against the editor; unit tests have missed export bugs here

### Playback
- One engine: `tickPlayback` in `src/lib/playback.ts`, driven by `usePlaybackEngine` (mounted once in `src/app/play/[id]/PlaybackEngine.tsx`). Components own no timers
- `stepDurationMs` is the single step-timing rule for on-screen playback and exports

### Theme and UI chrome
- Light / dark theme = `data-theme` on `<html>` (`src/lib/theme.ts`): stored choice from the toggle, else the device setting, set before first paint. It is NOT in the Zustand store (a toggle must not be an undo step)
- Chrome colours are Tailwind tokens from `globals.css` (`bg-app`, `bg-surface`, `border-line`, `text-ink`, `text-muted`, `bg-accent` + `text-accent-ink`, `text-accent-text`, `bg-chip`, `text-danger`, `text-success`, `accent-control`, `text-ball-tag`); `dark:` variants work. No light-only hex colours in components
- Categories (labels, order, badge colours) live in `src/lib/categories.ts`; the shared focus ring in `src/lib/uiClasses.ts`; spinners in `components/brand/Spinner.tsx`. Tailwind only scans the two lib files listed in `tailwind.config.ts` — class names in any other `src/lib` file are not generated
- Fonts: `font-sans` Barlow, `font-display` Barlow Condensed (headings, uppercase labels), `font-mono` IBM Plex Mono (wordmark). Logo and `ThemeToggle` live in `src/components/brand/`
- Dark annotation tints are CSS overrides in `globals.css` keyed on the hex literals in `AnnotationLayer.tsx` (a test ties them together) — change both
- Approved mockups: https://claude.ai/artifact/HzAh218mbgkGicAQCcZ4NK (design A, light + dark)

### Editing input
- The drawing layer (`AnnotationLayer.tsx`) uses pointer events with pointer capture — one path for mouse, finger and pen. The click after a captured gesture lands on the layer, not on the element under the pointer
- Phones (<768px) edit too: `MobileToolBar` is the bottom tool bar (five rail tools + Undo). Team viewers get no tools on any screen
- A scene's name is its `note` (`sceneName()` in `types.ts`, max `SCENE_NAME_MAX`); renamed from the scene strip (double-click, F2 or the menu), shown in the share viewer and the PDF

### Coordinates
- Court positions are normalized `[0, 1]` (x=0 left, x=1 right, y=0 half-court line, y=1 baseline)
- Convert to pixels with `px = norm * courtWidth`, `py = norm * courtHeight`

### SVG arcs in thumbnails (PlayCard, SceneStrip)
- `large-arc=0, sweep=1` = minor CW arc = bows UPWARD (away from basket) ✓ — use for 3-point arc
- `large-arc=0, sweep=0` = bows DOWNWARD (toward basket) — use for free-throw upper arc? No — check existing working arcs first
- **Always verify SVG arcs in the browser** via `evaluate_script` + `take_screenshot` before pushing

### Player tokens
- `PlayerToken.tsx`: radius prop scales everything proportionally (font, stroke)
- Default radius = 18px; mobile uses `Math.max(10, courtWidth * 0.03)`
- Offense and defense are both filled circles; the label colour follows the fill (`contrastText`)

### EditorCourtArea infinite loop guard
- Never put `currentPlay` in useEffect deps while also calling `setCurrentPlay` inside it
- Use `useRef` initialized guard + `useStore.getState()` to break the cycle

## Test Account
- Email: test@playbook.com
- Password: Test1234!
- Team: מכבי קדימה (admin role)
- Drills against localhost only — never sign in to the production site with a script

## Open Issues (as of 2026-10-11)
- #167 Full app redesign + new logo — shipped (#182–#195). Deliberate differences from the mockups, for the owner to confirm: real-proportion thumbnails (taller cards), no team switcher (one team per user), phone tool bar says "Move" where the mockup says "Cut"
- #173 Flipped full court inverts the formation relative to the basket (needs a product decision; fixing moves stored plays)
- #179 Playback/store cleanup after #177 — left: one stored scene selection instead of two, MP4 holds vs on-screen timing
- #180 Rendering cleanup after #178 — left: one annotation colour map (three copies today, tied by a test)
- `firestore.rules` changed in #188 (bounds `teamName` on share links): deploy with `firebase deploy --only firestore:rules`
- Phones: no redo, and no way to reach the scene menu (duplicate / delete scene) on iOS, which sends no `contextmenu` on long press
