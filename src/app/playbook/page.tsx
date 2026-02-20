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
import { signOut } from "@/lib/auth";
import { loadPlaysForUser } from "@/lib/db";

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

export default function PlaybookPage() {
  const plays = useStore((s) => s.plays);
  const setPlays = useStore((s) => s.setPlays);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<Category | "all">("all");
  const [loadingPlays, setLoadingPlays] = useState(false);

  // Auth guard — redirect to sign-in if not authenticated
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!loading && !user) router.replace("/sign-in");
  }, [user, loading, router]);

  // Load plays from Firestore once auth resolves
  useEffect(() => {
    if (!user) return;
    setLoadingPlays(true);
    const fetchPlays = async () => {
      try {
        // For now we load by userId; team-based loading is wired in PR 3.
        const fetched = await loadPlaysForUser(user.uid);
        setPlays(fetched);
      } catch {
        // Silently fall back to whatever is in the local store
      } finally {
        setLoadingPlays(false);
      }
    };
    void fetchPlays();
  }, [user, setPlays]);

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

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#F9FAFB",
      }}
    >
      {/* Header */}
      <header
        style={{
          borderBottom: "1px solid #E5E7EB",
          background: "#fff",
          padding: "0 24px",
        }}
      >
        <div
          style={{
            maxWidth: 1280,
            margin: "0 auto",
            height: 60,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Basketball icon */}
            <svg
              width={24}
              height={24}
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <circle cx={12} cy={12} r={10} fill="#F97316" />
              <path
                d="M12 2 A10 10 0 0 1 22 12"
                stroke="#fff"
                strokeWidth={1.5}
                fill="none"
              />
              <path
                d="M2 12 A10 10 0 0 1 12 2"
                stroke="#fff"
                strokeWidth={1.5}
                fill="none"
              />
              <line x1={12} y1={2} x2={12} y2={22} stroke="#fff" strokeWidth={1.5} />
              <line x1={2} y1={12} x2={22} y2={12} stroke="#fff" strokeWidth={1.5} />
              <path
                d="M4.9 5.6 Q12 10 19.1 5.6"
                stroke="#fff"
                strokeWidth={1.2}
                fill="none"
              />
              <path
                d="M4.9 18.4 Q12 14 19.1 18.4"
                stroke="#fff"
                strokeWidth={1.2}
                fill="none"
              />
            </svg>
            <h1
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 700,
                color: "#111827",
                letterSpacing: "-0.01em",
              }}
            >
              Playbook
            </h1>
          </div>

          <button
            onClick={() => setShowModal(true)}
            aria-label="Create new play"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 18px",
              borderRadius: 8,
              border: "none",
              background: "#4F46E5",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#4338CA"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#4F46E5"; }}
          >
            <span style={{ fontSize: 18, lineHeight: 1, marginTop: -1 }}>+</span>
            New Play
          </button>

          {/* User avatar + dropdown */}
          <div ref={userMenuRef} style={{ position: "relative" }}>
            <button
              onClick={() => setShowUserMenu((v) => !v)}
              aria-label="User menu"
              aria-expanded={showUserMenu}
              style={{
                width: 34,
                height: 34,
                borderRadius: "50%",
                border: "2px solid #E5E7EB",
                background: "#4F46E5",
                color: "#fff",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                overflow: "hidden",
                padding: 0,
              }}
            >
              {user.photoURL ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.photoURL} alt="" width={34} height={34} style={{ borderRadius: "50%" }} />
              ) : (
                (user.displayName ?? user.email ?? "?")[0].toUpperCase()
              )}
            </button>

            {showUserMenu && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  right: 0,
                  background: "#fff",
                  border: "1px solid #E5E7EB",
                  borderRadius: 10,
                  boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
                  minWidth: 200,
                  zIndex: 50,
                  padding: "6px 0",
                }}
                role="menu"
              >
                <div style={{ padding: "8px 14px 10px", borderBottom: "1px solid #F3F4F6" }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#111827" }}>
                    {user.displayName ?? "User"}
                  </p>
                  <p style={{ margin: "1px 0 0", fontSize: 12, color: "#6B7280" }}>
                    {user.email}
                  </p>
                </div>
                <button
                  onClick={handleSignOut}
                  role="menuitem"
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "8px 14px",
                    border: "none",
                    background: "none",
                    fontSize: 13,
                    color: "#374151",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#F9FAFB"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Content */}
      <div
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          padding: "32px 24px",
        }}
      >
        {plays.length === 0 ? (
          /* Empty state */
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 360,
              gap: 16,
              textAlign: "center",
            }}
          >
            {/* Court illustration */}
            <svg
              width={100}
              height={94}
              viewBox="0 0 100 94"
              aria-hidden="true"
              style={{ opacity: 0.25 }}
            >
              <rect width={100} height={94} fill="#F0C878" rx={8} />
              <rect x={34} y={56} width={32} height={38} fill="#E07B39" />
              <rect width={100} height={94} fill="none" stroke="#9CA3AF" strokeWidth={2} rx={8} />
              <line x1={34} y1={56} x2={66} y2={56} stroke="#9CA3AF" strokeWidth={1.5} />
              <path
                d="M 6,70 L 6,56 A 47.5,47.5 0 1 1 94,56 L 94,70"
                fill="none"
                stroke="#9CA3AF"
                strokeWidth={1.5}
              />
              <circle cx={50} cy={83} r={4} fill="none" stroke="#9CA3AF" strokeWidth={1.5} />
            </svg>

            <div>
              <p
                style={{
                  margin: "0 0 6px",
                  fontSize: 18,
                  fontWeight: 600,
                  color: "#374151",
                }}
              >
                No plays yet
              </p>
              <p
                style={{
                  margin: "0 0 20px",
                  fontSize: 14,
                  color: "#9CA3AF",
                }}
              >
                Create your first play to get started.
              </p>
              <button
                onClick={() => setShowModal(true)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "10px 22px",
                  borderRadius: 8,
                  border: "none",
                  background: "#4F46E5",
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <span style={{ fontSize: 18, lineHeight: 1, marginTop: -1 }}>+</span>
                Create Play
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Search + filter bar */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 10,
                marginBottom: 20,
              }}
            >
              {/* Search input */}
              <div style={{ position: "relative", flex: "1 1 200px", maxWidth: 320 }}>
                <svg
                  width={14}
                  height={14}
                  viewBox="0 0 20 20"
                  fill="none"
                  aria-hidden="true"
                  style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF", pointerEvents: "none" }}
                >
                  <circle cx={8} cy={8} r={6} stroke="currentColor" strokeWidth={1.8} />
                  <path d="M13 13l4 4" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
                </svg>
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search plays…"
                  aria-label="Search plays"
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "7px 12px 7px 32px",
                    border: "1.5px solid #E5E7EB",
                    borderRadius: 8,
                    fontSize: 13,
                    color: "#111827",
                    background: "#fff",
                    outline: "none",
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "#6366F1"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "#E5E7EB"; }}
                />
              </div>

              {/* Category filter chips */}
              <div
                role="group"
                aria-label="Filter by category"
                style={{ display: "flex", flexWrap: "wrap", gap: 6 }}
              >
                {CATEGORY_FILTERS.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => setCategoryFilter(value)}
                    aria-pressed={categoryFilter === value}
                    style={{
                      padding: "5px 12px",
                      borderRadius: 99,
                      border: "1.5px solid",
                      borderColor: categoryFilter === value ? "#6366F1" : "#E5E7EB",
                      background: categoryFilter === value ? "#EEF2FF" : "#fff",
                      color: categoryFilter === value ? "#4338CA" : "#6B7280",
                      fontSize: 12,
                      fontWeight: categoryFilter === value ? 600 : 400,
                      cursor: "pointer",
                      transition: "all 0.12s",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Stats bar */}
            {(() => {
              const filteredPlays = [...plays]
                .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
                .filter((p) => {
                  const matchesSearch = !search || p.title.toLowerCase().includes(search.toLowerCase());
                  const matchesCategory = categoryFilter === "all" || p.category === categoryFilter;
                  return matchesSearch && matchesCategory;
                });

              return (
                <>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 20,
                    }}
                  >
                    <p style={{ margin: 0, fontSize: 13, color: "#6B7280" }}>
                      {filteredPlays.length === plays.length
                        ? `${plays.length} ${plays.length === 1 ? "play" : "plays"}`
                        : `${filteredPlays.length} of ${plays.length} plays`}
                    </p>
                    {(search || categoryFilter !== "all") && (
                      <button
                        onClick={() => { setSearch(""); setCategoryFilter("all"); }}
                        style={{
                          fontSize: 12,
                          color: "#6366F1",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: 0,
                          fontWeight: 500,
                        }}
                      >
                        Clear filters
                      </button>
                    )}
                  </div>

                  {filteredPlays.length === 0 ? (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        minHeight: 200,
                        gap: 8,
                        textAlign: "center",
                        color: "#9CA3AF",
                      }}
                    >
                      <p style={{ margin: 0, fontSize: 15, fontWeight: 500, color: "#6B7280" }}>
                        No plays match your filters
                      </p>
                      <button
                        onClick={() => { setSearch(""); setCategoryFilter("all"); }}
                        style={{
                          fontSize: 13,
                          color: "#6366F1",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: 0,
                          fontWeight: 500,
                        }}
                      >
                        Clear filters
                      </button>
                    </div>
                  ) : (
                    /* Grid */
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                        gap: 20,
                      }}
                    >
                      {filteredPlays.map((play) => (
                        <PlayCard key={play.id} play={play} />
                      ))}
                    </div>
                  )}
                </>
              );
            })()}
          </>
        )}
      </div>

      {/* New Play Modal */}
      {showModal && <NewPlayModal onClose={() => setShowModal(false)} />}
    </main>
  );
}
