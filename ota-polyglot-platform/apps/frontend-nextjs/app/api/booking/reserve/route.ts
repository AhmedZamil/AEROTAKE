import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { TENANT_HEADERS } from "@/lib/tenants";
import { requireVerifiedAgentSessionWithToken } from "@/lib/auth-session";
import { callUnary, GRPC_DEADLINES, protoChannel, respondFromGrpcError, timestampToIso } from "@/lib/grpc-client";

interface ReserveBody {
  offerId?: string;
  searchId?: string;
  travelers?: unknown[];
  contactEmail?: string;
  contactPhone?: string;
  idempotencyKey?: string;
  paymentMode?: string;
}

/**
 * Bridge to ProcessB2BBooking (gRPC) — reserves the PNR, no payment yet.
 * Session-gated: core-engine's gRPC service has no auth of its own and
 * trusts whatever tenant_id/agent_id the request claims (see
 * lib/auth-session.ts's module doc comment), so tenantId/agentId here come
 * ONLY from the verified access token, never from the request body. Channel/
 * currency/agentTier come from the middleware-stamped headers same as the
 * anonymous routes — the backend re-derives pricing from the agent's own DB
 * row for this RPC (OtaCoreGrpcService.cs:134), so those fields are cosmetic
 * here, unlike on /api/search.
 */
export async function POST(request: NextRequest) {
  const h = await headers();
  const tenantIdForRefresh = h.get(TENANT_HEADERS.tenantId) ?? "";

  const session = await requireVerifiedAgentSessionWithToken(tenantIdForRefresh);
  const claims = session?.claims;
  if (!session || !claims) {
    return NextResponse.json({ error: "not_authenticated", message: "Log in to reserve a booking." }, { status: 401 });
  }

  let body: ReserveBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json", message: "Request body must be JSON." }, { status: 400 });
  }
  if (!body.offerId || !body.idempotencyKey || !Array.isArray(body.travelers) || body.travelers.length === 0) {
    return NextResponse.json(
      { error: "invalid_request", message: "offerId, idempotencyKey, and at least one traveler are required." },
      { status: 400 }
    );
  }

  const grpcRequest = {
    tenant: {
      tenantId: claims.tenantId,
      agentId: claims.agentId ?? "",
      channel: protoChannel(h.get(TENANT_HEADERS.channel)),
      currency: "USD",
    },
    offerId: body.offerId,
    searchId: body.searchId ?? "",
    travelers: body.travelers,
    contactEmail: body.contactEmail ?? "",
    contactPhone: body.contactPhone ?? "",
    idempotencyKey: body.idempotencyKey,
    paymentMode: body.paymentMode ?? "CREDIT_LEDGER",
  };

  try {
    const response = await callUnary<typeof grpcRequest, any>("ProcessB2BBooking", grpcRequest, GRPC_DEADLINES.reserve, { kind: "user", accessToken: session.accessToken });
    return NextResponse.json({ ...response, createdAt: timestampToIso(response.createdAt) });
  } catch (err) {
    return respondFromGrpcError(err, "booking/reserve", { tenantId: claims.tenantId, agentId: claims.agentId ?? "" });
  }
}
