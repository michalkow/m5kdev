import { scaffoldProject } from "./create";
import type { CreateCommandOptions } from "./types";

interface ParsedCli {
  command?: string;
  directory?: string;
  options: Record<string, string | boolean>;
}

export async function runCli(argv: readonly string[]): Promise<void> {
  const parsed = parseCli(argv);

  if (!parsed.command || parsed.command === "--help" || parsed.command === "-h") {
    printHelp();
    return;
  }

  if (parsed.command !== "create") {
    throw new Error(`Unknown command: ${parsed.command}`);
  }

  const options = toCreateCommandOptions(parsed);
  const result = await scaffoldProject(options);

  console.log("");
  console.log(`Scaffolded ${result.context.appName} in ${result.targetDirectory}`);
  console.log("");
  console.log("Next steps:");
  console.log(`  cd ${result.targetDirectory}`);
  if (options.skipInstall) {
    console.log("  pnpm install");
  }
  console.log("  pnpm --filter ./apps/server sync");
  console.log("  pnpm dev");
}

function parseCli(argv: readonly string[]): ParsedCli {
  const [command, ...rest] = argv;
  const options: Record<string, string | boolean> = {};
  let directory: string | undefined;

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];

    if (!token.startsWith("--")) {
      directory ??= token;
      continue;
    }

    const [rawKey, inlineValue] = token.slice(2).split("=", 2);

    if (isBooleanFlag(rawKey)) {
      options[rawKey] = true;
      continue;
    }

    const nextValue = inlineValue ?? rest[index + 1];
    if (!nextValue || nextValue.startsWith("--")) {
      throw new Error(`Missing value for --${rawKey}`);
    }

    options[rawKey] = nextValue;
    if (inlineValue === undefined) {
      index += 1;
    }
  }

  return { command, directory, options };
}

function isBooleanFlag(value: string): boolean {
  return ["yes", "force", "skip-install", "skip-git"].includes(value);
}

function toCreateCommandOptions(parsed: ParsedCli): CreateCommandOptions {
  return {
    targetDirectory: parsed.directory,
    appName: getStringOption(parsed.options, "name"),
    appDescription: getStringOption(parsed.options, "description"),
    yes: Boolean(parsed.options.yes),
    force: Boolean(parsed.options.force),
    skipInstall: Boolean(parsed.options["skip-install"]),
    skipGit: Boolean(parsed.options["skip-git"]),
  };
}

function getStringOption(
  options: Record<string, string | boolean>,
  key: string
): string | undefined {
  const value = options[key];
  return typeof value === "string" ? value : undefined;
}

function printHelp(): void {
  console.log("m5kdev");
  console.log("");
  console.log("Usage:");
  console.log("  m5kdev create [directory] [options]");
  console.log("");
  console.log("Options:");
  console.log("  --name <value>           Set the app name");
  console.log("  --description <value>    Set the app description");
  console.log("  --yes                    Accept defaults for missing prompts");
  console.log("  --force                  Allow writing into a non-empty directory");
  console.log("  --skip-install           Skip pnpm install");
  console.log("  --skip-git               Skip git init");
}
