"use client";

/**
 * JoinTeamPage — handles invite link redemption.
 *
 * Implements issue #75: invite link → join request.
 *
 * URL: /join/[inviteCode]
 *
 * Flow:
 *   1. If not signed in, redirect to /sign-in?redirect=<current url>
 *   2. requestToJoin files a join request for the link's team
 *   3. Show "waiting for approval"; once an admin approves, TeamContext loads
 *      the team. Already in the team → straight to the playbook.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/contexts/TeamContext";
import { loadUserTeamInfo, requestToJoin } from "@/lib/team";
import Logo from "@/components/brand/Logo";
import ThemeToggle from "@/components/brand/ThemeToggle";
import Spinner from "@/components/brand/Spinner";

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
        <Spinner size={18} />
        {label}
      </div>
    </main>
  );
}

/** The card every outcome is shown in: an icon, a heading, a line, a button. */
function JoinCard({
  icon,
  title,
  children,
  onContinue,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  onContinue: () => void;
}) {
  return (
    <main className={PAGE}>
      <ThemeToggle className="absolute right-4 top-4" />
      <div className="w-full max-w-[400px] rounded-xl border border-line bg-surface px-5 py-9 text-center sm:px-8">
        <Logo size={44} stacked />
        <div className="mx-auto mb-4 mt-7 flex h-12 w-12 items-center justify-center rounded-full bg-chip">{icon}</div>
        <h1 className="m-0 mb-2 font-display text-2xl font-bold uppercase tracking-[0.03em] text-ink">{title}</h1>
        <div className="m-0 mb-6 break-words text-sm text-muted">{children}</div>
        <button
          type="button"
          onClick={onContinue}
          className="inline-flex h-11 items-center justify-center rounded-lg bg-accent px-6 text-sm font-semibold text-accent-ink transition-opacity hover:opacity-90"
        >
          Go to Playbook
        </button>
      </div>
    </main>
  );
}

const ALERT_ICON = (
  <svg width={22} height={22} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="text-danger">
    <path
      fillRule="evenodd"
      d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
      clipRule="evenodd"
    />
  </svg>
);

const CLOCK_ICON = (
  <svg width={22} height={22} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="text-accent-text">
    <path
      fillRule="evenodd"
      d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v5c0 .2.08.39.22.53l3 3a.75.75 0 1 0 1.06-1.06l-2.78-2.78V5Z"
      clipRule="evenodd"
    />
  </svg>
);

export default function JoinTeamPage({ params }: JoinTeamPageProps) {
  const { inviteCode } = params;
  const { user, loading: authLoading } = useAuth();
  const { refresh, teamId } = useTeam();
  const router = useRouter();

  const [status, setStatus] = useState<"idle" | "joining" | "pending" | "other-team" | "error">("idle");
  const [teamName, setTeamName] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Redirect to sign-in if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace(`/sign-in?redirect=/join/${inviteCode}`);
    }
  }, [user, authLoading, router, inviteCode]);

  // File the request once auth is ready. The user's current team is read
  // from their own document, so a member does not ask to join again.
  useEffect(() => {
    if (authLoading || !user || status !== "idle") return;
    setStatus("joining");

    loadUserTeamInfo(user.uid)
      .then((info) => requestToJoin(inviteCode, user, info.teamId))
      .then((result) => {
        if (result.status === "member") {
          router.replace("/playbook");
          return;
        }
        if (result.status === "other-team") {
          setStatus("other-team");
          return;
        }
        setTeamName(result.teamName);
        setStatus("pending");
        refresh();
      })
      .catch((err: Error) => {
        setStatus("error");
        setErrorMsg(err.message || "Could not send the request. Try the link again.");
      });
  }, [user, authLoading, inviteCode, status, refresh, router]);

  // Approved while this page is open: TeamContext loaded the team.
  useEffect(() => {
    if (status === "pending" && teamId) router.replace("/playbook");
  }, [status, teamId, router]);

  // Auth resolving, or about to redirect to sign-in
  if (authLoading || !user) return <JoinStatus label="Loading…" />;

  const toPlaybook = () => router.push("/playbook");

  if (status === "error") {
    return (
      <JoinCard icon={ALERT_ICON} title="Could not join team" onContinue={toPlaybook}>
        <p role="alert" className="m-0">{errorMsg}</p>
      </JoinCard>
    );
  }

  if (status === "other-team") {
    return (
      <JoinCard icon={ALERT_ICON} title="Already in a team" onContinue={toPlaybook}>
        <p className="m-0">You are a member of another team. An account can be in one team at a time.</p>
      </JoinCard>
    );
  }

  if (status === "pending") {
    return (
      <JoinCard icon={CLOCK_ICON} title="Request sent" onContinue={toPlaybook}>
        <p className="m-0">
          The admin of <span dir="auto" className="font-semibold text-ink">{teamName}</span> will approve your request.
          You will see the team&apos;s plays as soon as they do.
        </p>
      </JoinCard>
    );
  }

  return <JoinStatus label="Sending request…" />;
}
