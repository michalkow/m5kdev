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
RUN pnpm --filter=@starter-app/server build

# Frontend bake needs VITE_* from the operator env file. Fly cannot declare
# an unknown set of --mount=type=secret,id=<each key>, so the wrapper also
# passes ALL_SECRETS (export KEY=value for every key) and still forwards each
# key as --build-secret.
# m5k:webapp:start
RUN --mount=type=secret,id=ALL_SECRETS,required=false \
    if [ -f /run/secrets/ALL_SECRETS ]; then . /run/secrets/ALL_SECRETS; fi && \
    pnpm --filter=@starter-app/webapp build
# m5k:webapp:end

RUN pnpm --filter=@starter-app/server deploy --prod --legacy /deploy
RUN cp -r /app/apps/server/dist/. /deploy

# m5k:webapp:start
RUN cp -r /app/apps/webapp/dist /deploy/client
# m5k:webapp:end

FROM base

COPY --from=build /deploy /app
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

WORKDIR /app

CMD ["node", "index.js"]
