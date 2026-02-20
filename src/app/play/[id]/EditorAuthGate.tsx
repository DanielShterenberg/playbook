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
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          background: "#F9FAFB",
        }}
        aria-label="Loading"
        aria-busy="true"
      >
        <svg
          width={36}
          height={36}
          viewBox="0 0 36 36"
          fill="none"
          aria-hidden="true"
          style={{ animation: "spin 0.8s linear infinite" }}
        >
          <circle cx={18} cy={18} r={14} stroke="#E5E7EB" strokeWidth={4} />
          <path
            d="M18 4 A14 14 0 0 1 32 18"
            stroke="#F97316"
            strokeWidth={4}
            strokeLinecap="round"
          />
        </svg>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return <>{children}</>;
}
