import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { renderTemplate } from "./strings";
import type { RenderedTemplateFile, TemplateContext } from "./types";

const execFileAsync = promisify(execFile);

const TEXT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".css",
  ".html",
  ".svg",
  ".yaml",
  ".yml",
  ".txt",
  ".mdc",
]);
const TEXT_BASENAMES = new Set([".gitignore", ".env", ".env.example", ".npmrc"]);

/** Feature marker blocks: lines between `// m5k:<feature>:start` and `// m5k:<feature>:end`. */
const MARKER_PATTERN = /^[ \t]*\/\/ m5k:([a-z-]+):(start|end)[ \t]*$/;

export interface CopyTemplateOptions {
  /** Repo-root-relative path prefixes to skip entirely (disabled features). */
  excludePrefixes?: readonly string[];
  /** Features whose marker blocks should be kept (markers removed, content kept). */
  enabledFeatures?: ReadonlySet<string>;
  /** Update inspection can retain ignored-file metadata without rendering secret content. */
  ignoreContentFor?: (relativePath: string) => boolean;
}

export async function collectTemplateFiles(
  templateDirectory: string,
  context: TemplateContext,
  options: CopyTemplateOptions = {},
  relativeBase = ""
): Promise<RenderedTemplateFile[]> {
  const entries = await fs.readdir(templateDirectory, { withFileTypes: true });
  const excludePrefixes = options.excludePrefixes ?? [];
  const enabledFeatures = options.enabledFeatures ?? new Set<string>();
  const files: RenderedTemplateFile[] = [];

  for (const entry of entries) {
    const sourcePath = path.join(templateDirectory, entry.name);
    const targetName = renderTemplate(
      entry.name.endsWith(".tpl") ? entry.name.slice(0, -4) : entry.name,
      context
    );
    const relativePath = relativeBase ? `${relativeBase}/${targetName}` : targetName;

    if (relativePath === "template.manifest.json") continue;

    const asDirPrefix = `${relativePath}/`;
    if (
      excludePrefixes.some(
        (prefix) =>
          relativePath === prefix || asDirPrefix === prefix || relativePath.startsWith(prefix)
      )
    ) {
      continue;
    }

    if (entry.isDirectory()) {
      files.push(...(await collectTemplateFiles(sourcePath, context, options, relativePath)));
      continue;
    }
    if (entry.isSymbolicLink()) {
      throw new Error(`Template symlinks are not supported: ${relativePath}`);
    }
    if (!entry.isFile()) continue;

    if (options.ignoreContentFor?.(relativePath)) {
      files.push({
        content: Buffer.alloc(0),
        kind: isTextFile(entry.name) ? "text" : "binary",
        relativePath,
      });
      continue;
    }

    if (!isTextFile(entry.name)) {
      files.push({
        content: await fs.readFile(sourcePath),
        kind: "binary",
        relativePath,
      });
      continue;
    }

    const content = await fs.readFile(sourcePath, "utf8");
    files.push({
      content: Buffer.from(
        applyFeatureMarkers(renderTemplate(content, context), enabledFeatures).replace(
          /\r\n?/g,
          "\n"
        ),
        "utf8"
      ),
      kind: "text",
      relativePath,
    });
  }

  return files;
}

/**
 * Ensures the target directory exists and may be written.
 * Returns true when this call created the directory (safe to remove on failure).
 */
export async function ensureDirectoryState(
  targetDirectory: string,
  force: boolean
): Promise<boolean> {
  const stat = await fs.stat(targetDirectory).catch(() => null);

  if (!stat) {
    await fs.mkdir(targetDirectory, { recursive: true });
    return true;
  }

  if (!stat.isDirectory()) {
    throw new Error(`Target path is not a directory: ${targetDirectory}`);
  }

  const entries = await fs.readdir(targetDirectory);
  if (entries.length > 0 && !force) {
    throw new Error(
      `Target directory is not empty: ${targetDirectory}. Re-run with --force to overwrite.`
    );
  }

  return false;
}

function isTextFile(fileName: string): boolean {
  const withoutTpl = fileName.endsWith(".tpl") ? fileName.slice(0, -4) : fileName;
  if (TEXT_BASENAMES.has(withoutTpl)) return true;
  return TEXT_EXTENSIONS.has(path.extname(withoutTpl));
}

/**
 * Removes feature marker lines. Blocks for disabled features are dropped with
 * their content; blocks for enabled features keep the content, lose the markers.
 */
export function applyFeatureMarkers(content: string, enabledFeatures: ReadonlySet<string>): string {
  const lines = content.split("\n");
  const out: string[] = [];
  let skippingFeature: string | undefined;

  for (const line of lines) {
    const match = line.match(MARKER_PATTERN);
    if (!match) {
      if (skippingFeature === undefined) out.push(line);
      continue;
    }

    const [, feature, edge] = match;
    if (edge === "start") {
      if (!enabledFeatures.has(feature)) skippingFeature = feature;
    } else if (skippingFeature === feature) {
      skippingFeature = undefined;
    }
    // marker lines themselves are never emitted
  }

  return out.join("\n");
}

export async function copyTemplateDirectory(
  templateDirectory: string,
  targetDirectory: string,
  context: TemplateContext,
  options: CopyTemplateOptions = {}
): Promise<void> {
  const files = await collectTemplateFiles(templateDirectory, context, options);
  for (const file of files) {
    const targetPath = path.join(targetDirectory, file.relativePath);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, file.content);
  }
}

export async function runInstall(targetDirectory: string): Promise<void> {
  await execFileAsync("pnpm", ["install"], {
    cwd: targetDirectory,
    env: process.env,
  });
}

export async function runGitInit(targetDirectory: string): Promise<void> {
  await execFileAsync("git", ["init"], {
    cwd: targetDirectory,
    env: process.env,
  });
}
