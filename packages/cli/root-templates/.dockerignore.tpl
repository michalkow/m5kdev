# Dependencies and package-manager caches (at every workspace depth)
**/node_modules
**/.pnpm-store
**/.pnp
**/.pnp.js

# Version control and local tooling
**/.git
.github
.cursor
.claude
.idea
.vscode
.m5kdev.json

# Local env files and credentials must never reach the builder
**/.env*
**/*.pem

# Local databases and runtime artifacts
**/*.db
**/*.db-*
**/.e2e
**/.emails
**/uploads

# Test reports, native app artifacts, and build outputs
**/coverage
**/test-results
**/playwright-report
**/.turbo
**/.expo
**/build
**/dist
**/*.tsbuildinfo
apps/expo
apps/e2e

# Debug and OS files
**/npm-debug.log*
**/yarn-debug.log*
**/yarn-error.log*
**/.DS_Store
