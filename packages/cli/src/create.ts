import path from "node:path";
import { TEMPLATE_NAME } from "./constants";
import { copyTemplateDirectory, ensureDirectoryState, runGitInit, runInstall } from "./fs";
import { getTemplateRoot } from "./paths";
import { resolveCreateCommandOptions } from "./prompts";
import { createBetterAuthSecret, derivePackageScope, slugifyAppName } from "./strings";
import type { CreateCommandOptions, TemplateContext } from "./types";

export interface ScaffoldResult {
  context: TemplateContext;
  targetDirectory: string;
  templateName: string;
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

  await ensureDirectoryState(targetDirectory, options.force);
  await copyTemplateDirectory(templateDirectory, targetDirectory, context);

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
