# Base image for Cursor Cloud Agents working on the m5kdev monorepo.
# Provides Node.js 24 (repo requires >=24), pnpm, Redis (BullMQ workflow
# workers), and the toolchain needed to build native npm dependencies.
FROM node:24-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        git \
        curl \
        ca-certificates \
        redis-server \
        python3 \
        build-essential \
    && rm -rf /var/lib/apt/lists/*

# Match the package manager pinned by the repo (packageManager field).
RUN corepack enable && corepack prepare pnpm@10.13.1 --activate

USER node
