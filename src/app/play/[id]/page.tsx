import EditorAuthGate from "./EditorAuthGate";
import EditorCourtArea from "./EditorCourtArea";
import DrawingToolsPanel from "@/components/editor/DrawingToolsPanel";
import PlayerRosterPanel from "@/components/editor/PlayerRosterPanel";
import SceneStrip from "@/components/editor/SceneStrip";
import PlaybackControls from "@/components/editor/PlaybackControls";
import TimingStripPanel from "@/components/editor/TimingStripPanel";
import EditorKeyboardManager from "@/components/editor/EditorKeyboardManager";
import ShortcutsButton from "@/components/editor/ShortcutsButton";
import UndoRedoButtons from "@/components/editor/UndoRedoButtons";
import ExportMenu from "@/components/editor/ExportMenu";
import MobileViewerBanner from "@/components/editor/MobileViewerBanner";
import EditorHeader from "./EditorHeader";
import SaveIndicator from "@/components/editor/SaveIndicator";

interface PlayEditorPageProps {
  params: { id: string };
}

export default function PlayEditorPage({ params }: PlayEditorPageProps) {
  return (
    <EditorAuthGate>
    <main className="flex h-screen flex-col overflow-hidden">
      {/*
       * Centralised keyboard shortcut handler (issue #82).
       * Manages tool switching, playback, scene nav, Ctrl+S, undo/redo stubs,
       * Delete, and the ? shortcuts overlay. Renders the overlay when active.
       */}
      <EditorKeyboardManager />

      {/*
       * Mobile viewer-only banner (<768px).
       * On small screens editing is disabled; a banner explains this and
       * the full controls are hidden. Playback controls remain accessible.
       */}
      <MobileViewerBanner />

      {/* ── Header — client component so it can show play title from store ── */}
      <EditorHeader playId={params.id}>
        {/* Action buttons — hidden on mobile (viewer-only) */}
        <div className="hidden items-center gap-2 md:flex">
          {/* Undo / Redo buttons (issue #83) */}
          <UndoRedoButtons />
          <div className="mx-1 h-5 w-px bg-gray-200" aria-hidden="true" />
          {/* Auto-save indicator (issue #68) */}
          <SaveIndicator />
          <button
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            title="Save (Ctrl+S)"
          >
            Save
          </button>
          <ExportMenu />
          <ShortcutsButton />
        </div>
      </EditorHeader>

      {/* ── Main editor area ────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/*
         * Tools panel — visible on md+ (tablet/desktop).
         * On tablet (md–lg) the panel is collapsible via DrawingToolsPanel's
         * internal toggle. On mobile it is entirely hidden.
         */}
        <div className="hidden md:flex">
          <DrawingToolsPanel />
        </div>

        {/* Court canvas — fills the remaining space */}
        <div className="flex flex-1 overflow-hidden bg-gray-100 p-0 md:p-4">
          <EditorCourtArea playId={params.id} />
        </div>

        {/*
         * Player roster panel — visible on lg+ (wide desktop).
         * On tablet it collapses into the panel's own toggle (rendered inside
         * PlayerRosterPanel). On mobile it is hidden entirely.
         */}
        <div className="hidden lg:flex">
          <PlayerRosterPanel />
        </div>
      </div>

      {/* ── Bottom panels — hidden on mobile ───────────────────────────── */}
      <div className="hidden md:block">
        {/* Timing steps strip */}
        <TimingStripPanel />
      </div>

      {/* Playback controls — always visible (condensed on mobile) */}
      <PlaybackControls />

      {/* Scene Strip — hidden on mobile */}
      <div className="hidden md:block">
        <SceneStrip />
      </div>
    </main>
    </EditorAuthGate>
  );
}
