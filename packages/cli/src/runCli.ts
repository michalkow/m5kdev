import { scaffoldProject } from "./create";
import { printDiagnosticReport } from "./diagnostics";
import { diagnoseManagedRepo } from "./doctor";
import { initializeManagedRepo } from "./init";
import type { CreateCommandOptions } from "./types";
import { updateManagedRepo } from "./update";

interface ParsedCli {
  command?: string;
  directory?: string;
  help?: boolean;
  options: Record<string, string | boolean>;
}

const COMMANDS = new Set(["create", "init", "doctor", "update"]);
const STRING_FLAGS = new Set(["name", "description", "platform"]);
const BOOLEAN_FLAGS = new Set([
  "yes",
  "force",
  "skip-install",
  "skip-git",
  "with-test-harness",
  "dry-run",
  "json",
  "full",
]);

export async function runCli(argv: readonly string[]): Promise<void> {
  const parsed = parseCli(argv);

  if (
    !parsed.command ||
    parsed.command === "--help" ||
    parsed.command === "-h" ||
    parsed.command === "help"
  ) {
    printHelp();
    return;
  }
  if (parsed.help) {
    printHelp(parsed.command);
    return;
  }

  switch (parsed.command) {
    case "create":
      await runCreate(parsed);
      return;
    case "init":
      await runInit(parsed);
      return;
    case "doctor":
      await runDoctor(parsed);
      return;
    case "update":
      await runUpdate(parsed);
      return;
    default:
      throw new Error(`Unknown command: ${parsed.command}`);
  }
}

async function runCreate(parsed: ParsedCli): Promise<void> {
  validateOptions(parsed, [
    "name",
    "description",
    "platform",
    "with-test-harness",
    "yes",
    "force",
    "skip-install",
    "skip-git",
  ]);
  const options = toCreateCommandOptions(parsed);
  const result = await scaffoldProject(options);

  console.log("");
  console.log(`Scaffolded ${result.context.appName} in ${result.targetDirectory}`);
  console.log("");
  console.log("Next steps:");
  console.log(`  cd ${result.targetDirectory}`);
  if (options.skipInstall) console.log("  pnpm install");
  console.log("  pnpm --filter ./apps/server drizzle:migrate");
  console.log("  pnpm dev");
}

async function runInit(parsed: ParsedCli): Promise<void> {
  validateRepositoryCommand(parsed, ["yes", "force", "json"]);
  const json = Boolean(parsed.options.json);
  const result = await initializeManagedRepo({
    repoRoot: process.cwd(),
    yes: Boolean(parsed.options.yes),
    force: Boolean(parsed.options.force),
  });
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printDiagnosticReport(result.report);
    console.log(
      result.initialized
        ? `Initialized .m5kdev.json at template ${result.state.template.version}.`
        : "Initialization was not applied."
    );
  }
  if (!result.initialized) process.exitCode = 1;
}

async function runDoctor(parsed: ParsedCli): Promise<void> {
  validateRepositoryCommand(parsed, ["full", "json"]);
  const report = await diagnoseManagedRepo({
    repoRoot: process.cwd(),
    full: Boolean(parsed.options.full),
  });
  if (parsed.options.json) console.log(JSON.stringify(report, null, 2));
  else printDiagnosticReport(report);
  if (!report.ok) process.exitCode = 1;
}

async function runUpdate(parsed: ParsedCli): Promise<void> {
  validateRepositoryCommand(parsed, ["dry-run", "skip-install", "json"]);
  const result = await updateManagedRepo({
    repoRoot: process.cwd(),
    dryRun: Boolean(parsed.options["dry-run"]),
    skipInstall: Boolean(parsed.options["skip-install"]),
  });
  if (parsed.options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const action = result.dryRun ? "Planned" : result.applied ? "Applied" : "Blocked";
    console.log(`${action} update ${result.fromVersion} -> ${result.targetVersion}.`);
    for (const change of result.changes) {
      console.log(`  ${change.kind.padEnd(6)} ${change.path} — ${change.reason}`);
    }
    for (const conflict of result.conflicts) {
      console.log(`  conflict ${conflict.path} — ${conflict.reason}`);
    }
    if (result.migrations.length > 0) console.log(`Migrations: ${result.migrations.join(", ")}`);
    if (result.installRequired) console.log("Dependencies changed. Run: pnpm install");
    if (result.changes.length === 0 && result.conflicts.length === 0)
      console.log("Already up to date.");
  }
  if (result.conflicts.length > 0) process.exitCode = 1;
}

export function parseCli(argv: readonly string[]): ParsedCli {
  const normalizedArgv = normalizeCliArgv(argv);
  const [command, ...rest] = normalizedArgv;
  const options: Record<string, string | boolean> = {};
  let directory: string | undefined;
  let help = false;

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === "--help" || token === "-h") {
      help = true;
      continue;
    }
    if (!token.startsWith("--")) {
      if (directory) throw new Error(`Unexpected positional argument: ${token}`);
      directory = token;
      continue;
    }

    const [rawKey, inlineValue] = token.slice(2).split("=", 2);
    if (BOOLEAN_FLAGS.has(rawKey)) {
      if (inlineValue !== undefined) throw new Error(`--${rawKey} does not accept a value.`);
      options[rawKey] = true;
      continue;
    }
    if (!STRING_FLAGS.has(rawKey)) throw new Error(`Unknown option: --${rawKey}`);

    const nextValue = inlineValue ?? rest[index + 1];
    if (!nextValue || nextValue.startsWith("--")) throw new Error(`Missing value for --${rawKey}`);
    options[rawKey] = nextValue;
    if (inlineValue === undefined) index += 1;
  }
  return { command, directory, help, options };
}

function normalizeCliArgv(argv: readonly string[]): readonly string[] {
  const [firstToken] = argv;
  if (!firstToken || COMMANDS.has(firstToken) || firstToken === "--help" || firstToken === "-h")
    return argv;
  if (firstToken === "help") return ["--help"];
  return ["create", ...argv];
}

function validateRepositoryCommand(parsed: ParsedCli, allowedOptions: readonly string[]): void {
  if (parsed.directory)
    throw new Error(
      `${parsed.command} operates on the current directory and accepts no directory argument.`
    );
  validateOptions(parsed, allowedOptions);
}

function validateOptions(parsed: ParsedCli, allowedOptions: readonly string[]): void {
  const allowed = new Set(allowedOptions);
  for (const option of Object.keys(parsed.options)) {
    if (!allowed.has(option))
      throw new Error(`--${option} is not valid for m5kdev ${parsed.command}.`);
  }
}

function toCreateCommandOptions(parsed: ParsedCli): CreateCommandOptions {
  const platform = getStringOption(parsed.options, "platform");
  if (platform && !["web", "expo", "both"].includes(platform)) {
    throw new Error(`Invalid --platform "${platform}". Use web, expo, or both.`);
  }
  return {
    targetDirectory: parsed.directory,
    appName: getStringOption(parsed.options, "name"),
    appDescription: getStringOption(parsed.options, "description"),
    platform: platform as CreateCommandOptions["platform"],
    testHarness: parsed.options["with-test-harness"] ? true : undefined,
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

function printHelp(command?: string): void {
  console.log("m5kdev");
  console.log("");
  if (!command) {
    console.log("Usage:");
    console.log("  pnpm dlx create-m5kdev@<version> [directory] [create options]");
    console.log("  pnpm dlx create-m5kdev@<version> init [--yes] [--force] [--json]");
    console.log("  pnpm dlx create-m5kdev@<version> doctor [--full] [--json]");
    console.log("  pnpm dlx create-m5kdev@<version> update [--dry-run] [--skip-install] [--json]");
    console.log("");
    console.log("Run m5kdev <command> --help for command options.");
    return;
  }
  console.log(`Usage: m5kdev ${command}${command === "create" ? " [directory]" : ""} [options]`);
  console.log("");
  if (command === "create") {
    console.log("  --name <value>           Set the app name");
    console.log("  --description <value>    Set the app description");
    console.log("  --platform <value>       web (default), expo, or both");
    console.log("  --with-test-harness      Include the e2e test harness");
    console.log("  --yes                    Accept defaults for missing prompts");
    console.log("  --force                  Allow a non-empty directory");
    console.log("  --skip-install           Skip pnpm install");
    console.log("  --skip-git               Skip git init");
  } else if (command === "init") {
    console.log("  --yes                    Confirm non-interactively");
    console.log("  --force                  Replace existing managed state");
    console.log("  --json                   Emit machine-readable output");
  } else if (command === "doctor") {
    console.log("  --full                   Also run check-types, lint, and build scripts");
    console.log("  --json                   Emit machine-readable output");
  } else if (command === "update") {
    console.log("  --dry-run                Build the complete plan without writes");
    console.log("  --skip-install           Apply sources without pnpm install");
    console.log("  --json                   Emit machine-readable output");
  }
}
