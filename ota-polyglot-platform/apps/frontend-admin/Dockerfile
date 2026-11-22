# Company admin (B2B + B2C). Build from the repo root:
#   docker build -f apps/frontend-admin/Dockerfile .
FROM node:22-alpine AS deps
WORKDIR /workspace/apps/frontend-admin
COPY apps/frontend-admin/package.json apps/frontend-admin/package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS build
WORKDIR /workspace/apps/frontend-admin
COPY --from=deps /workspace/apps/frontend-admin/node_modules ./node_modules
COPY apps/frontend-admin/ ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3002 \
    HOSTNAME=::
COPY --from=build --chown=node:node /workspace/apps/frontend-admin/.next/standalone ./
COPY --from=build --chown=node:node /workspace/apps/frontend-admin/.next/static ./.next/static
COPY --from=build --chown=node:node /workspace/apps/frontend-admin/public ./public
USER node
EXPOSE 3002
CMD ["node", "server.js"]
