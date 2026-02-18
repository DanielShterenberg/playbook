export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold tracking-tight text-gray-900">
          Basketball Playbook
        </h1>
        <p className="mb-8 text-lg text-gray-600">
          Diagram plays, animate transitions, and share with your team.
        </p>
        <div className="flex gap-4 justify-center">
          <a
            href="/playbook"
            className="rounded-md bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            Open Playbook
          </a>
        </div>
      </div>
    </main>
  );
}
