import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import DashboardShell from "@/components/dashboard/dashboard-shell";
import { getVerifiedClaims } from "@/lib/auth-session";
import { isPriceCheckEnabled } from "@/lib/price-check";
import { resolveTenantByApiKey, resolveTenantByHost } from "@/lib/tenants";

export const metadata: Metadata = {
  title: "Dashboard | AeroTake",
  description:
    "Search flights, track bookings, and manage ticket alerts from your AeroTake partner dashboard.",
};

/**
 * Real, server-side auth gate. middleware.ts only checks that a session
 * cookie exists for /dashboard/** — it deliberately never decodes or
 * refreshes (see its own doc comment on why). This is the layer that
 * actually verifies the session is still good: a fully-dead (refresh-token
 * expired) session gets redirected before any dashboard HTML ships, rather
 * than sitting rendered until some unrelated client fetch happens to notice.
 *
 * Read-only on purpose — getVerifiedClaims() never attempts a refresh here,
 * since Next only allows cookie writes during phase: 'action' (Server
 * Actions / Route Handlers), not during a Server Component's render.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const claims = await getVerifiedClaims();
  if (!claims) {
    redirect("/");
  }

  const h = await headers();
  const tenant = resolveTenantByApiKey(h.get("x-api-key")) ?? (await resolveTenantByHost(h.get("host")));
  // middleware.ts already rejects unregistered hosts; this keeps the type honest.
  if (!tenant) notFound();

  return (
    <DashboardShell identity={claims} branding={tenant.branding} showPriceCheck={isPriceCheckEnabled()}>
      {children}
    </DashboardShell>
  );
}
