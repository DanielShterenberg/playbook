export default function PlaybookPage() {
  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Team Playbook</h1>
          <button className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
            + New Play
          </button>
        </div>
        <p className="text-gray-500">Your plays will appear here.</p>
      </div>
    </main>
  );
}
