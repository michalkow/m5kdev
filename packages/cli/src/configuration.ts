import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { findRepositorySymlink } from "./changes";
import type { Diagnostic, VerificationCheck } from "./diagnostics";
import type { ManagedState } from "./state";
import { hasProductStack } from "./template";

/** Configuration presence is evidence of setup, never evidence of live execution. */
export async function inspectConfiguration(options: {
  repoRoot: string;
  state: ManagedState;
  manifests: ReadonlyMap<string, { scripts?: Record<string, string> }>;
  checkRuntimeConfiguration: boolean;
}): Promise<{ diagnostics: Diagnostic[]; verification: VerificationCheck[] }> {
  const { repoRoot, state, manifests } = options;
  const diagnostics: Diagnostic[] = [];
  const verification: VerificationCheck[] = [];
  const root = manifests.get("package.json");
  const configurations: Array<{
    id: string;
    paths: string[];
    message: string;
    suggestion: string;
  }> = [];
  if (hasProductStack(state.template.features)) {
    configurations.push({
      id: "migrations",
      paths: [
        "apps/server/db.ts",
        "apps/server/drizzle.config.ts",
        "apps/server/src/schema.ts",
        ...(options.checkRuntimeConfiguration ? ["apps/shared/.env"] : []),
      ],
      message:
        "Migration configuration inspected; schema generation, database connectivity, and application were not executed.",
      suggestion:
        "Apply the relevant guides and verify the local/Development migration path. Production migration requires explicit user instruction and the deploy workflow.",
    });
  }
  const workflows = Object.keys(state.files).filter((file) =>
    /^\.github\/workflows\/.*\.ya?ml$/.test(file)
  );
  if (workflows.length)
    configurations.push({
      id: "ci",
      paths: workflows,
      message: "Workflow configuration inspected; CI jobs were not executed.",
      suggestion: "Verify the affected jobs in CI and record their run results.",
    });
  const deploymentPaths = new Set<string>();
  for (const [name, script] of Object.entries(root?.scripts ?? {})) {
    if (!name.includes("deploy") && !name.includes("secrets")) continue;
    if (typeof script !== "string") continue;
    for (const match of script.matchAll(
      /--(?:config|dockerfile)\s+(?:"([^"]+)"|'([^']+)'|([^\s]+))/g
    )) {
      const file = match[1] ?? match[2] ?? match[3];
      if (file && !/[${}]/.test(file)) deploymentPaths.add(file);
    }
  }
  if (deploymentPaths.size)
    configurations.push({
      id: "deployment",
      paths: [...deploymentPaths],
      message:
        "Deployment file references inspected; image builds, remote credentials, and deployments were not tested.",
      suggestion:
        "Verify affected build/deploy paths under the guide. Do not deploy Production without explicit user instruction.",
    });
  if (
    root?.scripts?.["docs:build"] ||
    state.template.features.some((feature) => feature.startsWith("docs-"))
  )
    configurations.push({
      id: "documentation",
      paths: [
        "apps/docs/package.json",
        "apps/docs/docusaurus.config.ts",
        "apps/docs/sidebars.ts",
        "apps/docs/docs",
      ],
      message:
        "Documentation configuration inspected; guide accuracy and published hosting were not tested.",
      suggestion:
        "Run doctor --full for the documentation build; inspect affected guides, locales, and navigation.",
    });
  const buildPaths: string[] = [];
  for (const [file, manifest] of manifests) {
    for (const script of Object.values(manifest.scripts ?? {})) {
      if (typeof script !== "string") continue;
      if (/\btsc\b/.test(script)) {
        const project = script.match(
          /(?:^|\s)(?:-p|--project)(?:=|\s+)(?:"([^"]+)"|'([^']+)'|([^\s]+))/
        );
        const argument = project?.[1] ?? project?.[2] ?? project?.[3];
        if (!argument || !/[${}]/.test(argument)) {
          let configPath = path.resolve(repoRoot, path.dirname(file), argument ?? "tsconfig.json");
          const stat = await fs.stat(configPath).catch(() => undefined);
          if (stat?.isDirectory()) configPath = path.join(configPath, "tsconfig.json");
          buildPaths.push(path.relative(repoRoot, configPath).split(path.sep).join("/"));
        }
      }
      if (file === "package.json" && /\bturbo\s+run\b/.test(script)) buildPaths.push("turbo.json");
    }
  }
  if (buildPaths.length)
    configurations.push({
      id: "build-configuration",
      paths: [...new Set(buildPaths)],
      message:
        "TypeScript/Turbo configuration paths inspected; commands were not executed by this check.",
      suggestion: "Run doctor --full after completing applicable guides.",
    });
  for (const configuration of configurations) {
    const before = diagnostics.length;
    const evidence: string[] = [];
    for (const file of configuration.paths) {
      const absolute = path.resolve(repoRoot, file);
      if (!absolute.startsWith(`${repoRoot}${path.sep}`)) {
        diagnostics.push({
          code: "CONFIGURATION_EXTERNAL",
          severity: "warning",
          path: file,
          message: "External configuration reference requires manual inspection.",
        });
        continue;
      }
      const symlink = await findRepositorySymlink(repoRoot, path.relative(repoRoot, absolute));
      if (symlink) {
        diagnostics.push({
          code: "MANAGED_PATH_SYMLINK",
          severity: "error",
          path: file,
          message: `Configuration path contains symbolic link ${symlink}.`,
        });
      } else {
        const present = await fs.access(absolute).then(
          () => true,
          () => false
        );
        if (!present) {
          diagnostics.push({
            code: "CONFIGURATION_MISSING",
            severity: "error",
            path: file,
            message: `Required ${configuration.id} configuration path is missing.`,
            suggestion: configuration.suggestion,
          });
          continue;
        }
        evidence.push(`Found ${file}.`);
        if (configuration.id === "ci") {
          try {
            const workflow = parse(await fs.readFile(absolute, "utf8"));
            if (
              !workflow ||
              typeof workflow !== "object" ||
              !workflow.jobs ||
              typeof workflow.jobs !== "object" ||
              Object.keys(workflow.jobs).length === 0
            )
              throw new Error("Missing jobs");
          } catch {
            diagnostics.push({
              code: "CONFIGURATION_INVALID",
              severity: "error",
              path: file,
              message: "Workflow must be valid YAML with at least one job.",
            });
          }
        }
      }
    }
    if (configuration.id === "migrations") {
      if (options.checkRuntimeConfiguration) {
        const env = await fs
          .readFile(path.join(repoRoot, "apps/shared/.env"), "utf8")
          .catch(() => "");
        for (const key of ["DATABASE_URL", "DATABASE_DIRECT_URL"]) {
          const value = env
            .match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]
            ?.trim()
            .replace(/^["']|["']$/g, "");
          if (!process.env[key] && !value)
            diagnostics.push({
              code: "CONFIGURATION_VALUE_MISSING",
              severity: "error",
              path: "apps/shared/.env",
              message: `${key} is required; its value was not printed.`,
              suggestion: "Configure local/Development database URLs before testing migrations.",
            });
        }
      } else {
        verification.push({
          id: "runtime-configuration",
          status: "configured-but-untested",
          message: "Source enrollment did not inspect local runtime environment values or secrets.",
          suggestion: "Configure the local/Development environment, then run doctor --full.",
        });
      }
      const scripts = manifests.get("apps/server/package.json")?.scripts;
      for (const script of ["drizzle:generate", "drizzle:migrate"]) {
        if (!scripts?.[script])
          diagnostics.push({
            code: "CONFIGURATION_SCRIPT_MISSING",
            severity: "error",
            path: "apps/server/package.json",
            message: `Missing migration script ${script}.`,
          });
      }
    }
    verification.push({
      id: configuration.id,
      status: diagnostics.slice(before).some((diagnostic) => diagnostic.severity === "error")
        ? "blocked"
        : "configured-but-untested",
      message: configuration.message,
      evidence,
      suggestion: configuration.suggestion,
    });
  }
  return { diagnostics, verification };
}
