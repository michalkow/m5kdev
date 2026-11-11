name: check

on:
  push:
  pull_request:

permissions:
  contents: read

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          # The migration check compares against the PR base branch.
          fetch-depth: 0
      - uses: pnpm/action-setup@v4
        with:
          version: 10.13.1
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm check-types
      - run: pnpm test
      - run: pnpm docs:build
      # m5k:server:start
      - name: Check migrations match table definitions
        # drizzle-kit needs a PostgreSQL URL in its config but never connects for
        # check or generate. No database secret is used.
        env:
          DATABASE_DIRECT_URL: postgresql://ci@127.0.0.1:5432/ci
          DATABASE_SCHEMA: app
        run: |
          pnpm --filter ./apps/server exec drizzle-kit check
          pnpm --filter ./apps/server drizzle:generate
      - name: Check migration history is frozen
        env:
          BASE_REF: ${{ github.event_name == 'pull_request' && format('origin/{0}', github.base_ref) || '' }}
        run: |
          if [ -n "$BASE_REF" ]; then
            pnpm exec m5kdev-migration-check --folder apps/server/drizzle-postgresql --base "$BASE_REF"
          else
            pnpm exec m5kdev-migration-check --folder apps/server/drizzle-postgresql
          fi
      # m5k:server:end
