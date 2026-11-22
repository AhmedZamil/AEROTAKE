import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { TENANT_HEADERS } from "@/lib/tenants";
import { verifiedSessionWithToken } from "@/lib/auth-session";
import { callUnary, GRPC_DEADLINES, protoChannel, respondFromGrpcError, type GrpcCredential } from "@/lib/grpc-client";

/**
 * Bridge to RevalidateOffer (gRPC) — re-checks a previously-returned offer's
 * price right before booking; a client-sent price is never trusted. Same
 * anonymous-allowed, tenant-from-headers shape as /api/search — see that
 * route's comment for why this pair doesn't need verified identity the way
 * /api/booking/* does.
 */
export async function POST(request: NextRequest) {
  const h = await headers();
  const tenantId = h.get(TENANT_HEADERS.tenantId);
  if (!tenantId) {
    return NextResponse.json(
      { error: "tenant_unresolved", message: "Middleware did not stamp a tenant." },
      { status: 500 }
    );
  }

  let body: { offerId?: string; expectedNetRate?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json", message: "Request body must be JSON." }, { status: 400 });
  }
  if (!body.offerId || typeof body.expectedNetRate !== "number") {
    return NextResponse.json(
      { error: "invalid_request", message: "offerId and expectedNetRate are required." },
      { status: 400 }
    );
  }

  // Same credential rule as /api/search: the agent's own token when logged in, otherwise this app's service token.
  const session = await verifiedSessionWithToken(tenantId).catch(() => null);
  const credential: GrpcCredential = session ? { kind: "user", accessToken: session.accessToken } : { kind: "service" };

  const grpcRequest = {
    tenant: {
      tenantId: session?.claims.tenantId ?? tenantId,
      channel: protoChannel(h.get(TENANT_HEADERS.channel)),
      agentId: session?.claims.agentId ?? h.get(TENANT_HEADERS.agentId) ?? "",
    },
    offerId: body.offerId,
    expectedNetRate: body.expectedNetRate,
  };

  try {
    const response = await callUnary("RevalidateOffer", grpcRequest, GRPC_DEADLINES.revalidate, credential);
    return NextResponse.json(response);
  } catch (err) {
    return respondFromGrpcError(err, "revalidate", { tenantId });
  }
}
