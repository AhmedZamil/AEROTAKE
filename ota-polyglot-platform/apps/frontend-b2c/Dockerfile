# ---------------------------------------------------------------------------
# ota-frontend-b2c — consumer storefront (Next.js). Separate from
# apps/frontend-nextjs (B2B / agent portal): different app, different image,
# different service credentials.
# Build context is the REPO ROOT, same as the other services, so shared/
# (protos, later the generated core-client) stays reachable via COPY:
#   docker build -f apps/frontend-b2c/Dockerfile .
# ---------------------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /workspace/apps/frontend-b2c
# npm ci (not install): fails if package-lock.json and package.json disagree,
# so the image can't silently resolve different versions than the lockfile.
COPY apps/frontend-b2c/package.json apps/frontend-b2c/package-lock.json ./
# --ignore-scripts: postinstall needs scripts/ which isn't in this layer yet.
RUN npm ci --no-audit --no-fund --ignore-scripts

FROM node:22-alpine AS build
WORKDIR /workspace/apps/frontend-b2c
COPY --from=deps /workspace/apps/frontend-b2c/node_modules ./node_modules
COPY apps/frontend-b2c/ ./
ENV NEXT_TELEMETRY_DISABLED=1
# public/tesseract is gitignored — generate it here for the image.
RUN node scripts/copy-tesseract-assets.mjs && npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3001 \
    # "::" listens on IPv6 AND IPv4. With 0.0.0.0 only, the server refuses connections to "localhost" when that resolves to ::1 (it does inside the
    # container), and Next's image optimiser, which fetches each source image from the server itself, then hung forever: logos never loaded and the
    # browser never finished loading a page.
    HOSTNAME=::
# Standalone output includes neither public/ nor .next/static — both are
# copied explicitly (public/ holds the site's images).
COPY --from=build --chown=node:node /workspace/apps/frontend-b2c/.next/standalone ./
COPY --from=build --chown=node:node /workspace/apps/frontend-b2c/.next/static ./.next/static
COPY --from=build --chown=node:node /workspace/apps/frontend-b2c/public ./public
# The gRPC bridge (src/server/grpc-client.ts) reads the contract at runtime — a file read Next's tracer cannot see, so it is copied explicitly.
COPY --chown=node:node shared/protos/ ./shared/protos/
ENV OTA_PROTO_PATH=/app/shared/protos/ota.proto
USER node
EXPOSE 3001
CMD ["node", "server.js"]
