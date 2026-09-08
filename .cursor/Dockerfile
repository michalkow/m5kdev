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

# System libraries required by Playwright's Chromium (for the e2e suite).
# Package list from `playwright install-deps --dry-run chromium` (Debian bookworm).
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libasound2t64 libatk-bridge2.0-0t64 libatk1.0-0t64 libatspi2.0-0t64 \
        libcairo2 libcups2t64 libdbus-1-3 libdrm2 libgbm1 libglib2.0-0t64 \
        libnspr4 libnss3 libpango-1.0-0 libx11-6 libxcb1 libxcomposite1 \
        libxdamage1 libxext6 libxfixes3 libxkbcommon0 libxrandr2 xvfb \
        fonts-noto-color-emoji fonts-unifont libfontconfig1 libfreetype6 \
        xfonts-cyrillic xfonts-scalable fonts-liberation fonts-ipafont-gothic \
        fonts-wqy-zenhei fonts-tlwg-loma-otf fonts-freefont-ttf \
    && rm -rf /var/lib/apt/lists/*

# Match the package manager pinned by the repo (packageManager field).
RUN corepack enable && corepack prepare pnpm@10.13.1 --activate

USER node
