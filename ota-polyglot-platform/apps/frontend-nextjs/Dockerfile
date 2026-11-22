# ---------------------------------------------------------------------------
# ota-frontend — multi-tenant Next.js storefront (B2C + B2B + white-label)
# Build context must be the REPO ROOT so /shared/protos is available (the
# gRPC bridge in lib/grpc-client.ts loads shared/protos/ota.proto at request
# time) — same reason apps/core-engine-dotnet/Dockerfile needs it:
#   docker build -f apps/frontend-nextjs/Dockerfile .
# ---------------------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /workspace/apps/frontend-nextjs
COPY apps/frontend-nextjs/package.json ./
RUN npm install --no-audit --no-fund

FROM node:22-alpine AS build
WORKDIR /workspace
COPY shared/protos/ shared/protos/
COPY apps/frontend-nextjs/ apps/frontend-nextjs/
COPY --from=deps /workspace/apps/frontend-nextjs/node_modules apps/frontend-nextjs/node_modules

WORKDIR /workspace/apps/frontend-nextjs
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Next's output-file tracing for `output: "standalone"` only follows static
# import/require graphs — it can't see @grpc/proto-loader's runtime `fs`
# read of ota.proto, so that file needs its own explicit COPY here, same as
# .next/static does (also never auto-included in the standalone output).
COPY --from=build /workspace/apps/frontend-nextjs/.next/standalone ./
COPY --from=build /workspace/apps/frontend-nextjs/.next/static ./.next/static
COPY --from=build /workspace/shared/protos ./shared/protos
ENV OTA_PROTO_PATH=/app/shared/protos/ota.proto

EXPOSE 3000
CMD ["node", "server.js"]
