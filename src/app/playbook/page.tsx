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
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import type { Category } from "@/lib/types";
import NewPlayModal from "@/components/playbook/NewPlayModal";
import PlayCard from "@/components/playbook/PlayCard";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/contexts/TeamContext";
import { signOut } from "@/lib/auth";
import { loadPlaysForUser, loadPlaysForTeam } from "@/lib/db";
import { ensureInviteDoc } from "@/lib/team";
import CreateTeamModal from "@/components/playbook/CreateTeamModal";
import { useCourtPalette } from "@/hooks/useTheme";
import Logo from "@/components/brand/Logo";
import ThemeToggle from "@/components/brand/ThemeToggle";

const CATEGORY_FILTERS: { value: Category | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "offense", label: "Offense" },
  { value: "defense", label: "Defense" },
  { value: "inbound", label: "Inbound" },
  { value: "press-break", label: "Press Break" },
  { value: "fast-break", label: "Fast Break" },
  { value: "oob", label: "OOB" },
  { value: "special", label: "Special" },
];

const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text";

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
  const [categoryFilter, setCategoryFilter] = useState<Category | "all">("all");
  const [, setLoadingPlays] = useState(false);

  // Auth guard — redirect to sign-in if not authenticated
  const { user, loading } = useAuth();
  const { teamId, role, team } = useTeam();
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

  async function handleSignOut() {
    await signOut();
    router.replace("/sign-in");
  }

  if (loading || !user) return null;

  const hasFilters = Boolean(search) || categoryFilter !== "all";
  const filteredPlays = [...plays]
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .filter((p) => {
      const matchesSearch = !search || p.title.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = categoryFilter === "all" || p.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });

  function clearFilters() {
    setSearch("");
    setCategoryFilter("all");
  }

  return (
    <div className="flex min-h-screen flex-col bg-app text-sm text-ink">
      {/* Header */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface px-4 py-2.5 sm:px-6">
        <div className="flex flex-[1_1_140px] items-center sm:basis-[200px]">
          <Logo size={34} />
        </div>

        {/* Team badge + invite link / Create Team button */}
        {team ? (
          <div className="order-last flex min-w-0 basis-full items-center gap-2 sm:order-none sm:basis-auto">
            <span
              className="flex h-11 min-w-0 max-w-[220px] items-center rounded-lg border border-line px-3.5 text-sm font-medium text-ink"
              title={`Team: ${team.name} · Your role: ${role ?? "viewer"}`}
            >
              <span dir="auto" className="truncate">
                {team.name}
              </span>
            </span>
            {role === "admin" && (
              <button
                type="button"
                onClick={() => {
                  // Ensure invite doc exists for existing teams (backward compat)
                  void ensureInviteDoc(team.inviteCode, team.id);
                  navigator.clipboard.writeText(
                    `${window.location.origin}/join/${team.inviteCode}`,
                  ).catch(() => {});
                }}
                title="Copy invite link"
                className={OUTLINE_BTN}
              >
                Copy invite
              </button>
            )}
          </div>
        ) : (
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
            {/* Category filter chips */}
            <div role="group" aria-label="Filter by category" className="flex flex-wrap gap-2">
              {CATEGORY_FILTERS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setCategoryFilter(value)}
                  aria-pressed={categoryFilter === value}
                  className={`h-11 whitespace-nowrap rounded-full border px-4 text-sm transition-colors ${FOCUS_RING} ${
                    categoryFilter === value
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
                {filteredPlays.length === plays.length
                  ? `${plays.length} ${plays.length === 1 ? "play" : "plays"}`
                  : `${filteredPlays.length} of ${plays.length} plays`}
              </p>
              {hasFilters && (
                <button type="button" onClick={clearFilters} className={LINK_BTN}>
                  Clear filters
                </button>
              )}
            </div>

            {filteredPlays.length === 0 ? (
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
