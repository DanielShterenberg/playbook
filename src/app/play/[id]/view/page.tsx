interface PlayViewPageProps {
  params: { id: string };
}

export default function PlayViewPage({ params }: PlayViewPageProps) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">Viewing Play</h1>
      <p className="text-gray-500">Play ID: {params.id}</p>
      <p className="text-gray-400 mt-2">Read-only view for shared play links.</p>
    </main>
  );
}
