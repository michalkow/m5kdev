# syntax = docker/dockerfile:1

FROM node:24-slim AS base
LABEL fly_launch_runtime="NodeJS"
WORKDIR /app
ENV NODE_ENV=production

FROM base AS tooling
RUN apt-get update -qq && \
    apt-get install -y --no-install-recommends python-is-python3 pkg-config build-essential ca-certificates && \
    rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@10.13.1 && pnpm config set store-dir /pnpm/store

# Keep dependency layers independent of application source. Add manifests here
# when introducing another local workspace dependency (and its source below).
FROM tooling AS server-deps
# Workspace configuration owns overrides; omit root development tooling.
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json ./apps/server/
COPY apps/shared/package.json ./apps/shared/
COPY apps/email/package.json ./apps/email/
RUN --mount=type=cache,id=starter-app-pnpm,target=/pnpm/store \
    pnpm --filter=@starter-app/server... install --frozen-lockfile --prod=false

FROM server-deps AS production-deps
# pnpm deploy needs the local dependencies' files. Server code is bundled by
# tsup separately, so changing server source does not rebuild node_modules.
COPY apps/shared ./apps/shared
COPY apps/email ./apps/email
RUN --mount=type=cache,id=starter-app-pnpm,target=/pnpm/store \
    pnpm --filter=@starter-app/server deploy --prod --legacy /deploy

FROM server-deps AS server-build
COPY apps/shared ./apps/shared
COPY apps/email ./apps/email
COPY apps/server ./apps/server
RUN pnpm --filter=@starter-app/server build

# m5k:webapp:start
FROM server-deps AS webapp-deps
COPY apps/webapp/package.json ./apps/webapp/
RUN --mount=type=cache,id=starter-app-pnpm,target=/pnpm/store \
    pnpm --filter=@starter-app/webapp... install --frozen-lockfile --prod=false

FROM webapp-deps AS webapp-build
COPY apps/shared ./apps/shared
# Server imports in the SPA are type-only and are erased by Vite.
COPY apps/webapp ./apps/webapp
# Secret contents do not affect Docker's cache key. The Fly wrapper hashes the
# public VITE_* and private PostHog upload configuration; direct builds must
# supply this argument too. Upload secrets are mounted only for this RUN.
ARG VITE_CONFIG_HASH
RUN --mount=type=secret,id=ALL_SECRETS,required=false \
    if [ -f /run/secrets/ALL_SECRETS ]; then . /run/secrets/ALL_SECRETS; fi && \
    pnpm --filter=@starter-app/webapp build
# m5k:webapp:end

FROM base AS runtime
COPY --from=tooling /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=production-deps /deploy/node_modules ./node_modules
COPY --from=production-deps /deploy/package.json ./package.json
COPY --from=server-build /app/apps/server/dist/ ./
# m5k:webapp:start
COPY --from=webapp-build /app/apps/webapp/dist/ ./client/
# m5k:webapp:end
CMD ["node", "index.js"]
