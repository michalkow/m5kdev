import fs from "node:fs/promises";
import path from "node:path";
import { TEMPLATE_NAME } from "./constants";
import {
  collectTemplateFiles,
  copyTemplateDirectory,
  ensureDirectoryState,
  runGitInit,
  runInstall,
} from "./fs";
import { getTemplateRoot } from "./paths";
import { resolveCreateCommandOptions } from "./prompts";
import { createManagedState, getCliVersion, writeManagedState } from "./state";
import { createBetterAuthSecret, derivePackageScope, slugifyAppName } from "./strings";
import {
  getEnabledFeatures,
  getExcludedFeaturePaths,
  loadTemplateManifest,
  withImpliedFeatures,
} from "./template";
import type { CreateCommandOptions, TemplateContext } from "./types";

export interface ScaffoldResult {
  context: TemplateContext;
  targetDirectory: string;
  templateName: string;
}

export async function scaffoldProject(
  initialOptions: CreateCommandOptions
): Promise<ScaffoldResult> {
  const options = await resolveCreateCommandOptions(initialOptions);
  const { appName, appDescription, targetDirectory: targetDirectoryOption } = options;
  if (!appName || !appDescription || !targetDirectoryOption) {
    throw new Error("Unable to resolve the required create options.");
  }
  const appSlug = slugifyAppName(appName);
  const targetDirectory = path.resolve(process.cwd(), targetDirectoryOption);
  const templateDirectory = getTemplateRoot();

  const context: TemplateContext = {
    appName,
    appDescription,
    appSlug,
    packageScope: derivePackageScope(appSlug),
    betterAuthSecret: createBetterAuthSecret(),
  };

  const platform = options.platform ?? "web";
  if (platform === "landing" && options.testHarness) {
    throw new Error(
      "The e2e test harness requires a Webapp. Do not pass --with-test-harness with --platform landing."
    );
  }
  const enabledFeatures = getEnabledFeatures({
    platform,
    testHarness: Boolean(options.testHarness),
    modules: options.modules ?? [],
  });
  const manifest = loadTemplateManifest(templateDirectory);
  const templateFeatures = withImpliedFeatures(enabledFeatures);
  const excludePrefixes = getExcludedFeaturePaths(manifest, enabledFeatures);

  const createdTargetDirectory = await ensureDirectoryState(targetDirectory, options.force);
  try {
    await copyTemplateDirectory(templateDirectory, targetDirectory, context, {
      excludePrefixes,
      enabledFeatures: templateFeatures,
    });
    const renderedFiles = await collectTemplateFiles(templateDirectory, context, {
      excludePrefixes,
      enabledFeatures: templateFeatures,
    });
    await writeManagedState(
      targetDirectory,
      createManagedState({
        templateVersion: getCliVersion(),
        enabledFeatures,
        context,
        renderedFiles,
        manifest,
      })
    );
  } catch (error) {
    if (createdTargetDirectory) {
      await fs.rm(targetDirectory, { recursive: true, force: true });
    }
    throw error;
  }

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
