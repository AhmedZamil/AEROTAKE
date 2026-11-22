/**
 * Bridge to core-engine's gRPC service (OtaCoreService, port 8081, plaintext
 * HTTP/2 — no TLS anywhere in this stack). Browsers can't speak gRPC
 * directly (no HTTP/2 trailers, no protobuf framing from fetch), so this is
 * the only place a real gRPC call happens; every route under app/api/{search,
 * revalidate,booking/*} goes through callUnary() and gets plain JSON back.
 *
 * The client is a module-scope singleton behind a globalThis guard so that
 * Next dev's Fast Refresh re-evaluating this module doesn't leak a new
 * HTTP/2 channel on every hot reload (the same pattern used for a Prisma
 * client in Next.js). This relies on the app running as one persistent
 * Node process (true here — output: "standalone" under Docker) rather than
 * per-invocation serverless functions; revisit if that ever changes.
 */

import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import path from "path";
import { NextResponse } from "next/server";
import { notifyError } from "./alerts";
import { getServiceToken, invalidateServiceToken, ServiceCredentialError } from "./service-token";

// `process.cwd()` isn't a reliable anchor here: it's the frontend app's own
// directory under `next dev` (where the "../../shared/protos" default
// below is correct), but under the built standalone server or the Docker
// dev container it can be something else entirely — and this is a runtime
// `fs` read `@grpc/proto-loader` does, invisible to Next's `output:
// standalone` file-tracer, so it never gets auto-copied into the
// standalone bundle the way traced `import`/`require`s do. Both Docker
// paths (docker-compose.override.yml for dev, the Dockerfile for
// production) set OTA_PROTO_PATH explicitly rather than relying on this
// default resolving correctly by accident.
const PROTO_PATH =
  process.env.OTA_PROTO_PATH ?? path.resolve(process.cwd(), "..", "..", "shared", "protos", "ota.proto");
const GRPC_TARGET = process.env.CORE_ENGINE_GRPC_URL ?? "localhost:8081";

const LOADER_OPTIONS: protoLoader.Options = {
  keepCase: false, // proto snake_case -> JS camelCase, both directions
  longs: String,
  enums: String, // e.g. "BOOKING_STATUS_CONFIRMED" instead of a raw number
  defaults: true,
  oneofs: true,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OtaCoreServiceClient = any;

declare global {
  // eslint-disable-next-line no-var
  var __otaGrpcClient: OtaCoreServiceClient | undefined;
}

function buildClient(): OtaCoreServiceClient {
  const packageDefinition = protoLoader.loadSync(PROTO_PATH, LOADER_OPTIONS);
  const proto = grpc.loadPackageDefinition(packageDefinition) as any;
  return new proto.ota.v1.OtaCoreService(GRPC_TARGET, grpc.credentials.createInsecure());
}

function getClient(): OtaCoreServiceClient {
  if (!globalThis.__otaGrpcClient) {
    globalThis.__otaGrpcClient = buildClient();
  }
  return globalThis.__otaGrpcClient;
}

export class GrpcCallError extends Error {
  constructor(
    public readonly code: grpc.status,
    message: string,
  ) {
    super(message);
    this.name = "GrpcCallError";
  }
}

/**
 * Who a gRPC call is made as. core-engine authenticates every call and takes identity from the
 * credential, never from the request message:
 *  - `user`: a logged-in agent's verified access token — required for anything that books;
 *  - `service`: this app's own service token, for visitors who aren't logged in — core only
 *    allows it to search and revalidate, for the tenants/channels it is configured for.
 */
/** Registry/header spelling of a channel ("B2C", "B2B_AGENT", …) -> the proto enum name core expects. */
export function protoChannel(channel: string | null): string {
  return channel ? `CHANNEL_TYPE_${channel}` : "CHANNEL_TYPE_UNSPECIFIED";
}

export type GrpcCredential = { kind: "user"; accessToken: string } | { kind: "service" };

/**
 * Promisifies one of the generated client's unary methods. grpc-js calls
 * have no default deadline — an unresponsive core-engine would otherwise
 * hang the request indefinitely, so every call sets one explicitly.
 */
export async function callUnary<TRequest, TResponse>(
  method: string,
  request: TRequest,
  deadlineMs: number,
  credential: GrpcCredential,
): Promise<TResponse> {
  try {
    return await callOnce<TRequest, TResponse>(method, request, deadlineMs, await bearerFor(credential));
  } catch (err) {
    // A cached service token can go stale (core restarted with new keys, client rotated): renew once.
    if (credential.kind === "service" && err instanceof GrpcCallError && err.code === grpc.status.UNAUTHENTICATED) {
      invalidateServiceToken();
      return callOnce<TRequest, TResponse>(method, request, deadlineMs, await bearerFor(credential));
    }
    throw err;
  }
}

async function bearerFor(credential: GrpcCredential): Promise<string> {
  return credential.kind === "user" ? credential.accessToken : getServiceToken();
}

function callOnce<TRequest, TResponse>(
  method: string,
  request: TRequest,
  deadlineMs: number,
  bearer: string,
): Promise<TResponse> {
  const client = getClient();
  const deadline = new Date(Date.now() + deadlineMs);
  // gRPC metadata travels as an HTTP/2 header; core reads it as a standard bearer token.
  const metadata = new grpc.Metadata();
  metadata.set("authorization", `Bearer ${bearer}`);

  return new Promise((resolve, reject) => {
    client[method](request, metadata, { deadline }, (err: grpc.ServiceError | null, response: TResponse) => {
      if (err) {
        reject(new GrpcCallError(err.code ?? grpc.status.UNKNOWN, err.details ?? err.message));
        return;
      }
      resolve(response);
    });
  });
}

/** google.protobuf.Timestamp -> ISO 8601. proto-loader represents it as
 * {seconds, nanos} (seconds as a string, per the `longs: String` option),
 * not a JS Date, on the way out of a call. */
export function timestampToIso(ts: { seconds?: string | number; nanos?: number } | null | undefined): string | null {
  if (!ts || ts.seconds === undefined) return null;
  const millis = Number(ts.seconds) * 1000 + Math.floor((ts.nanos ?? 0) / 1_000_000);
  return new Date(millis).toISOString();
}

// Sized for real suppliers, not the stub: a search fans out to Sabre AND Hajee
// Air in parallel and Hajee alone takes ~3-4 s (measured), so an uncached
// search is ~6 s. The backend cuts a slow supplier off at 12 s and returns
// what it has, so 20 s here never fires before the backend's own answer.
// Reserve/issue make one or two supplier round trips (issue = retrieve PNR
// + issue ticket), each of which can take several seconds.
export const GRPC_DEADLINES = {
  search: 20_000,
  revalidate: 15_000,
  reserve: 30_000,
  issueTicket: 30_000,
} as const;

/**
 * Only structural/programmer-error conditions ever reach here as a thrown
 * RpcException on the backend (missing tenant_id, malformed GUIDs, not-found
 * rows, precondition failures). Genuine business rejections — insufficient
 * credit, expired offer, ticketing failure, idempotent replay — come back as
 * a normal OK response with a BookingStatus + failureReason in the body, not
 * an error; callers should inspect the response, not rely on this mapping,
 * to distinguish those.
 */
export function grpcStatusToHttp(code: grpc.status): number {
  switch (code) {
    case grpc.status.INVALID_ARGUMENT:
      return 400;
    case grpc.status.UNAUTHENTICATED:
      return 401;
    case grpc.status.PERMISSION_DENIED:
      return 403;
    case grpc.status.NOT_FOUND:
      return 404;
    case grpc.status.FAILED_PRECONDITION:
      return 409;
    case grpc.status.DEADLINE_EXCEEDED:
      return 504;
    case grpc.status.UNAVAILABLE:
      return 502;
    default:
      return 500;
  }
}

/**
 * Shared error->HTTP-response translation for every bridge route. A
 * GrpcCallError means the transport actually communicated a status code
 * (see grpcStatusToHttp); anything else means something broke before/around
 * the call itself. Either way, a 5xx-worthy failure gets alerted the same
 * way the old REST-based routes always did.
 */
export async function respondFromGrpcError(
  err: unknown,
  routeName: string,
  context: Record<string, string>,
): Promise<NextResponse> {
  if (err instanceof GrpcCallError) {
    const status = grpcStatusToHttp(err.code);
    if (status >= 500) {
      await notifyError(`${routeName}: core-engine gRPC error`, err, context);
    }
    return NextResponse.json({ error: "grpc_error", message: err.message }, { status });
  }

  if (err instanceof ServiceCredentialError) {
    console.error(`[${routeName}] service credential problem:`, err.message);
    await notifyError(`${routeName}: service credential problem`, err, context);
    return NextResponse.json(
      { error: "service_unavailable", message: "This is temporarily unavailable. Try again shortly." },
      { status: 503 },
    );
  }

  console.error(`[${routeName}] core-engine gRPC unreachable:`, err);
  await notifyError(`${routeName}: core-engine gRPC unreachable`, err, context);
  return NextResponse.json(
    { error: "upstream_unavailable", message: "This is temporarily unavailable. Try again shortly." },
    { status: 502 },
  );
}
