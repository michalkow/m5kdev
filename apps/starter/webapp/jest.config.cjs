module.exports = {
  testEnvironment: "jsdom",
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
