name: Deploy landing

on:
  push:
    branches: [main]
    paths:
      - 'apps/landing/**'
      - 'package.json'
      - 'pnpm-lock.yaml'
      - 'pnpm-workspace.yaml'
      - '.npmrc'
      - '.dockerignore'
      - '.github/workflows/deploy-landing.yml'
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: deploy-landing-production
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
      - name: Deploy landing to Fly
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN_LANDING }}
          ENV_PRODUCTION: ${{ secrets.LANDING_ENV_PRODUCTION }}
        run: |
          if [ -z "$FLY_API_TOKEN" ] || [ -z "$ENV_PRODUCTION" ]; then
            echo 'Configure FLY_API_TOKEN_LANDING and LANDING_ENV_PRODUCTION in GitHub Actions secrets.' >&2
            exit 1
          fi
          umask 077
          printf '%s\n' "$ENV_PRODUCTION" > apps/landing/.env.production
          pnpm landing:secrets
          pnpm landing:deploy
      - name: Remove production env file
        if: always()
        run: rm -f apps/landing/.env.production
