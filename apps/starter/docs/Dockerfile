# syntax = docker/dockerfile:1

FROM node:24-slim AS dependencies
WORKDIR /app
RUN npm install -g pnpm@10.13.1 && pnpm config set store-dir /pnpm/store
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/docs/package.json ./apps/docs/
RUN --mount=type=cache,id=starter-app-docs-pnpm,target=/pnpm/store \
    pnpm --filter=@starter-app/docs... install --frozen-lockfile --prod=false

FROM dependencies AS build
COPY apps/docs ./apps/docs
# The Kernel deploy command hashes public VITE_* values for cache invalidation.
ARG VITE_CONFIG_HASH
RUN --mount=type=secret,id=ALL_SECRETS,required=false \
    if [ -f /run/secrets/ALL_SECRETS ]; then . /run/secrets/ALL_SECRETS; fi && \
    pnpm --filter=@starter-app/docs build

FROM caddy:2-alpine AS runtime
COPY apps/docs/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/docs/build/ /srv/
EXPOSE 8080
