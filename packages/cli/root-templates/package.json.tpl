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
    "test": "turbo run test",
    // m5k:server:start
    "app:deploy:development": "m5kdev-fly-deploy --config apps/shared/fly.development.toml --dockerfile apps/shared/Dockerfile --env apps/shared/.env.development",
    "app:secrets:development": "m5kdev-fly-secrets --config apps/shared/fly.development.toml --env apps/shared/.env.development",
    "app:deploy:production": "m5kdev-fly-deploy --config apps/shared/fly.production.toml --dockerfile apps/shared/Dockerfile --env apps/shared/.env.production",
    "app:secrets:production": "m5kdev-fly-secrets --config apps/shared/fly.production.toml --env apps/shared/.env.production",
    // m5k:server:end
    "landing:deploy": "m5kdev-fly-deploy --config apps/landing/fly.toml --dockerfile apps/landing/Dockerfile --env apps/landing/.env.production",
    "landing:secrets": "m5kdev-fly-secrets --config apps/landing/fly.toml --env apps/landing/.env.production"
  },
  "devDependencies": {
    "@biomejs/biome": "catalog:m5kdev",
    "@m5kdev/backend": "catalog:m5kdev",
    "turbo": "catalog:m5kdev",
    "typescript": "catalog:m5kdev"
  },
  "packageManager": "pnpm@10.13.1",
  "engines": {
    "node": ">=24"
  }
}
