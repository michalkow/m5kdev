import { fileURLToPath } from "node:url";
import type * as Preset from "@docusaurus/preset-classic";
import type { Config, Plugin } from "@docusaurus/types";
import { themes as prismThemes } from "prism-react-renderer";

const resolveWeakLoaderPath = fileURLToPath(
  new URL("./loaders/resolveWeakLoader.cjs", import.meta.url)
);
const clientModulesLoaderPath = fileURLToPath(
  new URL("./loaders/clientModulesLoader.cjs", import.meta.url)
);

function docusaurusBuildCompatibility(): Plugin {
  return {
    name: "docusaurus-build-compatibility",
    configureWebpack() {
      return {
        module: {
          rules: [
            {
              enforce: "pre",
              test: /[\\/]\.docusaurus[\\/]registry\.js$/,
              loader: resolveWeakLoaderPath,
            },
            {
              enforce: "pre",
              test: /[\\/]\.docusaurus[\\/]client-modules\.js$/,
              loader: clientModulesLoaderPath,
            },
          ],
        },
      };
    },
  };
}

const config: Config = {
  title: "m5kdev",
  tagline: "Module-first documentation for the m5kdev stack",
  url: process.env.DOCUSAURUS_URL ?? "https://m5kdev.local",
  baseUrl: process.env.DOCUSAURUS_BASE_URL ?? "/",
  organizationName: "michalkow",
  projectName: "m5kdev",
  onBrokenLinks: "throw",
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: "warn",
    },
  },
  trailingSlash: false,
  future: {
    faster: {
      swcJsLoader: true,
    },
  },
  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  presets: [
    [
      "classic",
      {
        docs: {
          routeBasePath: "/",
          sidebarPath: "./sidebars.ts",
          editUrl: "https://github.com/michalkow/m5kdev/tree/main/apps/docs/",
        },
        blog: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
      } satisfies Preset.Options,
    ],
  ],

  plugins: [docusaurusBuildCompatibility],

  themeConfig: {
    navbar: {
      title: "m5kdev",
      items: [
        {
          type: "docSidebar",
          sidebarId: "docsSidebar",
          position: "left",
          label: "Docs",
        },
        {
          href: "https://github.com/michalkow/m5kdev",
          label: "GitHub",
          position: "right",
        },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Docs",
          items: [
            {
              label: "Guides",
              to: "/guides/getting-started",
            },
            {
              label: "Modules",
              to: "/modules",
            },
            {
              label: "Packages",
              to: "/packages",
            },
          ],
        },
        {
          title: "Project",
          items: [
            {
              label: "GitHub",
              href: "https://github.com/michalkow/m5kdev",
            },
          ],
        },
      ],
      copyright: `Copyright (c) ${new Date().getFullYear()} m5kdev.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
