import { defineConfig } from "tsdown";

export default defineConfig({
  name: "@m5kdev/backend",
  entry: ["./src/**/*.ts", "!./src/**/*.test.ts", "!./src/**/__tests__/**", "!./src/test/**"],
  root: ".",
  unbundle: true,
  outDir: "dist",
  platform: "node",
  format: ["esm", "cjs"],
  tsconfig: "./tsconfig.json",
  dts: true,
  sourcemap: true,
});
