import { NextRequest, NextResponse } from "next/server";
import { notifyError } from "./lib/alerts";
import {
  resolveTenantByApiKey,
  resolveTenantByHost,
  TENANT_HEADERS,
  TenantRegistryUnavailableError,
} from "./lib/tenants";

// Duplicated from lib/auth-session.ts's SESSION_COOKIE rather than imported:
// that module uses next/headers + Node's Buffer (for unverified JWT decode),
// neither of which belong in this Edge-runtime file. Middleware only checks
// cookie *presence* — it never decodes or refreshes — so this literal is all
// it needs; keep the two in sync if the cookie is ever renamed.
const SESSION_COOKIE = "ota_session";

/**
 * Tenant & White-Label resolution middleware, plus a coarse auth guard for
 * /dashboard/**.
 *
 * Order of precedence:
 *   1. `X-Api-Key` header  → B2B API consumers (demo keys only, off by default)
 *   2. `Host` header       → looked up in core-engine's tenant registry
 *   An unregistered host is rejected (404) — there is no default-tenant fallback.
 *   If core cannot be reached and the host isn't cached, the answer is 503.
 *
 * The resolved TenantContext is propagated two ways:
 *   - request headers (X-Tenant-ID, X-Channel, X-Agent-*) so server components,
 *     route handlers, and downstream microservice calls all agree on identity;
 *   - a rewrite to /dashboard for B2B/white-label channels so the portal layout
 *     switches without exposing internal routing to the user.
 *
 * The auth guard below only checks whether `ota_session` exists for
 * /dashboard/** — it does not decode or refresh (that stays reactive, in
 * lib/auth-session.ts's performRefresh, to avoid every concurrent request on
 * a page load independently deciding to refresh).
 *
 * The B2B/white-label rewrite is ALSO gated on cookie presence now — it
 * used to unconditionally rewrite "/" to "/dashboard" regardless of login
 * state, which was harmless while the dashboard only showed fake data, but
 * became a real infinite loop once app/dashboard/layout.tsx started doing a
 * real server-side auth check: rewrite to /dashboard -> layout redirects to
 * "/" -> same host, same pathname "/" -> rewritten to /dashboard again,
 * forever, with no path left that ever reaches the actual login form on a
 * white-label host. Requiring the cookie here means a logged-out visitor
 * falls through to the real "/" route (the login form) instead.
 */
export async function middleware(request: NextRequest) {
  try {
    const apiKey = request.headers.get("x-api-key");
    const keyTenant = resolveTenantByApiKey(apiKey);

    // Invalid API key on an API route → reject early, never fall back to a host tenant.
    if (apiKey && !keyTenant) {
      return NextResponse.json(
        { error: "invalid_api_key", message: "Unknown or revoked API key." },
        { status: 401 }
      );
    }

    const tenant = keyTenant ?? (await resolveTenantByHost(request.headers.get("host")));
    if (!tenant) {
      return NextResponse.json(
        { error: "unknown_host", message: "This host is not a registered tenant domain." },
        { status: 404 }
      );
    }

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(TENANT_HEADERS.tenantId, tenant.tenantId);
    requestHeaders.set(TENANT_HEADERS.channel, tenant.channel);
    requestHeaders.set(TENANT_HEADERS.brandName, tenant.branding.name);
    if (tenant.agentId) requestHeaders.set(TENANT_HEADERS.agentId, tenant.agentId);
    if (tenant.agentTier) requestHeaders.set(TENANT_HEADERS.agentTier, tenant.agentTier);

    // Portal layout switching: B2B/white-label homepages render the dashboard
    // shell — but only once logged in; see the doc comment above for why
    // this must not fire for a logged-out visitor.
    const { pathname } = request.nextUrl;
    const isB2BChannel = tenant.channel !== "B2C";
    const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
    if (isB2BChannel && pathname === "/" && hasSession) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
    }

    // Auth guard: no session cookie at all means never logged in (or
    // explicitly logged out) — bounce to the login page before rendering
    // anything under /dashboard.
    if (pathname.startsWith("/dashboard") && !hasSession) {
      return NextResponse.redirect(new URL("/", request.url));
    }

    const response = NextResponse.next({ request: { headers: requestHeaders } });

    // Expose lightweight branding hints to the client (non-sensitive only).
    response.headers.set(TENANT_HEADERS.tenantId, tenant.tenantId);
    response.headers.set(TENANT_HEADERS.channel, tenant.channel);
    return response;
  } catch (err) {
    if (err instanceof TenantRegistryUnavailableError) {
      console.error("[middleware] tenant registry unavailable:", err.message);
      void notifyError("Tenant registry unavailable", err, { path: request.nextUrl.pathname });
      return NextResponse.json(
        { error: "tenant_registry_unavailable", message: "Service temporarily unavailable." },
        { status: 503 }
      );
    }
    console.error("[middleware] unhandled error:", err);
    // Fire-and-forget: middleware must return synchronously-ish and can't
    // block the response on alert delivery.
    void notifyError("Middleware unhandled error", err, { path: request.nextUrl.pathname });
    return NextResponse.json(
      { error: "internal_error", message: "The error has been logged and the on-call channel notified." },
      { status: 500 }
    );
  }
}

export const config = {
  // Everything except static assets and Next internals.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|branding).*)"],
};
