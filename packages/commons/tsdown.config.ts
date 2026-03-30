import { defineConfig } from "tsdown";

export default defineConfig({
  name: "@m5kdev/commons",
  entry: ["./src/**/*.ts"],
  root: ".",
  unbundle: true,
  outDir: "dist",
  platform: "node",
  fixedExtension: false,
  tsconfig: "./tsconfig.json",
  dts: true,
  sourcemap: true,
});
