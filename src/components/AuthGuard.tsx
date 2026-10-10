"use client";

/**
 * AuthGuard — redirects unauthenticated users to /sign-in.
 *
 * Wraps protected layouts (e.g. /playbook, /play/[id]).
 * Shows a minimal loading indicator while the auth state resolves to
 * avoid a flash of the protected page before the redirect fires.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/sign-in");
    }
  }, [user, loading, router]);

  // While resolving auth state, show a simple centred spinner.
  if (loading || !user) {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-app"
        aria-label="Loading"
        aria-busy="true"
      >
        <svg
          width={36}
          height={36}
          viewBox="0 0 36 36"
          fill="none"
          aria-hidden="true"
          className="animate-spin"
        >
          <circle cx={18} cy={18} r={14} stroke="var(--color-line)" strokeWidth={4} />
          <path
            d="M18 4 A14 14 0 0 1 32 18"
            stroke="var(--color-accent)"
            strokeWidth={4}
            strokeLinecap="round"
          />
        </svg>
      </div>
    );
  }

  return <>{children}</>;
}
