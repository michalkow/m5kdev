import type { Config } from "jest";

const config: Config = {
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/*.test.ts", "**/*.test.tsx"],
  transform: {
    "^.+\\.(t|j)sx?$": [
      "ts-jest",
      {
        isolatedModules: true,
        tsconfig: {
          jsx: "react-jsx",
          esModuleInterop: true,
          module: "commonjs",
          ignoreDeprecations: "6.0",
        },
      },
    ],
  },
  verbose: true,
};

export default config;
