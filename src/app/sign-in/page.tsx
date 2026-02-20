"use client";

/**
 * Sign-in / Sign-up page — implements issue #73.
 *
 * Supports:
 *   - Sign in with email + password
 *   - Create account with email + password
 *   - Sign in with Google
 *
 * After successful authentication, redirects to /playbook (or the
 * `redirect` query parameter if provided).
 *
 * Already-authenticated users are redirected away immediately.
 */

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  signInWithEmail,
  signUpWithEmail,
  signInWithGoogle,
  authErrorMessage,
} from "@/lib/auth";

type Mode = "signin" | "signup";

// useSearchParams() must be inside a Suspense boundary in Next.js App Router.
// SignInContent contains the real logic; the exported default wraps it.
function SignInContent() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") ?? "/playbook";

  const [mode, setMode]           = useState<Mode>("signin");
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [name, setName]           = useState("");
  const [error, setError]         = useState("");
  const [submitting, setSubmitting] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);

  // Redirect already-authenticated users
  useEffect(() => {
    if (!loading && user) {
      router.replace(redirect);
    }
  }, [user, loading, router, redirect]);

  // Auto-focus email when mode changes
  useEffect(() => {
    emailRef.current?.focus();
  }, [mode]);

  function clearError() {
    if (error) setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      if (mode === "signup") {
        if (!name.trim()) { setError("Name is required."); return; }
        await signUpWithEmail(email.trim(), password, name.trim());
      } else {
        await signInWithEmail(email.trim(), password);
      }
      router.replace(redirect);
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? "";
      setError(authErrorMessage(code));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogle() {
    setError("");
    setSubmitting(true);
    try {
      await signInWithGoogle();
      router.replace(redirect);
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? "";
      setError(authErrorMessage(code));
    } finally {
      setSubmitting(false);
    }
  }

  // Show nothing while checking auth (AuthGuard handles this elsewhere, but
  // here we're on the public sign-in page — just blank until resolved)
  if (loading) return null;

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #1E3A5F 0%, #0F1F33 100%)",
        padding: "24px 16px",
      }}
    >
      {/* Card */}
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          background: "#fff",
          borderRadius: 16,
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          padding: "36px 32px 32px",
        }}
      >
        {/* Logo + title */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <svg
            width={40}
            height={40}
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            style={{ display: "inline-block", marginBottom: 10 }}
          >
            <circle cx={12} cy={12} r={10} fill="#F97316" />
            <path d="M12 2 A10 10 0 0 1 22 12" stroke="#fff" strokeWidth={1.5} fill="none" />
            <path d="M2 12 A10 10 0 0 1 12 2" stroke="#fff" strokeWidth={1.5} fill="none" />
            <line x1={12} y1={2} x2={12} y2={22} stroke="#fff" strokeWidth={1.5} />
            <line x1={2} y1={12} x2={22} y2={12} stroke="#fff" strokeWidth={1.5} />
            <path d="M4.9 5.6 Q12 10 19.1 5.6" stroke="#fff" strokeWidth={1.2} fill="none" />
            <path d="M4.9 18.4 Q12 14 19.1 18.4" stroke="#fff" strokeWidth={1.2} fill="none" />
          </svg>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#111827" }}>
            Playbook
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6B7280" }}>
            {mode === "signin" ? "Sign in to your account" : "Create a new account"}
          </p>
        </div>

        {/* Mode toggle */}
        <div
          style={{
            display: "flex",
            background: "#F3F4F6",
            borderRadius: 8,
            padding: 3,
            marginBottom: 24,
          }}
        >
          {(["signin", "signup"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setError(""); }}
              style={{
                flex: 1,
                padding: "7px 0",
                borderRadius: 6,
                border: "none",
                fontSize: 13,
                fontWeight: mode === m ? 600 : 400,
                color: mode === m ? "#111827" : "#6B7280",
                background: mode === m ? "#fff" : "transparent",
                boxShadow: mode === m ? "0 1px 3px rgba(0,0,0,0.12)" : "none",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {m === "signin" ? "Sign In" : "Sign Up"}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} noValidate>
          {/* Name (sign-up only) */}
          {mode === "signup" && (
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle} htmlFor="name">Name</label>
              <input
                id="name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => { setName(e.target.value); clearError(); }}
                placeholder="Your name"
                style={inputStyle}
              />
            </div>
          )}

          {/* Email */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle} htmlFor="email">Email</label>
            <input
              id="email"
              ref={emailRef}
              type="email"
              autoComplete={mode === "signup" ? "email" : "username"}
              value={email}
              onChange={(e) => { setEmail(e.target.value); clearError(); }}
              placeholder="you@example.com"
              style={inputStyle}
            />
          </div>

          {/* Password */}
          <div style={{ marginBottom: error ? 10 : 20 }}>
            <label style={labelStyle} htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => { setPassword(e.target.value); clearError(); }}
              placeholder={mode === "signup" ? "At least 6 characters" : "••••••••"}
              style={inputStyle}
            />
          </div>

          {/* Error */}
          {error && (
            <p
              role="alert"
              style={{
                margin: "0 0 14px",
                padding: "8px 12px",
                background: "#FEF2F2",
                border: "1px solid #FECACA",
                borderRadius: 6,
                fontSize: 13,
                color: "#B91C1C",
              }}
            >
              {error}
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            style={{
              ...buttonStyle,
              background: submitting ? "#A5B4FC" : "#4F46E5",
              cursor: submitting ? "not-allowed" : "pointer",
            }}
          >
            {submitting ? "Please wait…" : mode === "signin" ? "Sign In" : "Create Account"}
          </button>
        </form>

        {/* Divider */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0" }}>
          <div style={{ flex: 1, height: 1, background: "#E5E7EB" }} />
          <span style={{ fontSize: 12, color: "#9CA3AF" }}>or</span>
          <div style={{ flex: 1, height: 1, background: "#E5E7EB" }} />
        </div>

        {/* Google */}
        <button
          type="button"
          onClick={handleGoogle}
          disabled={submitting}
          style={{
            ...buttonStyle,
            background: "#fff",
            color: "#374151",
            border: "1.5px solid #D1D5DB",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          {/* Google "G" logo */}
          <svg width={18} height={18} viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </button>
      </div>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInContent />
    </Suspense>
  );
}

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "#374151",
  marginBottom: 5,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "9px 12px",
  border: "1.5px solid #D1D5DB",
  borderRadius: 8,
  fontSize: 14,
  color: "#111827",
  outline: "none",
  fontFamily: "inherit",
  background: "#fff",
};

const buttonStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 0",
  borderRadius: 8,
  border: "none",
  fontSize: 14,
  fontWeight: 600,
  color: "#fff",
  cursor: "pointer",
  transition: "background 0.15s",
};
