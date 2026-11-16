const { existsSync } = require("node:fs");
const { resolve } = require("node:path");

// Generated applications use published packages, without this monorepo source tree.
const hasFrameworkSources = ["frontend", "web-ui", "commons"].every((name) =>
  existsSync(resolve(__dirname, "../../../packages", name, "src"))
);

module.exports = {
  testEnvironment: "<rootDir>/src/tests/environment.cjs",

  moduleNameMapper: hasFrameworkSources
    ? {
        "^@m5kdev/frontend/(.*)$": "<rootDir>/../../../packages/frontend/src/$1",
        "^@m5kdev/web-ui/utils$": "<rootDir>/../../../packages/web-ui/src/lib/utils",
        "^@m5kdev/web-ui/(.*)$": "<rootDir>/../../../packages/web-ui/src/$1",
        "^@m5kdev/commons/(.*)$": "<rootDir>/../../../packages/commons/src/$1",
      }
    : {},
  roots: ["<rootDir>/src/tests"],
  transformIgnorePatterns: [],
  transform: {
    "^.+\\.[jt]sx?$": [
      "ts-jest",
      {
        tsconfig: {
          module: "commonjs",
          jsx: "react-jsx",
          esModuleInterop: true,
          isolatedModules: true,
          allowJs: true,
        },
        diagnostics: false,
      },
    ],
  },
};
