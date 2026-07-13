import fs from "node:fs";
import path from "node:path";
import { TEMPLATE_NAME } from "./constants";
import { copyTemplateDirectory, ensureDirectoryState, runGitInit, runInstall } from "./fs";
import { getTemplateRoot } from "./paths";
import { resolveCreateCommandOptions } from "./prompts";
import { createBetterAuthSecret, derivePackageScope, slugifyAppName } from "./strings";
import type {
  CreateCommandOptions,
  TemplateContext,
  TemplateFeatureManifest,
} from "./types";

export interface ScaffoldResult {
  context: TemplateContext;
  targetDirectory: string;
  templateName: string;
}

function loadFeatureManifest(templateDirectory: string): TemplateFeatureManifest {
  const manifestPath = path.join(templateDirectory, "template.manifest.json");
  if (!fs.existsSync(manifestPath)) {
    return { features: {} };
  }
  return JSON.parse(fs.readFileSync(manifestPath, "utf8")) as TemplateFeatureManifest;
}

export async function scaffoldProject(initialOptions: CreateCommandOptions): Promise<ScaffoldResult> {
  const options = await resolveCreateCommandOptions(initialOptions);
  const appSlug = slugifyAppName(options.appName!);
  const targetDirectory = path.resolve(process.cwd(), options.targetDirectory!);
  const templateDirectory = getTemplateRoot();

  const context: TemplateContext = {
    appName: options.appName!,
    appDescription: options.appDescription!,
    appSlug,
    packageScope: derivePackageScope(appSlug),
    betterAuthSecret: createBetterAuthSecret(),
  };

  const platform = options.platform ?? "web";
  const enabledFeatures = new Set<string>();
  if (platform !== "expo") enabledFeatures.add("webapp");
  if (platform !== "web") enabledFeatures.add("expo");
  if (options.testHarness) enabledFeatures.add("test-harness");

  const manifest = loadFeatureManifest(templateDirectory);
  const excludePrefixes = Object.entries(manifest.features)
    .filter(([feature]) => !enabledFeatures.has(feature))
    .flatMap(([, config]) => config.paths);

  await ensureDirectoryState(targetDirectory, options.force);
  await copyTemplateDirectory(templateDirectory, targetDirectory, context, {
    excludePrefixes,
    enabledFeatures,
  });

  if (!options.skipGit) {
    await runGitInit(targetDirectory);
  }

  if (!options.skipInstall) {
    await runInstall(targetDirectory);
  }

  return {
    context,
    targetDirectory,
    templateName: TEMPLATE_NAME,
  };
}
