import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { TENANT_HEADERS } from "@/lib/tenants";
import { verifiedSessionWithToken } from "@/lib/auth-session";
import { callUnary, GRPC_DEADLINES, protoChannel, respondFromGrpcError, timestampToIso, type GrpcCredential } from "@/lib/grpc-client";

/**
 * Bridge to GetSupplierAvailability (gRPC, core-engine:8081) — there is no
 * REST equivalent on the backend at all, so this is a real protobuf call,
 * not a fetch proxy like the auth routes. Anonymous-allowed: search doesn't
 * move money. core-engine authenticates every gRPC call, so a logged-in agent's
 * search is made with their own token (and priced at their stored tier), and an
 * anonymous visitor's with this app's service token, which core only lets
 * search/revalidate for the tenants and channels it is configured for.
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

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json", message: "Request body must be JSON." }, { status: 400 });
  }

  // Logged in: the agent's own verified token is the credential, and core takes tenant, agent and
  // channel from it. Anonymous: this app's service token, with the tenant/channel resolved from the
  // host (and the white-label agent, if the domain trades as one) asserted in the message.
  const session = await verifiedSessionWithToken(tenantId).catch(() => null);
  const credential: GrpcCredential = session ? { kind: "user", accessToken: session.accessToken } : { kind: "service" };

  const grpcRequest = {
    tenant: {
      tenantId: session?.claims.tenantId ?? tenantId,
      channel: protoChannel(h.get(TENANT_HEADERS.channel)),
      agentId: session?.claims.agentId ?? h.get(TENANT_HEADERS.agentId) ?? "",
    },
    productType: body.productType ?? "PRODUCT_TYPE_UNSPECIFIED",
    origin: body.origin ?? "",
    destination: body.destination ?? "",
    checkIn: body.checkIn ?? "",
    checkOut: body.checkOut ?? "",
    adults: body.adults ?? 0,
    children: body.children ?? 0,
    rooms: body.rooms ?? 0,
    filters: body.filters ?? {},
  };

  try {
    const response = await callUnary<typeof grpcRequest, any>(
      "GetSupplierAvailability",
      grpcRequest,
      GRPC_DEADLINES.search,
      credential
    );

    return NextResponse.json({
      searchId: response.searchId,
      cacheHit: response.cacheHit,
      warnings: response.warnings ?? [],
      latencyMs: Number(response.latencyMs),
      offers: (response.offers ?? []).map((offer: any) => ({
        ...offer,
        expiresAt: timestampToIso(offer.expiresAt),
        segments: (offer.segments ?? []).map((seg: any) => ({
          ...seg,
          departureTime: timestampToIso(seg.departureTime),
          arrivalTime: timestampToIso(seg.arrivalTime),
        })),
      })),
    });
  } catch (err) {
    return respondFromGrpcError(err, "search", { tenantId });
  }
}
