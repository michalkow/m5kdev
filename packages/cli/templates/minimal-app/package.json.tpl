{
  "name": "{{APP_SLUG}}",
  "private": true,
  "description": "{{APP_DESCRIPTION}}",
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "lint:fix": "turbo run lint:fix",
    "check-types": "turbo run check-types"
  },
  "devDependencies": {
    "@biomejs/biome": "catalog:",
    "turbo": "catalog:",
    "typescript": "catalog:"
  },
  "packageManager": "pnpm@10.13.1",
  "engines": {
    "node": ">=22"
  }
}
