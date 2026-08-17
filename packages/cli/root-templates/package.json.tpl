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
    "@biomejs/biome": "catalog:m5kdev",
    "turbo": "catalog:m5kdev",
    "typescript": "catalog:m5kdev"
  },
  "packageManager": "pnpm@10.13.1",
  "engines": {
    "node": ">=22"
  }
}
