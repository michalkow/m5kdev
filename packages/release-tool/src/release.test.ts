import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  clearUnreleased,
  judgeRelease,
  recordReleaseNotes,
  writeReleaseChangeset,
} from "./release";

interface FixturePackage {
  readonly name: string;
  readonly directory: string;
  readonly changelog: string | null;
  readonly version?: string;
}

function createWorkspace(
  packages: readonly FixturePackage[],
  ignore: readonly string[],
  options?: { readonly fixed?: readonly (readonly string[])[]; readonly commit?: boolean }
): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "m5kdev-release-"));
  fs.mkdirSync(path.join(root, ".changeset"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".changeset", "config.json"),
    JSON.stringify({ fixed: options?.fixed ?? [], ignore })
  );
  for (const pkg of packages) {
    const directory = path.join(root, pkg.directory);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(
      path.join(directory, "package.json"),
      JSON.stringify({ name: pkg.name, version: pkg.version ?? "0.37.4" })
    );
    if (pkg.changelog !== null) {
      fs.writeFileSync(path.join(directory, "CHANGELOG.md"), pkg.changelog);
    }
  }
  if (options?.commit === true) {
    const gitEnv = {
      ...process.env,
      GIT_AUTHOR_NAME: "Release Test",
      GIT_AUTHOR_EMAIL: "release-test@example.com",
      GIT_COMMITTER_NAME: "Release Test",
      GIT_COMMITTER_EMAIL: "release-test@example.com",
    };
    execFileSync("git", ["init", "-b", "main", "--template="], { cwd: root, env: gitEnv });
    execFileSync("git", ["add", "."], { cwd: root, env: gitEnv });
    execFileSync("git", ["commit", "-m", "fixture"], { cwd: root, env: gitEnv });
  }
  return root;
}

function readChangelog(root: string, directory: string): string {
  return fs.readFileSync(path.join(root, directory, "CHANGELOG.md"), "utf8");
}

describe("recordReleaseNotes", () => {
  it("adds a landed behavior to Unreleased on every Release package", () => {
    const root = createWorkspace(
      [
        {
          name: "@m5kdev/alpha",
          directory: "packages/alpha",
          changelog: "# @m5kdev/alpha\n\n## 0.37.4\n\n### Patch Changes\n\n- older\n",
        },
        {
          name: "create-m5kdev",
          directory: "packages/cli",
          changelog: "# create-m5kdev\n\n## 0.37.4\n\n### Patch Changes\n\n- older\n",
        },
        {
          name: "m5kdev-docs",
          directory: "apps/docs",
          changelog: "# m5kdev-docs\n\n## 0.2.2\n\n- docs only\n",
        },
      ],
      ["m5kdev-docs"]
    );

    recordReleaseNotes({
      workspaceRoot: root,
      thread: {
        landed: [
          {
            behavior: "The MCP allowlist is chosen per OAuth client.",
            sameAs: null,
          },
        ],
        reverted: [],
      },
    });

    const expectedAlpha = `# @m5kdev/alpha

## Unreleased

- The MCP allowlist is chosen per OAuth client.

## 0.37.4

### Patch Changes

- older
`;
    expect(readChangelog(root, "packages/alpha")).toBe(expectedAlpha);
    expect(readChangelog(root, "packages/cli")).toBe(
      expectedAlpha.replaceAll("@m5kdev/alpha", "create-m5kdev")
    );
    expect(readChangelog(root, "apps/docs")).toBe("# m5kdev-docs\n\n## 0.2.2\n\n- docs only\n");
  });

  it("appends a new behavior without dropping notes already under Unreleased", () => {
    const root = createWorkspace(
      [
        {
          name: "@m5kdev/alpha",
          directory: "packages/alpha",
          changelog: `# @m5kdev/alpha

## Unreleased

- Seat billing stays off unless the app turns it on.

## 0.37.4

### Patch Changes

- older
`,
        },
      ],
      []
    );

    recordReleaseNotes({
      workspaceRoot: root,
      thread: {
        landed: [{ behavior: "Owners cannot leave an Organization.", sameAs: null }],
        reverted: [],
      },
    });

    expect(readChangelog(root, "packages/alpha")).toBe(`# @m5kdev/alpha

## Unreleased

- Seat billing stays off unless the app turns it on.
- Owners cannot leave an Organization.

## 0.37.4

### Patch Changes

- older
`);
  });

  it("skips a landed behavior that restates an Unreleased bullet in different words", () => {
    const root = createWorkspace(
      [
        {
          name: "@m5kdev/alpha",
          directory: "packages/alpha",
          changelog: `# @m5kdev/alpha

## Unreleased

- The MCP allowlist is chosen per OAuth client.

## 0.37.4

### Patch Changes

- older
`,
        },
      ],
      []
    );

    recordReleaseNotes({
      workspaceRoot: root,
      thread: {
        landed: [
          {
            behavior: "MCP allowlist is per OAuth client.",
            sameAs: "The MCP allowlist is chosen per OAuth client.",
          },
        ],
        reverted: [],
      },
    });

    expect(readChangelog(root, "packages/alpha")).toBe(`# @m5kdev/alpha

## Unreleased

- The MCP allowlist is chosen per OAuth client.

## 0.37.4

### Patch Changes

- older
`);
  });

  it("removes a reverted behavior from Unreleased on every Release package", () => {
    const changelog = `# @m5kdev/alpha

## Unreleased

- Seat billing stays off unless the app turns it on.
- Owners cannot leave an Organization.

## 0.37.4

### Patch Changes

- older
`;
    const root = createWorkspace(
      [
        { name: "@m5kdev/alpha", directory: "packages/alpha", changelog },
        {
          name: "create-m5kdev",
          directory: "packages/cli",
          changelog: changelog.replaceAll("@m5kdev/alpha", "create-m5kdev"),
        },
      ],
      []
    );

    const result = recordReleaseNotes({
      workspaceRoot: root,
      thread: {
        landed: [],
        reverted: [
          {
            behavior: "Leaving as Owner is no longer refused.",
            matchesBullet: "Owners cannot leave an Organization.",
          },
        ],
      },
    });

    const expected = `# @m5kdev/alpha

## Unreleased

- Seat billing stays off unless the app turns it on.

## 0.37.4

### Patch Changes

- older
`;
    expect(readChangelog(root, "packages/alpha")).toBe(expected);
    expect(readChangelog(root, "packages/cli")).toBe(
      expected.replaceAll("@m5kdev/alpha", "create-m5kdev")
    );
    expect(result.uncertainReverts).toEqual([]);
  });

  it("keeps an Unreleased bullet when the revert match is uncertain", () => {
    const changelog = `# @m5kdev/alpha

## Unreleased

- Seat billing stays off unless the app turns it on.

## 0.37.4

### Patch Changes

- older
`;
    const root = createWorkspace(
      [{ name: "@m5kdev/alpha", directory: "packages/alpha", changelog }],
      []
    );

    const result = recordReleaseNotes({
      workspaceRoot: root,
      thread: {
        landed: [],
        reverted: [{ behavior: "Seat billing may have changed.", matchesBullet: null }],
      },
    });

    expect(readChangelog(root, "packages/alpha")).toBe(changelog);
    expect(result.uncertainReverts).toEqual(["Seat billing may have changed."]);
  });

  it("creates a changelog when a Release package does not have one", () => {
    const root = createWorkspace(
      [
        {
          name: "@m5kdev/alpha",
          directory: "packages/alpha",
          changelog: null,
        },
      ],
      []
    );

    recordReleaseNotes({
      workspaceRoot: root,
      thread: {
        landed: [{ behavior: "Owners cannot leave an Organization.", sameAs: null }],
        reverted: [],
      },
    });

    expect(readChangelog(root, "packages/alpha")).toBe(`# @m5kdev/alpha

## Unreleased

- Owners cannot leave an Organization.
`);
  });

  it("leaves changelogs untouched when the thread landed nothing", () => {
    const changelog = `# @m5kdev/alpha

## 0.37.4

### Patch Changes

- older
`;
    const root = createWorkspace(
      [{ name: "@m5kdev/alpha", directory: "packages/alpha", changelog }],
      []
    );

    recordReleaseNotes({
      workspaceRoot: root,
      thread: { landed: [], reverted: [] },
    });

    expect(readChangelog(root, "packages/alpha")).toBe(changelog);
  });

  it("does not reconcile disagreeing notes when the thread landed nothing", () => {
    const alpha = `# @m5kdev/alpha

## Unreleased

- Seat billing stays off unless the app turns it on.
`;
    const cli = `# create-m5kdev

## Unreleased

- Owners cannot leave an Organization.
`;
    const root = createWorkspace(
      [
        { name: "@m5kdev/alpha", directory: "packages/alpha", changelog: alpha },
        { name: "create-m5kdev", directory: "packages/cli", changelog: cli },
      ],
      []
    );

    recordReleaseNotes({
      workspaceRoot: root,
      thread: { landed: [], reverted: [] },
    });

    expect(readChangelog(root, "packages/alpha")).toBe(alpha);
    expect(readChangelog(root, "packages/cli")).toBe(cli);
  });

  it("copies notes already on another Release package onto a package with no changelog", () => {
    const root = createWorkspace(
      [
        {
          name: "@m5kdev/alpha",
          directory: "packages/alpha",
          changelog: `# @m5kdev/alpha

## Unreleased

- Seat billing stays off unless the app turns it on.

## 0.37.4

### Patch Changes

- older
`,
        },
        {
          name: "create-m5kdev",
          directory: "packages/cli",
          changelog: null,
        },
      ],
      []
    );

    recordReleaseNotes({
      workspaceRoot: root,
      thread: {
        landed: [{ behavior: "Owners cannot leave an Organization.", sameAs: null }],
        reverted: [],
      },
    });

    expect(readChangelog(root, "packages/cli")).toBe(`# create-m5kdev

## Unreleased

- Seat billing stays off unless the app turns it on.
- Owners cannot leave an Organization.
`);
  });
});

const sharedNotes = `# pkg

## Unreleased

- Owners cannot leave an Organization.

## 0.37.4

### Patch Changes

- older
`;

function readyWorkspace(): string {
  return createWorkspace(
    [
      {
        name: "@m5kdev/alpha",
        directory: "packages/alpha",
        changelog: sharedNotes.replace("# pkg", "# @m5kdev/alpha"),
      },
      {
        name: "create-m5kdev",
        directory: "packages/cli",
        changelog: sharedNotes.replace("# pkg", "# create-m5kdev"),
      },
      {
        name: "m5kdev-docs",
        directory: "apps/docs",
        changelog: "# m5kdev-docs\n\n## 0.2.2\n\n- docs only\n",
      },
    ],
    ["m5kdev-docs"],
    { fixed: [["@m5kdev/alpha", "create-m5kdev"]], commit: true }
  );
}

describe("judgeRelease", () => {
  it("accepts a patch Release and reports the next version and shared notes", () => {
    const root = readyWorkspace();
    const before = readChangelog(root, "packages/alpha");

    expect(judgeRelease({ workspaceRoot: root, bump: "patch" })).toEqual({
      status: "ready",
      version: "0.37.5",
      notes: ["Owners cannot leave an Organization."],
    });
    expect(readChangelog(root, "packages/alpha")).toBe(before);
  });

  it("asks for a bump when none was named", () => {
    const root = createWorkspace(
      [{ name: "@m5kdev/alpha", directory: "packages/alpha", changelog: "# @m5kdev/alpha\n" }],
      []
    );

    expect(judgeRelease({ workspaceRoot: root, bump: null })).toEqual({ status: "needs-bump" });
  });

  it("refuses a Release from a branch other than main", () => {
    const root = readyWorkspace();
    execFileSync("git", ["checkout", "-b", "feature"], { cwd: root });

    expect(judgeRelease({ workspaceRoot: root, bump: "minor" })).toEqual({
      status: "refused",
      reason: "Branch is feature, not main.",
    });
  });

  it("refuses when a feature file is still uncommitted", () => {
    const root = readyWorkspace();
    fs.writeFileSync(path.join(root, "packages/alpha/index.ts"), "export const value = 1;\n");

    expect(judgeRelease({ workspaceRoot: root, bump: "patch" })).toEqual({
      status: "refused",
      reason: "Uncommitted changes are not Unreleased changelog edits: packages/alpha/index.ts",
    });
  });

  it("accepts uncommitted edits that only touch Unreleased", () => {
    const root = readyWorkspace();
    const changelog = readChangelog(root, "packages/alpha").replace(
      "- Owners cannot leave an Organization.",
      "- Owners cannot leave an Organization.\n- Trials follow the Plan freeTrial days."
    );
    fs.writeFileSync(path.join(root, "packages/alpha/CHANGELOG.md"), changelog);
    fs.writeFileSync(
      path.join(root, "packages/cli/CHANGELOG.md"),
      readChangelog(root, "packages/cli").replace(
        "- Owners cannot leave an Organization.",
        "- Owners cannot leave an Organization.\n- Trials follow the Plan freeTrial days."
      )
    );

    expect(judgeRelease({ workspaceRoot: root, bump: "minor" })).toEqual({
      status: "ready",
      version: "0.38.0",
      notes: ["Owners cannot leave an Organization.", "Trials follow the Plan freeTrial days."],
    });
  });

  it("refuses when Unreleased has no notes", () => {
    const root = createWorkspace(
      [
        {
          name: "@m5kdev/alpha",
          directory: "packages/alpha",
          changelog: "# @m5kdev/alpha\n\n## 0.37.4\n\n### Patch Changes\n\n- older\n",
        },
      ],
      [],
      { fixed: [["@m5kdev/alpha"]], commit: true }
    );

    expect(judgeRelease({ workspaceRoot: root, bump: "patch" })).toEqual({
      status: "refused",
      reason: "Release notes are empty.",
    });
  });

  it("refuses when Release packages disagree on Unreleased notes", () => {
    const root = createWorkspace(
      [
        {
          name: "@m5kdev/alpha",
          directory: "packages/alpha",
          changelog: "# @m5kdev/alpha\n\n## Unreleased\n\n- Owners cannot leave an Organization.\n",
        },
        {
          name: "create-m5kdev",
          directory: "packages/cli",
          changelog:
            "# create-m5kdev\n\n## Unreleased\n\n- Seat billing stays off unless the app turns it on.\n",
        },
      ],
      [],
      { fixed: [["@m5kdev/alpha", "create-m5kdev"]], commit: true }
    );

    expect(judgeRelease({ workspaceRoot: root, bump: "patch" })).toEqual({
      status: "refused",
      reason: "Unreleased notes differ across Release packages.",
    });
  });

  it("refuses when another Changeset is pending", () => {
    const root = readyWorkspace();
    fs.writeFileSync(path.join(root, ".changeset", "pending.md"), "---\n---\n\nstray\n");
    execFileSync("git", ["add", ".changeset/pending.md"], { cwd: root });
    execFileSync("git", ["commit", "-m", "stray changeset"], {
      cwd: root,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "Release Test",
        GIT_AUTHOR_EMAIL: "release-test@example.com",
        GIT_COMMITTER_NAME: "Release Test",
        GIT_COMMITTER_EMAIL: "release-test@example.com",
      },
    });

    expect(judgeRelease({ workspaceRoot: root, bump: "patch" })).toEqual({
      status: "refused",
      reason: "A Changeset is already pending.",
    });
  });

  it("refuses when the fixed group is missing a Release package", () => {
    const root = createWorkspace(
      [
        {
          name: "@m5kdev/alpha",
          directory: "packages/alpha",
          changelog: sharedNotes.replace("# pkg", "# @m5kdev/alpha"),
        },
        {
          name: "create-m5kdev",
          directory: "packages/cli",
          changelog: sharedNotes.replace("# pkg", "# create-m5kdev"),
        },
      ],
      [],
      { fixed: [["@m5kdev/alpha"]], commit: true }
    );

    expect(judgeRelease({ workspaceRoot: root, bump: "patch" })).toEqual({
      status: "refused",
      reason: "Fixed group is missing create-m5kdev.",
    });
  });

  it("refuses when the fixed group includes a package outside the Release", () => {
    const root = createWorkspace(
      [
        {
          name: "@m5kdev/alpha",
          directory: "packages/alpha",
          changelog: sharedNotes.replace("# pkg", "# @m5kdev/alpha"),
        },
        {
          name: "m5kdev-docs",
          directory: "apps/docs",
          changelog: "# m5kdev-docs\n\n## 0.2.2\n\n- docs only\n",
        },
      ],
      ["m5kdev-docs"],
      { fixed: [["@m5kdev/alpha", "m5kdev-docs"]], commit: true }
    );

    expect(judgeRelease({ workspaceRoot: root, bump: "patch" })).toEqual({
      status: "refused",
      reason: "Fixed group includes m5kdev-docs, which is not in the Release.",
    });
  });

  it("refuses when Release packages are not on one version", () => {
    const root = createWorkspace(
      [
        {
          name: "@m5kdev/alpha",
          directory: "packages/alpha",
          version: "0.37.4",
          changelog: sharedNotes.replace("# pkg", "# @m5kdev/alpha"),
        },
        {
          name: "create-m5kdev",
          directory: "packages/cli",
          version: "0.37.3",
          changelog: sharedNotes.replace("# pkg", "# create-m5kdev"),
        },
      ],
      [],
      { fixed: [["@m5kdev/alpha", "create-m5kdev"]], commit: true }
    );

    expect(judgeRelease({ workspaceRoot: root, bump: "patch" })).toEqual({
      status: "refused",
      reason: "Release packages are not on one version.",
    });
  });

  it("bumps a major Release from 0.x to 1.0.0", () => {
    const root = readyWorkspace();

    expect(judgeRelease({ workspaceRoot: root, bump: "major" })).toEqual({
      status: "ready",
      version: "1.0.0",
      notes: ["Owners cannot leave an Organization."],
    });
  });

  it("refuses an uncommitted edit to a versioned changelog section", () => {
    const root = readyWorkspace();
    const changelog = readChangelog(root, "packages/alpha").replace(
      "- older",
      "- rewritten history"
    );
    fs.writeFileSync(path.join(root, "packages/alpha/CHANGELOG.md"), changelog);

    expect(judgeRelease({ workspaceRoot: root, bump: "patch" })).toEqual({
      status: "refused",
      reason: "Uncommitted changes are not Unreleased changelog edits: packages/alpha/CHANGELOG.md",
    });
  });

  it("refuses an uncommitted edit to the changelog title", () => {
    const root = readyWorkspace();
    const changelog = readChangelog(root, "packages/alpha").replace("# @m5kdev/alpha", "# renamed");
    fs.writeFileSync(path.join(root, "packages/alpha/CHANGELOG.md"), changelog);

    expect(judgeRelease({ workspaceRoot: root, bump: "patch" })).toEqual({
      status: "refused",
      reason: "Uncommitted changes are not Unreleased changelog edits: packages/alpha/CHANGELOG.md",
    });
  });
});

describe("clearUnreleased", () => {
  it("drops Unreleased and leaves the versioned section", () => {
    const root = readyWorkspace();
    const docs = readChangelog(root, "apps/docs");

    clearUnreleased(root);

    expect(readChangelog(root, "packages/alpha")).toBe(`# @m5kdev/alpha

## 0.37.4

### Patch Changes

- older
`);
    expect(readChangelog(root, "packages/cli")).toBe(`# create-m5kdev

## 0.37.4

### Patch Changes

- older
`);
    expect(readChangelog(root, "apps/docs")).toBe(docs);
  });
});

describe("writeReleaseChangeset", () => {
  it("writes one Changeset for every Release package at the named bump", () => {
    const root = readyWorkspace();

    writeReleaseChangeset({ workspaceRoot: root, bump: "minor" });

    expect(fs.readFileSync(path.join(root, ".changeset", "release.md"), "utf8")).toBe(`---
"@m5kdev/alpha": minor
"create-m5kdev": minor
---

- Owners cannot leave an Organization.
`);
  });
});
