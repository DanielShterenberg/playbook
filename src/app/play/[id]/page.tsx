import EditorAuthGate from "./EditorAuthGate";
import EditorCourtArea from "./EditorCourtArea";
import DrawingToolsPanel from "@/components/editor/DrawingToolsPanel";
import PlayerRosterPanel from "@/components/editor/PlayerRosterPanel";
import SceneStrip from "@/components/editor/SceneStrip";
import PlaybackControls from "@/components/editor/PlaybackControls";
import TimingStripPanel from "@/components/editor/TimingStripPanel";
import EditorKeyboardManager from "@/components/editor/EditorKeyboardManager";
import MobileViewerBanner from "@/components/editor/MobileViewerBanner";
import EditorHeader from "./EditorHeader";
import PlaybackEngine from "./PlaybackEngine";
import EditorCoachMark from "@/components/editor/EditorCoachMark";

interface PlayEditorPageProps {
  params: { id: string };
}

export default function PlayEditorPage({ params }: PlayEditorPageProps) {
  return (
    <EditorAuthGate>
    <main className="flex h-screen flex-col overflow-hidden bg-app text-sm text-ink supports-[height:100dvh]:h-[100dvh]">
      {/*
       * Centralised keyboard shortcut handler (issue #82).
       * Manages tool switching, playback, scene nav, Ctrl+S, undo/redo stubs,
       * Delete, and the ? shortcuts overlay. Renders the overlay when active.
       */}
      <EditorKeyboardManager />

      {/* The single playback timer (issue #160) — drives both the playback bar and presentation mode. */}
      <PlaybackEngine />

      {/*
       * Header — logo / back, play title + save state, and every play-level
       * action (theme, undo / redo, comments, share, present, export …).
       */}
      <EditorHeader playId={params.id} />

      {/*
       * Mobile viewer-only banner (<768px).
       * On small screens editing is disabled; a banner explains this and
       * the full controls are hidden. Playback controls remain accessible.
       */}
      <MobileViewerBanner />

      {/* ── Main editor area: tool rail / court + playback / roster ─────── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/*
         * Tool rail — visible on md+ (tablet/desktop), collapsible via
         * DrawingToolsPanel's own toggle. On mobile it is entirely hidden.
         */}
        <div className="hidden md:flex">
          <DrawingToolsPanel />
        </div>

        {/* Court, with the playback row under it */}
        <section
          className="flex min-w-0 flex-1 flex-col items-center md:gap-3.5 md:p-4 xl:p-6"
          aria-label="Court and playback"
        >
          {/* The court slot is what EditorCourtArea measures — playback stays outside it */}
          <div className="flex min-h-0 w-full flex-1 overflow-hidden p-2.5 md:p-0">
            <EditorCourtArea playId={params.id} />
          </div>

          {/* Playback controls — always visible (condensed on mobile) */}
          <PlaybackControls />
        </section>

        {/*
         * Player roster panel — visible on lg+ (wide desktop), collapsible via
         * the panel's own toggle. Below lg it is hidden entirely.
         */}
        <div className="hidden lg:flex">
          <PlayerRosterPanel />
        </div>
      </div>

      {/* First-use coach mark — explains scenes vs. steps (hidden on mobile) */}
      <div className="hidden md:block">
        <EditorCoachMark />
      </div>

      {/* ── Bottom strip: scenes, with the selected scene's steps beside it ── */}
      <footer className="flex flex-none flex-col border-t border-line bg-surface lg:flex-row">
        <SceneStrip />
        {/* Timing steps strip — hidden on mobile */}
        <div className="hidden min-w-0 border-t border-line md:flex lg:max-w-[42%] lg:border-l lg:border-t-0">
          <TimingStripPanel />
        </div>
      </footer>
    </main>
    </EditorAuthGate>
  );
}
