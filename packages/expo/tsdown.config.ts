import { defineConfig } from "tsdown";

export default defineConfig({
  name: "@m5kdev/expo",
  entry: [
    "./src/**/*.ts",
    "./src/**/*.tsx",
    "!./src/**/*.test.ts",
    "!./src/**/*.test.tsx",
    "!./src/**/*.spec.ts",
    "!./src/**/*.spec.tsx",
  ],
  root: ".",
  unbundle: true,
  outDir: "dist",
  platform: "neutral",
  format: ["esm", "cjs"],
  deps: {
    skipNodeModulesBundle: true,
  },
  tsconfig: "./tsconfig.json",
  dts: true,
  sourcemap: true,
});
