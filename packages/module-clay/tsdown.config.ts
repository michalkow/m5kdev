import { defineConfig } from "tsdown";

export default defineConfig({
  name: "@m5kdev/module-clay",
  entry: ["./src/**/*.ts", "!./src/**/*.test.ts"],
  root: ".",
  unbundle: true,
  outDir: "dist",
  platform: "node",
  format: ["esm", "cjs"],
  tsconfig: "./tsconfig.json",
  dts: true,
  sourcemap: true,
});
