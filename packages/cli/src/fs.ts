import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { TemplateContext } from "./types";
import { renderTemplate } from "./strings";

const execFileAsync = promisify(execFile);
const TEMPLATE_LINE_ENDING = "\r\n";

export async function ensureDirectoryState(
  targetDirectory: string,
  force: boolean
): Promise<void> {
  const stat = await fs.stat(targetDirectory).catch(() => null);

  if (!stat) {
    await fs.mkdir(targetDirectory, { recursive: true });
    return;
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
}

export async function copyTemplateDirectory(
  templateDirectory: string,
  targetDirectory: string,
  context: TemplateContext
): Promise<void> {
  const entries = await fs.readdir(templateDirectory, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(templateDirectory, entry.name);
    const targetName = entry.name.endsWith(".tpl") ? entry.name.slice(0, -4) : entry.name;
    const targetPath = path.join(targetDirectory, targetName);

    if (entry.isDirectory()) {
      await fs.mkdir(targetPath, { recursive: true });
      await copyTemplateDirectory(sourcePath, targetPath, context);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const content = await fs.readFile(sourcePath, "utf8");
    const rendered = renderTemplate(content, context).replace(/\r?\n/g, TEMPLATE_LINE_ENDING);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, rendered, "utf8");
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
