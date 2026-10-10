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
import Logo from "@/components/brand/Logo";
import ThemeToggle from "@/components/brand/ThemeToggle";
import {
  signInWithEmail,
  signUpWithEmail,
  signInWithGoogle,
  authErrorMessage,
} from "@/lib/auth";

type Mode = "signin" | "signup";

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const PAGE = "relative flex min-h-screen flex-col items-center justify-center bg-app px-4 py-20 text-ink";

const LABEL = "mb-1.5 block font-display text-[13px] font-semibold uppercase tracking-[0.06em] text-muted";

// 16px text on small screens so iOS does not zoom the page on focus.
const INPUT =
  "block h-11 w-full rounded-lg border border-line-strong bg-surface px-3 font-sans text-base text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent sm:text-sm";

const BUTTON =
  "flex h-11 w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-60";

/** Shown while the auth state resolves (and as the Suspense fallback). */
function SignInLoading() {
  return (
    <main className={PAGE} aria-label="Loading" aria-busy="true">
      <svg width={36} height={36} viewBox="0 0 36 36" fill="none" aria-hidden="true" className="animate-spin">
        <circle cx={18} cy={18} r={14} stroke="var(--color-line)" strokeWidth={4} />
        <path d="M18 4 A14 14 0 0 1 32 18" stroke="var(--color-accent)" strokeWidth={4} strokeLinecap="round" />
      </svg>
    </main>
  );
}

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

  // While checking auth, show the themed loading screen (AuthGuard handles
  // this elsewhere, but this is the public sign-in page).
  if (loading) return <SignInLoading />;

  return (
    <main className={PAGE}>
      <ThemeToggle className="absolute right-4 top-4" />

      {/* Card */}
      <div className="w-full max-w-[400px] rounded-xl border border-line bg-surface px-5 pb-6 pt-8 sm:px-8 sm:pb-8">
        {/* Logo + title */}
        <div className="mb-6 text-center">
          <h1 className="m-0">
            <Logo size={44} stacked />
          </h1>
          <p className="m-0 mt-2 text-sm text-muted">
            {mode === "signin" ? "Sign in to your account" : "Create a new account"}
          </p>
        </div>

        {/* Mode toggle */}
        <div role="group" aria-label="Sign in or sign up" className="mb-6 flex overflow-hidden rounded-lg border border-line">
          {(["signin", "signup"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setError(""); }}
              aria-pressed={mode === m}
              className={`h-11 flex-1 text-sm transition-colors ${
                mode === m ? "bg-chip font-semibold text-ink" : "bg-transparent text-muted hover:text-ink"
              }`}
            >
              {m === "signin" ? "Sign In" : "Sign Up"}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} noValidate>
          {/* Name (sign-up only) */}
          {mode === "signup" && (
            <div className="mb-3.5">
              <label className={LABEL} htmlFor="name">Name</label>
              <input
                id="name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => { setName(e.target.value); clearError(); }}
                placeholder="Your name"
                className={INPUT}
              />
            </div>
          )}

          {/* Email */}
          <div className="mb-3.5">
            <label className={LABEL} htmlFor="email">Email</label>
            <input
              id="email"
              ref={emailRef}
              type="email"
              autoComplete={mode === "signup" ? "email" : "username"}
              value={email}
              onChange={(e) => { setEmail(e.target.value); clearError(); }}
              placeholder="you@example.com"
              className={INPUT}
            />
          </div>

          {/* Password */}
          <div className={error ? "mb-2.5" : "mb-5"}>
            <label className={LABEL} htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => { setPassword(e.target.value); clearError(); }}
              placeholder={mode === "signup" ? "At least 6 characters" : "••••••••"}
              className={INPUT}
            />
          </div>

          {/* Error */}
          {error && (
            <p role="alert" className="m-0 mb-3.5 rounded-lg border border-danger bg-app px-3 py-2 text-[13px] font-medium text-danger">
              {error}
            </p>
          )}

          {/* Submit */}
          <button type="submit" disabled={submitting} className={`${BUTTON} bg-accent text-accent-ink hover:opacity-90`}>
            {submitting ? "Please wait…" : mode === "signin" ? "Sign In" : "Create Account"}
          </button>
        </form>

        {/* Divider */}
        <div className="my-4 flex items-center gap-2.5">
          <div className="h-px flex-1 bg-line" />
          <span className="text-xs text-muted">or</span>
          <div className="h-px flex-1 bg-line" />
        </div>

        {/* Google */}
        <button
          type="button"
          onClick={handleGoogle}
          disabled={submitting}
          className={`${BUTTON} border border-line-strong bg-surface text-ink hover:bg-app`}
        >
          {/* Google "G" logo — brand colours, the same in both themes */}
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
    <Suspense fallback={<SignInLoading />}>
      <SignInContent />
    </Suspense>
  );
}
