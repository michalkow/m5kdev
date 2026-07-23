import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { mergeManagedCatalog } from "./catalog";
import { ChangeSet, findRepositorySymlink } from "./changes";
import { collectTemplateFiles } from "./fs";
import { createManagedState, type ManagedState, sha256 } from "./state";
import { getExcludedFeaturePaths, getTemplateFilePolicy, loadTemplateManifest } from "./template";
import type { RenderedTemplateFile, TemplateContext } from "./types";

const execFileAsync = promisify(execFile);

export interface BaseTemplateProvider {
  getTemplateRoot(version: string): Promise<{ root: string; cleanup: () => Promise<void> }>;
}

export const npmBaseTemplateProvider: BaseTemplateProvider = {
  async getTemplateRoot(version) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "m5kdev-template-"));
    try {
      const { default: pacote } = await import("pacote");
      await pacote.extract(`create-m5kdev@${version}`, directory);
      const root = path.join(directory, "templates", "minimal-app");
      await fs.access(path.join(root, "template.manifest.json"));
      return { root, cleanup: () => fs.rm(directory, { recursive: true, force: true }) };
    } catch (error) {
      await fs.rm(directory, { recursive: true, force: true });
      throw error;
    }
  },
};

function toTemplateContext(state: ManagedState): TemplateContext {
  return { ...state.template.context, betterAuthSecret: "ignored-by-managed-state" };
}

async function renderForState(
  templateRoot: string,
  state: ManagedState
): Promise<{
  files: RenderedTemplateFile[];
  manifest: ReturnType<typeof loadTemplateManifest>;
}> {
  const manifest = loadTemplateManifest(templateRoot);
  const enabledFeatures = new Set(state.template.features);
  return {
    manifest,
    files: await collectTemplateFiles(templateRoot, toTemplateContext(state), {
      enabledFeatures,
      excludePrefixes: getExcludedFeaturePaths(manifest, enabledFeatures),
      ignoreContentFor: (relativePath) =>
        getTemplateFilePolicy(manifest, relativePath) === "ignore",
    }),
  };
}

async function mergeText(base: Buffer, local: Buffer, target: Buffer): Promise<string | undefined> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "m5kdev-merge-"));
  const localPath = path.join(directory, "local");
  const basePath = path.join(directory, "base");
  const targetPath = path.join(directory, "target");
  try {
    await Promise.all([
      fs.writeFile(localPath, local),
      fs.writeFile(basePath, base),
      fs.writeFile(targetPath, target),
    ]);
    try {
      const result = await execFileAsync(
        "git",
        ["merge-file", "-p", "--diff3", localPath, basePath, targetPath],
        {
          encoding: "utf8",
        }
      );
      return result.stdout;
    } catch (error) {
      const mergeError = error as Error & { code?: number };
      if (typeof mergeError.code === "number" && mergeError.code > 0) return undefined;
      throw error;
    }
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

export interface ReconcileResult {
  changes: ChangeSet;
  targetState: ManagedState;
  dependenciesChanged: boolean;
}

export async function reconcileTemplates(options: {
  repoRoot: string;
  state: ManagedState;
  targetTemplateRoot: string;
  targetVersion: string;
  baseProvider?: BaseTemplateProvider;
}): Promise<ReconcileResult> {
  const changes = new ChangeSet(options.repoRoot);
  const target = await renderForState(options.targetTemplateRoot, options.state);
  const enabledFeatures = new Set(options.state.template.features);
  const targetState = createManagedState({
    templateVersion: options.targetVersion,
    enabledFeatures,
    context: toTemplateContext(options.state),
    renderedFiles: target.files,
    manifest: target.manifest,
    appliedMigrations: options.state.appliedMigrations,
  });
  const targetFiles = new Map(target.files.map((file) => [file.relativePath, file]));
  const mergeCandidates: Array<{
    path: string;
    basePath: string;
    local: Buffer;
    target: RenderedTemplateFile;
    deletePath?: string;
  }> = [];
  let dependenciesChanged = false;

  const workspacePath = "pnpm-workspace.yaml";
  const workspaceSymlink = await findRepositorySymlink(options.repoRoot, workspacePath);
  if (workspaceSymlink) {
    changes.addConflict({
      path: workspacePath,
      reason: "The managed workspace file is a symbolic link.",
    });
  }
  const workspace = workspaceSymlink ? undefined : await changes.read(workspacePath);
  if (workspace) {
    const catalogMerge = mergeManagedCatalog({
      source: workspace.toString("utf8"),
      base: options.state.catalog,
      target: targetState.catalog,
    });
    for (const conflict of catalogMerge.conflicts) {
      changes.addConflict({
        path: workspacePath,
        reason: `Catalog entry ${conflict.name} changed both locally and in the target template.`,
      });
    }
    if (catalogMerge.changed) {
      changes.addChange({
        kind: "modify",
        path: workspacePath,
        content: Buffer.from(catalogMerge.source),
        reason: "Reconcile managed consumer catalog",
      });
      dependenciesChanged = true;
    }
  }

  const paths = new Set([...Object.keys(options.state.files), ...targetFiles.keys()]);
  paths.delete(workspacePath);

  for (const rename of target.manifest.sync.renames ?? []) {
    const baseline = options.state.files[rename.from];
    const targetFile = targetFiles.get(rename.to);
    if (!baseline || !targetFile) {
      changes.addConflict({
        path: rename.from,
        reason: `Invalid template rename ${rename.from} -> ${rename.to}.`,
      });
      continue;
    }
    paths.delete(rename.from);
    paths.delete(rename.to);
    const sourcePath = path.join(options.repoRoot, rename.from);
    const destinationPath = path.join(options.repoRoot, rename.to);
    const sourceSymlink = await findRepositorySymlink(options.repoRoot, rename.from);
    const destinationSymlink = await findRepositorySymlink(options.repoRoot, rename.to);
    if (sourceSymlink || destinationSymlink) {
      changes.addConflict({
        path: rename.from,
        reason: "A renamed managed path contains a symbolic link.",
      });
      continue;
    }
    const sourceStat = await fs.lstat(sourcePath).catch(() => null);
    const destinationStat = await fs.lstat(destinationPath).catch(() => null);
    if (destinationStat && rename.from !== rename.to) {
      changes.addConflict({
        path: rename.to,
        reason: "A template rename targets an existing app-owned path.",
      });
      continue;
    }
    const local = sourceStat?.isFile() ? await fs.readFile(sourcePath) : undefined;
    if (!local) {
      if (targetState.files[rename.to]?.policy === "ensure") {
        changes.addChange({
          kind: "add",
          path: rename.to,
          content: targetFile.content,
          reason: `Restore renamed ensured path from ${rename.from}`,
        });
      }
      continue;
    }
    const localHash = sha256(local);
    const targetHash = sha256(targetFile.content);
    if (localHash === baseline.sha256) {
      changes.addChange({
        kind: "delete",
        path: rename.from,
        reason: `Rename template path to ${rename.to}`,
      });
      changes.addChange({
        kind: "add",
        path: rename.to,
        content: targetFile.content,
        reason: `Rename template path from ${rename.from}`,
      });
    } else if (localHash === targetHash) {
      changes.addChange({
        kind: "delete",
        path: rename.from,
        reason: `Rename template path to ${rename.to}`,
      });
      changes.addChange({
        kind: "add",
        path: rename.to,
        content: local,
        reason: `Rename template path from ${rename.from}`,
      });
    } else if (baseline.kind === "binary" || targetFile.kind === "binary") {
      changes.addConflict({
        path: rename.from,
        reason: "Renamed binary content changed locally and in the target template.",
      });
    } else {
      mergeCandidates.push({
        path: rename.to,
        basePath: rename.from,
        local,
        target: targetFile,
        deletePath: rename.from,
      });
    }
  }

  for (const relativePath of [...paths].sort((left, right) => left.localeCompare(right))) {
    const baseline = options.state.files[relativePath];
    const targetFile = targetFiles.get(relativePath);
    const policy = targetState.files[relativePath]?.policy ?? baseline?.policy ?? "merge";
    if (policy === "ignore") continue;

    const localPath = path.join(options.repoRoot, relativePath);
    const symlink = await findRepositorySymlink(options.repoRoot, relativePath);
    if (symlink) {
      changes.addConflict({
        path: relativePath,
        reason: `Managed path contains symbolic link ${symlink}.`,
      });
      continue;
    }
    const localStat = await fs.lstat(localPath).catch(() => null);
    const local = localStat?.isFile() ? await fs.readFile(localPath) : undefined;
    const localHash = local ? sha256(local) : undefined;
    const baseHash = baseline?.sha256;
    const targetHash = targetFile ? sha256(targetFile.content) : undefined;

    if (!baseline && targetFile) {
      if (!local) {
        changes.addChange({
          kind: "add",
          path: relativePath,
          content: targetFile.content,
          reason: "Add template path",
        });
      } else if (localHash !== targetHash && policy !== "ensure") {
        changes.addConflict({
          path: relativePath,
          reason: "The target template adds a path already owned by the app.",
        });
      }
      continue;
    }
    if (baseline && !targetFile) {
      if (local && localHash === baseHash) {
        changes.addChange({
          kind: "delete",
          path: relativePath,
          reason: "Remove obsolete template path",
        });
      } else if (local) {
        changes.addConflict({
          path: relativePath,
          reason: "The template removed a locally customized path.",
        });
      }
      continue;
    }
    if (!baseline || !targetFile) continue;

    if (!local) {
      if (policy === "ensure") {
        changes.addChange({
          kind: "add",
          path: relativePath,
          content: targetFile.content,
          reason: "Restore ensured path",
        });
      } else if (targetHash !== baseHash) {
        changes.addConflict({
          path: relativePath,
          reason: "A locally deleted path changed in the target template.",
        });
      }
      continue;
    }
    if (localHash === targetHash || (localHash !== baseHash && targetHash === baseHash)) continue;
    if (localHash === baseHash) {
      changes.addChange({
        kind: "modify",
        path: relativePath,
        content: targetFile.content,
        reason: "Update unchanged template path",
      });
      if (relativePath === "package.json" || relativePath.endsWith("/package.json"))
        dependenciesChanged = true;
      continue;
    }
    if (baseline.kind === "binary" || targetFile.kind === "binary") {
      changes.addConflict({
        path: relativePath,
        reason: "Binary content changed locally and in the target template.",
      });
      continue;
    }
    mergeCandidates.push({ path: relativePath, basePath: relativePath, local, target: targetFile });
  }

  if (mergeCandidates.length > 0) {
    let baseRoot: Awaited<ReturnType<BaseTemplateProvider["getTemplateRoot"]>> | undefined;
    try {
      baseRoot = await (options.baseProvider ?? npmBaseTemplateProvider).getTemplateRoot(
        options.state.template.version
      );
      const base = await renderForState(baseRoot.root, options.state);
      const baseFiles = new Map(base.files.map((file) => [file.relativePath, file]));
      for (const candidate of mergeCandidates) {
        const baseFile = baseFiles.get(candidate.basePath);
        if (
          !baseFile ||
          sha256(baseFile.content) !== options.state.files[candidate.basePath]?.sha256
        ) {
          changes.addConflict({
            path: candidate.path,
            reason: "Historical template content does not match the stored baseline hash.",
          });
          continue;
        }
        const merged = await mergeText(baseFile.content, candidate.local, candidate.target.content);
        if (merged === undefined) {
          changes.addConflict({
            path: candidate.path,
            reason: "Three-way merge produced conflicts.",
          });
        } else if (merged !== candidate.local.toString("utf8")) {
          if (candidate.deletePath) {
            changes.addChange({
              kind: "delete",
              path: candidate.deletePath,
              reason: `Rename template path to ${candidate.path}`,
            });
          }
          changes.addChange({
            kind: candidate.deletePath ? "add" : "modify",
            path: candidate.path,
            content: Buffer.from(merged),
            reason: "Three-way merge local and template changes",
          });
          if (candidate.path === "package.json" || candidate.path.endsWith("/package.json")) {
            dependenciesChanged = true;
          }
        } else if (candidate.deletePath) {
          changes.addChange({
            kind: "delete",
            path: candidate.deletePath,
            reason: `Rename template path to ${candidate.path}`,
          });
          changes.addChange({
            kind: "add",
            path: candidate.path,
            content: candidate.local,
            reason: `Rename template path from ${candidate.deletePath}`,
          });
        }
      }
    } catch (error) {
      for (const candidate of mergeCandidates) {
        changes.addConflict({
          path: candidate.path,
          reason: `Unable to load historical template ${options.state.template.version}: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    } finally {
      await baseRoot?.cleanup();
    }
  }

  return { changes, targetState, dependenciesChanged };
}
