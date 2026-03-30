import { defineConfig } from "tsdown";

export default defineConfig({
  name: "@m5kdev/email",
  entry: ["./src/**/*.ts", "./src/**/*.tsx"],
  root: ".",
  unbundle: true,
  outDir: "dist",
  platform: "node",
  fixedExtension: false,
  tsconfig: "./tsconfig.json",
  dts: true,
  sourcemap: true,
});
