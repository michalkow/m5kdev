import fs from "node:fs";
import path from "node:path";
import {
  type AppPlatform,
  OPTIONAL_ENVIRONMENTS,
  type OptionalEnvironment,
  type TemplateFeatureKind,
  type TemplateFeatureManifest,
  type TemplateFilePolicy,
} from "./types";

export const PRODUCT_STACK_FEATURE = "server";

export function withImpliedFeatures(enabled: ReadonlySet<string>): Set<string> {
  const next = new Set(enabled);
  if (next.has("webapp") || next.has("expo")) next.add(PRODUCT_STACK_FEATURE);
  return next;
}

export function hasProductStack(enabled: ReadonlySet<string> | readonly string[]): boolean {
  const features = enabled instanceof Set ? enabled : new Set(enabled);
  return features.has("webapp") || features.has("expo") || features.has(PRODUCT_STACK_FEATURE);
}

export function loadTemplateManifest(templateDirectory: string): TemplateFeatureManifest {
  const manifestPath = path.join(templateDirectory, "template.manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Template manifest is missing: ${manifestPath}`);
  }
  return JSON.parse(fs.readFileSync(manifestPath, "utf8")) as TemplateFeatureManifest;
}

function globToRegExp(pattern: string): RegExp {
  let source = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === "*" && pattern[index + 1] === "*") {
      source += ".*";
      index += 1;
    } else if (character === "*") {
      source += "[^/]*";
    } else {
      source += character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`${source}$`);
}

export function getTemplateFilePolicy(
  manifest: TemplateFeatureManifest,
  relativePath: string
): TemplateFilePolicy {
  for (const rule of manifest.sync.rules) {
    if (globToRegExp(rule.pattern).test(relativePath)) return rule.policy;
  }
  return manifest.sync.defaultPolicy;
}

export interface BackendModuleChoice {
  id: string;
  label: string;
  experimental: boolean;
}

export function getFeatureKind(options: {
  id: string;
  config: TemplateFeatureManifest["features"][string];
}): TemplateFeatureKind {
  if (options.config.kind) return options.config.kind;
  if (options.id === "webapp" || options.id === "expo" || options.id === PRODUCT_STACK_FEATURE)
    return "platform";
  if (options.id === "test-harness") return "harness";
  return "module";
}

export function listBackendModuleChoices(manifest: TemplateFeatureManifest): BackendModuleChoice[] {
  return Object.entries(manifest.features)
    .filter(([id, config]) => getFeatureKind({ id, config }) === "module")
    .map(([id, config]) => ({
      id,
      label: config.label ?? id,
      experimental: Boolean(config.experimental),
    }));
}

/** Template feature id for an optional Deployment environment, e.g. `env-canary`. */
export function environmentFeature(environment: OptionalEnvironment): string {
  return `env-${environment}`;
}

export function enabledEnvironments(features: Iterable<string>): OptionalEnvironment[] {
  const enabled = new Set(features);
  return OPTIONAL_ENVIRONMENTS.filter((environment) =>
    enabled.has(environmentFeature(environment))
  );
}

export function getEnabledFeatures(options: {
  platform: AppPlatform;
  testHarness: boolean;
  modules?: readonly string[];
  environments?: readonly OptionalEnvironment[];
}): Set<string> {
  const enabled = new Set<string>();
  if (options.platform !== "expo" && options.platform !== "landing") enabled.add("webapp");
  if (options.platform !== "web" && options.platform !== "landing") enabled.add("expo");
  if (options.testHarness) enabled.add("test-harness");
  for (const id of options.modules ?? []) enabled.add(id);
  if (options.platform !== "landing") {
    for (const environment of options.environments ?? []) {
      enabled.add(environmentFeature(environment));
    }
  }
  return enabled;
}

const LANDING_LOCAL_ENV_PATHS = ["apps/landing/.env", "apps/landing/.env.example"] as const;

export function getExcludedFeaturePaths(
  manifest: TemplateFeatureManifest,
  enabledFeatures: ReadonlySet<string>
): string[] {
  const effective = withImpliedFeatures(enabledFeatures);
  const excluded = Object.entries(manifest.features)
    .filter(([feature]) => !effective.has(feature))
    .flatMap(([, config]) => [...config.paths]);
  if (hasProductStack(effective)) excluded.push(...LANDING_LOCAL_ENV_PATHS);
  return excluded;
}
