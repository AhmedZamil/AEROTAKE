export class AdminApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function adminApi<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? "GET",
    headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });

  if (res.status === 204) return undefined as T;

  const payload = (await res.json().catch(() => null)) as { message?: string; error?: string } | T | null;
  if (!res.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload && payload.message
        ? payload.message
        : `Request failed (${res.status}).`;
    throw new AdminApiError(message, res.status);
  }
  return payload as T;
}

export const TIERS = [
  { value: 1, label: "Standard" },
  { value: 2, label: "Silver" },
  { value: 3, label: "Gold" },
  { value: 4, label: "Platinum" },
] as const;

export const PRODUCTS = ["*", "Flight", "Hotel", "Package", "Activity"] as const;
