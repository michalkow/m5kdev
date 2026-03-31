import { defineConfig } from "tsdown";

export default defineConfig({
  name: "@m5kdev/commons",
  entry: ["./src/**/*.ts"],
  root: ".",
  unbundle: true,
  outDir: "dist",
  platform: "node",
  format: ["esm", "cjs"],
  tsconfig: "./tsconfig.json",
  dts: true,
  sourcemap: true,
});
