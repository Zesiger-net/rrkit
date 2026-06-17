# syntax=docker/dockerfile:1

# ---- base: node + pnpm ----
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# ---- build: install, build all packages, prune to a prod deploy ----
FROM base AS build
# better-sqlite3 may need to compile if no prebuilt binary matches.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# Install deps first (cache-friendly).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/api/package.json packages/api/
COPY packages/tracker/package.json packages/tracker/
COPY packages/dashboard/package.json packages/dashboard/
RUN pnpm install --frozen-lockfile

# Build shared -> tracker -> dashboard -> api.
COPY . .
RUN pnpm build:shared \
  && pnpm build:tracker \
  && pnpm build:dashboard \
  && pnpm build:api

# Produce a self-contained production bundle for the API (node_modules + dist).
RUN pnpm --filter=@rrkit/api deploy --prod /app/deploy

# ---- runtime: slim image running only the API ----
FROM node:22-slim AS runtime
ENV NODE_ENV=production
ENV RRKIT_PORT=3000
ENV RRKIT_DB_PATH=/data/rrkit.db
ENV RRKIT_STATIC_DIR=/app/public
ENV RRKIT_TRACKER_PATH=/app/public/tracker.js
WORKDIR /app

COPY --from=build /app/deploy/package.json ./package.json
COPY --from=build /app/deploy/node_modules ./node_modules
COPY --from=build /app/deploy/dist ./dist
# Dashboard SPA + tracker bundle served by Fastify.
COPY --from=build /app/packages/dashboard/out ./public
COPY --from=build /app/packages/tracker/dist/tracker.global.js ./public/tracker.js

COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
COPY docker/healthcheck.js ./healthcheck.js
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=5 \
  CMD node /app/healthcheck.js

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
