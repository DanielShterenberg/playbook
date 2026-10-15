"use client";

/**
 * PlaybookPage — the home/dashboard screen for the playbook.
 *
 * Implements issues #67 and #69:
 *   #67 — "New Play" button opens NewPlayModal to create a play with
 *          title, description, court type, and category.
 *   #69 — Grid view showing all plays as PlayCard thumbnails.
 *
 * State is stored in the Zustand store (Firebase comes later in #45/#68).
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { CATEGORY_FILTERS } from "@/lib/categories";
import { FOCUS_RING } from "@/lib/uiClasses";
import NewPlayModal from "@/components/playbook/NewPlayModal";
import PlayCard from "@/components/playbook/PlayCard";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/contexts/TeamContext";
import { signOut } from "@/lib/auth";
import { loadPlaysForUser, loadPlaysForTeam } from "@/lib/db";
import { forgetPendingTeam } from "@/lib/team";
import { usePendingRequests } from "@/hooks/usePendingRequests";
import CreateTeamModal from "@/components/playbook/CreateTeamModal";
import { useCourtPalette } from "@/hooks/useTheme";
import Logo from "@/components/brand/Logo";
import ThemeToggle from "@/components/brand/ThemeToggle";
import { effectivePlayFilter, filterPlays, type PlayFilter } from "@/lib/playFilter";

const PERSONAL_FILTER: { value: PlayFilter; label: string } = { value: "personal", label: "Personal" };
const ARCHIVED_FILTER: { value: PlayFilter; label: string } = { value: "archived", label: "Archived" };

/** Outlined 44px control — the header's secondary buttons. */
const OUTLINE_BTN = `flex h-11 flex-none items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-line bg-transparent px-3.5 text-sm font-medium text-ink transition-colors hover:bg-app ${FOCUS_RING}`;

/** Accent call-to-action ("New play"). */
const ACCENT_BTN = `flex h-11 flex-none items-center justify-center gap-2 whitespace-nowrap rounded-lg border-0 bg-accent px-[18px] text-sm font-semibold text-accent-ink transition-opacity hover:opacity-90 ${FOCUS_RING}`;

/** Text button ("Clear filters"), 44px tall. */
const LINK_BTN = `h-11 rounded-lg border-0 bg-transparent px-2 text-[13px] font-medium text-accent-text underline-offset-2 hover:underline ${FOCUS_RING}`;

/** Up to two initials for the account button. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = Array.from(words[0])[0] ?? "?";
  const second = words.length > 1 ? Array.from(words[words.length - 1])[0] ?? "" : "";
  return (first + second).toUpperCase();
}

export default function PlaybookPage() {
  const plays = useStore((s) => s.plays);
  const setPlays = useStore((s) => s.setPlays);
  const palette = useCourtPalette();
  const [showModal, setShowModal] = useState(false);
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedFilter, setPlayFilter] = useState<PlayFilter>("all");
  const [, setLoadingPlays] = useState(false);

  // Auth guard — redirect to sign-in if not authenticated
  const { user, loading } = useAuth();
  const { teamId, role, team, pending, refresh: refreshTeam } = useTeam();
  const requests = usePendingRequests(teamId, role === "admin");
  const router = useRouter();
  useEffect(() => {
    if (!loading && !user) router.replace("/sign-in");
  }, [user, loading, router]);

  // Load plays from Firestore once auth + team info resolves.
  // When the user is in a team, load both team plays and their personal plays
  // (plays with no teamId created by this user), then merge and deduplicate by id.
  useEffect(() => {
    if (!user) return;
    setLoadingPlays(true);
    const fetchPlays = async () => {
      try {
        if (teamId) {
          const [teamPlays, personalPlays] = await Promise.all([
            loadPlaysForTeam(teamId),
            loadPlaysForUser(user.uid),
          ]);
          // Deduplicate: team plays take precedence; personal plays that already
          // have this teamId are already covered by loadPlaysForTeam.
          const teamPlayIds = new Set(teamPlays.map((p) => p.id));
          const uniquePersonal = personalPlays.filter(
            (p) => !teamPlayIds.has(p.id) && !p.teamId,
          );
          setPlays([...teamPlays, ...uniquePersonal]);
        } else {
          const fetched = await loadPlaysForUser(user.uid);
          setPlays(fetched);
        }
      } catch {
        // Silently fall back to whatever is in the local store
      } finally {
        setLoadingPlays(false);
      }
    };
    void fetchPlays();
  }, [user, teamId, setPlays]);

  // User avatar dropdown
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showUserMenu) return;
    function handleClick(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showUserMenu]);

  // Once the archive is empty the Archived chip goes away; drop a selection of
  // it so archiving a play later does not jump the grid into the archive.
  const anyArchived = plays.some((p) => p.archived);
  useEffect(() => {
    if (!anyArchived) setPlayFilter((f) => (f === "archived" ? "all" : f));
  }, [anyArchived]);

  async function handleSignOut() {
    await signOut();
    router.replace("/sign-in");
  }

  if (loading || !user) return null;

  // "Personal" (plays not yet added to the team) only means something in a
  // team: the chip shows with the team header, and a stale selection is ignored.
  // "Archived" shows while something is archived; archived plays are hidden
  // under every other chip.
  const inTeam = Boolean(team && teamId);
  const archivedCount = plays.filter((p) => p.archived).length;
  const playFilter = effectivePlayFilter(selectedFilter, inTeam ? teamId : null, archivedCount);
  const filters = [
    ...CATEGORY_FILTERS,
    ...(inTeam ? [PERSONAL_FILTER] : []),
    ...(archivedCount > 0 ? [ARCHIVED_FILTER] : []),
  ];
  // The count the stats bar compares against: the archive, or everything in rotation.
  const totalPlays = playFilter === "archived" ? archivedCount : plays.length - archivedCount;
  const playsWord = `${playFilter === "archived" ? "archived " : ""}${totalPlays === 1 ? "play" : "plays"}`;

  const hasFilters = Boolean(search) || playFilter !== "all";
  const filteredPlays = filterPlays(plays, { search, filter: playFilter, teamId: inTeam ? teamId : null });

  function clearFilters() {
    setSearch("");
    setPlayFilter("all");
  }

  return (
    <div className="flex min-h-screen flex-col bg-app text-sm text-ink">
      {/* Header */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface px-4 py-2.5 sm:px-6">
        <div className="flex flex-[1_1_140px] items-center sm:basis-[200px]">
          <Logo size={34} />
        </div>

        {/* Team: opens the Team page (members, invite link, requests) / Create Team button */}
        {team ? (
          <div className="order-last flex min-w-0 basis-full items-center gap-2 sm:order-none sm:basis-auto">
            <Link
              href="/team"
              className={`${OUTLINE_BTN} min-w-0 max-w-[260px] flex-shrink`}
              title={`Team: ${team.name} · Your role: ${role ?? "viewer"}`}
              aria-label={`Team ${team.name}${requests.length > 0 ? `, ${requests.length} waiting for approval` : ""}`}
            >
              <span dir="auto" className="truncate">
                {team.name}
              </span>
              {requests.length > 0 && (
                <span className="flex h-[18px] min-w-[18px] flex-none items-center justify-center rounded-full bg-accent px-1 text-[11px] font-bold leading-none text-accent-ink">
                  {requests.length}
                </span>
              )}
            </Link>
          </div>
        ) : pending ? null : (
          <button type="button" onClick={() => setShowCreateTeam(true)} className={`${OUTLINE_BTN} order-last sm:order-none`}>
            + Create Team
          </button>
        )}

        <ThemeToggle />

        {/* User avatar + dropdown */}
        <div ref={userMenuRef} className="relative flex-none">
          <button
            type="button"
            onClick={() => setShowUserMenu((v) => !v)}
            aria-label="User menu"
            aria-haspopup="menu"
            aria-expanded={showUserMenu}
            className={`flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border-0 bg-chip p-0 text-sm font-semibold text-ink ${FOCUS_RING}`}
          >
            {user.photoURL ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.photoURL} alt="" width={44} height={44} className="h-full w-full rounded-full object-cover" />
            ) : (
              initials(user.displayName?.trim() || user.email || "?")
            )}
          </button>

          {showUserMenu && (
            <div
              className="absolute right-0 top-[calc(100%+6px)] z-50 min-w-[220px] max-w-[calc(100vw-32px)] overflow-hidden rounded-xl border border-line bg-surface shadow-[0_8px_24px_rgba(0,0,0,0.18)]"
              role="menu"
            >
              <div className="border-b border-line px-3.5 py-3">
                <p dir="auto" className="m-0 text-left text-sm font-semibold text-ink">
                  {user.displayName ?? "User"}
                </p>
                <p className="m-0 mt-0.5 break-all text-[13px] text-muted">{user.email}</p>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                role="menuitem"
                className="block h-11 w-full border-0 bg-transparent px-3.5 text-left text-sm font-medium text-ink hover:bg-app focus-visible:bg-app focus-visible:outline-none"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-5 px-4 py-7 sm:px-6">
        {/* A join request from an invite link, waiting for (or declined by) the team admin */}
        {!team && pending && (
          <div role="status" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line bg-surface px-4 py-3">
            <p className="m-0 min-w-0 flex-1 text-sm text-ink">
              {pending.status === "pending" ? "Your request to join " : "The admin of "}
              <span dir="auto" className="font-semibold">{pending.teamName || "the team"}</span>
              {pending.status === "pending"
                ? " is waiting for the admin's approval. The team's plays appear here once it is approved."
                : " declined your request. Ask them for a new invite if that was a mistake."}
            </p>
            {pending.status === "declined" && user && (
              <button
                type="button"
                onClick={() => {
                  void forgetPendingTeam(user.uid).finally(refreshTeam);
                }}
                className={OUTLINE_BTN}
              >
                Dismiss
              </button>
            )}
          </div>
        )}
        {/* Title + search + New play */}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="m-0 flex-[1_1_240px] font-display text-[34px] font-bold uppercase leading-[1.2] tracking-[0.03em]">
            {team ? "Team playbook" : "My playbook"}
          </h1>
          {plays.length > 0 && (
            <label className="flex h-11 max-w-[320px] flex-[1_1_220px] items-center gap-2 rounded-lg border border-line bg-surface px-3 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent-text">
              <svg
                width={16}
                height={16}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.2}
                strokeLinecap="round"
                aria-hidden="true"
                className="flex-none text-muted"
              >
                <circle cx={11} cy={11} r={7} />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search plays"
                aria-label="Search plays"
                className="h-full min-w-0 flex-1 border-0 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
              />
            </label>
          )}
          <button type="button" onClick={() => setShowModal(true)} aria-label="Create new play" className={ACCENT_BTN}>
            New play
          </button>
        </div>

        {plays.length === 0 ? (
          /* Empty state */
          <div className="flex min-h-[360px] flex-col items-center justify-center gap-4 text-center">
            {/* Court illustration */}
            <svg width={100} height={94} viewBox="0 0 100 94" aria-hidden="true" className="text-muted">
              <rect width={100} height={94} fill={palette.floor} rx={8} />
              <rect x={34} y={56} width={32} height={38} fill={palette.paint} />
              <rect width={100} height={94} fill="none" stroke="currentColor" strokeWidth={2} rx={8} />
              <line x1={34} y1={56} x2={66} y2={56} stroke="currentColor" strokeWidth={1.5} />
              <path
                d="M 6,70 L 6,56 A 47.5,47.5 0 1 1 94,56 L 94,70"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
              />
              <circle cx={50} cy={83} r={4} fill="none" stroke="currentColor" strokeWidth={1.5} />
            </svg>

            <div className="flex flex-col items-center">
              <p className="m-0 mb-1.5 font-display text-2xl font-semibold tracking-[0.02em] text-ink">
                No plays yet
              </p>
              <p className="m-0 mb-5 text-sm text-muted">Create your first play to get started.</p>
              <button type="button" onClick={() => setShowModal(true)} className={ACCENT_BTN}>
                Create Play
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Filter chips: categories, plus Personal for team members */}
            <div role="group" aria-label="Filter plays" className="flex flex-wrap gap-2">
              {filters.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPlayFilter(value)}
                  aria-pressed={playFilter === value}
                  className={`h-11 whitespace-nowrap rounded-full border px-4 text-sm transition-colors ${FOCUS_RING} ${
                    playFilter === value
                      ? "border-ink bg-ink font-semibold text-app"
                      : "border-line bg-transparent font-medium text-ink hover:bg-chip"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Stats bar */}
            <div className="-my-2 flex min-h-11 items-center justify-between gap-3">
              <p className="m-0 text-[13px] text-muted">
                {filteredPlays.length === totalPlays
                  ? `${totalPlays} ${playsWord}`
                  : `${filteredPlays.length} of ${totalPlays} ${playsWord}`}
              </p>
              {hasFilters && (
                <button type="button" onClick={clearFilters} className={LINK_BTN}>
                  Clear filters
                </button>
              )}
            </div>

            {/* Nothing in rotation and no filter (everything archived): the grid, i.e. the New play tile. */}
            {filteredPlays.length === 0 && hasFilters ? (
              <div className="flex min-h-[200px] flex-col items-center justify-center gap-1 text-center">
                <p className="m-0 text-[15px] font-medium text-muted">No plays match your filters</p>
                <button type="button" onClick={clearFilters} className={LINK_BTN}>
                  Clear filters
                </button>
              </div>
            ) : (
              /* Grid */
              <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-4">
                {filteredPlays.map((play) => (
                  <PlayCard key={play.id} play={play} teamId={teamId} role={role} />
                ))}
                <button
                  type="button"
                  onClick={() => setShowModal(true)}
                  className={`flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line-strong bg-transparent text-[15px] font-medium text-muted transition-colors hover:border-ink hover:text-ink ${FOCUS_RING}`}
                >
                  <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  New play
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {/* New Play Modal */}
      {showModal && <NewPlayModal onClose={() => setShowModal(false)} />}

      {/* Create Team Modal */}
      {showCreateTeam && <CreateTeamModal onClose={() => setShowCreateTeam(false)} />}
    </div>
  );
}
