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
        path.resolve(__dirname, "./node_modules/@m5kdev/web-ui/dist/translations"),
        path.resolve(__dirname, "./translations"),
      ],
      namespaceResolution: "basename",
    }),
  ],
  resolve: {
    dedupe: ["react", "react-dom", "react-i18next", "react-router", "nuqs"],
  },
  envDir: "../shared",
});
