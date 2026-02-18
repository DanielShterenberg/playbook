#!/usr/bin/env zsh
# create-issues.sh — Creates all GitHub issues, labels, and milestones
# for the Basketball Playbook App from playbook-issues.md
#
# Prerequisites:
#   1. Install GitHub CLI: https://cli.github.com/
#   2. Authenticate: gh auth login
#   3. Run from repo root: bash create-issues.sh
#
# The script is idempotent for labels/milestones (skips if they exist).
# Issues are always created — only run once!

set -eo pipefail

REPO="DanielShterenberg/playbook"

echo "============================================="
echo "Basketball Playbook — GitHub Issues Creator"
echo "============================================="
echo ""

# Verify gh is authenticated
if ! gh auth status &>/dev/null; then
  echo "ERROR: Not authenticated with GitHub CLI."
  echo "Run: gh auth login"
  exit 1
fi

echo "Authenticated with GitHub CLI."
echo "Target repo: $REPO"
echo ""

# --------------------------------------------------
# 1. Create Labels
# --------------------------------------------------
echo "--- Creating Labels ---"

typeset -A LABELS
LABELS=(
  epic "8B5CF6:Large feature group"
  feature "1D76DB:New feature"
  infra "0E8A16:Infrastructure / setup"
  ui "FBCA04:UI/UX work"
  backend "D93F0B:Firebase / data layer"
  export "C2E0C6:Export functionality"
  auth "B60205:Authentication & permissions"
  bug "D73A4A:Bug fix"
  enhancement "A2EEEF:Improvement to existing feature"
  P0 "FF0000:Must have for MVP"
  P1 "FF8C00:Nice to have for MVP"
  P2 "FFD700:Post-MVP"
)

for label in ${(k)LABELS}; do
  IFS=':' read -r color description <<< "${LABELS[$label]}"
  if gh label create "$label" --repo "$REPO" --color "$color" --description "$description" 2>/dev/null; then
    echo "  Created label: $label"
  else
    echo "  Label already exists: $label (skipped)"
  fi
done

echo ""

# --------------------------------------------------
# 2. Create Milestones
# --------------------------------------------------
echo "--- Creating Milestones ---"

MILESTONES=(
  "M0: Project Foundation"
  "M1: Court & Players"
  "M2: Drawing Tools"
  "M3: Scenes & Animation"
  "M4: Play Management"
  "M5: Auth & Teams"
  "M6: Export & Sharing"
  "M7: Polish & Launch"
)

MILESTONE_DESCRIPTIONS=(
  "Repo, tooling, CI, Firebase setup"
  "Court rendering, player placement, ball"
  "Annotation system with all symbol types"
  "Multi-scene, timing groups, playback"
  "CRUD, playbook view, categories, search"
  "Firebase auth, team management, permissions"
  "GIF export, share links"
  "Bug fixes, performance, edge cases"
)

typeset -A MILESTONE_IDS

for i in {1..${#MILESTONES[@]}}; do
  title="${MILESTONES[$i]}"
  desc="${MILESTONE_DESCRIPTIONS[$i]}"
  # Check if milestone already exists
  existing_id=$(gh api "repos/$REPO/milestones" --jq ".[] | select(.title == \"$title\") | .number" 2>/dev/null || true)
  if [ -n "$existing_id" ]; then
    echo "  Milestone already exists: $title (number: $existing_id)"
    MILESTONE_IDS["$title"]="$existing_id"
  else
    new_id=$(gh api "repos/$REPO/milestones" -f title="$title" -f description="$desc" --jq '.number' 2>/dev/null)
    echo "  Created milestone: $title (number: $new_id)"
    MILESTONE_IDS["$title"]="$new_id"
  fi
done

echo ""

# Helper: get milestone number by title
ms() {
  echo "${MILESTONE_IDS[$1]}"
}

# --------------------------------------------------
# 3. Create Issues
# --------------------------------------------------
echo "--- Creating Issues (42 total) ---"
echo ""

# Check if issues already exist
echo "Checking for existing issues..."
existing_count=$(gh issue list --repo "$REPO" --state all --limit 1000 --json title --jq 'length')
if [ "$existing_count" -ge 42 ]; then
  echo ""
  echo "⚠️  WARNING: Found $existing_count existing issues in the repository."
  echo "This script will create 42 new issues. Do you want to continue? (y/N)"
  read -r response
  if [[ ! "$response" =~ ^[Yy]$ ]]; then
    echo "Aborted. No issues created."
    exit 0
  fi
fi
echo ""

create_issue() {
  local num="$1"
  local title="$2"
  local labels="$3"
  local milestone_title="$4"
  local body="$5"

  local ms_num="${MILESTONE_IDS[$milestone_title]}"

  local label_arr=(${(s:,:)labels})
  local label_args=()
  for l in "${label_arr[@]}"; do
    label_args+=(--label "$l")
  done

  local url
  url=$(gh issue create \
    --repo "$REPO" \
    --title "$title" \
    --milestone "$milestone_title" \
    "${label_args[@]}" \
    --body "$body" 2>&1)

  echo "  #$num: $title"
  echo "        -> $url"
}

# ========== M0: Project Foundation ==========

create_issue 1 \
  "Initialize Next.js project with base tooling" \
  "infra,P0" \
  "M0: Project Foundation" \
  "$(cat <<'BODY'
## Description

Set up the Next.js project with TypeScript, Tailwind CSS, ESLint, and the base folder structure as defined in the PRD.

## Acceptance Criteria

- [ ] Next.js 14+ app router project initialized
- [ ] TypeScript configured
- [ ] Tailwind CSS configured
- [ ] ESLint + Prettier configured
- [ ] Folder structure matches PRD section 9 (`src/app`, `src/components`, `src/lib`, `src/hooks`)
- [ ] `npm run dev` works with a blank landing page
- [ ] README with project description and setup instructions

## Dependencies

None
BODY
)"

create_issue 2 \
  "Set up Firebase project and configuration" \
  "infra,backend,P0" \
  "M0: Project Foundation" \
  "$(cat <<'BODY'
## Description

Create Firebase project, configure Firestore, Auth, and Storage. Set up Firebase SDK in the Next.js app with environment variables.

## Acceptance Criteria

- [ ] Firebase project created
- [ ] Firestore database initialized
- [ ] Firebase Auth enabled (email/password + Google)
- [ ] Firebase Storage bucket created
- [ ] `src/lib/firebase.ts` with initialized Firebase app, Firestore, Auth, and Storage exports
- [ ] Environment variables in `.env.local` (with `.env.example` template)
- [ ] Firebase security rules placeholder files

## Dependencies

- #1
BODY
)"

create_issue 3 \
  "Set up Vercel deployment" \
  "infra,P0" \
  "M0: Project Foundation" \
  "$(cat <<'BODY'
## Description

Connect repo to Vercel for automatic deployments. Configure environment variables.

## Acceptance Criteria

- [ ] Repo connected to Vercel
- [ ] Auto-deploy on push to `main`
- [ ] Preview deployments on PRs
- [ ] Environment variables configured in Vercel dashboard
- [ ] Deployed site loads successfully

## Dependencies

- #1, #2
BODY
)"

create_issue 4 \
  "Define TypeScript types and interfaces" \
  "infra,P0" \
  "M0: Project Foundation" \
  "$(cat <<'BODY'
## Description

Create all TypeScript interfaces based on the PRD data model (Team, Play, Scene, TimingGroup, Annotation, Player, Ball).

## Acceptance Criteria

- [ ] `src/lib/types.ts` with all interfaces:
  - `Team`, `TeamMember`, `TeamRoster`, `RosterPlayer`
  - `Play`, `PlayCategory` (union type)
  - `Scene`, `TimingGroup`
  - `Annotation`, `AnnotationType` (union type)
  - `PlayerState`, `BallState`
  - `UserRole` (union type: "admin" | "editor" | "viewer")
- [ ] Types match PRD data model section 4
- [ ] Exported and usable across the project

## Dependencies

- #1
BODY
)"

create_issue 5 \
  "Set up Zustand store with initial state" \
  "infra,P0" \
  "M0: Project Foundation" \
  "$(cat <<'BODY'
## Description

Create the Zustand store for managing editor state — current play, selected scene, selected tool, and playback state.

## Acceptance Criteria

- [ ] `src/lib/store.ts` with Zustand store
- [ ] Store slices:
  - `play`: current Play object
  - `editor`: selectedSceneId, selectedTool, selectedTimingStep
  - `playback`: isPlaying, currentSceneIndex, currentStep, speed
- [ ] Actions for updating each slice
- [ ] Store is typed with TypeScript interfaces from #4

## Dependencies

- #4
BODY
)"

# ========== M1: Court & Players ==========

create_issue 6 \
  "Render basketball half court on canvas" \
  "feature,ui,P0" \
  "M1: Court & Players" \
  "$(cat <<'BODY'
## Description

Render an accurate basketball half court using HTML5 Canvas. Include all standard court markings. The court should be responsive and maintain correct proportions.

## Acceptance Criteria

- [ ] Half court rendered with correct proportions
- [ ] Court markings: three-point arc, free-throw lane (paint), free-throw circle, basket/rim, backboard, half-court line
- [ ] Clean minimal design (light court color, darker lines)
- [ ] Court scales responsively to container width while maintaining aspect ratio
- [ ] Canvas component in `src/components/court/Court.tsx`
- [ ] Court dimensions defined as constants for reuse

## Dependencies

- #1
BODY
)"

create_issue 7 \
  "Render basketball full court on canvas" \
  "feature,ui,P0" \
  "M1: Court & Players" \
  "$(cat <<'BODY'
## Description

Extend the court component to support full court rendering. Add a toggle between half and full court.

## Acceptance Criteria

- [ ] Full court rendered with correct proportions (mirrored halves)
- [ ] All markings: both baskets, center circle, center line, both three-point arcs, both paints
- [ ] `courtType` prop: "half" | "full"
- [ ] Smooth transition when switching court types
- [ ] Full court maintains same visual style as half court

## Dependencies

- #6
BODY
)"

create_issue 8 \
  "Draggable offensive players (O1–O5)" \
  "feature,ui,P0" \
  "M1: Court & Players" \
  "$(cat <<'BODY'
## Description

Add 5 offensive players as draggable elements on the court canvas. Players are filled circles with position numbers displayed inside.

## Acceptance Criteria

- [ ] 5 offensive players rendered as filled circles on the court
- [ ] Each player shows their position number (1–5) inside the circle
- [ ] Players are draggable within court boundaries
- [ ] Player positions are saved to the current scene state in the store
- [ ] Players snap to court area (cannot be dragged outside)
- [ ] Default starting positions for a standard offensive set
- [ ] Visual feedback on hover and during drag (cursor change, slight scale)

## Dependencies

- #5, #6
BODY
)"

create_issue 9 \
  "Draggable defensive players (X1–X5)" \
  "feature,ui,P0" \
  "M1: Court & Players" \
  "$(cat <<'BODY'
## Description

Add 5 defensive players as draggable elements, visually distinct from offensive players.

## Acceptance Criteria

- [ ] 5 defensive players rendered as hollow circles or X markers
- [ ] Visually distinct from offensive players (different color/style)
- [ ] Each shows position number (1–5)
- [ ] Same drag behavior as offensive players
- [ ] Default starting positions for a standard defensive set

## Dependencies

- #8
BODY
)"

create_issue 10 \
  "Player display mode toggle (numbers / names / abbreviations)" \
  "feature,ui,P0" \
  "M1: Court & Players" \
  "$(cat <<'BODY'
## Description

Allow toggling what is displayed on each player: position number, player name (from roster), or position abbreviation (PG, SG, SF, PF, C).

## Acceptance Criteria

- [ ] Toggle button/dropdown in editor toolbar: "Numbers" | "Names" | "Positions"
- [ ] Player circles resize slightly to accommodate longer names
- [ ] Names truncate gracefully if too long
- [ ] Display mode persisted in editor settings
- [ ] Works for both offensive and defensive players

## Dependencies

- #8, #9
BODY
)"

create_issue 11 \
  "Show/hide individual players per scene" \
  "feature,ui,P0" \
  "M1: Court & Players" \
  "$(cat <<'BODY'
## Description

Allow toggling visibility of individual players within a scene. Essential for drills with fewer than 5 players or plays that don't involve defense.

## Acceptance Criteria

- [ ] Each player has a visibility toggle (per scene, not global)
- [ ] UI: player list panel or click-to-toggle on court
- [ ] Hidden players are either invisible or shown as faded ghosts in editor mode
- [ ] Hidden players do not appear in playback or export
- [ ] Visibility state stored per player per scene in the data model

## Dependencies

- #8, #9
BODY
)"

create_issue 12 \
  "Ball placement and player attachment" \
  "feature,ui,P0" \
  "M1: Court & Players" \
  "$(cat <<'BODY'
## Description

Add a ball element that can be freely placed on the court or attached to a player. When attached, the ball moves with the player.

## Acceptance Criteria

- [ ] Ball rendered as a distinct basketball icon/circle
- [ ] Ball is draggable independently on the court
- [ ] When dragged near a player, snaps and attaches to that player
- [ ] Attached ball moves with the player during drag
- [ ] Ball can be detached by dragging it away from the player
- [ ] Ball state (position, attachment) stored per scene
- [ ] Only one ball on the court at a time

## Dependencies

- #8
BODY
)"

# ========== M2: Drawing Tools ==========

create_issue 13 \
  "Drawing tools panel UI" \
  "feature,ui,P0" \
  "M2: Drawing Tools" \
  "$(cat <<'BODY'
## Description

Create the tools panel on the left side of the editor with buttons for each drawing tool and a selection/move tool.

## Acceptance Criteria

- [ ] Tools panel rendered on the left side of the editor
- [ ] Tool buttons: Select/Move, Player Movement, Dribble, Pass, Screen, Cut, Eraser
- [ ] Each tool has a distinct icon representing its basketball symbol
- [ ] Active tool is visually highlighted
- [ ] Keyboard shortcuts for quick tool switching (M, D, P, S, C, E)
- [ ] Cursor changes based on selected tool
- [ ] Panel is collapsible on smaller screens

## Dependencies

- #5
BODY
)"

create_issue 14 \
  "Player movement annotation (solid arrow line)" \
  "feature,ui,P0" \
  "M2: Drawing Tools" \
  "$(cat <<'BODY'
## Description

Implement the "player movement" drawing tool. Draws a solid line with an arrowhead from one point to another, indicating a player running to a new position.

## Acceptance Criteria

- [ ] Select movement tool → click starting point → drag to endpoint → release to place
- [ ] Rendered as a solid line with an arrow tip at the end
- [ ] Line snaps to players when starting/ending near one
- [ ] Line is selectable with the select tool
- [ ] Selected lines can be deleted (Delete/Backspace key or eraser tool)
- [ ] Annotation stored in the current scene's active timing group
- [ ] Line rendering matches standard basketball diagram conventions

## Dependencies

- #5, #6, #13
BODY
)"

create_issue 15 \
  "Dribble annotation (wavy/zigzag line)" \
  "feature,ui,P0" \
  "M2: Drawing Tools" \
  "$(cat <<'BODY'
## Description

Implement the "dribble" drawing tool. Draws a wavy/zigzag line with an arrowhead.

## Acceptance Criteria

- [ ] Wavy or zigzag line with arrow tip
- [ ] Same interaction pattern as movement tool (click-drag)
- [ ] Snaps to players
- [ ] Selectable and deletable
- [ ] Visually distinct from straight movement line

## Dependencies

- #14
BODY
)"

create_issue 16 \
  "Pass annotation (line with triangle tip)" \
  "feature,ui,P0" \
  "M2: Drawing Tools" \
  "$(cat <<'BODY'
## Description

Implement the "pass" drawing tool. Draws a straight line with a filled triangle tip, indicating a pass.

## Acceptance Criteria

- [ ] Straight line with filled triangle arrowhead
- [ ] Visually distinct from movement arrow
- [ ] Snaps to players at both ends
- [ ] When a pass connects two players, auto-transfers ball attachment in the next timing group/scene
- [ ] Selectable and deletable

## Dependencies

- #14
BODY
)"

create_issue 17 \
  "Screen/pick annotation (perpendicular line)" \
  "feature,ui,P0" \
  "M2: Drawing Tools" \
  "$(cat <<'BODY'
## Description

Implement the "screen" drawing tool. Draws a short perpendicular line at the screen position.

## Acceptance Criteria

- [ ] Short thick perpendicular line placed at a player's position
- [ ] Indicates the player is setting a screen
- [ ] Can be rotated/oriented to show screen angle
- [ ] Snaps to player position
- [ ] Selectable and deletable
- [ ] Visually matches standard basketball screen notation

## Dependencies

- #14
BODY
)"

create_issue 18 \
  "Cut annotation (dashed arrow line)" \
  "feature,ui,P0" \
  "M2: Drawing Tools" \
  "$(cat <<'BODY'
## Description

Implement the "cut" drawing tool. Draws a dashed line with an arrowhead, indicating a quick cut.

## Acceptance Criteria

- [ ] Dashed line with arrow tip
- [ ] Same interaction pattern as movement tool
- [ ] Snaps to players
- [ ] Visually distinct from solid movement line and wavy dribble
- [ ] Selectable and deletable

## Dependencies

- #14
BODY
)"

create_issue 19 \
  "Eraser tool and annotation selection/deletion" \
  "feature,ui,P0" \
  "M2: Drawing Tools" \
  "$(cat <<'BODY'
## Description

Implement annotation selection (with the select tool) and deletion (with eraser or keyboard).

## Acceptance Criteria

- [ ] Select tool: click an annotation to select it (highlight/handles shown)
- [ ] Selected annotation can be deleted with Delete/Backspace key
- [ ] Eraser tool: click an annotation to delete it immediately
- [ ] Multi-select with Shift+click (stretch goal)
- [ ] Undo/Redo support (Ctrl+Z / Ctrl+Shift+Z) for annotation create/delete

## Dependencies

- #14
BODY
)"

# ========== M3: Scenes & Animation ==========

create_issue 20 \
  "Scene management — add, remove, duplicate, reorder" \
  "feature,ui,P0" \
  "M3: Scenes & Animation" \
  "$(cat <<'BODY'
## Description

Implement the scene strip at the bottom of the editor. Users can add new scenes, remove scenes, duplicate, and reorder them.

## Acceptance Criteria

- [ ] Scene strip rendered at the bottom of the editor
- [ ] Each scene shows a small thumbnail preview of the court state
- [ ] Click a scene to select it and load its state in the editor
- [ ] [+] button to add a new scene (copies player positions from current scene)
- [ ] Right-click or menu on scene: Duplicate, Delete, Move Left, Move Right
- [ ] Drag-and-drop reorder of scenes
- [ ] First scene cannot be deleted if it's the only one
- [ ] Scene order number updates automatically on reorder
- [ ] Active scene is visually highlighted in the strip

## Dependencies

- #5, #8, #12
BODY
)"

create_issue 21 \
  "Timing groups — assign steps to annotations" \
  "feature,ui,P0" \
  "M3: Scenes & Animation" \
  "$(cat <<'BODY'
## Description

Implement the timing group system within scenes. Each annotation is assigned to a step (timing group). Actions in the same step animate simultaneously; steps play sequentially.

## Acceptance Criteria

- [ ] New annotations are assigned to the currently selected step (default: Step 1)
- [ ] Step selector in the timing strip: shows 1, 2, 3... buttons
- [ ] Click a step to set it as active (new annotations go here)
- [ ] [+] button to add a new step
- [ ] Each annotation on the canvas shows a small step number badge
- [ ] Annotations can be reassigned to a different step (drag in timing strip or right-click menu)
- [ ] Empty steps are auto-removed when last annotation is moved out
- [ ] Each step has a configurable duration (default 1000ms)
- [ ] Timing group data stored in the scene per the PRD data model

## Dependencies

- #14, #20
BODY
)"

create_issue 22 \
  "Scene transition animation engine" \
  "feature,P0" \
  "M3: Scenes & Animation" \
  "$(cat <<'BODY'
## Description

Build the animation engine that interpolates player and ball positions between scenes and plays timing groups in sequence within a scene.

## Acceptance Criteria

- [ ] Player positions interpolate smoothly (linear or ease-in-out) between scenes
- [ ] Ball position interpolates or follows pass lines between scenes
- [ ] Within a scene, timing groups play in order (step 1, pause, step 2, pause, ...)
- [ ] Annotations in a group animate in sync (line draws progressively as player moves)
- [ ] Players with no position change stay in place
- [ ] Animation engine is decoupled from rendering (can be used for both playback and export)
- [ ] `src/lib/animation.ts` with core interpolation and sequencing logic

## Dependencies

- #5, #21
BODY
)"

create_issue 23 \
  "Playback controls UI" \
  "feature,ui,P0" \
  "M3: Scenes & Animation" \
  "$(cat <<'BODY'
## Description

Implement playback control bar: play/pause, step forward/back, speed control, and loop toggle.

## Acceptance Criteria

- [ ] Play/Pause button — auto-advances through all scenes and timing groups
- [ ] Step Forward / Step Back — advance or rewind one scene at a time
- [ ] Speed control: 0.5x, 1x, 1.5x, 2x
- [ ] Loop toggle — replay animation from the beginning when it ends
- [ ] Timeline scrubber — drag to any point in the total animation
- [ ] Current scene/step indicator (e.g., "Scene 2 / Step 1")
- [ ] Keyboard shortcuts: Space (play/pause), Left/Right arrows (step), L (loop)
- [ ] Playback controls disable editing tools while playing

## Dependencies

- #22
BODY
)"

# ========== M4: Play Management ==========

create_issue 24 \
  "Create new play with properties" \
  "feature,backend,P0" \
  "M4: Play Management" \
  "$(cat <<'BODY'
## Description

Implement play creation flow. User sets title, category, court type, and optional tags/description. Creates a new Play document in Firestore with a default first scene.

## Acceptance Criteria

- [ ] "New Play" button in playbook view opens creation dialog/modal
- [ ] Fields: Title (required), Category (dropdown), Court Type (half/full), Tags (free-text chips), Description (optional textarea)
- [ ] On create: generates Play document in Firestore with one default scene (5 offense + 5 defense in default positions)
- [ ] Redirects to the editor with the new play loaded
- [ ] Play is associated with the current team

## Dependencies

- #2, #4
BODY
)"

create_issue 25 \
  "Auto-save play to Firestore" \
  "feature,backend,P0" \
  "M4: Play Management" \
  "$(cat <<'BODY'
## Description

Implement auto-save: every change to the play (player positions, annotations, scenes, timing) is automatically saved to Firestore with debouncing.

## Acceptance Criteria

- [ ] Changes are auto-saved after 1-2 seconds of inactivity (debounced)
- [ ] Save indicator in the toolbar: "Saving..." / "Saved" / "Offline"
- [ ] Firestore document structure matches PRD data model
- [ ] `updatedAt` timestamp updates on each save
- [ ] Handles network errors gracefully (retry, offline queue)
- [ ] Firestore offline persistence enabled for viewing without connection

## Dependencies

- #2, #5, #24
BODY
)"

create_issue 26 \
  "Playbook grid view with thumbnails" \
  "feature,ui,P0" \
  "M4: Play Management" \
  "$(cat <<'BODY'
## Description

Build the main playbook screen showing all plays in a grid with thumbnail previews.

## Acceptance Criteria

- [ ] Grid layout of play cards
- [ ] Each card shows: thumbnail of first scene, title, category badge, updated date
- [ ] Click a card to open the play in the editor
- [ ] Responsive grid (4 columns desktop, 2 tablet, 1 mobile)
- [ ] Empty state when no plays exist ("Create your first play" CTA)
- [ ] Loading state with skeleton cards

## Dependencies

- #24, #25
BODY
)"

create_issue 27 \
  "Filter and search plays" \
  "feature,ui,P0" \
  "M4: Play Management" \
  "$(cat <<'BODY'
## Description

Add filtering and search to the playbook view.

## Acceptance Criteria

- [ ] Search bar: filter plays by title (client-side filter)
- [ ] Category dropdown filter: All, Offense, Defense, Inbound, Press Break, Fast Break, OOB, Special
- [ ] Tag filter: show all unique tags, click to filter
- [ ] Sort by: Date Modified (default), Date Created, Title A-Z
- [ ] Filters combine (search + category + tag)
- [ ] URL params updated with filters (shareable filtered views)

## Dependencies

- #26
BODY
)"

create_issue 28 \
  "Edit and delete plays" \
  "feature,backend,P0" \
  "M4: Play Management" \
  "$(cat <<'BODY'
## Description

Allow editing play properties (title, category, tags, description) and deleting plays.

## Acceptance Criteria

- [ ] Edit button on play card or in editor toolbar opens edit dialog
- [ ] All play properties are editable
- [ ] Delete button with confirmation dialog ("Are you sure? This cannot be undone.")
- [ ] Delete removes play from Firestore
- [ ] After delete, redirect to playbook view
- [ ] Only admin and the play creator can delete

## Dependencies

- #24, #25
BODY
)"

create_issue 29 \
  "Duplicate play" \
  "feature,P1" \
  "M4: Play Management" \
  "$(cat <<'BODY'
## Description

Allow duplicating an existing play to create variations.

## Acceptance Criteria

- [ ] "Duplicate" action on play card and in editor
- [ ] Creates a deep copy with title "[Original Title] (Copy)"
- [ ] New play opens in editor immediately
- [ ] All scenes, annotations, timing groups are copied

## Dependencies

- #24, #25
BODY
)"

# ========== M5: Auth & Teams ==========

create_issue 30 \
  "Firebase Authentication — email and Google sign-in" \
  "auth,P0" \
  "M5: Auth & Teams" \
  "$(cat <<'BODY'
## Description

Implement user authentication with Firebase Auth. Support email/password and Google sign-in.

## Acceptance Criteria

- [ ] Sign up with email/password
- [ ] Sign in with email/password
- [ ] Sign in with Google
- [ ] Sign out
- [ ] Auth state persisted across sessions
- [ ] Protected routes: redirect to sign-in if not authenticated
- [ ] User profile stored in Firestore (`users` collection)
- [ ] Auth context/hook available across the app

## Dependencies

- #2
BODY
)"

create_issue 31 \
  "Team creation and settings" \
  "feature,backend,P0" \
  "M5: Auth & Teams" \
  "$(cat <<'BODY'
## Description

Allow users to create a team, set a team name, and configure the roster.

## Acceptance Criteria

- [ ] Create team flow (name, optional roster setup)
- [ ] Team creator becomes admin
- [ ] Team settings page: edit name, manage roster
- [ ] Roster management: set player names for positions 1-5 (offense and defense)
- [ ] Team document created in Firestore matching PRD data model
- [ ] User can be part of multiple teams (team switcher in nav)

## Dependencies

- #30
BODY
)"

create_issue 32 \
  "Team invite link" \
  "feature,auth,P0" \
  "M5: Auth & Teams" \
  "$(cat <<'BODY'
## Description

Allow team admin to generate an invite link. Anyone with the link can join the team as a viewer.

## Acceptance Criteria

- [ ] Admin can generate/regenerate invite link
- [ ] Invite link is a URL with a unique invite code
- [ ] Visiting the link: if signed in, joins the team; if not, prompts sign-in first then joins
- [ ] New members join as "viewer" by default
- [ ] Admin can revoke/regenerate the invite code

## Dependencies

- #30, #31
BODY
)"

create_issue 33 \
  "Role-based permissions (admin, editor, viewer)" \
  "auth,P0" \
  "M5: Auth & Teams" \
  "$(cat <<'BODY'
## Description

Implement role-based access control. Admin can assign editor permissions. Enforce permissions in UI and Firestore security rules.

## Acceptance Criteria

- [ ] Admin can change member roles (viewer <-> editor) in team settings
- [ ] Editor: can create and edit plays, cannot delete others' plays, cannot manage team
- [ ] Viewer: read-only access to playbook, can play animations, cannot edit
- [ ] UI elements (edit buttons, tools, new play) hidden/disabled for viewers
- [ ] Firestore security rules enforce permissions server-side
- [ ] Admin cannot be demoted (only transferred to another user)

## Dependencies

- #30, #31, #32
BODY
)"

# ========== M6: Export & Sharing ==========

create_issue 34 \
  "GIF export of play animation" \
  "export,P0" \
  "M6: Export & Sharing" \
  "$(cat <<'BODY'
## Description

Export the full play animation as a GIF file. Should be shareable via WhatsApp/messaging apps.

## Acceptance Criteria

- [ ] "Export GIF" button in editor toolbar
- [ ] Renders all scenes with transitions and timing groups
- [ ] Progress indicator during rendering
- [ ] Configurable: speed, resolution (SD/HD)
- [ ] Output file is downloadable
- [ ] File size reasonable for messaging apps (target < 5MB for typical plays)
- [ ] Uses gif.js or similar client-side library
- [ ] Court and players render cleanly at export resolution

## Dependencies

- #22
BODY
)"

create_issue 35 \
  "Share link for individual plays" \
  "feature,P0" \
  "M6: Export & Sharing" \
  "$(cat <<'BODY'
## Description

Generate a read-only share link for a specific play. Anyone with the link can view and play the animation without needing a team account.

## Acceptance Criteria

- [ ] "Share" button in editor generates a unique URL
- [ ] Shared view shows: play title, court with animation, playback controls
- [ ] No editing capabilities in shared view
- [ ] No authentication required to view
- [ ] Link can be copied to clipboard with one click
- [ ] Admin can disable sharing for a play
- [ ] Route: `/play/[id]/view`

## Dependencies

- #22, #23
BODY
)"

create_issue 36 \
  "PNG export of single scene" \
  "export,P1" \
  "M6: Export & Sharing" \
  "$(cat <<'BODY'
## Description

Export the currently viewed scene as a static PNG image.

## Acceptance Criteria

- [ ] "Export Image" option in export menu
- [ ] Exports current scene with all players, ball, and annotations
- [ ] Clean rendering without editor UI elements
- [ ] Configurable resolution
- [ ] Downloadable PNG file

## Dependencies

- #6, #8, #14
BODY
)"

create_issue 37 \
  "PDF export — one page per scene" \
  "export,P1" \
  "M6: Export & Sharing" \
  "$(cat <<'BODY'
## Description

Export the entire play as a PDF with one scene per page.

## Acceptance Criteria

- [ ] "Export PDF" option in export menu
- [ ] First page: play title, description, category
- [ ] Each subsequent page: scene rendering + scene note
- [ ] Page header with play title, page footer with scene number
- [ ] Clean print-friendly rendering
- [ ] Uses jsPDF or similar client-side library

## Dependencies

- #36
BODY
)"

# ========== M7: Polish & Launch ==========

create_issue 38 \
  "Responsive layout for editor" \
  "ui,P0" \
  "M7: Polish & Launch" \
  "$(cat <<'BODY'
## Description

Ensure the editor layout works well on desktop and tablet. Tools panel and scene strip adapt to screen size.

## Acceptance Criteria

- [ ] Desktop (>1024px): full layout as wireframed in PRD
- [ ] Tablet (768-1024px): collapsible tools panel, smaller scene thumbnails
- [ ] Mobile (<768px): viewer-only mode with playback controls, no editing
- [ ] No horizontal scrolling at any breakpoint
- [ ] Court canvas scales to available space

## Dependencies

- All M1-M4 issues
BODY
)"

create_issue 39 \
  "Keyboard shortcuts" \
  "ui,P1" \
  "M7: Polish & Launch" \
  "$(cat <<'BODY'
## Description

Implement keyboard shortcuts for common editor actions.

## Acceptance Criteria

- [ ] Tool switching: M (move), D (dribble), P (pass), S (screen), C (cut), E (eraser), V (select)
- [ ] Playback: Space (play/pause), Left/Right arrows (step scenes), L (loop)
- [ ] Editing: Ctrl+Z (undo), Ctrl+Shift+Z (redo), Delete (remove selected), Ctrl+S (force save)
- [ ] Scenes: Ctrl+Right / Ctrl+Left (next/prev scene)
- [ ] Shortcuts hint: ? key shows overlay with all shortcuts
- [ ] Shortcuts disabled when typing in input fields

## Dependencies

- #13, #23
BODY
)"

create_issue 40 \
  "Undo/Redo system" \
  "feature,P1" \
  "M7: Polish & Launch" \
  "$(cat <<'BODY'
## Description

Implement undo/redo for all editor actions (player moves, annotation create/delete, scene changes).

## Acceptance Criteria

- [ ] Action history stack with undo/redo
- [ ] Supports: player position changes, annotation CRUD, scene add/remove/reorder, timing group changes
- [ ] Ctrl+Z / Ctrl+Shift+Z keyboard shortcuts
- [ ] Undo/Redo buttons in toolbar
- [ ] History resets when switching to a different play
- [ ] Stack size limit (e.g., 50 actions) to prevent memory issues

## Dependencies

- #5
BODY
)"

create_issue 41 \
  "Loading states and error handling" \
  "ui,P0" \
  "M7: Polish & Launch" \
  "$(cat <<'BODY'
## Description

Add proper loading states, error boundaries, and user feedback across the app.

## Acceptance Criteria

- [ ] Skeleton loaders for playbook grid, editor load
- [ ] Error boundary with user-friendly message and retry
- [ ] Toast notifications for: save success/failure, export complete, invite sent
- [ ] Network error handling with retry logic
- [ ] 404 page for invalid play/team URLs

## Dependencies

- All previous issues
BODY
)"

create_issue 42 \
  "Firestore security rules" \
  "backend,auth,P0" \
  "M7: Polish & Launch" \
  "$(cat <<'BODY'
## Description

Write and deploy comprehensive Firestore security rules that enforce role-based access.

## Acceptance Criteria

- [ ] Rules enforce: only team members can read plays
- [ ] Only admin and editors can write plays
- [ ] Only admin can modify team settings and member roles
- [ ] Users can only modify their own profile
- [ ] Shared play links bypass team membership for read-only access
- [ ] Rules tested with Firebase emulator
- [ ] No security vulnerabilities for CRUD operations

## Dependencies

- #33
BODY
)"

echo ""
echo "============================================="
echo "Done! Created 42 issues with labels and milestones."
echo "============================================="
