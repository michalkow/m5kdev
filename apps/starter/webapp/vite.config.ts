import path from "node:path";
import posthog from "@posthog/rollup-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import i18nextLoader from "vite-plugin-i18next-loader";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ command, mode }) => {
  const envDir = path.resolve(__dirname, "../shared");
  // Load private build configuration without exposing it through VITE_* defines.
  const env = loadEnv(mode, envDir, "");
  const apiKey = env.POSTHOG_API_KEY?.trim() ?? "";
  const projectId = env.POSTHOG_PROJECT_ID?.trim();
  if (command === "build" && Boolean(apiKey) !== Boolean(projectId)) {
    throw new Error(
      "PostHog source map uploads require POSTHOG_API_KEY and POSTHOG_PROJECT_ID together"
    );
  }
  const uploadSourceMaps = command === "build" && Boolean(apiKey && projectId);

  return {
    root: __dirname,
    plugins: [
      ...(uploadSourceMaps
        ? [
            posthog({
              personalApiKey: apiKey,
              projectId,
              host: env.POSTHOG_HOST || "https://us.posthog.com",
              sourcemaps: { enabled: true, deleteAfterUpload: true, releaseMode: "symbol-set" },
            }),
          ]
        : []),
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
    envDir,
  };
});
