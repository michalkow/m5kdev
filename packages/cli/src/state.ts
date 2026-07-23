import { createHash } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  type ConsumerCatalog,
  collectConsumerDependencyNamesFromManifests,
  readCatalog,
} from "./catalog";
import { getTemplateFilePolicy } from "./template";
import type {
  RenderedTemplateFile,
  TemplateContext,
  TemplateFeatureManifest,
  TemplateFilePolicy,
} from "./types";

export const STATE_FILE_NAME = ".m5kdev.json";
export const STATE_SCHEMA_VERSION = 1;

const stateFileSchema = z.object({
  kind: z.enum(["text", "binary"]),
  policy: z.enum(["merge", "ensure", "ignore"]),
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
});

export const managedStateSchema = z.object({
  schemaVersion: z.literal(STATE_SCHEMA_VERSION),
  template: z.object({
    name: z.string().min(1),
    version: z.string().min(1),
    features: z.array(z.string()),
    context: z.object({
      appName: z.string().min(1),
      appDescription: z.string(),
      appSlug: z.string().min(1),
      packageScope: z.string().min(1),
    }),
  }),
  catalog: z.record(z.string(), z.string()),
  files: z.record(z.string(), stateFileSchema),
  appliedMigrations: z.array(z.string()),
});

export type ManagedState = z.infer<typeof managedStateSchema>;

export function sha256(content: Uint8Array | string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function getCliVersion(): string {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(moduleDirectory, "../package.json"),
    path.resolve(moduleDirectory, "../../package.json"),
  ];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    const manifest = JSON.parse(fs.readFileSync(candidate, "utf8")) as { version?: string };
    if (manifest.version) return manifest.version;
  }
  throw new Error("Unable to resolve the create-m5kdev package version.");
}

export function createManagedState(options: {
  templateVersion: string;
  enabledFeatures: ReadonlySet<string>;
  context: TemplateContext;
  renderedFiles: readonly RenderedTemplateFile[];
  manifest: TemplateFeatureManifest;
  appliedMigrations?: readonly string[];
}): ManagedState {
  const files: ManagedState["files"] = {};
  let catalog: ConsumerCatalog = {};

  for (const file of options.renderedFiles) {
    const policy: TemplateFilePolicy = getTemplateFilePolicy(options.manifest, file.relativePath);
    files[file.relativePath] = {
      kind: file.kind,
      policy,
      ...(policy === "ignore" ? {} : { sha256: sha256(file.content) }),
    };
    if (file.relativePath === "pnpm-workspace.yaml") {
      catalog = readCatalog(file.content.toString("utf8"));
    }
  }

  const renderedPackageManifests = options.renderedFiles
    .filter(
      (file) => file.relativePath === "package.json" || file.relativePath.endsWith("/package.json")
    )
    .map((file) => JSON.parse(file.content.toString("utf8")) as Record<string, unknown>);
  const referencedCatalogNames = new Set(
    collectConsumerDependencyNamesFromManifests(renderedPackageManifests)
  );
  catalog = Object.fromEntries(
    Object.entries(catalog).filter(([name]) => referencedCatalogNames.has(name))
  );

  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    template: {
      name: "minimal-app",
      version: options.templateVersion,
      features: [...options.enabledFeatures].sort(),
      context: {
        appName: options.context.appName,
        appDescription: options.context.appDescription,
        appSlug: options.context.appSlug,
        packageScope: options.context.packageScope,
      },
    },
    catalog,
    files,
    appliedMigrations: [...(options.appliedMigrations ?? [])],
  };
}

export async function writeManagedState(repoRoot: string, state: ManagedState): Promise<void> {
  await fsp.writeFile(
    path.join(repoRoot, STATE_FILE_NAME),
    `${JSON.stringify(state, null, 2)}\n`,
    "utf8"
  );
}

export async function readManagedState(repoRoot: string): Promise<ManagedState> {
  const statePath = path.join(repoRoot, STATE_FILE_NAME);
  const parsed = JSON.parse(await fsp.readFile(statePath, "utf8")) as unknown;
  return managedStateSchema.parse(parsed);
}
