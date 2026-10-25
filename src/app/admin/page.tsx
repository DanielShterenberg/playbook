"use client";

/**
 * AdminPage — the app owner's view of everything (src/lib/admin.ts).
 *
 * Every team (members, plays, invite code), every person, every play, every
 * public share link and the newest comments, with search across them. The
 * owner can make a member a viewer or an editor, remove a member, open any play read-only, and delete a team, a
 * play, a share link or a comment. Everyone else is sent to the playbook; the
 * Firestore rules refuse them the data anyway.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  ADMIN_COMMENT_LIMIT,
  deletePlayEverywhere,
  deleteShare,
  deleteTeamEverywhere,
  isAppOwner,
  loadAdminData,
  personLabel,
  playCounts,
  teamOfUser,
  type AdminData,
} from "@/lib/admin";
import { deleteComment } from "@/lib/comments";
import { removeMember, setMemberRole } from "@/lib/team";
import { ASSIGNABLE_ROLES } from "@/lib/permissions";
import { CATEGORY_LABELS } from "@/lib/categories";
import { FOCUS_RING } from "@/lib/uiClasses";
import Logo from "@/components/brand/Logo";
import ThemeToggle from "@/components/brand/ThemeToggle";
import { RingSpinner } from "@/components/brand/Spinner";
import type { Role } from "@/lib/types";

const BTN = `flex h-11 flex-none items-center justify-center whitespace-nowrap rounded-lg px-3.5 text-sm font-medium transition-colors disabled:cursor-default disabled:opacity-60 ${FOCUS_RING}`;
const OUTLINE = `${BTN} border border-line bg-transparent text-ink hover:bg-app`;
const SECTION = "flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 sm:p-5";
const ROW = "flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line py-3 first:border-t-0 first:pt-0 last:pb-0";
const CHIP = "rounded-full bg-chip px-2.5 py-1 text-xs font-semibold text-ink";

const ROLE_LABEL: Record<Role, string> = { admin: "Admin", editor: "Editor", viewer: "Viewer" };

type Tab = "teams" | "people" | "plays" | "shares" | "comments";

/** How long "Sure?" stays armed before it resets. */
const CONFIRM_MS = 4000;

function formatDate(d: Date | null): string {
  return d ? d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";
}

const matches = (q: string, ...texts: (string | null | undefined)[]) =>
  !q || texts.some((t) => t?.toLowerCase().includes(q));

/** A button that asks "Sure?" first, then runs `action`. */
function ConfirmButton({ label, confirmLabel = "Sure?", ariaLabel, action, onError }: {
  label: string;
  confirmLabel?: string;
  ariaLabel: string;
  action: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [armed]);
  async function click() {
    if (!armed) {
      setArmed(true);
      return;
    }
    setBusy(true);
    try {
      await action();
    } catch {
      onError(`${ariaLabel} failed. Try again.`);
    }
    setBusy(false);
    setArmed(false);
  }
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void click()}
      onBlur={() => setArmed(false)}
      aria-label={armed ? `Confirm: ${ariaLabel}` : ariaLabel}
      className={`${BTN} border ${armed ? "border-danger font-semibold text-danger" : "border-transparent text-muted hover:bg-app hover:text-danger"}`}
    >
      {busy ? "…" : armed ? confirmLabel : label}
    </button>
  );
}

export default function AdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const owner = isAppOwner(user);
  const [data, setData] = useState<AdminData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("teams");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/sign-in?redirect=/admin");
    else if (!owner) router.replace("/playbook");
  }, [user, loading, owner, router]);

  const reload = useCallback(() => {
    setLoadError(false);
    loadAdminData().then(setData, () => setLoadError(true));
  }, []);
  useEffect(() => {
    if (owner) reload();
  }, [owner, reload]);

  // Run a change, then show the new state (also after a failure: part of it may be done).
  const act = useCallback((fn: () => Promise<void>) => async () => {
    setError(null);
    try {
      await fn();
    } finally {
      reload();
    }
  }, [reload]);

  const counts = useMemo(() => (data ? playCounts(data.plays) : new Map<string, number>()), [data]);

  if (loading || !user || !owner || (!data && !loadError)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-app text-muted">
        <RingSpinner />
      </main>
    );
  }

  const header = (
    <header className="flex items-center gap-4 border-b border-line bg-surface px-4 py-2.5 sm:px-6">
      <Link href="/playbook" aria-label="Back to the playbook" className={`flex-1 rounded-lg ${FOCUS_RING}`}>
        <Logo size={34} />
      </Link>
      <ThemeToggle />
    </header>
  );

  if (!data) {
    return (
      <div className="flex min-h-screen flex-col bg-app text-sm text-ink">
        {header}
        <main className="mx-auto flex w-full max-w-[880px] flex-col items-start gap-3 px-4 py-7 sm:px-6">
          <p role="alert" className="m-0 text-danger">Couldn&apos;t load the data. Check the connection and try again.</p>
          <button type="button" onClick={reload} className={OUTLINE}>Retry</button>
        </main>
      </div>
    );
  }

  const { teams, users, plays, shares, comments } = data;
  const q = search.trim().toLowerCase();
  const who = (uid: string) => personLabel(uid, users, teams);
  const teamName = (id: string) => teams.find((t) => t.id === id)?.name ?? null;
  const playTitle = (id: string) => plays.find((p) => p.id === id)?.title ?? null;

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: "teams", label: "Teams", count: teams.length },
    { key: "people", label: "People", count: users.length },
    { key: "plays", label: "Plays", count: plays.length },
    { key: "shares", label: "Share links", count: shares.length },
    { key: "comments", label: "Comments", count: comments.length },
  ];

  let body: React.ReactNode;
  if (tab === "teams") {
    const list = teams
      .filter((t) => matches(q, t.name, ...Object.values(t.members).flatMap((m) => [m.name, m.email])))
      .sort((a, b) => a.name.localeCompare(b.name));
    body = list.map((team) => {
      const members = Object.entries(team.members);
      // The last admin stays: without one nobody can approve, invite or remove.
      const admins = members.filter(([, m]) => m.role === "admin").length;
      const n = counts.get(team.id) ?? 0;
      return (
        <li key={team.id} className={`${ROW} flex-col !items-stretch`}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="flex min-w-0 flex-1 flex-col">
              <span dir="auto" className="text-left truncate text-[15px] font-semibold text-ink">{team.name}</span>
              <span className="text-[13px] text-muted">
                {members.length} {members.length === 1 ? "member" : "members"} · {n} {n === 1 ? "play" : "plays"} · created {formatDate(team.createdAt)} by <bdi>{who(team.createdBy)}</bdi>
              </span>
            </span>
            <ConfirmButton
              label="Delete team"
              confirmLabel={`Delete with ${n} ${n === 1 ? "play" : "plays"}?`}
              ariaLabel={`Delete team ${team.name}`}
              action={act(() => deleteTeamEverywhere(team))}
              onError={setError}
            />
          </div>
          <ul className="m-0 flex list-none flex-col gap-1 p-0 pl-3">
            {members.map(([uid, m]) => (
              <li key={uid} className="flex flex-wrap items-center gap-2 text-[13px]">
                <span dir="auto" className="text-left min-w-0 flex-1 truncate text-ink">
                  {m.name || who(uid)}
                  {m.email && m.name ? <span className="text-muted"> · {m.email}</span> : null}
                </span>
                {m.role === "admin" ? (
                  <span className={CHIP}>{ROLE_LABEL[m.role]}</span>
                ) : (
                  <select
                    value={m.role}
                    onChange={(e) =>
                      void act(() => setMemberRole(team.id, uid, e.target.value as Role))().catch(() =>
                        setError("Couldn't change the role. Try again."),
                      )
                    }
                    aria-label={`Role of ${m.name || m.email || uid} in ${team.name}`}
                    className={`h-11 rounded-lg border border-line bg-surface px-2.5 text-sm font-medium text-ink ${FOCUS_RING}`}
                  >
                    {ASSIGNABLE_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                )}
                {(m.role !== "admin" || admins > 1) && <ConfirmButton
                  label="Remove"
                  ariaLabel={`Remove ${m.name || m.email || uid} from ${team.name}`}
                  action={act(() => removeMember(team.id, uid))}
                  onError={setError}
                />}
              </li>
            ))}
          </ul>
        </li>
      );
    });
  } else if (tab === "people") {
    const list = users
      .filter((u) => matches(q, u.name, u.email, teamOfUser(u.uid, teams)?.name))
      .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
    body = list.map((u) => {
      const team = teamOfUser(u.uid, teams);
      const own = plays.filter((p) => p.createdBy === u.uid).length;
      return (
        <li key={u.uid} className={ROW}>
          <span className="flex min-w-0 flex-1 flex-col">
            <span dir="auto" className="text-left truncate text-[15px] font-medium text-ink">{u.name || u.email || u.uid}</span>
            <span className="truncate text-[13px] text-muted">
              {u.name && u.email ? `${u.email} · ` : ""}joined {formatDate(u.createdAt)} · created {own} {own === 1 ? "play" : "plays"}
            </span>
          </span>
          {team ? (
            <span className={CHIP}>
              <bdi>{team.name}</bdi> · {ROLE_LABEL[team.members[u.uid].role] ?? team.members[u.uid].role}
            </span>
          ) : (
            <span className="text-[13px] text-muted">No team</span>
          )}
        </li>
      );
    });
  } else if (tab === "plays") {
    const list = plays
      .filter((p) => matches(q, p.title, teamName(p.teamId), who(p.createdBy)))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    body = list.map((p) => (
      <li key={p.id} className={ROW}>
        <span className="flex min-w-0 flex-1 flex-col">
          <span dir="auto" className="text-left truncate text-[15px] font-medium text-ink">{p.title || "Untitled"}</span>
          <span className="truncate text-[13px] text-muted">
            <bdi>{p.teamId ? teamName(p.teamId) ?? "Deleted team" : "Personal"}</bdi> · by <bdi>{who(p.createdBy)}</bdi> · {CATEGORY_LABELS[p.category] ?? p.category} · updated {formatDate(p.updatedAt)}
            {p.archived ? " · archived" : ""}
          </span>
        </span>
        <Link href={`/admin/play/${p.id}`} className={`${OUTLINE} no-underline`}>View</Link>
        <ConfirmButton label="Delete" ariaLabel={`Delete play ${p.title || "Untitled"}`} action={act(() => deletePlayEverywhere(p.id))} onError={setError} />
      </li>
    ));
  } else if (tab === "shares") {
    const list = shares
      .filter((s) => matches(q, s.title, s.teamName, who(s.createdBy)))
      .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
    body = list.map((s) => (
      <li key={s.token} className={ROW}>
        <span className="flex min-w-0 flex-1 flex-col">
          <span dir="auto" className="text-left truncate text-[15px] font-medium text-ink">{s.title || "Untitled"}</span>
          <span className="truncate text-[13px] text-muted">
            shared by <bdi>{who(s.createdBy)}</bdi> · {formatDate(s.createdAt)}
            {playTitle(s.playId) === null ? " · the play itself is deleted" : ""}
          </span>
        </span>
        <a href={`/view/${s.token}`} target="_blank" rel="noreferrer" className={`${OUTLINE} no-underline`}>Open</a>
        <ConfirmButton label="Revoke" ariaLabel={`Revoke the share link of ${s.title || "Untitled"}`} action={act(() => deleteShare(s.token))} onError={setError} />
      </li>
    ));
  } else {
    const list = comments.filter((c) => matches(q, c.text, c.authorName, playTitle(c.playId), ...c.replies.map((r) => r.text)));
    body = list.map((c) => (
      <li key={c.id} className={ROW}>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span dir="auto" className="text-left whitespace-pre-line break-words text-sm text-ink [unicode-bidi:plaintext]">{c.text}</span>
          <span className="truncate text-[13px] text-muted">
            <bdi>{c.authorName || who(c.authorId)}</bdi> · on <bdi>{playTitle(c.playId) ?? "a deleted play"}</bdi> · {formatDate(c.createdAt)}
            {c.replies.length > 0 ? ` · ${c.replies.length} ${c.replies.length === 1 ? "reply" : "replies"}` : ""}
          </span>
        </span>
        <ConfirmButton label="Delete" ariaLabel={`Delete the comment by ${c.authorName || "someone"}`} action={act(() => deleteComment(c.id))} onError={setError} />
      </li>
    ));
  }
  const empty = Array.isArray(body) && body.length === 0;

  return (
    <div className="flex min-h-screen flex-col bg-app text-sm text-ink">
      {header}
      <main className="mx-auto flex w-full max-w-[880px] flex-1 flex-col gap-5 px-4 py-7 sm:px-6">
        <div className="flex flex-col gap-1">
          <Link href="/playbook" className={`w-fit rounded text-[13px] font-medium text-accent-text hover:underline ${FOCUS_RING}`}>
            ← Playbook
          </Link>
          <h1 className="m-0 font-display text-[34px] font-bold uppercase leading-[1.2] tracking-[0.03em]">Admin</h1>
          <p className="m-0 text-sm text-muted">Everything in the app, across all teams. Only you can see this page.</p>
        </div>

        {(error || loadError) && (
          <p role="alert" className="m-0 text-sm text-danger">
            {error ?? "Couldn't refresh the lists; they may be out of date. Reload the page."}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="What to show" className="flex flex-wrap gap-1.5">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={`flex h-9 items-center rounded-full px-3.5 text-[13px] font-medium transition-colors ${FOCUS_RING} ${
                  tab === t.key ? "bg-accent text-accent-ink" : "bg-chip text-ink hover:opacity-80"
                }`}
              >
                {t.label} ({t.count})
              </button>
            ))}
          </div>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            aria-label="Search"
            className="h-9 min-w-0 flex-[1_1_160px] rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink outline-none placeholder:text-muted focus:border-accent-text"
          />
        </div>

        <section className={SECTION} role="tabpanel">
          {empty ? (
            <p className="m-0 text-sm text-muted">{q ? "Nothing matches the search." : "Nothing here."}</p>
          ) : (
            <ul className="m-0 flex list-none flex-col p-0">{body}</ul>
          )}
          {tab === "people" && (
            <p className="m-0 text-[13px] text-muted">To disable or delete an account, use the Firebase console (Authentication → Users).</p>
          )}
          {tab === "comments" && comments.length >= ADMIN_COMMENT_LIMIT && (
            <p className="m-0 text-[13px] text-muted">The newest {ADMIN_COMMENT_LIMIT} comments.</p>
          )}
        </section>
      </main>
    </div>
  );
}
