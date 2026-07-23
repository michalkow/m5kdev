import fs from "node:fs/promises";
import path from "node:path";
import { stdin as input, stdout as output } from "node:process";
import readline from "node:readline/promises";
import { diagnoseManagedRepo } from "./doctor";
import { collectTemplateFiles } from "./fs";
import { getTemplateRoot } from "./paths";
import { createManagedState, getCliVersion, STATE_FILE_NAME, writeManagedState } from "./state";
import { derivePackageScope, toDisplayName } from "./strings";
import { getExcludedFeaturePaths, loadTemplateManifest } from "./template";
import type { TemplateContext } from "./types";

export interface InitCommandOptions {
  repoRoot: string;
  yes: boolean;
  force: boolean;
}

async function inferPackageScope(repoRoot: string, fallbackSlug: string): Promise<string> {
  const appsRoot = path.join(repoRoot, "apps");
  const scopes = new Map<string, number>();
  for (const entry of await fs.readdir(appsRoot, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory()) continue;
    const packagePath = path.join(appsRoot, entry.name, "package.json");
    try {
      const manifest = JSON.parse(await fs.readFile(packagePath, "utf8")) as { name?: string };
      const match = manifest.name?.match(/^(@[^/]+)\//);
      if (match) scopes.set(match[1], (scopes.get(match[1]) ?? 0) + 1);
    } catch {
      // Optional app directories do not all need package manifests.
    }
  }
  return (
    [...scopes.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ??
    derivePackageScope(fallbackSlug)
  );
}

async function inferContext(repoRoot: string): Promise<TemplateContext> {
  const rootPackage = JSON.parse(
    await fs.readFile(path.join(repoRoot, "package.json"), "utf8")
  ) as {
    name?: string;
    description?: string;
  };
  if (!rootPackage.name)
    throw new Error("Cannot infer the app slug: root package.json has no name.");
  const appSlug = rootPackage.name.split("/").at(-1);
  if (!appSlug) throw new Error("Cannot infer the app slug from root package.json.");
  let appName = toDisplayName(appSlug.replace(/[-_]+/g, " "));
  const constantsPath = path.join(repoRoot, "apps/shared/src/modules/app/app.constants.ts");
  try {
    const constants = await fs.readFile(constantsPath, "utf8");
    appName = constants.match(/APP_NAME\s*=\s*["']([^"']+)["']/)?.[1] ?? appName;
  } catch {
    // The required-path diagnostic will explain missing shared configuration.
  }
  return {
    appName,
    appDescription: rootPackage.description ?? `${appName} uses the m5kdev stack.`,
    appSlug,
    packageScope: await inferPackageScope(repoRoot, appSlug),
    betterAuthSecret: "ignored-by-managed-state",
  };
}

async function inferFeatures(repoRoot: string): Promise<Set<string>> {
  const enabled = new Set<string>();
  const has = (relativePath: string) =>
    fs
      .access(path.join(repoRoot, relativePath))
      .then(() => true)
      .catch(() => false);
  if (await has("apps/webapp")) enabled.add("webapp");
  if (await has("apps/expo")) enabled.add("expo");
  if (await has("apps/e2e")) enabled.add("test-harness");
  return enabled;
}

async function confirmInitialization(version: string, yes: boolean): Promise<void> {
  if (yes) return;
  if (!process.stdin.isTTY) {
    throw new Error(
      "Initialization requires confirmation. Re-run with --yes in a non-interactive shell."
    );
  }
  const prompt = readline.createInterface({ input, output });
  try {
    const answer = await prompt.question(
      `Record this repository as template ${version} without applying older migrations? y/N: `
    );
    if (!/^y(es)?$/i.test(answer.trim())) throw new Error("Initialization cancelled.");
  } finally {
    prompt.close();
  }
}

export async function initializeManagedRepo(options: InitCommandOptions) {
  const statePath = path.join(options.repoRoot, STATE_FILE_NAME);
  if (
    !options.force &&
    (await fs
      .access(statePath)
      .then(() => true)
      .catch(() => false))
  ) {
    throw new Error(`${STATE_FILE_NAME} already exists. Use --force to re-baseline intentionally.`);
  }
  await fs.access(path.join(options.repoRoot, "pnpm-workspace.yaml"));
  const context = await inferContext(options.repoRoot);
  const enabledFeatures = await inferFeatures(options.repoRoot);
  const templateRoot = getTemplateRoot();
  const manifest = loadTemplateManifest(templateRoot);
  const excludePrefixes = getExcludedFeaturePaths(manifest, enabledFeatures);
  const renderedFiles = await collectTemplateFiles(templateRoot, context, {
    excludePrefixes,
    enabledFeatures,
  });
  const version = getCliVersion();
  const state = createManagedState({
    templateVersion: version,
    enabledFeatures,
    context,
    renderedFiles,
    manifest,
  });
  const report = await diagnoseManagedRepo({ repoRoot: options.repoRoot, state });
  if (!report.ok) return { initialized: false, state, report };

  await confirmInitialization(version, options.yes);
  await writeManagedState(options.repoRoot, state);
  return { initialized: true, state, report };
}
