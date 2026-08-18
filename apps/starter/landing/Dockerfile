# syntax = docker/dockerfile:1

FROM node:24-slim AS base

LABEL fly_launch_runtime="NodeJS"

WORKDIR /app

ENV NODE_ENV=production

FROM base AS build

RUN apt-get update -qq && \
    apt-get install -y python-is-python3 pkg-config build-essential ca-certificates && \
    update-ca-certificates

RUN npm install -g pnpm@10.13.1

COPY --link . .

RUN pnpm install --frozen-lockfile --prod=false

# Frontend bake needs VITE_* from the operator env file. The wrapper passes
# ALL_SECRETS (every key) plus per-key --build-secret flags.
RUN --mount=type=secret,id=ALL_SECRETS,required=false \
    if [ -f /run/secrets/ALL_SECRETS ]; then . /run/secrets/ALL_SECRETS; fi && \
    pnpm --filter=@starter-app/landing build

RUN pnpm --filter=@starter-app/landing deploy --prod --legacy /deploy
RUN cp -r /app/apps/landing/dist /deploy/dist

FROM base

COPY --from=build /deploy /app
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

WORKDIR /app

CMD ["npm", "run", "start"]
