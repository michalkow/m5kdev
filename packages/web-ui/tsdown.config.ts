import { defineConfig } from "tsdown";

export default defineConfig({
  name: "@m5kdev/web-ui",
  entry: [
    "./src/**/*.ts",
    "./src/**/*.tsx",
    "!./src/vite-env.d.ts",
    "!./src/**/*.test.ts",
    "!./src/**/*.test.tsx",
    "!./src/**/*.spec.ts",
    "!./src/**/*.spec.tsx",
  ],
  root: ".",
  unbundle: true,
  outDir: "dist",
  platform: "browser",
  format: ["esm", "cjs"],
  tsconfig: "./tsconfig.json",
  dts: true,
  sourcemap: true,
});
