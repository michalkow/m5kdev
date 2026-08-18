import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
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
  ],
  resolve: {
    dedupe: ["react", "react-dom", "react-router"],
  },
  envDir: "../shared",
  preview: {
    host: "0.0.0.0",
    port: 8080,
  },
});
