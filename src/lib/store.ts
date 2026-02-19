// Zustand store for global application state.
// Implements issue #48: editor, playback, and play slice management.
// Issue #83: undo/redo system integrated via useHistoryStore.

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type {
  Play,
  Scene,
  TimingGroup,
  Annotation,
  Category,
  CourtType,
  PlayerState,
  BallState,
} from "./types";
import { useHistoryStore } from "./history";

// ---------------------------------------------------------------------------
// Tool types
// ---------------------------------------------------------------------------

export type DrawingTool =
  | "select"
  | "movement"
  | "dribble"
  | "pass"
  | "screen"
  | "cut"
  | "eraser";

export type PlaybackSpeed = 0.5 | 1 | 1.5 | 2;

/**
 * Controls what label is rendered inside each player token.
 *   "numbers"      — 1-based position number (O1, X1 …)  [default]
 *   "names"        — full player name from the team roster
 *   "abbreviations"— position abbreviation (PG, SG, SF, PF, C)
 */
export type PlayerDisplayMode = "numbers" | "names" | "abbreviations";

// ---------------------------------------------------------------------------
// Store state interface — flat, no slice intersection conflicts
// ---------------------------------------------------------------------------

export interface AppStore {
  // ------- Playbook list (issue #67 / #69) -------
  plays: Play[];
  addPlay: (play: Play) => void;
  removePlay: (playId: string) => void;
  updatePlayInList: (play: Play) => void;
  getPlayById: (playId: string) => Play | undefined;

  // ------- Play data -------
  currentPlay: Play | null;

  setCurrentPlay: (play: Play) => void;
  clearCurrentPlay: () => void;
  updatePlayMeta: (
    patch: Partial<Pick<Play, "title" | "description" | "category" | "tags" | "courtType">>,
  ) => void;

  // Undo / Redo (issue #83)
  undo: () => void;
  redo: () => void;

  // Scene mutations
  addScene: () => void;
  removeScene: (sceneId: string) => void;
  duplicateScene: (sceneId: string) => void;
  reorderScene: (sceneId: string, newOrder: number) => void;
  updateSceneNote: (sceneId: string, note: string) => void;
  updatePlayerState: (sceneId: string, side: "offense" | "defense", player: PlayerState) => void;
  updateBallState: (sceneId: string, ball: BallState) => void;

  // Timing group / annotation mutations
  addAnnotation: (sceneId: string, timingStep: number, annotation: Annotation) => void;
  removeAnnotation: (sceneId: string, annotationId: string) => void;
  moveAnnotationToStep: (sceneId: string, annotationId: string, newStep: number) => void;
  addTimingStep: (sceneId: string) => void;
  removeTimingStep: (sceneId: string, step: number) => void;

  // ------- Editor state -------
  selectedSceneId: string | null;
  selectedTool: DrawingTool;
  selectedTimingStep: number;
  selectedAnnotationId: string | null;
  playerDisplayMode: PlayerDisplayMode;

  setSelectedSceneId: (id: string | null) => void;
  setSelectedTool: (tool: DrawingTool) => void;
  setSelectedTimingStep: (step: number) => void;
  setSelectedAnnotationId: (id: string | null) => void;
  setPlayerDisplayMode: (mode: PlayerDisplayMode) => void;

  // Player visibility toggle (per scene)
  togglePlayerVisibility: (sceneId: string, side: "offense" | "defense", position: number) => void;

  // Player names (global editor state, keyed by e.g. "offense-1" / "defense-2")
  playerNames: Record<string, string>;
  setPlayerName: (key: string, name: string) => void;

  // ------- Playback state -------
  isPlaying: boolean;
  currentSceneIndex: number;
  currentStep: number;
  speed: PlaybackSpeed;
  loop: boolean;

  startPlayback: () => void;
  pausePlayback: () => void;
  togglePlayback: () => void;
  stepForward: () => void;
  stepBack: () => void;
  setCurrentSceneIndex: (index: number) => void;
  setCurrentStep: (step: number) => void;
  setSpeed: (speed: PlaybackSpeed) => void;
  setLoop: (loop: boolean) => void;
  resetPlayback: () => void;
}

// ---------------------------------------------------------------------------
// History helpers — snapshot the undoable portion of the store state
// ---------------------------------------------------------------------------

/**
 * Capture a snapshot of the undoable editor state so it can be pushed to the
 * history stack before a mutation is applied. Must be called outside of a
 * `set()` call (i.e. using `get()`).
 */
function captureSnapshot(state: { currentPlay: Play | null; selectedSceneId: string | null }) {
  if (!state.currentPlay) return null;
  return {
    // Deep-clone so mutations to the live state don't corrupt history.
    play: JSON.parse(JSON.stringify(state.currentPlay)) as Play,
    selectedSceneId: state.selectedSceneId,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Default normalised court positions for new scenes.
 * These match the visual defaults in CourtWithPlayers so the court is never
 * initialised with all players stacked at centre (0.5, 0.5).
 *
 * y: 0 = half-court line, 1 = baseline
 */
const DEFAULT_OFFENSE_POSITIONS: [number, number][] = [
  [0.5,  0.35], // O1 — PG, top of key
  [0.18, 0.48], // O2 — left wing
  [0.82, 0.48], // O3 — right wing
  [0.08, 0.75], // O4 — left corner
  [0.92, 0.75], // O5 — right corner
];

const DEFAULT_DEFENSE_POSITIONS: [number, number][] = [
  [0.5,  0.42], // X1 — on ball
  [0.22, 0.54], // X2
  [0.78, 0.54], // X3
  [0.14, 0.78], // X4
  [0.86, 0.78], // X5
];

function createEmptyScene(order: number): Scene {
  const makePlayers = (positions: [number, number][]): PlayerState[] =>
    positions.map(([x, y], i) => ({
      position: i + 1,
      x,
      y,
      visible: true,
    }));

  return {
    id: crypto.randomUUID(),
    order,
    duration: 2000,
    note: "",
    players: {
      offense: makePlayers(DEFAULT_OFFENSE_POSITIONS),
      defense: makePlayers(DEFAULT_DEFENSE_POSITIONS),
    },
    ball: { x: 0.5, y: 0.35, attachedTo: null },
    timingGroups: [{ step: 1, duration: 1000, annotations: [] }],
  };
}

/** Re-number timing group steps starting from 1, sorted by original step order. */
function normalizeSteps(groups: TimingGroup[]): TimingGroup[] {
  return groups
    .sort((a, b) => a.step - b.step)
    .map((g, i) => ({ ...g, step: i + 1 }));
}

/** Apply an updater to a specific scene inside a play and return the new play object. */
function withUpdatedScene(play: Play, sceneId: string, updater: (s: Scene) => Scene): Play {
  return {
    ...play,
    updatedAt: new Date(),
    scenes: play.scenes.map((s) => (s.id === sceneId ? updater(s) : s)),
  };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useStore = create<AppStore>()(
  subscribeWithSelector((set, get) => ({
    // =======================================================================
    // Playbook list (issue #67 / #69)
    // =======================================================================

    plays: [],

    addPlay: (play) =>
      set((state) => ({ plays: [...state.plays, play] })),

    removePlay: (playId) =>
      set((state) => ({ plays: state.plays.filter((p) => p.id !== playId) })),

    updatePlayInList: (play) =>
      set((state) => ({
        plays: state.plays.map((p) => (p.id === play.id ? play : p)),
      })),

    getPlayById: (playId) => get().plays.find((p) => p.id === playId),

    // =======================================================================
    // Play data
    // =======================================================================

    currentPlay: null,

    setCurrentPlay: (play) => {
      useHistoryStore.getState().resetHistory();
      set({ currentPlay: play });
    },

    clearCurrentPlay: () => {
      useHistoryStore.getState().resetHistory();
      // Sync the current play state back to the plays list before clearing
      const current = get().currentPlay;
      set((state) => ({
        currentPlay: null,
        selectedSceneId: null,
        selectedAnnotationId: null,
        isPlaying: false,
        currentSceneIndex: 0,
        currentStep: 1,
        plays: current
          ? state.plays.map((p) => (p.id === current.id ? current : p))
          : state.plays,
      }));
    },

    // -----------------------------------------------------------------------
    // Undo / Redo (issue #83)
    // -----------------------------------------------------------------------

    undo: () =>
      set((state) => {
        const snapshot = captureSnapshot(state);
        if (!snapshot) return state;
        const previous = useHistoryStore.getState().undo(snapshot);
        if (!previous) return state;
        return {
          currentPlay: previous.play,
          selectedSceneId: previous.selectedSceneId,
          selectedAnnotationId: null,
        };
      }),

    redo: () =>
      set((state) => {
        const snapshot = captureSnapshot(state);
        if (!snapshot) return state;
        const next = useHistoryStore.getState().redo(snapshot);
        if (!next) return state;
        return {
          currentPlay: next.play,
          selectedSceneId: next.selectedSceneId,
          selectedAnnotationId: null,
        };
      }),

    updatePlayMeta: (patch) =>
      set((state) => {
        if (!state.currentPlay) return state;
        return { currentPlay: { ...state.currentPlay, ...patch, updatedAt: new Date() } };
      }),

    // -----------------------------------------------------------------------
    // Scene management
    // -----------------------------------------------------------------------

    addScene: () => {
      const state = get();
      const snapshot = captureSnapshot(state);
      if (snapshot) useHistoryStore.getState().pushSnapshot(snapshot);
      set((s) => {
        if (!s.currentPlay) return s;

        // Find the scene currently being edited to project positions from.
        const currentScene =
          s.currentPlay.scenes.find((sc) => sc.id === s.selectedSceneId) ??
          s.currentPlay.scenes[s.currentPlay.scenes.length - 1] ??
          null;

        const order = s.currentPlay.scenes.length;
        const newScene = createEmptyScene(order);

        if (currentScene) {
          // Start from the current scene's player positions and visibility.
          newScene.players = JSON.parse(JSON.stringify(currentScene.players)) as typeof newScene.players;

          // Collect every annotation in the current scene across all timing steps.
          const allAnnotations = currentScene.timingGroups.flatMap((g) => g.annotations);

          // Project player positions: movement / cut / dribble arrows tell us
          // where each player ends up, so start the new scene there.
          for (const ann of allAnnotations) {
            if (!ann.fromPlayer) continue;
            const { side, position } = ann.fromPlayer;
            const validSide = side as "offense" | "defense";
            if (ann.type === "movement" || ann.type === "cut" || ann.type === "dribble" || ann.type === "screen") {
              // ann.to is stored in normalised [0-1] coords — same space as PlayerState.x/y.
              newScene.players[validSide] = newScene.players[validSide].map((p) =>
                p.position === position ? { ...p, x: ann.to.x, y: ann.to.y } : p,
              );
            }
          }

          // Carry over ball state, then update if a pass annotation transferred it.
          newScene.ball = { ...currentScene.ball };

          // If the ball was attached to a player who moved, update its position too.
          if (newScene.ball.attachedTo) {
            const { side, position } = newScene.ball.attachedTo;
            const mover = newScene.players[side as "offense" | "defense"].find(
              (p) => p.position === position,
            );
            if (mover) newScene.ball = { ...newScene.ball, x: mover.x, y: mover.y };
          }

          // Update ball if a pass annotation transferred it to another player.
          for (const ann of allAnnotations) {
            if (ann.type === "pass" && ann.toPlayer) {
              const { side, position } = ann.toPlayer;
              const validSide = side as "offense" | "defense";
              // Use the receiver's position AFTER applying movement projections above.
              const player = newScene.players[validSide].find((p) => p.position === position);
              if (player) {
                newScene.ball = { x: player.x, y: player.y, attachedTo: { side: validSide, position } };
              }
            }
          }
        }

        return {
          currentPlay: {
            ...s.currentPlay,
            updatedAt: new Date(),
            scenes: [...s.currentPlay.scenes, newScene],
          },
          selectedSceneId: newScene.id,
          currentSceneIndex: order,
        };
      });
    },

    removeScene: (sceneId) => {
      const state = get();
      const snapshot = captureSnapshot(state);
      if (snapshot) useHistoryStore.getState().pushSnapshot(snapshot);
      set((s) => {
        const play = s.currentPlay;
        if (!play || play.scenes.length <= 1) return s;
        const filtered = play.scenes
          .filter((sc) => sc.id !== sceneId)
          .map((sc, i) => ({ ...sc, order: i }));
        const newSelectedId =
          s.selectedSceneId === sceneId
            ? (filtered[0]?.id ?? null)
            : s.selectedSceneId;
        const newSceneIndex = Math.min(s.currentSceneIndex, filtered.length - 1);
        return {
          currentPlay: { ...play, updatedAt: new Date(), scenes: filtered },
          selectedSceneId: newSelectedId,
          currentSceneIndex: newSceneIndex,
        };
      });
    },

    duplicateScene: (sceneId) => {
      const state = get();
      const snapshot = captureSnapshot(state);
      if (snapshot) useHistoryStore.getState().pushSnapshot(snapshot);
      set((s) => {
        const play = s.currentPlay;
        if (!play) return s;
        const idx = play.scenes.findIndex((sc) => sc.id === sceneId);
        if (idx === -1) return s;
        const original = play.scenes[idx];
        const copy: Scene = {
          ...JSON.parse(JSON.stringify(original)) as Scene,
          id: crypto.randomUUID(),
        };
        const scenes = [
          ...play.scenes.slice(0, idx + 1),
          copy,
          ...play.scenes.slice(idx + 1),
        ].map((sc, i) => ({ ...sc, order: i }));
        const copyIndex = scenes.findIndex((sc) => sc.id === copy.id);
        return {
          currentPlay: { ...play, updatedAt: new Date(), scenes },
          selectedSceneId: copy.id,
          currentSceneIndex: copyIndex !== -1 ? copyIndex : s.currentSceneIndex,
        };
      });
    },

    reorderScene: (sceneId, newOrder) => {
      const state = get();
      const snapshot = captureSnapshot(state);
      if (snapshot) useHistoryStore.getState().pushSnapshot(snapshot);
      set((s) => {
        const play = s.currentPlay;
        if (!play) return s;
        const scenes = [...play.scenes];
        const idx = scenes.findIndex((sc) => sc.id === sceneId);
        if (idx === -1) return s;
        const [moved] = scenes.splice(idx, 1);
        scenes.splice(newOrder, 0, moved);
        const reordered = scenes.map((sc, i) => ({ ...sc, order: i }));
        return { currentPlay: { ...play, updatedAt: new Date(), scenes: reordered } };
      });
    },

    updateSceneNote: (sceneId, note) => {
      const state = get();
      const snapshot = captureSnapshot(state);
      if (snapshot) useHistoryStore.getState().pushSnapshot(snapshot);
      set((s) => {
        if (!s.currentPlay) return s;
        return { currentPlay: withUpdatedScene(s.currentPlay, sceneId, (sc) => ({ ...sc, note })) };
      });
    },

    updatePlayerState: (sceneId, side, player) => {
      const state = get();
      const snapshot = captureSnapshot(state);
      if (snapshot) useHistoryStore.getState().pushSnapshot(snapshot);
      set((s) => {
        if (!s.currentPlay) return s;
        return {
          currentPlay: withUpdatedScene(s.currentPlay, sceneId, (sc) => ({
            ...sc,
            players: {
              ...sc.players,
              [side]: sc.players[side].map((p) =>
                p.position === player.position ? player : p,
              ),
            },
          })),
        };
      });
    },

    updateBallState: (sceneId, ball) => {
      const state = get();
      const snapshot = captureSnapshot(state);
      if (snapshot) useHistoryStore.getState().pushSnapshot(snapshot);
      set((s) => {
        if (!s.currentPlay) return s;
        return {
          currentPlay: withUpdatedScene(s.currentPlay, sceneId, (sc) => ({ ...sc, ball })),
        };
      });
    },

    // -----------------------------------------------------------------------
    // Timing groups and annotations
    // -----------------------------------------------------------------------

    addAnnotation: (sceneId, timingStep, annotation) => {
      const state = get();
      const snapshot = captureSnapshot(state);
      if (snapshot) useHistoryStore.getState().pushSnapshot(snapshot);
      set((s) => {
        if (!s.currentPlay) return s;
        return {
          currentPlay: withUpdatedScene(s.currentPlay, sceneId, (sc) => {
            const existingGroup = sc.timingGroups.find((g) => g.step === timingStep);
            const timingGroups: TimingGroup[] = existingGroup
              ? sc.timingGroups.map((g) =>
                  g.step === timingStep
                    ? { ...g, annotations: [...g.annotations, annotation] }
                    : g,
                )
              : [
                  ...sc.timingGroups,
                  { step: timingStep, duration: 1000, annotations: [annotation] },
                ];
            return { ...sc, timingGroups: normalizeSteps(timingGroups) };
          }),
        };
      });
    },

    removeAnnotation: (sceneId, annotationId) => {
      const state = get();
      const snapshot = captureSnapshot(state);
      if (snapshot) useHistoryStore.getState().pushSnapshot(snapshot);
      set((s) => {
        if (!s.currentPlay) return s;
        const currentSelectedAnnotation = s.selectedAnnotationId;
        return {
          currentPlay: withUpdatedScene(s.currentPlay, sceneId, (sc) => ({
            ...sc,
            timingGroups: sc.timingGroups
              .map((g) => ({
                ...g,
                annotations: g.annotations.filter((a) => a.id !== annotationId),
              }))
              // Keep step 1 even if empty so there's always at least one step
              .filter((g) => g.annotations.length > 0 || g.step === 1),
          })),
          selectedAnnotationId:
            currentSelectedAnnotation === annotationId ? null : currentSelectedAnnotation,
        };
      });
    },

    moveAnnotationToStep: (sceneId, annotationId, newStep) => {
      const state = get();
      const snapshot = captureSnapshot(state);
      if (snapshot) useHistoryStore.getState().pushSnapshot(snapshot);
      set((s) => {
        if (!s.currentPlay) return s;
        return {
          currentPlay: withUpdatedScene(s.currentPlay, sceneId, (sc) => {
            let moved: Annotation | null = null;
            const stripped: TimingGroup[] = sc.timingGroups.map((g) => ({
              ...g,
              annotations: g.annotations.filter((a) => {
                if (a.id === annotationId) {
                  moved = a;
                  return false;
                }
                return true;
              }),
            }));
            if (!moved) return sc;
            const target = stripped.find((g) => g.step === newStep);
            const timingGroups: TimingGroup[] = target
              ? stripped.map((g) =>
                  g.step === newStep
                    ? { ...g, annotations: [...g.annotations, moved as Annotation] }
                    : g,
                )
              : [...stripped, { step: newStep, duration: 1000, annotations: [moved as Annotation] }];
            return {
              ...sc,
              timingGroups: normalizeSteps(
                timingGroups.filter((g) => g.annotations.length > 0 || g.step === 1),
              ),
            };
          }),
        };
      });
    },

    addTimingStep: (sceneId) => {
      const state = get();
      const snapshot = captureSnapshot(state);
      if (snapshot) useHistoryStore.getState().pushSnapshot(snapshot);
      set((s) => {
        if (!s.currentPlay) return s;
        return {
          currentPlay: withUpdatedScene(s.currentPlay, sceneId, (sc) => {
            const maxStep = sc.timingGroups.reduce((m, g) => Math.max(m, g.step), 0);
            return {
              ...sc,
              timingGroups: [
                ...sc.timingGroups,
                { step: maxStep + 1, duration: 1000, annotations: [] },
              ],
            };
          }),
        };
      });
    },

    removeTimingStep: (sceneId, step) => {
      const state = get();
      const snapshot = captureSnapshot(state);
      if (snapshot) useHistoryStore.getState().pushSnapshot(snapshot);
      set((s) => {
        if (!s.currentPlay) return s;
        const currentSelectedStep = s.selectedTimingStep;
        return {
          currentPlay: withUpdatedScene(s.currentPlay, sceneId, (sc) => {
            if (sc.timingGroups.length <= 1) return sc;
            const filtered = sc.timingGroups.filter((g) => g.step !== step);
            return { ...sc, timingGroups: normalizeSteps(filtered) };
          }),
          selectedTimingStep: currentSelectedStep === step ? 1 : currentSelectedStep,
        };
      });
    },

    // =======================================================================
    // Editor state
    // =======================================================================

    selectedSceneId: null,
    selectedTool: "select",
    selectedTimingStep: 1,
    selectedAnnotationId: null,
    playerDisplayMode: "numbers",

    setSelectedSceneId: (id) => set({ selectedSceneId: id, selectedAnnotationId: null }),
    setSelectedTool: (tool) => set({ selectedTool: tool }),
    setSelectedTimingStep: (step) => set({ selectedTimingStep: step }),
    setSelectedAnnotationId: (id) => set({ selectedAnnotationId: id }),
    setPlayerDisplayMode: (mode) => set({ playerDisplayMode: mode }),

    playerNames: {},
    setPlayerName: (key, name) =>
      set((state) => ({ playerNames: { ...state.playerNames, [key]: name } })),

    togglePlayerVisibility: (sceneId, side, position) => {
      const state = get();
      const snapshot = captureSnapshot(state);
      if (snapshot) useHistoryStore.getState().pushSnapshot(snapshot);
      set((s) => {
        if (!s.currentPlay) return s;
        return {
          currentPlay: withUpdatedScene(s.currentPlay, sceneId, (sc) => ({
            ...sc,
            players: {
              ...sc.players,
              [side]: sc.players[side].map((p) =>
                p.position === position ? { ...p, visible: !p.visible } : p,
              ),
            },
          })),
        };
      });
    },

    // =======================================================================
    // Playback state
    // =======================================================================

    isPlaying: false,
    currentSceneIndex: 0,
    currentStep: 1,
    speed: 1,
    loop: false,

    startPlayback: () => set({ isPlaying: true }),
    pausePlayback: () => set({ isPlaying: false }),
    togglePlayback: () => set((state) => ({ isPlaying: !state.isPlaying })),

    stepForward: () =>
      set((state) => {
        const scenes = state.currentPlay?.scenes ?? [];
        const nextIndex = state.currentSceneIndex + 1;
        if (nextIndex < scenes.length) {
          return {
            currentSceneIndex: nextIndex,
            currentStep: 1,
            isPlaying: false,
            selectedSceneId: scenes[nextIndex]?.id ?? state.selectedSceneId,
          };
        }
        if (state.loop) {
          return {
            currentSceneIndex: 0,
            currentStep: 1,
            selectedSceneId: scenes[0]?.id ?? state.selectedSceneId,
          };
        }
        return { isPlaying: false };
      }),

    stepBack: () =>
      set((state) => {
        const scenes = state.currentPlay?.scenes ?? [];
        if (state.currentSceneIndex > 0) {
          const prevIndex = state.currentSceneIndex - 1;
          return {
            currentSceneIndex: prevIndex,
            currentStep: 1,
            isPlaying: false,
            selectedSceneId: scenes[prevIndex]?.id ?? state.selectedSceneId,
          };
        }
        return { isPlaying: false };
      }),

    setCurrentSceneIndex: (index) =>
      set((state) => ({
        currentSceneIndex: index,
        currentStep: 1,
        isPlaying: false,
        selectedSceneId: state.currentPlay?.scenes[index]?.id ?? state.selectedSceneId,
      })),

    setCurrentStep: (step) => set({ currentStep: step }),
    setSpeed: (speed) => set({ speed }),
    setLoop: (loop) => set({ loop }),

    resetPlayback: () =>
      set({ isPlaying: false, currentSceneIndex: 0, currentStep: 1 }),
  })),
);

// ---------------------------------------------------------------------------
// Convenience selectors (memoization-friendly: accept store state, no closures)
// ---------------------------------------------------------------------------

export const selectCurrentPlay = (s: AppStore): Play | null => s.currentPlay;

export const selectEditorScene = (s: AppStore): Scene | null => {
  if (!s.currentPlay) return null;
  return (
    s.currentPlay.scenes.find((sc) => sc.id === s.selectedSceneId) ??
    s.currentPlay.scenes[0] ??
    null
  );
};

export const selectPlaybackScene = (s: AppStore): Scene | null => {
  if (!s.currentPlay) return null;
  return s.currentPlay.scenes[s.currentSceneIndex] ?? null;
};

export const selectSceneCount = (s: AppStore): number => s.currentPlay?.scenes.length ?? 0;

export const selectAnnotationsForStep = (scene: Scene | null, step: number): Annotation[] => {
  if (!scene) return [];
  return scene.timingGroups.find((g) => g.step === step)?.annotations ?? [];
};

export const selectAllAnnotations = (scene: Scene | null): Annotation[] => {
  if (!scene) return [];
  return scene.timingGroups.flatMap((g) => g.annotations);
};

export const selectTimingStepCount = (scene: Scene | null): number =>
  scene?.timingGroups.length ?? 1;

// ---------------------------------------------------------------------------
// Factory helpers — exported so the UI can bootstrap a blank play
// ---------------------------------------------------------------------------

export { createEmptyScene };

export function createDefaultPlay(): Play {
  const now = new Date();
  return {
    id: crypto.randomUUID(),
    teamId: "",
    title: "Untitled Play",
    description: "",
    category: "offense" as Category,
    tags: [],
    courtType: "half" as CourtType,
    createdBy: "",
    createdAt: now,
    updatedAt: now,
    scenes: [createEmptyScene(0)],
  };
}
