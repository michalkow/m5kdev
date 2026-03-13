{
  "name": "{{PACKAGE_SCOPE}}/email",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "build": "tsc --noEmit",
    "lint": "biome check .",
    "lint:fix": "biome check . --write",
    "check-types": "tsc --noEmit",
    "email:dev": "react-email dev --dir src/emails"
  },
  "dependencies": {
    "@react-email/components": "catalog:",
    "react": "catalog:",
    "react-dom": "catalog:"
  },
  "devDependencies": {
    "@m5kdev/config": "catalog:",
    "@types/node": "catalog:",
    "@types/react": "catalog:",
    "@types/react-dom": "catalog:",
    "react-email": "catalog:",
    "tslib": "catalog:",
    "typescript": "catalog:"
  },
  "main": "./src/index.ts"
}
