import { ensureNamedImport, renameImportSource, transformTypeScript } from "../migrations/ast";

describe("embedded AST transforms", () => {
  it.each([
    ["fixture.ts", "import { oldName } from 'old-module';\noldName();\n"],
    ["fixture.tsx", "import { oldName } from 'old-module';\nexport const View = () => <div />;\n"],
  ])("renames imports idempotently in %s", (filePath, source) => {
    const once = transformTypeScript(
      source,
      filePath,
      renameImportSource("old-module", "new-module")
    );
    const twice = transformTypeScript(
      once,
      filePath,
      renameImportSource("old-module", "new-module")
    );
    expect(twice).toBe(once);
    expect(once).toContain("new-module");
  });

  it("adds a named import exactly once", () => {
    const source = "export const value = 1;\n";
    const once = transformTypeScript(source, "fixture.ts", ensureNamedImport("library", "helper"));
    const twice = transformTypeScript(once, "fixture.ts", ensureNamedImport("library", "helper"));
    expect(twice).toBe(once);
    expect(once.match(/helper/g)).toHaveLength(1);
  });
});
