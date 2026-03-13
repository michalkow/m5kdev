{
  "name": "{{PACKAGE_SCOPE}}/shared",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "build": "tsc --noEmit",
    "lint": "biome check .",
    "lint:fix": "biome check . --write",
    "check-types": "tsc --noEmit"
  },
  "dependencies": {
    "@m5kdev/commons": "catalog:",
    "zod": "catalog:"
  },
  "devDependencies": {
    "@m5kdev/config": "catalog:",
    "tslib": "catalog:",
    "typescript": "catalog:"
  },
  "exports": {
    "./modules/app/*": "./src/modules/app/*.ts",
    "./modules/posts/*": "./src/modules/posts/*.ts"
  }
}
