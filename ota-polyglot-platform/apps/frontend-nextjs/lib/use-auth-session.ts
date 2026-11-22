"use client";

import { useEffect, useState } from "react";

export interface AuthSessionUser {
  sub?: string;
  role?: string;
  tenantId?: string;
  agentId?: string;
}

interface AuthSessionState {
  loading: boolean;
  authenticated: boolean;
  user: AuthSessionUser | null;
}

/**
 * Client-side session status, backed by GET /api/auth/session — the session
 * cookie is httpOnly, so this is the only way client components can know
 * whether a session exists. The endpoint transparently refreshes an expired
 * access token before answering, so a `false` result here means the session
 * is genuinely gone (never logged in, explicitly logged out, or the refresh
 * token itself expired), not just "the access token happened to be stale."
 */
export function useAuthSession(): AuthSessionState {
  const [state, setState] = useState<AuthSessionState>({
    loading: true,
    authenticated: false,
    user: null,
  });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/session", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setState({ loading: false, authenticated: Boolean(data.authenticated), user: data.user ?? null });
      })
      .catch(() => {
        if (!cancelled) setState({ loading: false, authenticated: false, user: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
