import "server-only";

/**
 * The storefront's bridge to core-engine's gRPC service (search and offer revalidation). Browsers cannot speak gRPC, so route handlers
 * under app/api call this and hand plain JSON to the page. Authenticates with this app's service token only: core takes the caller's
 * identity from the credential, and lets a service token search and revalidate for the tenants/channels it is configured for — nothing else.
 */

import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import path from "path";
import { getServiceToken, invalidateServiceToken } from "./service-token";

// A runtime fs read Next's file tracer cannot see: the Dockerfile copies the proto and sets OTA_PROTO_PATH explicitly.
const PROTO_PATH = process.env.OTA_PROTO_PATH ?? path.resolve(process.cwd(), "..", "..", "shared", "protos", "ota.proto");
const GRPC_TARGET = process.env.CORE_ENGINE_GRPC_URL ?? "localhost:8081";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;
declare global {
  // eslint-disable-next-line no-var
  var __b2cGrpcClient: Client | undefined;
  // eslint-disable-next-line no-var
  var __b2cGrpcMetadataCtor: typeof grpc.Metadata | undefined;
}

function rebuildClient(): Client {
  const def = protoLoader.loadSync(PROTO_PATH, { keepCase: false, longs: String, enums: String, defaults: true, oneofs: true });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proto = grpc.loadPackageDefinition(def) as any;
  globalThis.__b2cGrpcClient = new proto.ota.v1.OtaCoreService(GRPC_TARGET, grpc.credentials.createInsecure());
  // Remember which Metadata class this client was built against — Next HMR can replace the module
  // while leaving a stale client on globalThis; then `metadata instanceof Metadata` fails with
  // "Incorrect arguments passed" on every search.
  globalThis.__b2cGrpcMetadataCtor = grpc.Metadata;
  return globalThis.__b2cGrpcClient;
}

function getClient(): Client {
  if (!globalThis.__b2cGrpcClient || globalThis.__b2cGrpcMetadataCtor !== grpc.Metadata) {
    return rebuildClient();
  }
  return globalThis.__b2cGrpcClient;
}

export class GrpcCallError extends Error {
  constructor(public readonly code: grpc.status, message: string) {
    super(message);
    this.name = "GrpcCallError";
  }
}

// search: core waits up to 18 s for a slow supplier before answering with what it has, so the deadline here must be longer than that.
export const GRPC_DEADLINES = { search: 25_000, slowSearch: 55_000, revalidate: 15_000 } as const; // slowSearch: core gives the slow airlines up to 45 s

function callOnce<TReq, TRes>(method: string, request: TReq, deadlineMs: number, bearer: string): Promise<TRes> {
  const metadata = new grpc.Metadata();
  metadata.set("authorization", `Bearer ${bearer}`);
  return new Promise((resolve, reject) => {
    try {
      getClient()[method](request, metadata, { deadline: new Date(Date.now() + deadlineMs) }, (err: grpc.ServiceError | null, res: TRes) => {
        if (err) reject(new GrpcCallError(err.code ?? grpc.status.UNKNOWN, err.details ?? err.message));
        else resolve(res);
      });
    } catch (err) {
      // Stale client after HMR (Metadata class identity changed): rebuild once and retry.
      if (err instanceof Error && /Incorrect arguments passed/i.test(err.message)) {
        rebuildClient();
        try {
          const retryMeta = new grpc.Metadata();
          retryMeta.set("authorization", `Bearer ${bearer}`);
          getClient()[method](request, retryMeta, { deadline: new Date(Date.now() + deadlineMs) }, (e2: grpc.ServiceError | null, res: TRes) => {
            if (e2) reject(new GrpcCallError(e2.code ?? grpc.status.UNKNOWN, e2.details ?? e2.message));
            else resolve(res);
          });
          return;
        } catch (err2) {
          reject(err2);
          return;
        }
      }
      reject(err);
    }
  });
}

export async function callCore<TReq, TRes>(method: string, request: TReq, deadlineMs: number): Promise<TRes> {
  try {
    return await callOnce<TReq, TRes>(method, request, deadlineMs, await getServiceToken());
  } catch (err) {
    // A cached service token can go stale (core restarted with new keys, client rotated): renew once.
    if (err instanceof GrpcCallError && err.code === grpc.status.UNAUTHENTICATED) {
      invalidateServiceToken();
      return callOnce<TReq, TRes>(method, request, deadlineMs, await getServiceToken());
    }
    throw err;
  }
}

/** google.protobuf.Timestamp as proto-loader returns it ({seconds, nanos}) -> epoch milliseconds. */
export function timestampMs(ts: { seconds?: string | number; nanos?: number } | null | undefined): number | null {
  if (!ts || ts.seconds === undefined) return null;
  return Number(ts.seconds) * 1000 + Math.floor((ts.nanos ?? 0) / 1_000_000);
}
