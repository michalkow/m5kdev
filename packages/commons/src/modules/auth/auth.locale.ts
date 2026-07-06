import { z } from "zod";

export interface AuthLocaleDefinition {
  code: string;
  displayName: string;
}

export interface AuthLocaleConfig {
  defaultLocale: string;
  locales: readonly AuthLocaleDefinition[];
}

export function getAllowedLocaleCodes(config: AuthLocaleConfig): readonly string[] {
  return config.locales.map((locale) => locale.code);
}

export function getLocaleDisplayName(config: AuthLocaleConfig, code: string): string {
  return config.locales.find((locale) => locale.code === code)?.displayName ?? code;
}

export interface NormalizedLocaleTag {
  language: string;
  region: string | null;
  compareKey: string;
}

export function normalizeLocaleTag(tag: string): NormalizedLocaleTag | null {
  const trimmed = tag.trim();
  if (!trimmed) return null;

  const parts = trimmed.replace(/_/g, "-").split("-").filter(Boolean);
  if (parts.length === 0) return null;

  const language = parts[0].toLowerCase();
  const region = parts.length > 1 ? parts[1].toUpperCase() : null;
  const compareKey = region ? `${language}_${region}` : language;

  return { language, region, compareKey };
}

function buildCompareKeyFromCanonical(canonical: string): string {
  return normalizeLocaleTag(canonical)?.compareKey ?? canonical.toLowerCase();
}

export function toCanonicalLocale(
  tag: string,
  allowedLocales: readonly string[]
): string | null {
  const normalized = normalizeLocaleTag(tag);
  if (!normalized) return null;

  const allowedByKey = new Map<string, string>();
  for (const locale of allowedLocales) {
    allowedByKey.set(buildCompareKeyFromCanonical(locale), locale);
  }

  if (normalized.region) {
    const regionMatch = allowedByKey.get(`${normalized.language}_${normalized.region}`);
    if (regionMatch) return regionMatch;
  }

  if (!normalized.region) {
    const languageMatch = allowedByKey.get(normalized.language);
    if (languageMatch) return languageMatch;
  }

  if (normalized.region) {
    const languageMatch = allowedByKey.get(normalized.language);
    if (languageMatch) return languageMatch;
  }

  return null;
}

export function toI18nLanguageTag(canonical: string): string {
  const normalized = normalizeLocaleTag(canonical);
  if (!normalized) return canonical;
  if (normalized.region) {
    return `${normalized.language}-${normalized.region}`;
  }
  return normalized.language;
}

export function resolveAppLocale(
  requested: string | null | undefined,
  config: AuthLocaleConfig
): string {
  const allowedLocales = getAllowedLocaleCodes(config);
  if (requested) {
    const canonical = toCanonicalLocale(requested, allowedLocales);
    if (canonical) return canonical;
  }

  const defaultCanonical = toCanonicalLocale(config.defaultLocale, allowedLocales);
  return defaultCanonical ?? allowedLocales[0] ?? config.defaultLocale;
}

export function createLocaleValueSchema(config: AuthLocaleConfig) {
  const allowed = [...getAllowedLocaleCodes(config)];
  if (allowed.length === 0) {
    return z.string();
  }
  return z.enum(allowed as [string, ...string[]]);
}
