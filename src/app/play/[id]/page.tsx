import Court from "@/components/court/Court";

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
        <aside className="flex w-16 flex-col items-center gap-3 border-r border-gray-200 bg-gray-50 py-4">
          <div className="text-xs text-gray-400">Tools</div>
        </aside>
        {/* Court Canvas */}
        <div className="flex flex-1 items-center justify-center overflow-auto bg-gray-100 p-4">
          <Court className="w-full max-w-3xl" />
        </div>
        {/* Play Info Panel */}
        <aside className="w-64 border-l border-gray-200 bg-white p-4">
          <h2 className="mb-2 font-semibold text-gray-700">Play Info</h2>
          <p className="text-sm text-gray-400">Play details and notes will appear here.</p>
        </aside>
      </div>
      {/* Scene Strip */}
      <footer className="border-t border-gray-200 bg-white p-2">
        <p className="text-center text-sm text-gray-400">Scene strip coming soon</p>
      </footer>
    </main>
  );
}
