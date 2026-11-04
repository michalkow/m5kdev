name: Deploy app

on:
  push:
    branches: [main]
    paths:
      - 'apps/server/**'
      # m5k:webapp:start
      - 'apps/webapp/**'
      # m5k:webapp:end
      - 'apps/shared/**'
      - 'apps/email/**'
      - 'package.json'
      - 'pnpm-lock.yaml'
      - 'pnpm-workspace.yaml'
      - '.npmrc'
      - '.dockerignore'
      - '.github/workflows/deploy-app.yml'
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: deploy-app-production
  cancel-in-progress: false

jobs:
  deploy:
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - name: Provide fly command for the deploy scripts
        run: |
          mkdir -p "$RUNNER_TEMP/fly-bin"
          ln -s "$(command -v flyctl)" "$RUNNER_TEMP/fly-bin/fly"
          printf '%s\n' "$RUNNER_TEMP/fly-bin" >> "$GITHUB_PATH"
      - name: Deploy app to Fly
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN_APP }}
          ENV_PRODUCTION: ${{ secrets.APP_ENV_PRODUCTION }}
        run: |
          if [ -z "$FLY_API_TOKEN" ] || [ -z "$ENV_PRODUCTION" ]; then
            echo 'Configure FLY_API_TOKEN_APP and APP_ENV_PRODUCTION in GitHub Actions secrets.' >&2
            exit 1
          fi
          umask 077
          printf '%s\n' "$ENV_PRODUCTION" > apps/shared/.env.production
          pnpm app:secrets
          pnpm app:deploy
      - name: Remove production env file
        if: always()
        run: rm -f apps/shared/.env.production
