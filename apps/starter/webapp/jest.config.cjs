module.exports = {
  testEnvironment: "jsdom",
  setupFiles: ["<rootDir>/src/modules/app/tests/setup.ts"],
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
