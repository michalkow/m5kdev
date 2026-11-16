import {
  type ExperienceRegistryConfig,
  experienceRegistrySchema,
} from "@m5kdev/commons/modules/app/experience.schema";
import type { AuthLocaleConfig } from "@m5kdev/commons/modules/auth/auth.locale";
import type { AuthRolesConfig } from "@m5kdev/commons/modules/auth/auth.roles";
import { ExperienceRegistry } from "./experience";

/** Standalone/normalized consumers may receive the owning immutable registry. */
export type BackendAppMetadata = {
  experiences?: ExperienceRegistryConfig;
  experienceRegistry?: ExperienceRegistry;
  name?: string;
  urls?: { web?: string; api?: string };
  brand?: { logo?: string; tagline?: string };
  locales?: AuthLocaleConfig;
  roles?: AuthRolesConfig;
};
/** Kernel authoring accepts a registry definition or the existing singular metadata. */
export type BackendAppAuthoringMetadata = Pick<BackendAppMetadata, "locales" | "roles"> &
  (
    | (Pick<BackendAppMetadata, "name" | "urls" | "brand"> & {
        experiences?: never;
        experienceRegistry?: never;
      })
    | {
        experiences: ExperienceRegistryConfig;
        name?: never;
        urls?: never;
        brand?: never;
        experienceRegistry?: never;
      }
  );

/** Resolve presentation once at composition; standalone Auth retains its SDK-owned static URL paths. */
export function resolvePresentationMetadata(
  config: BackendAppMetadata | undefined,
  env: Record<string, string | undefined>,
  options: { deployed?: boolean } = {}
) {
  const raw = config !== undefined && Object.hasOwn(config, "experiences");
  if (
    raw &&
    ["name", "urls", "brand", "experienceRegistry"].some((key) => Object.hasOwn(config, key))
  )
    throw new Error("Do not mix raw Experience definitions with singular or resolved metadata");
  const experienceRegistry = raw
    ? new ExperienceRegistry(experienceRegistrySchema.parse(config.experiences), options)
    : config?.experienceRegistry;
  const selected = experienceRegistry?.defaultExperience;
  const name = selected?.brand.name ?? config?.name;
  const webUrl = selected?.webOrigin ?? config?.urls?.web ?? env.VITE_APP_URL;
  const apiUrl = selected?.apiOrigin ?? config?.urls?.api ?? env.VITE_SERVER_URL;
  return {
    experienceRegistry,
    name,
    urls: { web: webUrl, api: apiUrl },
    brand: {
      logo:
        selected?.brand.logo ??
        config?.brand?.logo ??
        (webUrl ? new URL("/mark.svg", webUrl).href : undefined),
      tagline:
        selected?.brand.tagline ??
        config?.brand?.tagline ??
        (name ? `${name} publishing workspace` : undefined),
    },
  };
}
