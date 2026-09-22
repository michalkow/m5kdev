import fs from "node:fs";
import path from "node:path";
import {
  clearUnreleased,
  judgeRelease,
  type ReleaseBump,
  type ReleaseThread,
  recordReleaseNotes,
  writeReleaseChangeset,
} from "./release";

const command = process.argv[2];
const workspaceRoot = findWorkspaceRoot(process.cwd());

if (command === "record") {
  const threadPath = option("--thread");
  if (threadPath === null) {
    throw new Error("Pass --thread with a JSON file of landed and reverted behaviors.");
  }
  const parsed: unknown = JSON.parse(fs.readFileSync(threadPath, "utf8"));
  const result = recordReleaseNotes({ workspaceRoot, thread: readThread(parsed) });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} else if (command === "judge") {
  const result = judgeRelease({ workspaceRoot, bump: readBump(option("--bump")) });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.status === "refused") {
    process.exitCode = 1;
  }
} else if (command === "clear-unreleased") {
  clearUnreleased(workspaceRoot);
} else if (command === "write-changeset") {
  const bump = readBump(option("--bump"));
  if (bump === null) {
    throw new Error("Name the bump: major, minor, or patch.");
  }
  writeReleaseChangeset({ workspaceRoot, bump });
} else {
  throw new Error("Use record, judge, clear-unreleased, or write-changeset.");
}

function readThread(value: unknown): ReleaseThread {
  if (!isRecord(value) || !Array.isArray(value.landed) || !Array.isArray(value.reverted)) {
    throw new Error("Thread file must contain landed and reverted arrays.");
  }
  return {
    landed: value.landed.map((item) => {
      if (!isRecord(item) || typeof item.behavior !== "string") {
        throw new Error("Each landed behavior needs a behavior string.");
      }
      return {
        behavior: item.behavior,
        sameAs: typeof item.sameAs === "string" ? item.sameAs : null,
      };
    }),
    reverted: value.reverted.map((item) => {
      if (!isRecord(item) || typeof item.behavior !== "string") {
        throw new Error("Each reverted behavior needs a behavior string.");
      }
      return {
        behavior: item.behavior,
        matchesBullet: typeof item.matchesBullet === "string" ? item.matchesBullet : null,
      };
    }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function option(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return null;
  }
  return process.argv[index + 1] ?? null;
}

function readBump(value: string | null): ReleaseBump | null {
  if (value === null) {
    return null;
  }
  if (value === "major" || value === "minor" || value === "patch") {
    return value;
  }
  throw new Error("Name the bump: major, minor, or patch.");
}

function findWorkspaceRoot(start: string): string {
  let current = path.resolve(start);
  for (;;) {
    const hasChangesets = fs.existsSync(path.join(current, ".changeset", "config.json"));
    const hasWorkspace = fs.existsSync(path.join(current, "pnpm-workspace.yaml"));
    if (hasChangesets && hasWorkspace) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error("Could not find the workspace root.");
    }
    current = parent;
  }
}
