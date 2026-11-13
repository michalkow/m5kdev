{
  "name": "{{APP_SLUG}}",
  "private": true,
  "description": "{{APP_DESCRIPTION}}",
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "lint:fix": "turbo run lint:fix",
    "check-types": "turbo run check-types",
    "cs:add": "changeset add",
    "cs:version": "changeset version",
    "test": "turbo run test",
    "docs:dev": "pnpm --filter ./apps/docs dev",
    "docs:build": "pnpm --filter ./apps/docs build",
    "docs:serve": "pnpm --filter ./apps/docs serve",
    // m5k:docs-standalone:start
    "docs:deploy": "m5kdev-fly-deploy --config apps/docs/fly.toml --dockerfile apps/docs/Dockerfile --env apps/docs/.env.production",
    // m5k:docs-standalone:end
    // m5k:docs-landing:start
    "docs:deploy": "pnpm landing:deploy",
    // m5k:docs-landing:end
    // m5k:docs-server:start
    "docs:deploy": "pnpm app:deploy:production",
    // m5k:docs-server:end
    // m5k:server:start
    "app:deploy": "node -e \"const s=require('./package.json').scripts;console.error('Use pnpm app:deploy:<environment> — one of: '+Object.keys(s).filter(k=>k.startsWith('app:deploy:')).map(k=>k.split(':')[2]).join(', '));process.exit(1)\"",
    "app:secrets": "node -e \"const s=require('./package.json').scripts;console.error('Use pnpm app:secrets:<environment> — one of: '+Object.keys(s).filter(k=>k.startsWith('app:secrets:')).map(k=>k.split(':')[2]).join(', '));process.exit(1)\"",
    "app:deploy:development": "m5kdev-fly-deploy --config apps/shared/fly.development.toml --dockerfile apps/shared/Dockerfile --env apps/shared/.env.development",
    "app:secrets:development": "m5kdev-fly-secrets --config apps/shared/fly.development.toml --env apps/shared/.env.development",
    // m5k:env-staging:start
    "app:deploy:staging": "m5kdev-fly-deploy --config apps/shared/fly.staging.toml --dockerfile apps/shared/Dockerfile --env apps/shared/.env.staging",
    "app:secrets:staging": "m5kdev-fly-secrets --config apps/shared/fly.staging.toml --env apps/shared/.env.staging",
    // m5k:env-staging:end
    // m5k:env-canary:start
    "app:deploy:canary": "m5kdev-fly-deploy --config apps/shared/fly.canary.toml --dockerfile apps/shared/Dockerfile --env apps/shared/.env.canary",
    "app:secrets:canary": "m5kdev-fly-secrets --config apps/shared/fly.canary.toml --env apps/shared/.env.canary",
    // m5k:env-canary:end
    "app:deploy:production": "m5kdev-fly-deploy --config apps/shared/fly.production.toml --dockerfile apps/shared/Dockerfile --env apps/shared/.env.production",
    "app:secrets:production": "m5kdev-fly-secrets --config apps/shared/fly.production.toml --env apps/shared/.env.production",
    // m5k:server:end
    "landing:deploy": "m5kdev-fly-deploy --config apps/landing/fly.toml --dockerfile apps/landing/Dockerfile --env apps/landing/.env.production",
    "landing:secrets": "m5kdev-fly-secrets --config apps/landing/fly.toml --env apps/landing/.env.production"
  },
  "devDependencies": {
    "@biomejs/biome": "catalog:m5kdev",
    "@changesets/cli": "catalog:m5kdev",
    "@m5kdev/backend": "catalog:m5kdev",
    "turbo": "catalog:m5kdev",
    "typescript": "catalog:m5kdev"
  },
  "packageManager": "pnpm@10.13.1",
  "engines": {
    "node": ">=24"
  }
}
