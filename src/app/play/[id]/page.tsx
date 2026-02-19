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

interface PlayEditorPageProps {
  params: { id: string };
}

export default function PlayEditorPage({ params }: PlayEditorPageProps) {
  return (
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

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="flex min-w-0 items-center justify-between border-b border-gray-200 px-3 py-2 md:px-4">
        <h1 className="truncate text-base font-semibold text-gray-900 md:text-lg">
          {/* Shorter label on mobile to avoid overflow */}
          <span className="hidden sm:inline">Play Editor — </span>
          <span className="font-mono text-gray-500">{params.id}</span>
        </h1>

        {/* Action buttons — hidden on mobile (viewer-only) */}
        <div className="hidden items-center gap-2 md:flex">
          {/* Undo / Redo buttons (issue #83) */}
          <UndoRedoButtons />
          <div className="mx-1 h-5 w-px bg-gray-200" aria-hidden="true" />
          <button
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            title="Save (Ctrl+S)"
          >
            Save
          </button>
          <ExportMenu />
          <button className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Share
          </button>
          <ShortcutsButton />
        </div>
      </header>

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
        <div className="flex flex-1 items-center justify-center overflow-auto bg-gray-100 p-2 md:p-4">
          <EditorCourtArea />
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
  );
}
