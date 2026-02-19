import EditorCourtArea from "./EditorCourtArea";
import DrawingToolsPanel from "@/components/editor/DrawingToolsPanel";
import SceneStrip from "@/components/editor/SceneStrip";
import PlaybackControls from "@/components/editor/PlaybackControls";
import TimingStripPanel from "@/components/editor/TimingStripPanel";

interface PlayEditorPageProps {
  params: { id: string };
}

export default function PlayEditorPage({ params }: PlayEditorPageProps) {
  return (
    <main className="flex h-screen flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
        <h1 className="text-lg font-semibold text-gray-900">Play Editor — {params.id}</h1>
        <div className="flex gap-2">
          <button className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Save
          </button>
          <button className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Export
          </button>
          <button className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Share
          </button>
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        {/* Tools Panel */}
        <DrawingToolsPanel />
        {/* Court Canvas with draggable players */}
        <div className="flex flex-1 items-center justify-center overflow-auto bg-gray-100 p-4">
          <EditorCourtArea />
        </div>
        {/* Play Info Panel */}
        <aside className="w-64 border-l border-gray-200 bg-white p-4">
          <h2 className="mb-2 font-semibold text-gray-700">Play Info</h2>
          <p className="text-sm text-gray-400">Play details and notes will appear here.</p>
        </aside>
      </div>
      {/* Timing steps strip */}
      <TimingStripPanel />
      {/* Playback controls */}
      <PlaybackControls />
      {/* Scene Strip */}
      <SceneStrip />
    </main>
  );
}
