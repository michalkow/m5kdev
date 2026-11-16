import type { Config } from "jest";

const config: Config = {
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/*.test.ts", "**/*.test.tsx"],
  moduleNameMapper: {
    "^@m5kdev/frontend/(.*)$": "<rootDir>/../frontend/src/$1",
  },
  transformIgnorePatterns: ["/node_modules/(?!devalue/|\\.pnpm/devalue@)"],
  transform: {
    "^.+\\.m?js$": "<rootDir>/../backend/jest-esm-transform.cjs",
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
