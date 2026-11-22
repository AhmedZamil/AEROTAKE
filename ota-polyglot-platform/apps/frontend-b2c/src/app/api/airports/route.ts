import { NextRequest, NextResponse } from "next/server";
import { coreFetch } from "@/server/core-rest";
import { unavailable, unknownSite } from "@/server/session";

/** Airport typeahead: core-engine's global airport directory (the same one the agent portal uses). Read-only reference data. */
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length === 0 || q.length > 40) return NextResponse.json({ items: [] });
  try {
    const result = await coreFetch(`/api/v1/airports?query=${encodeURIComponent(q)}&limit=8`);
    if (result === "unknown_site") return unknownSite();
    if (result.status !== 200) return unavailable();
    const res = NextResponse.json(result.body ?? { items: [] });
    res.headers.set("Cache-Control", "public, max-age=3600"); // the directory barely changes
    return res;
  } catch (err) {
    console.error("[airports]", err);
    return unavailable();
  }
}
