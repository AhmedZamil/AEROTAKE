/** Browser-facing session helpers. Tokens stay in httpOnly cookies; this only talks to our own routes. */

export type AuthUser = {
  email: string;
  name: string;
  tenantId: string;
  tenantLabel: string;
  role: string;
};

export const ADMIN_TENANTS = [
  {
    id: "demo-tenant",
    label: "B2B agencies",
    hint: "demo-tenant",
    email: "admin@skybridge.example",
  },
  {
    id: "aerotake-b2c",
    label: "B2C storefront",
    hint: "aerotake-b2c",
    email: "admin@aerotake-b2c.example",
  },
] as const;

export function tenantLabel(tenantId: string): string {
  return ADMIN_TENANTS.find((t) => t.id === tenantId)?.label ?? tenantId;
}

export async function fetchSession(): Promise<AuthUser | null> {
  const res = await fetch("/api/auth/session", { cache: "no-store" });
  if (!res.ok) return null;
  const body = (await res.json()) as { user?: AuthUser | null };
  return body.user ?? null;
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
}
