import { APP_LOCALE_CONFIG } from "./locales";

export type DocumentationHosting = "landing" | "server" | "standalone";
export const DOCUMENTATION_HOST = "landing" satisfies DocumentationHosting;
const documentationUrls: Record<DocumentationHosting, string> = {
  landing: "https://starter-app-landing.fly.dev/documentation/",
  server: "https://starter-app-production.fly.dev/documentation/",
  standalone: "https://starter-app-docs.fly.dev/",
};

export function getDocumentationUrl(
  options: { url?: string; serverUrl?: string; development?: boolean; locale?: string } = {}
): string {
  const host: DocumentationHosting = DOCUMENTATION_HOST;
  const base =
    options.url ||
    (options.development
      ? "http://localhost:3001/"
      : ["server"].includes(host) && options.serverUrl
        ? `${options.serverUrl.replace(/\/$/, "")}/documentation/`
        : documentationUrls[host]);
  // Docusaurus development serves one locale at the base path.
  if (options.development) return `${base.replace(/\/$/, "")}/`;
  const locale =
    APP_LOCALE_CONFIG.locales.find(
      ({ code }) =>
        code.replaceAll("_", "-").toLowerCase() ===
        options.locale?.replaceAll("_", "-").toLowerCase()
    )?.code ?? APP_LOCALE_CONFIG.defaultLocale;
  return `${base.replace(/\/$/, "")}/${locale === APP_LOCALE_CONFIG.defaultLocale ? "" : `${locale.replaceAll("_", "-")}/`}`;
}
