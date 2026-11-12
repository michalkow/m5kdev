# syntax = docker/dockerfile:1

FROM node:24-slim AS dependencies
WORKDIR /app
ENV NODE_ENV=production
RUN npm install -g pnpm@10.13.1 && pnpm config set store-dir /pnpm/store
# Workspace configuration owns overrides; omit root development tooling.
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/landing/package.json ./apps/landing/
RUN --mount=type=cache,id=starter-app-pnpm,target=/pnpm/store \
    pnpm --filter=@starter-app/landing... install --frozen-lockfile --prod=false

FROM dependencies AS build
COPY apps/locales.ts apps/documentation.ts ./apps/
COPY apps/landing ./apps/landing
# The wrapper supplies a hash of public VITE_* values to invalidate this step
# when build configuration changes, without exposing runtime secrets.
ARG VITE_CONFIG_HASH
RUN --mount=type=secret,id=ALL_SECRETS,required=false \
    if [ -f /run/secrets/ALL_SECRETS ]; then . /run/secrets/ALL_SECRETS; fi && \
    pnpm --filter=@starter-app/landing build

# m5k:docs-landing:start
FROM dependencies AS docs-dependencies
COPY apps/docs/package.json ./apps/docs/
RUN --mount=type=cache,id=starter-app-pnpm,target=/pnpm/store \
    pnpm --filter=@starter-app/docs... install --frozen-lockfile --prod=false
FROM docs-dependencies AS docs-build
COPY apps/locales.ts apps/documentation.ts ./apps/
COPY apps/docs ./apps/docs
ARG VITE_CONFIG_HASH
RUN --mount=type=secret,id=ALL_SECRETS,required=false \
    if [ -f /run/secrets/ALL_SECRETS ]; then . /run/secrets/ALL_SECRETS; fi && \
    pnpm --filter=@starter-app/docs build
# m5k:docs-landing:end

FROM caddy:2-alpine AS runtime
COPY apps/landing/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/landing/dist/ /srv/
# m5k:docs-landing:start
COPY --from=docs-build /app/apps/docs/build/ /srv/documentation/
# m5k:docs-landing:end
EXPOSE 8080
