"use client";

/**
 * AdminPlayPage — any play, read-only, for the app owner (from /admin).
 *
 * The share viewer, loading the play itself instead of a share link. The
 * editor is not used: it would show edit tools the rules refuse.
 */

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import PlayViewer from "@/components/viewer/PlayViewer";
import Logo from "@/components/brand/Logo";
import ThemeToggle from "@/components/brand/ThemeToggle";
import { RingSpinner } from "@/components/brand/Spinner";
import { isAppOwner } from "@/lib/admin";
import { loadPlay } from "@/lib/db";
import { loadTeam } from "@/lib/team";
import { FOCUS_RING } from "@/lib/uiClasses";

async function loadForOwner(id: string) {
  const play = await loadPlay(id);
  if (!play) return null;
  const team = play.teamId ? await loadTeam(play.teamId).catch(() => null) : null;
  return { play, teamName: team?.name ?? null };
}

export default function AdminPlayPage({ params }: { params: { id: string } }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const owner = isAppOwner(user);

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace(`/sign-in?redirect=/admin/play/${params.id}`);
    else if (!owner) router.replace("/playbook");
  }, [user, loading, owner, router, params.id]);

  if (loading || !owner) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-app text-muted">
        <RingSpinner />
      </main>
    );
  }

  const header = (
    <header className="flex items-center gap-4 border-b border-line bg-surface px-4 py-2.5 sm:px-6">
      <div className="flex flex-1 items-center">
        <Logo size={34} />
      </div>
      <ThemeToggle />
      <Link
        href="/admin"
        className={`flex h-11 flex-none items-center rounded-lg border border-line px-4 text-sm font-medium text-ink no-underline transition-colors hover:bg-app ${FOCUS_RING}`}
      >
        ← Admin
      </Link>
    </header>
  );

  return (
    <PlayViewer
      loadKey={params.id}
      load={() => loadForOwner(params.id)}
      header={header}
      notFoundText="This play was deleted, or it could not be loaded."
    />
  );
}
