"use client";

/**
 * JoinTeamPage — handles invite link redemption.
 *
 * Implements issue #75: invite link → join team with viewer role.
 *
 * URL: /join/[inviteCode]
 *
 * Flow:
 *   1. If not signed in, redirect to /sign-in?redirect=<current url>
 *   2. Call joinTeamByInviteCode
 *   3. Redirect to /playbook
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/contexts/TeamContext";
import { joinTeamByInviteCode } from "@/lib/team";
import Logo from "@/components/brand/Logo";
import ThemeToggle from "@/components/brand/ThemeToggle";

interface JoinTeamPageProps {
  params: { inviteCode: string };
}

const PAGE = "relative flex min-h-screen flex-col items-center justify-center bg-app px-4 py-6 text-ink";

/** Themed full-page status line with a spinner (auth resolving / joining). */
function JoinStatus({ label }: { label: string }) {
  return (
    <main className={PAGE}>
      <ThemeToggle className="absolute right-4 top-4" />
      <div role="status" className="flex items-center gap-2.5 text-[15px] text-muted">
        <svg width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden="true" className="animate-spin">
          <circle
            cx={12}
            cy={12}
            r={10}
            stroke="currentColor"
            strokeWidth={3}
            strokeDasharray="31 31"
            strokeLinecap="round"
          />
        </svg>
        {label}
      </div>
    </main>
  );
}

export default function JoinTeamPage({ params }: JoinTeamPageProps) {
  const { inviteCode } = params;
  const { user, loading: authLoading } = useAuth();
  const { refresh } = useTeam();
  const router = useRouter();

  const [status, setStatus] = useState<"idle" | "joining" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  // Redirect to sign-in if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace(`/sign-in?redirect=/join/${inviteCode}`);
    }
  }, [user, authLoading, router, inviteCode]);

  // Auto-join once auth is ready
  useEffect(() => {
    if (authLoading || !user || status !== "idle") return;
    setStatus("joining");

    joinTeamByInviteCode(inviteCode, user.uid)
      .then(() => {
        refresh();
        router.replace("/playbook");
      })
      .catch((err: Error) => {
        setStatus("error");
        setErrorMsg(err.message ?? "Failed to join team.");
      });
  }, [user, authLoading, inviteCode, status, refresh, router]);

  // Auth resolving, or about to redirect to sign-in
  if (authLoading || !user) return <JoinStatus label="Loading…" />;

  if (status === "error") {
    return (
      <main className={PAGE}>
      <ThemeToggle className="absolute right-4 top-4" />
        <div className="w-full max-w-[400px] rounded-xl border border-line bg-surface px-5 py-9 text-center sm:px-8">
          <Logo size={44} stacked />
          <div className="mx-auto mb-4 mt-7 flex h-12 w-12 items-center justify-center rounded-full bg-chip text-danger">
            <svg width={22} height={22} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <h1 className="m-0 mb-2 font-display text-2xl font-bold uppercase tracking-[0.03em] text-ink">
            Could not join team
          </h1>
          <p role="alert" className="m-0 mb-6 break-words text-sm text-muted">{errorMsg}</p>
          <button
            type="button"
            onClick={() => router.push("/playbook")}
            className="inline-flex h-11 items-center justify-center rounded-lg bg-accent px-6 text-sm font-semibold text-accent-ink transition-opacity hover:opacity-90"
          >
            Go to Playbook
          </button>
        </div>
      </main>
    );
  }

  // Joining…
  return <JoinStatus label="Joining team…" />;
}
