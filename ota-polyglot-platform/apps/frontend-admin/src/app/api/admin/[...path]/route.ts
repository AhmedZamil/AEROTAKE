import { NextRequest, NextResponse } from "next/server";
import { proxyAdmin } from "@/server/core";

const ALLOWED = [
  /^exchange-rates$/,
  /^exchange-rates\/[0-9a-fA-F-]{36}$/,
  /^markup-rules$/,
  /^markup-rules\/[0-9a-fA-F-]{36}$/,
  /^markup-rules\/[0-9a-fA-F-]{36}\/(activate|deactivate)$/,
  /^agencies$/,
  /^agencies\/[0-9a-fA-F-]{36}$/,
  /^agencies\/[0-9a-fA-F-]{36}\/(activate|deactivate)$/,
  /^cancellation-requests$/,
  /^cancellation-requests\/[0-9a-fA-F-]{36}\/(complete|reject)$/,
];

async function handle(request: NextRequest, path: string[]) {
  const rel = path.join("/");
  if (!ALLOWED.some((re) => re.test(rel))) {
    return NextResponse.json({ error: "not_found", message: "That admin route is not available." }, { status: 404 });
  }

  const method = request.method;
  const hasBody = method !== "GET" && method !== "HEAD" && method !== "DELETE";
  const body = hasBody ? await request.text() : undefined;
  // Cancel resolve lives under /api/v1/admin/… so it stays off the customer and agency APIs.
  const corePath = rel.startsWith("cancellation-requests") ? `/api/v1/admin/${rel}` : `/api/v1/${rel}`;
  return proxyAdmin(`${corePath}${request.nextUrl.search}`, { method, body });
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return handle(request, path);
}
export async function POST(request: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return handle(request, path);
}
export async function PUT(request: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return handle(request, path);
}
export async function DELETE(request: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return handle(request, path);
}
