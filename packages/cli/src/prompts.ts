import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { DEFAULT_APP_NAME, getDefaultDescription } from "./constants";
import { slugifyAppName, toDisplayName } from "./strings";
import type { CreateCommandOptions } from "./types";

function requireInteractive(yes: boolean): void {
  if (!yes && !process.stdin.isTTY) {
    throw new Error("Missing required values in a non-interactive shell. Pass --yes or provide flags.");
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
      : await promptValue("App name", resolved.targetDirectory ? pathBaseName(resolved.targetDirectory) : DEFAULT_APP_NAME);
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

  return resolved;
}

function pathBaseName(value: string): string {
  const normalized = value.replace(/[\\/]+$/g, "");
  const segments = normalized.split(/[\\/]/).filter(Boolean);
  return segments.at(-1) || DEFAULT_APP_NAME;
}
