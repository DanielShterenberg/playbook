// Zustand store for global application state.
// Implements issue #48: editor, playback, and play slice management.

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

// ---------------------------------------------------------------------------
// Store state interface — flat, no slice intersection conflicts
// ---------------------------------------------------------------------------

export interface AppStore {
  // ------- Play data -------
  currentPlay: Play | null;

  setCurrentPlay: (play: Play) => void;
  clearCurrentPlay: () => void;
  updatePlayMeta: (
    patch: Partial<Pick<Play, "title" | "description" | "category" | "tags" | "courtType">>,
  ) => void;

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

  setSelectedSceneId: (id: string | null) => void;
  setSelectedTool: (tool: DrawingTool) => void;
  setSelectedTimingStep: (step: number) => void;
  setSelectedAnnotationId: (id: string | null) => void;

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
// Internal helpers
// ---------------------------------------------------------------------------

function createEmptyScene(order: number): Scene {
  const defaultPlayers = (count: number): PlayerState[] =>
    Array.from({ length: count }, (_, i) => ({
      position: i + 1,
      x: 0.5,
      y: 0.5,
      visible: true,
    }));

  return {
    id: crypto.randomUUID(),
    order,
    duration: 2000,
    note: "",
    players: {
      offense: defaultPlayers(5),
      defense: defaultPlayers(5),
    },
    ball: { x: 0.5, y: 0.5, attachedTo: null },
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
  subscribeWithSelector((set) => ({
    // =======================================================================
    // Play data
    // =======================================================================

    currentPlay: null,

    setCurrentPlay: (play) => set({ currentPlay: play }),

    clearCurrentPlay: () =>
      set({
        currentPlay: null,
        selectedSceneId: null,
        selectedAnnotationId: null,
        isPlaying: false,
        currentSceneIndex: 0,
        currentStep: 1,
      }),

    updatePlayMeta: (patch) =>
      set((state) => {
        if (!state.currentPlay) return state;
        return { currentPlay: { ...state.currentPlay, ...patch, updatedAt: new Date() } };
      }),

    // -----------------------------------------------------------------------
    // Scene management
    // -----------------------------------------------------------------------

    addScene: () =>
      set((state) => {
        if (!state.currentPlay) return state;
        const order = state.currentPlay.scenes.length;
        const newScene = createEmptyScene(order);
        return {
          currentPlay: {
            ...state.currentPlay,
            updatedAt: new Date(),
            scenes: [...state.currentPlay.scenes, newScene],
          },
          selectedSceneId: newScene.id,
        };
      }),

    removeScene: (sceneId) =>
      set((state) => {
        const play = state.currentPlay;
        if (!play || play.scenes.length <= 1) return state;
        const filtered = play.scenes
          .filter((s) => s.id !== sceneId)
          .map((s, i) => ({ ...s, order: i }));
        const newSelectedId =
          state.selectedSceneId === sceneId
            ? (filtered[0]?.id ?? null)
            : state.selectedSceneId;
        const newSceneIndex = Math.min(state.currentSceneIndex, filtered.length - 1);
        return {
          currentPlay: { ...play, updatedAt: new Date(), scenes: filtered },
          selectedSceneId: newSelectedId,
          currentSceneIndex: newSceneIndex,
        };
      }),

    duplicateScene: (sceneId) =>
      set((state) => {
        const play = state.currentPlay;
        if (!play) return state;
        const idx = play.scenes.findIndex((s) => s.id === sceneId);
        if (idx === -1) return state;
        const original = play.scenes[idx];
        const copy: Scene = {
          ...JSON.parse(JSON.stringify(original)) as Scene,
          id: crypto.randomUUID(),
        };
        const scenes = [
          ...play.scenes.slice(0, idx + 1),
          copy,
          ...play.scenes.slice(idx + 1),
        ].map((s, i) => ({ ...s, order: i }));
        return {
          currentPlay: { ...play, updatedAt: new Date(), scenes },
          selectedSceneId: copy.id,
        };
      }),

    reorderScene: (sceneId, newOrder) =>
      set((state) => {
        const play = state.currentPlay;
        if (!play) return state;
        const scenes = [...play.scenes];
        const idx = scenes.findIndex((s) => s.id === sceneId);
        if (idx === -1) return state;
        const [moved] = scenes.splice(idx, 1);
        scenes.splice(newOrder, 0, moved);
        const reordered = scenes.map((s, i) => ({ ...s, order: i }));
        return { currentPlay: { ...play, updatedAt: new Date(), scenes: reordered } };
      }),

    updateSceneNote: (sceneId, note) =>
      set((state) => {
        if (!state.currentPlay) return state;
        return { currentPlay: withUpdatedScene(state.currentPlay, sceneId, (s) => ({ ...s, note })) };
      }),

    updatePlayerState: (sceneId, side, player) =>
      set((state) => {
        if (!state.currentPlay) return state;
        return {
          currentPlay: withUpdatedScene(state.currentPlay, sceneId, (s) => ({
            ...s,
            players: {
              ...s.players,
              [side]: s.players[side].map((p) =>
                p.position === player.position ? player : p,
              ),
            },
          })),
        };
      }),

    updateBallState: (sceneId, ball) =>
      set((state) => {
        if (!state.currentPlay) return state;
        return {
          currentPlay: withUpdatedScene(state.currentPlay, sceneId, (s) => ({ ...s, ball })),
        };
      }),

    // -----------------------------------------------------------------------
    // Timing groups and annotations
    // -----------------------------------------------------------------------

    addAnnotation: (sceneId, timingStep, annotation) =>
      set((state) => {
        if (!state.currentPlay) return state;
        return {
          currentPlay: withUpdatedScene(state.currentPlay, sceneId, (s) => {
            const existingGroup = s.timingGroups.find((g) => g.step === timingStep);
            const timingGroups: TimingGroup[] = existingGroup
              ? s.timingGroups.map((g) =>
                  g.step === timingStep
                    ? { ...g, annotations: [...g.annotations, annotation] }
                    : g,
                )
              : [
                  ...s.timingGroups,
                  { step: timingStep, duration: 1000, annotations: [annotation] },
                ];
            return { ...s, timingGroups: normalizeSteps(timingGroups) };
          }),
        };
      }),

    removeAnnotation: (sceneId, annotationId) =>
      set((state) => {
        if (!state.currentPlay) return state;
        const currentSelectedAnnotation = state.selectedAnnotationId;
        return {
          currentPlay: withUpdatedScene(state.currentPlay, sceneId, (s) => ({
            ...s,
            timingGroups: s.timingGroups
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
      }),

    moveAnnotationToStep: (sceneId, annotationId, newStep) =>
      set((state) => {
        if (!state.currentPlay) return state;
        return {
          currentPlay: withUpdatedScene(state.currentPlay, sceneId, (s) => {
            let moved: Annotation | null = null;
            const stripped: TimingGroup[] = s.timingGroups.map((g) => ({
              ...g,
              annotations: g.annotations.filter((a) => {
                if (a.id === annotationId) {
                  moved = a;
                  return false;
                }
                return true;
              }),
            }));
            if (!moved) return s;
            const target = stripped.find((g) => g.step === newStep);
            const timingGroups: TimingGroup[] = target
              ? stripped.map((g) =>
                  g.step === newStep
                    ? { ...g, annotations: [...g.annotations, moved as Annotation] }
                    : g,
                )
              : [...stripped, { step: newStep, duration: 1000, annotations: [moved as Annotation] }];
            return {
              ...s,
              timingGroups: normalizeSteps(
                timingGroups.filter((g) => g.annotations.length > 0 || g.step === 1),
              ),
            };
          }),
        };
      }),

    addTimingStep: (sceneId) =>
      set((state) => {
        if (!state.currentPlay) return state;
        return {
          currentPlay: withUpdatedScene(state.currentPlay, sceneId, (s) => {
            const maxStep = s.timingGroups.reduce((m, g) => Math.max(m, g.step), 0);
            return {
              ...s,
              timingGroups: [
                ...s.timingGroups,
                { step: maxStep + 1, duration: 1000, annotations: [] },
              ],
            };
          }),
        };
      }),

    removeTimingStep: (sceneId, step) =>
      set((state) => {
        if (!state.currentPlay) return state;
        const currentSelectedStep = state.selectedTimingStep;
        return {
          currentPlay: withUpdatedScene(state.currentPlay, sceneId, (s) => {
            if (s.timingGroups.length <= 1) return s;
            const filtered = s.timingGroups.filter((g) => g.step !== step);
            return { ...s, timingGroups: normalizeSteps(filtered) };
          }),
          selectedTimingStep: currentSelectedStep === step ? 1 : currentSelectedStep,
        };
      }),

    // =======================================================================
    // Editor state
    // =======================================================================

    selectedSceneId: null,
    selectedTool: "select",
    selectedTimingStep: 1,
    selectedAnnotationId: null,

    setSelectedSceneId: (id) => set({ selectedSceneId: id, selectedAnnotationId: null }),
    setSelectedTool: (tool) => set({ selectedTool: tool }),
    setSelectedTimingStep: (step) => set({ selectedTimingStep: step }),
    setSelectedAnnotationId: (id) => set({ selectedAnnotationId: id }),

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
          return { currentSceneIndex: nextIndex, currentStep: 1, isPlaying: false };
        }
        if (state.loop) {
          return { currentSceneIndex: 0, currentStep: 1 };
        }
        return { isPlaying: false };
      }),

    stepBack: () =>
      set((state) => {
        if (state.currentSceneIndex > 0) {
          return {
            currentSceneIndex: state.currentSceneIndex - 1,
            currentStep: 1,
            isPlaying: false,
          };
        }
        return { isPlaying: false };
      }),

    setCurrentSceneIndex: (index) =>
      set({ currentSceneIndex: index, currentStep: 1, isPlaying: false }),

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
