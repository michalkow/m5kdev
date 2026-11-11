import type * as Preset from "@docusaurus/preset-classic";
import type { Config } from "@docusaurus/types";

const config: Config = {
  title: "M5 Starter Help",
  tagline: "Guides to getting things done with M5 Starter",
  url: process.env.VITE_DOCS_URL ?? "https://starter-app-docs.fly.dev",
  baseUrl: "/",
  trailingSlash: true,
  onBrokenLinks: "throw",
  markdown: { hooks: { onBrokenMarkdownLinks: "throw" } },
  future: { faster: { rspackBundler: true, swcJsLoader: true } },
  presets: [
    [
      "classic",
      {
        docs: { routeBasePath: "/", sidebarPath: "./sidebars.ts" },
        blog: false,
      } satisfies Preset.Options,
    ],
  ],
  themeConfig: {
    navbar: { title: "M5 Starter Help" },
    colorMode: { respectPrefersColorScheme: true },
  } satisfies Preset.ThemeConfig,
};

export default config;
