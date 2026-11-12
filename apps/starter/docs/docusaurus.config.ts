import fs from "node:fs";
import path from "node:path";
import type * as Preset from "@docusaurus/preset-classic";
import type { Config } from "@docusaurus/types";

import { getDocumentationUrl } from "../documentation";
import { APP_LOCALE_CONFIG } from "../locales";

const languageTag = (locale: string) => locale.replaceAll("_", "-");
const defaultLocale = languageTag(APP_LOCALE_CONFIG.defaultLocale);
const locales = APP_LOCALE_CONFIG.locales.map(({ code }) => languageTag(code));
const guides = fs
  .readdirSync(path.join(__dirname, "docs"), { recursive: true })
  .filter((file): file is string => typeof file === "string" && /\.mdx?$/.test(file));
for (const locale of locales.filter((code) => code !== defaultLocale)) {
  for (const guide of guides) {
    if (
      !fs.existsSync(
        path.join(__dirname, "i18n", locale, "docusaurus-plugin-content-docs/current", guide)
      )
    ) {
      throw new Error(`Missing product documentation translation: ${locale}/${guide}`);
    }
  }
}

const publicUrl = new URL(
  getDocumentationUrl({ url: process.env.VITE_DOCS_URL, serverUrl: process.env.VITE_SERVER_URL })
);
const config: Config = {
  title: "M5 Starter Help",
  tagline: "Guides to getting things done with M5 Starter",
  url: publicUrl.origin,
  baseUrl: publicUrl.pathname,
  trailingSlash: true,
  i18n: {
    defaultLocale,
    locales,
    localeConfigs: Object.fromEntries(
      APP_LOCALE_CONFIG.locales.map(({ code, displayName }) => [
        languageTag(code),
        { label: displayName, htmlLang: languageTag(code) },
      ])
    ),
  },
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
    navbar: { title: "M5 Starter Help", items: [{ type: "localeDropdown", position: "right" }] },
    colorMode: { respectPrefersColorScheme: true },
  } satisfies Preset.ThemeConfig,
};

export default config;
