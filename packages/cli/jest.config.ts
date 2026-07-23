import type { Config } from "jest";

const config: Config = {
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/*.test.ts"],
  transform: {
    "^.+\\.(t|j)s$": "<rootDir>/jest-import-meta-transformer.cjs",
  },
  verbose: true,
};

export default config;
