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
        <aside className="w-16 border-r border-gray-200 bg-gray-50 flex flex-col items-center py-4 gap-3">
          <div className="text-xs text-gray-400">Tools</div>
        </aside>
        {/* Court Canvas */}
        <div className="flex-1 bg-gray-100 flex items-center justify-center">
          <p className="text-gray-400">Court canvas coming soon</p>
        </div>
        {/* Play Info Panel */}
        <aside className="w-64 border-l border-gray-200 bg-white p-4">
          <h2 className="font-semibold text-gray-700 mb-2">Play Info</h2>
          <p className="text-sm text-gray-400">Play details and notes will appear here.</p>
        </aside>
      </div>
      {/* Scene Strip */}
      <footer className="border-t border-gray-200 bg-white p-2">
        <p className="text-sm text-gray-400 text-center">Scene strip coming soon</p>
      </footer>
    </main>
  );
}
