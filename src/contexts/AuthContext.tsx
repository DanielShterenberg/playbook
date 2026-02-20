"use client";

/**
 * AuthContext — provides the current Firebase Auth user to the component tree.
 *
 * Implements issue #73: auth state persisted across sessions.
 *
 * Usage:
 *   const { user, loading } = useAuth();
 *
 * `loading` is true until the first onAuthStateChanged callback fires.
 * While loading, render a spinner rather than redirecting.
 */

import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { auth } from "@/lib/firebase";

interface AuthContextValue {
  /** The currently signed-in Firebase user, or null if not authenticated. */
  user: FirebaseUser | null;
  /** True while the initial auth state is being resolved (avoids flash). */
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue>({ user: null, loading: true });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
