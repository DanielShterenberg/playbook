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
- `selectedSceneId` MUST always be set in sync with `currentPlay` — never set one without the other
- Use `useStore.getState()` inside `useEffect` to read state without adding it to deps
- Undo/redo wraps every store mutation — check `src/lib/store.ts` for the `withHistory` pattern

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
- Defense tokens show centered label (no X mark) — color/outline distinguishes them from offense

### EditorCourtArea infinite loop guard
- Never put `currentPlay` in useEffect deps while also calling `setCurrentPlay` inside it
- Use `useRef` initialized guard + `useStore.getState()` to break the cycle

## Test Account
- Email: test@playbook.com
- Password: Test1234!
- Team: מכבי קדימה (admin role)

## Issues & Backlog

Track open issues on GitHub: https://github.com/DanielShterenberg/playbook/issues
