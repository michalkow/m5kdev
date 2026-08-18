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
    "app:deploy": "node apps/shared/scripts/fly-deploy.mjs --config apps/shared/fly.toml --dockerfile apps/shared/Dockerfile --env apps/shared/.env.production",
    "app:secrets": "node apps/shared/scripts/fly-secrets.mjs --config apps/shared/fly.toml --env apps/shared/.env.production",
    "landing:deploy": "node apps/landing/scripts/fly-deploy.mjs --config apps/landing/fly.toml --dockerfile apps/landing/Dockerfile --env apps/landing/.env.production",
    "landing:secrets": "node apps/landing/scripts/fly-secrets.mjs --config apps/landing/fly.toml --env apps/landing/.env.production"
  },
  "devDependencies": {
    "@biomejs/biome": "catalog:m5kdev",
    "turbo": "catalog:m5kdev",
    "typescript": "catalog:m5kdev"
  },
  "packageManager": "pnpm@10.13.1",
  "engines": {
    "node": ">=24"
  }
}
