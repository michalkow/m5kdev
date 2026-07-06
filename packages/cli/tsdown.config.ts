import { defineConfig } from "tsdown";

export default defineConfig({
  name: "create-m5kdev",
  entry: ["./src/**/*.ts", "!./src/__tests__/**"],
  root: ".",
  unbundle: true,
  outDir: "dist",
  platform: "node",
  format: ["cjs"],
  tsconfig: "./tsconfig.json",
  dts: true,
  sourcemap: true,
});
