import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import i18nextLoader from "vite-plugin-i18next-loader";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  root: __dirname,
  plugins: [
    tailwindcss(),
    react({
      babel: {
        plugins: ["babel-plugin-react-compiler"],
      },
    }),
    tsconfigPaths(),
    i18nextLoader({
      include: ["**/*.json"],
      paths: [
        path.resolve(__dirname, "../../../packages/web-ui/translations"),
        path.resolve(__dirname, "./translations"),
      ],
      namespaceResolution: "basename",
    }),
  ],
  resolve: {
    alias: [
      {
        find: "@m5kdev/web-ui/utils",
        replacement: path.resolve(__dirname, "../../../packages/web-ui/src/lib/utils.ts"),
      },
      {
        find: /^@m5kdev\/web-ui\/components\/shared\/(.+)$/,
        replacement: `${path.resolve(__dirname, "../../../packages/web-ui/src/components/ui/shared")}/$1`,
      },
      {
        find: /^@m5kdev\/web-ui\/(.+)$/,
        replacement: `${path.resolve(__dirname, "../../../packages/web-ui/src")}/$1`,
      },
    ],
    dedupe: ["react", "react-dom", "react-i18next", "react-router", "nuqs"],
  },
});
