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

interface JoinTeamPageProps {
  params: { inviteCode: string };
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

  if (authLoading || !user) return null;

  if (status === "error") {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "#F9FAFB",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <div
          style={{
            background: "#fff",
            borderRadius: 16,
            boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
            padding: "40px 36px",
            maxWidth: 400,
            width: "100%",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              background: "#FEE2E2",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px",
            }}
          >
            <svg width={22} height={22} viewBox="0 0 20 20" fill="#B91C1C" aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <h1 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 700, color: "#111827" }}>
            Could not join team
          </h1>
          <p style={{ margin: "0 0 24px", fontSize: 14, color: "#6B7280" }}>{errorMsg}</p>
          <button
            onClick={() => router.push("/playbook")}
            style={{
              padding: "10px 24px",
              borderRadius: 8,
              border: "none",
              background: "#4F46E5",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Go to Playbook
          </button>
        </div>
      </main>
    );
  }

  // Joining…
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#F9FAFB",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        color: "#6B7280",
        fontSize: 15,
      }}
    >
      <svg
        width={18}
        height={18}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        style={{ animation: "spin 1s linear infinite" }}
      >
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
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
      Joining team…
    </main>
  );
}
