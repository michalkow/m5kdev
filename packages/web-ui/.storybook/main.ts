import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import type { StorybookConfig } from "@storybook/react-vite";
import { mergeConfig } from "vite";

const storybookDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(storybookDir, "..");

const config: StorybookConfig = {
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-docs"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  viteFinal: async (userConfig) => {
    return mergeConfig(userConfig, {
      plugins: [tailwindcss()],
      resolve: {
        dedupe: ["react", "react-dom", "react-router"],
        alias: {
          "@m5kdev/web-ui/utils": path.join(packageRoot, "src/lib/utils.ts"),
          "@m5kdev/web-ui/modules/table/filterTransformers": path.join(
            packageRoot,
            "src/modules/table/filterTransformers.ts",
          ),
        },
      },
    });
  },
};

export default config;
