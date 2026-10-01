import { stdin as input, stdout as output } from "node:process";
import readline from "node:readline/promises";
import { DEFAULT_APP_NAME, getDefaultDescription } from "./constants";
import { getTemplateRoot } from "./paths";
import { slugifyAppName, toDisplayName } from "./strings";
import type { BackendModuleChoice } from "./template";
import { listBackendModuleChoices, loadTemplateManifest } from "./template";
import type { AppPlatform, CreateCommandOptions } from "./types";

function requireInteractive(yes: boolean): void {
  if (!yes && !process.stdin.isTTY) {
    throw new Error(
      "Missing required values in a non-interactive shell. Pass --yes or provide flags."
    );
  }
}

async function promptValue(question: string, fallback?: string): Promise<string> {
  const rl = readline.createInterface({ input, output });

  try {
    const suffix = fallback ? ` (${fallback})` : "";
    const response = await rl.question(`${question}${suffix}: `);
    return response.trim() || fallback || "";
  } finally {
    rl.close();
  }
}

export function parsePlatform(value: string): AppPlatform | undefined {
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "web" ||
    normalized === "expo" ||
    normalized === "both" ||
    normalized === "landing"
  ) {
    return normalized;
  }
  return undefined;
}

export function formatBackendModulesPrompt(choices: readonly BackendModuleChoice[]): string {
  const catalog = choices
    .map((choice) => (choice.experimental ? `${choice.id} (experimental)` : choice.id))
    .join(", ");
  return `Backend modules — comma-separated ids, or none [${catalog}]`;
}

export function parseBackendModulesAnswer(options: {
  answer: string;
  choices: readonly BackendModuleChoice[];
}): string[] {
  const trimmed = options.answer.trim().toLowerCase();
  if (!trimmed || trimmed === "none" || trimmed === "n") return [];
  const allowed = new Map(options.choices.map((choice) => [choice.id, choice.id]));
  const selected: string[] = [];
  for (const raw of trimmed.split(",")) {
    const id = raw.trim();
    if (!id) continue;
    const resolved = allowed.get(id);
    if (!resolved) {
      throw new Error(
        `Unknown Backend Module "${id}". Use comma-separated ids from the prompt, or none.`
      );
    }
    if (!selected.includes(resolved)) selected.push(resolved);
  }
  return selected;
}

export async function resolveCreateCommandOptions(
  options: CreateCommandOptions
): Promise<CreateCommandOptions> {
  const resolved = { ...options };

  if (!resolved.appName) {
    requireInteractive(resolved.yes);
    resolved.appName = resolved.yes
      ? resolved.targetDirectory
        ? toDisplayName(pathBaseName(resolved.targetDirectory))
        : DEFAULT_APP_NAME
      : await promptValue(
          "App name",
          resolved.targetDirectory ? pathBaseName(resolved.targetDirectory) : DEFAULT_APP_NAME
        );
  }

  resolved.appName = toDisplayName(resolved.appName);

  if (!resolved.targetDirectory) {
    requireInteractive(resolved.yes);
    resolved.targetDirectory = resolved.yes
      ? slugifyAppName(resolved.appName)
      : await promptValue("Target directory", slugifyAppName(resolved.appName));
  }

  if (!resolved.appDescription) {
    requireInteractive(resolved.yes);
    const fallback = getDefaultDescription(resolved.appName);
    resolved.appDescription = resolved.yes
      ? fallback
      : await promptValue("App description", fallback);
  }

  if (!resolved.platform) {
    requireInteractive(resolved.yes);
    if (resolved.yes) {
      resolved.platform = "web";
    } else {
      const answer = await promptValue("App platform — web, expo, both, or landing", "web");
      const platform = parsePlatform(answer);
      if (!platform) {
        throw new Error(`Invalid platform "${answer}". Use web, expo, both, or landing.`);
      }
      resolved.platform = platform;
    }
  }

  if (resolved.platform === "landing") {
    if (resolved.testHarness) {
      throw new Error(
        "The e2e test harness requires a Webapp. Do not pass --with-test-harness with --platform landing."
      );
    }
    resolved.testHarness = false;
    resolved.modules = resolved.modules ?? [];
    return resolved;
  }

  if (resolved.testHarness === undefined || resolved.modules === undefined) {
    const extras = await resolveHarnessAndModuleOptions({
      yes: Boolean(resolved.yes),
      testHarness: resolved.testHarness,
      modules: resolved.modules,
    });
    resolved.testHarness = extras.testHarness;
    resolved.modules = extras.modules;
  }

  return resolved;
}

export async function resolveHarnessAndModuleOptions(options: {
  yes: boolean;
  testHarness?: boolean;
  modules?: string[];
}): Promise<{ testHarness: boolean; modules: string[] }> {
  const resolved = { ...options };
  if (resolved.testHarness === undefined) {
    requireInteractive(resolved.yes);
    if (resolved.yes) {
      resolved.testHarness = false;
    } else {
      const answer = await promptValue("Include the e2e test harness? y/N", "n");
      resolved.testHarness = /^y(es)?$/i.test(answer.trim());
    }
  }
  if (resolved.modules === undefined) {
    requireInteractive(resolved.yes);
    if (resolved.yes) {
      resolved.modules = [];
    } else {
      const choices = listBackendModuleChoices(loadTemplateManifest(getTemplateRoot()));
      const answer = await promptValue(formatBackendModulesPrompt(choices), "none");
      resolved.modules = parseBackendModulesAnswer({ answer, choices });
    }
  }
  return { testHarness: Boolean(resolved.testHarness), modules: resolved.modules ?? [] };
}

function pathBaseName(value: string): string {
  const normalized = value.replace(/[\\/]+$/g, "");
  const segments = normalized.split(/[\\/]/).filter(Boolean);
  return segments.at(-1) || DEFAULT_APP_NAME;
}
