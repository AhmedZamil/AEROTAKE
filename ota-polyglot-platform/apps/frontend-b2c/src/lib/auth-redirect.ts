/** Relative path only — blocks open redirects (`//evil`, `https://…`). */
export function safeNextPath(raw: string | null | undefined, fallback = "/my-bookings"): string {
  if (!raw) return fallback;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("://")) return fallback;
  return trimmed;
}

export function loginHref(next?: string): string {
  if (!next) return "/login";
  return `/login?next=${encodeURIComponent(safeNextPath(next, "/booking/passengers"))}`;
}
