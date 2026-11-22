/**
 * Verifies agent JWTs against the public keys core publishes. This app holds no signing secret.
 * Only ES256 is accepted. A key is used only when it was published for the audience being checked.
 */

import { decodeProtectedHeader, importJWK, jwtVerify, type JWTPayload, type JWK } from "jose";

type VerifyKey = CryptoKey | Uint8Array;

const CORE_ENGINE_URL = process.env.CORE_ENGINE_REST_URL ?? "http://localhost:8080";
const JWKS_URL = `${CORE_ENGINE_URL}/.well-known/jwks.json`;
const REFRESH_AFTER_MS = 5 * 60_000;
const UNKNOWN_KID_COOLDOWN_MS = 15_000;
const FETCH_TIMEOUT_MS = 2_000;
const ALGORITHM = "ES256";

interface PublishedJwk extends JWK {
  ota_aud?: string;
}

let cached: { keys: PublishedJwk[]; fetchedAt: number } | null = null;
let lastForcedFetchAt = 0;
const imported = new Map<string, VerifyKey>();

async function fetchJwks(): Promise<PublishedJwk[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(JWKS_URL, { cache: "no-store", signal: controller.signal });
    if (!res.ok) throw new Error(`jwks answered ${res.status}`);
    const body = (await res.json()) as { keys?: PublishedJwk[] };
    if (!Array.isArray(body.keys)) throw new Error("jwks has no keys array");
    return body.keys;
  } finally {
    clearTimeout(timer);
  }
}

async function loadKeys(force: boolean): Promise<PublishedJwk[]> {
  const now = Date.now();
  const fresh = cached && now - cached.fetchedAt < REFRESH_AFTER_MS;
  const forceAllowed = force && now - lastForcedFetchAt >= UNKNOWN_KID_COOLDOWN_MS;
  if (fresh && !forceAllowed) return cached!.keys;

  if (force) lastForcedFetchAt = now;
  try {
    const keys = await fetchJwks();
    cached = { keys, fetchedAt: now };
    imported.clear();
    return keys;
  } catch (err) {
    if (cached) return cached.keys;
    throw err;
  }
}

async function keyFor(kid: string, audience: string): Promise<VerifyKey | null> {
  const find = (keys: PublishedJwk[]) => keys.find((k) => k.kid === kid && k.ota_aud === audience && k.kty === "EC");
  let jwk = find(await loadKeys(false));
  if (!jwk) jwk = find(await loadKeys(true));
  if (!jwk) return null;

  const cacheKey = `${audience}:${kid}`;
  let key = imported.get(cacheKey);
  if (!key) {
    key = await importJWK(jwk, ALGORITHM);
    imported.set(cacheKey, key);
  }
  return key;
}

export async function verifyJwt(
  token: string,
  opts: { issuer: string; audience: string },
): Promise<JWTPayload | null> {
  try {
    const header = decodeProtectedHeader(token);
    if (header.alg !== ALGORITHM || typeof header.kid !== "string") return null;
    const key = await keyFor(header.kid, opts.audience);
    if (!key) return null;
    const { payload } = await jwtVerify(token, key, {
      issuer: opts.issuer,
      audience: opts.audience,
      algorithms: [ALGORITHM],
    });
    return payload;
  } catch {
    return null;
  }
}
