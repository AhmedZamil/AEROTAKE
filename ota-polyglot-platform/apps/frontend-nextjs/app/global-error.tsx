"use client";

import { useEffect } from "react";

/**
 * Catches unhandled render/render-lifecycle errors that escape every route
 * segment. Must be a Client Component and must render its own <html>/<body>
 * since it replaces the root layout when triggered. Reports to a server-side
 * API route rather than calling lib/alerts.ts directly (see that route for why).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    fetch("/api/log-client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        digest: error.digest,
        path: typeof window !== "undefined" ? window.location.pathname : "",
      }),
    }).catch((err) => console.error("[global-error] failed to report client error:", err));
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, sans-serif", padding: 32 }}>
        <h1 style={{ fontSize: 24 }}>Something went wrong.</h1>
        <p style={{ color: "#555" }}>The error has been logged and the on-call channel notified.</p>
        <button onClick={reset} style={{ marginTop: 16, padding: "8px 16px" }}>
          Try again
        </button>
      </body>
    </html>
  );
}
