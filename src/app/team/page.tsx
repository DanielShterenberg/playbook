"use client";

/**
 * TeamPage — who is in the team, who asked to join, and the invite link.
 *
 * Admins copy the invite link, approve or decline join requests, make members
 * viewers or editors and remove them. Everyone else in the team sees the member list. Someone without a
 * team is sent back to the playbook.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/contexts/TeamContext";
import { usePendingRequests } from "@/hooks/usePendingRequests";
import {
  approveRequest,
  declineRequest,
  ensureInviteDoc,
  leaveTeam,
  removeMember,
  setMemberRole,
  type JoinRequest,
  type TeamMemberEntry,
} from "@/lib/team";
import { FOCUS_RING } from "@/lib/uiClasses";
import Logo from "@/components/brand/Logo";
import ThemeToggle from "@/components/brand/ThemeToggle";
import { RingSpinner } from "@/components/brand/Spinner";
import type { Role } from "@/lib/types";
import { ASSIGNABLE_ROLES } from "@/lib/permissions";

const BTN = `flex h-11 flex-none items-center justify-center whitespace-nowrap rounded-lg px-3.5 text-sm font-medium transition-colors disabled:cursor-default disabled:opacity-60 ${FOCUS_RING}`;
const OUTLINE = `${BTN} border border-line bg-transparent text-ink hover:bg-app`;
const ACCENT = `${BTN} bg-accent font-semibold text-accent-ink hover:opacity-90`;
const SECTION = "flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 sm:p-5";
const HEADING = "m-0 font-display text-base font-semibold uppercase tracking-[0.08em] text-muted";

const ROLE_LABEL: Record<Role, string> = { admin: "Admin", editor: "Editor", viewer: "Viewer" };

/** How long "Sure?" stays armed before it resets to "Remove". */
const CONFIRM_MS = 4000;

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = Array.from(words[0])[0] ?? "?";
  const second = words.length > 1 ? (Array.from(words[words.length - 1])[0] ?? "") : "";
  return (first + second).toUpperCase();
}

/** A person row: initials, name and email, then whatever goes on the right. */
function PersonRow({ name, email, children }: { name: string; email: string; children?: React.ReactNode }) {
  const title = name || email || "Team member";
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line py-3 first:border-t-0 first:pt-0 last:pb-0">
      <span
        aria-hidden="true"
        className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-chip text-sm font-semibold text-ink"
      >
        {initials(title)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span dir="auto" className="truncate text-[15px] font-medium text-ink">
          {title}
        </span>
        {name && email && <span className="truncate text-[13px] text-muted">{email}</span>}
      </span>
      {children}
    </li>
  );
}

function RequestRow({ teamId, request, onError }: { teamId: string; request: JoinRequest; onError: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<void>, failure: string) => {
    setBusy(true);
    try {
      await fn();
    } catch {
      onError(failure);
      setBusy(false);
    }
  };
  return (
    <PersonRow name={request.name} email={request.email}>
      <span className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void act(() => declineRequest(teamId, request.uid), "Couldn't decline the request. Try again.")}
          className={OUTLINE}
        >
          Decline
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void act(() => approveRequest(teamId, request), "Couldn't approve the request. Try again.")}
          className={ACCENT}
        >
          Approve
        </button>
      </span>
    </PersonRow>
  );
}

function MemberRow({
  teamId,
  uid,
  member,
  isSelf,
  canRemove,
  canChangeRole,
  onError,
}: {
  teamId: string;
  uid: string;
  member: TeamMemberEntry;
  isSelf: boolean;
  canRemove: boolean;
  canChangeRole: boolean;
  onError: (m: string) => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!confirm) return;
    const timer = setTimeout(() => setConfirm(false), CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [confirm]);

  async function handleRemove() {
    if (!confirm) {
      setConfirm(true);
      return;
    }
    setBusy(true);
    try {
      await removeMember(teamId, uid);
    } catch {
      onError("Couldn't remove the member. Try again.");
      setBusy(false);
      setConfirm(false);
    }
  }

  async function handleRole(role: Role) {
    if (role === member.role) return;
    setBusy(true);
    try {
      await setMemberRole(teamId, uid, role);
    } catch {
      onError("Couldn't change the role. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const who = member.name || member.email || "this member";
  return (
    <PersonRow name={member.name ?? ""} email={member.email ?? ""}>
      <span className="flex items-center gap-2">
        {isSelf && <span className="text-[13px] text-muted">You</span>}
        {canChangeRole ? (
          <select
            value={member.role}
            disabled={busy}
            onChange={(e) => void handleRole(e.target.value as Role)}
            aria-label={`Role of ${who}`}
            title="Viewers watch the team's plays; editors also create and change them"
            className={`h-11 rounded-lg border border-line bg-surface px-2.5 text-sm font-medium text-ink disabled:opacity-60 ${FOCUS_RING}`}
          >
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        ) : (
          <span className="rounded-full bg-chip px-2.5 py-1 text-xs font-semibold text-ink">{ROLE_LABEL[member.role] ?? member.role}</span>
        )}
        {canRemove && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleRemove()}
            onBlur={() => setConfirm(false)}
            aria-label={confirm ? `Confirm removing ${who}` : `Remove ${who}`}
            className={`${BTN} border ${confirm ? "border-danger font-semibold text-danger" : "border-transparent text-muted hover:bg-app hover:text-danger"}`}
          >
            {confirm ? "Sure?" : "Remove"}
          </button>
        )}
      </span>
    </PersonRow>
  );
}

/** Leave the team (members who are not admins), after a "Sure?". */
function LeaveTeam({ teamId, teamName, uid, onError }: { teamId: string; teamName: string; uid: string; onError: (m: string) => void }) {
  const { refresh } = useTeam();
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!confirm) return;
    const timer = setTimeout(() => setConfirm(false), CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [confirm]);

  async function handleLeave() {
    if (!confirm) {
      setConfirm(true);
      return;
    }
    setBusy(true);
    try {
      await leaveTeam(teamId, uid);
      refresh();
      router.replace("/playbook");
    } catch {
      onError("Couldn't leave the team. Try again.");
      setBusy(false);
      setConfirm(false);
    }
  }

  return (
    <section className={SECTION} aria-labelledby="leave-heading">
      <h2 id="leave-heading" className={HEADING}>
        Leave team
      </h2>
      <p className="m-0 text-sm text-muted">
        You stop seeing <span dir="auto">{teamName}</span>&apos;s plays, except the ones you created. To come back, you need a new invite and the admin&apos;s approval.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => void handleLeave()}
        onBlur={() => setConfirm(false)}
        className={`${BTN} w-fit border ${confirm ? "border-danger font-semibold text-danger" : "border-line text-ink hover:bg-app hover:text-danger"}`}
      >
        {confirm ? "Sure? Leave the team" : "Leave team"}
      </button>
    </section>
  );
}

export default function TeamPage() {
  const { user, loading } = useAuth();
  const { team, role, loading: teamLoading } = useTeam();
  const router = useRouter();
  const isAdmin = role === "admin";
  const requests = usePendingRequests(team?.id ?? null, isAdmin);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const linkRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/sign-in?redirect=/team");
  }, [user, loading, router]);

  // Not in a team: nothing to show here.
  useEffect(() => {
    if (user && !teamLoading && !team) router.replace("/playbook");
  }, [user, teamLoading, team, router]);

  // The invite document lets people outside the team find it; older teams
  // may lack it or the team name on it.
  const teamKey = team ? { id: team.id, code: team.inviteCode, name: team.name } : null;
  useEffect(() => {
    if (teamKey && isAdmin) void ensureInviteDoc(teamKey.code, teamKey.id, teamKey.name).catch(() => {});
    // Once per team / code / name, not on every snapshot of the team document.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamKey?.id, teamKey?.code, teamKey?.name, isAdmin]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  if (loading || !user || !team) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-app text-muted">
        <RingSpinner />
      </main>
    );
  }

  const inviteUrl = typeof window !== "undefined" ? `${window.location.origin}/join/${team.inviteCode}` : "";
  const members = Object.entries(team.members).sort(([a, ma], [b, mb]) => {
    if (a === user.uid) return -1;
    if (b === user.uid) return 1;
    const rank = (r: Role) => (r === "admin" ? 0 : r === "editor" ? 1 : 2);
    return rank(ma.role) - rank(mb.role) || (ma.name || ma.email || "").localeCompare(mb.name || mb.email || "");
  });

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
    } catch {
      // No clipboard permission: select the link so it can be copied by hand.
      linkRef.current?.select();
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-app text-sm text-ink">
      <header className="flex items-center gap-4 border-b border-line bg-surface px-4 py-2.5 sm:px-6">
        <Link href="/playbook" aria-label="Back to the playbook" className={`flex-1 rounded-lg ${FOCUS_RING}`}>
          <Logo size={34} />
        </Link>
        <ThemeToggle />
      </header>

      <main className="mx-auto flex w-full max-w-[720px] flex-1 flex-col gap-5 px-4 py-7 sm:px-6">
        <div className="flex flex-col gap-1">
          <Link href="/playbook" className={`w-fit rounded text-[13px] font-medium text-accent-text hover:underline ${FOCUS_RING}`}>
            ← Playbook
          </Link>
          <h1 dir="auto" className="m-0 font-display text-[34px] font-bold uppercase leading-[1.2] tracking-[0.03em]">
            {team.name}
          </h1>
        </div>

        {error && (
          <p role="alert" className="m-0 text-sm text-danger">
            {error}
          </p>
        )}

        {isAdmin && (
          <section className={SECTION} aria-labelledby="invite-heading">
            <h2 id="invite-heading" className={HEADING}>
              Invite link
            </h2>
            <p className="m-0 text-sm text-muted">
              Send this link to someone you want in the team. They sign in with Google or email, and you approve them
              below before they can see any play.
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                ref={linkRef}
                readOnly
                value={inviteUrl}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="Invite link"
                className="h-11 min-w-0 flex-[1_1_240px] rounded-lg border border-line-strong bg-app px-3 font-mono text-[13px] text-ink outline-none focus:border-accent-text"
              />
              <button type="button" onClick={() => void copyLink()} className={ACCENT}>
                {copied ? "Copied" : "Copy link"}
              </button>
            </div>
          </section>
        )}

        {isAdmin && (
          <section className={SECTION} aria-labelledby="requests-heading">
            <h2 id="requests-heading" className={HEADING}>
              Waiting for approval{requests.length > 0 ? ` (${requests.length})` : ""}
            </h2>
            {requests.length === 0 ? (
              <p className="m-0 text-sm text-muted">No one is waiting. People who open the invite link show up here.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col p-0">
                {requests.map((r) => (
                  <RequestRow key={r.uid} teamId={team.id} request={r} onError={setError} />
                ))}
              </ul>
            )}
          </section>
        )}

        <section className={SECTION} aria-labelledby="members-heading">
          <h2 id="members-heading" className={HEADING}>
            Members ({members.length})
          </h2>
          <ul className="m-0 flex list-none flex-col p-0">
            {members.map(([uid, member]) => (
              <MemberRow
                key={uid}
                teamId={team.id}
                uid={uid}
                member={member}
                isSelf={uid === user.uid}
                canRemove={isAdmin && uid !== user.uid}
                canChangeRole={isAdmin && uid !== user.uid && member.role !== "admin"}
                onError={setError}
              />
            ))}
          </ul>
          {!isAdmin && <p className="m-0 text-[13px] text-muted">Only the team admin can add or remove people and change roles.</p>}
        </section>

        {!isAdmin && <LeaveTeam teamId={team.id} teamName={team.name} uid={user.uid} onError={setError} />}
      </main>
    </div>
  );
}
