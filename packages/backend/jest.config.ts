import type { Config } from "jest";

const config: Config = {
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/*.test.ts"],
  transform: {
    "^.+\\.(t|j)s$": ["ts-jest", { tsconfig: "tsconfig.json" }],
  },
  moduleNameMapper: {
    "^#utils$": "<rootDir>/src/test/stubs/utils.ts",
    "^#modules/(.*)$": "<rootDir>/src/modules/$1",
    "^#lib/(.*)$": "<rootDir>/src/lib/$1",
    "^#utils(.*)$": "<rootDir>/src/utils$1",
  },
  verbose: true,
};

export default config;
