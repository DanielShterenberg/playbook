# Basketball Playbook App — Product Requirements Document

## 1. Vision & Overview

A web-based basketball playbook application that allows coaches to diagram plays, animate transitions between scenes, and share the entire playbook with their team. The app provides an interactive court editor with standard basketball diagramming symbols, multi-scene play creation with animated transitions, and a shared team playbook accessible to all members.

**Target User:** Basketball team coaches (starting with a single team, designed for future multi-team expansion).

**Core Value Proposition:** Replace whiteboard sketches and static images with a digital, animated, shareable playbook that the entire team can access anytime.

---

## 2. User Roles & Permissions

### Team Admin (Coach)
- Create, edit, duplicate, and delete plays
- Manage team roster (player names and positions)
- Invite team members via link or email
- Assign editor permissions to other members
- Export plays (GIF, video, PDF)
- Manage playbook organization (categories, tags)

### Editor (Assigned by Admin)
- Create new plays
- Edit existing plays
- Cannot delete plays created by others
- Cannot manage team settings or member permissions

### Viewer (Default for team members)
- View the entire playbook
- Play/replay animations
- Browse and filter plays by category
- Cannot edit or create plays

---

## 3. Core Features

### 3.1 Court Editor

**Court Types:**
- Half court (default, most common for offensive plays)
- Full court (for press breaks, fast breaks, transition plays)

**Court Rendering:**
- Accurate proportions with standard markings (three-point line, free-throw lane, center circle, etc.)
- Clean, minimal design that doesn't distract from the play diagram
- Responsive — works on desktop and tablet

### 3.2 Players

**Offensive Players (O1–O5):**
- Displayed as filled circles on the court
- Draggable to any position
- Display mode toggle: position number (1–5) or custom player name
- Can be toggled on/off per scene (e.g., show only 3 players for a 3-on-3 drill)

**Defensive Players (X1–X5):**
- Displayed as X markers or hollow circles (visually distinct from offense)
- Same draggable and toggle capabilities as offensive players
- Can be independently shown/hidden per scene

**Player Configuration:**
- Team roster: assign real names to positions (e.g., O1 = "Daniel", O2 = "Yoni")
- Per-play override: rename players for a specific play without changing the roster
- Display toggle: show numbers, names, or position abbreviations (PG, SG, SF, PF, C)

### 3.3 Ball

- Displayed as a distinct ball icon
- Can be placed independently or attached to a player
- When attached to a player, moves with that player
- Transfers between players across scenes (e.g., O1 has ball in scene 1, O3 has ball in scene 2 after a pass)

### 3.4 Drawing Tools — Standard Basketball Symbols

| Symbol | Visual | Meaning |
|--------|--------|---------|
| Player movement | Solid line with arrow (→) | Player runs to a new position |
| Dribble | Wavy/zigzag line with arrow | Player dribbles to a new position |
| Pass | Straight line with triangle tip (▷) | Ball is passed from one player to another |
| Screen/Pick | Short perpendicular line (⊥) | Player sets a screen |
| Cut | Dashed line with arrow (- - →) | Quick cut to a position |

**Drawing Behavior:**
- Click a starting point (usually a player), drag to an endpoint
- Lines snap to players when near them
- Each line is associated with a specific scene
- Lines can be selected, edited, or deleted
- Line color coding: optional, to distinguish different player paths in complex plays

### 3.5 Scenes (Frames)

Each play consists of multiple scenes that represent progressive steps in the play.

**Scene Management:**
- Add, remove, reorder, and duplicate scenes
- Thumbnail strip at the bottom showing all scenes
- Click a scene to jump to it

**Scene State:**
Each scene stores:
- Position of all players (offense and defense)
- Ball position/attachment
- Drawing annotations (lines, symbols) for that scene
- Timing group assignments for all actions
- Optional text note/description for the scene

**Timing Groups (Action Sequencing within a Scene):**

Within a single scene, actions can happen simultaneously or in sequence. This is critical for plays where order matters (e.g., a screen must be set before a player can use it).

Each action (player movement, pass, dribble, screen) is assigned to a **timing group** (step). Actions in the same group animate simultaneously. Groups play in sequential order (group 1, then group 2, then group 3...).

Example — Pick and Roll in a single scene:
- **Step 1:** O4 moves to screen position
- **Step 2:** O1 dribbles off screen + O4 rolls to basket (simultaneous)
- **Step 3:** O1 passes to O4

**Default behavior:** All actions in a scene are assigned to Step 1 (simultaneous). Users who don't need sequencing can ignore this feature entirely.

**UI for Timing Groups:**
- Each annotation/action shows a small step number badge (①, ②, ③)
- A mini-timeline below the scene strip shows the steps within the selected scene
- Drag actions between steps to reorder
- Click [+] to add a new step, drag actions into it
- Merge steps by dragging all actions out of a step (auto-removes empty steps)

**Scene Transitions:**
- Animated interpolation of player positions between scenes
- Within a scene, timing groups play in order with a short pause between steps
- Ball movement follows pass lines or stays with dribbling player
- Smooth animation with configurable speed
- Players without position changes stay in place
- Drawing annotations animate in sync with their assigned timing group

### 3.6 Playback & Animation

**Play Controls:**
- Play/Pause button — auto-advances through all scenes
- Step forward / Step back — manual scene navigation
- Speed control — slow, normal, fast
- Loop toggle — repeat animation
- Timeline scrubber — drag to any point in the animation

**Animation Details:**
- Player movement is interpolated (smooth slide from position A to B)
- Lines/arrows animate in (drawn progressively) during the transition
- Ball follows its designated path (pass arc, dribble path)
- Within a scene, timing groups play sequentially with a brief pause between steps
- All actions within the same timing group animate simultaneously
- Scene duration = sum of all timing group durations + pauses between groups

### 3.7 Play Management

**Play Properties:**
- Title (e.g., "Horns Flare", "1-4 High Pick and Roll")
- Category: Offense, Defense, Inbound, Press Break, Fast Break, Out of Bounds, Special
- Tags: free-form tags for further organization (e.g., "zone", "man-to-man", "vs-press")
- Description: optional text description of the play
- Court type: half or full

**Playbook View:**
- Grid of all plays with thumbnail previews (first scene as thumbnail)
- Filter by category and tags
- Search by title
- Sort by: date created, date modified, title, category

**Play Actions:**
- Duplicate: create a copy of a play to use as a starting point for variations
- Delete: with confirmation dialog
- Share link: generate a read-only link to a specific play

### 3.8 Export

**GIF/Animated WebM (Primary):**
- Renders the full play animation as a downloadable GIF or WebM
- Configurable resolution and speed
- Suitable for sharing via WhatsApp/messaging apps

**Video MP4 (Secondary):**
- Full video export with smoother animation
- Uses Canvas Recording API (MediaRecorder) or server-side rendering

**PDF (Fallback):**
- One page per scene
- Includes scene notes
- Play title and description on first page

**Image PNG:**
- Export a single scene as a static image
- Useful for quick sharing or embedding in documents

---

## 4. Data Model

### Team
```
{
  id: string
  name: string
  createdBy: string (userId)
  createdAt: timestamp
  roster: {
    offense: [
      { position: 1, name: "Daniel", abbreviation: "PG" },
      { position: 2, name: "Yoni", abbreviation: "SG" },
      ...
    ],
    defense: [
      { position: 1, name: "X1" },
      ...
    ]
  }
  members: [
    { userId: string, role: "admin" | "editor" | "viewer" }
  ]
  inviteCode: string
}
```

### Play
```
{
  id: string
  teamId: string
  title: string
  description: string
  category: "offense" | "defense" | "inbound" | "press-break" | "fast-break" | "oob" | "special"
  tags: string[]
  courtType: "half" | "full"
  createdBy: string (userId)
  createdAt: timestamp
  updatedAt: timestamp
  scenes: Scene[]
}
```

### Scene
```
{
  id: string
  order: number
  duration: number (ms, default 2000)
  note: string (optional description)
  players: {
    offense: [
      { position: 1, x: number, y: number, visible: boolean }
      ...
    ],
    defense: [
      { position: 1, x: number, y: number, visible: boolean }
      ...
    ]
  }
  ball: {
    x: number,
    y: number,
    attachedTo: { side: "offense" | "defense", position: number } | null
  }
  timingGroups: [
    {
      step: number          // 1, 2, 3... (sequential order)
      duration: number      // ms, default 1000 per step
      annotations: [
        {
          id: string
          type: "movement" | "dribble" | "pass" | "screen" | "cut"
          from: { x: number, y: number }
          to: { x: number, y: number }
          fromPlayer: { side: string, position: number } | null
          toPlayer: { side: string, position: number } | null
          controlPoints: { x: number, y: number }[] // for curved lines
        }
      ]
    }
  ]
}
```

---

## 5. UI/UX Layout

### Main Editor Screen
```
┌─────────────────────────────────────────────────┐
│  [Play Title]          [Save] [Export] [Share]   │
├────────┬────────────────────────────────────┬────┤
│        │                                    │    │
│ Tools  │         Court Canvas               │Play│
│ Panel  │                                    │Info│
│        │    (interactive court with          │    │
│ - Move │     players and annotations)       │Note│
│ - Pass │                                    │    │
│ - Drib │     Actions show step badges:      │    │
│ - Scrn │     ① ② ③                         │    │
│ - Cut  │                                    │    │
│ - Eras │                                    │    │
│        │                                    │    │
├────────┴────────────────────────────────────┴────┤
│  Timing: [Step ①][ Step ② ][ Step ③ ][+]        │
│  ─────────────────────────────────────────────── │
│  [◀][▶] [▶Play] [Speed]    [Scene Thumbnails]   │
│  Scene 1 | Scene 2 | Scene 3 | Scene 4 | [+]    │
└─────────────────────────────────────────────────┘
```

The bottom panel has two levels:
1. **Timing strip** (top): Shows steps within the currently selected scene. Drag actions between steps.
2. **Scene strip** (bottom): Shows all scenes in the play. Click to navigate.

### Playbook Screen
```
┌─────────────────────────────────────────────────┐
│  Team Playbook          [+ New Play] [Filter]    │
├─────────────────────────────────────────────────┤
│  [Search: ___________]  Category: [All ▾]       │
├─────────────────────────────────────────────────┤
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐        │
│  │thumb │  │thumb │  │thumb │  │thumb │        │
│  │      │  │      │  │      │  │      │        │
│  ├──────┤  ├──────┤  ├──────┤  ├──────┤        │
│  │Horns │  │1-4   │  │Box   │  │Press │        │
│  │Flare │  │High  │  │Out   │  │Break │        │
│  │Offense│  │Offense│  │Inbound│ │Defense│       │
│  └──────┘  └──────┘  └──────┘  └──────┘        │
└─────────────────────────────────────────────────┘
```

### Presentation Mode
- Full-screen view
- Large court with play animation
- Play title and notes overlay
- Navigate between plays with arrow keys
- Auto-play through a filtered set of plays

---

## 6. Technical Architecture

### Frontend
- **Framework:** Next.js (deployed on Vercel)
- **Court & Animation:** HTML5 Canvas (via Konva.js or Fabric.js) or SVG
- **State Management:** Zustand or React Context
- **Styling:** Tailwind CSS

### Backend / Data
- **Database:** Firebase Firestore (real-time sync, offline support)
- **Auth:** Firebase Authentication (email/password + Google sign-in)
- **Storage:** Firebase Storage (for exported files, team assets)
- **Hosting:** Vercel (frontend), Firebase (backend services)

### Export Pipeline
- **GIF:** html-to-canvas + gif.js (client-side)
- **WebM/MP4:** Canvas MediaRecorder API (client-side)
- **PDF:** jsPDF or html2canvas → PDF (client-side)
- **Server-side rendering (future):** Railway service for higher-quality video exports

### Key Technical Decisions
- Canvas-based rendering (not DOM) for smooth animation and easy export
- Client-side export first, server-side later for quality/performance
- Firestore for real-time playbook sync across team members
- Optimistic UI updates with Firestore's offline persistence

---

## 7. MVP Scope vs. Future Enhancements

### Shipped ✓
- [x] Half court and full court
- [x] 5 offensive + 5 defensive players, draggable
- [x] Player display: numbers, names, or position abbreviations
- [x] Show/hide individual players per scene
- [x] Ball placement and attachment
- [x] Drawing tools: movement, dribble, pass, screen, cut
- [x] Multi-scene plays with add/remove/reorder/duplicate
- [x] Timing groups within scenes (sequential action ordering)
- [x] Animated transitions between scenes and within timing groups
- [x] Playback controls (play, pause, step, speed, loop)
- [x] Play CRUD with title, description, category, court type
- [x] Playbook grid view with thumbnails
- [x] Filter by category, search by title
- [x] Firebase auth (email/password + Google)
- [x] Team creation and invite link
- [x] Role-based permissions (admin, editor, viewer)
- [x] Personal vs. team plays (promote personal play to team)
- [x] PDF export (one page per scene)
- [x] PNG export (single scene)
- [x] Undo/redo (50-step history)
- [x] Keyboard shortcuts (tools, playback, scenes, ?)
- [x] Auto-save with Firestore sync
- [x] Mobile viewer mode (playback only on small screens)
- [x] Responsive court (height-constrained, proportional player tokens)

### In Progress / Planned
- [ ] GIF export of play animation (#77)
- [ ] Presentation mode — full-screen playback for practice/projector (#132)
- [ ] Scene comments with threading and resolve (#133) — Google Docs-style
- [ ] Defender follow/guard assignment (#128)
- [ ] Multi-leg player paths within a scene (#129)
- [ ] Custom team colors for offense and defense (#130)

### v2.0 (Future)
- [ ] 3x3 court support
- [ ] Drill timer / practice plan builder
- [ ] Collaborative real-time editing (multiple simultaneous editors)
- [ ] Mobile-optimized editor (currently viewer-only on mobile)
- [ ] Template plays library (common plays to start from)
- [ ] Analytics: track which plays team members have viewed
- [ ] Offline mode with full sync
- [ ] Voice-over recording on plays
- [ ] Integration with video clips (attach game footage to plays)

---

## 8. Non-Functional Requirements

- **Performance:** Court editor should run at 60fps on modern browsers
- **Responsive:** Playbook viewer works on mobile; editor optimized for desktop/tablet
- **Offline:** Firestore offline persistence for viewing playbook without connection
- **Load time:** Initial page load under 3 seconds
- **Browser support:** Chrome, Safari, Firefox (latest 2 versions)
- **Data safety:** Auto-save on every change with Firestore

---

## 9. Project Structure (Suggested)

```
basketball-playbook/
├── src/
│   ├── app/                    # Next.js app router
│   │   ├── page.tsx            # Landing / auth
│   │   ├── playbook/           # Playbook grid view
│   │   ├── play/[id]/          # Play editor
│   │   ├── play/[id]/view      # Play viewer (shared link)
│   │   └── team/               # Team settings
│   ├── components/
│   │   ├── court/              # Court canvas, rendering
│   │   ├── editor/             # Tools panel, scene strip
│   │   ├── players/            # Player components
│   │   ├── annotations/        # Drawing tools & symbols
│   │   ├── playback/           # Animation controls
│   │   └── playbook/           # Grid, filters, search
│   ├── lib/
│   │   ├── firebase.ts         # Firebase config & helpers
│   │   ├── store.ts            # Zustand store
│   │   ├── types.ts            # TypeScript interfaces
│   │   ├── animation.ts        # Interpolation & playback engine
│   │   └── export.ts           # GIF/video/PDF export
│   └── hooks/                  # Custom React hooks
├── public/
│   └── court-assets/           # Court SVG templates
└── firebase/
    └── firestore.rules         # Security rules
```
