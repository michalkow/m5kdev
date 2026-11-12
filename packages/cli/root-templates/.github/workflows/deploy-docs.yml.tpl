name: Deploy docs

on:
  push:
    branches: [main]
    paths:
      - 'apps/docs/**'
      - 'apps/locales.ts'
      - 'apps/documentation.ts'
      - 'package.json'
      - 'pnpm-lock.yaml'
      - 'pnpm-workspace.yaml'
      - '.npmrc'
      - '.dockerignore'
      - '.github/workflows/deploy-docs.yml'
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: deploy-docs-production
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
      - name: Provide fly command for the deploy script
        run: |
          mkdir -p "$RUNNER_TEMP/fly-bin"
          ln -s "$(command -v flyctl)" "$RUNNER_TEMP/fly-bin/fly"
          printf '%s\n' "$RUNNER_TEMP/fly-bin" >> "$GITHUB_PATH"
      - name: Deploy public help to Fly
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN_DOCS }}
          DOCS_ENV_PRODUCTION: ${{ secrets.DOCS_ENV_PRODUCTION }}
        run: |
          if [ -z "$FLY_API_TOKEN" ] || [ -z "$DOCS_ENV_PRODUCTION" ]; then
            echo 'Configure FLY_API_TOKEN_DOCS and DOCS_ENV_PRODUCTION in GitHub Actions secrets.' >&2
            exit 1
          fi
          umask 077
          printf '%s\n' "$DOCS_ENV_PRODUCTION" > apps/docs/.env.production
          pnpm docs:deploy
      - name: Remove docs env file
        if: always()
        run: rm -f apps/docs/.env.production
