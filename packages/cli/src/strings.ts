import { randomBytes } from "node:crypto";
import type { TemplateContext } from "./types";

export function slugifyAppName(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/g, "")
    .replace(/-+$/g, "")
    .replace(/-{2,}/g, "-");

  if (!slug) {
    throw new Error("Unable to derive an app slug from the provided name.");
  }

  return slug;
}

export function derivePackageScope(appSlug: string): string {
  return `@${appSlug}`;
}

export function toDisplayName(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error("App name cannot be empty.");
  }

  return normalized;
}

export function createBetterAuthSecret(): string {
  return randomBytes(24).toString("base64url");
}

export function renderTemplate(content: string, context: TemplateContext): string {
  const replacements: Record<string, string> = {
    APP_NAME: context.appName,
    APP_DESCRIPTION: context.appDescription,
    APP_SLUG: context.appSlug,
    PACKAGE_SCOPE: context.packageScope,
    BETTER_AUTH_SECRET: context.betterAuthSecret,
  };

  return content.replace(/\{\{([A-Z_]+)\}\}/g, (match, token: string) => {
    const replacement = replacements[token];
    return replacement ?? match;
  });
}
