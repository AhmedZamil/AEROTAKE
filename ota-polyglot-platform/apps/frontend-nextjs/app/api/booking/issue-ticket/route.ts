import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { TENANT_HEADERS } from "@/lib/tenants";
import { requireVerifiedAgentSessionWithToken } from "@/lib/auth-session";
import { callUnary, GRPC_DEADLINES, protoChannel, respondFromGrpcError, timestampToIso } from "@/lib/grpc-client";

/**
 * Bridge to IssueTicket (gRPC) — pays (debits the agent's credit ledger via
 * AgentCreditService) and tickets a Pending booking; this is also what
 * writes the booking-created/agent-credit-deducted OutboxEvents rows.
 * Session-gated for the same reason /api/booking/reserve is — see that
 * route's comment.
 */
export async function POST(request: NextRequest) {
  const h = await headers();
  const tenantIdForRefresh = h.get(TENANT_HEADERS.tenantId) ?? "";

  const session = await requireVerifiedAgentSessionWithToken(tenantIdForRefresh);
  const claims = session?.claims;
  if (!session || !claims) {
    return NextResponse.json({ error: "not_authenticated", message: "Log in to issue a ticket." }, { status: 401 });
  }

  let body: { bookingId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json", message: "Request body must be JSON." }, { status: 400 });
  }
  if (!body.bookingId) {
    return NextResponse.json({ error: "invalid_request", message: "bookingId is required." }, { status: 400 });
  }

  const grpcRequest = {
    tenant: {
      tenantId: claims.tenantId,
      agentId: claims.agentId ?? "",
      channel: protoChannel(h.get(TENANT_HEADERS.channel)),
    },
    bookingId: body.bookingId,
  };

  try {
    const response = await callUnary<typeof grpcRequest, any>("IssueTicket", grpcRequest, GRPC_DEADLINES.issueTicket, { kind: "user", accessToken: session.accessToken });
    return NextResponse.json({ ...response, createdAt: timestampToIso(response.createdAt) });
  } catch (err) {
    return respondFromGrpcError(err, "booking/issue-ticket", { tenantId: claims.tenantId, agentId: claims.agentId ?? "" });
  }
}
