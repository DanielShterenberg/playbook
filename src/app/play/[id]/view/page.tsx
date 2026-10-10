interface PlayViewPageProps {
  params: { id: string };
}

export default function PlayViewPage({ params }: PlayViewPageProps) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-app p-8 text-ink">
      <h1 className="mb-4 font-display text-2xl font-semibold tracking-[0.02em] text-ink">Viewing Play</h1>
      <p className="text-muted">Play ID: {params.id}</p>
      <p className="mt-2 text-muted">Read-only view for shared play links.</p>
    </main>
  );
}
