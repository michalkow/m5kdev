import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("CLI Backend Module feature catalog", () => {
  const prepareTemplates = readFileSync(
    join(__dirname, "../../scripts/prepare-templates.ts"),
    "utf8"
  );

  it("does not offer access or crypto", () => {
    expect(prepareTemplates).not.toMatch(/^\s+access:/m);
    expect(prepareTemplates).not.toMatch(/^\s+crypto:/m);
  });

  it("still offers Core optional-registration flags", () => {
    const ids = [
      "billing",
      "files",
      "workflows",
      "ai",
      "notifications",
      "tags",
      "connect",
      "webhook",
      "recurrence",
    ];
    for (const id of ids) {
      expect(prepareTemplates).toMatch(new RegExp(`^\\s+${id}:`, "m"));
    }
  });
});
