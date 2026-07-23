import { parseCli } from "../runCli";

describe("parseCli", () => {
  it("parses the explicit create command", () => {
    expect(parseCli(["create", "blog-app", "--name", "Blog App"])).toEqual({
      command: "create",
      directory: "blog-app",
      help: false,
      options: {
        name: "Blog App",
      },
    });
  });

  it("treats a bare directory as the create command", () => {
    expect(parseCli(["blog-app", "--description", "Starter app"])).toEqual({
      command: "create",
      directory: "blog-app",
      help: false,
      options: {
        description: "Starter app",
      },
    });
  });

  it("treats flag-only input as the create command", () => {
    expect(parseCli(["--name", "Blog App", "--yes"])).toEqual({
      command: "create",
      directory: undefined,
      help: false,
      options: {
        name: "Blog App",
        yes: true,
      },
    });
  });

  it("recognizes help in create mode", () => {
    expect(parseCli(["create", "--help"])).toEqual({
      command: "create",
      directory: undefined,
      help: true,
      options: {},
    });
  });

  it.each(["init", "doctor", "update"])("recognizes the %s command", (command) => {
    expect(parseCli([command, "--json"])).toEqual({
      command,
      directory: undefined,
      help: false,
      options: { json: true },
    });
  });

  it("parses update dry-run flags", () => {
    expect(parseCli(["update", "--dry-run", "--skip-install"])).toEqual({
      command: "update",
      directory: undefined,
      help: false,
      options: { "dry-run": true, "skip-install": true },
    });
  });

  it("rejects unknown options during parsing", () => {
    expect(() => parseCli(["doctor", "--wat"])).toThrow("Unknown option: --wat");
  });
});
