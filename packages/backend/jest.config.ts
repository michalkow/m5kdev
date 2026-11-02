import type { Config } from "jest";

const config: Config = {
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/*.test.ts"],
  transform: {
    "^.+\\.mjs$": "<rootDir>/jest-esm-transform.cjs",
    "^.+\\.(t|j)s$": ["ts-jest", { tsconfig: { allowJs: true } }],
  },
  transformIgnorePatterns: [
    "node_modules/(?!(?:\\.pnpm/)?(?:@sindresorhus[+/]|escape-string-regexp|tokenx|p-map))",
  ],
  moduleNameMapper: {
    "^#utils$": "<rootDir>/src/test/stubs/utils.ts",
    "^#modules/(.*)$": "<rootDir>/src/modules/$1",
    "^#lib/(.*)$": "<rootDir>/src/lib/$1",
    "^#utils(.*)$": "<rootDir>/src/utils$1",
    "^@m5kdev/backend/(.*)$": "<rootDir>/src/$1",
  },
  verbose: true,
  setupFilesAfterEnv: ["<rootDir>/src/test/postgresql.setup.ts"],
};

export default config;
