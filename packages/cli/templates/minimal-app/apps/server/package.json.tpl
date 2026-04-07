{
  "name": "{{PACKAGE_SCOPE}}/server",
  "version": "0.0.0",
  "private": true,
  "main": "dist/index.js",
  "scripts": {
    "dev": "tsx watch --env-file=../shared/.env src/index.ts",
    "build": "tsup",
    "start": "node dist/index.js",
    "lint": "biome check .",
    "lint:fix": "biome check . --write",
    "check-types": "tsc --noEmit",
    "sync": "tsx --env-file=../shared/.env drizzle/sync.ts",
    "seed": "tsx --env-file=../shared/.env drizzle/seed.ts"
  },
  "dependencies": {
    "{{PACKAGE_SCOPE}}/email": "workspace:*",
    "{{PACKAGE_SCOPE}}/shared": "workspace:*",
    "@libsql/client": "catalog:",
    "@m5kdev/backend": "catalog:",
    "@m5kdev/commons": "catalog:",
    "@trpc/server": "catalog:",
    "better-auth": "catalog:",
    "cors": "catalog:",
    "dotenv": "catalog:",
    "drizzle-orm": "catalog:",
    "express": "catalog:",
    "ioredis": "catalog:",
    "neverthrow": "catalog:",
    "react": "catalog:",
    "react-dom": "catalog:",
    "uuid": "catalog:",
    "zod": "catalog:"
  },
  "devDependencies": {
    "@m5kdev/config": "catalog:",
    "@types/cors": "catalog:",
    "@types/express": "catalog:",
    "@types/node": "catalog:",
    "@types/react": "catalog:",
    "@types/react-dom": "catalog:",
    "drizzle-kit": "catalog:",
    "tslib": "catalog:",
    "tsup": "catalog:",
    "tsx": "catalog:",
    "typescript": "catalog:"
  },
  "exports": {
    "./types": "./src/types.ts"
  }
}
