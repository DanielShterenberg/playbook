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
import { RingSpinner } from "@/components/brand/Spinner";

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
        <RingSpinner size={36} />
      </div>
    );
  }

  return <>{children}</>;
}
