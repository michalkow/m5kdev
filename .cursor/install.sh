#!/usr/bin/env bash
# Idempotent repository bootstrap for Cursor Cloud Agents.
# Runs after the repo is checked out. Safe to run repeatedly.
set -euo pipefail

cd "$(dirname "$0")/.."

# 1. Development env file for the starter app (dev-safe defaults).
#    The real .env is gitignored; recreate it from the checked-in example.
ENV_FILE="apps/starter/shared/.env"
if [ ! -f "$ENV_FILE" ]; then
  cp apps/starter/shared/.env.example "$ENV_FILE"
  # Deterministic local dev secret (non-production) and disable OTLP exporters
  # since there is no local collector.
  sed -i 's|^BETTER_AUTH_SECRET=.*|BETTER_AUTH_SECRET=local-dev-secret-local-dev-secret-32|' "$ENV_FILE"
  printf '\n# Added by Cloud Agent env setup\nOTEL_SDK_DISABLED=true\n' >> "$ENV_FILE"
fi

# 2. Install workspace dependencies with the pinned pnpm/lockfile.
corepack prepare pnpm@10.13.1 --activate >/dev/null 2>&1 || true
pnpm install --frozen-lockfile

# 2b. Download the Playwright Chromium browser for the e2e suite. System
#     libraries are provided by the Dockerfile, so skip --with-deps here.
pnpm --filter @starter-app/e2e exec playwright install chromium

# 3. Build packages and apps (webapp consumes built @m5kdev/* packages).
pnpm build

# 4. Initialize the local libSQL database: apply migrations, then seed.
#    Both steps are idempotent (seed no-ops when data already exists).
pnpm --filter @starter-app/server drizzle:migrate
pnpm --filter @starter-app/server drizzle:seed

echo "install.sh: environment bootstrap complete."
