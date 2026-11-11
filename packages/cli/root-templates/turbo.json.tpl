{
  "$schema": "https://turborepo.com/schema.json",
  "ui": "tui",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "inputs": ["$TURBO_DEFAULT$", ".env*"],
      "env": ["VITE_DOCS_URL", "EXPO_PUBLIC_DOCS_URL"],
      "outputs": ["dist/**", "build/**"]
    },
    "lint": {
      "dependsOn": ["^lint"]
    },
    "lint:fix": {
      "dependsOn": ["^lint:fix"]
    },
    "check-types": {
      "dependsOn": ["^check-types"],
      "inputs": ["$TURBO_DEFAULT$", "tsconfig.json", "tsconfig.*.json"],
      "outputs": ["tsconfig.tsbuildinfo", "**/*.tsbuildinfo", "dist/tsconfig.lib.tsbuildinfo"]
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
