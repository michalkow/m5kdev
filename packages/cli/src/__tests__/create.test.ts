import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { scaffoldProject } from "../create";

describe("scaffoldProject", () => {
  let tempRoot = "";
  let initialCwd = "";

  beforeEach(async () => {
    initialCwd = process.cwd();
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "m5kdev-cli-"));
    process.chdir(tempRoot);
  });

  afterEach(async () => {
    process.chdir(initialCwd);
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("creates the minimal starter and replaces placeholders", async () => {
    const result = await scaffoldProject({
      targetDirectory: "editorial-desk",
      appName: "Editorial Desk",
      appDescription: "A clean newsroom starter.",
      yes: true,
      force: false,
      skipInstall: true,
      skipGit: true,
    });

    await expect(fs.stat(path.join(result.targetDirectory, "AGENTS.md"))).resolves.toBeTruthy();
    await expect(
      fs.stat(path.join(result.targetDirectory, "apps/server/src/modules/posts/posts.service.ts"))
    ).resolves.toBeTruthy();
    await expect(
      fs.stat(path.join(result.targetDirectory, "apps/webapp/src/modules/posts/PostsRoute.tsx"))
    ).resolves.toBeTruthy();

    const rootPackage = await fs.readFile(path.join(result.targetDirectory, "package.json"), "utf8");
    const rootAgents = await fs.readFile(path.join(result.targetDirectory, "AGENTS.md"), "utf8");
    const sharedEnv = await fs.readFile(
      path.join(result.targetDirectory, "apps/shared/.env"),
      "utf8"
    );
    const appConstants = await fs.readFile(
      path.join(result.targetDirectory, "apps/shared/src/modules/app/app.constants.ts"),
      "utf8"
    );
    const providers = await fs.readFile(
      path.join(result.targetDirectory, "apps/webapp/src/Providers.tsx"),
      "utf8"
    );
    const appTs = await fs.readFile(
      path.join(result.targetDirectory, "apps/server/src/app.ts"),
      "utf8"
    );

    expect(rootPackage).toContain("\"name\": \"editorial-desk\"");
    expect(rootAgents).toContain("Editorial Desk");
    expect(rootAgents).toContain("A clean newsroom starter.");
    expect(sharedEnv).toContain("VITE_APP_NAME=Editorial Desk");
    expect(sharedEnv).not.toContain("{{APP_NAME}}");
    expect(appConstants).toContain('APP_NAME = "Editorial Desk"');
    expect(appConstants).toContain('APP_SLUG = "editorial-desk"');
    expect(providers).toContain("AppConfigProvider");
    expect(providers).toContain("AppTrpcQueryProvider");
    expect(appTs).toContain("createBackendApp(");
    expect(appTs).not.toContain(".build()");
  });

  it("refuses to overwrite a non-empty directory without force", async () => {
    await fs.mkdir(path.join(tempRoot, "occupied"), { recursive: true });
    await fs.writeFile(path.join(tempRoot, "occupied", "README.md"), "taken", "utf8");

    await expect(
      scaffoldProject({
        targetDirectory: "occupied",
        appName: "Occupied",
        appDescription: "Collision test",
        yes: true,
        force: false,
        skipInstall: true,
        skipGit: true,
      })
    ).rejects.toThrow("Target directory is not empty");
  });
});
