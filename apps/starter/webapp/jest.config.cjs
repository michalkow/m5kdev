module.exports = {
  testEnvironment: "jsdom",
  setupFiles: ["<rootDir>/src/modules/app/tests/setup.ts"],
  moduleNameMapper: {
    "^@m5kdev/frontend/(.*)$": "<rootDir>/../../../packages/frontend/src/$1",
    "^@m5kdev/web-ui/(.*)$": "<rootDir>/../../../packages/web-ui/src/$1",
    "^@m5kdev/commons/(.*)$": "<rootDir>/../../../packages/commons/src/$1",
  },
  roots: ["<rootDir>/src/modules/app/tests"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          module: "commonjs",
          jsx: "react-jsx",
          esModuleInterop: true,
          isolatedModules: true,
        },
        diagnostics: false,
      },
    ],
  },
};
