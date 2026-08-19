import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  outDir: "dist",
  sourcemap: true,
  clean: true,
  // Workspace packages export TypeScript source for local tsx/Vite. Node
  // cannot strip types from files under node_modules
  // (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING), so bundle them into dist.
  noExternal: [/^@starter-app\//],
  // Only leave runtime requires for packages the server installs. Bundling
  // @beatquill/email would otherwise emit require("@m5kdev/email/...") and
  // require("@react-email/...") that pnpm deploy does not hoist to /app.
  external: [
    /^@m5kdev\/backend(\/|$)/,
    /^@m5kdev\/commons(\/|$)/,
    /^@m5kdev\/config(\/|$)/,
    "react",
    "react-dom",
  ],
});
