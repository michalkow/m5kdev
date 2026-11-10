name: Deploy app

# Each Deployment environment follows one branch. A push (a merged PR) migrates
# that environment's database, then deploys a build of that branch to its Fly
# app. Migrations never run from the image (ADR-0035).
on:
  push:
    branches:
      - main
      - production
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

# One run per branch (= Deployment environment) at a time. Never cancel a
# migration or deploy in progress because a newer merge arrived.
concurrency:
  group: deploy-app-${{ github.ref_name }}
  cancel-in-progress: false

jobs:
  resolve:
    runs-on: ubuntu-latest
    outputs:
      environment: ${{ steps.environment.outputs.environment }}
    steps:
      - id: environment
        name: Map branch to Deployment environment
        run: |
          case "$GITHUB_REF_NAME" in
            main) environment=development ;;
            production) environment=production ;;
            *) echo "Branch $GITHUB_REF_NAME has no Deployment environment." >&2; exit 1 ;;
          esac
          echo "environment=$environment" >> "$GITHUB_OUTPUT"

  migrate:
    needs: resolve
    runs-on: ubuntu-latest
    environment: ${{ needs.resolve.outputs.environment }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Apply migrations
        # Only this step sees the database's direct URL.
        env:
          DATABASE_DIRECT_URL: ${{ secrets.DATABASE_DIRECT_URL }}
        run: |
          if [ -z "$DATABASE_DIRECT_URL" ]; then
            echo 'Configure DATABASE_DIRECT_URL in this GitHub environment.' >&2
            exit 1
          fi
          pnpm --filter ./apps/server exec tsx db.ts migrate

  deploy:
    needs: [resolve, migrate]
    runs-on: ubuntu-latest
    environment: ${{ needs.resolve.outputs.environment }}
    env:
      ENVIRONMENT: ${{ needs.resolve.outputs.environment }}
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
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
          APP_ENV_FILE: ${{ secrets.APP_ENV_FILE }}
        run: |
          if [ -z "$FLY_API_TOKEN" ] || [ -z "$APP_ENV_FILE" ]; then
            echo "Configure FLY_API_TOKEN and APP_ENV_FILE in the $ENVIRONMENT GitHub environment." >&2
            exit 1
          fi
          umask 077
          printf '%s\n' "$APP_ENV_FILE" > "apps/shared/.env.$ENVIRONMENT"
          pnpm "app:secrets:$ENVIRONMENT"
          pnpm "app:deploy:$ENVIRONMENT"
      - name: Remove env file
        if: always()
        run: rm -f "apps/shared/.env.$ENVIRONMENT"
