import fs from "node:fs";
import path from "node:path";
import type { TemplateFeatureKind, TemplateFeatureManifest, TemplateFilePolicy } from "./types";

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
  if (options.id === "webapp" || options.id === "expo") return "platform";
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

export function getEnabledFeatures(options: {
  platform: "web" | "expo" | "both";
  testHarness: boolean;
  modules?: readonly string[];
}): Set<string> {
  const enabled = new Set<string>();
  if (options.platform !== "expo") enabled.add("webapp");
  if (options.platform !== "web") enabled.add("expo");
  if (options.testHarness) enabled.add("test-harness");
  for (const id of options.modules ?? []) enabled.add(id);
  return enabled;
}

export function getExcludedFeaturePaths(
  manifest: TemplateFeatureManifest,
  enabledFeatures: ReadonlySet<string>
): string[] {
  return Object.entries(manifest.features)
    .filter(([feature]) => !enabledFeatures.has(feature))
    .flatMap(([, config]) => [...config.paths]);
}
