"use client";

/**
 * EditorAuthGate — client-side auth guard for the play editor.
 *
 * Wraps the entire editor shell in a single client boundary so the
 * surrounding page.tsx can remain a Server Component.  Redirects to
 * /sign-in (preserving the current URL as ?redirect) if the user is
 * not authenticated.
 */

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { RingSpinner } from "@/components/brand/Spinner";

export default function EditorAuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.replace(`/sign-in?redirect=${encodeURIComponent(pathname)}`);
    }
  }, [user, loading, router, pathname]);

  if (loading || !user) {
    return (
      <div
        className="flex h-screen items-center justify-center bg-app"
        aria-label="Loading"
        aria-busy="true"
      >
        <RingSpinner size={36} />
      </div>
    );
  }

  return <>{children}</>;
}
